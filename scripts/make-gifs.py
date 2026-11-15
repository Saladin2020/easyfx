"""Animated GIF previews from a PNG export, nearest-neighbour upscaled on a dark teak backdrop.

  python3 scripts/make-gifs.py <png-export-dir> <out-dir> [scale=6] id [id ...]
"""
import json, os, sys
from PIL import Image

SRC, OUT, K, IDS = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
BG = (20, 14, 10)
man = json.load(open(os.path.join(SRC, "easyfx.json")))
os.makedirs(OUT, exist_ok=True)
for fid in IDS:
    e = next(x for x in man["effects"] if x["id"] == fid)
    sheet = Image.open(os.path.join(SRC, "sheets", f"{fid}.png")).convert("RGBA")
    frames = []
    for r in e["rects"]:
        x, y, w, h = r["x"], r["y"], r["w"], r["h"]
        fr = sheet.crop((x, y, x + w, y + h))
        pad = Image.new("RGBA", (w + 8, h + 8), BG + (255,))
        pad.alpha_composite(fr, (4, 4))
        frames.append(pad.convert("RGB").resize(((w + 8) * K, (h + 8) * K), Image.NEAREST))
    ms = round(1000 / e["fps"])
    frames[0].save(os.path.join(OUT, f"{fid}.gif"), save_all=True, append_images=frames[1:], duration=ms,
                   loop=0, optimize=False, disposal=1)
    print(os.path.join(OUT, f"{fid}.gif"), len(frames), "frames @", e["fps"], "fps")
