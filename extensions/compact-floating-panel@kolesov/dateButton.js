'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PANELBOX = Main.layoutManager.panelBox;
const DATEMENU = Main.panel.statusArea.dateMenu;
const DATE_SOURCE = DATEMENU.menu.sourceActor;
const DATE_ARROW = DATEMENU.menu._arrowAlignment;

export const DateButton = GObject.registerClass(
class DateButton extends St.BoxLayout {
    constructor() {
        super({
            name: 'dateBtn',
            reactive: true,
            track_hover: true,
            style_class: 'cfp-segment date-btn',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.connect('notify::mapped', () => {
            DATEMENU.menu.close();
            if (this.mapped) {
                DATEMENU.menu.sourceActor = this;
                DATEMENU.menu._arrowAlignment = 0.5;
                DATEMENU.menu._boxPointer._userArrowSide = St.Side.TOP;
            } else {
                DATEMENU.menu.sourceActor = DATE_SOURCE;
                DATEMENU.menu._arrowAlignment = DATE_ARROW;
                DATEMENU.menu._boxPointer._userArrowSide = St.Side.TOP;
            }
        });

        this.connect('button-press-event', () => {
            DATEMENU.menu.toggle();
        });

        this._dmId = DATEMENU.menu.connect('open-state-changed', () => {
            this.change_style_pseudo_class(
                'active',
                DATEMENU.menu.isOpen);
        });

        this._dateLabel = new St.Label({
            text: DATEMENU._clockDisplay.text,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._dateLabel);

        this._dateId = DATEMENU._clockDisplay.bind_property(
            'text', this._dateLabel, 'text',
            GObject.BindingFlags.SYNC_CREATE);

        this._textId = DATEMENU._clockDisplay.connect('notify::text', () => {
            this.queue_relayout();
        });

        Main.wm.setCustomKeybindingHandler(
            'toggle-message-tray',
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            this._toggleCalendar.bind(this));
    }

    _toggleCalendar() {
        if (this.visible || PANELBOX.visible)
            DATEMENU.menu.toggle();
    }

    destroy() {
        Main.wm.setCustomKeybindingHandler(
            'toggle-message-tray',
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            Main.wm._toggleCalendar.bind(Main.wm));
        DATEMENU.menu.disconnect(this._dmId);
        DATEMENU._clockDisplay.disconnect(this._textId);
        this._dateId = null;
        this._textId = null;
        super.destroy();
    }
});
