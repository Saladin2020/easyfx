import { describe, expect, it } from "vitest";
import { floodDepth, floodLine } from "../src/shared/flood.js";
import { PRESETS } from "../src/shared/presets.js";
// @ts-expect-error plain JS runtime
import { floodDepth as pixiDepth } from "../runtime/pixi/easyfx-pixi.js";

describe("flood geometry", () => {
  it("rises monotonically through the Easy NPC stages and matches the Pixi runtime", () => {
    let prev = -1;
    for (let l = 0; l <= 1.0001; l += 0.01) {
      const d = floodDepth(l);
      expect(d).toBeGreaterThanOrEqual(prev);
      expect(pixiDepth(l)).toBe(d);
      prev = d;
    }
    expect([0.1, 0.35, 0.5, 0.7, 1].map((l) => floodDepth(l))).toEqual([1, 4, 10, 18, 30]);
    expect(floodLine(0.6, 224)).toBe(210);
    expect(floodDepth(1, 60)).toBe(60);
  });
  it("ships a tileable flood_ripple overlay effect", () => {
    const p = PRESETS.find((x) => x.id === "flood_ripple");
    expect(p?.tags).toContain("tileable");
    expect(p?.params.loop).toBe(true);
  });
});
