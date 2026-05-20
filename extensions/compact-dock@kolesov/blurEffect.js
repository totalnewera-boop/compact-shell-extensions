'use strict';

import Shell from 'gi://Shell';
import St from 'gi://St';

export function applyActorBlur(actor, sigma) {
    const themeContext = St.ThemeContext.get_for_stage(global.stage);
    const effect = new Shell.BlurEffect({
        mode: Shell.BlurMode.ACTOR,
        brightness: 0.82,
    });

    const handle = {effect, scaleId: 0, themeContext, sigma};
    handle.updateRadius = () => {
        effect.radius = handle.sigma * themeContext.scale_factor;
    };
    handle.updateRadius();

    handle.scaleId = themeContext.connect('notify::scale-factor', handle.updateRadius);
    actor.add_effect(effect);

    return handle;
}

export function removeActorBlur(actor, handle) {
    if (!handle)
        return;
    handle.themeContext.disconnect(handle.scaleId);
    actor.remove_effect(handle.effect);
    handle.effect = null;
}

export function setBlurSigma(handle, sigma) {
    if (!handle?.effect)
        return;
    handle.sigma = sigma;
    handle.updateRadius();
}
