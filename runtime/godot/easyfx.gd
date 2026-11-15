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
