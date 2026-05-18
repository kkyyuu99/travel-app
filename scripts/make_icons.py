"""Generate PNG icons for the Tokyo travel PWA."""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
ICONS.mkdir(exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        c = lerp(top, bottom, y / max(1, size - 1))
        for x in range(size):
            px[x, y] = c
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)
    return mask


def draw_tower(draw, scale, offset_x, offset_y):
    # Tokyo Tower silhouette in coordinates based on 512x512 canvas
    red = (230, 57, 70)
    red_top = (255, 107, 107)
    dark = (13, 17, 23)

    def s(x, y):
        return (int(x * scale + offset_x), int(y * scale + offset_y))

    def poly(pts, fill):
        draw.polygon([s(x, y) for x, y in pts], fill=fill)

    def rect(x0, y0, x1, y1, fill):
        draw.rectangle([s(x0, y0), s(x1, y1)], fill=fill)

    # Antenna
    poly([(256, 72), (244, 128), (268, 128)], red_top)
    rect(248, 128, 264, 148, red_top)
    # Upper observation
    poly([(248, 148), (264, 148), (280, 200), (232, 200)], red)
    rect(222, 200, 290, 214, red)
    # Middle truss
    poly([(222, 214), (290, 214), (320, 320), (192, 320)], red)
    rect(184, 320, 328, 336, red)
    # Lower truss
    poly([(184, 336), (328, 336), (360, 440), (152, 440)], red)
    # Base shadow
    rect(232, 440, 280, 452, dark)

    # Lattice lines on the towers
    for y in (240, 270, 300):
        ratio = (y - 214) / (320 - 214)
        x_left = 222 + (192 - 222) * ratio
        x_right = 290 + (320 - 290) * ratio
        draw.line([s(x_left, y), s(x_right, y)], fill=dark, width=max(2, int(3 * scale)))
    for y in (360, 390, 420):
        ratio = (y - 336) / (440 - 336)
        x_left = 184 + (152 - 184) * ratio
        x_right = 328 + (360 - 328) * ratio
        draw.line([s(x_left, y), s(x_right, y)], fill=dark, width=max(2, int(3 * scale)))


def make_icon(size, maskable=False):
    # Render at 2x then downscale for smoother edges
    R = size * 2
    bg = vertical_gradient(R, (26, 35, 50), (13, 17, 23))
    overlay = Image.new("RGBA", (R, R), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if maskable:
        # Tower confined to inner 50% safe zone
        tower_scale = (R / 512) * 0.5
        offset = R * 0.25
        draw_tower(draw, tower_scale, offset, offset)
        canvas = Image.alpha_composite(bg.convert("RGBA"), overlay)
        # No rounding for maskable — launcher applies its own mask
        out = canvas.resize((size, size), Image.LANCZOS)
    else:
        tower_scale = R / 512
        draw_tower(draw, tower_scale, 0, 0)
        canvas = Image.alpha_composite(bg.convert("RGBA"), overlay)
        # Rounded corners
        mask = rounded_mask(R, int(R * 96 / 512))
        rounded = Image.new("RGBA", (R, R), (0, 0, 0, 0))
        rounded.paste(canvas, (0, 0), mask)
        out = rounded.resize((size, size), Image.LANCZOS)
    return out


def main():
    for size in (192, 512):
        out = make_icon(size)
        out.save(ICONS / f"icon-{size}.png", "PNG")
        print(f"icon-{size}.png saved")

    maskable = make_icon(512, maskable=True)
    maskable.save(ICONS / "icon-maskable-512.png", "PNG")
    print("icon-maskable-512.png saved")

    # Apple touch icon — 180x180 is standard
    apple = make_icon(180)
    apple.save(ICONS / "apple-touch-icon.png", "PNG")
    print("apple-touch-icon.png saved")

    # Favicon
    favicon = make_icon(64)
    favicon.save(ICONS / "favicon.png", "PNG")
    print("favicon.png saved")


if __name__ == "__main__":
    main()
