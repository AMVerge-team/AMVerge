import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# usage: python make_dmg_background.py <out_dir>
# writes dmg-background.png (660x400) and dmg-background@2x.png; positions must match dmg_settings.py
out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

W, H = 660, 400
APP_X, APPS_X, ICON_Y = 170, 490, 190
# light theme: finder always draws file names black over a background image
BG_TOP, BG_BOTTOM = (250, 252, 250), (234, 239, 234)
GREEN = (18, 196, 46)
GLOW = (196, 240, 202)
DOTS = (216, 224, 216)
TEXT = (12, 14, 12)
HINT = (60, 66, 60)


def mix(a, b, t):
    return tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))


def font(size, weight="regular"):
    paths = {
        "bold": ["/System/Library/Fonts/SFNSRounded.ttf", "/System/Library/Fonts/HelveticaNeue.ttc"],
        "regular": ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/HelveticaNeue.ttc"],
    }[weight]
    for p in paths:
        try:
            f = ImageFont.truetype(p, size)
            if weight == "bold":
                try:
                    f.set_variation_by_name("Bold")
                except Exception:
                    pass
            return f
        except OSError:
            pass
    return ImageFont.load_default()


def render(s):
    w, h = W * s, H * s
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)

    # vertical gradient
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=mix(BG_TOP, BG_BOTTOM, t))

    # soft green glows behind both icon slots
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    for cx, r, a in ((APP_X, 120, 200), (APPS_X, 95, 90)):
        md.ellipse([(cx - r) * s, (ICON_Y - r) * s, (cx + r) * s, (ICON_Y + r) * s], fill=a)
    mask = mask.filter(ImageFilter.GaussianBlur(40 * s))
    img = Image.composite(Image.new("RGB", (w, h), GLOW), img, mask)
    d = ImageDraw.Draw(img)

    # subtle pixel grid dots, nod to the pixel logo
    step = 22 * s
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            d.rectangle([x, y, x + s - 1, y + s - 1], fill=DOTS)

    # pixel-art arrow between the icons
    px = 8 * s
    cy = ICON_Y * s
    x0, x1 = (APP_X + 92) * s, (APPS_X - 92) * s
    head = 5  # arrowhead depth in blocks
    shaft_end = x1 - head * px
    x = x0
    while x + px <= shaft_end:
        t = 0.35 + 0.65 * (x - x0) / max(1, shaft_end - x0)
        d.rectangle([x, cy - px // 2, x + px - 1, cy + px // 2 - 1], fill=mix(GLOW, GREEN, t))
        x += px * 2
    for k in range(head):
        hx = shaft_end + k * px
        span = head - 1 - k
        d.rectangle([hx, cy - px // 2 - span * px, hx + px - 1, cy + px // 2 - 1 + span * px], fill=GREEN)

    # title and hint
    title = font(26 * s, "bold")
    t = "Install AMVerge"
    tw = d.textlength(t, font=title)
    d.text(((w - tw) / 2, 40 * s), t, font=title, fill=TEXT)
    hint = font(13 * s)
    t = "Drag AMVerge onto the Applications folder"
    tw = d.textlength(t, font=hint)
    d.text(((w - tw) / 2, 78 * s), t, font=hint, fill=HINT)

    # accent line at the bottom
    d.rectangle([0, h - 3 * s, w, h], fill=GREEN)
    return img


for s, name in ((1, "dmg-background.png"), (2, "dmg-background@2x.png")):
    render(s).save(os.path.join(out, name), dpi=(72 * s, 72 * s))
print("wrote", out)
