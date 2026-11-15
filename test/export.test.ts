import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bake, exportFx, godotSpriteFrames, particleTexture, pixiSheetJson } from "../src/lib/export.js";
import { decodePng, encodePng } from "../src/lib/png.js";
import { presetEffect } from "../src/shared/effects.js";
import { PRESETS } from "../src/shared/presets.js";
import { renderFx } from "../src/shared/sim.js";
import type { ParticleLayer } from "../src/shared/types.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup());

describe("png", () => {
  it("round-trips RGBA", () => {
    const px = new Uint8Array(3 * 2 * 4).map((_, i) => (i * 37) & 255);
    const d = decodePng(encodePng(3, 2, px));
    expect([d.width, d.height]).toEqual([3, 2]);
    expect([...d.data]).toEqual([...px]);
  });
});

describe("formats", () => {
  it("pixi sheet JSON has one frame per animation step, anchored at the effect origin", () => {
    const b = bake(presetEffect("coin_burst")!);
    const j = pixiSheetJson(b, "coin_burst.png");
    expect(Object.keys(j.frames)).toHaveLength(16);
    expect(j.animations.coin_burst).toHaveLength(16);
    const f0 = j.frames["coin_burst-00"]!;
    expect(f0.frame).toEqual({ x: 0, y: 0, w: 48, h: 48 });
    expect(f0.anchor).toEqual({ x: 0.5, y: b.r.anchor.y / 48 });
    expect(j.meta.size).toEqual({ w: 48 * 16, h: 48 });
  });

  it("Godot SpriteFrames lists every AtlasTexture region with fps and loop", () => {
    const b = bake(presetEffect("campfire")!);
    const t = godotSpriteFrames(b);
    expect(t.match(/type="AtlasTexture"/g)).toHaveLength(12);
    expect(t).toContain("region = Rect2(528, 0, 48, 48)");
    expect(t).toMatch(/"loop": true,\n"name": &"default",\n"speed": 12/);
  });

  it("wide effects wrap into rows under 2048 px", () => {
    const b = bake(presetEffect("khom_loi")!);
    expect(b.sheetW).toBeLessThanOrEqual(2048);
    expect(b.rects).toHaveLength(32);
  });

  it("particle textures are white unless the shape has fixed colour roles", () => {
    const pl = PRESETS.find((p) => p.id === "heal_plus")!.params.layers[0] as ParticleLayer;
    const t = decodePng(particleTexture(pl).png);
    const ink = [...t.data].filter((_, i) => i % 4 === 3 && t.data[i]! > 0).length;
    expect(ink).toBeGreaterThan(4);
    for (let i = 0; i < t.data.length; i += 4) if (t.data[i + 3]) expect([t.data[i], t.data[i + 1], t.data[i + 2]]).toEqual([255, 255, 255]);
  });
});

describe("exportFx", () => {
  it("writes godot, pixi, png and json for every effect", async () => {
    const res = await exportFx(root, { preset: "all" });
    expect(res.dirs).toHaveLength(4);
    expect(res.effects.length).toBe(PRESETS.length + 3);
    const ex = path.join(root, "exports");
    for (const f of ["easyfx-godot/project.godot", "easyfx-godot/main.tscn", "easyfx-godot/particles.tscn", "easyfx-godot/test_fx.gd", "easyfx-godot/easyfx/easyfx_effect.gd", "easyfx-godot/easyfx/easyfx.gd", "easyfx-pixi/index.html", "easyfx-pixi/easyfx-pixi.js", "easyfx-png/easyfx.json", "easyfx-json/effects/torch_spirit.json"]) {
      expect(existsSync(path.join(ex, f)), f).toBe(true);
    }
    const pman = JSON.parse(await readFile(path.join(ex, "easyfx-pixi", "easyfx.json"), "utf8"));
    expect(pman.effects.find((e: { id: string }) => e.id === "pelita_flicker")).toMatchObject({ width: 24, height: 40, frames: 12, loop: true, sheet: "sheets/pelita_flicker.json" });
    // the PNG sheet holds exactly the rendered frames
    const sheet = decodePng(await readFile(path.join(ex, "easyfx-png", "sheets", "slash_arc.png")));
    const r = renderFx(presetEffect("slash_arc")!.params);
    const f2 = r.frames[2]!;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) for (let c = 0; c < 4; c++) if (sheet.data[(y * sheet.width + 96 + x) * 4 + c] !== f2[(y * 48 + x) * 4 + c]) throw new Error(`pixel ${x},${y} differs`);
    const ps = await readFile(path.join(ex, "easyfx-godot", "easyfx", "particles", "explosion_big.tscn"), "utf8");
    expect(ps.match(/type="CPUParticles2D"/g)).toHaveLength(5);
    expect(ps).toContain("one_shot = true");
    const confetti = await readFile(path.join(ex, "easyfx-godot", "easyfx", "particles", "confetti.tscn"), "utf8");
    expect(confetti).toContain("color_initial_ramp");
  });

  it("filters by tag and ids, and refuses paths outside the workspace", async () => {
    const res = await exportFx(root, { preset: "json", tags: ["raya"] });
    expect(res.effects.sort()).toEqual(["pelita_flicker", "raya_fireworks", "raya_fireworks_gold"]);
    const one = await exportFx(root, { preset: "png", ids: ["rain"], out: "exports/just-rain" });
    expect(one.effects).toEqual(["rain"]);
    await expect(exportFx(root, { preset: "png", out: "../../outside" })).rejects.toThrow(/outside the workspace/);
    await expect(exportFx(root, { preset: "all", out: "exports/x" })).rejects.toThrow(/single preset/);
  });
});
