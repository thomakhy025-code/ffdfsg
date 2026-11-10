extends Control
## Phone controls from the browser match. The stick sits in from the lower-left
## corner. Attack sits large on the lower right, and the three equipped skills
## arc above it. Throw and Defense show beside the skills only while carrying.

const Balance = preload("res://scripts/balance.gd")

signal attack_pressed
signal throw_pressed
signal guard_pressed
signal skill_pressed(id: String)

var wish := Vector2.ZERO

var _stick: Control
var _knob: Control
var _ring: Control
var _cluster: Control
var _slots: Control
var attack_btn: Button
var throw_btn: Button
var guard_btn: Button
var slot_buttons := {}
var _dragging := false
var _drag_id := -1
var _using_touch := false

const SKILL_ANCHOR := {
	"fireball": Vector2(0.72, 0.66),
	"ice": Vector2(0.64, 0.28),
	"firesword": Vector2(0.28, 0.54),
	"lightning": Vector2(0.36, 0.12),
	"mega": Vector2(0.88, 0.46),
	"saber": Vector2(0.98, 0.78),
}
const SKILL_COLOR := {
	"fireball": "#ffe0cc",
	"ice": "#d7f3ff",
	"firesword": "#ffe7ef",
	"lightning": "#e4e6ff",
	"mega": "#ffd0d0",
	"saber": "#fff3b0",
}


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_grab_nodes()
	visible = OS.has_feature("web") or OS.has_feature("mobile") or DisplayServer.is_touchscreen_available()
	_style_base()
	if not resized.is_connected(_layout):
		resized.connect(_layout)
	call_deferred("_layout")


func _grab_nodes() -> void:
	_stick = get_node_or_null("Stick")
	if _stick == null:
		_stick = Control.new()
		_stick.name = "Stick"
		add_child(_stick)
	_knob = _stick.get_node_or_null("Knob")
	if _knob == null:
		_knob = Panel.new()
		_knob.name = "Knob"
		_stick.add_child(_knob)
	_ring = _stick.get_node_or_null("Ring")
	if _ring == null:
		_ring = Panel.new()
		_ring.name = "Ring"
		_stick.add_child(_ring)
	_cluster = get_node_or_null("SkillCluster")
	if _cluster == null:
		_cluster = Control.new()
		_cluster.name = "SkillCluster"
		add_child(_cluster)
	_slots = _cluster.get_node_or_null("Slots")
	if _slots == null:
		_slots = Control.new()
		_slots.name = "Slots"
		_cluster.add_child(_slots)
	attack_btn = _cluster.get_node_or_null("Attack")
	if attack_btn == null:
		attack_btn = Button.new()
		attack_btn.name = "Attack"
		attack_btn.text = "ATK"
		_cluster.add_child(attack_btn)
	throw_btn = _cluster.get_node_or_null("Throw")
	if throw_btn == null:
		throw_btn = Button.new()
		throw_btn.name = "Throw"
		throw_btn.text = "Throw"
		_cluster.add_child(throw_btn)
	guard_btn = _cluster.get_node_or_null("Defense")
	if guard_btn == null:
		guard_btn = Button.new()
		guard_btn.name = "Defense"
		guard_btn.text = "Defense"
		_cluster.add_child(guard_btn)
	_stick.mouse_filter = Control.MOUSE_FILTER_STOP
	_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_slots.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_slots.set_anchors_preset(Control.PRESET_FULL_RECT)
	if not _stick.gui_input.is_connected(_on_stick_gui):
		_stick.gui_input.connect(_on_stick_gui)
	if not attack_btn.pressed.is_connected(_emit_attack):
		attack_btn.pressed.connect(_emit_attack)
	if not throw_btn.pressed.is_connected(_emit_throw):
		throw_btn.pressed.connect(_emit_throw)
	if not guard_btn.pressed.is_connected(_emit_guard):
		guard_btn.pressed.connect(_emit_guard)
	attack_btn.focus_mode = Control.FOCUS_NONE
	throw_btn.focus_mode = Control.FOCUS_NONE
	guard_btn.focus_mode = Control.FOCUS_NONE
	attack_btn.text = "ATK"
	throw_btn.visible = false
	guard_btn.visible = false
	var parent_node := get_parent()
	if parent_node:
		parent_node.move_child.call_deferred(self, parent_node.get_child_count() - 1)


func _style_base() -> void:
	var stick_fill := Color(0.078, 0.039, 0.125, 0.46)
	var stick_edge := Color(1.0, 0.965, 0.894, 0.78)
	if _stick is Panel:
		_paint_panel(_stick, stick_fill, stick_edge, 3)
	else:
		var base := _stick.get_node_or_null("Base")
		if base == null:
			base = Panel.new()
			base.name = "Base"
			base.mouse_filter = Control.MOUSE_FILTER_IGNORE
			base.set_anchors_preset(Control.PRESET_FULL_RECT)
			_stick.add_child(base)
			_stick.move_child(base, 0)
		_paint_panel(base, stick_fill, stick_edge, 3)
	_paint_panel(_ring, Color(0, 0, 0, 0), Color(1.0, 0.965, 0.894, 0.4), 2)
	_paint_panel(_knob, Color.html("#ffc44d"), Color.html("#1b1428"), 3)
	_paint_button(attack_btn, Color.html("#ffc44d"), 16)
	_paint_button(throw_btn, Color.html("#7ad7ff"), 13)
	_paint_button(guard_btn, Color.html("#9fd7ff"), 11)
	attack_btn.add_theme_color_override("font_color", Color.html("#1b1428"))
	throw_btn.add_theme_color_override("font_color", Color.html("#1b1428"))
	guard_btn.add_theme_color_override("font_color", Color.html("#1b1428"))


func set_skills(ids: Array) -> void:
	if _slots == null:
		return
	for child in _slots.get_children():
		_slots.remove_child(child)
		child.free()
	slot_buttons.clear()
	for id in ids:
		var skill_id := str(id)
		if not SKILL_ANCHOR.has(skill_id):
			continue
		var btn := Button.new()
		btn.name = skill_id
		btn.focus_mode = Control.FOCUS_NONE
		btn.mouse_filter = Control.MOUSE_FILTER_STOP
		btn.text = str(Balance.SHORT.get(skill_id, skill_id))
		_paint_button(btn, Color.html(str(SKILL_COLOR[skill_id])), 12)
		btn.add_theme_color_override("font_color", Color.html("#1b1428"))
		btn.pressed.connect(_emit_skill.bind(skill_id))
		_slots.add_child(btn)
		slot_buttons[skill_id] = btn
	_layout()


func set_carrying(on: bool) -> void:
	if throw_btn:
		throw_btn.visible = on
	if guard_btn:
		guard_btn.visible = on


func set_guard_on(on: bool) -> void:
	if guard_btn == null:
		return
	guard_btn.text = "Defense\nON" if on else "Defense"
	var fill := Color.html("#7ef0ff") if on else Color.html("#9fd7ff")
	_paint_button(guard_btn, fill, 11)
	guard_btn.add_theme_color_override("font_color", Color.html("#083044") if on else Color.html("#1b1428"))


func set_cooldowns(player) -> void:
	for id in slot_buttons.keys():
		var btn: Button = slot_buttons[id]
		var cd := float(player.cds.get(id, 0.0))
		var short := str(Balance.SHORT.get(id, id))
		btn.text = short if cd <= 0.05 else "%.1f" % cd


func _emit_attack() -> void:
	attack_pressed.emit()


func _emit_throw() -> void:
	throw_pressed.emit()


func _emit_guard() -> void:
	guard_pressed.emit()


func _emit_skill(id: String) -> void:
	skill_pressed.emit(id)


func _layout() -> void:
	if _stick == null or _cluster == null:
		return
	var vp := size
	if vp.x < 8.0:
		vp = get_viewport_rect().size
	var narrow := vp.x < 700.0
	var stick_s := 120.0 if narrow else 132.0
	var left := 44.0 if narrow else 48.0
	var bottom := 56.0 if narrow else 64.0
	var knob_s := 52.0 if narrow else 58.0
	_pin_top_left(_stick)
	_stick.position = Vector2(left, vp.y - bottom - stick_s)
	_stick.size = Vector2(stick_s, stick_s)
	_pin_top_left(_knob)
	_knob.size = Vector2(knob_s, knob_s)
	_knob.custom_minimum_size = _knob.size
	if not _dragging:
		_center_knob()
	_pin_top_left(_ring)
	_ring.size = _stick.size * 0.34
	_ring.position = (_stick.size - _ring.size) * 0.5
	var cw := 236.0 if narrow else 268.0
	var ch := 196.0 if narrow else 220.0
	var right := 28.0 if narrow else 32.0
	var cbottom := 40.0 if narrow else 48.0
	_pin_top_left(_cluster)
	_cluster.position = Vector2(vp.x - right - cw, vp.y - cbottom - ch)
	_cluster.size = Vector2(cw, ch)
	_pin_top_left(_slots)
	_slots.position = Vector2.ZERO
	_slots.size = _cluster.size
	var aw := 84.0 if narrow else 96.0
	_place_round(attack_btn, cw - aw, ch - ch * 0.12 - aw, aw)
	var tw := 72.0 if narrow else 80.0
	var guard_right := 84.0 if narrow else 96.0
	_place_round(throw_btn, cw - tw, -14.0 - tw, tw)
	_place_round(guard_btn, cw - guard_right - tw, -14.0 - tw, tw)
	var sw := 64.0 if narrow else 70.0
	for id in slot_buttons.keys():
		var btn: Button = slot_buttons[id]
		var anchor: Vector2 = SKILL_ANCHOR[id]
		_place_round(btn, cw - cw * anchor.x - sw, ch - ch * anchor.y - sw, sw)


func _pin_top_left(node: Control) -> void:
	if node == null:
		return
	node.set_anchors_preset(Control.PRESET_TOP_LEFT)


func _place_round(btn: Button, x: float, y: float, diameter: float) -> void:
	if btn == null:
		return
	_pin_top_left(btn)
	btn.position = Vector2(x, y)
	btn.size = Vector2(diameter, diameter)
	btn.custom_minimum_size = btn.size


func _center_knob() -> void:
	if _knob == null or _stick == null:
		return
	_knob.position = (_stick.size - _knob.size) * 0.5


func _on_stick_gui(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_using_touch = true
			_dragging = true
			_drag_id = touch.index
			_move_knob(touch.position)
		elif _drag_id == touch.index:
			_end_drag()
		_stick.accept_event()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _dragging and drag.index == _drag_id:
			_move_knob(drag.position)
		_stick.accept_event()
	elif event is InputEventMouseButton and not _using_touch:
		var button := event as InputEventMouseButton
		if button.button_index != MOUSE_BUTTON_LEFT:
			return
		if button.pressed:
			_dragging = true
			_drag_id = -2
			_move_knob(button.position)
		elif _drag_id == -2:
			_end_drag()
		_stick.accept_event()
	elif event is InputEventMouseMotion and _dragging and _drag_id == -2 and not _using_touch:
		_move_knob((event as InputEventMouseMotion).position)
		_stick.accept_event()


func _input(event: InputEvent) -> void:
	if not visible or not _dragging:
		return
	if event is InputEventScreenDrag and _drag_id == (event as InputEventScreenDrag).index:
		_move_knob(_stick_local((event as InputEventScreenDrag).position))
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch and not (event as InputEventScreenTouch).pressed and _drag_id == (event as InputEventScreenTouch).index:
		_end_drag()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _drag_id == -2 and not _using_touch:
		_move_knob(_stick_local((event as InputEventMouseMotion).position))
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and _drag_id == -2 and not (event as InputEventMouseButton).pressed and not _using_touch:
		_end_drag()
		get_viewport().set_input_as_handled()


func _stick_local(screen_pos: Vector2) -> Vector2:
	return _stick.get_global_transform_with_canvas().affine_inverse() * screen_pos


func _move_knob(local: Vector2) -> void:
	var center := _stick.size * 0.5
	var delta := local - center
	var max_r := _stick.size.x * 0.36
	var length := delta.length()
	var mag := 0.0
	if length > 0.001 and max_r > 0.001:
		mag = minf(1.0, length / max_r)
		delta = delta / length * mag
	else:
		delta = Vector2.ZERO
	wish = delta
	_knob.position = center + delta * max_r - _knob.size * 0.5


func _end_drag() -> void:
	_dragging = false
	_drag_id = -1
	_using_touch = false
	wish = Vector2.ZERO
	_center_knob()


func _paint_panel(node: Control, fill: Color, edge: Color, border: int) -> void:
	var box := _circle_style(fill, edge, border)
	node.add_theme_stylebox_override("panel", box)


func _paint_button(btn: Button, fill: Color, font_size: int) -> void:
	var edge := Color.html("#1b1428")
	var normal := _circle_style(fill, edge, 3)
	var pressed := _circle_style(fill.darkened(0.12), edge, 3)
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("hover", normal)
	btn.add_theme_stylebox_override("pressed", pressed)
	btn.add_theme_stylebox_override("focus", normal)
	btn.add_theme_stylebox_override("disabled", normal)
	btn.add_theme_font_size_override("font_size", font_size)
	btn.alignment = HORIZONTAL_ALIGNMENT_CENTER


func _circle_style(fill: Color, edge: Color, border: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(80)
	box.set_border_width_all(border)
	box.border_color = edge
	box.content_margin_left = 4
	box.content_margin_right = 4
	box.content_margin_top = 4
	box.content_margin_bottom = 4
	return box
