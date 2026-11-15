import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS, presetById } from "../src/shared/presets.js";
import { anchorOf, hash2, hexToRgb, inkCount, mulberry32, packSheet, renderFx, upscale } from "../src/shared/sim.js";
import type { FxParams } from "../src/shared/types.js";
import { fnv1a } from "./helpers.js";

const GOLDEN = path.join(import.meta.dirname, "golden.json");
const hashOf = (p: FxParams) => {
  const r = renderFx(p);
  let h = 0x811c9dc5;
  for (const f of r.frames) h = parseInt(fnv1a(f, h), 16);
  return (h >>> 0).toString(16).padStart(8, "0");
};

describe("rng + colours", () => {
  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 200 }, () => a());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(hash2(1, 2)).not.toBe(hash2(2, 1));
  });
  it("parses hex colours", () => {
    expect(hexToRgb("#f4ae3d")).toEqual([244, 174, 61]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });
});

describe("renderFx", () => {
  it("same params + seed → identical pixels; another seed → different pixels", () => {
    const p = presetById("campfire")!.params;
    expect(hashOf(p)).toBe(hashOf(structuredClone(p)));
    expect(hashOf({ ...p, seed: p.seed + 1 })).not.toBe(hashOf(p));
  });

  it.each(PRESETS.map((p) => [p.id]))("%s renders every frame at the declared size with ink", (id) => {
    const p = presetById(id)!.params;
    const r = renderFx(p);
    expect(r.frames).toHaveLength(p.frames);
    expect(r.width).toBe(p.size);
    expect(r.height).toBe(p.height ?? p.size);
    for (const f of r.frames) expect(f.length).toBe(r.width * r.height * 4);
    const inked = r.frames.filter((f) => inkCount(f) > 0).length;
    // one-shots may end on empty frames; loops never go blank
    if (p.loop) expect(inked).toBe(p.frames);
    else expect(inked).toBeGreaterThanOrEqual(Math.ceil(p.frames * 0.6));
    const a = anchorOf(p);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
  });

  it("looping presets have no warm-up: frame 0 is as busy as the average frame", () => {
    for (const pr of PRESETS.filter((x) => x.params.loop)) {
      const r = renderFx(pr.params);
      const inks = r.frames.map(inkCount);
      const avg = inks.reduce((a, b) => a + b, 0) / inks.length;
      expect(inks[0], pr.id).toBeGreaterThan(avg * 0.5);
      expect(inks[0], pr.id).toBeLessThan(avg * 1.6);
    }
  });

  it("looping presets wrap seamlessly: last → first frame changes no more than any other step", () => {
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
      return n;
    };
    for (const pr of PRESETS.filter((x) => x.params.loop)) {
      const r = renderFx(pr.params);
      const steps = r.frames.slice(1).map((f, i) => diff(r.frames[i]!, f));
      const seam = diff(r.frames[r.frames.length - 1]!, r.frames[0]!);
      expect(seam, pr.id).toBeLessThanOrEqual(Math.max(...steps) * 1.25 + 4);
    }
  });

  it("bursts start at their delay", () => {
    const p = presetById("raya_fireworks")!.params;
    const only = { ...p, layers: [p.layers[1]!] };
    const r = renderFx(only);
    expect(inkCount(r.frames[7]!)).toBe(0);
    expect(inkCount(r.frames[9]!)).toBeGreaterThan(0);
  });

  it("packs a strip and upscales with nearest neighbour", () => {
    const r = renderFx(presetById("hit_sparks")!.params);
    const s = packSheet(r);
    expect([s.width, s.height]).toEqual([32 * 8, 32]);
    expect(s.rects[3]).toEqual({ x: 96, y: 0, w: 32, h: 32 });
    const g = packSheet(r, 3);
    expect([g.width, g.height]).toEqual([96, 96]);
    const up = upscale(s.data, s.width, s.height, 2);
    expect(up.length).toBe(s.data.length * 4);
  });

  it("matches the golden pixel hashes (UPDATE_GOLDEN=1 to refresh after an intended change)", () => {
    const now = Object.fromEntries(PRESETS.map((p) => [p.id, hashOf(p.params)]));
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, `${JSON.stringify(now, null, 2)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string>;
    expect(now).toEqual(golden);
  });
});
