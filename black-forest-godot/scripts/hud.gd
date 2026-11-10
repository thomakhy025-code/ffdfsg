extends CanvasLayer
## Match HUD: vitals, the three equipped skills, throw, defense, kill banner.

const Balance = preload("res://scripts/balance.gd")

var sim: Node = null
var hp_bar: ProgressBar
var mp_bar: ProgressBar
var hp_text: Label
var mp_text: Label
var obj_label: Label
var gem_label: Label
var score_label: Label
var clock_label: Label
var weapon_label: Label
var buff_label: Label
var carry_label: Label
var kill_label: Label
var skill_row: HBoxContainer
var attack_btn: Button
var throw_btn: Button
var guard_btn: Button
var help_layer: Control
var result_layer: Control
var result_title: Label
var result_body: Label
var again_btn: Button
var minimap: Control
var _skill_buttons := {}


func _ready() -> void:
	layer = 10
	_build()


func bind_match(match_node: Node) -> void:
	sim = match_node
	_rebuild_skills()
	help_layer.visible = false
	result_layer.visible = false


func show_help() -> void:
	help_layer.visible = true


func hide_help() -> void:
	help_layer.visible = false


func show_result(result: Dictionary) -> void:
	result_layer.visible = true
	var kind := str(result.get("type", "draw"))
	var team := int(result.get("team", -1))
	if kind == "win" and team == 0:
		result_title.text = "Crimson wins"
	elif kind == "win":
		result_title.text = "Azure wins"
	elif kind == "left":
		result_title.text = "Match closed"
	else:
		result_title.text = "Draw"
	if kind == "win":
		result_body.text = "Purse: +2,500 coins, +100 diamonds, +1 draw token."
	elif kind == "left":
		result_body.text = "The other player left."
	else:
		result_body.text = "Time ran out. A draw leaves a pool choice in the armory."
	if again_btn:
		again_btn.text = "Leave" if sim != null and sim.net_role == "client" else "Rematch"


func _process(_delta: float) -> void:
	if sim == null or sim.player == null or sim.phase == "boot":
		return
	var player = sim.player
	hp_bar.max_value = player.max_hp
	hp_bar.value = player.hp
	mp_bar.max_value = maxf(1.0, player.max_mp)
	mp_bar.value = player.mp
	hp_text.text = "HP %d" % int(round(player.hp))
	mp_text.text = "MP %d" % int(round(player.mp))
	obj_label.text = _objective()
	gem_label.text = _gems()
	score_label.text = "Crimson %d   Azure %d" % [int(sim.takedowns[0]), int(sim.takedowns[1])]
	var secs := int(maxf(0.0, sim.clock))
	clock_label.text = "%d:%02d" % [secs / 60, secs % 60]
	weapon_label.text = "Sword" if player.weapon == "sword" else "Bare hand"
	buff_label.text = _buffs(player)
	if player.carrying != null:
		carry_label.text = "Carrying — half speed, no attacks. Throw or F. Defense halves damage for 5 MP/s."
	else:
		carry_label.text = ""
	throw_btn.visible = player.carrying != null
	guard_btn.visible = player.carrying != null
	guard_btn.text = "Defense ON" if player.guard else "Defense"
	if sim.kill_call == null:
		kill_label.visible = false
	else:
		kill_label.visible = true
		kill_label.text = str(sim.kill_call["text"])
		var left := float(sim.kill_call["t"])
		kill_label.modulate.a = 1.0 if left > 0.35 else clampf(left / 0.35, 0.0, 1.0)
	for id in _skill_buttons.keys():
		var btn: Button = _skill_buttons[id]
		var cd := float(player.cds.get(id, 0.0))
		var def: Dictionary = Balance.SKILLS[id]
		var extra := "" if cd <= 0.0 else "  %.1f" % cd
		btn.text = "%s  %s%s" % [def["key"], Balance.SHORT[id], extra]
	if minimap:
		minimap.queue_redraw()


func _objective() -> String:
	var player = sim.player
	var theirs = sim.diamonds[1]
	var mine = sim.diamonds[0]
	if player.carrying == theirs:
		var vault = sim.vaults[0]
		if player.global_position.distance_to(vault["pos"]) <= float(vault["r"]):
			return "Holding the Azure diamond  %.1f / 10s" % float(theirs.bank)
		return "Carry the Azure diamond to your vault"
	if theirs.carrier != null:
		return "%s has the Azure diamond" % theirs.carrier.unit_name
	if mine.carrier != null and mine.carrier.team != 0:
		return "%s has your diamond" % mine.carrier.unit_name
	if not theirs.at_home and theirs.carrier == null:
		return "The Azure diamond is loose"
	return "Steal the Azure diamond. Hold it in your vault for 10 seconds."


func _gems() -> String:
	var parts: Array = []
	for d in sim.diamonds:
		var who := "Crimson" if d.team == 0 else "Azure"
		var state := "home"
		if d.carrier != null:
			state = "carried by %s" % d.carrier.unit_name
		elif d.in_flight:
			state = "in the air"
		elif not d.at_home:
			state = "loose"
		parts.append("%s diamond: %s" % [who, state])
	return "   ".join(parts)


func _buffs(player) -> String:
	var bits: Array = []
	if player.fire_sword_t > 0.0:
		bits.append("Fire sword %d" % int(player.fire_sword_hits))
	if player.shock > 0.0:
		bits.append("Shock")
	if player.slow_cast > 0.0:
		bits.append("Slow cast")
	if player.clones.size() > 0:
		bits.append("Ice %d" % player.clones.size())
	if player.burn != null:
		bits.append("Burn")
	if player.guard:
		bits.append("Defense")
	return "  ".join(bits)


func _rebuild_skills() -> void:
	for child in skill_row.get_children():
		child.queue_free()
	_skill_buttons.clear()
	if sim == null or sim.player == null:
		return
	for id in Balance.SKILL_ORDER:
		if not sim.player.skills.get(id, false):
			continue
		var btn := Button.new()
		btn.focus_mode = Control.FOCUS_NONE
		btn.custom_minimum_size = Vector2(108, 44)
		btn.pressed.connect(_cast.bind(id))
		skill_row.add_child(btn)
		_skill_buttons[id] = btn


func _cast(id: String) -> void:
	if sim == null or sim.phase != "play" or sim.paused or sim.player == null:
		return
	if sim.net_role == "client":
		var idx := Balance.SKILL_ORDER.find(id)
		if idx >= 0:
			Net.note_skill(idx + 1)
		return
	sim.player.try_cast(id)


func _attack() -> void:
	if sim == null or sim.phase != "play" or sim.paused or sim.player == null or sim.player.dead:
		return
	if sim.net_role == "client":
		Net.note_attack()
		return
	var player = sim.player
	if player.root_locked():
		sim.float_at(player.global_position + Vector2(0, -0.9), "CHANNELING", Color(1, 0.69, 0.69))
	elif player.carrying != null:
		sim.float_at(player.global_position + Vector2(0, -0.9), "CAN'T ATTACK", Color.WHITE)
	else:
		player.try_swing()


func _throw() -> void:
	if sim and sim.net_role == "client" and sim.phase == "play":
		Net.note_throw()
		return
	if sim and sim.phase == "play" and not sim.paused:
		sim.throw_diamond(sim.player)


func _guard() -> void:
	if sim and sim.net_role == "client" and sim.phase == "play" and sim.player:
		Net.note_guard()
		return
	if sim and sim.phase == "play" and not sim.paused and sim.player:
		sim.player.toggle_guard()


func _help_pressed() -> void:
	if sim and sim.net_role == "client" and sim.phase == "play":
		show_help()
		return
	if sim and sim.phase == "play":
		sim.paused = true
		show_help()


func _got_it() -> void:
	if sim:
		sim.dismiss_help()


func _restart() -> void:
	if sim and sim.net_role != "offline":
		return
	if sim:
		sim.restart()
		result_layer.visible = false
		help_layer.visible = false


func _rematch() -> void:
	if sim and sim.net_role == "client":
		Net.leave(true)
		return
	var main := get_tree().root.get_node_or_null("Main")
	if main and main.has_method("open_loadout"):
		main.open_loadout("bots")


func _armory() -> void:
	var main := get_tree().root.get_node_or_null("Main")
	if main and main.has_method("show_armory"):
		main.show_armory()


func _build() -> void:
	var top := MarginContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_bottom = 92
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_theme_constant_override("margin_left", 12)
	top.add_theme_constant_override("margin_right", 12)
	top.add_theme_constant_override("margin_top", 8)
	add_child(top)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 16)
	top.add_child(row)
	var vitals := VBoxContainer.new()
	vitals.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(vitals)
	hp_bar = _bar(Color(0.86, 0.22, 0.32))
	mp_bar = _bar(Color(0.25, 0.55, 0.95))
	hp_text = _label("HP", 14)
	mp_text = _label("MP", 14)
	vitals.add_child(hp_text)
	vitals.add_child(hp_bar)
	vitals.add_child(mp_text)
	vitals.add_child(mp_bar)
	var mid := VBoxContainer.new()
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(mid)
	obj_label = _label("Steal the Azure diamond.", 16)
	gem_label = _label("", 13)
	mid.add_child(obj_label)
	mid.add_child(gem_label)
	var side := VBoxContainer.new()
	side.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(side)
	score_label = _label("Crimson 0   Azure 0", 15)
	clock_label = _label("5:00", 18)
	side.add_child(score_label)
	side.add_child(clock_label)
	var btns := HBoxContainer.new()
	btns.mouse_filter = Control.MOUSE_FILTER_IGNORE
	side.add_child(btns)
	var help_btn := Button.new()
	help_btn.text = "Controls"
	help_btn.focus_mode = Control.FOCUS_NONE
	help_btn.pressed.connect(_help_pressed)
	var restart_btn := Button.new()
	restart_btn.text = "Restart match"
	restart_btn.focus_mode = Control.FOCUS_NONE
	restart_btn.pressed.connect(_restart)
	btns.add_child(help_btn)
	btns.add_child(restart_btn)

	var bottom := MarginContainer.new()
	bottom.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -118
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.add_theme_constant_override("margin_left", 12)
	bottom.add_theme_constant_override("margin_right", 12)
	bottom.add_theme_constant_override("margin_bottom", 10)
	add_child(bottom)
	var bot := VBoxContainer.new()
	bot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.add_child(bot)
	var info := HBoxContainer.new()
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bot.add_child(info)
	weapon_label = _label("Sword", 15)
	buff_label = _label("", 14)
	info.add_child(weapon_label)
	info.add_child(buff_label)
	carry_label = _label("", 14)
	bot.add_child(carry_label)
	var actions := HBoxContainer.new()
	actions.mouse_filter = Control.MOUSE_FILTER_IGNORE
	actions.add_theme_constant_override("separation", 8)
	bot.add_child(actions)
	skill_row = HBoxContainer.new()
	skill_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	skill_row.add_theme_constant_override("separation", 8)
	actions.add_child(skill_row)
	attack_btn = Button.new()
	attack_btn.text = "Attack"
	attack_btn.focus_mode = Control.FOCUS_NONE
	attack_btn.custom_minimum_size = Vector2(96, 44)
	attack_btn.pressed.connect(_attack)
	throw_btn = Button.new()
	throw_btn.text = "Throw"
	throw_btn.focus_mode = Control.FOCUS_NONE
	throw_btn.custom_minimum_size = Vector2(88, 44)
	throw_btn.visible = false
	throw_btn.pressed.connect(_throw)
	guard_btn = Button.new()
	guard_btn.text = "Defense"
	guard_btn.focus_mode = Control.FOCUS_NONE
	guard_btn.custom_minimum_size = Vector2(110, 44)
	guard_btn.visible = false
	guard_btn.pressed.connect(_guard)
	actions.add_child(attack_btn)
	actions.add_child(throw_btn)
	actions.add_child(guard_btn)

	kill_label = _label("", 40)
	kill_label.set_anchors_preset(Control.PRESET_CENTER)
	kill_label.offset_left = -460
	kill_label.offset_right = 460
	kill_label.offset_top = -36
	kill_label.offset_bottom = 36
	kill_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kill_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kill_label.visible = false
	kill_label.add_theme_color_override("font_color", Color(1, 0.95, 0.82))
	add_child(kill_label)

	minimap = Control.new()
	minimap.custom_minimum_size = Vector2(176, 100)
	minimap.size = Vector2(176, 100)
	minimap.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	minimap.offset_left = -188
	minimap.offset_top = 96
	minimap.offset_right = -12
	minimap.offset_bottom = 196
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	minimap.draw.connect(_draw_minimap)
	add_child(minimap)

	help_layer = _overlay()
	var help_box := _sheet(help_layer)
	var help_title := _label("Black Forest — how to win", 22)
	help_box.add_child(help_title)
	var help_text := RichTextLabel.new()
	help_text.bbcode_enabled = true
	help_text.fit_content = true
	help_text.scroll_active = false
	help_text.custom_minimum_size = Vector2(760, 0)
	help_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help_text.text = _help_copy()
	help_box.add_child(help_text)
	var got := Button.new()
	got.text = "Got it"
	got.focus_mode = Control.FOCUS_NONE
	got.pressed.connect(_got_it)
	help_box.add_child(got)
	help_layer.visible = false

	result_layer = _overlay()
	var result_box := _sheet(result_layer)
	result_title = _label("Crimson wins", 28)
	result_body = _label("", 16)
	result_box.add_child(result_title)
	result_box.add_child(result_body)
	var result_row := HBoxContainer.new()
	result_row.add_theme_constant_override("separation", 8)
	result_box.add_child(result_row)
	again_btn = Button.new()
	again_btn.text = "Rematch"
	again_btn.focus_mode = Control.FOCUS_NONE
	again_btn.pressed.connect(_rematch)
	var arm := Button.new()
	arm.text = "Armory"
	arm.focus_mode = Control.FOCUS_NONE
	arm.pressed.connect(_armory)
	result_row.add_child(again_btn)
	result_row.add_child(arm)
	result_layer.visible = false


func _bar(color: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(220, 16)
	bar.show_percentage = false
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	var back := StyleBoxFlat.new()
	back.bg_color = Color(0, 0, 0, 0.45)
	bar.add_theme_stylebox_override("fill", fill)
	bar.add_theme_stylebox_override("background", back)
	return bar


func _label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(0.96, 0.94, 0.9))
	return label


func _overlay() -> ColorRect:
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.05, 0.03, 0.08, 0.72)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	return dim


func _sheet(parent: Control) -> VBoxContainer:
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(820, 0)
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.12, 0.09, 0.16, 0.98)
	box.set_corner_radius_all(10)
	box.content_margin_left = 18
	box.content_margin_right = 18
	box.content_margin_top = 16
	box.content_margin_bottom = 16
	panel.add_theme_stylebox_override("panel", box)
	center.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)
	return col


func _help_copy() -> String:
	return """[b]You are Crimson.[/b] Steal the Azure diamond and hold it in your vault for [b]10 seconds[/b]. If a carrier dies, the diamond stays where they fell. Only Crimson can return the Crimson diamond: carry it into your vault and it snaps home at once. Azure wins the same way with yours.

[b]WASD[/b] move. Right-click walks. Swings follow the direction you are facing. [b]J[/b], left-click, or Attack.
Equip exactly three skills. Only those three buttons appear. [b]1[/b] Fireball [b]2[/b] Ice [b]3[/b] Fire Sword [b]4[/b] Lightning [b]5[/b] Mega Explosion [b]6[/b] Lightsaber Beam.
Fireball, a diamond throw, and Lightning all follow your facing. A throw lands [b]1 m[/b] ahead. Lightning dashes [b]4 m[/b]. Anyone hit cannot move for 1 second and can still cast Fireball. For 5 seconds their casts take twice as long.
Mega channels 2.5s. You cannot move, attack, or use other skills. Blast 7 m ahead, radius 5 m, [b]200[/b] damage, teammates included, 70 MP.
Lightsaber channels 1.5s. A lane 7.5 m long and 2 m wide, [b]75[/b] damage, teammates included, 50 MP.
Sword is 0.5 m, 120 degrees, 10 HP. [b]V[/b] switches to bare hand, 5 HP.
While you carry a diamond you cannot swing or cast, and you move at half speed. [b]G[/b] or Defense halves incoming damage for 5 MP each second. [b]F[/b], right-click, or Throw sends it 1 m along your facing.
[b]E[/b] uses a catapult, ladder, spring, sewer, or tower, and repairs your gate. [b]Space[/b] hops.
Rivers and the pond slow you to half speed. Bridges and islands do not. Four bridge towers, 1 m radius, capture in 3 seconds at the door. 200 HP, then down for 20 seconds.
[b]H[/b] opens this. Esc or Enter closes it."""


func _draw_minimap() -> void:
	if sim == null or sim.phase == "boot":
		return
	var rect := minimap.size
	minimap.draw_rect(Rect2(Vector2.ZERO, rect), Color(0, 0, 0, 0.45))
	var scale := Vector2(rect.x / Balance.MAP_W, rect.y / Balance.MAP_H)
	for u in sim.units:
		if u.dead:
			continue
		var col := Color(0.95, 0.28, 0.42) if u.team == 0 else Color(0.3, 0.72, 1)
		minimap.draw_circle(u.global_position * scale, 2.4 if u.is_player else 1.8, col)
	for d in sim.diamonds:
		var gem := Color(1, 0.45, 0.55) if d.team == 0 else Color(0.55, 0.9, 1)
		minimap.draw_circle(d.pos * scale, 2.6, gem)
