extends Node
## Title, armory, testing loadout, and the Versus Robots match.
## Play online joins a dedicated server. The server process is started with --server.

const Balance = preload("res://scripts/balance.gd")
const MatchScene = preload("res://scenes/match.tscn")

var match_node: Node = null
var loadout_mode := "fresh"
var ui: CanvasLayer
var title: Control
var armory: Control
var loadout: Control
var online: Control
var name_edit: LineEdit
var continue_btn: Button
var male_btn: Button
var female_btn: Button
var purse_label: Label
var points_label: Label
var status_label: Label
var skill_box: VBoxContainer
var loadout_box: VBoxContainer
var loadout_count: Label
var deploy_btn: Button
var online_status: Label
var address_edit: LineEdit
var port_edit: LineEdit
var stat_value := {}
const STAT_NAMES := ["agi", "spd", "str", "pwr", "int"]
const STAT_LABELS := {"agi": "AGI", "spd": "SPD", "str": "STR", "pwr": "PWR", "int": "INT"}


func _ready() -> void:
	ui = $UI
	if Net.role == "server":
		ui.visible = false
		return
	_build_title()
	_build_armory()
	_build_loadout()
	_build_online()
	if not Net.status_changed.is_connected(_on_net_status):
		Net.status_changed.connect(_on_net_status)
	if Net.role == "client":
		online_status.text = Net.status
		_show_screen("online")
	else:
		_show_screen("title")
	if str(Profile.data.get("gender", "")) == "male" or str(Profile.data.get("gender", "")) == "female":
		_mark_gender(str(Profile.data["gender"]))


func _on_net_status() -> void:
	if online_status:
		online_status.text = Net.status


func show_armory() -> void:
	_close_match()
	_refresh_armory()
	_show_screen("armory")


func open_loadout(mode: String) -> void:
	loadout_mode = mode
	Profile.prepare_loadout()
	_close_match()
	_refresh_loadout()
	_show_screen("loadout")


func _show_screen(which: String) -> void:
	ui.visible = true
	title.visible = which == "title"
	armory.visible = which == "armory"
	loadout.visible = which == "loadout"
	online.visible = which == "online"


func _close_match() -> void:
	if match_node != null and is_instance_valid(match_node):
		match_node.queue_free()
	match_node = null


func _deploy() -> void:
	if Profile.equipped_ids().size() != 3:
		return
	var data: Dictionary = Profile.snapshot()
	if str(data.get("gender", "")) != "male" and str(data.get("gender", "")) != "female":
		data["gender"] = "female"
	var show_help := loadout_mode != "bots" and not bool(data.get("help_seen", false))
	_close_match()
	match_node = MatchScene.instantiate()
	add_child(match_node)
	ui.visible = false
	match_node.start_match(data, true, show_help)


func _enter_armory() -> void:
	var written := name_edit.text.strip_edges()
	if written != "":
		Profile.data["name"] = written
	if str(Profile.data.get("gender", "")) == "":
		return
	Profile.save_data()
	show_armory()


func _mark_gender(which: String) -> void:
	Profile.data["gender"] = which
	Profile.save_data()
	continue_btn.disabled = false
	male_btn.modulate = Color(1, 0.82, 0.86) if which == "male" else Color.WHITE
	female_btn.modulate = Color(0.8, 0.9, 1) if which == "female" else Color.WHITE


func _change_stat(key: String, delta: int) -> void:
	var current := int(Profile.data["stats"][key])
	if delta > 0 and Profile.spent_points() >= 10:
		status_label.text = "All 10 stat points are spent."
		return
	if delta < 0 and current <= 0:
		return
	Profile.data["stats"][key] = current + delta
	Profile.save_data()
	_refresh_armory()


func _unlock(id: String) -> void:
	var result: Dictionary = Profile.unlock(id)
	status_label.text = str(result.get("reason", "Unlocked.")) if not result.get("ok", false) else "Unlocked."
	_refresh_armory()


func _equip(id: String) -> void:
	Profile.toggle_equip(id)
	_refresh_armory()


func _suggested() -> void:
	Profile.apply_suggested()
	status_label.text = "Suggested build: 2 in every stat, Fireball and Lightning."
	_refresh_armory()


func _spend_token(pool: String) -> void:
	if bool(Profile.data.get("pending_draw", false)):
		Profile.data["pending_draw"] = false
		var got: Dictionary = Profile.grant_draws(pool, 1)
		status_label.text = "Draw: %s" % Profile.format_got(got)
		_refresh_armory()
		return
	if int(Profile.data["tokens"]) <= 0:
		status_label.text = "No draw tokens."
		return
	Profile.data["tokens"] = int(Profile.data["tokens"]) - 1
	var got2: Dictionary = Profile.grant_draws(pool, 1)
	status_label.text = "Token draw: %s" % Profile.format_got(got2)
	_refresh_armory()


func _premium(pool: String) -> void:
	if int(Profile.data["diamonds"]) < 1000:
		status_label.text = "Need 1,000 diamonds."
		return
	Profile.data["diamonds"] = int(Profile.data["diamonds"]) - 1000
	var got: Dictionary = Profile.grant_draws(pool, 10)
	status_label.text = "Premium: %s" % Profile.format_got(got)
	_refresh_armory()


func _refresh_armory() -> void:
	var data: Dictionary = Profile.data
	purse_label.text = "%s   %d coins   %d diamonds   %d tokens   %d wins" % [
		str(data.get("name", "You")), int(data["coins"]), int(data["diamonds"]), int(data["tokens"]), int(data["wins"])
	]
	points_label.text = "%d / 10 points spent. Each point is +0.5%% to its stat. STR adds HP, INT adds MP." % Profile.spent_points()
	for key in STAT_NAMES:
		stat_value[key].text = str(int(data["stats"][key]))
	for child in skill_box.get_children():
		child.queue_free()
	for id in Balance.SKILL_ORDER:
		var def: Dictionary = Balance.SKILLS[id]
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation", 8)
		var info := Label.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var owned := "unlocked" if data["unlocked"].get(id, false) else "locked"
		var on := "equipped" if data["equipped"].get(id, false) else "not equipped"
		info.text = "%s  %s   %d cards   %s   %s   %s" % [
			def["key"], def["name"], int(data["cards"].get(id, 0)), owned, on, Balance.mp_label(def)
		]
		line.add_child(info)
		if not data["unlocked"].get(id, false):
			var unlock := Button.new()
			unlock.text = "Unlock"
			unlock.focus_mode = Control.FOCUS_NONE
			unlock.pressed.connect(_unlock.bind(id))
			line.add_child(unlock)
		else:
			var equip := Button.new()
			equip.text = "Unequip" if data["equipped"].get(id, false) else "Equip"
			equip.focus_mode = Control.FOCUS_NONE
			equip.pressed.connect(_equip.bind(id))
			line.add_child(equip)
		skill_box.add_child(line)
	if bool(data.get("pending_draw", false)):
		status_label.text = "The last match was a draw. Pick Magic or Sword to take the draw."


func _refresh_loadout() -> void:
	for child in loadout_box.get_children():
		child.queue_free()
	for id in Balance.SKILL_ORDER:
		var def: Dictionary = Balance.SKILLS[id]
		var btn := Button.new()
		var on: bool = bool(Profile.data["equipped"].get(id, false))
		btn.text = "%s  %s   %s" % [def["key"], def["name"], "selected" if on else ""]
		btn.focus_mode = Control.FOCUS_NONE
		btn.pressed.connect(_toggle_loadout.bind(id))
		loadout_box.add_child(btn)
	var count := Profile.equipped_ids().size()
	loadout_count.text = "%d / 3 equipped. Deploy needs exactly three." % count
	deploy_btn.disabled = count != 3


func _toggle_loadout(id: String) -> void:
	Profile.toggle_loadout(id)
	_refresh_loadout()


func _open_online() -> void:
	online_status.text = Net.status
	_show_screen("online")


func _join_online() -> void:
	var addr := address_edit.text.strip_edges()
	if addr == "":
		addr = "127.0.0.1"
	var prt := int(port_edit.text) if port_edit.text.is_valid_int() else 7777
	if Profile.equipped_ids().size() != 3:
		Profile.prepare_loadout()
	var data: Dictionary = Profile.snapshot()
	if str(data.get("gender", "")) != "male" and str(data.get("gender", "")) != "female":
		data["gender"] = "female"
	var skills := {}
	var unlocked: Dictionary = data.get("unlocked", {})
	var equipped: Dictionary = data.get("equipped", {})
	for id in Balance.SKILL_ORDER:
		skills[id] = bool(unlocked.get(id, false)) and bool(equipped.get(id, false))
	Net.start_client(addr, prt, {
		"name": str(data.get("name", "You")),
		"gender": str(data.get("gender", "female")),
		"stats": data.get("stats", {}),
		"skills": skills
	})
	online_status.text = Net.status


func _disconnect_online() -> void:
	Net.leave(false)
	online_status.text = Net.status
	_show_screen("online")


func _build_title() -> void:
	title = _screen()
	var col := _center_column(title)
	col.add_child(_title_label("Titania · 5v5", 14))
	col.add_child(_title_label("Black Forest", 42))
	col.add_child(_title_label("Capture the Diamond", 18))
	var lede := _title_label("Steal the enemy Team Diamond, carry it to your vault, and hold it there for 10 seconds.", 15)
	lede.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lede.custom_minimum_size = Vector2(640, 0)
	lede.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(lede)
	name_edit = LineEdit.new()
	name_edit.placeholder_text = "Display name"
	name_edit.text = str(Profile.data.get("name", "You"))
	name_edit.custom_minimum_size = Vector2(320, 36)
	col.add_child(name_edit)
	var genders := HBoxContainer.new()
	genders.add_theme_constant_override("separation", 16)
	genders.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(genders)
	male_btn = _gender_button("Male", "res://assets/art/boy-sheet.png")
	female_btn = _gender_button("Female", "res://assets/art/girl-sheet.png")
	male_btn.pressed.connect(_mark_gender.bind("male"))
	female_btn.pressed.connect(_mark_gender.bind("female"))
	genders.add_child(male_btn)
	genders.add_child(female_btn)
	continue_btn = Button.new()
	continue_btn.text = "Enter the armory"
	continue_btn.disabled = true
	continue_btn.focus_mode = Control.FOCUS_NONE
	continue_btn.pressed.connect(_enter_armory)
	col.add_child(continue_btn)


func _build_armory() -> void:
	armory = _screen()
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	armory.add_child(margin)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 10)
	scroll.add_child(col)
	col.add_child(_title_label("Armory", 28))
	purse_label = _title_label("", 15)
	col.add_child(purse_label)
	points_label = _title_label("", 14)
	col.add_child(points_label)
	for key in STAT_NAMES:
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation", 8)
		var name := Label.new()
		name.text = STAT_LABELS[key]
		name.custom_minimum_size = Vector2(48, 0)
		name.add_theme_color_override("font_color", Color(0.96, 0.94, 0.9))
		var minus := Button.new()
		minus.text = "-"
		minus.focus_mode = Control.FOCUS_NONE
		minus.pressed.connect(_change_stat.bind(key, -1))
		var value := Label.new()
		value.custom_minimum_size = Vector2(28, 0)
		value.add_theme_color_override("font_color", Color(0.96, 0.94, 0.9))
		var plus := Button.new()
		plus.text = "+"
		plus.focus_mode = Control.FOCUS_NONE
		plus.pressed.connect(_change_stat.bind(key, 1))
		line.add_child(name)
		line.add_child(minus)
		line.add_child(value)
		line.add_child(plus)
		col.add_child(line)
		stat_value[key] = value
	var suggested := Button.new()
	suggested.text = "Suggested build"
	suggested.focus_mode = Control.FOCUS_NONE
	suggested.pressed.connect(_suggested)
	col.add_child(suggested)
	col.add_child(_title_label("Skills — unlock is 10 cards and 10,000 coins. The first two unlocks waive the coins.", 14))
	skill_box = VBoxContainer.new()
	skill_box.add_theme_constant_override("separation", 4)
	col.add_child(skill_box)
	status_label = _title_label("", 14)
	col.add_child(status_label)
	col.add_child(_title_label("Magic pool: Fireball, Ice. Sword pool: Fire Sword, Lightning. One draw is 5 cards. Premium is 1,000 diamonds for 10 draws.", 14))
	var draws := HBoxContainer.new()
	draws.add_theme_constant_override("separation", 8)
	col.add_child(draws)
	draws.add_child(_pool_button("Token · Magic", _spend_token.bind("magic")))
	draws.add_child(_pool_button("Token · Sword", _spend_token.bind("sword")))
	draws.add_child(_pool_button("Premium · Magic", _premium.bind("magic")))
	draws.add_child(_pool_button("Premium · Sword", _premium.bind("sword")))
	var note := _title_label("You deploy with a sword (10 HP). Bare hand is 5. Carrying a diamond is half speed and no attacks. Defense halves damage for 5 MP/s. Versus robots is the bot match.", 14)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(note)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	col.add_child(actions)
	var look := Button.new()
	look.text = "Change look"
	look.focus_mode = Control.FOCUS_NONE
	look.pressed.connect(_show_screen.bind("title"))
	var bots := Button.new()
	bots.text = "Versus robots"
	bots.focus_mode = Control.FOCUS_NONE
	bots.pressed.connect(open_loadout.bind("fresh"))
	var net := Button.new()
	net.text = "Play online"
	net.focus_mode = Control.FOCUS_NONE
	net.pressed.connect(_open_online)
	actions.add_child(look)
	actions.add_child(bots)
	actions.add_child(net)


func _build_loadout() -> void:
	loadout = _screen()
	var col := _center_column(loadout)
	col.add_child(_title_label("Testing loadout", 28))
	var hint := _title_label("All six skills are unlocked. Equip exactly three. Only those three appear as buttons, and only they can be cast.", 15)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size = Vector2(560, 0)
	col.add_child(hint)
	loadout_box = VBoxContainer.new()
	loadout_box.custom_minimum_size = Vector2(420, 0)
	loadout_box.add_theme_constant_override("separation", 6)
	col.add_child(loadout_box)
	loadout_count = _title_label("", 14)
	col.add_child(loadout_count)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(row)
	deploy_btn = Button.new()
	deploy_btn.text = "Deploy"
	deploy_btn.focus_mode = Control.FOCUS_NONE
	deploy_btn.pressed.connect(_deploy)
	var back := Button.new()
	back.text = "Back"
	back.focus_mode = Control.FOCUS_NONE
	back.pressed.connect(show_armory)
	row.add_child(deploy_btn)
	row.add_child(back)


func _build_online() -> void:
	online = _screen()
	var col := _center_column(online)
	col.add_child(_title_label("Play online", 28))
	var hint := _title_label("Join a dedicated server. The first player is Crimson, the second is Azure, and bots fill the other eight seats. The server decides hits, diamonds, and the win. Your client predicts your own movement. Start the server with --headless -- --server. Default port is UDP 7777. Versus Robots does not use this server.", 15)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size = Vector2(640, 0)
	col.add_child(hint)
	address_edit = LineEdit.new()
	address_edit.text = "127.0.0.1"
	address_edit.placeholder_text = "Server address"
	address_edit.custom_minimum_size = Vector2(320, 36)
	col.add_child(address_edit)
	port_edit = LineEdit.new()
	port_edit.text = "7777"
	port_edit.placeholder_text = "Port"
	port_edit.custom_minimum_size = Vector2(160, 36)
	col.add_child(port_edit)
	online_status = _title_label(Net.status, 15)
	online_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	online_status.custom_minimum_size = Vector2(640, 0)
	col.add_child(online_status)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	col.add_child(row)
	var join := Button.new()
	join.text = "Join server"
	join.focus_mode = Control.FOCUS_NONE
	join.pressed.connect(_join_online)
	var close := Button.new()
	close.text = "Disconnect"
	close.focus_mode = Control.FOCUS_NONE
	close.pressed.connect(_disconnect_online)
	var back := Button.new()
	back.text = "Back"
	back.focus_mode = Control.FOCUS_NONE
	back.pressed.connect(_disconnect_online)
	back.pressed.connect(show_armory)
	row.add_child(join)
	row.add_child(close)
	row.add_child(back)


func _screen() -> Control:
	var screen := Control.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(screen)
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.106, 0.078, 0.157)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen.add_child(bg)
	return screen


func _center_column(parent: Control) -> VBoxContainer:
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(center)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(col)
	return col


func _title_label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(0.96, 0.93, 0.86))
	return label


func _gender_button(caption: String, art: String) -> Button:
	var btn := Button.new()
	btn.focus_mode = Control.FOCUS_NONE
	btn.custom_minimum_size = Vector2(300, 220)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	btn.add_child(col)
	var tex := TextureRect.new()
	tex.texture = load(art)
	tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tex.custom_minimum_size = Vector2(280, 160)
	tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(tex)
	var caption_label := Label.new()
	caption_label.text = caption
	caption_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(caption_label)
	return btn


func _pool_button(text: String, callback: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.focus_mode = Control.FOCUS_NONE
	btn.pressed.connect(callback)
	return btn
