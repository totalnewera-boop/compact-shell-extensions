'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PANELBOX = Main.layoutManager.panelBox;
const QUICKSETTINGS = Main.panel.statusArea.quickSettings;
const QUICK_SOURCE = QUICKSETTINGS.menu.sourceActor;
const QUICK_ARROW = QUICKSETTINGS.menu._arrowAlignment;

export const QuickButton = GObject.registerClass(
class QuickButton extends St.BoxLayout {
    constructor() {
        super({
            name: 'quickBtn',
            style_class: 'quick-tray',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: false,
        });

        this.connect('notify::mapped', () => {
            QUICKSETTINGS.menu.close();
            if (this.mapped) {
                QUICKSETTINGS.menu.sourceActor = this;
                QUICKSETTINGS.menu._arrowAlignment = 0.5;
                QUICKSETTINGS.menu._boxPointer._userArrowSide = St.Side.TOP;
            } else {
                QUICKSETTINGS.menu.sourceActor = QUICK_SOURCE;
                QUICKSETTINGS.menu._arrowAlignment = QUICK_ARROW;
                QUICKSETTINGS.menu._boxPointer._userArrowSide = St.Side.TOP;
            }
        });

        this.connect('button-press-event', (_a, event) => {
            if (event.get_button() === 1)
                QUICKSETTINGS.menu.toggle();
        });

        this._qmId = QUICKSETTINGS.menu.connect('open-state-changed', () => {
            this.change_style_pseudo_class(
                'active',
                QUICKSETTINGS.menu.isOpen);
        });

        this._cloneIndicators();

        this._qiId = QUICKSETTINGS._indicators.connectObject(
            'child-added', () => this._cloneIndicators(),
            'child-removed', () => this._cloneIndicators(),
            this);

        Main.wm.setCustomKeybindingHandler(
            'toggle-quick-settings',
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            this._toggleQuickSettings.bind(this));
    }

    _toggleQuickSettings() {
        if (this.visible || PANELBOX.visible)
            QUICKSETTINGS.menu.toggle();
    }

    _openQuickSettings() {
        if (!QUICKSETTINGS.menu.isOpen)
            QUICKSETTINGS.menu.open();
    }

    _createIconSlot(org, type) {
        const slot = new St.Button({
            style_class: 'cfp-hit-target cfp-icon-slot',
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        let content;
        if (type === 'gicon') {
            content = new St.Icon({style_class: 'system-status-icon'});
        } else {
            content = new St.Label({
                style_class: 'status-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
        }
        slot.set_child(content);

        slot.connect('button-press-event', () => {
            this._openQuickSettings();
            return Clutter.EVENT_STOP;
        });

        this.add_child(slot);

        org.bind_property(type, content, type,
            GObject.BindingFlags.SYNC_CREATE);
        org.bind_property('visible', slot, 'visible',
            GObject.BindingFlags.SYNC_CREATE);

        return slot;
    }

    _cloneIndicators() {
        this.remove_all_children();

        for (const ind of QUICKSETTINGS._indicators) {
            if (ind._indicator) {
                this._createIconSlot(ind._indicator, 'gicon');
                if (ind._percentageLabel)
                    this._createIconSlot(ind._percentageLabel, 'text');
            } else if (ind._primaryIndicator) {
                this._createIconSlot(ind._primaryIndicator, 'gicon');
            }
        }

        this.queue_relayout();
    }

    destroy() {
        Main.wm.setCustomKeybindingHandler(
            'toggle-quick-settings',
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            Main.wm._toggleQuickSettings.bind(Main.wm));
        QUICKSETTINGS._indicators.disconnectObject(this._qiId);
        QUICKSETTINGS.menu.disconnect(this._qmId);
        super.destroy();
    }
});
