extends Node2D

var caption := ""
var tint := Color(0.1, 0.08, 0.16)
var _font: Font


func _ready() -> void:
	_font = ThemeDB.fallback_font
	scale = Vector2(0.028, 0.028)


func _draw() -> void:
	if _font == null or caption == "":
		return
	var size := 16
	var width := _font.get_string_size(caption, HORIZONTAL_ALIGNMENT_CENTER, -1, size).x
	draw_string(_font, Vector2(-width * 0.5, size * 0.35), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, size, tint)
