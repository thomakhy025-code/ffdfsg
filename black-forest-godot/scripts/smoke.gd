extends Node
## Headless check for the Versus Robots match. Quits 0 when the rules hold.

const Balance = preload("res://scripts/balance.gd")
const State = preload("res://scripts/state.gd")
const MatchScene = preload("res://scenes/match.tscn")

var match_node: Node
var failed: Array = []
var start_pos := {}
var done := false


func _ready() -> void:
	match_node = MatchScene.instantiate()
	add_child(match_node)
	var skills := {}
	var unlocked := {}
	for id in Balance.SKILL_ORDER:
		unlocked[id] = true
		skills[id] = id == "fireball" or id == "ice" or id == "lightning"
	match_node.start_match({
		"name": "You",
		"gender": "female",
		"stats": {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0},
		"unlocked": unlocked,
		"equipped": skills
	}, false, false)
	_check("10 units", match_node.units.size() == 10)
	var crimson := 0
	var azure := 0
	for u in match_node.units:
		if u.team == 0:
			crimson += 1
		else:
			azure += 1
		if not u.is_player:
			start_pos[u.unit_id] = u.global_position
	_check("5v5", crimson == 5 and azure == 5)
	_check("4 keeps", match_node.keeps.size() == 4)
	for k in match_node.keeps:
		_check("keep radius 1", absf(float(k["r"]) - 1.0) < 0.01)
	_check("2 bridges", match_node.bridges.size() == 2)
	_check("2 islands", match_node.isles.size() == 2)
	_check("3 water polys", match_node.water_polys.size() == 3)
	var doors := 0
	for w in match_node.walls:
		if w["kind"] == "door":
			doors += 1
	_check("4 doors", doors == 4)
	_check("throw 1m", absf(Balance.THROW_METERS - 1.0) < 0.001)
	_check("fireball cd", absf(float(Balance.SKILLS["fireball"]["cd"]) - 8.0) < 0.001)
	_check("mega mp", absf(float(Balance.SKILLS["mega"]["mp_flat"]) - 70.0) < 0.001)
	_check("saber mp", absf(float(Balance.SKILLS["saber"]["mp_flat"]) - 50.0) < 0.001)
	_check("sword range", absf(Balance.SWORD_RANGE - 0.5) < 0.001)
	_check("dash 4m", absf(Balance.DASH_DIST - 4.0) < 0.001)
	_check("river water", match_node.in_water(Vector2(25, 25.5)))
	_check("pond water", match_node.in_water(Vector2(44, 18)))
	_check("castle dry", not match_node.in_water(Vector2(12, 25)))
	var bridge: Rect2 = match_node.bridges[0]
	_check("bridge dry", not match_node.in_water(bridge.position + bridge.size * 0.5))
	var player = match_node.player
	var base: float = player.move_speed()
	player.carrying = State.new()
	var half: float = player.move_speed()
	player.carrying = null
	_check("carry half speed", absf(half - base * Balance.CARRY_SPEED) < 0.02)
	player.carrying = State.new()
	player.guard = true
	_check("guard halves", absf(match_node.mitigated(player, 10.0) - 5.0) < 0.01)
	player.guard = false
	player.carrying = null
	player.clear_guard()


func _physics_process(_dt: float) -> void:
	if done or match_node == null or match_node.phase != "play":
		return
	if match_node.shots.is_empty() and match_node.time < 0.05:
		var player = match_node.player
		player.global_position = Vector2(30, 20)
		player.facing = 0.0
		var gem = match_node.diamonds[1]
		gem.carrier = null
		gem.at_home = false
		player.carrying = gem
		match_node.throw_diamond(player)
		if match_node.shots.is_empty():
			_check("throw shot", false)
		else:
			var shot = match_node.shots[match_node.shots.size() - 1]
			var dist: float = shot.dest.distance_to(Vector2(30, 20))
			_check("throw lands 1m", absf(dist - 1.0) < 0.05)
	if match_node.time < 2.4:
		return
	done = true
	var moved := false
	for u in match_node.units:
		if u.is_player or not start_pos.has(u.unit_id):
			continue
		if u.global_position.distance_to(start_pos[u.unit_id]) > 0.2:
			moved = true
	_check("a bot moved", moved)
	var victim = null
	for u in match_node.units:
		if u.team == 1 and not u.dead:
			victim = u
			break
	match_node.kill_unit(victim, match_node.player)
	var text := ""
	if match_node.kill_call != null:
		text = str(match_node.kill_call["text"])
	_check("kill banner", text.find(" kill ") >= 0)
	if failed.is_empty():
		print("SMOKE OK")
		get_tree().quit(0)
	else:
		for item in failed:
			print("SMOKE FAIL: ", item)
		get_tree().quit(1)


func _check(label: String, ok: bool) -> void:
	if not ok:
		failed.append(label)
		print("FAIL ", label)
