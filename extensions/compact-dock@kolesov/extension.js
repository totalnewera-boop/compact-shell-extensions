'use strict';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DashGlassManager} from './dashGlass.js';

export default class CompactDockExtension extends Extension {
    enable() {
        try {
            this._manager = new DashGlassManager(this.getSettings());
            this._manager.enable();
        } catch (e) {
            logError(e, 'compact-dock enable failed');
            this._manager = null;
        }
    }

    disable() {
        if (this._manager) {
            this._manager.disable();
            this._manager = null;
        }
    }
}
