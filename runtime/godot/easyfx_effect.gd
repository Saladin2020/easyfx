extends AnimatedSprite2D
## Easy FX effect player (attached to every res://easyfx/scenes/<id>.tscn).
## Looping effects play forever. One-shot effects free themselves when they finish, unless
## free_when_done is off; replay = true restarts them after replay_gap seconds (the demo grid does this).

signal finished_once

@export var free_when_done := true
@export var replay := false
@export var replay_gap := 0.6

func _ready() -> void:
	animation_finished.connect(_on_finished)
	play(&"default")

func restart() -> void:
	frame = 0
	play(&"default")

func _on_finished() -> void:
	finished_once.emit()
	if replay:
		await get_tree().create_timer(replay_gap).timeout
		if is_inside_tree():
			restart()
	elif free_when_done:
		queue_free()
