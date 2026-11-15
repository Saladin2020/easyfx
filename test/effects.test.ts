import { describe, expect, it } from "vitest";
import { applySet, parseSet, presetEffect, resolveDoc, validateParams, withOverrides } from "../src/shared/effects.js";
import { PRESETS, presetById } from "../src/shared/presets.js";
import type { ParticleLayer } from "../src/shared/types.js";

describe("preset library", () => {
  it("has 25+ unique presets with Thai + English names", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(p.th.length, p.id).toBeGreaterThan(0);
      expect(p.en.length, p.id).toBeGreaterThan(0);
    }
  });

  it("every preset validates and has a particle layer with the core params + seed", () => {
    for (const p of PRESETS) {
      const v = validateParams(p.params);
      expect(v.errors, p.id).toEqual([]);
      expect(v.warnings, p.id).toEqual([]);
      expect(Number.isInteger(p.params.seed), p.id).toBe(true);
      const l = p.params.layers.find((x) => (x.kind ?? "particles") === "particles") as ParticleLayer;
      expect(l, p.id).toBeTruthy();
      for (const k of ["ramp", "count", "lifetime", "speed", "gravity", "spread", "sizeStart"] as const) expect(l[k], `${p.id}.${k}`).not.toBeUndefined();
      expect(p.params.frames).toBeGreaterThan(0);
      expect(p.params.size).toBeGreaterThan(0);
    }
  });

  it("covers the requested library and the festival set", () => {
    const want = ["hit_sparks", "dust_puff", "footstep_dust", "slash_arc", "explosion_small", "explosion_big", "smoke", "torch_fire", "campfire", "water_splash", "rain", "falling_leaves", "fireflies", "sparkle_shine", "coin_burst", "heal_plus", "level_up", "magic_swirl", "confetti", "steam", "lantern_glow", "khom_loi", "krathong_glow", "songkran_splash", "pelita_flicker", "raya_fireworks", "incense_smoke"];
    for (const id of want) expect(presetById(id), id).toBeTruthy();
    const tags = (t: string) => PRESETS.filter((p) => p.tags.includes(t)).map((p) => p.id);
    expect(tags("raya")).toEqual(expect.arrayContaining(["pelita_flicker", "raya_fireworks"]));
    expect(tags("loy_krathong")).toEqual(expect.arrayContaining(["khom_loi", "krathong_glow"]));
    expect(tags("songkran")).toContain("songkran_splash");
  });
});

describe("validation", () => {
  it("reports JSON paths", () => {
    const p = structuredClone(presetById("rain")!.params) as unknown as Record<string, unknown>;
    p.frames = 0;
    (p.layers as Array<Record<string, unknown>>)[0]!.shape = "dragon";
    (p.layers as Array<Record<string, unknown>>)[0]!.ramp = ["#zzz"];
    const v = validateParams(p);
    const paths = v.errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["params.frames", "params.layers[0].shape", "params.layers[0].ramp[0]"]));
  });
  it("rejects a non-object and missing layers", () => {
    expect(validateParams(null).errors[0]!.path).toBe("params");
    expect(validateParams({ size: 32, frames: 4, fps: 10, loop: true, seed: 1, layers: [] }).errors[0]!.path).toBe("params.layers");
  });
});

describe("overrides", () => {
  it("parses --set values", () => {
    expect(parseSet("count=20")).toEqual(["count", 20]);
    expect(parseSet("loop=false")).toEqual(["loop", false]);
    expect(parseSet("1.ramp=#fff,#f4ae3d")).toEqual(["1.ramp", ["#fff", "#f4ae3d"]]);
    expect(parseSet('0.ramp=["#000"]')).toEqual(["0.ramp", ["#000"]]);
    expect(() => parseSet("nope")).toThrow(/key=value/);
  });
  it("applies top-level, first particle layer, indexed, nested and wildcard keys", () => {
    const p = structuredClone(presetById("torch_fire")!.params);
    applySet(p, "seed", 5);
    applySet(p, "count", 40);
    applySet(p, "3.speed", 2);
    applySet(p, "2.emitter.x", 0.25);
    applySet(p, "*.gravity", 0);
    expect(p.seed).toBe(5);
    expect((p.layers[2] as ParticleLayer).count).toBe(40); // first particle layer (after glow + prop)
    expect((p.layers[3] as ParticleLayer).speed).toBe(2);
    expect((p.layers[2] as ParticleLayer).emitter.x).toBe(0.25);
    expect((p.layers[3] as ParticleLayer).gravity).toBe(0);
    expect(() => applySet(p, "9.count", 1)).toThrow(/no layer 9/);
  });
  it("withOverrides validates the result", () => {
    expect(() => withOverrides(presetEffect("smoke")!, [["count", -1]])).toThrow(/count/);
    expect(withOverrides(presetEffect("smoke")!, [["count", 3]]).params.layers[0]).toMatchObject({ count: 3 });
  });
});

describe("workspace docs", () => {
  it("resolves base + set, keeping preset names", () => {
    const r = resolveDoc("blue", { format: "easyfx/1", base: "coin_burst", set: { seed: 9, "0.ramp": ["#e4f6fb", "#7cc8e8", "#2c6aa8"] } });
    expect(r.errors).toEqual([]);
    expect(r.effect!.params.seed).toBe(9);
    expect(r.effect!.th).toBe(presetById("coin_burst")!.th);
    expect(r.effect!.source).toBe("workspace");
  });
  it("rejects unknown base, wrong format and bad set paths", () => {
    expect(resolveDoc("x", { format: "easyfx/1", base: "nope" }).errors[0]!.path).toBe("base");
    expect(resolveDoc("x", { format: "x", base: "rain" }).errors[0]!.path).toBe("format");
    expect(resolveDoc("x", { format: "easyfx/1", base: "rain", set: { "7.count": 1 } }).errors[0]!.path).toBe("set.7.count");
  });
});
