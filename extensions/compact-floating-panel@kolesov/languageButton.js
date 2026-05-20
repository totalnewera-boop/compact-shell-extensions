'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {getInputSourceManager} from 'resource:///org/gnome/shell/ui/status/keyboard.js';

const KEYBOARD = Main.panel.statusArea.keyboard;
const KEYBOARD_SOURCE = KEYBOARD.menu.sourceActor;
const KEYBOARD_ARROW = KEYBOARD.menu._arrowAlignment;

export const LanguageButton = GObject.registerClass(
class LanguageButton extends St.BoxLayout {
    constructor() {
        super({
            name: 'languageBtn',
            reactive: true,
            track_hover: true,
            style_class: 'cfp-segment language-btn',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._manager = getInputSourceManager();

        this._label = new St.Label({
            text: this._shortName(),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this.add_child(this._label);

        this._manager.connectObject(
            'current-source-changed', () => this._syncLabel(),
            'sources-changed', () => this._syncLabel(),
            'keymap-changed', () => this._syncLabel(),
            this);

        KEYBOARD.bind_property(
            'visible', this, 'visible',
            GObject.BindingFlags.SYNC_CREATE);

        this.connect('notify::mapped', () => {
            KEYBOARD.menu.close();
            if (this.mapped) {
                KEYBOARD.menu.sourceActor = this;
                KEYBOARD.menu._arrowAlignment = 0.5;
                KEYBOARD.menu._boxPointer._userArrowSide = St.Side.TOP;
            } else {
                KEYBOARD.menu.sourceActor = KEYBOARD_SOURCE;
                KEYBOARD.menu._arrowAlignment = KEYBOARD_ARROW;
                KEYBOARD.menu._boxPointer._userArrowSide = St.Side.TOP;
            }
        });

        this.connect('button-press-event', () => {
            KEYBOARD.menu.toggle();
        });

        this._kmId = KEYBOARD.menu.connect('open-state-changed', () => {
            this.change_style_pseudo_class(
                'active',
                KEYBOARD.menu.isOpen);
        });

        this._syncLabel();
    }

    _shortName() {
        return this._manager.currentSource?.shortName ?? '';
    }

    _syncLabel() {
        this._label.text = this._shortName();
        this.queue_relayout();
    }

    destroy() {
        this._manager.disconnectObject(this);
        KEYBOARD.menu.disconnect(this._kmId);
        super.destroy();
    }
});
