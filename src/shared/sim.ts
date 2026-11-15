/**
 * Deterministic pixel particle renderer. Pure TypeScript (no DOM, no Node APIs) so the CLI, the MCP server,
 * the tests and the web editor all draw the exact same pixels from the same params + seed.
 *
 * Looping "stream" layers spread their spawns over the loop and wrap ages modulo the frame count, so frame
 * N-1 flows into frame 0 with no seam. "burst" layers start at `delay` and play once.
 */
import { PROP_PAL, STAMPS } from "./props.js";
import type { ArcLayer, FxParams, GlowLayer, Layer, ParticleLayer, PropLayer } from "./types.js";

export interface RenderedFx {
  width: number;
  height: number;
  fps: number;
  loop: boolean;
  /** One straight-alpha RGBA buffer per frame. */
  frames: Uint8ClampedArray[];
  /** Effect origin in px inside a frame. */
  anchor: { x: number; y: number };
}

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!/^[0-9a-fA-F]{6}$/.test(h.slice(0, 6)) || Number.isNaN(n)) return [255, 0, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** mulberry32: tiny, fast, identical on every JS engine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayer = (x: number, y: number) => (BAYER[y & 3]![x & 3]! + 0.5) / 16;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const DEG = Math.PI / 180;

/** One layer's pixels before compositing: 0 = empty, else 0xff000000 | rgb. */
class LayerBuf {
  readonly px: Uint32Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint32Array(w * h);
  }
  set(x: number, y: number, c: RGB) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = (0xff000000 | (c[0] << 16) | (c[1] << 8) | c[2]) >>> 0;
  }
}

function composite(dst: Uint8ClampedArray, buf: LayerBuf, alpha: number, outline?: RGB) {
  const { w, h, px } = buf;
  const put = (i: number, r: number, g: number, b: number) => {
    const o = i * 4;
    const sa = alpha;
    const da = dst[o + 3]! / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    dst[o] = (r * sa + dst[o]! * da * (1 - sa)) / oa;
    dst[o + 1] = (g * sa + dst[o + 1]! * da * (1 - sa)) / oa;
    dst[o + 2] = (b * sa + dst[o + 2]! * da * (1 - sa)) / oa;
    dst[o + 3] = oa * 255;
  };
  if (outline) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (px[i]) continue;
        const n = (x > 0 && px[i - 1]) || (x < w - 1 && px[i + 1]) || (y > 0 && px[i - w]) || (y < h - 1 && px[i + w]);
        if (n) put(i, outline[0], outline[1], outline[2]);
      }
    }
  }
  for (let i = 0; i < px.length; i++) {
    const c = px[i]!;
    if (c) put(i, (c >>> 16) & 255, (c >>> 8) & 255, c & 255);
  }
}

interface Particle {
  t0: number;
  life: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  phase: number;
  spin0: number;
  pick: number;
  blink: number;
}

function spawnParticles(L: ParticleLayer, p: FxParams, W: number, H: number, rnd: () => number): Particle[] {
  const out: Particle[] = [];
  const F = p.frames;
  const e = L.emitter;
  const cx = e.x * W;
  const cy = e.y * H;
  for (let i = 0; i < L.count; i++) {
    const t0 = L.emit === "stream" ? ((i + rnd()) * F) / L.count : (L.delay ?? 0) + rnd() * (L.delayJitter ?? 0);
    const life = Math.max(1, L.lifetime * (1 - (L.lifeJitter ?? 0) * rnd()));
    let x0 = cx;
    let y0 = cy;
    let out_a: number | null = null;
    if (e.shape === "line") x0 += (rnd() - 0.5) * (e.w ?? 0);
    else if (e.shape === "rect") {
      x0 += (rnd() - 0.5) * (e.w ?? 0);
      y0 += (rnd() - 0.5) * (e.h ?? 0);
    } else if (e.shape === "circle" || e.shape === "ring") {
      const a = rnd() * Math.PI * 2;
      const r = (e.r ?? 0) * (e.shape === "ring" ? 1 : Math.sqrt(rnd()));
      x0 += Math.cos(a) * r;
      y0 += Math.sin(a) * r;
      if (e.radial) out_a = a;
    }
    const dir = out_a ?? (L.angle + (rnd() - 0.5) * L.spread) * DEG;
    const sp = L.speed * (1 - (L.speedJitter ?? 0) * rnd());
    out.push({ t0, life, x0, y0, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, phase: rnd() * Math.PI * 2, spin0: rnd() * 4, pick: rnd(), blink: 1 + Math.floor(rnd() * 3) });
  }
  return out;
}

/** Closed-form motion: constant acceleration with exponential drag. */
function motion(v0: number, acc: number, c: number, a: number): [number, number] {
  if (c <= 1e-9) return [v0 * a + 0.5 * acc * a * a, v0 + acc * a];
  const term = acc / c;
  const e = Math.exp(-c * a);
  return [term * a + ((v0 - term) * (1 - e)) / c, term + (v0 - term) * e];
}

function particleAt(L: ParticleLayer, q: Particle, age: number, W: number, H: number, frames: number) {
  const c = L.drag ? -Math.log(1 - Math.min(0.95, L.drag)) : 0;
  const ax = L.wind ?? 0;
  const ay = L.gravity;
  let [dx, vx] = motion(q.vx, ax, c, age);
  let [dy, vy] = motion(q.vy, ay, c, age);
  if (L.floor !== undefined) {
    const fy = L.floor * H - q.y0;
    if (dy > fy) {
      // bisection for the landing time; the particle stops there
      let lo = 0;
      let hi = age;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        if (motion(q.vy, ay, c, mid)[0] > fy) hi = mid;
        else lo = mid;
      }
      dx = motion(q.vx, ax, c, lo)[0];
      dy = fy;
      vx = 0;
      vy = 0;
    }
  }
  let x = q.x0 + dx;
  let y = q.y0 + dy;
  if (L.swirl) {
    const ox = L.emitter.x * W;
    const oy = L.emitter.y * H;
    const a = L.swirl * age * DEG;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx = x - ox;
    const ry = y - oy;
    x = ox + rx * ca - ry * sa;
    y = oy + rx * sa + ry * ca;
    const tvx = vx * ca - vy * sa;
    vy = vx * sa + vy * ca;
    vx = tvx;
  }
  if (L.wobble) {
    if (L.wobbleShared) {
      const F = frames;
      const t = age / q.life;
      x += L.wobble * t * Math.sin(2 * Math.PI * (L.wobbleFreq ?? 1) * t - (2 * Math.PI * (q.t0 + age)) / F);
    } else x += L.wobble * Math.sin(q.phase + (2 * Math.PI * (L.wobbleFreq ?? 1) * age) / q.life);
  }
  return { x, y, vx, vy };
}

const LEAF = [
  ["##.", ".##"],
  [".#", "##", "#."],
  [".##", "##."],
  ["#.", "##", ".#"],
];
const PETAL = [["##", "#."], ["##", ".#"], [".#", "##"], ["#.", "##"]];

function shade(c: RGB, f: number): RGB {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)].map(Math.round) as RGB;
}

function drawShape(buf: LayerBuf, L: ParticleLayer, ramp: RGB[], idx: number, x: number, y: number, s: number, vx: number, vy: number, spin: number, ok: (px: number, py: number) => boolean) {
  const c = ramp[idx]!;
  const c2 = ramp[Math.min(ramp.length - 1, idx + 1)]!;
  const put = (px: number, py: number, col: RGB) => {
    px = Math.floor(px);
    py = Math.floor(py);
    if (ok(px, py)) buf.set(px, py, col);
  };
  const ix = Math.round(x);
  const iy = Math.round(y);
  const phase = ((Math.floor(spin) % 4) + 4) % 4;
  switch (L.shape) {
    case "pixel":
      put(ix, iy, c);
      return;
    case "square": {
      const o = Math.floor(s / 2);
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) put(ix - o + i, iy - o + j, c);
      return;
    }
    case "disc": {
      const r2 = (s / 2) ** 2 - (s >= 3 ? 0.3 : -0.5);
      const x0 = Math.round(x - s / 2);
      const y0 = Math.round(y - s / 2);
      for (let j = 0; j < s; j++)
        for (let i = 0; i < s; i++) {
          const dx = i + 0.5 - s / 2;
          const dy = j + 0.5 - s / 2;
          if (dx * dx + dy * dy <= r2) put(x0 + i, y0 + j, s >= 4 && dx + dy > s / 4 ? c2 : c);
        }
      return;
    }
    case "plus": {
      const a = Math.max(1, Math.floor(s / 2));
      const t = s >= 7 ? 1 : 0;
      for (let k = -a; k <= a; k++)
        for (let w = -t; w <= t; w++) {
          put(ix + k, iy + w, c);
          put(ix + w, iy + k, c);
        }
      return;
    }
    case "star": {
      const a = Math.max(1, Math.floor(s / 2));
      put(ix, iy, c);
      for (let k = 1; k <= a; k++) {
        const col = k === a && a > 1 ? c2 : c;
        put(ix + k, iy, col);
        put(ix - k, iy, col);
        put(ix, iy + k, col);
        put(ix, iy - k, col);
      }
      if (s >= 5) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) put(ix + dx, iy + dy, c2);
      return;
    }
    case "glint":
      put(ix, iy, c);
      if (s >= 2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) put(ix + dx, iy + dy, c2);
      if (s >= 3) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) put(ix + dx, iy + dy, c2);
      return;
    case "spark": {
      const m = Math.hypot(vx, vy);
      const ux = m > 1e-6 ? vx / m : 0;
      const uy = m > 1e-6 ? vy / m : 1;
      for (let k = 0; k < Math.max(1, s); k++) put(x - ux * k, y - uy * k, k < Math.ceil(s / 2) ? c : c2);
      return;
    }
    case "ring": {
      const R = s;
      if (R <= 0) return put(ix, iy, c);
      for (let j = -R - 1; j <= R + 1; j++)
        for (let i = -R - 1; i <= R + 1; i++) {
          const d = Math.hypot(i, j);
          if (Math.abs(d - R) < 0.55) put(ix + i, iy + j, c);
          else if (R >= 6 && Math.abs(d - (R - 1)) < 0.5) put(ix + i, iy + j, c2);
        }
      return;
    }
    case "leaf":
    case "petal": {
      const pat = (L.shape === "leaf" ? LEAF : PETAL)[phase]!;
      const sc = Math.max(1, Math.round(s / 2));
      pat.forEach((row, j) =>
        [...row].forEach((ch, i) => {
          if (ch !== "#") return;
          for (let b = 0; b < sc; b++) for (let a = 0; a < sc; a++) put(ix + i * sc + a - sc, iy + j * sc + b - sc, j === 0 && i === 0 ? c2 : c);
        }),
      );
      return;
    }
    case "confetti": {
      const long = Math.max(1, s);
      const short = Math.max(1, Math.floor(s / 2));
      const [w, h] = [[long, short], [short, short], [short, long], [short, short]][phase]!;
      const col = phase % 2 ? shade(c, 0.72) : c;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(ix + i - (w >> 1), iy + j - (h >> 1), col);
      return;
    }
    case "coin": {
      // fixed roles: ramp[0] highlight, ramp[1] face, ramp[2] rim
      const hi = ramp[0]!;
      const face = ramp[Math.min(1, ramp.length - 1)]!;
      const rim = ramp[Math.min(2, ramp.length - 1)]!;
      const S = Math.max(2, s);
      const w = [S, Math.max(1, Math.ceil(S * 0.6)), 1, Math.max(1, Math.ceil(S * 0.6))][phase]!;
      const x0 = ix - (w >> 1);
      const y0 = iy - (S >> 1);
      for (let j = 0; j < S; j++)
        for (let i = 0; i < w; i++) {
          const corner = w >= 3 && S >= 3 && (i === 0 || i === w - 1) && (j === 0 || j === S - 1);
          if (corner) continue;
          const edge = i === 0 || i === w - 1 || j === 0 || j === S - 1;
          put(x0 + i, y0 + j, w === 1 ? rim : edge ? rim : i === 1 && j === 1 ? hi : face);
        }
      return;
    }
    case "drop": {
      const hi = ramp[0]!;
      const body = ramp[Math.min(1, ramp.length - 1)]!;
      if (s <= 2) {
        put(ix, iy - 1, hi);
        put(ix, iy, body);
      } else {
        put(ix, iy - 2, body);
        put(ix, iy - 1, hi);
        put(ix - 1, iy - 1, body);
        put(ix + 1, iy - 1, body);
        put(ix - 1, iy, body);
        put(ix, iy, body);
        put(ix + 1, iy, body);
      }
      return;
    }
    case "lantern": {
      // fixed roles: ramp[0] flame, ramp[1] paper, ramp[2] rim
      const fl = ramp[0]!;
      const pa = ramp[Math.min(1, ramp.length - 1)]!;
      const ri = ramp[Math.min(2, ramp.length - 1)]!;
      const rows = s <= 3 ? ["RRR", "RPR", ".F."] : s === 4 ? [".RR.", "RPPR", "RPPR", ".FF."] : [".RRR.", "RPPPR", "RPPPR", "RPPPR", ".RFR."];
      const w = rows[0]!.length;
      rows.forEach((row, j) =>
        [...row].forEach((ch, i) => {
          if (ch !== ".") put(ix + i - (w >> 1), iy + j - rows.length + 1, ch === "F" ? fl : ch === "P" ? pa : ri);
        }),
      );
      return;
    }
  }
}

function drawParticles(buf: LayerBuf, L: ParticleLayer, p: FxParams, f: number, W: number, H: number, parts: Particle[]) {
  const ramp = (L.ramp.length ? L.ramp : ["#ffffff"]).map(hexToRgb);
  const F = p.frames;
  const n = ramp.length;
  const fade = L.fade ?? 1;
  const fadeIn = L.fadeIn ?? 0;
  const s0 = L.sizeStart;
  const s1 = L.sizeEnd ?? L.sizeStart;
  // oldest first, so fresh (bright) particles sit on top: flame cores, new smoke puffs, fresh sparks
  const draws: Array<[Particle, number]> = [];
  for (const q of parts) {
    if (L.emit === "stream") {
      for (let a = (((f - q.t0) % F) + F) % F; a < q.life; a += F) draws.push([q, a]);
    } else {
      const a = f - q.t0;
      if (a >= 0 && a < q.life) draws.push([q, a]);
    }
  }
  draws.sort((a, b) => b[1] / b[0].life - a[1] / a[0].life);
  {
    for (const [q, age] of draws) {
      const t = age / q.life;
      if (L.flicker && (Math.sin(q.phase * 7 + (2 * Math.PI * q.blink * f) / F) + 1) / 2 < L.flicker) continue;
      const st = L.sizeMode === "pulse" ? s0 + (s1 - s0) * Math.sin(Math.PI * t) : s0 + (s1 - s0) * t;
      const s = Math.round(st);
      if (s < 1 && L.shape !== "ring") continue;
      const idx = L.rampMode === "random" ? Math.min(n - 1, Math.floor(q.pick * n)) : Math.min(n - 1, Math.floor(t * n));
      const th = t > fade ? (t - fade) / Math.max(1e-6, 1 - fade) : fadeIn > 0 && t < fadeIn ? 1 - t / fadeIn : 0;
      const ok = th <= 0 ? () => true : (px: number, py: number) => bayer(px, py) >= th;
      const m = particleAt(L, q, age, W, H, F);
      const spin = q.spin0 + age * (L.spin ?? 0.25);
      drawShape(buf, L, ramp, idx, m.x, m.y, s, m.vx, m.vy, spin, ok);
    }
  }
}

function drawGlow(buf: LayerBuf, L: GlowLayer, p: FxParams, f: number, W: number, H: number) {
  const ramp = L.ramp.map(hexToRgb);
  const n = ramp.length;
  if (!n) return;
  const cx = L.x * W;
  const cy = L.y * H;
  const jitter = L.flicker ? (mulberry32(hash2(p.seed, f * 31 + 7))() - 0.5) * L.flicker * 0.5 : 0;
  const R = Math.max(0.5, L.radius * (1 + (L.pulse ?? 0) * Math.sin((2 * Math.PI * (L.cycles ?? 1) * f) / p.frames) + jitter));
  const r = Math.ceil(R) + 1;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
      if (d >= 1) continue;
      // ordered-dither density falls off towards the rim: solid core, sparse pixel halo
      if (d > 0.35 && bayer(x, y) < (d - 0.35) / 0.65) continue;
      const band = Math.min(n - 1, Math.max(0, Math.floor(d * n + (bayer(x + 2, y + 1) - 0.5) * 0.8)));
      buf.set(x, y, ramp[band]!);
    }
}

function drawArc(buf: LayerBuf, L: ArcLayer, f: number, W: number, H: number) {
  const ramp = L.ramp.map(hexToRgb);
  const n = ramp.length;
  const ff = f - (L.delay ?? 0);
  if (ff < 0 || !n) return;
  const span = Math.abs(L.to - L.from);
  const dir = Math.sign(L.to - L.from) || 1;
  const headU = span * easeOut(clamp01((ff + 1) / L.sweep));
  const tailU = span * easeOut(clamp01((ff + 1 - (L.lag ?? 2)) / L.sweep));
  if (headU - tailU < 1) return;
  const cx = L.x * W;
  const cy = L.y * H;
  const R = L.radius;
  for (let y = Math.floor(cy - R - 1); y <= Math.ceil(cy + R + 1); y++)
    for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const ang = Math.atan2(dy, dx) / DEG;
      const u = ((((ang - L.from) * dir) % 360) + 360) % 360;
      if (u < tailU || u > headU) continue;
      const w = (u - tailU) / (headU - tailU);
      const thick = L.thickness * Math.pow(Math.sin(Math.PI * Math.min(1, w * 0.85 + 0.15)), 0.8);
      if (thick < 0.6 || d < R - thick) continue;
      const band = Math.min(n - 1, Math.floor(((R - d) / Math.max(1, thick)) * n));
      buf.set(x, y, ramp[band]!);
    }
}

function drawProp(buf: LayerBuf, L: PropLayer, p: FxParams, f: number, W: number, H: number) {
  const ax = L.x * W;
  const ay = L.y * H;
  const bob = L.bob ? Math.round(L.bob * Math.sin((2 * Math.PI * f) / p.frames)) : 0;
  if (L.prop === "ripples") {
    const cols = ["#7cc8e8", "#4f8ac8", "#2c6aa8"].map(hexToRgb);
    const shift = (f / p.frames) * 8;
    for (let row = 0; row < 3; row++) {
      const y = Math.round(ay - 4 + row * 2);
      const off = (row % 2 ? -shift : shift) + row * 3;
      for (let x = 0; x < W; x++) {
        const k = (((x + off) % 8) + 8) % 8;
        if (k < (row === 1 ? 4 : 3)) buf.set(x, y, cols[row]!);
      }
    }
    return;
  }
  const st = STAMPS[L.prop];
  const w = st.rows[0]!.length;
  const h = st.rows.length;
  const x0 = Math.round(ax - w / 2);
  const y0 = Math.round(ay - h) + bob;
  st.rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const hex = PROP_PAL[ch];
      if (hex) buf.set(x0 + i, y0 + j, hexToRgb(hex));
    }),
  );
}

export function frameSize(p: FxParams): { width: number; height: number } {
  return { width: p.size, height: p.height ?? p.size };
}

export function anchorOf(p: FxParams): { x: number; y: number } {
  const { width: W, height: H } = frameSize(p);
  let a = p.anchor;
  if (!a) {
    const first = p.layers.find((l) => (l.kind ?? "particles") === "particles") as ParticleLayer | undefined;
    if (first) a = { x: first.emitter.x, y: first.emitter.y };
    else {
      const l = p.layers[0] as GlowLayer | ArcLayer | PropLayer | undefined;
      a = l ? { x: l.x, y: l.y } : { x: 0.5, y: 0.5 };
    }
  }
  return { x: Math.round(a.x * W), y: Math.round(a.y * H) };
}

export function renderFx(p: FxParams): RenderedFx {
  const { width: W, height: H } = frameSize(p);
  const spawned = p.layers.map((l, i) => ((l.kind ?? "particles") === "particles" ? spawnParticles(l as ParticleLayer, p, W, H, mulberry32(hash2(p.seed, i + 1))) : []));
  const frames: Uint8ClampedArray[] = [];
  for (let f = 0; f < p.frames; f++) {
    const img = new Uint8ClampedArray(W * H * 4);
    p.layers.forEach((l: Layer, i) => {
      const buf = new LayerBuf(W, H);
      const kind = l.kind ?? "particles";
      if (kind === "particles") drawParticles(buf, l as ParticleLayer, p, f, W, H, spawned[i]!);
      else if (kind === "glow") drawGlow(buf, l as GlowLayer, p, f, W, H);
      else if (kind === "arc") drawArc(buf, l as ArcLayer, f, W, H);
      else drawProp(buf, l as PropLayer, p, f, W, H);
      const ol = (l as ParticleLayer | ArcLayer).outline;
      composite(img, buf, clamp01(l.alpha ?? 1), ol ? hexToRgb(ol) : undefined);
    });
    frames.push(img);
  }
  return { width: W, height: H, fps: p.fps, loop: p.loop, frames, anchor: anchorOf(p) };
}

/** Pack frames into one RGBA sheet, `cols` per row (default: one horizontal strip). */
export function packSheet(r: RenderedFx, cols = r.frames.length): { width: number; height: number; data: Uint8ClampedArray; rects: Array<{ x: number; y: number; w: number; h: number }> } {
  const c = Math.max(1, Math.min(cols, r.frames.length));
  const rows = Math.ceil(r.frames.length / c);
  const width = r.width * c;
  const height = r.height * rows;
  const data = new Uint8ClampedArray(width * height * 4);
  const rects = r.frames.map((fr, i) => {
    const x = (i % c) * r.width;
    const y = Math.floor(i / c) * r.height;
    for (let j = 0; j < r.height; j++) data.set(fr.subarray(j * r.width * 4, (j + 1) * r.width * 4), ((y + j) * width + x) * 4);
    return { x, y, w: r.width, h: r.height };
  });
  return { width, height, data, rects };
}

/** Nearest-neighbour upscale of an RGBA buffer. */
export function upscale(data: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  if (k === 1) return data;
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++)
    for (let x = 0; x < w * k; x++) {
      const s = ((Math.floor(y / k) * w + Math.floor(x / k)) * 4) | 0;
      const d = (y * w * k + x) * 4;
      out[d] = data[s]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s + 2]!;
      out[d + 3] = data[s + 3]!;
    }
  return out;
}

/** Count of non-transparent pixels in a frame (used by checks and tests). */
export function inkCount(frame: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < frame.length; i += 4) if (frame[i]! > 0) n++;
  return n;
}
