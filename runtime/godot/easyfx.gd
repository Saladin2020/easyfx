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
