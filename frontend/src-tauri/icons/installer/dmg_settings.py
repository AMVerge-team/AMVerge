# dmgbuild settings for the macOS installer window
# usage: dmgbuild -s dmg_settings.py -D app=<App.app> -D apps_alias=<alias> -D background=<dmg-background.png> "<volume name>" out.dmg
# apps_alias comes from make_applications_alias.js (a symlink shows blank on macos 26)
import os

app = defines["app"]  # noqa: F821
app_name = os.path.basename(app)

files = [app, (defines["apps_alias"], "Applications")]  # noqa: F821
icon = os.path.join(os.path.dirname(defines["background"]), "..", "icon.icns")  # noqa: F821
format = "ULMO"

# positions match make_dmg_background.py (APP_X, APPS_X, ICON_Y)
background = defines["background"]  # noqa: F821, @2x beside it is picked up too
window_rect = ((200, 120), (660, 400))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
hide_extensions = [app_name]
icon_size = 128
text_size = 13
icon_locations = {app_name: (170, 190), "Applications": (490, 190)}
