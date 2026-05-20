#!/usr/bin/env bash
# Установка Compact Floating Panel + Compact Dock для GNOME Shell 50
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions"
GLIB_SCHEMAS="${HOME}/.local/share/glib-2.0/schemas"
PANEL_UUID="compact-floating-panel@kolesov"
DOCK_UUID="compact-dock@kolesov"
PANEL_ALPHA="${PANEL_ALPHA:-0.3}"
DOCK_ALPHA="${DOCK_ALPHA:-0.3}"

install_one() {
    local uuid="$1"
    local src="${ROOT}/extensions/${uuid}"
    local dest="${EXT_DIR}/${uuid}"

    if [[ ! -f "${src}/metadata.json" ]]; then
        echo "Ошибка: нет ${src}/metadata.json" >&2
        exit 1
    fi

    echo "→ ${uuid}"
    rm -rf "${dest}"
    cp -a "${src}" "${dest}"
    glib-compile-schemas "${dest}/schemas/"
    cp -f "${dest}/schemas/"*.gschema.xml "${GLIB_SCHEMAS}/"
}

echo "Установка в ${EXT_DIR}"
mkdir -p "${EXT_DIR}" "${GLIB_SCHEMAS}"

install_one "${PANEL_UUID}"
install_one "${DOCK_UUID}"

glib-compile-schemas "${GLIB_SCHEMAS}/"

echo "Настройки по умолчанию (стекло)..."
gsettings set org.gnome.shell.extensions.compact-floating-panel background-alpha "${PANEL_ALPHA}"
gsettings set org.gnome.shell.extensions.compact-dock background-alpha "${DOCK_ALPHA}"

gnome-extensions enable "${PANEL_UUID}" 2>/dev/null || true
gnome-extensions enable "${DOCK_UUID}" 2>/dev/null || true

echo ""
echo "Готово."
echo "  Таблетка: gsettings set org.gnome.shell.extensions.compact-floating-panel background-alpha 0.15"
echo "  Док:      gsettings set org.gnome.shell.extensions.compact-dock background-alpha 0.15"
echo ""
echo "Перезагрузка расширений:"
echo "  gnome-extensions disable ${PANEL_UUID} && gnome-extensions enable ${PANEL_UUID}"
echo "  gnome-extensions disable ${DOCK_UUID} && gnome-extensions enable ${DOCK_UUID}"
