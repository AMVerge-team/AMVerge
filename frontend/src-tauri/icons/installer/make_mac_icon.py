import os
import subprocess
import sys
import tempfile
from PIL import Image, ImageChops, ImageDraw, ImageFilter

# usage: python make_mac_icon.py <logo.png>
# writes ../icon.icns: green amv on a dark macos tile (a transparent icon gets a light tile on macos 26)
here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "..", "..", "src", "assets", "amverge-logo.png")
out = os.path.join(here, "..", "icon.icns")

N = 1024
TILE, INSET, RADIUS = 824, 100, 185  # apple's macos icon grid
TOP, BOTTOM = (34, 38, 34), (8, 9, 8)
GREEN = (40, 255, 60)

logo = Image.open(src).convert("RGBA")
logo = logo.crop(logo.getbbox())


def master():
    mask = Image.new("L", (N, N), 0)
    ImageDraw.Draw(mask).rounded_rectangle([INSET, INSET, INSET + TILE, INSET + TILE], RADIUS, fill=255)

    tile = Image.new("RGB", (N, N))
    d = ImageDraw.Draw(tile)
    for y in range(N):
        t = min(1, max(0, (y - INSET) / TILE))
        d.line([(0, y), (N, y)], fill=tuple(int(TOP[k] + (BOTTOM[k] - TOP[k]) * t) for k in range(3)))

    # green glow behind the letters
    glow = Image.new("RGB", (N, N))
    ImageDraw.Draw(glow).ellipse([N / 2 - 300, N / 2 - 200, N / 2 + 300, N / 2 + 200],
                                 fill=tuple(int(c * 0.28) for c in GREEN))
    tile = ImageChops.add(tile, glow.filter(ImageFilter.GaussianBlur(110)))

    w = 600
    l = logo.resize((w, round(logo.height * w / logo.width)), Image.NEAREST)
    tile.paste(l, ((N - l.width) // 2, (N - l.height) // 2), l)

    # thin light rim so the tile edge reads on dark docks
    rim = Image.new("L", (N, N), 0)
    ImageDraw.Draw(rim).rounded_rectangle([INSET, INSET, INSET + TILE, INSET + TILE], RADIUS, outline=255, width=3)
    tile = Image.composite(Image.new("RGB", (N, N), (70, 78, 70)), tile, rim)

    icon = tile.convert("RGBA")
    icon.putalpha(mask)
    return icon


m = master()
with tempfile.TemporaryDirectory() as tmp:
    iconset = os.path.join(tmp, "icon.iconset")
    os.makedirs(iconset)
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = size * scale
            name = f"icon_{size}x{size}{'@2x' if scale == 2 else ''}.png"
            m.resize((px, px), Image.LANCZOS).save(os.path.join(iconset, name))
    subprocess.check_call(["iconutil", "-c", "icns", iconset, "-o", out])
m.save(os.path.join(tempfile.gettempdir(), "amverge-icon-preview.png"))
print("wrote", os.path.abspath(out))
