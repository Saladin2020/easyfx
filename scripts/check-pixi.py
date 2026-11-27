"""Headless Chrome check of a PixiJS export: no console errors, every sheet loads, every effect animates.

  python3 scripts/check-pixi.py <pixi-export-dir> [screenshot.png]

Serves the folder on 127.0.0.1:8989, waits for window.__ready, compares every AnimatedSprite with the
manifest (frame count, anchor, loop), lets them play, clicks the canvas to spawn a one-shot coin_burst
and checks it removes itself. Prints a JSON report; exit 1 on any failure.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

DIR = sys.argv[1]
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
PORT = 8989
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)


async def main():
    man = json.load(open(os.path.join(DIR, "easyfx.json")))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1300, "height": 900})
        errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        # the page probes ./pixi.min.js before the CDN — that 404 is expected
        pg.on("response", lambda r: errs.append(f"http {r.status}: {r.url}") if r.status >= 400 and not r.url.endswith("/pixi.min.js") else None)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        await pg.wait_for_function("window.__ready === true", timeout=40000)
        snap = """() => Object.fromEntries(Object.entries(window.__fx.sprites).map(([id, s]) => [id, { total: s.totalFrames, frame: s.currentFrame, playing: s.playing, loop: s.loop, ax: +s.anchor.x.toFixed(3), ay: +s.anchor.y.toFixed(3), destroyed: s.destroyed }]))"""
        first = await pg.evaluate(snap)
        # two samples at odd offsets: a single wait can land on a whole loop (8 frames @ 12 fps = 667 ms)
        await pg.wait_for_timeout(230)
        mid = await pg.evaluate(snap)
        await pg.wait_for_timeout(470)
        second = await pg.evaluate(snap)
        box = await pg.locator("canvas").bounding_box()
        await pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await pg.wait_for_timeout(100)
        spawned_alive = await pg.evaluate("window.__fx.spawned.filter((s) => !s.destroyed).length")
        await pg.wait_for_timeout(2000)
        spawned_after = await pg.evaluate("window.__fx.spawned.filter((s) => !s.destroyed).length")
        textures = await pg.evaluate("window.__fx.textures")
        # town life overlays: lighting (multiply tint + veil + lamp glows) and flood water
        overlays = await pg.evaluate("""() => {
          const { fx, app } = window.__fx;
          const l = fx.lighting(app.stage, { width: 320, height: 180 }).set({ tint: [250, 140, 100], dark: 0.2, lamps: 0.5 }).setLamps([{ x: 40, y: 60 }, { x: 120, y: 60 }]);
          const f = fx.flood(app.stage, { width: 320, height: 180, ground: 150 }).setLevel(0.7);
          const r = { light: l.state(), surface: f.surface(), ripples: f.children[1].children.length };
          l.destroy({ children: true }); f.destroy({ children: true });
          return r;
        }""")
        if SHOT:
            await pg.locator("canvas").screenshot(path=SHOT)
        problems = []
        for e in man["effects"]:
            s1, s2 = first.get(e["id"]), second.get(e["id"])
            if not s1:
                problems.append(f"{e['id']}: no sprite")
                continue
            if s1["total"] != e["frames"]:
                problems.append(f"{e['id']}: {s1['total']} frames, manifest {e['frames']}")
            if abs(s1["ax"] - e["anchor"]["x"] / e["width"]) > 0.01 or abs(s1["ay"] - e["anchor"]["y"] / e["height"]) > 0.01:
                problems.append(f"{e['id']}: anchor {s1['ax']},{s1['ay']}")
            sm = mid.get(e["id"], s1)
            if e["frames"] > 1 and s1["frame"] == s2["frame"] == sm["frame"] and s2["playing"]:
                problems.append(f"{e['id']}: not animating")
        if textures != sum(e["frames"] for e in man["effects"]):
            problems.append(f"textures {textures} != frames {sum(e['frames'] for e in man['effects'])}")
        if spawned_alive != 1 or spawned_after != 0:
            problems.append(f"one-shot spawn alive={spawned_alive} after={spawned_after} (want 1 then 0)")
        if overlays["light"]["lampCount"] != 2 or abs(overlays["light"]["dark"] - 0.2) > 1e-6 or overlays["surface"] != 132 or (("flood_ripple" in [e["id"] for e in man["effects"]]) and overlays["ripples"] < 6):
            problems.append(f"overlays {overlays}")
        real = [e for e in errs if "GL Driver Message" not in e and "Failed to load resource" not in e]
        report = {"overlays": overlays, "effects": len(first), "textures": textures, "problems": problems, "errors": real, "spawned": [spawned_alive, spawned_after]}
        print(json.dumps(report, ensure_ascii=False))
        await b.close()
        if problems or real:
            sys.exit(1)


try:
    asyncio.run(main())
finally:
    srv.terminate()
