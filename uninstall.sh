#!/usr/bin/env bash
set -euo pipefail

gnome-extensions disable compact-floating-panel@kolesov 2>/dev/null || true
gnome-extensions disable compact-dock@kolesov 2>/dev/null || true

rm -rf \
    "${HOME}/.local/share/gnome-shell/extensions/compact-floating-panel@kolesov" \
    "${HOME}/.local/share/gnome-shell/extensions/compact-dock@kolesov"

echo "Расширения удалены. Пересоберите glib-схемы при необходимости:"
echo "  glib-compile-schemas ~/.local/share/glib-2.0/schemas/"
