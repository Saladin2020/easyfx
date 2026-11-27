/**
 * Built-in effect library. Every preset is plain params + seed, so `easyfx render <id> --set …` or the web
 * editor can tweak any of them. Pixel scale matches the 48px Easy Sprite characters and 16px Easy Scene tiles.
 *
 * Content rules (same as the rest of Easy Suite): generic objects only. No figures of the Prophet or other
 * sacred figures, no Quran text or Arabic calligraphy, no religious symbols drawn as decoration.
 */
import { STAMPS } from "./props.js";
import type { FxParams, FxPreset, Layer, ParticleLayer, PropName } from "./types.js";

export const RAMPS = {
  fire: ["#fff6c8", "#ffd86a", "#f4ae3d", "#e8604a", "#cc3a34", "#741a22"],
  flame: ["#fff6c8", "#ffd86a", "#f4ae3d", "#e8604a", "#b82c28"],
  smoke: ["#cfc6b8", "#a09a94", "#7d7f8c", "#55576a"],
  dust: ["#ecdcbc", "#d8c08a", "#b68658", "#8c5630"],
  water: ["#e4f6fb", "#7cc8e8", "#4f8ac8", "#2c6aa8"],
  gold: ["#fff6c8", "#ffd86a", "#f4ae3d", "#c48a3a"],
  coin: ["#fff6c8", "#f4ae3d", "#9c5a26"],
  heal: ["#eaffd8", "#8ee07a", "#4f9a4a", "#2e8c52"],
  magic: ["#f4ecff", "#c8a0ff", "#a07ae0", "#5b3a7a"],
  leaves: ["#6fae5a", "#c8c45a", "#e0b030", "#c45c26", "#9c3a26"],
  confetti: ["#cc3a34", "#f4ae3d", "#2e8c52", "#4fa3d9", "#e0588f", "#fbf4ea"],
  raya: ["#fff6c8", "#ffd86a", "#6fdc9a", "#2f9e6a", "#1f6b4a"],
  steam: ["#fbf4ea", "#e4e0da", "#cfc6b8"],
  spark: ["#ffffff", "#fff6c8", "#ffd86a", "#f4ae3d"],
  glow: ["#ffd86a", "#f4ae3d", "#c45c26"],
  khomloi: ["#fff6c8", "#f4ae3d", "#9c3a26"],
};
export const INK = "#1a120b";

const P = (l: Omit<ParticleLayer, "kind">): ParticleLayer => ({ kind: "particles", ...l });

/** Frame fraction of a prop's flame / smoke point. */
function propPoint(prop: Exclude<PropName, "ripples">, x: number, y: number, W: number, H: number, k = 0): { x: number; y: number } {
  const [ex, ey] = STAMPS[prop].emit[k]!;
  return { x: +((x * W + ex) / W).toFixed(4), y: +((y * H + ey) / H).toFixed(4) };
}

function fx(id: string, th: string, en: string, category: FxPreset["category"], tags: string[], params: Omit<FxParams, "layers"> & { layers: Layer[] }): FxPreset {
  return { id, th, en, category, tags, params };
}

export const PRESETS: FxPreset[] = [
  // ---------------- combat ----------------
  fx("hit_sparks", "ประกายโดนตี", "Hit sparks", "combat", ["hit", "impact"], {
    size: 32, frames: 8, fps: 20, loop: false, seed: 11,
    layers: [
      P({ name: "flash", emit: "burst", count: 1, lifetime: 3, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.5 }, shape: "star", sizeStart: 9, sizeEnd: 3, ramp: RAMPS.spark }),
      P({ name: "sparks", emit: "burst", count: 12, lifetime: 7, lifeJitter: 0.4, speed: 3, speedJitter: 0.5, angle: 0, spread: 360, gravity: 0.12, drag: 0.12, emitter: { shape: "point", x: 0.5, y: 0.5 }, shape: "spark", sizeStart: 5, sizeEnd: 1, ramp: RAMPS.spark, fade: 0.7 }),
    ],
  }),
  fx("slash_arc", "รอยฟัน", "Slash arc", "combat", ["melee", "sword"], {
    size: 48, frames: 8, fps: 24, loop: false, seed: 7,
    layers: [
      { kind: "arc", name: "arc", x: 0.42, y: 0.55, radius: 19, thickness: 6, from: -150, to: 40, sweep: 4, lag: 3, ramp: ["#ffffff", "#e4f6fb", "#7cc8e8", "#4f8ac8"], outline: "#1a2a4a", alpha: 1 },
      P({ name: "sparks", emit: "burst", count: 6, lifetime: 5, lifeJitter: 0.3, speed: 1.6, speedJitter: 0.5, angle: 20, spread: 70, gravity: 0.05, delay: 3, emitter: { shape: "point", x: 0.78, y: 0.72 }, shape: "spark", sizeStart: 3, sizeEnd: 1, ramp: RAMPS.spark }),
    ],
  }),
  fx("explosion_small", "ระเบิดเล็ก", "Explosion (small)", "combat", ["explosion", "bomb"], {
    size: 32, frames: 10, fps: 18, loop: false, seed: 21,
    layers: [
      P({ name: "smoke", emit: "burst", count: 7, lifetime: 9, lifeJitter: 0.2, speed: 0.6, speedJitter: 0.6, angle: -90, spread: 360, gravity: -0.03, drag: 0.08, delay: 2, emitter: { shape: "circle", x: 0.5, y: 0.55, r: 3 }, shape: "disc", sizeStart: 5, sizeEnd: 7, ramp: RAMPS.smoke, fade: 0.45, outline: INK }),
      P({ name: "fire", emit: "burst", count: 10, lifetime: 7, lifeJitter: 0.5, speed: 1.7, speedJitter: 0.5, angle: 0, spread: 360, gravity: -0.03, drag: 0.2, emitter: { shape: "circle", x: 0.5, y: 0.55, r: 2 }, shape: "disc", sizeStart: 9, sizeEnd: 2, ramp: RAMPS.fire, outline: "#741a22" }),
      P({ name: "flash", emit: "burst", count: 1, lifetime: 2, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.55 }, shape: "disc", sizeStart: 10, sizeEnd: 6, ramp: ["#ffffff", "#fff6c8"] }),
    ],
  }),
  fx("explosion_big", "ระเบิดใหญ่", "Explosion (big)", "combat", ["explosion", "boss"], {
    size: 64, frames: 14, fps: 18, loop: false, seed: 33,
    layers: [
      P({ name: "smoke", emit: "burst", count: 12, lifetime: 13, lifeJitter: 0.2, speed: 1, speedJitter: 0.6, angle: -90, spread: 360, gravity: -0.04, drag: 0.1, delay: 2, delayJitter: 2, emitter: { shape: "circle", x: 0.5, y: 0.58, r: 6 }, shape: "disc", sizeStart: 8, sizeEnd: 12, ramp: RAMPS.smoke, fade: 0.5, outline: INK }),
      P({ name: "fire", emit: "burst", count: 18, lifetime: 10, lifeJitter: 0.55, delayJitter: 2, speed: 2.6, speedJitter: 0.5, angle: 0, spread: 360, gravity: -0.04, drag: 0.18, emitter: { shape: "circle", x: 0.5, y: 0.58, r: 4 }, shape: "disc", sizeStart: 13, sizeEnd: 3, ramp: RAMPS.fire, outline: "#741a22" }),
      P({ name: "shockwave", emit: "burst", count: 1, lifetime: 6, speed: 0, angle: 0, spread: 0, gravity: 0, delay: 1, emitter: { shape: "point", x: 0.5, y: 0.58 }, shape: "ring", sizeStart: 6, sizeEnd: 28, ramp: ["#fff6c8", "#ffd86a", "#f4ae3d"], fade: 0.4 }),
      P({ name: "debris", emit: "burst", count: 12, lifetime: 12, lifeJitter: 0.3, speed: 3, speedJitter: 0.5, angle: -90, spread: 200, gravity: 0.25, emitter: { shape: "point", x: 0.5, y: 0.58 }, shape: "spark", sizeStart: 3, sizeEnd: 2, ramp: ["#ffd86a", "#e8604a", "#5a3a22"], floor: 0.95 }),
      P({ name: "flash", emit: "burst", count: 1, lifetime: 2, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.58 }, shape: "disc", sizeStart: 18, sizeEnd: 12, ramp: ["#ffffff", "#fff6c8"] }),
    ],
  }),
  // ---------------- movement ----------------
  fx("dust_puff", "ฝุ่นฟุ้ง", "Dust puff", "ambient", ["land", "jump", "dash"], {
    size: 32, frames: 10, fps: 16, loop: false, seed: 5,
    layers: [
      P({ name: "puffs", emit: "burst", count: 10, lifetime: 10, lifeJitter: 0.3, speed: 1.4, speedJitter: 0.5, angle: -90, spread: 170, gravity: -0.02, drag: 0.2, emitter: { shape: "line", x: 0.5, y: 0.8, w: 8 }, shape: "disc", sizeStart: 6, sizeEnd: 2, ramp: RAMPS.dust, fade: 0.55, outline: "#4e301c" }),
    ],
  }),
  fx("footstep_dust", "ฝุ่นเท้า", "Footstep dust", "ambient", ["walk", "run"], {
    size: 24, height: 16, frames: 7, fps: 16, loop: false, seed: 3,
    anchor: { x: 0.5, y: 0.9 },
    layers: [
      P({ name: "left", emit: "burst", count: 3, lifetime: 6, lifeJitter: 0.3, speed: 0.9, speedJitter: 0.4, angle: -160, spread: 30, gravity: 0.06, drag: 0.15, emitter: { shape: "point", x: 0.45, y: 0.85 }, shape: "disc", sizeStart: 4, sizeEnd: 1, ramp: RAMPS.dust, fade: 0.6 }),
      P({ name: "right", emit: "burst", count: 3, lifetime: 6, lifeJitter: 0.3, speed: 0.9, speedJitter: 0.4, angle: -20, spread: 30, gravity: 0.06, drag: 0.15, emitter: { shape: "point", x: 0.55, y: 0.85 }, shape: "disc", sizeStart: 4, sizeEnd: 1, ramp: RAMPS.dust, fade: 0.6 }),
    ],
  }),
  // ---------------- fire / smoke ----------------
  fx("smoke", "ควัน", "Smoke", "ambient", ["chimney", "fire"], {
    size: 32, height: 48, frames: 16, fps: 10, loop: true, seed: 9,
    layers: [
      P({ name: "smoke", emit: "stream", count: 10, lifetime: 16, lifeJitter: 0.2, speed: 1.6, speedJitter: 0.3, angle: -90, spread: 20, gravity: 0, wind: 0.02, drag: 0.04, emitter: { shape: "line", x: 0.45, y: 0.9, w: 4 }, shape: "disc", sizeStart: 3, sizeEnd: 9, wobble: 2, wobbleFreq: 1, ramp: RAMPS.smoke, fade: 0.6, fadeIn: 0.1, alpha: 0.9 }),
    ],
  }),
  fx("torch_fire", "คบไฟ", "Torch fire", "ambient", ["torch", "fire", "light"], {
    size: 16, height: 32, frames: 8, fps: 12, loop: true, seed: 13,
    anchor: { x: 0.5, y: 1 },
    layers: [
      { kind: "glow", name: "glow", x: 0.5, y: 0.5, radius: 7.5, ramp: RAMPS.glow, pulse: 0.08, cycles: 2, flicker: 0.4, alpha: 0.42 },
      { kind: "prop", name: "torch", prop: "torch", x: 0.5, y: 1 },
      P({ name: "flame", emit: "stream", count: 16, lifetime: 7, lifeJitter: 0.4, speed: 0.9, speedJitter: 0.4, angle: -90, spread: 26, gravity: -0.05, emitter: { shape: "line", ...propPoint("torch", 0.5, 1, 16, 32), w: 3 }, shape: "disc", sizeStart: 4, sizeEnd: 1, ramp: RAMPS.flame, outline: "#741a22" }),
      P({ name: "embers", emit: "stream", count: 2, lifetime: 8, speed: 1, angle: -90, spread: 40, gravity: -0.02, emitter: { shape: "point", ...propPoint("torch", 0.5, 1, 16, 32) }, shape: "pixel", sizeStart: 1, ramp: ["#ffd86a", "#e8604a"], wobble: 1, flicker: 0.2 }),
    ],
  }),
  fx("campfire", "กองไฟ", "Campfire with embers", "ambient", ["campfire", "fire", "night"], {
    size: 48, frames: 12, fps: 12, loop: true, seed: 17,
    anchor: { x: 0.5, y: 0.92 },
    layers: [
      { kind: "glow", name: "glow", x: 0.5, y: 0.72, radius: 20, ramp: RAMPS.glow, pulse: 0.06, cycles: 3, flicker: 0.3, alpha: 0.42 },
      { kind: "prop", name: "logs", prop: "logs", x: 0.5, y: 0.94 },
      P({ name: "flame", emit: "stream", count: 36, lifetime: 11, lifeJitter: 0.5, speed: 1.7, speedJitter: 0.5, angle: -90, spread: 10, gravity: -0.02, emitter: { shape: "line", x: 0.5, y: 0.86, w: 8 }, shape: "disc", sizeStart: 7, sizeEnd: 1, ramp: ["#ffd86a", "#f4ae3d", "#e8604a", "#cc3a34", "#741a22"], wobble: 1, wobbleFreq: 1.5 }),
      P({ name: "embers", emit: "stream", count: 8, lifetime: 12, lifeJitter: 0.3, speed: 1.4, speedJitter: 0.4, angle: -90, spread: 50, gravity: -0.02, emitter: { shape: "line", x: 0.5, y: 0.6, w: 8 }, shape: "pixel", sizeStart: 1, ramp: ["#fff6c8", "#ffd86a", "#e8604a", "#9c3a26"], wobble: 2, wobbleFreq: 1, flicker: 0.15 }),
    ],
  }),
  fx("embers", "สะเก็ดไฟ", "Rising embers", "ambient", ["fire", "night", "overlay"], {
    size: 32, height: 48, frames: 16, fps: 12, loop: true, seed: 19,
    layers: [
      P({ name: "embers", emit: "stream", count: 12, lifetime: 16, lifeJitter: 0.3, speed: 1.4, speedJitter: 0.4, angle: -90, spread: 30, gravity: -0.01, emitter: { shape: "line", x: 0.5, y: 0.95, w: 20 }, shape: "glint", sizeStart: 2, sizeEnd: 1, ramp: ["#fff6c8", "#ffd86a", "#f4ae3d", "#e8604a"], wobble: 3, wobbleFreq: 1, flicker: 0.2 }),
    ],
  }),
  // ---------------- water / weather / nature ----------------
  fx("water_splash", "น้ำกระเซ็น", "Water splash", "nature", ["water", "jump", "river"], {
    size: 32, frames: 10, fps: 18, loop: false, seed: 23,
    anchor: { x: 0.5, y: 0.85 },
    layers: [
      P({ name: "ring", emit: "burst", count: 1, lifetime: 7, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.86 }, shape: "ring", sizeStart: 2, sizeEnd: 11, ramp: ["#e4f6fb", "#7cc8e8", "#4f8ac8"], fade: 0.5 }),
      P({ name: "drops", emit: "burst", count: 14, lifetime: 10, lifeJitter: 0.3, speed: 2.2, speedJitter: 0.5, angle: -90, spread: 80, gravity: 0.3, emitter: { shape: "line", x: 0.5, y: 0.84, w: 6 }, shape: "drop", sizeStart: 3, sizeEnd: 2, ramp: RAMPS.water, floor: 0.88, fade: 0.8 }),
    ],
  }),
  fx("rain", "ฝนตก", "Rain", "nature", ["weather", "overlay", "tileable"], {
    size: 48, frames: 8, fps: 16, loop: true, seed: 29,
    anchor: { x: 0.5, y: 0.5 },
    layers: [
      P({ name: "streaks", emit: "stream", count: 18, lifetime: 8, speed: 7, angle: 100, spread: 0, gravity: 0, emitter: { shape: "line", x: 0.55, y: -0.15, w: 64 }, shape: "spark", sizeStart: 4, ramp: ["#e4f6fb", "#7cc8e8"], alpha: 0.85 }),
      P({ name: "splashes", emit: "stream", count: 6, lifetime: 3, speed: 0.6, angle: -90, spread: 120, gravity: 0.1, emitter: { shape: "line", x: 0.5, y: 0.96, w: 46 }, shape: "pixel", sizeStart: 1, ramp: ["#e4f6fb", "#7cc8e8"] }),
    ],
  }),
  fx("falling_leaves", "ใบไม้ร่วง", "Falling leaves", "nature", ["autumn", "wind", "overlay"], {
    size: 48, frames: 24, fps: 10, loop: true, seed: 31,
    anchor: { x: 0.5, y: 0.5 },
    layers: [
      P({ name: "leaves", emit: "stream", count: 7, lifetime: 24, speed: 1.6, speedJitter: 0.3, angle: 80, spread: 20, gravity: 0, emitter: { shape: "line", x: 0.45, y: -0.05, w: 52 }, shape: "leaf", sizeStart: 2, ramp: RAMPS.leaves, rampMode: "random", wobble: 4, wobbleFreq: 1, spin: 0.3, outline: "#2a221c" }),
    ],
  }),
  fx("storm_rain", "พายุฝน", "Storm rain", "nature", ["weather", "storm", "overlay", "tileable"], {
    size: 48, frames: 8, fps: 18, loop: true, seed: 101,
    anchor: { x: 0.5, y: 0.5 },
    layers: [
      P({ name: "sheets", emit: "stream", count: 30, lifetime: 6, speed: 9, angle: 115, spread: 4, gravity: 0, emitter: { shape: "line", x: 0.7, y: -0.2, w: 72 }, shape: "spark", sizeStart: 5, ramp: ["#e4f6fb", "#9fb8d8", "#7cc8e8"], alpha: 0.8 }),
      P({ name: "splashes", emit: "stream", count: 10, lifetime: 3, speed: 0.9, angle: -90, spread: 140, gravity: 0.12, emitter: { shape: "line", x: 0.5, y: 0.96, w: 46 }, shape: "pixel", sizeStart: 1, ramp: ["#e4f6fb", "#7cc8e8"] }),
    ],
  }),
  fx("fog_drift", "หมอกลอย", "Fog drift", "nature", ["weather", "fog", "overlay", "tileable"], {
    size: 64, height: 48, frames: 24, fps: 8, loop: true, seed: 103,
    anchor: { x: 0.5, y: 0.5 },
    layers: [
      P({ name: "banks", emit: "stream", count: 9, lifetime: 24, speed: 0.35, speedJitter: 0.2, angle: 0, spread: 6, gravity: 0, emitter: { shape: "rect", x: 0.45, y: 0.55, w: 70, h: 40 }, shape: "disc", sizeStart: 9, sizeEnd: 13, ramp: ["#eef2f4", "#d8dee4"], alpha: 0.32, fade: 0.5, fadeIn: 0.3 }),
      P({ name: "wisps", emit: "stream", count: 6, lifetime: 24, speed: 0.5, angle: 0, spread: 4, gravity: 0, emitter: { shape: "rect", x: 0.45, y: 0.5, w: 70, h: 44 }, shape: "square", sizeStart: 3, sizeEnd: 5, ramp: ["#f6f8fa", "#e4e8ec"], alpha: 0.4, fade: 0.6, fadeIn: 0.3, wobble: 1, wobbleFreq: 1 }),
    ],
  }),
  fx("wind_gust", "ลมพัด", "Wind gust", "nature", ["weather", "wind", "overlay", "tileable"], {
    size: 48, frames: 12, fps: 14, loop: true, seed: 107,
    anchor: { x: 0.5, y: 0.5 },
    layers: [
      P({ name: "streaks", emit: "stream", count: 5, lifetime: 10, speed: 5, angle: 2, spread: 6, gravity: 0, emitter: { shape: "rect", x: -0.1, y: 0.5, w: 4, h: 40 }, shape: "spark", sizeStart: 6, sizeEnd: 3, ramp: ["#ffffff", "#e4f6fb"], alpha: 0.55, fade: 0.6 }),
      P({ name: "leaves", emit: "stream", count: 3, lifetime: 12, speed: 3.6, speedJitter: 0.3, angle: 8, spread: 14, gravity: 0, emitter: { shape: "rect", x: -0.05, y: 0.5, w: 4, h: 36 }, shape: "leaf", sizeStart: 2, ramp: RAMPS.leaves, rampMode: "random", wobble: 3, wobbleFreq: 2, spin: 0.4, outline: "#2a221c" }),
    ],
  }),
  fx("flood_ripple", "ระลอกน้ำท่วม", "Flood ripples", "nature", ["weather", "flood", "overlay", "tileable", "water"], {
    size: 48, height: 12, frames: 12, fps: 8, loop: true, seed: 109,
    anchor: { x: 0.5, y: 0.5 },
    layers: [
      P({ name: "glints", emit: "stream", count: 7, lifetime: 12, speed: 0.45, speedJitter: 0.2, angle: 0, spread: 3, gravity: 0, emitter: { shape: "rect", x: 0.5, y: 0.5, w: 56, h: 6 }, shape: "glint", sizeStart: 3, sizeEnd: 1, ramp: ["#f4fbf8", "#bfe0d8", "#8fbcb0"], alpha: 0.85, fade: 0.5, fadeIn: 0.3 }),
      P({ name: "foam", emit: "stream", count: 5, lifetime: 12, speed: 0.3, angle: 180, spread: 4, gravity: 0, emitter: { shape: "rect", x: 0.5, y: 0.35, w: 56, h: 3 }, shape: "pixel", sizeStart: 1, ramp: ["#e8f2ec", "#a8c8bc"], alpha: 0.7, fade: 0.6, wobble: 1, wobbleFreq: 1 }),
    ],
  }),
  fx("fireflies", "หิ่งห้อย", "Fireflies", "nature", ["night", "swamp", "overlay"], {
    size: 48, frames: 24, fps: 10, loop: true, seed: 37,
    layers: [
      P({ name: "flies", emit: "stream", count: 7, lifetime: 24, speed: 0.15, angle: -90, spread: 360, gravity: 0, emitter: { shape: "rect", x: 0.5, y: 0.55, w: 40, h: 30 }, shape: "glint", sizeStart: 2, ramp: ["#f2ffb0", "#8ee07a"], wobble: 3, wobbleFreq: 1, flicker: 0.35 }),
    ],
  }),
  // ---------------- rewards ----------------
  fx("sparkle_shine", "ประกายของเก็บ", "Sparkle / pickup shine", "reward", ["pickup", "item", "shine"], {
    size: 32, frames: 12, fps: 14, loop: true, seed: 41,
    layers: [
      P({ name: "stars", emit: "stream", count: 4, lifetime: 7, lifeJitter: 0.2, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "rect", x: 0.5, y: 0.5, w: 20, h: 20 }, shape: "star", sizeStart: 1, sizeEnd: 7, sizeMode: "pulse", ramp: ["#ffffff", "#fff6c8", "#ffd86a"] }),
      P({ name: "glints", emit: "stream", count: 4, lifetime: 5, speed: 0.2, angle: -90, spread: 40, gravity: 0, emitter: { shape: "rect", x: 0.5, y: 0.5, w: 24, h: 24 }, shape: "pixel", sizeStart: 1, ramp: ["#fff6c8", "#ffd86a"] }),
    ],
  }),
  fx("coin_burst", "เหรียญกระจาย", "Coin burst", "reward", ["coin", "money", "loot"], {
    size: 48, frames: 16, fps: 18, loop: false, seed: 43,
    anchor: { x: 0.5, y: 0.8 },
    layers: [
      P({ name: "coins", emit: "burst", count: 8, lifetime: 16, speed: 3.6, speedJitter: 0.4, angle: -90, spread: 110, gravity: 0.34, delayJitter: 2, emitter: { shape: "point", x: 0.5, y: 0.8 }, shape: "coin", sizeStart: 5, ramp: RAMPS.coin, spin: 0.35, floor: 0.9, outline: INK }),
      P({ name: "glints", emit: "burst", count: 5, lifetime: 6, speed: 1.2, angle: -90, spread: 120, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.75 }, shape: "star", sizeStart: 3, sizeEnd: 1, ramp: ["#ffffff", "#ffd86a"] }),
    ],
  }),
  fx("heal_plus", "ฟื้นพลัง", "Heal plus-signs", "reward", ["heal", "buff", "potion"], {
    size: 32, height: 48, frames: 16, fps: 12, loop: true, seed: 47,
    anchor: { x: 0.5, y: 0.9 },
    layers: [
      P({ name: "plus", emit: "stream", count: 5, lifetime: 14, lifeJitter: 0.2, speed: 1.6, speedJitter: 0.3, angle: -90, spread: 0, gravity: 0, drag: 0.03, emitter: { shape: "line", x: 0.5, y: 0.85, w: 20 }, shape: "plus", sizeStart: 5, sizeEnd: 3, ramp: RAMPS.heal, outline: "#16361f", fade: 0.7, fadeIn: 0.15 }),
      P({ name: "motes", emit: "stream", count: 8, lifetime: 12, speed: 1.2, angle: -90, spread: 10, gravity: 0, emitter: { shape: "line", x: 0.5, y: 0.9, w: 24 }, shape: "pixel", sizeStart: 1, ramp: ["#eaffd8", "#8ee07a"], wobble: 1, flicker: 0.2 }),
    ],
  }),
  fx("level_up", "เลเวลอัป", "Level-up burst", "reward", ["level", "upgrade", "achievement"], {
    size: 64, frames: 18, fps: 18, loop: false, seed: 53,
    anchor: { x: 0.5, y: 0.85 },
    layers: [
      P({ name: "ring", emit: "burst", count: 1, lifetime: 10, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.55 }, shape: "ring", sizeStart: 3, sizeEnd: 26, ramp: ["#ffffff", "#ffd86a", "#f4ae3d"], fade: 0.55 }),
      P({ name: "rise", emit: "burst", count: 18, lifetime: 14, lifeJitter: 0.3, speed: 3.4, speedJitter: 0.5, angle: -90, spread: 14, gravity: 0, drag: 0.05, delayJitter: 4, emitter: { shape: "line", x: 0.5, y: 0.88, w: 26 }, shape: "spark", sizeStart: 5, sizeEnd: 2, ramp: RAMPS.spark, fade: 0.7 }),
      P({ name: "stars", emit: "burst", count: 8, lifetime: 12, speed: 1.6, speedJitter: 0.4, angle: -90, spread: 160, gravity: 0.03, delay: 3, delayJitter: 4, emitter: { shape: "point", x: 0.5, y: 0.55 }, shape: "star", sizeStart: 5, sizeEnd: 1, ramp: ["#ffffff", "#fff6c8", "#ffd86a"] }),
    ],
  }),
  fx("magic_swirl", "เวทวน", "Magic swirl", "combat", ["magic", "spell", "portal"], {
    size: 48, frames: 16, fps: 14, loop: true, seed: 59,
    layers: [
      P({ name: "orbit", emit: "stream", count: 18, lifetime: 16, speed: 0.6, angle: -90, spread: 0, gravity: 0, swirl: 22.5, emitter: { shape: "ring", x: 0.5, y: 0.5, r: 6, radial: true }, shape: "glint", sizeStart: 2, sizeEnd: 1, ramp: RAMPS.magic, fade: 0.75 }),
      P({ name: "core", emit: "stream", count: 6, lifetime: 8, speed: 0, angle: 0, spread: 0, gravity: 0, emitter: { shape: "circle", x: 0.5, y: 0.5, r: 3 }, shape: "star", sizeStart: 1, sizeEnd: 5, sizeMode: "pulse", ramp: ["#ffffff", "#c8a0ff"] }),
    ],
  }),
  fx("confetti", "กระดาษสี", "Confetti", "festival", ["party", "win", "celebration"], {
    size: 48, frames: 20, fps: 16, loop: false, seed: 61,
    anchor: { x: 0.5, y: 0.7 },
    layers: [
      P({ name: "confetti", emit: "burst", count: 28, lifetime: 20, lifeJitter: 0.2, speed: 4.6, speedJitter: 0.45, angle: -90, spread: 100, gravity: 0.12, drag: 0.08, emitter: { shape: "point", x: 0.5, y: 0.7 }, shape: "confetti", sizeStart: 4, ramp: RAMPS.confetti, rampMode: "random", spin: 0.5, wobble: 1.5, fade: 0.85 }),
    ],
  }),
  fx("steam", "ไอน้ำร้านอาหาร", "Food-stall steam", "food", ["food", "stall", "market", "cooking"], {
    size: 32, height: 48, frames: 16, fps: 10, loop: true, seed: 67,
    anchor: { x: 0.5, y: 1 },
    layers: [
      { kind: "prop", name: "pot", prop: "stall_pot", x: 0.5, y: 1 },
      P({ name: "steam", emit: "stream", count: 9, lifetime: 16, lifeJitter: 0.2, speed: 1.4, speedJitter: 0.3, angle: -90, spread: 16, gravity: 0, drag: 0.03, emitter: { shape: "line", ...propPoint("stall_pot", 0.5, 1, 32, 48), w: 8 }, shape: "disc", sizeStart: 2, sizeEnd: 6, wobble: 2.5, wobbleFreq: 1, ramp: RAMPS.steam, fade: 0.5, fadeIn: 0.15, alpha: 0.75 }),
    ],
  }),
  fx("lantern_glow", "โคมไฟเรืองแสง", "Hanging lantern glow", "festival", ["lantern", "light", "night", "market", "chinese_thai"], {
    size: 32, height: 48, frames: 16, fps: 10, loop: true, seed: 71,
    anchor: { x: 0.5, y: 0.2 },
    layers: [
      { kind: "glow", name: "halo", x: 0.5, y: 0.34, radius: 14, ramp: ["#ffd86a", "#f4ae3d", "#c45c26"], pulse: 0.1, cycles: 1, alpha: 0.42 },
      { kind: "prop", name: "lantern", prop: "lantern", x: 0.5, y: 0.46, bob: 1 },
      P({ name: "motes", emit: "stream", count: 5, lifetime: 16, speed: 0.4, angle: -90, spread: 60, gravity: 0, emitter: { shape: "circle", x: 0.5, y: 0.36, r: 11 }, shape: "pixel", sizeStart: 1, ramp: ["#fff6c8", "#ffd86a"], flicker: 0.4, wobble: 1 }),
    ],
  }),
  // ---------------- Thai festivals ----------------
  fx("khom_loi", "โคมลอย (ลอยกระทง/ยี่เป็ง)", "Floating sky lanterns (Loy Krathong / Yi Peng)", "festival", ["loy_krathong", "yi_peng", "thai", "night", "overlay"], {
    size: 48, height: 64, frames: 32, fps: 10, loop: true, seed: 73,
    anchor: { x: 0.5, y: 1 },
    layers: [
      P({ name: "lanterns", emit: "stream", count: 6, lifetime: 32, speed: 2.2, speedJitter: 0.3, angle: -88, spread: 8, gravity: 0, wind: 0, emitter: { shape: "line", x: 0.5, y: 1.08, w: 40 }, shape: "lantern", sizeStart: 5, sizeEnd: 4, ramp: RAMPS.khomloi, wobble: 2, wobbleFreq: 1, outline: "#3a1a10" }),
      P({ name: "glints", emit: "stream", count: 6, lifetime: 32, speed: 2.2, speedJitter: 0.3, angle: -88, spread: 8, gravity: 0, emitter: { shape: "line", x: 0.5, y: 1.08, w: 40 }, shape: "pixel", sizeStart: 1, ramp: ["#fff6c8"], flicker: 0.5, wobble: 3 }),
    ],
  }),
  fx("krathong_glow", "กระทงลอยน้ำ", "Krathong candle glow on water", "festival", ["loy_krathong", "thai", "water", "night"], {
    size: 48, height: 40, frames: 16, fps: 10, loop: true, seed: 79,
    anchor: { x: 0.5, y: 0.85 },
    layers: [
      { kind: "glow", name: "candle_glow", x: 0.5, y: 0.6, radius: 13, ramp: ["#ffd86a", "#f4ae3d", "#c45c26"], pulse: 0.08, cycles: 2, flicker: 0.3, alpha: 0.42 },
      { kind: "prop", name: "water", prop: "ripples", x: 0.5, y: 0.95 },
      { kind: "prop", name: "krathong", prop: "krathong", x: 0.5, y: 0.88, bob: 1 },
      P({ name: "flame", emit: "stream", count: 8, lifetime: 4, lifeJitter: 0.3, speed: 0.5, angle: -90, spread: 20, gravity: -0.04, emitter: { shape: "point", ...propPoint("krathong", 0.5, 0.88, 48, 40) }, shape: "disc", sizeStart: 2, sizeEnd: 1, ramp: ["#fff6c8", "#ffd86a", "#f4ae3d"] }),
      P({ name: "reflection", emit: "stream", count: 6, lifetime: 6, speed: 0.3, angle: 0, spread: 360, gravity: 0, emitter: { shape: "line", x: 0.5, y: 0.97, w: 22 }, shape: "pixel", sizeStart: 1, ramp: ["#ffd86a", "#f4ae3d"], flicker: 0.4 }),
    ],
  }),
  fx("songkran_splash", "สาดน้ำสงกรานต์", "Songkran water splash", "festival", ["songkran", "thai", "water", "new_year"], {
    size: 48, frames: 14, fps: 18, loop: false, seed: 83,
    anchor: { x: 0.12, y: 0.6 },
    layers: [
      P({ name: "stream", emit: "burst", count: 26, lifetime: 13, lifeJitter: 0.3, speed: 3.4, speedJitter: 0.35, angle: -35, spread: 26, gravity: 0.26, delayJitter: 3, emitter: { shape: "point", x: 0.12, y: 0.6 }, shape: "drop", sizeStart: 3, sizeEnd: 2, ramp: RAMPS.water, floor: 0.95, fade: 0.8 }),
      P({ name: "spray", emit: "burst", count: 16, lifetime: 9, lifeJitter: 0.3, speed: 2.6, speedJitter: 0.5, angle: -45, spread: 50, gravity: 0.2, drag: 0.05, delay: 1, delayJitter: 3, emitter: { shape: "point", x: 0.14, y: 0.6 }, shape: "pixel", sizeStart: 1, ramp: ["#ffffff", "#e4f6fb", "#7cc8e8"] }),
      P({ name: "petals", emit: "burst", count: 4, lifetime: 13, speed: 2.2, speedJitter: 0.4, angle: -50, spread: 30, gravity: 0.12, drag: 0.06, delay: 1, emitter: { shape: "point", x: 0.12, y: 0.6 }, shape: "petal", sizeStart: 2, ramp: ["#fbf4ea", "#e4e0da"], spin: 0.4, floor: 0.95 }),
    ],
  }),
  fx("incense_smoke", "ควันธูป", "Incense smoke (shrine / temple)", "festival", ["incense", "shrine", "temple", "chinese_thai", "buddhist"], {
    size: 32, height: 48, frames: 24, fps: 10, loop: true, seed: 89,
    anchor: { x: 0.5, y: 1 },
    layers: [
      { kind: "prop", name: "pot", prop: "incense", x: 0.5, y: 1 },
      ...[0, 1, 2].map((k) =>
        P({ name: `smoke${k}`, emit: "stream", count: 30, lifetime: 24, speed: 1.3, speedJitter: 0.05, angle: -90, spread: 0, gravity: 0, wind: 0.004, emitter: { shape: "point", ...propPoint("incense", 0.5, 1, 32, 48, k) }, shape: "pixel", sizeStart: 1, sizeEnd: 2, wobble: 3 + k, wobbleFreq: 1, wobbleShared: true, ramp: ["#e4e0da", "#cfc6b8", "#a09a94"], fade: 0.55, alpha: 0.8 }),
      ),
    ],
  }),
  // ---------------- Raya / Eid ----------------
  fx("pelita_flicker", "ตะเกียงปลิตา (รายอ)", "Pelita oil-lamp flicker (Hari Raya)", "festival", ["raya", "eid", "malay", "lamp", "night"], {
    size: 24, height: 40, frames: 12, fps: 12, loop: true, seed: 97,
    anchor: { x: 0.5, y: 1 },
    layers: [
      { kind: "glow", name: "glow", x: 0.5, y: 0.6, radius: 10, ramp: ["#ffd86a", "#f4ae3d", "#c45c26"], pulse: 0.12, cycles: 3, flicker: 0.5, alpha: 0.42 },
      { kind: "prop", name: "pelita", prop: "pelita", x: 0.5, y: 1 },
      P({ name: "flame", emit: "stream", count: 10, lifetime: 5, lifeJitter: 0.4, speed: 0.6, speedJitter: 0.4, angle: -90, spread: 16, gravity: -0.04, emitter: { shape: "point", ...propPoint("pelita", 0.5, 1, 24, 40) }, shape: "disc", sizeStart: 3, sizeEnd: 1, ramp: ["#fff6c8", "#ffd86a", "#f4ae3d", "#e8604a"] }),
    ],
  }),
  fx("raya_fireworks", "พลุรายอ", "Hari Raya fireworks", "festival", ["raya", "eid", "fireworks", "night", "celebration"], {
    size: 64, frames: 24, fps: 14, loop: false, seed: 101,
    anchor: { x: 0.5, y: 1 },
    layers: [
      P({ name: "rocket", emit: "burst", count: 6, lifetime: 8, speed: 4.6, speedJitter: 0.05, angle: -90, spread: 2, gravity: 0.1, delayJitter: 1, emitter: { shape: "point", x: 0.5, y: 0.98 }, shape: "spark", sizeStart: 3, sizeEnd: 1, ramp: ["#fff6c8", "#ffd86a", "#f4ae3d"] }),
      P({ name: "burst", emit: "burst", count: 34, lifetime: 15, lifeJitter: 0.2, speed: 3.2, speedJitter: 0.1, angle: 0, spread: 360, gravity: 0.05, drag: 0.08, delay: 8, emitter: { shape: "point", x: 0.5, y: 0.42 }, shape: "spark", sizeStart: 4, sizeEnd: 1, ramp: RAMPS.raya, fade: 0.65 }),
      P({ name: "stars", emit: "burst", count: 14, lifetime: 13, lifeJitter: 0.3, speed: 1.8, speedJitter: 0.5, angle: 0, spread: 360, gravity: 0.05, drag: 0.08, delay: 10, emitter: { shape: "point", x: 0.5, y: 0.42 }, shape: "glint", sizeStart: 2, ramp: ["#ffffff", "#ffd86a", "#6fdc9a"], flicker: 0.3 }),
    ],
  }),
];

export const PRESET_IDS = PRESETS.map((p) => p.id);
export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
