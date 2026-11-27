import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { effectSummary } from "../shared/effects.js";
import { hexToRgb, packSheet, renderFx, upscale, type RenderedFx } from "../shared/sim.js";
import { EXPORT_PRESETS, type ExportPreset, type FxParams, type ParticleLayer, type ResolvedEffect } from "../shared/types.js";
import { RUNTIME_DIR } from "./assets.js";
import { encodePng } from "./png.js";
import { dirs, listEffects, loadEffect, resolveInside } from "./workspace.js";

export { EXPORT_PRESETS, type ExportPreset };
export const VERSION = "0.1.0";

export interface ExportOptions {
  preset?: ExportPreset;
  /** Effect ids (default: every preset + workspace effect). */
  ids?: string[];
  /** Only effects with one of these tags / categories. */
  tags?: string[];
  /** Output folder for a single preset (default exports/easyfx-<preset>). */
  out?: string;
  /** Extra upscaled preview PNGs in the png export. */
  scale?: number;
  /** CLI: paths are the user's own, skip the workspace sandbox. */
  trustedPaths?: boolean;
}

export interface ExportResult {
  dirs: string[];
  files: string[];
  effects: string[];
  warnings: string[];
}

class Writer {
  files: string[] = [];
  constructor(readonly dir: string) {}
  async write(rel: string, body: string | Buffer) {
    const f = path.join(this.dir, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
    this.files.push(f);
  }
  async copy(src: string, rel: string) {
    const f = path.join(this.dir, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await copyFile(src, f);
    this.files.push(f);
  }
}

export interface BakedEffect {
  effect: ResolvedEffect;
  r: RenderedFx;
  png: Buffer;
  sheetW: number;
  sheetH: number;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
}

/** Strip when it fits in 2048 px, else rows. */
export function bake(effect: ResolvedEffect): BakedEffect {
  const r = renderFx(effect.params);
  const cols = Math.max(1, Math.min(r.frames.length, Math.floor(2048 / r.width)));
  const s = packSheet(r, cols);
  return { effect, r, png: encodePng(s.width, s.height, s.data), sheetW: s.width, sheetH: s.height, rects: s.rects };
}

const particleLayers = (p: FxParams) => p.layers.filter((l) => (l.kind ?? "particles") === "particles" && (l as ParticleLayer).count > 0) as ParticleLayer[];

function manifestEntry(b: BakedEffect, sheet: string, data: string) {
  const s = effectSummary(b.effect);
  return { ...s, sheet, data, anchor: b.r.anchor, durationMs: Math.round((b.r.frames.length * 1000) / b.r.fps), rects: b.rects, particleLayers: particleLayers(b.effect.params).length };
}

function frameJson(b: BakedEffect, image: string) {
  const ms = Math.round(1000 / b.r.fps);
  return {
    format: "easyfx-sheet/1",
    id: b.effect.id,
    th: b.effect.th,
    en: b.effect.en,
    image,
    size: { w: b.sheetW, h: b.sheetH },
    frameSize: { w: b.r.width, h: b.r.height },
    fps: b.r.fps,
    loop: b.r.loop,
    anchor: b.r.anchor,
    frames: b.rects.map((r) => ({ ...r, duration: ms })),
    seed: b.effect.params.seed,
    params: b.effect.params,
  };
}

// ---------------------------------------------------------------- PixiJS
export function pixiSheetJson(b: BakedEffect, image: string) {
  const id = b.effect.id;
  const ms = Math.round(1000 / b.r.fps);
  const names = b.rects.map((_, i) => `${id}-${String(i).padStart(2, "0")}`);
  const ax = b.r.anchor.x / b.r.width;
  const ay = b.r.anchor.y / b.r.height;
  return {
    frames: Object.fromEntries(
      b.rects.map((r, i) => [
        names[i],
        { frame: { x: r.x, y: r.y, w: r.w, h: r.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h }, sourceSize: { w: r.w, h: r.h }, anchor: { x: ax, y: ay }, duration: ms },
      ]),
    ),
    animations: { [id]: names },
    meta: {
      app: "https://github.com/Saladin2020/easyfx",
      version: VERSION,
      image,
      format: "RGBA8888",
      size: { w: b.sheetW, h: b.sheetH },
      scale: "1",
      easyfx: { id, th: b.effect.th, en: b.effect.en, fps: b.r.fps, loop: b.r.loop, frames: b.rects.length, anchor: { x: ax, y: ay } },
    },
  };
}

function pixiIndex(): string {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>Easy FX · PixiJS v8 demo</title>
  <style>
    body { margin: 0; background: #140e0a; color: #f7ebd3; font: 14px system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; }
    canvas { image-rendering: pixelated; }
    p { opacity: .7; font-size: 13px; margin: 8px; }
  </style>
</head>
<body>
  <p id="log">Easy FX · every effect, looping (one-shots replay) · click to spawn coin_burst</p>
  <script>
    // Local pixi.min.js if you dropped it next to this file, else the CDN build.
    const load = (srcs) => new Promise((ok, fail) => {
      const next = (i) => { if (i >= srcs.length) return fail(new Error("not found: " + srcs[0])); const s = document.createElement("script"); s.src = srcs[i]; s.onload = ok; s.onerror = () => next(i + 1); document.head.appendChild(s); };
      next(0);
    });
    window.__pixiReady = load(["./pixi.min.js", "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"]);
  </script>
  <script type="module">
    import { loadFx } from "./easyfx-pixi.js";
    await window.__pixiReady;
    const fx = await loadFx(PIXI, "./easyfx.json");
    const COLS = 8, CW = 72, CH = 80;
    const rows = Math.ceil(fx.ids.length / COLS);
    const app = new PIXI.Application();
    await app.init({ width: COLS * CW, height: rows * CH, resolution: 2, antialias: false, background: "#1a120b", roundPixels: true });
    document.body.insertBefore(app.canvas, document.getElementById("log"));
    const sprites = {};
    fx.ids.forEach((id, i) => {
      const x = (i % COLS) * CW + CW / 2, y = Math.floor(i / COLS) * CH + CH - 18;
      const s = fx.play(app.stage, id, x, y, { replay: true });
      sprites[id] = s;
      const t = new PIXI.Text({ text: id, style: { fill: "#b8a080", fontSize: 7, fontFamily: "monospace" } });
      t.anchor.set(0.5, 0); t.position.set(x, y + 4); app.stage.addChild(t);
    });
    const spawned = [];
    app.canvas.addEventListener("pointerdown", (ev) => {
      const r = app.canvas.getBoundingClientRect();
      const s = fx.play(app.stage, "coin_burst", (ev.clientX - r.left) * (app.screen.width / r.width), (ev.clientY - r.top) * (app.screen.height / r.height));
      spawned.push(s);
    });
    window.__fx = { fx, app, sprites, spawned, ids: fx.ids, textures: Object.values(fx.sheets).reduce((a, s) => a + Object.keys(s.textures).length, 0) };
    window.__ready = true;
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- Godot
const gstr = (s: string) => JSON.stringify(s);
const f3 = (n: number) => String(Math.round(n * 1000) / 1000);
const color = (hex: string, a = 1) => {
  const [r, g, b] = hexToRgb(hex);
  return `${f3(r / 255)}, ${f3(g / 255)}, ${f3(b / 255)}, ${f3(a)}`;
};

export function godotSpriteFrames(b: BakedEffect): string {
  const id = b.effect.id;
  const subs = b.rects.map((r, i) => `[sub_resource type="AtlasTexture" id="AtlasTexture_${i}"]\natlas = ExtResource("1_sheet")\nregion = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})\n`).join("\n");
  const frames = b.rects.map((_, i) => `{\n"duration": 1.0,\n"texture": SubResource("AtlasTexture_${i}")\n}`).join(", ");
  return `[gd_resource type="SpriteFrames" load_steps=${b.rects.length + 2} format=3]

[ext_resource type="Texture2D" path="res://easyfx/sheets/${id}.png" id="1_sheet"]

${subs}
[resource]
animations = [{
"frames": [${frames}],
"loop": ${b.r.loop},
"name": &"default",
"speed": ${f3(b.r.fps)}
}]
`;
}

export function godotEffectScene(b: BakedEffect): string {
  const id = b.effect.id;
  return `[gd_scene load_steps=3 format=3]

[ext_resource type="SpriteFrames" path="res://easyfx/frames/${id}.tres" id="1_frames"]
[ext_resource type="Script" path="res://easyfx/easyfx_effect.gd" id="2_script"]

[node name="${id}" type="AnimatedSprite2D"]
texture_filter = 1
sprite_frames = ExtResource("1_frames")
animation = &"default"
centered = false
offset = Vector2(${-b.r.anchor.x}, ${-b.r.anchor.y})
script = ExtResource("2_script")
`;
}

/** One white (or role-coloured) particle at its largest size, for CPUParticles2D textures. */
export function particleTexture(L: ParticleLayer): { png: Buffer; size: number; base: number } {
  const big = Math.max(1, Math.round(Math.max(L.sizeStart, L.sizeEnd ?? L.sizeStart)));
  const fixedRoles = L.shape === "coin" || L.shape === "lantern" || L.shape === "drop";
  const size = (L.shape === "ring" ? big * 2 + 3 : big * 2 + 2) | 0;
  const S = Math.max(4, size + (size % 2));
  const layer: ParticleLayer = { kind: "particles", emit: "burst", count: 1, lifetime: 1000, speed: 0.0001, angle: 90, spread: 0, gravity: 0, emitter: { shape: "point", x: 0.5, y: 0.5 }, shape: L.shape, sizeStart: big, ramp: fixedRoles ? L.ramp : ["#ffffff"], spin: 0 };
  const r = renderFx({ size: S, frames: 1, fps: 1, loop: false, seed: 1, layers: [layer] });
  return { png: encodePng(S, S, r.frames[0]!), size: S, base: big };
}

function godotParticles(b: BakedEffect, texPath: (i: number) => string): string | null {
  const p = b.effect.params;
  const layers = particleLayers(p);
  if (!layers.length) return null;
  const W = p.size;
  const H = p.height ?? p.size;
  const fps = p.fps;
  const subs: string[] = [];
  const nodes: string[] = [];
  const exts: string[] = [];
  layers.forEach((L, i) => {
    const fixed = L.shape === "coin" || L.shape === "lantern" || L.shape === "drop";
    const a = L.alpha ?? 1;
    const ramp = fixed ? ["#ffffff"] : L.ramp;
    const n = ramp.length;
    const offs: number[] = [];
    const cols: string[] = [];
    ramp.forEach((c, k) => {
      offs.push(k / n);
      cols.push(color(c, a));
    });
    const fade = L.fade ?? 1;
    if (fade < 1) {
      offs.push(Math.max(offs[offs.length - 1]! + 0.01, fade + (1 - fade) / 2));
      cols.push(color(ramp[n - 1]!, a * 0.5));
    }
    const randomColour = L.rampMode === "random" && !fixed;
    if (randomColour) {
      // one ramp colour per particle (confetti, leaves): pick at spawn, fade with an alpha-only ramp
      subs.push(`[sub_resource type="Gradient" id="Initial_${i}"]\ninterpolation_mode = 1\noffsets = PackedFloat32Array(${offs.slice(0, n).map(f3).join(", ")})\ncolors = PackedColorArray(${cols.slice(0, n).join(", ")})\n`);
      subs.push(`[sub_resource type="Gradient" id="Gradient_${i}"]\noffsets = PackedFloat32Array(0, ${f3(Math.min(0.99, fade))}, 1)\ncolors = PackedColorArray(1, 1, 1, ${f3(a)}, 1, 1, 1, ${f3(a)}, 1, 1, 1, ${fade < 1 ? 0 : f3(a)})\n`);
    } else subs.push(`[sub_resource type="Gradient" id="Gradient_${i}"]\ninterpolation_mode = 1\noffsets = PackedFloat32Array(${offs.map(f3).join(", ")})\ncolors = PackedColorArray(${cols.join(", ")})\n`);
    const tex = particleTexture(L);
    const s0 = Math.max(0.0001, L.sizeStart);
    const s1 = L.sizeEnd ?? L.sizeStart;
    const ratio = s1 / s0;
    const pts = L.sizeMode === "pulse" ? [[0, 1], [0.5, ratio], [1, 1]] : [[0, 1], [1, ratio]];
    const maxV = Math.max(1, ...pts.map((q) => q[1]!));
    subs.push(`[sub_resource type="Curve" id="Curve_${i}"]\nmax_value = ${f3(maxV)}\n_data = [${pts.map(([x, y]) => `Vector2(${f3(x!)}, ${f3(y!)}), 0.0, 0.0, 0, 0`).join(", ")}]\npoint_count = ${pts.length}\n`);
    exts.push(`[ext_resource type="Texture2D" path="${texPath(i)}" id="tex_${i}"]`);
    const e = L.emitter;
    const anchor = b.r.anchor;
    const pos = `Vector2(${f3(e.x * W - anchor.x)}, ${f3(e.y * H - anchor.y)})`;
    const shape = e.shape === "point" ? 0 : e.shape === "circle" ? 1 : e.shape === "ring" ? 2 : 3;
    const drag = L.drag ? -Math.log(1 - L.drag) : 0;
    const v = L.speed * fps;
    const vmin = v * (1 - (L.speedJitter ?? 0));
    const stream = L.emit === "stream";
    const amount = Math.max(1, stream ? Math.round((L.count * L.lifetime) / p.frames) : L.count);
    const dir = (e.radial ? -90 : L.angle) * (Math.PI / 180);
    const props: Record<string, string> = {
      position: pos,
      texture_filter: "1",
      emitting: "true",
      amount: String(amount),
      lifetime: f3(Math.max(0.05, L.lifetime / fps)),
      one_shot: String(!stream),
      explosiveness: stream ? "0.0" : f3(Math.max(0, 1 - (L.delayJitter ?? 0) / Math.max(1, L.lifetime))),
      lifetime_randomness: f3(L.lifeJitter ?? 0),
      fixed_fps: String(Math.round(fps)),
      texture: `ExtResource("tex_${i}")`,
      emission_shape: String(shape),
      direction: `Vector2(${f3(Math.cos(dir))}, ${f3(Math.sin(dir))})`,
      spread: f3(e.radial ? 180 : L.spread / 2),
      gravity: `Vector2(${f3((L.wind ?? 0) * fps * fps)}, ${f3(L.gravity * fps * fps)})`,
      initial_velocity_min: f3(vmin),
      initial_velocity_max: f3(v),
      scale_amount_min: f3(s0 / tex.base),
      scale_amount_max: f3(s0 / tex.base),
      scale_amount_curve: `SubResource("Curve_${i}")`,
      color_ramp: `SubResource("Gradient_${i}")`,
    };
    if (randomColour) props.color_initial_ramp = `SubResource("Initial_${i}")`;
    if (shape === 1 || shape === 2) props.emission_sphere_radius = f3(e.r ?? 1);
    if (shape === 3) props.emission_rect_extents = `Vector2(${f3((e.w ?? 1) / 2)}, ${f3((e.h ?? 1) / 2)})`;
    if (drag > 0) {
      props.damping_min = f3(drag * fps * v * 0.6);
      props.damping_max = f3(drag * fps * v * 0.6);
    }
    if (L.swirl) {
      props.orbit_velocity_min = f3((L.swirl * fps) / 360);
      props.orbit_velocity_max = f3((L.swirl * fps) / 360);
    }
    if (L.shape === "spark") props.particle_flag_align_y = "true";
    const name = (L.name ?? `layer${i}`).replace(/[^A-Za-z0-9_]/g, "_");
    nodes.push(`[node name="${name}" type="CPUParticles2D" parent="."]\n${Object.entries(props).map(([k, v2]) => `${k} = ${v2}`).join("\n")}\n`);
  });
  return `[gd_scene load_steps=${exts.length + subs.length + 1} format=3]

${exts.join("\n")}

${subs.join("\n")}
[node name="${b.effect.id}" type="Node2D"]

${nodes.join("\n")}`;
}

function godotMain(baked: BakedEffect[], kind: "scenes" | "particles"): string {
  const COLS = 8;
  const CW = 60;
  const CH = 66;
  const list = kind === "scenes" ? baked : baked.filter((b) => particleLayers(b.effect.params).length);
  const nodes = list
    .map((b, i) => {
      const x = (i % COLS) * CW + CW / 2;
      const y = Math.floor(i / COLS) * CH + CH - 12;
      return `[node name="${b.effect.id}" parent="." instance=ExtResource("s${i}")]\nposition = Vector2(${x}, ${y})\n${kind === "scenes" ? "free_when_done = false\nreplay = true\n" : ""}`;
    })
    .join("\n");
  const exts = list.map((b, i) => `[ext_resource type="PackedScene" path="res://easyfx/${kind}/${b.effect.id}.tscn" id="s${i}"]`).join("\n");
  return `[gd_scene load_steps=${list.length + 1} format=3]

${exts}

[node name="${kind === "scenes" ? "Main" : "Particles"}" type="Node2D"]

[node name="Bg" type="ColorRect" parent="."]
offset_right = 480.0
offset_bottom = 270.0
color = Color(0.102, 0.071, 0.043, 1)

${nodes}`;
}

const GODOT_TEST = `extends SceneTree
## Headless check: every SpriteFrames loads with the right frame count, size, fps and loop flag; every scene
## instantiates; every particles preset has one CPUParticles2D per particle layer.

func _init() -> void:
	var f := FileAccess.open("res://easyfx/easyfx.json", FileAccess.READ)
	var man: Dictionary = JSON.parse_string(f.get_as_text())
	var bad := 0
	for e in man["effects"]:
		var id: String = e["id"]
		var sf := load("res://easyfx/frames/%s.tres" % id) as SpriteFrames
		var n := -1
		var ok := sf != null
		if ok:
			n = sf.get_frame_count(&"default")
			var tex := sf.get_frame_texture(&"default", 0) as AtlasTexture
			ok = n == int(e["frames"]) and tex != null and tex.atlas != null and int(tex.region.size.x) == int(e["width"]) and int(tex.region.size.y) == int(e["height"])
			ok = ok and sf.get_animation_loop(&"default") == bool(e["loop"]) and is_equal_approx(sf.get_animation_speed(&"default"), float(e["fps"]))
		var scene := load("res://easyfx/scenes/%s.tscn" % id) as PackedScene
		var node: Node = scene.instantiate() if scene != null else null
		ok = ok and node is AnimatedSprite2D
		if node != null:
			node.free()
		var pc := 0
		var ppath := "res://easyfx/particles/%s.tscn" % id
		if ResourceLoader.exists(ppath):
			var pn: Node = (load(ppath) as PackedScene).instantiate()
			for c in pn.get_children():
				if c is CPUParticles2D and (c as CPUParticles2D).texture != null and (c as CPUParticles2D).color_ramp != null:
					pc += 1
			pn.free()
		ok = ok and pc == int(e["particleLayers"])
		print("F| %s frames=%d loop=%s particles=%d %s" % [id, n, str(e["loop"]), pc, "ok" if ok else "FAIL"])
		if not ok:
			bad += 1
	if ResourceLoader.exists("res://easyfx/scenes/storm_rain.tscn"):
		var Fx = load("res://easyfx/easyfx.gd")
		var holder := Node2D.new()
		var w: Node2D = Fx.weather(holder, "storm", Vector2(192, 96))
		var tiles := w.get_child_count() - 1
		Fx.weather(holder, "clear", Vector2(192, 96))
		var wok := tiles == 8 and holder.get_child_count() == 1
		print("W| weather storm tiles=%d %s" % [tiles, "ok" if wok else "FAIL"])
		if not wok:
			bad += 1
		holder.free()
	var Fx2 = load("res://easyfx/easyfx.gd")
	var h2 := Node2D.new()
	var lt: Node2D = Fx2.lighting(h2, Vector2(192, 96))
	Fx2.set_light(lt, {"tint": [255, 140, 100], "dark": 0.2, "lamps": 0.5}, [Vector3(40, 50, 20), Vector3(120, 50, 20)])
	var lok: bool = lt.get_node("Lamps").get_child_count() == 8 and absf((lt.get_node("Veil") as ColorRect).color.a - 0.2) < 0.001 and (lt.get_node("Tint") as ColorRect).color.r8 == 255
	print("L| lighting lamps=%d %s" % [lt.get_node("Lamps").get_child_count(), "ok" if lok else "FAIL"])
	var depths := [Fx2.flood_depth(0.1), Fx2.flood_depth(0.35), Fx2.flood_depth(0.5), Fx2.flood_depth(0.7), Fx2.flood_depth(1.0)]
	var fl: Node2D = Fx2.flood(h2, Vector2(192, 96), 80.0, 0.7)
	var fok: bool = str(depths) == "[1, 4, 10, 18, 30]" and fl.get_child_count() >= 2 and absf((fl.get_child(0) as ColorRect).position.y - 62.0) < 0.01
	print("D| flood depths=%s %s" % [str(depths), "ok" if fok else "FAIL"])
	if not (lok and fok):
		bad += 1
	h2.free()
	print("OK" if bad == 0 else "FAILED %d" % bad)
	quit(0 if bad == 0 else 1)
`;

const GODOT_SHOT = `extends SceneTree
## xvfb-run -a godot --rendering-driver opengl3 --path . --script res://screenshot.gd   → shot.png (sprite sheets) + shot_particles.png (CPUParticles2D presets)

func _init() -> void:
	for pair in [["res://main.tscn", "res://shot.png", 14], ["res://particles.tscn", "res://shot_particles.png", 26]]:
		var node: Node = (load(pair[0]) as PackedScene).instantiate()
		root.add_child(node)
		for i in int(pair[2]):
			await process_frame
		root.get_viewport().get_texture().get_image().save_png(pair[1])
		node.queue_free()
		await process_frame
	quit()
`;

async function exportGodot(dir: string, baked: BakedEffect[]): Promise<string[]> {
  const w = new Writer(dir);
  for (const b of baked) {
    const id = b.effect.id;
    await w.write(`easyfx/sheets/${id}.png`, b.png);
    await w.write(`easyfx/frames/${id}.tres`, godotSpriteFrames(b));
    await w.write(`easyfx/scenes/${id}.tscn`, godotEffectScene(b));
    const layers = particleLayers(b.effect.params);
    for (const [i, L] of layers.entries()) await w.write(`easyfx/particles/textures/${id}_${i}.png`, particleTexture(L).png);
    const ps = godotParticles(b, (i) => `res://easyfx/particles/textures/${id}_${i}.png`);
    if (ps) await w.write(`easyfx/particles/${id}.tscn`, ps);
  }
  await w.write("easyfx/easyfx.json", `${JSON.stringify({ format: "easyfx-manifest/1", generator: `easyfx ${VERSION}`, effects: baked.map((b) => manifestEntry(b, `sheets/${b.effect.id}.png`, `frames/${b.effect.id}.tres`)) }, null, 2)}\n`);
  await w.copy(path.join(RUNTIME_DIR, "godot", "easyfx_effect.gd"), "easyfx/easyfx_effect.gd");
  await w.copy(path.join(RUNTIME_DIR, "godot", "easyfx.gd"), "easyfx/easyfx.gd");
  await w.write("main.tscn", godotMain(baked, "scenes"));
  await w.write("particles.tscn", godotMain(baked, "particles"));
  await w.write(
    "project.godot",
    `; Engine configuration file. Generated by Easy FX.
config_version=5

[application]

config/name="Easy FX demo"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.3")

[display]

window/size/viewport_width=480
window/size/viewport_height=270
window/size/window_width_override=1440
window/size/window_height_override=810
window/stretch/mode="viewport"

[rendering]

textures/canvas_textures/default_texture_filter=0
`,
  );
  await w.write("test_fx.gd", GODOT_TEST);
  await w.write("screenshot.gd", GODOT_SHOT);
  await w.write(
    "README.txt",
    `Easy FX — Godot 4.3+ export (${baked.length} effects)

Open this folder as a project and press F5: every effect plays in a grid (one-shots replay).

Use it in your own game:
  1. Copy easyfx/ into your project root (resources use res://easyfx/…).
  2. Sprite-sheet effects (pixel-exact, what the PNG shows):
       var fx := preload("res://easyfx/scenes/coin_burst.tscn").instantiate()
       fx.position = coin.global_position
       add_child(fx)        # one-shot effects free themselves; looping ones play forever
     or: preload("res://easyfx/easyfx.gd").spawn(self, "coin_burst", pos)
  3. Live particle presets (approximate, engine-simulated, any length):
       res://easyfx/particles/<id>.tscn — one CPUParticles2D per particle layer, fixed_fps = the effect fps.
       Select a node → CPUParticles2D menu → "Convert to GPUParticles2D" if you want GPU particles.
  The scene origin is the effect anchor (emitter / ground point), same for both kinds.

Check: godot --headless --path . --script res://test_fx.gd   → prints OK
`,
  );
  return w.files;
}

async function exportPixi(dir: string, baked: BakedEffect[]): Promise<string[]> {
  const w = new Writer(dir);
  for (const b of baked) {
    await w.write(`sheets/${b.effect.id}.png`, b.png);
    await w.write(`sheets/${b.effect.id}.json`, `${JSON.stringify(pixiSheetJson(b, `${b.effect.id}.png`), null, 1)}\n`);
  }
  await w.write("easyfx.json", `${JSON.stringify({ format: "easyfx-manifest/1", generator: `easyfx ${VERSION}`, effects: baked.map((b) => manifestEntry(b, `sheets/${b.effect.id}.json`, `sheets/${b.effect.id}.json`)) }, null, 2)}\n`);
  await w.copy(path.join(RUNTIME_DIR, "pixi", "easyfx-pixi.js"), "easyfx-pixi.js");
  await w.write("index.html", pixiIndex());
  return w.files;
}

async function exportPng(dir: string, baked: BakedEffect[], scale?: number): Promise<string[]> {
  const w = new Writer(dir);
  for (const b of baked) {
    await w.write(`sheets/${b.effect.id}.png`, b.png);
    await w.write(`sheets/${b.effect.id}.json`, `${JSON.stringify(frameJson(b, `${b.effect.id}.png`), null, 2)}\n`);
    if (scale && scale > 1) {
      const s = packSheet(b.r, Math.round(b.sheetW / b.r.width));
      await w.write(`previews/${b.effect.id}@${scale}x.png`, encodePng(s.width * scale, s.height * scale, upscale(s.data, s.width, s.height, scale)));
    }
  }
  await w.write("easyfx.json", `${JSON.stringify({ format: "easyfx-manifest/1", generator: `easyfx ${VERSION}`, effects: baked.map((b) => manifestEntry(b, `sheets/${b.effect.id}.png`, `sheets/${b.effect.id}.json`)) }, null, 2)}\n`);
  return w.files;
}

async function exportJson(dir: string, baked: BakedEffect[]): Promise<string[]> {
  const w = new Writer(dir);
  for (const b of baked) await w.write(`effects/${b.effect.id}.json`, `${JSON.stringify({ ...effectSummary(b.effect), params: b.effect.params }, null, 2)}\n`);
  return w.files;
}

export async function selectEffects(root: string, ids?: string[], tags?: string[]): Promise<{ effects: ResolvedEffect[]; warnings: string[] }> {
  const warnings: string[] = [];
  let effects: ResolvedEffect[];
  if (ids?.length) effects = await Promise.all(ids.map((id) => loadEffect(root, id)));
  else {
    const all = await listEffects(root);
    effects = all.effects;
    for (const b of all.broken) warnings.push(`skipped ${b.id}: ${b.errors[0]?.path}: ${b.errors[0]?.message}`);
  }
  if (tags?.length) effects = effects.filter((e) => tags.some((t) => e.tags.includes(t) || e.category === t));
  if (!effects.length) throw new Error("No effects selected");
  return { effects, warnings };
}

export async function exportFx(root: string, opts: ExportOptions = {}): Promise<ExportResult> {
  const preset = opts.preset ?? "all";
  if (!(EXPORT_PRESETS as readonly string[]).includes(preset)) throw new Error(`Unknown export preset ${preset} (${EXPORT_PRESETS.join(", ")})`);
  const { effects, warnings } = await selectEffects(root, opts.ids, opts.tags);
  const baked = effects.map(bake);
  const kinds = preset === "all" ? (["godot", "pixi", "png", "json"] as const) : [preset];
  if (opts.out && kinds.length > 1) throw new Error("--out needs a single preset (godot | pixi | png | json)");
  const res: ExportResult = { dirs: [], files: [], effects: effects.map((e) => e.id), warnings };
  for (const k of kinds) {
    const rel = opts.out ?? path.join(path.relative(root, dirs(root).exports), `easyfx-${k}`);
    const dir = opts.trustedPaths ? path.resolve(root, rel) : resolveInside(root, rel);
    const files = k === "godot" ? await exportGodot(dir, baked) : k === "pixi" ? await exportPixi(dir, baked) : k === "png" ? await exportPng(dir, baked, opts.scale) : await exportJson(dir, baked);
    res.dirs.push(dir);
    res.files.push(...files);
  }
  return res;
}
