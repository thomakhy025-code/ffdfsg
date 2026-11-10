extends Node
## Short generated tones played through AudioStreamPlayer.
## Skill ids also get a short pitched accent on top of the wav.

const ACCENT := {
	"fireball": 190.0,
	"ice": 780.0,
	"firesword": 150.0,
	"lightning": 1280.0,
	"mega": 78.0,
	"saber": 560.0,
	"swing": 210.0,
	"swing_fire": 160.0,
	"throw": 490.0,
	"dash": 920.0,
	"explode": 96.0,
	"hop": 640.0,
}


func play(id: String, volume_db: float = -8.0) -> void:
	var path := "res://assets/audio/%s.wav" % id
	if ResourceLoader.exists(path):
		var player := AudioStreamPlayer.new()
		player.stream = load(path)
		player.volume_db = volume_db
		player.finished.connect(player.queue_free)
		add_child(player)
		player.play()
	_accent(id, volume_db)


func _accent(id: String, volume_db: float) -> void:
	if not ACCENT.has(id):
		return
	var rate := 22050
	var count := int(rate * 0.14)
	var data := PackedByteArray()
	data.resize(count * 2)
	var start_hz: float = float(ACCENT[id])
	var phase := 0.0
	for i in count:
		var k := float(i) / float(count)
		var freq := lerpf(start_hz, start_hz * 0.55, k)
		phase += TAU * freq / float(rate)
		var env := (1.0 - k) * (1.0 - k)
		var sample := sin(phase) * env * 0.42 + sin(phase * 2.0) * env * 0.12
		data.encode_s16(i * 2, int(clampf(sample, -1.0, 1.0) * 30000.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = rate
	stream.stereo = false
	stream.data = data
	var tone := AudioStreamPlayer.new()
	tone.stream = stream
	tone.volume_db = volume_db - 3.0
	tone.finished.connect(tone.queue_free)
	add_child(tone)
	tone.play()
