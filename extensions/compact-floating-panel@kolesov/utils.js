'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DISPLAY = global.display;
const LAYOUT = Main.layoutManager;
const PANELBOX = LAYOUT.panelBox;

export function primaryMonitorGeometry() {
    const monitor = DISPLAY.get_primary_monitor();
    return DISPLAY.get_monitor_geometry(monitor);
}

/** Спрятать стандартную панель за экран (Shell снова показывает её в обзоре и меню). */
export function suppressMainPanel() {
    const geom = primaryMonitorGeometry();
    if (LAYOUT._findActor(PANELBOX) !== -1)
        LAYOUT.untrackChrome(PANELBOX);
    PANELBOX.translation_y = 0;
    PANELBOX.translation_x = 0;
    PANELBOX.set_position(geom.x, geom.y - PANELBOX.height - 8);
    PANELBOX.visible = false;
    PANELBOX.opacity = 0;
}

/** Скрыть виджет панели, индикаторы остаются для всплывающих меню. */
export function hidePanelChrome() {
    const panel = Main.panel;
    if (panel._cfpSavedOpacity === undefined) {
        panel._cfpSavedOpacity = panel.opacity;
        panel._cfpSavedReactive = panel.reactive;
    }
    panel.opacity = 0;
    panel.reactive = false;
}

export function showPanelChrome() {
    const panel = Main.panel;
    if (panel._cfpSavedOpacity === undefined)
        return;
    panel.opacity = panel._cfpSavedOpacity;
    panel.reactive = panel._cfpSavedReactive;
    delete panel._cfpSavedOpacity;
    delete panel._cfpSavedReactive;
}

/** Вернуть стандартную панель (обзор приложений и т.п.). */
export function restoreMainPanel() {
    const geom = primaryMonitorGeometry();
    if (LAYOUT._findActor(PANELBOX) === -1) {
        LAYOUT.trackChrome(PANELBOX, {
            affectsStruts: true,
            trackFullscreen: true,
        });
    }
    PANELBOX.opacity = 255;
    PANELBOX.set_position(geom.x, geom.y);
    PANELBOX.show();
    showPanelChrome();
}
