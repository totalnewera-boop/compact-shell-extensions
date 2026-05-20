'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as DateButton from './dateButton.js';
import * as LanguageButton from './languageButton.js';
import * as QuickButton from './quickButton.js';
import * as BlurEffect from './blurEffect.js';
import * as GlassStyle from './glassStyle.js';
import * as Utils from './utils.js';

const LAYOUT = Main.layoutManager;
const PANELBOX = LAYOUT.panelBox;
const OVERVIEW = Main.overview;
const DISPLAY = global.display;

let sessionReady = false;

const CompactFloatingPanel = GObject.registerClass(
class CompactFloatingPanel extends St.Widget {
    constructor(settings) {
        super({
            name: 'CompactFloatingPanel',
            style_class: 'cfp-root',
            reactive: true,
            can_focus: true,
            visible: false,
            clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout(),
        });
        this.add_style_class_name('horizontal');

        this._background = new St.Widget({
            style_class: 'cfp-background',
            reactive: false,
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
        });
        this._content = new St.BoxLayout({
            style_class: 'cfp-content horizontal',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            x_expand: true,
            y_expand: true,
        });

        this.add_child(this._background);
        this.add_child(this._content);

        this._settings = settings;
        this._dragging = false;
        this._didDrag = false;
        this._dragOffset = [0, 0];
        this._openMenus = 0;
        this._anchorRight = true;
        this._reflowIdle = 0;
        this._occlusionIdle = 0;
        this._occlusionWindows = new Map();
        this._occluded = false;
        this._userHidden = false;

        const handleIcon = new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        });
        this._handle = new St.Button({
            style_class: 'cfp-hit-target cfp-icon-slot handle',
            child: handleIcon,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._handle.connect('button-press-event', this._onHandlePress.bind(this));
        this._handle.connect('button-release-event', () => {
            if (this._dragging && !this._didDrag)
                Main.overview.toggle();
            this._dragging = false;
            this._didDrag = false;
            return Clutter.EVENT_STOP;
        });
        this._content.add_child(this._handle);

        this._dateBtn = new DateButton.DateButton();
        this._content.add_child(this._dateBtn);

        this._languageBtn = new LanguageButton.LanguageButton();
        this._content.add_child(this._languageBtn);

        this._quickBtn = new QuickButton.QuickButton();
        this._content.add_child(this._quickBtn);

        for (const child of [this._handle, this._dateBtn, this._languageBtn, this._quickBtn]) {
            child.x_expand = false;
            child.connect('notify::width', () => this._scheduleReflow());
            child.connect('notify::allocation', () => this._scheduleReflow());
        }
        this._handle.connect('motion-event', this._onMotion.bind(this));

        try {
            this._blurHandle = BlurEffect.applyActorBlur(this._background);
        } catch (e) {
            log(`compact-floating-panel: blur unavailable: ${e}`);
            this._blurHandle = null;
        }

        this._applyBackgroundTint();
        this._bgAlphaId = this._settings.connect(
            'changed::background-alpha', () => this._applyBackgroundTint());

        LAYOUT.addChrome(this, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._bindOcclusionTracking();

        this._startupId = LAYOUT.connect('startup-complete', () => {
            sessionReady = true;
            LAYOUT.disconnect(this._startupId);
            this._startupId = null;
            this._showPill();
        });

        this._overviewShowId = OVERVIEW.connect('showing', () => {
            this._enforceCompactMode();
            this._scheduleOcclusionUpdate();
        });
        this._overviewHideId = OVERVIEW.connect('hiding', () => {
            this._enforceCompactMode();
        });
        this._overviewShownId = OVERVIEW.connect('shown', () => {
            this._enforceCompactMode();
            this._scheduleOcclusionUpdate();
        });
        this._overviewHiddenId = OVERVIEW.connect('hidden', () => {
            this._scheduleOcclusionUpdate();
        });

        this._workareaId = DISPLAY.connect('workareas-changed', () => {
            this._snapToSavedOrCorner();
            this._scheduleOcclusionUpdate();
        });

        this._panelVisibleId = PANELBOX.connect('notify::visible', () => {
            if (this.visible && PANELBOX.visible)
                this._enforceCompactMode();
        });

        this._panelAllocId = PANELBOX.connect('notify::allocation', () => {
            if (this.visible)
                this._enforceCompactMode();
        });

        this._statusMenus = [
            Main.panel.statusArea.dateMenu.menu,
            Main.panel.statusArea.quickSettings.menu,
            Main.panel.statusArea.keyboard.menu,
        ];
        this._menuIds = this._statusMenus.map(menu =>
            menu.connect('open-state-changed', (_m, open) => {
                this._onStatusMenuOpenChanged(open);
            }));

        this._widthClampId = this.connect('notify::width', () => {
            if (this.visible && this.width > 0)
                this._scheduleReflow();
        });

        this._occlusionNotifyIds = [
            'notify::x', 'notify::y', 'notify::width', 'notify::height',
            'notify::visible', 'notify::allocation',
        ].map(signal => this.connect(signal, () => this._scheduleOcclusionUpdate()));

        if (sessionReady)
            this._showPill();
    }

    _applyBackgroundTint() {
        const a = this._settings.get_double('background-alpha');
        this._background.set_style(GlassStyle.tintStyle(a));
    }

    _bindOcclusionTracking() {
        const update = () => this._scheduleOcclusionUpdate();

        this._displayWindowCreatedId = DISPLAY.connect('window-created', (_d, metaWindow) => {
            this._trackWindow(metaWindow, update);
            update();
        });

        for (const metaWindow of DISPLAY.get_tab_list(Meta.TabList.NORMAL, null))
            this._trackWindow(metaWindow, update);
    }

    _trackWindow(metaWindow, update) {
        if (this._occlusionWindows.has(metaWindow))
            return;

        const ids = [
            metaWindow.connect('position-changed', update),
            metaWindow.connect('size-changed', update),
            metaWindow.connect('unmanaged', () => this._untrackWindow(metaWindow)),
        ];

        ids.push(metaWindow.connect('notify::minimized', update));

        this._occlusionWindows.set(metaWindow, ids);
    }

    _untrackWindow(metaWindow) {
        const ids = this._occlusionWindows.get(metaWindow);
        if (!ids)
            return;
        for (const id of ids)
            metaWindow.disconnect(id);
        this._occlusionWindows.delete(metaWindow);
        this._scheduleOcclusionUpdate();
    }

    _panelRect() {
        const [x, y] = this.get_transformed_position();
        const [w, h] = this.get_transformed_size();
        if (w <= 0 || h <= 0)
            return null;
        return new Mtk.Rectangle({
            x: Math.floor(x),
            y: Math.floor(y),
            width: Math.ceil(w),
            height: Math.ceil(h),
        });
    }

    _windowOverlapsPanel(metaWindow) {
        if (metaWindow.minimized)
            return false;
        const frame = metaWindow.get_frame_rect();
        const panel = this._panelRect();
        return panel && frame.overlap(panel);
    }

    _scheduleOcclusionUpdate() {
        if (this._occlusionIdle)
            return;
        this._occlusionIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._occlusionIdle = 0;
            this._updateOcclusion();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateOcclusion() {
        // Скрыто ПКМ пользователем — не показываем снова
        if (this._userHidden)
            return;
        // Скрыто по другой причине (не occlusion) — не трогаем
        if (!this.visible && !this._occluded)
            return;

        if (OVERVIEW.visible || this._openMenus > 0) {
            this._setOccluded(false);
            return;
        }

        const occluded = DISPLAY.get_tab_list(Meta.TabList.NORMAL, null)
            .some(w => this._windowOverlapsPanel(w));
        this._setOccluded(occluded);
    }

    _setSubtreeReactive(actor, reactive) {
        actor.reactive = reactive;
        for (const child of actor.get_children?.() ?? [])
            this._setSubtreeReactive(child, reactive);
    }

    _setOccluded(occluded) {
        if (this._occluded === occluded)
            return;
        this._occluded = occluded;

        if (occluded) {
            // opacity:0 мало — chrome и дочерние кнопки всё ещё ловят клики в углу
            this._setSubtreeReactive(this, false);
            this.opacity = 0;
            this.hide();
        } else {
            this.show();
            this.reactive = true;
            this._content.reactive = true;
            this._background.reactive = false;
            this._setSubtreeReactive(this._content, true);
            this._background.reactive = false;
            this.opacity = 255;
            this._enforceCompactMode();
        }
    }

    _updateAnchorSide(x = this.x) {
        const margin = this._settings.get_int('margin');
        const geom = Utils.primaryMonitorGeometry();
        const rightEdge = geom.x + geom.width - margin;
        const mid = geom.x + geom.width / 2;
        const center = x + this.width / 2;
        this._anchorRight = center >= mid;
        if (x + this.width >= rightEdge - 4)
            this._anchorRight = true;
    }

    _clampToMonitor(x = this.x, y = this.y) {
        const margin = this._settings.get_int('margin');
        const geom = Utils.primaryMonitorGeometry();
        const w = this.width;
        const h = this.height;
        const rightEdge = geom.x + geom.width - margin;

        let nx = x;
        let ny = y;

        if (this._anchorRight)
            nx = rightEdge - w;

        nx = Math.max(geom.x + margin,
            Math.min(nx, geom.x + geom.width - w - margin));
        ny = Math.max(geom.y + margin,
            Math.min(ny, geom.y + geom.height - h - margin));

        if (nx !== this.x || ny !== this.y)
            this.set_position(nx, ny);
        this._settings.set_int('pos-x', nx);
        this._settings.set_int('pos-y', ny);
    }

    _scheduleReflow() {
        if (!this.visible || this._reflowIdle)
            return;

        const keepRight = this._anchorRight;
        const prevRight = this.x + this.width;

        this._reflowIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._reflowIdle = 0;
            if (!this.visible)
                return GLib.SOURCE_REMOVE;

            this.queue_relayout();

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (!this.visible)
                    return GLib.SOURCE_REMOVE;
                if (keepRight)
                    this._anchorRight = true;
                this._updateAnchorSide(keepRight ? prevRight - this.width : this.x);
                this._clampToMonitor();
                this._scheduleOcclusionUpdate();
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _onStatusMenuOpenChanged(open) {
        if (!this.visible)
            return;

        this._openMenus += open ? 1 : -1;
        if (this._openMenus < 0)
            this._openMenus = 0;

        this._enforceCompactMode();
        if (!open)
            this._scheduleReflow();
        this._scheduleOcclusionUpdate();
    }

    _enforceCompactMode() {
        if (!this.visible)
            return;
        Utils.suppressMainPanel();
        Utils.hidePanelChrome();
    }

    _onHandlePress(_actor, event) {
        const btn = event.get_button();
        if (btn === 1) {
            this._dragging = true;
            this._didDrag = false;
            const [x, y] = event.get_coords();
            const [ax, ay] = this.get_transformed_position();
            this._dragOffset = [x - ax, y - ay];
            return Clutter.EVENT_STOP;
        }
        if (btn === 3) {
            this._userHidden = true;
            this._occluded = false;
            this.hide();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                if (!OVERVIEW.visible) {
                    this._userHidden = false;
                    this._showPill();
                }
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onMotion(_actor, event) {
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;

        const [px, py] = event.get_coords();
        const nx = px - this._dragOffset[0];
        const ny = py - this._dragOffset[1];
        if (Math.abs(nx - this.x) > 3 || Math.abs(ny - this.y) > 3)
            this._didDrag = true;
        this._updateAnchorSide(nx);
        this._clampToMonitor(nx, ny);
        return Clutter.EVENT_STOP;
    }

    _showPill() {
        this._enforceCompactMode();
        this._snapToSavedOrCorner();
        this._occluded = false;
        this._userHidden = false;
        this.opacity = 0;
        this.show();
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._updateOcclusion(),
        });
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._enforceCompactMode();
            this._scheduleReflow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _snapToSavedOrCorner() {
        const margin = this._settings.get_int('margin');
        const geom = Utils.primaryMonitorGeometry();
        let x = this._settings.get_int('pos-x');
        let y = this._settings.get_int('pos-y');

        const apply = () => {
            if (x <= 0 && y <= 0) {
                this._anchorRight = true;
                y = geom.y + margin;
            }
            this._updateAnchorSide(x);
            this._clampToMonitor(x, y);
        };

        if (this.width > 0)
            apply();
        else
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                apply();
                return GLib.SOURCE_REMOVE;
            });
    }

    destroy() {
        this.hide();
        Utils.showPanelChrome();
        Utils.restoreMainPanel();

        if (this._startupId) {
            LAYOUT.disconnect(this._startupId);
            this._startupId = null;
        }
        OVERVIEW.disconnect(this._overviewShowId);
        OVERVIEW.disconnect(this._overviewHideId);
        OVERVIEW.disconnect(this._overviewShownId);
        if (this._overviewHiddenId) {
            OVERVIEW.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }
        DISPLAY.disconnect(this._workareaId);
        if (this._displayWindowCreatedId) {
            DISPLAY.disconnect(this._displayWindowCreatedId);
            this._displayWindowCreatedId = 0;
        }
        PANELBOX.disconnect(this._panelVisibleId);
        PANELBOX.disconnect(this._panelAllocId);
        this._menuIds.forEach((id, i) => this._statusMenus[i].disconnect(id));
        this._menuIds = [];
        this._statusMenus = [];

        for (const [metaWindow] of this._occlusionWindows)
            this._untrackWindow(metaWindow);
        this._occlusionWindows.clear();

        if (this._occlusionNotifyIds) {
            for (const id of this._occlusionNotifyIds)
                this.disconnect(id);
            this._occlusionNotifyIds = [];
        }

        if (this._occlusionIdle) {
            GLib.Source.remove(this._occlusionIdle);
            this._occlusionIdle = 0;
        }

        if (this._reflowIdle) {
            GLib.Source.remove(this._reflowIdle);
            this._reflowIdle = 0;
        }
        if (this._widthClampId) {
            this.disconnect(this._widthClampId);
            this._widthClampId = null;
        }
        if (this._bgAlphaId) {
            this._settings.disconnect(this._bgAlphaId);
            this._bgAlphaId = null;
        }

        this._dateBtn.destroy();
        this._languageBtn.destroy();
        this._quickBtn.destroy();

        if (this._blurHandle)
            BlurEffect.removeActorBlur(this._background, this._blurHandle);
        this._blurHandle = null;

        LAYOUT.removeChrome(this);
        super.destroy();
    }
});

export default class CompactFloatingPanelExtension extends Extension {
    enable() {
        sessionReady = false;
        try {
            this._panel = new CompactFloatingPanel(this.getSettings());
        } catch (e) {
            logError(e, 'compact-floating-panel enable failed');
            this._panel = null;
        }
    }

    disable() {
        if (this._panel) {
            this._panel.destroy();
            this._panel = null;
        }
        sessionReady = false;
    }
}
