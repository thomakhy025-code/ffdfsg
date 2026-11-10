extends Node
## Short generated tones played through AudioStreamPlayer.

func play(id: String, volume_db: float = -8.0) -> void:
	var path := "res://assets/audio/%s.wav" % id
	if not ResourceLoader.exists(path):
		return
	var player := AudioStreamPlayer.new()
	player.stream = load(path)
	player.volume_db = volume_db
	player.finished.connect(player.queue_free)
	add_child(player)
	player.play()
