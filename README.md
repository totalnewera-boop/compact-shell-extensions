<img width="1920" height="1080" alt="Screenshot From 2026-05-20 15-58-31" src="https://github.com/user-attachments/assets/c6ea3510-0101-4fb6-854a-c10e204548ed" />


# Compact Shell — плавающая панель + стеклянный док

Два расширения для **GNOME Shell 50** (Ubuntu 26.04 и аналоги):

| UUID | Название |
|------|----------|
| `compact-floating-panel@kolesov` | Компактная таблетка вместо верхней панели |
| `compact-dock@kolesov` | Blur / стекло для Ubuntu Dock |

## Быстрая установка (другой компьютер)

```bash
git clone <URL-ВАШЕГО-РЕПО> compact-shell-extensions
cd compact-shell-extensions
chmod +x install.sh
./install.sh
```

Или без git — скопируйте папку `compact-shell-extensions` на флешку / в облако и запустите `./install.sh`.

Плотность стекла при установке (по умолчанию `0.3`):

```bash
PANEL_ALPHA=0.15 DOCK_ALPHA=0.15 ./install.sh
```

## Требования

- GNOME Shell **50**
- **Ubuntu Dock** (`ubuntu-dock@ubuntu.com`) — для `compact-dock`
- Выключите **Blur my Shell → Dash to Dock**, если стоит BMS (конфликт)

## Настройки

```bash
# Прозрачность подложки: меньше = прозрачнее (0.15 стекло, 0.3 чуть плотнее)
gsettings set org.gnome.shell.extensions.compact-floating-panel background-alpha 0.3
gsettings set org.gnome.shell.extensions.compact-dock background-alpha 0.3

# Blur дока
gsettings set org.gnome.shell.extensions.compact-dock sigma 10
gsettings set org.gnome.shell.extensions.compact-dock blur-enabled true
```

Перезагрузка расширения после смены:

```bash
gnome-extensions disable compact-floating-panel@kolesov
gnome-extensions enable compact-floating-panel@kolesov
gnome-extensions disable compact-dock@kolesov
gnome-extensions enable compact-dock@kolesov
```

## Удаление

```bash
./uninstall.sh
```

## Опубликовать «официально»?

| Способ | Плюсы | Минусы |
|--------|--------|--------|
| **GitHub + `install.sh`** (этот репозиторий) | 2 минуты, полный контроль | Нет кнопки в extensions.gnome.org |
| **extensions.gnome.org** | Установка из браузера в Extensions | Ревью, обновления под каждый Shell |
| **ZIP вручную** | Просто | Руками копировать в `~/.local/share/gnome-shell/extensions/` |

Для личных машин и друзей достаточно **GitHub + install.sh**.

### ZIP вручную

```bash
cd extensions
zip -r ../compact-shell.zip compact-floating-panel@kolesov compact-dock@kolesov
```

Распаковать в `~/.local/share/gnome-shell/extensions/`, затем `./install.sh` из корня репозитория (или `glib-compile-schemas` в каждой папке).

## Структура

```
compact-shell-extensions/
├── install.sh
├── uninstall.sh
├── README.md
└── extensions/
    ├── compact-floating-panel@kolesov/
    └── compact-dock@kolesov/
```

## Автор

kolesov — личные расширения, без гарантий. Используйте на свой риск.
