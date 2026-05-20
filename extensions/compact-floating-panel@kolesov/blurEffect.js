'use strict';

import Shell from 'gi://Shell';
import St from 'gi://St';

const SIGMA = 5;

export function applyActorBlur(actor) {
    const themeContext = St.ThemeContext.get_for_stage(global.stage);
    const effect = new Shell.BlurEffect({
        mode: Shell.BlurMode.ACTOR,
        brightness: 0.82,
    });

    const updateRadius = () => {
        effect.radius = SIGMA * themeContext.scale_factor;
    };
    updateRadius();

    const scaleId = themeContext.connect('notify::scale-factor', updateRadius);
    actor.add_effect(effect);

    return {effect, scaleId, themeContext};
}

export function removeActorBlur(actor, handle) {
    if (!handle)
        return;
    handle.themeContext.disconnect(handle.scaleId);
    actor.remove_effect(handle.effect);
    handle.effect = null;
}
