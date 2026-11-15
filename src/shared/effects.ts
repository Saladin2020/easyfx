/** Validation, `--set` overrides and preset/workspace resolution. Pure, shared by every surface. */
import { HEX_RE } from "./sim.js";
import { PRESETS, presetById } from "./presets.js";
import { CATEGORIES, EMITTERS, FORMAT, LAYER_KINDS, PROPS, SHAPES, type Diagnostic, type EffectDoc, type FxParams, type ResolvedEffect } from "./types.js";

export const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const TOP_KEYS = ["size", "height", "frames", "fps", "loop", "seed", "anchor"] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function validateParams(raw: unknown, base = "params"): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const e = (path: string, message: string) => errors.push({ path, message, severity: "error" });
  const w = (path: string, message: string) => warnings.push({ path, message, severity: "warning" });
  if (!isObj(raw)) return { errors: [{ path: base, message: "must be an object", severity: "error" }], warnings };
  const num = (o: Obj, k: string, path: string, min: number, max: number, opts: { int?: boolean; optional?: boolean } = {}) => {
    const v = o[k];
    if (v === undefined) {
      if (!opts.optional) e(`${path}.${k}`, "is required");
      return;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) return e(`${path}.${k}`, "must be a number");
    if (opts.int && !Number.isInteger(v)) return e(`${path}.${k}`, "must be an integer");
    if (v < min || v > max) e(`${path}.${k}`, `must be between ${min} and ${max}`);
  };
  const ramp = (o: Obj, path: string) => {
    const r = o.ramp;
    if (!Array.isArray(r) || r.length < 1 || r.length > 12) return e(`${path}.ramp`, "must be 1-12 hex colours");
    r.forEach((c, i) => (typeof c !== "string" || !HEX_RE.test(c)) && e(`${path}.ramp[${i}]`, `${JSON.stringify(c)} is not a #rgb / #rrggbb colour`));
  };
  const hex = (o: Obj, k: string, path: string) => o[k] !== undefined && (typeof o[k] !== "string" || !HEX_RE.test(o[k] as string)) && e(`${path}.${k}`, "must be a #rrggbb colour");
  num(raw, "size", base, 8, 128, { int: true });
  num(raw, "height", base, 8, 128, { int: true, optional: true });
  num(raw, "frames", base, 1, 64, { int: true });
  num(raw, "fps", base, 1, 60);
  num(raw, "seed", base, 0, 4294967295, { int: true });
  if (typeof raw.loop !== "boolean") e(`${base}.loop`, "must be true or false");
  if (raw.anchor !== undefined) {
    if (!isObj(raw.anchor)) e(`${base}.anchor`, "must be {x, y}");
    else {
      num(raw.anchor, "x", `${base}.anchor`, -1, 2);
      num(raw.anchor, "y", `${base}.anchor`, -1, 2);
    }
  }
  const frames = typeof raw.frames === "number" ? raw.frames : 1;
  if (!Array.isArray(raw.layers) || raw.layers.length < 1 || raw.layers.length > 8) {
    e(`${base}.layers`, "must be 1-8 layers");
    return { errors, warnings };
  }
  let total = 0;
  raw.layers.forEach((l: unknown, i: number) => {
    const p = `${base}.layers[${i}]`;
    if (!isObj(l)) return e(p, "must be an object");
    const kind = (l.kind ?? "particles") as string;
    if (!(LAYER_KINDS as readonly string[]).includes(kind)) return e(`${p}.kind`, `unknown layer kind "${kind}" (${LAYER_KINDS.join(", ")})`);
    num(l, "alpha", p, 0, 1, { optional: true });
    if (kind === "particles") {
      if (l.emit !== "burst" && l.emit !== "stream") e(`${p}.emit`, 'must be "burst" or "stream"');
      num(l, "count", p, 0, 400, { int: true });
      num(l, "lifetime", p, 1, 240);
      num(l, "lifeJitter", p, 0, 1, { optional: true });
      num(l, "speed", p, 0, 32);
      num(l, "speedJitter", p, 0, 1, { optional: true });
      num(l, "angle", p, -720, 720);
      num(l, "spread", p, 0, 360);
      num(l, "gravity", p, -4, 4);
      num(l, "wind", p, -4, 4, { optional: true });
      num(l, "drag", p, 0, 0.95, { optional: true });
      num(l, "delay", p, 0, 240, { optional: true });
      num(l, "delayJitter", p, 0, 240, { optional: true });
      num(l, "sizeStart", p, 0, 32);
      num(l, "sizeEnd", p, 0, 32, { optional: true });
      num(l, "fade", p, 0, 1, { optional: true });
      num(l, "fadeIn", p, 0, 1, { optional: true });
      num(l, "swirl", p, -90, 90, { optional: true });
      num(l, "wobble", p, 0, 32, { optional: true });
      num(l, "wobbleFreq", p, 0, 16, { optional: true });
      num(l, "flicker", p, 0, 1, { optional: true });
      num(l, "spin", p, -4, 4, { optional: true });
      num(l, "floor", p, -1, 2, { optional: true });
      if (l.wobbleShared !== undefined && typeof l.wobbleShared !== "boolean") e(`${p}.wobbleShared`, "must be true or false");
      if (l.radial !== undefined) w(`${p}.radial`, "radial belongs in emitter");
      if (l.sizeMode !== undefined && l.sizeMode !== "linear" && l.sizeMode !== "pulse") e(`${p}.sizeMode`, 'must be "linear" or "pulse"');
      if (l.rampMode !== undefined && l.rampMode !== "life" && l.rampMode !== "random") e(`${p}.rampMode`, 'must be "life" or "random"');
      if (!(SHAPES as readonly string[]).includes(l.shape as string)) e(`${p}.shape`, `unknown shape ${JSON.stringify(l.shape)} (${SHAPES.join(", ")})`);
      if (!isObj(l.emitter)) e(`${p}.emitter`, "must be {shape, x, y, w?, h?, r?}");
      else {
        if (!(EMITTERS as readonly string[]).includes(l.emitter.shape as string)) e(`${p}.emitter.shape`, `unknown emitter ${JSON.stringify(l.emitter.shape)} (${EMITTERS.join(", ")})`);
        num(l.emitter, "x", `${p}.emitter`, -1, 2);
        num(l.emitter, "y", `${p}.emitter`, -1, 2);
        num(l.emitter, "w", `${p}.emitter`, 0, 256, { optional: true });
        num(l.emitter, "h", `${p}.emitter`, 0, 256, { optional: true });
        num(l.emitter, "r", `${p}.emitter`, 0, 128, { optional: true });
      }
      ramp(l, p);
      hex(l, "outline", p);
      if (typeof l.count === "number" && typeof l.lifetime === "number") {
        total += l.count * (l.emit === "stream" ? Math.ceil(l.lifetime / frames) : 1);
        if (l.emit === "burst" && (Number(l.delay ?? 0) >= frames)) w(`${p}.delay`, `starts after the last frame (${frames})`);
        if (l.emit === "stream" && !raw.loop) w(`${p}.emit`, "stream layers are built to loop; set loop: true or use burst");
      }
    } else if (kind === "glow") {
      num(l, "x", p, -1, 2);
      num(l, "y", p, -1, 2);
      num(l, "radius", p, 0.5, 64);
      num(l, "pulse", p, 0, 1, { optional: true });
      num(l, "cycles", p, 0, 16, { int: true, optional: true });
      num(l, "flicker", p, 0, 1, { optional: true });
      ramp(l, p);
    } else if (kind === "arc") {
      num(l, "x", p, -1, 2);
      num(l, "y", p, -1, 2);
      num(l, "radius", p, 1, 64);
      num(l, "thickness", p, 1, 32);
      num(l, "from", p, -720, 720);
      num(l, "to", p, -720, 720);
      num(l, "sweep", p, 1, 64);
      num(l, "lag", p, 0, 64, { optional: true });
      num(l, "delay", p, 0, 64, { optional: true });
      ramp(l, p);
      hex(l, "outline", p);
    } else {
      if (!(PROPS as readonly string[]).includes(l.prop as string)) e(`${p}.prop`, `unknown prop ${JSON.stringify(l.prop)} (${PROPS.join(", ")})`);
      num(l, "x", p, -1, 2);
      num(l, "y", p, -1, 2);
      num(l, "bob", p, 0, 16, { optional: true });
    }
  });
  if (total > 800) w(`${base}.layers`, `${total} particles alive at once is heavy for a sprite sheet; fine, but slower to render`);
  if (!raw.layers.some((l: unknown) => isObj(l) && (l.kind ?? "particles") === "particles")) w(`${base}.layers`, "no particle layer (no CPUParticles2D preset will be exported)");
  return { errors, warnings };
}

/** Parse a CLI `key=value`; values are JSON when they parse, else strings. */
export function parseSet(arg: string): [string, unknown] {
  const i = arg.indexOf("=");
  if (i <= 0) throw new Error(`--set expects key=value, got ${JSON.stringify(arg)}`);
  const k = arg.slice(0, i).trim();
  const raw = arg.slice(i + 1).trim();
  let v: unknown = raw;
  try {
    v = JSON.parse(raw);
  } catch {
    if (raw.includes(",") && raw.split(",").every((s) => HEX_RE.test(s.trim()))) v = raw.split(",").map((s) => s.trim());
  }
  return [k, v];
}

/**
 * Apply one override. `count` → layer 0 (or a top-level key like `seed`), `2.ramp` → layer 2,
 * `0.emitter.x` → nested. `*.speed` → every particle layer that has the key.
 */
export function applySet(p: FxParams, key: string, value: unknown): void {
  const parts = key.split(".");
  if (parts.length === 1 && (TOP_KEYS as readonly string[]).includes(parts[0]!)) {
    (p as unknown as Obj)[parts[0]!] = value;
    return;
  }
  let targets: Obj[];
  let rest = parts;
  if (/^\d+$/.test(parts[0]!)) {
    const l = p.layers[Number(parts[0])];
    if (!l) throw new Error(`--set ${key}: no layer ${parts[0]} (have 0-${p.layers.length - 1})`);
    targets = [l as unknown as Obj];
    rest = parts.slice(1);
  } else if (parts[0] === "*") {
    targets = (p.layers as unknown as Obj[]).filter((l) => rest.length > 1 || parts[1]! in l);
    rest = parts.slice(1);
  } else {
    const first = p.layers.findIndex((l) => (l.kind ?? "particles") === "particles");
    targets = [p.layers[Math.max(0, first)] as unknown as Obj];
  }
  if (!rest.length) throw new Error(`--set ${key}: missing a field name`);
  for (const t of targets) {
    let o: Obj = t;
    for (const k of rest.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k] as Obj;
    }
    o[rest[rest.length - 1]!] = value;
  }
}

export function validateDoc(raw: unknown): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  if (!isObj(raw)) return { errors: [{ path: "", message: "effect file must be a JSON object", severity: "error" }], warnings: [] };
  if (raw.format !== FORMAT) errors.push({ path: "format", message: `must be "${FORMAT}"`, severity: "error" });
  if (raw.base !== undefined && !presetById(String(raw.base))) errors.push({ path: "base", message: `unknown preset ${JSON.stringify(raw.base)} (try: easyfx list)`, severity: "error" });
  if (raw.base === undefined && raw.params === undefined) errors.push({ path: "params", message: "needs params or a base preset", severity: "error" });
  if (raw.category !== undefined && !(CATEGORIES as readonly string[]).includes(raw.category as string)) errors.push({ path: "category", message: `one of ${CATEGORIES.join(", ")}`, severity: "error" });
  if (raw.set !== undefined && !isObj(raw.set)) errors.push({ path: "set", message: "must be an object of key → value", severity: "error" });
  return { errors, warnings: [] };
}

/** Resolve a workspace doc (base preset → params → set) and validate the result. */
export function resolveDoc(id: string, raw: unknown): { effect?: ResolvedEffect; errors: Diagnostic[]; warnings: Diagnostic[] } {
  const v = validateDoc(raw);
  if (v.errors.length) return v;
  const doc = raw as EffectDoc;
  const base = doc.base ? presetById(doc.base) : undefined;
  let params = clone((doc.params ?? base?.params) as FxParams);
  const errors: Diagnostic[] = [];
  for (const [k, val] of Object.entries(doc.set ?? {})) {
    try {
      applySet(params, k, val);
    } catch (e) {
      errors.push({ path: `set.${k}`, message: (e as Error).message, severity: "error" });
    }
  }
  const pv = validateParams(params);
  errors.push(...pv.errors);
  if (errors.length) return { errors, warnings: pv.warnings };
  params = params as FxParams;
  return {
    effect: { id, th: doc.th ?? base?.th ?? id, en: doc.en ?? base?.en ?? id, category: doc.category ?? base?.category ?? "ambient", tags: doc.tags ?? base?.tags ?? [], source: "workspace", params },
    errors: [],
    warnings: pv.warnings,
  };
}

export function presetEffect(id: string): ResolvedEffect | undefined {
  const p = presetById(id);
  return p && { id: p.id, th: p.th, en: p.en, category: p.category, tags: p.tags, source: "preset", params: clone(p.params) };
}

export function allPresetEffects(): ResolvedEffect[] {
  return PRESETS.map((p) => presetEffect(p.id)!);
}

export function withOverrides(e: ResolvedEffect, sets: Array<[string, unknown]>): ResolvedEffect {
  const params = clone(e.params);
  for (const [k, v] of sets) applySet(params, k, v);
  const pv = validateParams(params);
  if (pv.errors.length) throw new Error(pv.errors.map((d) => `${d.path}: ${d.message}`).join("\n"));
  return { ...e, params };
}

export function effectSummary(e: ResolvedEffect) {
  const p = e.params;
  return {
    id: e.id, th: e.th, en: e.en, category: e.category, tags: e.tags, source: e.source,
    width: p.size, height: p.height ?? p.size, frames: p.frames, fps: p.fps, loop: p.loop, seed: p.seed,
    layers: p.layers.map((l) => `${l.kind ?? "particles"}${l.name ? `:${l.name}` : ""}`),
  };
}
