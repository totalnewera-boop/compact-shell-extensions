'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as BlurEffect from './blurEffect.js';
import * as GlassStyle from './glassStyle.js';

const DOCK_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';

function findDash(container) {
    const slider = container._slider;
    if (!slider)
        return null;
    const box = slider.get_child?.() ?? slider.first_child;
    if (!box)
        return null;
    return box.get_children?.().find(c => c.get_name?.() === 'dash') ?? null;
}

function findDashBackground(dash) {
    if (dash._background)
        return dash._background;
    return dash.get_children?.().find(c =>
        c.get_style_class_name?.().includes('dash-background'));
}

export const DockGlass = GObject.registerClass(
class DockGlass extends GObject.Object {
    constructor(manager, dash, container) {
        super();
        this._manager = manager;
        this._settings = manager.settings;
        this._dash = dash;
        this._container = container;
        this._background = findDashBackground(dash);
        this._blurHandle = null;
        this._signals = [];
        this._styleIdle = 0;

        if (!this._background) {
            log('compact-dock: dash-background not found');
            return;
        }

        dash.add_style_class_name('transparent-dash');
        dash.add_style_class_name('cfd-dash');

        this._background.clip_to_allocation = true;
        this._background.add_style_class_name('cfd-glass');

        this._applyGlassStyle();
        this._scheduleStyleOverride();
        this._applyBlur();

        this._listen(this._background, 'notify::style', () => {
            this._onDockStyleChanged();
            this._scheduleStyleOverride();
        });
        this._listen(this._background, 'notify::width', () => this._applyGlassStyle());
        this._listen(this._background, 'notify::height', () => this._applyGlassStyle());
        this._listen(dash, 'destroy', () => this.destroy());

        for (const key of ['blur-enabled', 'sigma', 'background-alpha', 'border-alpha']) {
            this._listen(this._settings, `changed::${key}`, () => {
                this._applyGlassStyle();
                this._applyBlur();
            });
        }
    }

    _listen(object, signal, handler) {
        this._signals.push([object, object.connect(signal, handler)]);
    }

    _onDockStyleChanged() {
        if (this._styleIdle)
            return;
        this._styleIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._styleIdle = 0;
            this._applyGlassStyle();
            return GLib.SOURCE_REMOVE;
        });
    }

    _scheduleStyleOverride() {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            if (this._background)
                this._applyGlassStyle();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyGlassStyle() {
        if (!this._background)
            return;

        const a = this._settings.get_double('background-alpha');
        const b = this._settings.get_double('border-alpha');
        this._background.set_style(GlassStyle.tintStyle(a, b));
    }

    _applyBlur() {
        if (!this._background)
            return;

        const enabled = this._settings.get_boolean('blur-enabled');
        const sigma = this._settings.get_int('sigma');

        if (enabled) {
            if (!this._blurHandle) {
                try {
                    this._blurHandle = BlurEffect.applyActorBlur(this._background, sigma);
                } catch (e) {
                    log(`compact-dock: blur failed: ${e}`);
                }
            } else {
                BlurEffect.setBlurSigma(this._blurHandle, sigma);
            }
            if (this._blurHandle?.effect)
                this._blurHandle.effect.enabled = !this._manager._blurSuspended;
        } else if (this._blurHandle) {
            BlurEffect.removeActorBlur(this._background, this._blurHandle);
            this._blurHandle = null;
        }
    }

    setBlurSuspended(suspended) {
        if (this._blurHandle?.effect)
            this._blurHandle.effect.enabled = !suspended && this._settings.get_boolean('blur-enabled');
    }

    destroy() {
        if (this._styleIdle) {
            GLib.Source.remove(this._styleIdle);
            this._styleIdle = 0;
        }

        for (const [object, id] of this._signals) {
            try {
                object.disconnect(id);
            } catch (_e) { /* already destroyed */ }
        }
        this._signals = [];

        if (this._blurHandle) {
            BlurEffect.removeActorBlur(this._background, this._blurHandle);
            this._blurHandle = null;
        }

        if (this._dash) {
            this._dash.remove_style_class_name('transparent-dash');
            this._dash.remove_style_class_name('cfd-dash');
        }

        if (this._background)
            this._background.set_style(null);

        this._manager = null;
        this._dash = null;
        this._container = null;
        this._background = null;
    }
});

export const DashGlassManager = GObject.registerClass(
class DashGlassManager extends GObject.Object {
    constructor(settings) {
        super();
        this.settings = settings;
        this._docks = [];
        this._blurSuspended = false;
        this._dockSettings = null;
        this._savedDockOpacity = null;
        this._savedDockTransparency = null;
        this._settingsIds = [];
        this._uiGroupChildId = 0;
        this._overviewShowingId = 0;
        this._overviewHiddenId = 0;
    }

    enable() {
        this._uiGroupChildId = Main.layoutManager.uiGroup.connect(
            'child-added', (_g, actor) => this._tryAttach(actor),
        );

        for (const child of Main.layoutManager.uiGroup.get_children())
            this._tryAttach(child);

        this._settingsIds.push(
            this.settings.connect('changed::sync-dock-opacity', () =>
                this._applyDockOpacitySync()),
            this.settings.connect('changed::unblur-in-overview', () =>
                this._bindOverview()),
            this.settings.connect('changed::background-alpha', () =>
                this._refreshAllGlass()),
            this.settings.connect('changed::border-alpha', () =>
                this._refreshAllGlass()),
        );
        this._bindOverview();
        this._applyDockOpacitySync();
    }

    disable() {
        if (this._uiGroupChildId) {
            Main.layoutManager.uiGroup.disconnect(this._uiGroupChildId);
            this._uiGroupChildId = 0;
        }

        this._disconnectOverview();
        for (const id of this._settingsIds)
            this.settings.disconnect(id);
        this._settingsIds = [];

        for (const dock of [...this._docks])
            dock.destroy();
        this._docks = [];

        this._restoreDockOpacitySync();
    }

    _isDockContainer(actor) {
        return actor?.get_name?.() === 'dashtodockContainer' &&
            actor.constructor?.name === 'DashToDock';
    }

    _refreshAllGlass() {
        for (const dock of this._docks)
            dock._applyGlassStyle();
    }

    _tryAttach(actor) {
        if (!this._isDockContainer(actor))
            return;

        const dash = findDash(actor);
        if (!dash || this._docks.some(d => d._dash === dash))
            return;

        const glass = new DockGlass(this, dash, actor);
        if (glass._background)
            this._docks.push(glass);
        else
            glass.destroy();
    }

    _bindOverview() {
        this._disconnectOverview();
        if (!this.settings.get_boolean('unblur-in-overview'))
            return;

        this._overviewShowingId = Main.overview.connect('showing', () =>
            this._setBlurSuspended(true));
        this._overviewHiddenId = Main.overview.connect('hidden', () =>
            this._setBlurSuspended(false));
    }

    _disconnectOverview() {
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
        this._setBlurSuspended(false);
    }

    _setBlurSuspended(suspended) {
        this._blurSuspended = suspended;
        for (const dock of this._docks)
            dock.setBlurSuspended(suspended);
    }

    _applyDockOpacitySync() {
        if (!this.settings.get_boolean('sync-dock-opacity')) {
            this._restoreDockOpacitySync();
            return;
        }

        try {
            if (!this._dockSettings) {
                this._dockSettings = new Gio.Settings({schema_id: DOCK_SCHEMA});
                this._savedDockOpacity = this._dockSettings.get_double('background-opacity');
                this._savedDockTransparency = this._dockSettings.get_int('transparency-mode');
            }
            this._dockSettings.set_int('transparency-mode', 1);
            this._dockSettings.set_double('background-opacity', 0);
        } catch (e) {
            log(`compact-dock: dash-to-dock settings: ${e}`);
        }
    }

    _restoreDockOpacitySync() {
        if (!this._dockSettings)
            return;
        try {
            if (this._savedDockOpacity !== null)
                this._dockSettings.set_double('background-opacity', this._savedDockOpacity);
            if (this._savedDockTransparency !== null)
                this._dockSettings.set_int('transparency-mode', this._savedDockTransparency);
        } catch (e) {
            log(`compact-dock: restore dock settings: ${e}`);
        }
        this._dockSettings = null;
        this._savedDockOpacity = null;
        this._savedDockTransparency = null;
    }
});
