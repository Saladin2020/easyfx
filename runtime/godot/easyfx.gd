class_name EasyFx
extends RefCounted
## Spawn helpers for Easy FX exports.
##   EasyFx.spawn(self, "coin_burst", coin.global_position)          # sprite-sheet effect (pixel-exact)
##   EasyFx.spawn(self, "campfire", pos, true)                        # live CPUParticles2D preset

static func spawn(parent: Node, id: String, at: Vector2 = Vector2.ZERO, particles: bool = false) -> Node2D:
	var path := "res://easyfx/%s/%s.tscn" % ["particles" if particles else "scenes", id]
	if not ResourceLoader.exists(path):
		push_error("EasyFx: no effect at " + path)
		return null
	var node := (load(path) as PackedScene).instantiate() as Node2D
	node.position = at
	parent.add_child(node)
	if particles:
		for c in node.get_children():
			if c is CPUParticles2D:
				(c as CPUParticles2D).restart()
	return node

static func ids() -> PackedStringArray:
	var f := FileAccess.open("res://easyfx/easyfx.json", FileAccess.READ)
	var out := PackedStringArray()
	if f == null:
		return out
	var man: Dictionary = JSON.parse_string(f.get_as_text())
	for e in man["effects"]:
		out.append(String(e["id"]))
	return out

## Easy NPC weather → overlay effect + screen tint (same table as the Pixi runtime).
const WEATHER_FX := {
	"clear": {"fx": "", "tint": Color(0, 0, 0, 0)},
	"cloudy": {"fx": "", "tint": Color(0.227, 0.259, 0.314, 0.12)},
	"rain": {"fx": "rain", "tint": Color(0.141, 0.196, 0.29, 0.22)},
	"storm": {"fx": "storm_rain", "tint": Color(0.078, 0.11, 0.173, 0.38)},
	"wind": {"fx": "wind_gust", "tint": Color(0, 0, 0, 0)},
	"fog": {"fx": "fog_drift", "tint": Color(0.867, 0.89, 0.91, 0.28)},
}

## Full-screen weather layer (put it on a CanvasLayer). Call again with a new kind to switch:
##   var w := EasyFx.weather($Overlay, NPCs.weather(), get_viewport_rect().size)
##   NPCs.weather_changed.connect(func(k): EasyFx.weather($Overlay, k, size))
static func weather(parent: Node, kind: String, size: Vector2, scale := 1.0) -> Node2D:
	var old := parent.get_node_or_null("EasyFxWeather")
	if old != null:
		parent.remove_child(old)
		old.queue_free()
	var root := Node2D.new()
	root.name = "EasyFxWeather"
	var info: Dictionary = WEATHER_FX.get(kind, WEATHER_FX["clear"])
	var tint := ColorRect.new()
	tint.color = info["tint"]
	tint.size = size
	tint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(tint)
	var id: String = info["fx"]
	var path := "res://easyfx/scenes/%s.tscn" % id
	if id != "" and ResourceLoader.exists(path):
		var scene := load(path) as PackedScene
		var probe := scene.instantiate() as AnimatedSprite2D
		var fs := Vector2(48, 48)
		if probe != null and probe.sprite_frames != null:
			var tex := probe.sprite_frames.get_frame_texture(probe.animation, 0)
			if tex != null:
				fs = tex.get_size()
		if probe != null:
			probe.free()
		var step := fs * scale
		var k := 0
		var y := 0.0
		while y < size.y:
			var x := 0.0
			while x < size.x:
				var s := scene.instantiate() as Node2D
				s.position = Vector2(x, y) + step * 0.5
				s.scale = Vector2(scale, scale)
				root.add_child(s)
				if s is AnimatedSprite2D:
					(s as AnimatedSprite2D).centered = true
					(s as AnimatedSprite2D).frame = (k * 3) % max(1, (s as AnimatedSprite2D).sprite_frames.get_frame_count((s as AnimatedSprite2D).animation))
				k += 1
				x += step.x
			y += step.y
	root.set_meta("weather", kind)
	parent.add_child(root)
	return root


## Time-of-day lighting (Easy NPC NPCs.light()): multiply tint + darkness veil + lamp glows.
##   var l := EasyFx.lighting($Overlay, size);  EasyFx.set_light(l, NPCs.light(), [Vector3(x, y, r)])
static func lighting(parent: Node, size: Vector2) -> Node2D:
	var old := parent.get_node_or_null("EasyFxLighting")
	if old != null:
		parent.remove_child(old)
		old.queue_free()
	var root := Node2D.new()
	root.name = "EasyFxLighting"
	var tint := ColorRect.new()
	tint.name = "Tint"
	tint.size = size
	tint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
	tint.material = mat
	tint.color = Color(1, 1, 1, 1)
	var veil := ColorRect.new()
	veil.name = "Veil"
	veil.size = size
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	veil.color = Color(0.043, 0.051, 0.149, 0)
	var glow := Node2D.new()
	glow.name = "Lamps"
	var gm := CanvasItemMaterial.new()
	gm.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	glow.material = gm
	root.add_child(tint)
	root.add_child(veil)
	root.add_child(glow)
	parent.add_child(root)
	return root


## light = {tint: [r,g,b] | tintHex, dark, lamps}; lamps = Array of Vector3(x, y, radius).
static func set_light(root: Node2D, light: Dictionary, lamps := []) -> void:
	var t: Array = light.get("tint", [255, 255, 255])
	(root.get_node("Tint") as ColorRect).color = Color8(int(t[0]), int(t[1]), int(t[2]))
	(root.get_node("Veil") as ColorRect).color.a = clampf(float(light.get("dark", 0.0)), 0.0, 1.0)
	var glow := root.get_node("Lamps") as Node2D
	for ch in glow.get_children():
		glow.remove_child(ch)
		ch.queue_free()
	var a := 0.09 * clampf(float(light.get("lamps", 0.0)), 0.0, 1.0)
	if a <= 0.001:
		return
	for p in lamps:
		for ring in [4, 3, 2, 1]:
			var poly := Polygon2D.new()
			var r: float = p.z * ring / 4.0
			var pts := PackedVector2Array()
			for i in 16:
				pts.append(Vector2(p.x, p.y) + Vector2(cos(TAU * i / 16.0), sin(TAU * i / 16.0)) * r)
			poly.polygon = pts
			poly.color = Color(1.0, 0.784, 0.439, a)
			glow.add_child(poly)


## Easy NPC flood level → water depth (px) above the ground line (same table as easyfx-pixi.js / flood.ts).
const FLOOD_DEPTH := [[0.0, 0.0], [0.15, 1.0], [0.35, 4.0], [0.6, 14.0], [0.85, 24.0], [1.0, 30.0]]


static func flood_depth(level: float, rise := 30.0) -> int:
	var l := clampf(level, 0.0, 1.0)
	for i in range(1, FLOOD_DEPTH.size()):
		var a: float = FLOOD_DEPTH[i - 1][0]
		var da: float = FLOOD_DEPTH[i - 1][1]
		var b: float = FLOOD_DEPTH[i][0]
		var db: float = FLOOD_DEPTH[i][1]
		if l <= b:
			return int(floor((da + (l - a) / (b - a) * (db - da)) * (rise / 30.0) + 0.5))
	return int(rise)


## Flood water for a side-view scene: call again with a new level to update.
static func flood(parent: Node, size: Vector2, ground: float, level: float, rise := 30.0) -> Node2D:
	var old := parent.get_node_or_null("EasyFxFlood")
	if old != null:
		parent.remove_child(old)
		old.queue_free()
	var root := Node2D.new()
	root.name = "EasyFxFlood"
	root.set_meta("level", level)
	parent.add_child(root)
	if level < 0.15:
		return root
	var y := ground - flood_depth(level, rise)
	var water := ColorRect.new()
	water.position = Vector2(0, y)
	water.size = Vector2(size.x, size.y - y)
	water.color = Color(0.306, 0.431, 0.369, 0.6)
	water.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(water)
	var line := ColorRect.new()
	line.position = Vector2(0, y)
	line.size = Vector2(size.x, 1)
	line.color = Color(0.847, 0.937, 0.902, 0.8)
	root.add_child(line)
	var path := "res://easyfx/scenes/flood_ripple.tscn"
	if ResourceLoader.exists(path):
		var scene := load(path) as PackedScene
		var x := 24.0
		while x < size.x:
			var s := scene.instantiate() as Node2D
			s.position = Vector2(x, y + 2)
			root.add_child(s)
			x += 48.0
	return root
