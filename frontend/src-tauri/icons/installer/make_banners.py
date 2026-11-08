import sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
logo = Image.open(src).convert("RGBA")
logo = logo.crop(logo.getbbox())
px = logo.getpixel((logo.width // 2, logo.height // 2))
green = max((logo.getpixel((x, y)) for x in range(logo.width) for y in range(logo.height)), key=lambda p: p[3])[:3]
BG = (10, 10, 10)

def scaled(width):
    return logo.resize((width, round(logo.height * width / logo.width)), Image.BOX)

def glow(img, cx, cy, r, strength):
    # soft green radial glow behind the logo
    g = Image.new("RGB", img.size, BG)
    d = ImageDraw.Draw(g)
    steps = 40
    for i in range(steps, 0, -1):
        t = i / steps
        a = strength * (1 - t) ** 2
        c = tuple(int(BG[k] + (green[k] - BG[k]) * a) for k in range(3))
        d.ellipse([cx - r * t, cy - r * t, cx + r * t, cy + r * t], fill=c)
    return g

def font(size, bold=True):
    for name in (["seguisb.ttf", "segoeuib.ttf"] if bold else ["segoeui.ttf"]):
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            pass
    return ImageFont.load_default()

# header: 150x57, logo centred, thin accent line at the bottom
W, H = 150, 57
img = glow(Image.new("RGB", (W, H)), W // 2, H // 2, 70, 0.18)
l = scaled(96)
img.paste(l, ((W - l.width) // 2, (H - l.height) // 2 - 1), l)
ImageDraw.Draw(img).rectangle([0, H - 2, W, H], fill=green)
img.save(f"{out}/header.bmp")

# sidebar: 164x314, logo centred both ways with its glow, accent bar on the right edge
W, H = 164, 314
img = glow(Image.new("RGB", (W, H)), W // 2, H // 2, 120, 0.22)
l = scaled(124)
img.paste(l, ((W - l.width) // 2, (H - l.height) // 2), l)
d = ImageDraw.Draw(img)
d.rectangle([W - 3, 0, W, H], fill=green)
img.save(f"{out}/sidebar.bmp")
print("green", green)
