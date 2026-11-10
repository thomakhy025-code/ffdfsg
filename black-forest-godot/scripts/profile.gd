extends Node
## Local purse, stats, and skill cards. The browser account server is not used.

const SAVE_PATH := "user://black-forest-profile.cfg"
const Balance = preload("res://scripts/balance.gd")

var data := {}


func _ready() -> void:
	_bind_inputs()
	load_data()


func _bind_inputs() -> void:
	_bind("move_up", [KEY_W, KEY_UP])
	_bind("move_down", [KEY_S, KEY_DOWN])
	_bind("move_left", [KEY_A, KEY_LEFT])
	_bind("move_right", [KEY_D, KEY_RIGHT])
	_bind("attack", [KEY_J])
	_bind("throw", [KEY_F])
	_bind("interact", [KEY_E])
	_bind("hop", [KEY_SPACE])
	_bind("weapon", [KEY_V])
	_bind("guard", [KEY_G])
	_bind("help", [KEY_H])
	_bind("dismiss", [KEY_ESCAPE, KEY_ENTER])
	_bind("skill1", [KEY_1])
	_bind("skill2", [KEY_2])
	_bind("skill3", [KEY_3])
	_bind("skill4", [KEY_4])
	_bind("skill5", [KEY_5])
	_bind("skill6", [KEY_6])


func _bind(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	if InputMap.action_get_events(action).size() > 0:
		return
	for key in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = key as Key
		InputMap.action_add_event(action, ev)


func blank() -> Dictionary:
	return {
		"name": "You",
		"gender": "",
		"coins": 10000,
		"diamonds": 1000,
		"stats": {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0},
		"cards": {"fireball": 10, "ice": 10, "firesword": 10, "lightning": 10, "mega": 10, "saber": 10},
		"unlocked": {"fireball": false, "ice": false, "firesword": false, "lightning": false, "mega": false, "saber": false},
		"equipped": {"fireball": false, "ice": false, "firesword": false, "lightning": false, "mega": false, "saber": false},
		"free_unlocks": 2,
		"tokens": 0,
		"pending_draw": false,
		"wins": 0,
		"matches": 0,
		"help_seen": false
	}


func load_data() -> void:
	data = blank()
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	var saved = cfg.get_value("profile", "data", {})
	if typeof(saved) != TYPE_DICTIONARY:
		return
	_merge(data, saved)


func _merge(dst: Dictionary, src: Dictionary) -> void:
	for key in src.keys():
		if dst.has(key) and typeof(dst[key]) == TYPE_DICTIONARY and typeof(src[key]) == TYPE_DICTIONARY:
			for inner in src[key].keys():
				dst[key][inner] = src[key][inner]
		else:
			dst[key] = src[key]


func save_data() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("profile", "data", data)
	cfg.save(SAVE_PATH)


func snapshot() -> Dictionary:
	return data.duplicate(true)


func spent_points() -> int:
	var n := 0
	for key in data["stats"].keys():
		n += int(data["stats"][key])
	return n


func equipped_ids() -> Array:
	var ids: Array = []
	for id in Balance.SKILL_ORDER:
		if data["equipped"].get(id, false):
			ids.append(id)
	return ids


func unlock(id: String) -> Dictionary:
	if data["unlocked"].get(id, false):
		return {"ok": true, "already": true}
	if int(data["cards"].get(id, 0)) < 10:
		return {"ok": false, "reason": "Need 10 %s cards." % Balance.SKILLS[id]["name"]}
	var waived: bool = int(data["free_unlocks"]) > 0
	if not waived and int(data["coins"]) < 10000:
		return {"ok": false, "reason": "Need 10,000 coins."}
	data["cards"][id] = int(data["cards"][id]) - 10
	if waived:
		data["free_unlocks"] = int(data["free_unlocks"]) - 1
	else:
		data["coins"] = int(data["coins"]) - 10000
	data["unlocked"][id] = true
	data["equipped"][id] = true
	save_data()
	return {"ok": true, "waived": waived}


func toggle_equip(id: String) -> void:
	if not data["unlocked"].get(id, false):
		return
	data["equipped"][id] = not bool(data["equipped"][id])
	save_data()


func apply_suggested() -> void:
	data["stats"] = {"agi": 2, "spd": 2, "str": 2, "pwr": 2, "int": 2}
	unlock("fireball")
	unlock("lightning")
	data["equipped"]["fireball"] = bool(data["unlocked"].get("fireball", false))
	data["equipped"]["lightning"] = bool(data["unlocked"].get("lightning", false))
	save_data()


func prepare_loadout() -> void:
	for id in Balance.SKILL_ORDER:
		data["unlocked"][id] = true
	if equipped_ids().size() != 3:
		for id in Balance.SKILL_ORDER:
			data["equipped"][id] = id == "fireball" or id == "ice" or id == "lightning"
	save_data()


func toggle_loadout(id: String) -> void:
	if data["equipped"].get(id, false):
		data["equipped"][id] = false
	elif equipped_ids().size() < 3:
		data["equipped"][id] = true
	save_data()


func roll_draw(pool: String) -> Dictionary:
	var keys: Array = ["fireball", "ice"] if pool == "magic" else ["firesword", "lightning"]
	var got := {"fireball": 0, "ice": 0, "firesword": 0, "lightning": 0}
	for _i in 5:
		var k: String = keys[randi() % keys.size()]
		got[k] = int(got[k]) + 1
		data["cards"][k] = int(data["cards"].get(k, 0)) + 1
	return got


func grant_draws(pool: String, times: int) -> Dictionary:
	var sum := {"fireball": 0, "ice": 0, "firesword": 0, "lightning": 0}
	for _i in times:
		var got := roll_draw(pool)
		for k in sum.keys():
			sum[k] = int(sum[k]) + int(got[k])
	save_data()
	return sum


func format_got(got: Dictionary) -> String:
	var parts: Array = []
	for k in Balance.SKILL_ORDER:
		if int(got.get(k, 0)) > 0:
			parts.append("%d %s" % [int(got[k]), Balance.SKILLS[k]["name"]])
	if parts.is_empty():
		return "nothing"
	return ", ".join(parts)


func note_match(won: bool, draw: bool) -> void:
	data["matches"] = int(data["matches"]) + 1
	if won:
		data["coins"] = int(data["coins"]) + 2500
		data["diamonds"] = int(data["diamonds"]) + 100
		data["tokens"] = int(data["tokens"]) + 1
		data["wins"] = int(data["wins"]) + 1
	elif draw:
		data["pending_draw"] = true
	save_data()
