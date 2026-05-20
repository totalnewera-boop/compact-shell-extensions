'use strict';

/** Непрозрачность тёмной подложки: 0.15 ≈ стекло, 0.85 ≈ плотная плашка */
export function tintStyle(alpha, borderAlpha = 0) {
    let border = 'border: none;';
    if (borderAlpha > 0.001)
        border = `border: 1px solid rgba(0, 0, 0, ${Math.min(borderAlpha, 0.35)});`;

    return (
        `background-color: rgba(28, 28, 28, ${alpha}); ` +
        `${border} ` +
        'box-shadow: none; outline: none;'
    );
}
