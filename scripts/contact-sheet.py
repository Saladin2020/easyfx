"""Contact sheet of every effect: one frame strip per row, upscaled, on the teak checker.

  python3 scripts/contact-sheet.py <png-export-dir> <out.png> [scale=3]

Reads <dir>/easyfx.json (written by `easyfx export --preset png`) and <dir>/sheets/<id>.png.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
K = int(sys.argv[3]) if len(sys.argv) > 3 else 3
FONT_DIRS = ["/usr/share/fonts/truetype/sand-box/google/Kanit", os.path.join(os.path.dirname(__file__), "..", "assets", "fonts")]
def font(name, size):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

man = json.load(open(os.path.join(SRC, "easyfx.json")))
effects = man["effects"]
TEAK, CHECK, INK, CREAM, GOLD, MUTED = (46, 32, 20), (40, 28, 18), (26, 18, 11), (246, 231, 200), (244, 174, 61), (184, 160, 128)
LABEL_W, PAD, GAP = 300, 16, 4
rows = []
for e in effects:
    im = Image.open(os.path.join(SRC, e["sheet"])).convert("RGBA")
    rows.append((e, im))
max_frames_w = max(e["width"] * K * min(e["frames"], 16) + GAP * min(e["frames"], 16) for e, _ in rows)
W = LABEL_W + max_frames_w + PAD * 2
H = PAD * 2 + 70 + sum(e["height"] * K * ((e["frames"] + 15) // 16) + 14 + 8 for e, _ in rows)
sheet = Image.new("RGBA", (W, H), TEAK + (255,))
d = ImageDraw.Draw(sheet)
for y in range(0, H, 8):
    for x in range(0, W, 8):
        if (x // 8 + y // 8) % 2 == 0: d.rectangle([x, y, x + 7, y + 7], fill=CHECK)
d.text((PAD, PAD), "EASY FX", font=font("Kanit-SemiBold.ttf", 30), fill=CREAM)
d.text((PAD + 140, PAD + 8), f"{len(effects)} presets · every frame, ×{K} · ทุกเฟรม", font=font("Kanit-Regular.ttf", 18), fill=MUTED)
y = PAD + 70
for e, im in rows:
    fw, fh, n = e["width"], e["height"], e["frames"]
    d.text((PAD, y), e["id"], font=font("Kanit-Medium.ttf", 17), fill=GOLD)
    d.text((PAD, y + 22), e["th"], font=font("Kanit-Regular.ttf", 15), fill=CREAM)
    d.text((PAD, y + 42), f'{fw}×{fh} · {n}f · {e["fps"]}fps · {"loop" if e["loop"] else "once"}', font=font("Kanit-Regular.ttf", 13), fill=MUTED)
    for i in range(n):
        r = e["rects"][i]
        fr = im.crop((r["x"], r["y"], r["x"] + fw, r["y"] + fh)).resize((fw * K, fh * K), Image.NEAREST)
        cx = LABEL_W + (i % 16) * (fw * K + GAP)
        cy = y + (i // 16) * (fh * K + GAP)
        d.rectangle([cx - 1, cy - 1, cx + fw * K, cy + fh * K], outline=(60, 42, 27), fill=(22, 16, 12))
        sheet.alpha_composite(fr, (cx, cy))
    y += fh * K * ((n + 15) // 16) + GAP * ((n - 1) // 16) + 14 + 8
sheet.convert("RGB").save(OUT, optimize=True)
print(OUT, sheet.size)
