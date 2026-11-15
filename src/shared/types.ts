/** Easy FX data model. Everything here is plain JSON so the CLI, MCP server, web editor and tests share it. */

export const FORMAT = "easyfx/1";

/** Particle shapes (drawn procedurally, no textures). */
export const SHAPES = ["pixel", "square", "disc", "plus", "star", "glint", "spark", "ring", "leaf", "petal", "confetti", "coin", "drop", "lantern"] as const;
export type Shape = (typeof SHAPES)[number];

export const EMITTERS = ["point", "line", "circle", "ring", "rect"] as const;
export type EmitterShape = (typeof EMITTERS)[number];

export const LAYER_KINDS = ["particles", "glow", "arc", "prop"] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

/** Static pixel props drawn under or over the particles. Generic objects only (no figures, no script). */
export const PROPS = ["torch", "logs", "krathong", "pelita", "incense", "lantern", "ripples", "stall_pot"] as const;
export type PropName = (typeof PROPS)[number];

export const EXPORT_PRESETS = ["godot", "pixi", "png", "json", "all"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

export interface Emitter {
  shape: EmitterShape;
  /** Position as a fraction of the frame (0..1). */
  x: number;
  y: number;
  /** line / rect width in px. */
  w?: number;
  /** rect height in px. */
  h?: number;
  /** circle / ring radius in px. */
  r?: number;
  /** Aim each particle away from the emitter centre (circle / ring) instead of along `angle`. */
  radial?: boolean;
}

export interface ParticleLayer {
  kind?: "particles";
  name?: string;
  /** burst: every particle starts at `delay` (+ jitter); stream: spawns spread over the loop so it wraps seamlessly. */
  emit: "burst" | "stream";
  count: number;
  /** Frames a particle lives. */
  lifetime: number;
  /** 0..1, fraction of lifetime randomly removed per particle. */
  lifeJitter?: number;
  /** px per frame. */
  speed: number;
  speedJitter?: number;
  /** Direction in degrees: 0 = right, -90 = up, 90 = down. */
  angle: number;
  /** Full cone in degrees (360 = every direction). */
  spread: number;
  /** px per frame², positive pulls down. */
  gravity: number;
  /** px per frame², sideways push. */
  wind?: number;
  /** 0..1 velocity lost per frame. */
  drag?: number;
  /** Burst start frame and random extra start delay. */
  delay?: number;
  delayJitter?: number;
  emitter: Emitter;
  shape: Shape;
  sizeStart: number;
  sizeEnd?: number;
  /** linear: start → end; pulse: start → end → start. */
  sizeMode?: "linear" | "pulse";
  /** Colours over life (hex). */
  ramp: string[];
  /** life: walk the ramp over the particle's life; random: each particle keeps one ramp colour. */
  rampMode?: "life" | "random";
  /** 1px outline colour around the layer's particles. */
  outline?: string;
  /** 0..1, start of the ordered-dither fade-out (1 = no fade). */
  fade?: number;
  /** 0..1, end of the dither fade-in. */
  fadeIn?: number;
  /** Degrees per frame the particle orbits its emitter. */
  swirl?: number;
  /** Sideways sine wobble amplitude in px, and cycles per life. */
  wobble?: number;
  wobbleFreq?: number;
  /** Every particle follows one swaying curve (incense / chimney threads) instead of its own random phase. */
  wobbleShared?: boolean;
  /** 0..1 share of time a particle blinks off. */
  flicker?: number;
  /** Spin speed for leaf / petal / confetti / coin (phases per frame). */
  spin?: number;
  /** y (fraction of the frame) where particles land and stop. */
  floor?: number;
  /** 0..1 layer opacity. */
  alpha?: number;
}

export interface GlowLayer {
  kind: "glow";
  name?: string;
  x: number;
  y: number;
  /** Radius in px. */
  radius: number;
  /** Inner → outer colours. */
  ramp: string[];
  /** 0..1 radius pulse over the loop, `cycles` times. */
  pulse?: number;
  cycles?: number;
  /** 0..1 per-frame random radius jitter (flame flicker). */
  flicker?: number;
  alpha?: number;
}

export interface ArcLayer {
  kind: "arc";
  name?: string;
  x: number;
  y: number;
  radius: number;
  thickness: number;
  /** Sweep from → to in degrees. */
  from: number;
  to: number;
  /** Frames the head takes to sweep; the tail follows `lag` frames later. */
  sweep: number;
  lag?: number;
  delay?: number;
  /** Outer edge → inner edge colours. */
  ramp: string[];
  outline?: string;
  alpha?: number;
}

export interface PropLayer {
  kind: "prop";
  name?: string;
  prop: PropName;
  /** Anchor (bottom centre of the prop) as a frame fraction. */
  x: number;
  y: number;
  /** Bob amplitude in px over the loop. */
  bob?: number;
  alpha?: number;
}

export type Layer = ParticleLayer | GlowLayer | ArcLayer | PropLayer;

export interface FxParams {
  /** Frame width in px (and height unless `height` is set). */
  size: number;
  height?: number;
  frames: number;
  fps: number;
  /** Looping effects wrap seamlessly; bursts play once. */
  loop: boolean;
  seed: number;
  /** Effect origin as a frame fraction (where the engine places it). Default: first particle emitter. */
  anchor?: { x: number; y: number };
  layers: Layer[];
}

export const CATEGORIES = ["combat", "ambient", "nature", "reward", "festival", "food"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface FxPreset {
  id: string;
  th: string;
  en: string;
  category: Category;
  tags: string[];
  params: FxParams;
}

/** Workspace effect file `effects/<id>.easyfx.json`. */
export interface EffectDoc {
  format: typeof FORMAT;
  th?: string;
  en?: string;
  category?: Category;
  tags?: string[];
  /** Built-in preset to start from. */
  base?: string;
  /** Full params (replaces the base params). */
  params?: FxParams;
  /** Overrides applied last: `count`, `seed`, `1.ramp`, `0.emitter.x` … */
  set?: Record<string, unknown>;
}

export interface Diagnostic {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ResolvedEffect {
  id: string;
  th: string;
  en: string;
  category: Category;
  tags: string[];
  source: "preset" | "workspace";
  params: FxParams;
}
