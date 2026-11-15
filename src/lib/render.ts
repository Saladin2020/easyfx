import { packSheet, renderFx, upscale } from "../shared/sim.js";
import type { ResolvedEffect } from "../shared/types.js";
import { encodePng } from "./png.js";

/** Sheet PNG of one effect (strip by default, `cols` per row), nearest-neighbour upscaled. */
export function renderEffectPng(e: ResolvedEffect, opts: { scale?: number; cols?: number; frame?: number } = {}) {
  const r = renderFx(e.params);
  const k = Math.max(1, Math.min(8, Math.round(opts.scale ?? 1)));
  if (opts.frame !== undefined) {
    const f = r.frames[Math.max(0, Math.min(r.frames.length - 1, opts.frame))]!;
    return { png: encodePng(r.width * k, r.height * k, upscale(f, r.width, r.height, k)), width: r.width * k, height: r.height * k, frames: 1, fps: r.fps, loop: r.loop, anchor: r.anchor };
  }
  const s = packSheet(r, opts.cols ?? r.frames.length);
  return { png: encodePng(s.width * k, s.height * k, upscale(s.data, s.width, s.height, k)), width: s.width * k, height: s.height * k, frames: r.frames.length, fps: r.fps, loop: r.loop, anchor: r.anchor };
}
