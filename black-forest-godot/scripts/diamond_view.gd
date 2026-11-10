extends Node2D

var team := 0
var bob := 0.0


func _process(delta: float) -> void:
	bob += delta
	queue_redraw()


func _draw() -> void:
	var col := Color(1.0, 0.36, 0.5) if team == 0 else Color(0.35, 0.85, 1.0)
	var y := sin(bob * 3.0) * 0.04
	var pts := PackedVector2Array([
		Vector2(0, -0.4 + y),
		Vector2(0.28, -0.05 + y),
		Vector2(0, 0.42 + y),
		Vector2(-0.28, -0.05 + y)
	])
	draw_colored_polygon(pts, col)
	var outline := PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]])
	draw_polyline(outline, Color(1, 1, 1, 0.9), 0.035, true)
	draw_colored_polygon(PackedVector2Array([
		Vector2(-0.08, -0.16 + y), Vector2(0.08, -0.16 + y), Vector2(0, 0.05 + y)
	]), Color(1, 1, 1, 0.8))
