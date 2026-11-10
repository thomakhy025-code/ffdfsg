extends Node2D
## Versus Robots match. Units are CharacterBody2D nodes. Gates, trees, rocks,
## and the map edge are Godot physics bodies. Skills use the numbers in game.js.

const Balance = preload("res://scripts/balance.gd")
const WorldBuilder = preload("res://scripts/world_builder.gd")
const State = preload("res://scripts/state.gd")
const DiamondView = preload("res://scripts/diamond_view.gd")
const UnitScene = preload("res://scenes/unit.tscn")

@export var unit_scene: PackedScene

var phase := "boot"
var net_role := "offline"
var paused := false
var record := true
var time := 0.0
var clock := Balance.MATCH_TIME
var takedowns := [0, 0]
var shake := 0.0
var units: Array = []
var player = null
var diamonds: Array = []
var walls: Array = []
var trees: Array = []
var rocks: Array = []
var keeps: Array = []
var towers: Array = []
var outpost = null
var sewers: Array = []
var catapults: Array = []
var ladders: Array = []
var springs: Array = []
var cakes: Array = []
var vaults: Array = []
var diamond_homes: Array = []
var bridges: Array = []
var isles: Array = []
var water_polys: Array = []
var fires: Array = []
var shots: Array = []
var floats: Array = []
var bursts: Array = []
var mega_fx: Array = []
var saber_fx: Array = []
var kill_call = null
var result = null
var last_data: Dictionary = {}
var _clone_seq := 1

@onready var camera: Camera2D = $Camera2D
@onready var unit_root: Node2D = $Units
@onready var hud: Node = $HUD


func _ready() -> void:
	camera.zoom = Vector2(32, 32)
	camera.make_current()


func start_match(data: Dictionary, record_results: bool = true, show_help: bool = false) -> void:
	last_data = data.duplicate(true)
	record = record_results
	phase = "boot"
	paused = false
	result = null
	kill_call = null
	time = 0.0
	clock = Balance.MATCH_TIME
	takedowns = [0, 0]
	shake = 0.0
	fires.clear()
	shots.clear()
	floats.clear()
	bursts.clear()
	mega_fx.clear()
	saber_fx.clear()
	for child in unit_root.get_children():
		child.free()
	units.clear()
	diamonds.clear()
	WorldBuilder.populate(self)
	_spawn_diamonds()
	_spawn_units(data)
	camera.global_position = player.global_position
	camera.make_current()
	phase = "play"
	paused = show_help
	if hud and hud.has_method("bind_match"):
		hud.bind_match(self)
	if show_help and hud and hud.has_method("show_help"):
		hud.show_help()
	elif hud and hud.has_method("hide_help"):
		hud.hide_help()


func restart() -> void:
	start_match(last_data, record, false)


func dismiss_help() -> void:
	paused = false
	if Profile:
		Profile.data["help_seen"] = true
		Profile.save_data()
	if hud and hud.has_method("hide_help"):
		hud.hide_help()


func _physics_process(dt: float) -> void:
	if net_role != "offline":
		return
	if phase == "play" and paused:
		if Input.is_action_just_pressed("dismiss") or Input.is_action_just_pressed("help"):
			dismiss_help()
		return
	if phase != "play":
		return
	_poll_actions()
	tick(minf(dt, 0.05))


func _unhandled_input(event: InputEvent) -> void:
	if net_role == "client":
		if phase != "play" or player == null or not (event is InputEventMouseButton) or not event.pressed:
			return
		if event.button_index == MOUSE_BUTTON_RIGHT:
			if player.carrying != null:
				Net.note_throw()
			else:
				player.click_target = get_global_mouse_position()
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_LEFT:
			Net.note_attack()
			get_viewport().set_input_as_handled()
		return
	if phase != "play" or paused or player == null:
		return
	if event is InputEventMouseButton and event.pressed:
		var world := get_global_mouse_position()
		if event.button_index == MOUSE_BUTTON_RIGHT:
			if player.carrying != null:
				throw_diamond(player)
			else:
				player.click_target = world
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if player.carrying != null:
				float_at(player.global_position + Vector2(0, -0.9), "CAN'T ATTACK", Color.WHITE)
			elif player.root_locked():
				float_at(player.global_position + Vector2(0, -0.9), "CHANNELING", Color(1, 0.69, 0.69))
			else:
				player.try_swing()
			get_viewport().set_input_as_handled()


func _poll_actions() -> void:
	if player == null:
		return
	if Input.is_action_just_pressed("help"):
		paused = true
		if hud and hud.has_method("show_help"):
			hud.show_help()
		return
	if player.dead:
		return
	if Input.is_action_just_pressed("attack"):
		if player.root_locked():
			float_at(player.global_position + Vector2(0, -0.9), "CHANNELING", Color(1, 0.69, 0.69))
		elif player.carrying != null:
			float_at(player.global_position + Vector2(0, -0.9), "CAN'T ATTACK", Color.WHITE)
		else:
			player.try_swing()
	if Input.is_action_just_pressed("throw"):
		throw_diamond(player)
	if Input.is_action_just_pressed("interact"):
		interact(player)
	if Input.is_action_just_pressed("hop"):
		player.try_hop()
	if Input.is_action_just_pressed("weapon"):
		player.toggle_weapon()
	if Input.is_action_just_pressed("guard"):
		player.toggle_guard()
	var keys := ["skill1", "skill2", "skill3", "skill4", "skill5", "skill6"]
	for i in keys.size():
		if Input.is_action_just_pressed(keys[i]):
			var id: String = Balance.SKILL_ORDER[i]
			if player.skills.get(id, false):
				player.try_cast(id)


func tick(dt: float) -> void:
	time += dt
	for d in diamonds:
		if d.throw_lock > 0.0:
			d.throw_lock -= dt
		if d.drop_delay > 0.0:
			d.drop_delay -= dt
	for u in units:
		u.tick(dt)
	for u in units:
		_separate(u)
	update_shots(dt)
	_tick_fires(dt)
	for u in units:
		var live: Array = []
		for c in u.clones:
			if c.alive and c.hp > 0.0:
				live.append(c)
			elif c.node and is_instance_valid(c.node):
				c.node.queue_free()
		u.clones = live
	resolve_pickups()
	tick_keeps(dt)
	tick_points(dt)
	tick_returns()
	tick_banks(dt)
	if kill_call != null:
		kill_call["t"] = float(kill_call["t"]) - dt
		if float(kill_call["t"]) <= 0.0:
			kill_call = null
	_tick_cakes(dt)
	if phase == "play":
		clock -= dt
		if clock <= 0.0:
			end_match("draw")
	shake = maxf(0.0, shake - dt * 1.8)
	_tick_fx(dt)
	_sync_world()
	_sync_diamonds()
	if player and is_instance_valid(player):
		camera.global_position = camera.global_position.lerp(player.global_position, minf(1.0, dt * 6.0))
		if shake > 0.0:
			camera.offset = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * shake * 0.25
		else:
			camera.offset = Vector2.ZERO


func _spawn_units(data: Dictionary) -> void:
	var stats: Dictionary = data.get("stats", {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0})
	var skills := {}
	for id in Balance.SKILL_ORDER:
		var unlocked: bool = bool(data.get("unlocked", {}).get(id, false))
		var equipped: bool = bool(data.get("equipped", {}).get(id, false))
		skills[id] = unlocked and equipped
	var gender := str(data.get("gender", "female"))
	var pname := str(data.get("name", "You"))
	if pname.strip_edges() == "":
		pname = "You"
	var blank_skills := {}
	for id in Balance.SKILL_ORDER:
		blank_skills[id] = false
	var zero := {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0}
	var roster: Array = [
		{"id": "you", "name": pname, "team": 0, "gender": gender, "role": "player", "pos": Vector2(24, 50) * 0.5, "facing": 0.0, "stats": stats, "skills": skills, "is_player": true, "invuln": 1.8},
		{"id": "nia", "name": "Nia", "team": 0, "gender": "female", "role": "defend", "pos": Vector2(16, 48) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "joss", "name": "Joss", "team": 0, "gender": "male", "role": "escort", "pos": Vector2(26, 58) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "pico", "name": "Pico", "team": 0, "gender": "male", "role": "raid", "pos": Vector2(32, 50) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "bram", "name": "Bram", "team": 0, "gender": "male", "role": "fight", "pos": Vector2(22, 42) * 0.5, "stats": zero, "skills": _with(blank_skills, "fireball")},
		{"id": "holt", "name": "Holt", "team": 1, "gender": "male", "role": "defend", "pos": Vector2(160, 48) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "sable", "name": "Sable", "team": 1, "gender": "female", "role": "escort", "pos": Vector2(150, 58) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "vex", "name": "Vex", "team": 1, "gender": "female", "role": "raid", "pos": Vector2(144, 52) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "mira", "name": "Mira", "team": 1, "gender": "female", "role": "fight", "pos": Vector2(156, 56) * 0.5, "stats": zero, "skills": _with(blank_skills, "fireball")},
		{"id": "quinn", "name": "Quinn", "team": 1, "gender": "male", "role": "fight", "pos": Vector2(148, 46) * 0.5, "stats": zero, "skills": _with(blank_skills, "lightning")}
	]
	var scene: PackedScene = unit_scene if unit_scene != null else UnitScene
	for def in roster:
		var unit = scene.instantiate()
		unit_root.add_child(unit)
		unit.setup(def, self)
		units.append(unit)
		if unit.is_player:
			player = unit


func _with(base: Dictionary, id: String) -> Dictionary:
	var copy := base.duplicate()
	copy[id] = true
	return copy


func _spawn_diamonds() -> void:
	for home in diamond_homes:
		var d := State.new()
		d.team = int(home["team"])
		d.home = home["home"]
		d.pos = home["home"]
		d.at_home = true
		var node := Node2D.new()
		node.set_script(DiamondView)
		node.set("team", d.team)
		unit_root.add_child(node)
		node.global_position = d.home
		d.node = node
		diamonds.append(d)


func mask_for(team: int) -> int:
	var ignore := outpost != null and int(outpost["owner"]) == team
	return Balance.solid_mask(team, ignore)


func in_water(pos: Vector2) -> bool:
	for rect in bridges:
		if (rect as Rect2).has_point(pos):
			return false
	for isle in isles:
		if isle.has("poly"):
			if Geometry2D.is_point_in_polygon(pos, isle["poly"]):
				return false
		elif pos.distance_to(isle["pos"]) < float(isle["r"]):
			return false
	for poly in water_polys:
		if Geometry2D.is_point_in_polygon(pos, poly):
			return true
	return false


func keep_blocks(pos: Vector2, team: int) -> bool:
	for k in keeps:
		if float(k["down"]) > 0.0:
			continue
		var center: Vector2 = k["pos"]
		var dist := pos.distance_to(center)
		if dist >= float(k["r"]):
			continue
		var ang := (pos - center).angle() if dist > 0.001 else float(k["door"])
		var in_door := absf(Balance.ang_diff(ang, float(k["door"]))) < 0.72
		if team >= 0 and int(k["owner"]) == team and (dist < float(k["r"]) - Balance.KEEP_INSET or in_door):
			continue
		return true
	return false


func eject_keep(u) -> void:
	if u.dead:
		return
	for k in keeps:
		if float(k["down"]) > 0.0 or int(k["owner"]) == u.team:
			continue
		var center: Vector2 = k["pos"]
		var delta: Vector2 = u.global_position - center
		var dist := delta.length()
		if dist >= float(k["r"]):
			continue
		var n := delta / dist if dist > 0.001 else Vector2(cos(float(k["door"])), sin(float(k["door"])))
		u.global_position = center + n * (float(k["r"]) + 0.02)
		u.force_update_transform()


func blocked_circle(pos: Vector2, radius: float, team: int) -> bool:
	if pos.x - radius < 1.0 or pos.y - radius < 1.5 or pos.x + radius > Balance.MAP_W - 1.0 or pos.y + radius > Balance.MAP_H - 1.5:
		return true
	var space := get_world_2d().direct_space_state
	var params := PhysicsShapeQueryParameters2D.new()
	var shape := CircleShape2D.new()
	shape.radius = maxf(0.05, radius)
	params.shape = shape
	params.transform = Transform2D(0.0, pos)
	params.collision_mask = mask_for(team)
	params.collide_with_bodies = true
	params.collide_with_areas = false
	if not space.intersect_shape(params, 1).is_empty():
		return true
	return keep_blocks(pos, team)


func los(a: Vector2, b: Vector2, team: int) -> bool:
	for i in 14:
		var p := a.lerp(b, float(i + 1) / 14.0)
		if blocked_circle(p, 0.175, team):
			return false
	return true


func steer_point(u, goal: Vector2) -> Vector2:
	if los(u.global_position, goal, u.team):
		return goal
	var path: Array = Balance.astar(Balance.closest_node(u.global_position), Balance.closest_node(goal))
	var here: float = u.global_position.distance_to(goal)
	for id in path:
		var n: Vector2 = Balance.NODES[id]
		if u.global_position.distance_to(n) < 2.4:
			continue
		if n.distance_to(goal) < here - 0.4:
			return n
	for id2 in path:
		var n2: Vector2 = Balance.NODES[id2]
		if u.global_position.distance_to(n2) >= 2.4:
			return n2
	return goal


func nearest_enemy(u, rad: float):
	var best = null
	var bd := rad
	for o in units:
		if o == u or o.dead or o.team == u.team:
			continue
		var dist: float = u.global_position.distance_to(o.global_position)
		if dist < bd:
			bd = dist
			best = o
	return best


func enemy_door(u):
	var best = null
	var bd := 1.5
	for w in walls:
		if w["kind"] != "door" or float(w["hp"]) <= 0.0 or int(w["team"]) == u.team:
			continue
		if _rect_hit(u.global_position, w["rect"])["d"] < bd:
			bd = _rect_hit(u.global_position, w["rect"])["d"]
			best = w
	return best


func bot_goal(u) -> Dictionary:
	var mine = diamonds[u.team]
	var theirs = diamonds[1 - u.team]
	if u.carrying != null:
		return {"pos": vaults[u.team]["pos"], "unit": null}
	if u.role == "defend":
		if mine.carrier != null and mine.carrier.team != u.team:
			return {"pos": mine.carrier.global_position, "unit": mine.carrier}
		if not mine.at_home and mine.carrier == null and not mine.in_flight:
			return {"pos": mine.pos, "unit": null}
		var foe = nearest_enemy(u, 9.0)
		if foe:
			return {"pos": foe.global_position, "unit": foe}
		return {"pos": mine.home + Vector2(0, 3), "unit": null}
	if u.role == "escort":
		if theirs.carrier != null and theirs.carrier.team == u.team:
			return {"pos": theirs.carrier.global_position, "unit": theirs.carrier}
		if theirs.carrier == null and not theirs.in_flight:
			return {"pos": theirs.pos, "unit": null}
		var foe2 = nearest_enemy(u, 12.0)
		return {"pos": foe2.global_position, "unit": foe2} if foe2 else {"pos": Balance.NODES["isle"], "unit": null}
	if u.role == "raid":
		if theirs.carrier == null and not theirs.in_flight:
			return {"pos": theirs.pos, "unit": null}
		if theirs.carrier != null and theirs.carrier.team == u.team:
			return {"pos": theirs.carrier.global_position, "unit": theirs.carrier}
		if mine.carrier != null and mine.carrier.team != u.team:
			return {"pos": mine.carrier.global_position, "unit": mine.carrier}
		return {"pos": Balance.NODES["isle"], "unit": null}
	var foe3 = nearest_enemy(u, 16.0)
	if foe3:
		return {"pos": foe3.global_position, "unit": foe3}
	return {"pos": Balance.NODES["isle"], "unit": null}


func maybe_repair(u) -> void:
	if u.channel != null or nearest_enemy(u, 8.0) != null:
		return
	for w in walls:
		if w["kind"] != "door" or int(w["team"]) != u.team or float(w["hp"]) >= float(w["max"]):
			continue
		if float(_rect_hit(u.global_position, w["rect"])["d"]) < 1.6:
			var ch := State.new()
			ch.kind = "repair"
			ch.t = 1.1
			ch.src = w
			u.channel = ch
			return


func bot_use_map(u) -> void:
	var theirs = diamonds[1 - u.team]
	if u.carrying != null:
		for s in sewers:
			if float(s["hp"]) > 0.0:
				continue
			if u.global_position.distance_to(s["pos"]) < 1.6:
				warp_to(u, s["exit"])
				float_at(u.global_position + Vector2(0, -0.9), "SEWER", Color(0.78, 0.98, 1))
				return
		for tower in towers:
			if int(tower["owner"]) != u.team:
				continue
			if u.global_position.distance_to(tower["pos"]) < 2.4 and int(tower["side"]) == u.team:
				warp_to(u, tower["dest"])
				return
	elif u.role == "raid" and theirs.carrier == null:
		for tower in towers:
			if int(tower["side"]) != 1 - u.team or int(tower["owner"]) != u.team:
				continue
			var doors_up := false
			for w in walls:
				if w["kind"] == "door" and int(w["team"]) == int(tower["side"]) and float(w["hp"]) > 0.0:
					doors_up = true
			if doors_up and u.global_position.distance_to(tower["pos"]) < 2.4:
				warp_to(u, tower["dest"])
				return


func warp_to(u, pos: Vector2) -> void:
	u.global_position = pos
	u.force_update_transform()
	u.warp_cd = 1.2
	u.invuln = maxf(u.invuln, 0.25)


func interact(u) -> void:
	if u == null or u.dead or u.flight != null or u.channel != null:
		return
	var best = null
	var best_kind := ""
	var bd := 2.3
	for s in sewers:
		var dist: float = u.global_position.distance_to(s["pos"])
		if dist < bd:
			bd = dist
			best = s
			best_kind = "sewer"
	for tower in towers:
		var dist2: float = u.global_position.distance_to(tower["pos"])
		if dist2 < bd:
			bd = dist2
			best = tower
			best_kind = "tower"
	for cat in catapults:
		if int(cat["team"]) != u.team:
			continue
		var dist3: float = u.global_position.distance_to(cat["pos"])
		if dist3 < bd:
			bd = dist3
			best = cat
			best_kind = "catapult"
	for ladder in ladders:
		var dist4: float = u.global_position.distance_to(ladder["pos"])
		if dist4 < bd:
			bd = dist4
			best = ladder
			best_kind = "ladder"
	for spring in springs:
		var dist5: float = u.global_position.distance_to(spring["pos"])
		if dist5 < bd:
			bd = dist5
			best = spring
			best_kind = "spring"
	for w in walls:
		if w["kind"] != "door" or int(w["team"]) != u.team or float(w["hp"]) >= float(w["max"]):
			continue
		var dist6 := float(_rect_hit(u.global_position, w["rect"])["d"])
		if dist6 < bd:
			bd = dist6
			best = w
			best_kind = "repair"
	if best == null:
		float_at(u.global_position + Vector2(0, -0.9), "NOTHING TO USE", Color.WHITE)
		return
	if best_kind == "sewer":
		if float(best["hp"]) > 0.0:
			float_at(u.global_position + Vector2(0, -0.9), "BREAK THE COVER", Color.WHITE)
			return
		warp_to(u, best["exit"])
		float_at(u.global_position + Vector2(0, -0.9), "SEWER", Color(0.78, 0.98, 1))
	elif best_kind == "tower":
		if int(best["owner"]) != u.team:
			float_at(u.global_position + Vector2(0, -0.9), "NEUTRAL TOWER", Color.WHITE)
			return
		warp_to(u, best["dest"])
		float_at(u.global_position + Vector2(0, -0.9), "WARP", Color.WHITE)
	elif best_kind == "catapult":
		var ch := State.new()
		ch.kind = "catapult"
		ch.t = 0.7
		ch.src = best
		u.channel = ch
		float_at(u.global_position + Vector2(0, -0.9), "LOADING", Color(1, 0.88, 0.54))
	elif best_kind == "ladder":
		warp_to(u, best["to"])
		float_at(u.global_position + Vector2(0, -0.9), "CLIMB", Color.WHITE)
	elif best_kind == "spring":
		var flight := State.new()
		flight.t = 0.0
		flight.dur = 0.4
		flight.x0 = u.global_position.x
		flight.y0 = u.global_position.y
		flight.x1 = best["to"].x
		flight.y1 = best["to"].y
		u.flight = flight
		u.invuln = maxf(u.invuln, 0.4)
	elif best_kind == "repair":
		var repair := State.new()
		repair.kind = "repair"
		repair.t = 1.1
		repair.src = best
		u.channel = repair


func finish_channel(u) -> void:
	var ch = u.channel
	u.channel = null
	if ch == null or u.dead:
		return
	if ch.kind == "repair" and ch.src != null:
		var door = ch.src
		door["hp"] = minf(float(door["max"]), float(door["hp"]) + 40.0)
		door["shape"].disabled = float(door["hp"]) <= 0.0
		door["visual"].visible = float(door["hp"]) > 0.0
		float_at(u.global_position + Vector2(0, -0.9), "REPAIR", Color(1, 0.88, 0.54))
	elif ch.kind == "catapult" and ch.src != null:
		var flight := State.new()
		flight.t = 0.0
		flight.dur = 0.55
		flight.x0 = u.global_position.x
		flight.y0 = u.global_position.y
		flight.x1 = ch.src["dest"].x
		flight.y1 = ch.src["dest"].y
		u.flight = flight
		u.invuln = maxf(u.invuln, 0.55)
	elif ch.kind == "mega":
		detonate_mega(u, ch)
	elif ch.kind == "saber":
		detonate_saber(u, ch)


func begin_mega(u) -> void:
	var ang: float = u.facing
	var dur: float = Balance.MEGA_TIME * (2.0 if u.slow_cast > 0.0 else 1.0)
	u.cast = null
	u.attack_wind = 0.0
	u.hop = null
	u.dash = null
	u.wish = Vector2.ZERO
	var ch := State.new()
	ch.kind = "mega"
	ch.t = dur
	ch.dur = dur
	ch.pos = u.global_position + Vector2(cos(ang), sin(ang)) * Balance.MEGA_AHEAD
	ch.r = Balance.MEGA_RADIUS
	u.channel = ch
	float_at(u.global_position + Vector2(0, -0.9), "MEGA", Color(1, 0.69, 0.69))


func begin_saber(u) -> void:
	var dur: float = Balance.SABER_TIME * (2.0 if u.slow_cast > 0.0 else 1.0)
	u.cast = null
	u.attack_wind = 0.0
	u.hop = null
	u.dash = null
	u.wish = Vector2.ZERO
	var ch := State.new()
	ch.kind = "saber"
	ch.t = dur
	ch.dur = dur
	ch.pos = u.global_position
	ch.ang = u.facing
	ch.len = Balance.SABER_LEN
	ch.w = Balance.SABER_W
	u.channel = ch
	float_at(u.global_position + Vector2(0, -0.9), "SABER", Color(1, 0.88, 0.54))


func detonate_mega(u, ch) -> void:
	for o in units:
		if o.dead:
			continue
		if o.global_position.distance_to(ch.pos) > float(ch.r):
			continue
		try_hit(o, Balance.MEGA_DAMAGE, u, Color(1, 0.35, 0.35))
	burst(ch.pos, Color(1, 0.69, 0.63), 18, 4.0)
	var fx := State.new()
	fx.pos = ch.pos
	fx.t = 1.7
	fx.dur = 1.7
	fx.r = ch.r
	mega_fx.append(fx)
	shake = 1.35
	Sfx.play("mega")


func detonate_saber(u, ch) -> void:
	for o in units:
		if o.dead or o == u:
			continue
		if not in_saber_lane(ch, o.global_position):
			continue
		try_hit(o, Balance.SABER_DAMAGE, u, Color(1, 0.88, 0.54))
	var fx := State.new()
	fx.pos = ch.pos
	fx.ang = ch.ang
	fx.len = ch.len
	fx.w = ch.w
	fx.t = 0.9
	fx.dur = 0.9
	saber_fx.append(fx)
	shake = 1.15
	Sfx.play("saber")


func in_saber_lane(ch, pos: Vector2) -> bool:
	var fwd := Vector2(cos(ch.ang), sin(ch.ang))
	var delta: Vector2 = pos - ch.pos
	var along: float = delta.dot(fwd)
	var side := absf(Vector2(-fwd.y, fwd.x).dot(delta))
	return along >= -0.0001 and along <= float(ch.len) + 0.0001 and side <= float(ch.w) * 0.5 + 0.0001


func finish_cast(u) -> void:
	if u.cast == null:
		return
	var skill_name: String = str(u.cast.name)
	u.cast = null
	u.has_cast_face = false
	if u.carrying != null or u.dead:
		return
	if skill_name == "fireball":
		spawn_fireball(u)
	elif skill_name == "ice":
		spawn_clones(u)
	elif skill_name == "firesword":
		u.fire_sword_t = 8.0
		u.fire_sword_hits = 5
		float_at(u.global_position + Vector2(0, -0.9), "FIRE SWORD", Color(1, 0.69, 0.13))
		Sfx.play("firesword")
	elif skill_name == "lightning":
		start_dash(u)


func spawn_fireball(u) -> void:
	var ang: float = u.facing
	var shot := State.new()
	shot.kind = "fireball"
	shot.pos = u.global_position + Vector2(cos(ang), sin(ang)) * 0.7
	shot.vx = cos(ang) * Balance.FIREBALL_SPEED
	shot.vy = sin(ang) * Balance.FIREBALL_SPEED
	shot.r = Balance.FIREBALL_RADIUS
	shot.team = u.team
	shot.src = u
	shot.direct = Balance.FIREBALL_DIRECT * Balance.pwr_mul(u.stats)
	shot.splash = Balance.FIREBALL_SPLASH * Balance.pwr_mul(u.stats)
	shot.life = Balance.FIREBALL_LIFE * fireball_range_mul(u)
	shots.append(shot)
	drop_fire(shot.pos)
	burst(u.global_position, Color(1, 0.7, 0.35), 6, 2.0)


func fireball_range_mul(u) -> float:
	for k in keeps:
		if float(k["down"]) > 0.0 or int(k["owner"]) != u.team:
			continue
		if u.global_position.distance_to(k["pos"]) < float(k["r"]) - 0.1:
			return 1.8
	return 1.0


func spawn_clones(u) -> void:
	for old in u.clones:
		if old.node and is_instance_valid(old.node):
			old.node.queue_free()
	u.clones.clear()
	for side in [-PI / 4.0, PI / 4.0]:
		var host := Node2D.new()
		var rig := Node2D.new()
		rig.set_script(preload("res://scripts/fighter_visual.gd"))
		rig.name = "Fighter"
		host.add_child(rig)
		rig.set("gender", u.gender)
		rig.set("team", u.team)
		rig.set("ghost", true)
		unit_root.add_child(host)
		var c := State.new()
		c.id = _clone_seq
		_clone_seq += 1
		c.side = side
		c.hp = 25.0
		c.alive = true
		c.t = 10.0
		c.team = u.team
		c.pos = u.global_position
		c.node = host
		c.r = 0.42
		u.clones.append(c)
	float_at(u.global_position + Vector2(0, -0.9), "ICE", Color(0.73, 0.95, 1))
	Sfx.play("ice")


func start_dash(u) -> void:
	var dur: float = 0.25 * (1.0 - 0.005 * float(u.stats.get("spd", 0)))
	var dash := State.new()
	dash.t = dur
	dash.dur = dur
	dash.dist = Balance.DASH_DIST
	dash.dir = u.facing
	dash.traveled = 0.0
	dash.hit = {}
	dash.from_pos = u.global_position
	u.dash = dash
	u.invuln = maxf(u.invuln, dur)
	Sfx.play("dash")


func strike_dash(u) -> void:
	if u.dash == null:
		return
	var dmg: float = 10.0 * Balance.pwr_mul(u.stats)
	var a: Vector2 = u.dash.from_pos
	var b: Vector2 = u.global_position
	for o in units:
		if o.dead or o.team == u.team or u.dash.hit.has(o.unit_id):
			continue
		if _seg_dist(o.global_position, a, b) > Balance.DASH_REACH:
			continue
		u.dash.hit[o.unit_id] = true
		if try_hit(o, dmg, u, Color(1, 0.96, 0.66)):
			o.shock = maxf(o.shock, 1.0)
			o.slow_cast = maxf(o.slow_cast, 5.0)
			float_at(o.global_position + Vector2(0, -0.9), "SHOCK", Color(1, 0.96, 0.66))
	for owner in units:
		for c in owner.clones:
			if not c.alive or c.team == u.team or u.dash.hit.has(c.id):
				continue
			if _seg_dist(c.pos, a, b) > Balance.DASH_REACH:
				continue
			u.dash.hit[c.id] = true
			damage_clone(c, dmg)


func resolve_swing(u) -> void:
	var shape: Dictionary = u.swing_shape()
	u.swing_vis = 0.26
	u.swing_arc = float(shape["arc"])
	u.swing_range = float(shape["range"])
	Sfx.play("swing_fire" if shape["lit"] else "swing")
	var connected := false
	var dmg: float = weapon_damage(u) * (2.0 if shape["lit"] else 1.0)
	for o in units:
		if o.dead or o.team == u.team:
			continue
		if not in_arc(u.global_position, u.facing, o.global_position, o.radius, float(shape["range"]), float(shape["arc"])):
			continue
		if try_hit(o, dmg, u, Color(1, 0.69, 0.13) if shape["lit"] else Color.WHITE):
			connected = true
			if shape["lit"]:
				var burn := State.new()
				burn.dps = 5.0 * Balance.pwr_mul(u.stats)
				burn.t = 3.0
				burn.src = u
				o.burn = burn
	for owner in units:
		for c in owner.clones:
			if not c.alive or c.team == u.team:
				continue
			if not in_arc(u.global_position, u.facing, c.pos, c.r, float(shape["range"]), float(shape["arc"])):
				continue
			damage_clone(c, dmg)
			connected = true
	for w in walls:
		if w["kind"] != "door" or float(w["hp"]) <= 0.0 or int(w["team"]) == u.team:
			continue
		var hit: Dictionary = _rect_hit(u.global_position, w["rect"])
		if float(hit["d"]) > float(shape["range"]) + 0.05:
			continue
		var ang: float = (hit["at"] - u.global_position).angle()
		if absf(Balance.ang_diff(ang, u.facing)) > float(shape["arc"]) * 0.5:
			continue
		damage_door(w, dmg)
		connected = true
		float_at(hit["at"], str(int(round(dmg))), Color(1, 0.82, 0.63))
	for s in sewers:
		if float(s["hp"]) <= 0.0:
			continue
		if not in_arc(u.global_position, u.facing, s["pos"], float(s["r"]), float(shape["range"]), float(shape["arc"])):
			continue
		damage_sewer(s, dmg)
		connected = true
	for rk in rocks:
		if float(rk["hp"]) <= 0.0:
			continue
		if not in_arc(u.global_position, u.facing, rk["pos"], float(rk["r"]), float(shape["range"]), float(shape["arc"])):
			continue
		damage_rock(rk, dmg)
		connected = true
	for k in keeps:
		if float(k["down"]) > 0.0 or int(k["owner"]) < 0 or int(k["owner"]) == u.team:
			continue
		if not in_arc(u.global_position, u.facing, k["pos"], float(k["r"]), float(shape["range"]), float(shape["arc"])):
			continue
		hurt_keep(k, dmg)
		connected = true
	if connected and shape["lit"]:
		u.fire_sword_hits -= 1
		if u.fire_sword_hits <= 0:
			u.fire_sword_t = 0.0
	for c2 in u.clones:
		if c2.alive:
			clone_swing(c2, u, shape)


func clone_swing(c, owner, shape: Dictionary) -> void:
	var dmg: float = weapon_damage(owner) * 0.25
	for o in units:
		if o.dead or o.team == c.team:
			continue
		if in_arc(c.pos, owner.facing, o.global_position, o.radius, float(shape["range"]), float(shape["arc"])):
			try_hit(o, dmg, owner, Color(0.84, 0.97, 1))


func weapon_damage(u) -> float:
	var base: float = Balance.BARE_DAMAGE if u.weapon == "bare" else Balance.SWORD_DAMAGE
	return base * Balance.pwr_mul(u.stats)


func mitigated(u, amount: float) -> float:
	if u and u.guard and u.carrying != null:
		return amount * 0.5
	return amount


func try_hit(target, amount: float, src, color: Color) -> bool:
	if target == null or target.dead:
		return false
	if target.invuln > 0.0:
		return false
	if randf() < 0.005 * float(target.stats.get("agi", 0)):
		float_at(target.global_position + Vector2(0, -0.9), "EVADE", Color(1, 0.89, 0.48))
		return false
	amount = mitigated(target, amount)
	target.hp -= amount
	target.hit_flash = 0.12
	float_at(target.global_position + Vector2(0, -0.9), str(int(round(amount))), color)
	shake = minf(1.0, shake + (0.35 if target.is_player else 0.12))
	burst(target.global_position, color, 4, 1.5)
	if target.hp <= 0.0:
		kill_unit(target, src)
	return true


func damage_clone(c, amount: float) -> void:
	c.hp -= amount
	float_at(c.pos + Vector2(0, -0.4), str(int(round(amount))), Color(0.84, 0.97, 1))
	if c.hp <= 0.0:
		c.alive = false
		if c.node:
			c.node.visible = false
		burst(c.pos, Color(0.73, 0.96, 1), 8, 2.4)


func kill_unit(u, src) -> void:
	if u == null or u.dead:
		return
	u.dead = true
	u.hp = 0.0
	u.respawn_t = Balance.RESPAWN_TIME
	if u.carrying != null:
		detach(u.carrying, u.global_position)
	u.cast = null
	u.dash = null
	u.flight = null
	u.channel = null
	u.hop = null
	for c in u.clones:
		if c.node and is_instance_valid(c.node):
			c.node.queue_free()
	u.clones.clear()
	u.clear_guard()
	if src != null and src.team != u.team:
		src.kills += 1
		takedowns[src.team] = int(takedowns[src.team]) + 1
		kill_call = {"text": "%s kill %s" % [src.unit_name, u.unit_name], "t": 2.2}
	burst(u.global_position, Color(1, 0.54, 0.66) if u.team == 0 else Color(0.56, 0.77, 1), 12, 2.6)
	Sfx.play("kill")


func respawn_unit(u) -> void:
	var spot := Vector2(12, 26) if u.team == 0 else Vector2(77, 25)
	u.dead = false
	u.global_position = spot + Vector2(randf_range(-0.6, 0.6), randf_range(-0.6, 0.6))
	u.force_update_transform()
	u.hp = u.max_hp
	u.mp = u.max_mp * 0.6
	u.invuln = 1.4
	u.respawn_t = 0.0
	u.cast = null
	u.dash = null
	u.hop = null
	u.flight = null
	u.burn = null
	u.channel = null
	u.shock = 0.0
	u.slow_cast = 0.0
	u.clear_guard()
	float_at(u.global_position + Vector2(0, -0.9), "READY", Color.WHITE)


func detach(d, at: Vector2) -> void:
	if d.carrier != null:
		d.carrier.carrying = null
		d.carrier.clear_guard()
	d.carrier = null
	d.pos = at
	d.at_home = false
	d.bank = 0.0
	d.in_flight = false
	d.drop_delay = 0.35


func throw_diamond(u) -> void:
	if u == null or u.carrying == null or u.dead:
		return
	var d = u.carrying
	var dir: float = u.facing
	d.carrier = null
	u.carrying = null
	u.clear_guard()
	d.in_flight = true
	d.at_home = false
	d.bank = 0.0
	d.last_thrower = u
	d.throw_lock = 0.75
	var shot := State.new()
	shot.kind = "gem"
	shot.diamond = d
	shot.pos = u.global_position
	shot.vx = cos(dir) * Balance.THROW_SPEED
	shot.vy = sin(dir) * Balance.THROW_SPEED
	shot.dest = u.global_position + Vector2(cos(dir), sin(dir)) * Balance.THROW_METERS
	shot.has_dest = true
	shot.r = 0.35
	shot.life = Balance.THROW_METERS / Balance.THROW_SPEED
	shot.team = u.team
	shots.append(shot)
	float_at(u.global_position + Vector2(0, -0.9), "THROW", Color(0.75, 0.96, 1))
	Sfx.play("throw")


func resolve_pickups() -> void:
	var order: Array = []
	if net_role == "offline":
		if player:
			order.append(player)
		for u in units:
			if u != player:
				order.append(u)
	else:
		for u in units:
			if int(u.peer_id) > 0:
				order.append(u)
		for u in units:
			if int(u.peer_id) == 0:
				order.append(u)
	for u in order:
		if u == null or u.dead or u.carrying != null:
			continue
		for d in diamonds:
			if d.carrier != null or d.in_flight or d.drop_delay > 0.0:
				continue
			if d.throw_lock > 0.0 and d.last_thrower == u:
				continue
			if u.global_position.distance_to(d.pos) > 1.15:
				continue
			if u.team == d.team and d.at_home:
				continue
			if net_role == "offline" and not u.is_player and player != null and not player.dead and player.team == u.team and player.global_position.distance_to(d.pos) < 12.0:
				continue
			if net_role != "offline" and int(u.peer_id) == 0 and _human_near(int(u.team), d.pos):
				continue
			d.carrier = u
			u.carrying = d
			d.at_home = false
			u.cast = null
			u.attack_wind = 0.0
			u.channel = null
			float_at(u.global_position + Vector2(0, -0.9), "DIAMOND", Color(0.49, 0.94, 1))
			break


func tick_points(dt: float) -> void:
	var points: Array = []
	points.append_array(towers)
	if outpost != null:
		points.append(outpost)
	for p in points:
		var west := 0
		var east := 0
		for u in units:
			if u.dead:
				continue
			if u.global_position.distance_to(p["pos"]) <= float(p["cap_r"]):
				if u.team == 0:
					west += 1
				else:
					east += 1
		if west > east:
			p["progress"] = minf(1.0, float(p["progress"]) + dt * 0.45 * float(west - east))
		elif east > west:
			p["progress"] = maxf(-1.0, float(p["progress"]) - dt * 0.45 * float(east - west))
		if float(p["progress"]) >= 0.98:
			p["owner"] = 0
		elif float(p["progress"]) <= -0.98:
			p["owner"] = 1
		elif absf(float(p["progress"])) < 0.15:
			p["owner"] = -1
		if int(p["owner"]) < 0:
			continue
		for u2 in units:
			if u2.dead or u2.team != int(p["owner"]):
				continue
			if u2.global_position.distance_to(p["pos"]) <= float(p["r"]) + 1.4:
				u2.hp = minf(u2.max_hp, u2.hp + 7.0 * dt)


func tick_returns() -> void:
	if phase != "play":
		return
	for d in diamonds:
		var c = d.carrier
		if c == null or c.dead or c.team != d.team:
			continue
		var vault = vaults[d.team]
		if c.global_position.distance_to(vault["pos"]) > float(vault["r"]):
			continue
		c.carrying = null
		c.clear_guard()
		d.carrier = null
		d.pos = d.home
		d.at_home = true
		d.bank = 0.0
		d.in_flight = false
		d.drop_delay = 0.0
		d.throw_lock = 0.0
		float_at(c.global_position + Vector2(0, -0.9), "RETURNED", Color(1, 0.88, 0.54))


func tick_banks(dt: float) -> void:
	if phase != "play":
		return
	for d in diamonds:
		var c = d.carrier
		var holding := false
		if c != null and not c.dead and c.team != d.team:
			var vault = vaults[c.team]
			holding = c.global_position.distance_to(vault["pos"]) <= float(vault["r"])
		if holding:
			d.bank += dt
			if d.bank >= Balance.BANK_TIME:
				end_match("win", c.team)
				return
		elif d.bank > 0.2:
			d.bank = 0.0
			if c:
				float_at(c.global_position + Vector2(0, -0.9), "HOLD BROKEN", Color(1, 0.82, 0.86))
		else:
			d.bank = 0.0


func tick_keeps(dt: float) -> void:
	for k in keeps:
		if float(k["down"]) > 0.0:
			k["down"] = float(k["down"]) - dt
			k["owner"] = -1
			k["cap"] = 0.0
			k["cap_team"] = -1
			if float(k["down"]) <= 0.0:
				k["down"] = 0.0
				k["hp"] = float(k["max"])
			continue
		var px: Vector2 = k["pos"] + Vector2(cos(float(k["door"])), sin(float(k["door"]))) * (float(k["r"]) + 0.15)
		var team := -1
		var contested := false
		for u in units:
			if u.dead:
				continue
			if u.global_position.distance_to(px) > 1.15:
				continue
			if team < 0:
				team = u.team
			elif team != u.team:
				contested = true
		if contested or team < 0 or team == int(k["owner"]):
			k["cap"] = 0.0
			k["cap_team"] = -1
			continue
		if int(k["cap_team"]) != team:
			k["cap_team"] = team
			k["cap"] = 0.0
		k["cap"] = float(k["cap"]) + dt
		if float(k["cap"]) >= Balance.TOWER_CAPTURE:
			k["owner"] = team
			k["cap"] = 0.0
			k["cap_team"] = -1
			float_at(k["pos"] + Vector2(0, -1.2), "CRIMSON" if team == 0 else "AZURE", Color(1, 0.36, 0.48) if team == 0 else Color(0.35, 0.82, 1))


func hurt_keep(k, dmg: float) -> void:
	if k == null or float(k["down"]) > 0.0 or int(k["owner"]) < 0:
		return
	k["hp"] = float(k["hp"]) - dmg
	float_at(k["pos"] + Vector2(0, -1.2), str(int(round(dmg))), Color(1, 0.82, 0.63))
	if float(k["hp"]) <= 0.0:
		k["hp"] = 0.0
		k["down"] = 20.0
		k["owner"] = -1
		k["cap"] = 0.0
		k["cap_team"] = -1
		burst(k["pos"], Color(0.79, 0.52, 0.23), 12, 2.4)
		float_at(k["pos"], "TOWER DOWN", Color.WHITE)


func update_shots(dt: float) -> void:
	var kept: Array = []
	for s in shots:
		var speed: float = Vector2(s.vx, s.vy).length()
		var steps := maxi(1, int(ceil(speed * dt / 0.2)))
		var dead := false
		for _n in steps:
			s.pos += Vector2(s.vx, s.vy) * dt / float(steps)
			if s.kind == "fireball":
				s.trail += speed * dt / float(steps)
				while s.trail >= 0.55:
					s.trail -= 0.55
					drop_fire(s.pos)
				var hit = fireball_hit(s)
				if hit != null:
					explode_fireball(s, hit)
					dead = true
					break
			elif blocked_circle(s.pos, float(s.r) * 0.4, -1):
				land_gem(s)
				dead = true
				break
		s.life -= dt
		if not dead and s.life <= 0.0:
			if s.kind == "gem":
				if s.has_dest:
					s.pos = s.dest
				land_gem(s)
			elif s.kind == "fireball":
				drop_fire(s.pos)
			dead = true
		if s.kind == "gem" and s.diamond != null and s.diamond.in_flight:
			s.diamond.pos = s.pos
		if not dead:
			kept.append(s)
	shots = kept


func fireball_hit(s):
	var best = null
	var bd := 1.0e9
	var wall_keep = blocking_keep(s)
	for u in units:
		if u.dead or u.team == s.team:
			continue
		if wall_keep != null and u.global_position.distance_to(wall_keep["pos"]) < float(wall_keep["r"]):
			continue
		var dist: float = s.pos.distance_to(u.global_position)
		if dist <= float(s.r) + u.radius and dist < bd:
			bd = dist
			best = {"obj": u, "kind": "unit"}
	for owner in units:
		for c in owner.clones:
			if not c.alive or c.team == s.team:
				continue
			var dist2: float = s.pos.distance_to(c.pos)
			if dist2 <= float(s.r) + float(c.r) and dist2 < bd:
				bd = dist2
				best = {"obj": c, "kind": "clone"}
	for t in trees:
		var dist3: float = s.pos.distance_to(t["pos"])
		if dist3 <= float(s.r) + float(t["r"]) and dist3 < bd:
			bd = dist3
			best = {"obj": t, "kind": "tree"}
	for w in walls:
		if w["kind"] == "door" and (float(w["hp"]) <= 0.0 or int(w["team"]) == s.team):
			continue
		if not _circle_rect(s.pos, float(s.r), w["rect"]):
			continue
		var dist4 := float(_rect_hit(s.pos, w["rect"])["d"])
		if dist4 < bd:
			bd = dist4
			best = {"obj": w, "kind": "door" if w["kind"] == "door" else "wall"}
	for rk in rocks:
		if float(rk["hp"]) <= 0.0:
			continue
		var dist5: float = s.pos.distance_to(rk["pos"])
		if dist5 <= float(s.r) + float(rk["r"]) and dist5 < bd:
			bd = dist5
			best = {"obj": rk, "kind": "rock"}
	for sew in sewers:
		if float(sew["hp"]) <= 0.0:
			continue
		var dist6: float = s.pos.distance_to(sew["pos"])
		if dist6 <= float(s.r) + float(sew["r"]) and dist6 < bd:
			bd = dist6
			best = {"obj": sew, "kind": "sewer"}
	if wall_keep != null:
		var dist7: float = s.pos.distance_to(wall_keep["pos"])
		if dist7 < bd:
			best = {"obj": wall_keep, "kind": "keep"}
	return best


func blocking_keep(s):
	var best = null
	var bd := 1.0e9
	for k in keeps:
		if float(k["down"]) > 0.0 or int(k["owner"]) == int(s.team):
			continue
		var dist: float = s.pos.distance_to(k["pos"])
		if dist <= float(k["r"]) + float(s.r) and dist < bd:
			bd = dist
			best = k
	return best


func explode_fireball(s, hit: Dictionary) -> void:
	var at: Vector2 = s.pos
	burst(at, Color(1, 0.54, 0.24), 12, 3.2)
	Sfx.play("explode")
	var kind: String = hit["kind"]
	if kind == "unit":
		try_hit(hit["obj"], s.direct, s.src, Color(1, 0.7, 0.35))
	elif kind == "clone":
		damage_clone(hit["obj"], s.direct)
	elif kind == "door":
		damage_door(hit["obj"], s.direct)
		float_at(at, str(int(round(s.direct))), Color(1, 0.82, 0.63))
	elif kind == "rock":
		damage_rock(hit["obj"], s.direct)
	elif kind == "sewer":
		damage_sewer(hit["obj"], s.direct)
	elif kind == "keep":
		if int(hit["obj"]["owner"]) >= 0 and int(hit["obj"]["owner"]) != int(s.team):
			hurt_keep(hit["obj"], s.direct)
	drop_fire(at)
	if kind == "tree" or kind == "wall":
		return
	for u in units:
		if u.dead or u.team == s.team or u == hit["obj"]:
			continue
		if kind == "keep" and u.global_position.distance_to(hit["obj"]["pos"]) < float(hit["obj"]["r"]):
			continue
		if u.global_position.distance_to(at) <= Balance.FIREBALL_SPLASH_R:
			try_hit(u, s.splash, s.src, Color(1, 0.84, 0.69))


func drop_fire(at: Vector2) -> void:
	var f := State.new()
	f.pos = at
	f.r = 0.45
	f.t = 5.0
	fires.append(f)
	if fires.size() > 420:
		fires = fires.slice(fires.size() - 420)


func standing_in_fire(u) -> bool:
	for f in fires:
		if f.t <= 0.0:
			continue
		if u.global_position.distance_to(f.pos) <= f.r:
			return true
	return false


func land_gem(s) -> void:
	var d = s.diamond
	if d == null:
		return
	d.in_flight = false
	d.pos = s.pos
	d.at_home = false
	d.pos = nearest_walkable(d.pos, 0.2, 0)


func nearest_walkable(pos: Vector2, radius: float, team: int) -> Vector2:
	if not blocked_circle(pos, radius, team):
		return pos
	var rad := 0.25
	while rad <= 6.0:
		for a in 16:
			var ang := TAU * float(a) / 16.0
			var n := pos + Vector2(cos(ang), sin(ang)) * rad
			if not blocked_circle(n, radius, team):
				return n
		rad += 0.25
	return Vector2(clampf(pos.x, 2.0, Balance.MAP_W - 2.0), clampf(pos.y, 2.5, Balance.MAP_H - 2.5))


func damage_door(w, amount: float) -> void:
	w["hp"] = maxf(0.0, float(w["hp"]) - amount)
	w["shape"].disabled = float(w["hp"]) <= 0.0
	w["visual"].visible = float(w["hp"]) > 0.0
	if float(w["hp"]) <= 0.0:
		burst(_rect_hit(w["rect"].get_center(), w["rect"])["at"], Color(0.79, 0.52, 0.23), 8, 2.0)


func damage_rock(rk, amount: float) -> void:
	rk["hp"] = maxf(0.0, float(rk["hp"]) - amount)
	var gone := float(rk["hp"]) <= 0.0
	rk["shape"].disabled = gone
	rk["visual"].visible = not gone


func damage_sewer(s, amount: float) -> void:
	s["hp"] = maxf(0.0, float(s["hp"]) - amount)
	float_at(s["pos"], str(int(round(amount))), Color(0.91, 0.83, 0.69))
	if float(s["hp"]) <= 0.0:
		s["visual"].color = Color(0.14, 0.19, 0.27)
		float_at(s["pos"] + Vector2(0, -0.4), "COVER BROKEN", Color.WHITE)


func end_match(kind: String, team: int = -1) -> void:
	if phase != "play":
		return
	phase = "result"
	result = {"type": kind, "team": team}
	if record and Profile and net_role == "offline":
		Profile.note_match(kind == "win", kind == "draw")
	elif record and Profile and net_role == "client":
		var mine := -1
		if player:
			mine = int(player.team)
		Profile.note_match(kind == "win" and team == mine, kind == "draw")
	if net_role == "server":
		Net.publish_result(result)
	if kind == "win":
		Sfx.play("win")
	if hud and hud.has_method("show_result"):
		hud.show_result(result)


func float_at(pos: Vector2, text: String, color: Color) -> void:
	var f := State.new()
	f.pos = pos
	f.name = text
	f.text = text
	f.t = 0.85
	f.color = color
	floats.append(f)
	if floats.size() > 40:
		floats = floats.slice(floats.size() - 40)


func burst(pos: Vector2, color: Color, n: int, speed: float) -> void:
	for _i in n:
		var a := randf() * TAU
		var sp := speed * (0.35 + randf())
		var p := State.new()
		p.pos = pos
		p.vel = Vector2(cos(a), sin(a)) * sp
		p.t = 0.35 + randf() * 0.25
		p.color = color
		p.r = 0.08 + randf() * 0.12
		bursts.append(p)
	if bursts.size() > 240:
		bursts = bursts.slice(bursts.size() - 240)


func _tick_fires(dt: float) -> void:
	var kept: Array = []
	for f in fires:
		f.t -= dt
		if f.t > 0.0:
			kept.append(f)
	fires = kept


func _tick_cakes(dt: float) -> void:
	for cake in cakes:
		if float(cake["t"]) > 0.0:
			cake["t"] = float(cake["t"]) - dt
			cake["node"].visible = false
			continue
		cake["node"].visible = true
		for u in units:
			if u.dead:
				continue
			if u.global_position.distance_to(cake["pos"]) < 1.2:
				u.hp = minf(u.max_hp, u.hp + 30.0)
				cake["t"] = 18.0
				cake["node"].visible = false
				float_at(u.global_position + Vector2(0, -0.9), "+30", Color(1, 0.88, 0.54))
				break


func _tick_fx(dt: float) -> void:
	var next_floats: Array = []
	for f in floats:
		f.pos.y -= dt * 0.8
		f.t -= dt
		if f.t > 0.0:
			next_floats.append(f)
	floats = next_floats
	var next_bursts: Array = []
	for p in bursts:
		p.pos += p.vel * dt
		p.t -= dt
		if p.t > 0.0:
			next_bursts.append(p)
	bursts = next_bursts
	var next_mega: Array = []
	for fx in mega_fx:
		fx.t -= dt
		if fx.t > 0.0:
			next_mega.append(fx)
	mega_fx = next_mega
	var next_saber: Array = []
	for fx2 in saber_fx:
		fx2.t -= dt
		if fx2.t > 0.0:
			next_saber.append(fx2)
	saber_fx = next_saber


func _sync_diamonds() -> void:
	for d in diamonds:
		if d.node and is_instance_valid(d.node):
			d.node.global_position = d.pos


func _sync_world() -> void:
	for k in keeps:
		var visual: Polygon2D = k["visual"]
		if float(k["down"]) > 0.0:
			visual.color = Color(0.32, 0.28, 0.26, 0.55)
		elif int(k["owner"]) == 0:
			visual.color = Color(0.86, 0.32, 0.42)
		elif int(k["owner"]) == 1:
			visual.color = Color(0.32, 0.55, 0.9)
		else:
			visual.color = Color(0.95, 0.9, 0.78)
	for group in [towers, [outpost]]:
		for p in group:
			if p == null:
				continue
			var vis: Polygon2D = p["visual"]
			if int(p["owner"]) == 0:
				vis.color = Color(0.86, 0.32, 0.42)
			elif int(p["owner"]) == 1:
				vis.color = Color(0.32, 0.55, 0.9)
			else:
				vis.color = Color(0.96, 0.86, 0.55) if str(p.get("name", "")) == "Middle Outpost" else Color(0.95, 0.9, 0.78)


func _separate(u) -> void:
	if u.dead or u.flight != null or u.is_player or u.net_controlled or u.root_locked():
		return
	for o in units:
		if o == u or o.dead:
			continue
		var delta: Vector2 = u.global_position - o.global_position
		var dist := delta.length()
		var need: float = u.radius + o.radius
		if dist > 0.001 and dist < need:
			var push: float = (need - dist) * (1.0 if o.is_player else 0.5)
			var n := delta / dist
			u.try_step(n.x * push, n.y * push)


func in_arc(origin: Vector2, facing: float, target_pos: Vector2, target_r: float, reach: float, arc: float) -> bool:
	var delta := target_pos - origin
	if delta.length() > reach + target_r:
		return false
	return absf(Balance.ang_diff(delta.angle(), facing)) <= arc * 0.5


func _rect_hit(p: Vector2, rect: Rect2) -> Dictionary:
	var nx := clampf(p.x, rect.position.x, rect.end.x)
	var ny := clampf(p.y, rect.position.y, rect.end.y)
	var at := Vector2(nx, ny)
	return {"d": p.distance_to(at), "at": at}


func _circle_rect(c: Vector2, cr: float, rect: Rect2) -> bool:
	var hit: Dictionary = _rect_hit(c, rect)
	return float(hit["d"]) < cr


func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var delta := b - a
	var len2 := delta.length_squared()
	var t := 0.0
	if len2 > 0.00000001:
		t = clampf((p - a).dot(delta) / len2, 0.0, 1.0)
	return p.distance_to(a + delta * t)


func start_online_match(crimson: Dictionary, azure: Dictionary, crimson_peer: int, azure_peer: int, local_peer: int, record_results: bool) -> void:
	net_role = "server" if local_peer == 0 else "client"
	set_physics_process(false)
	record = record_results
	phase = "boot"
	paused = false
	result = null
	kill_call = null
	time = 0.0
	clock = Balance.MATCH_TIME
	takedowns = [0, 0]
	shake = 0.0
	fires.clear()
	shots.clear()
	floats.clear()
	bursts.clear()
	mega_fx.clear()
	saber_fx.clear()
	for child in unit_root.get_children():
		child.free()
	units.clear()
	diamonds.clear()
	WorldBuilder.populate(self)
	_spawn_diamonds()
	_spawn_online_units(crimson, azure, crimson_peer, azure_peer, local_peer)
	if player == null:
		player = unit_by_id("crimson")
	if player and is_instance_valid(player):
		camera.global_position = player.global_position
	camera.make_current()
	phase = "play"
	if hud and hud.has_method("bind_match"):
		hud.bind_match(self)
	if hud and hud.has_method("hide_help"):
		hud.hide_help()


func _spawn_online_units(crimson: Dictionary, azure: Dictionary, crimson_peer: int, azure_peer: int, local_peer: int) -> void:
	var blank_skills := {}
	for id in Balance.SKILL_ORDER:
		blank_skills[id] = false
	var zero := {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0}
	var roster: Array = [
		_human_def("crimson", crimson, 0, crimson_peer, local_peer, Vector2(24, 50) * 0.5, 0.0),
		{"id": "nia", "name": "Nia", "team": 0, "gender": "female", "role": "defend", "pos": Vector2(16, 48) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "joss", "name": "Joss", "team": 0, "gender": "male", "role": "escort", "pos": Vector2(26, 58) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "pico", "name": "Pico", "team": 0, "gender": "male", "role": "raid", "pos": Vector2(32, 50) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "bram", "name": "Bram", "team": 0, "gender": "male", "role": "fight", "pos": Vector2(22, 42) * 0.5, "stats": zero, "skills": _with(blank_skills, "fireball")},
		_human_def("azure", azure, 1, azure_peer, local_peer, Vector2(152, 50) * 0.5, PI),
		{"id": "sable", "name": "Sable", "team": 1, "gender": "female", "role": "escort", "pos": Vector2(150, 58) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "vex", "name": "Vex", "team": 1, "gender": "female", "role": "raid", "pos": Vector2(144, 52) * 0.5, "stats": zero, "skills": blank_skills.duplicate()},
		{"id": "mira", "name": "Mira", "team": 1, "gender": "female", "role": "fight", "pos": Vector2(156, 56) * 0.5, "stats": zero, "skills": _with(blank_skills, "fireball")},
		{"id": "quinn", "name": "Quinn", "team": 1, "gender": "male", "role": "fight", "pos": Vector2(148, 46) * 0.5, "stats": zero, "skills": _with(blank_skills, "lightning")}
	]
	var scene: PackedScene = unit_scene if unit_scene != null else UnitScene
	for def in roster:
		var unit = scene.instantiate()
		unit_root.add_child(unit)
		unit.setup(def, self)
		units.append(unit)
		if unit.is_player:
			player = unit


func _human_def(id: String, profile: Dictionary, team: int, peer: int, local_peer: int, pos: Vector2, facing: float) -> Dictionary:
	var local := local_peer != 0 and peer == local_peer
	var stats: Dictionary = profile.get("stats", {})
	var skills: Dictionary = profile.get("skills", {})
	return {
		"id": id,
		"name": str(profile.get("name", "You")),
		"team": team,
		"gender": str(profile.get("gender", "female")),
		"role": "player",
		"pos": pos,
		"facing": facing,
		"stats": stats.duplicate(true),
		"skills": skills.duplicate(true),
		"is_player": local,
		"is_remote": not local,
		"net_controlled": not local,
		"peer_id": peer,
		"invuln": 1.8
	}


func unit_by_id(id: String):
	for u in units:
		if str(u.unit_id) == id:
			return u
	return null


func unit_by_peer(peer: int):
	for u in units:
		if int(u.peer_id) == peer:
			return u
	return null


func _human_near(team: int, pos: Vector2) -> bool:
	for u in units:
		if int(u.peer_id) > 0 and int(u.team) == team and not u.dead and u.global_position.distance_to(pos) < 12.0:
			return true
	return false


func apply_net_buttons(unit, buttons: int) -> void:
	if unit == null or unit.dead or phase != "play":
		return
	if buttons & 1:
		if unit.root_locked():
			float_at(unit.global_position + Vector2(0, -0.9), "CHANNELING", Color(1, 0.69, 0.69))
		elif unit.carrying != null:
			float_at(unit.global_position + Vector2(0, -0.9), "CAN'T ATTACK", Color.WHITE)
		else:
			unit.try_swing()
	if buttons & 2:
		throw_diamond(unit)
	if buttons & 4:
		unit.try_hop()
	if buttons & 8:
		interact(unit)
	if buttons & 16:
		unit.toggle_weapon()
	if buttons & 32:
		unit.toggle_guard()
	var skill := (buttons >> 6) & 7
	if skill >= 1 and skill <= Balance.SKILL_ORDER.size():
		var id: String = str(Balance.SKILL_ORDER[skill - 1])
		if unit.skills.get(id, false):
			unit.try_cast(id)


func pack_net_bytes(ack: Dictionary) -> PackedByteArray:
	var buf := StreamPeerBuffer.new()
	buf.big_endian = false
	buf.put_u64(Time.get_ticks_msec())
	buf.put_float(clock)
	buf.put_float(time)
	buf.put_u8(1 if phase == "play" else 2 if phase == "result" else 0)
	buf.put_u16(mini(int(takedowns[0]), 65535))
	buf.put_u16(mini(int(takedowns[1]), 65535))
	buf.put_u8(mini(units.size(), 255))
	for u in units:
		var flags := 0
		if u.dead:
			flags |= 1
		if u.guard:
			flags |= 2
		if u.weapon == "bare":
			flags |= 4
		buf.put_float(u.global_position.x)
		buf.put_float(u.global_position.y)
		buf.put_float(u.facing)
		buf.put_float(u.hp)
		buf.put_float(u.mp)
		buf.put_u8(flags)
		buf.put_u8(_net_pose(u))
	buf.put_u8(mini(ack.size(), 8))
	var ack_n := 0
	for key in ack.keys():
		if ack_n >= 8:
			break
		buf.put_u32(int(key))
		buf.put_u32(int(ack[key]))
		ack_n += 1
	buf.put_u8(mini(diamonds.size(), 255))
	for d in diamonds:
		buf.put_float(d.pos.x)
		buf.put_float(d.pos.y)
		buf.put_float(float(d.bank))
		var carrier_i := 255
		if d.carrier != null:
			var found := units.find(d.carrier)
			if found >= 0 and found < 255:
				carrier_i = found
		var gflags := 0
		if d.at_home:
			gflags |= 1
		if d.in_flight:
			gflags |= 2
		buf.put_u8(carrier_i)
		buf.put_u8(gflags)
	buf.put_u8(mini(keeps.size(), 255))
	for k in keeps:
		var owner := int(k["owner"])
		buf.put_u8(255 if owner < 0 else owner)
		buf.put_u8(1 if float(k["down"]) > 0.0 else 0)
	var point_count := towers.size() + (1 if outpost != null else 0)
	buf.put_u8(mini(point_count, 255))
	for tower in towers:
		var owner2 := int(tower["owner"])
		buf.put_u8(255 if owner2 < 0 else owner2)
	if outpost != null:
		var owner3 := int(outpost["owner"])
		buf.put_u8(255 if owner3 < 0 else owner3)
	var kill_text := ""
	if kill_call != null:
		kill_text = str(kill_call.get("text", ""))
	var kill_bytes := kill_text.to_utf8_buffer()
	if kill_bytes.size() > 80:
		kill_bytes = kill_bytes.slice(0, 80)
	buf.put_u8(kill_bytes.size())
	if kill_bytes.size() > 0:
		buf.put_data(kill_bytes)
	var result_code := 0
	var result_team := 255
	if result != null:
		var kind := str(result.get("type", ""))
		if kind == "win":
			result_code = 1
		elif kind == "draw":
			result_code = 2
		elif kind == "left":
			result_code = 3
		var team := int(result.get("team", -1))
		result_team = 255 if team < 0 else team
	buf.put_u8(result_code)
	buf.put_u8(result_team)
	return buf.data_array


func apply_net_bytes(raw: PackedByteArray) -> void:
	if raw.is_empty():
		return
	var blob := _decode_net_bytes(raw)
	if blob.is_empty():
		return
	apply_net_snapshot(blob)


func _decode_net_bytes(raw: PackedByteArray) -> Dictionary:
	var buf := StreamPeerBuffer.new()
	buf.big_endian = false
	buf.data_array = raw
	if raw.size() < 24:
		return {}
	var server_ms := int(buf.get_u64())
	var clock_v := buf.get_float()
	var time_v := buf.get_float()
	var phase_code := buf.get_u8()
	var td0 := buf.get_u16()
	var td1 := buf.get_u16()
	var unit_count := buf.get_u8()
	var unit_rows: Array = []
	for i in unit_count:
		if i >= units.size():
			return {}
		var x := buf.get_float()
		var y := buf.get_float()
		var facing := buf.get_float()
		var hp := buf.get_float()
		var mp := buf.get_float()
		var flags := buf.get_u8()
		var pose := buf.get_u8()
		unit_rows.append([units[i].unit_id, x, y, facing, hp, mp, flags, pose])
	var ack := {}
	var ack_n := buf.get_u8()
	for _i in ack_n:
		var peer := buf.get_u32()
		var seq := buf.get_u32()
		ack[str(peer)] = seq
	var gems: Array = []
	var gem_n := buf.get_u8()
	for _j in gem_n:
		var gx := buf.get_float()
		var gy := buf.get_float()
		var bank := buf.get_float()
		var carrier_i := buf.get_u8()
		var gflags := buf.get_u8()
		var carrier := ""
		if carrier_i < units.size():
			carrier = str(units[carrier_i].unit_id)
		gems.append([gx, gy, carrier, bank, gflags])
	var keep_rows: Array = []
	var keep_n := buf.get_u8()
	for _k in keep_n:
		var owner := buf.get_u8()
		var down := buf.get_u8()
		keep_rows.append([-1 if owner == 255 else int(owner), down])
	var points: Array = []
	var point_n := buf.get_u8()
	for _p in point_n:
		var owner2 := buf.get_u8()
		points.append(-1 if owner2 == 255 else int(owner2))
	var kill_n := buf.get_u8()
	var kill_text := ""
	if kill_n > 0:
		var got: Array = buf.get_data(kill_n)
		if got.size() > 1 and got[1] is PackedByteArray:
			kill_text = (got[1] as PackedByteArray).get_string_from_utf8()
	var result_code := buf.get_u8()
	var result_team_b := buf.get_u8()
	var result_type := ""
	if result_code == 1:
		result_type = "win"
	elif result_code == 2:
		result_type = "draw"
	elif result_code == 3:
		result_type = "left"
	var phase_name := "boot"
	if phase_code == 1:
		phase_name = "play"
	elif phase_code == 2:
		phase_name = "result"
	return {
		"server_ms": server_ms,
		"clock": clock_v,
		"t": time_v,
		"phase": phase_name,
		"td0": td0,
		"td1": td1,
		"ack": ack,
		"units": unit_rows,
		"gems": gems,
		"keeps": keep_rows,
		"points": points,
		"kill": kill_text,
		"result_type": result_type,
		"result_team": -1 if result_team_b == 255 else int(result_team_b)
	}



func _net_pose(u) -> int:
	if u.dead:
		return 5
	if u.dash != null or u.hop != null or u.flight != null:
		return 6
	if u.channel != null:
		return 4
	if u.cast != null:
		return 3
	if u.swing_vis > 0.0 or u.attack_wind > 0.0:
		return 2
	if u.wish.length_squared() > 0.0:
		return 1
	return 0


func apply_net_snapshot(blob: Dictionary) -> void:
	if net_role != "client":
		return
	clock = float(blob.get("clock", clock))
	time = float(blob.get("t", time))
	takedowns[0] = int(blob.get("td0", takedowns[0]))
	takedowns[1] = int(blob.get("td1", takedowns[1]))
	var ack_map: Dictionary = blob.get("ack", {})
	var remote_poses := {}
	for row in blob.get("units", []):
		if typeof(row) != TYPE_ARRAY or row.size() < 8:
			continue
		var u = unit_by_id(str(row[0]))
		if u == null:
			continue
		var pos := Vector2(float(row[1]), float(row[2]))
		var facing := float(row[3])
		u.hp = float(row[4])
		u.mp = float(row[5])
		var flags := int(row[6])
		var pose := int(row[7])
		u.net_pose = pose
		var now_dead := (flags & 1) != 0
		if now_dead:
			u.dead = true
		elif u.dead:
			u.dead = false
			u.invuln = 1.8
			u.respawn_t = 0.0
		u.guard = (flags & 2) != 0
		if not u.guard:
			u.guard_block = false
		u.weapon = "bare" if (flags & 4) != 0 else "sword"
		if u == player:
			var special: bool = bool(u.dead) or pose == 3 or pose == 4 or pose == 6
			if special:
				u.global_position = pos
				u.facing = facing
				u.force_update_transform()
				Net.clear_history()
			else:
				var ack_seq := int(ack_map.get(str(u.peer_id), -1))
				Net.reconcile(u, pos, ack_seq)
		else:
			if pose == 2:
				u.swing_vis = maxf(u.swing_vis, 0.12)
			remote_poses[str(u.unit_id)] = {"pos": pos, "facing": facing}
	var server_ms := int(blob.get("server_ms", 0))
	if server_ms > 0 and not remote_poses.is_empty():
		Net.push_world_state(server_ms, remote_poses)
	_apply_net_gems(blob.get("gems", []))
	_apply_net_props(blob.get("keeps", []), blob.get("points", []))
	var kill_text := str(blob.get("kill", ""))
	if kill_text != "":
		if kill_call == null or str(kill_call.get("text", "")) != kill_text:
			kill_call = {"text": kill_text, "t": 2.2}
	if phase == "play" and str(blob.get("phase", "")) == "result":
		end_match(str(blob.get("result_type", "draw")), int(blob.get("result_team", -1)))
	_sync_world()
	_sync_diamonds()


func _apply_net_gems(gems: Array) -> void:
	for i in gems.size():
		if i >= diamonds.size() or typeof(gems[i]) != TYPE_ARRAY or gems[i].size() < 5:
			continue
		var row = gems[i]
		var d = diamonds[i]
		d.bank = float(row[3])
		var gflags := int(row[4])
		d.at_home = (gflags & 1) != 0
		d.in_flight = (gflags & 2) != 0
		var carrier_id := str(row[2])
		if carrier_id == "":
			if d.carrier != null:
				d.carrier.carrying = null
				d.carrier.guard = false
				d.carrier = null
			d.pos = d.home if d.at_home else Vector2(float(row[0]), float(row[1]))
			continue
		var carrier = unit_by_id(carrier_id)
		if carrier == null:
			d.pos = Vector2(float(row[0]), float(row[1]))
			continue
		if d.carrier != null and d.carrier != carrier:
			d.carrier.carrying = null
			d.carrier.guard = false
		if carrier.carrying != null and carrier.carrying != d:
			carrier.carrying.carrier = null
			carrier.carrying = null
		d.carrier = carrier
		carrier.carrying = d
		d.at_home = false
		if carrier == player:
			d.pos = carrier.global_position + Vector2(0, -0.2)
		else:
			d.pos = Vector2(float(row[0]), float(row[1]))


func _apply_net_props(keep_rows: Array, points: Array) -> void:
	for i in keep_rows.size():
		if i >= keeps.size() or typeof(keep_rows[i]) != TYPE_ARRAY or keep_rows[i].size() < 2:
			continue
		var row = keep_rows[i]
		keeps[i]["owner"] = int(row[0])
		if int(row[1]) != 0:
			if float(keeps[i]["down"]) <= 0.0:
				keeps[i]["down"] = 1.0
		else:
			keeps[i]["down"] = 0.0
	for i in towers.size():
		if i >= points.size():
			break
		towers[i]["owner"] = int(points[i])
	if outpost != null and points.size() > towers.size():
		outpost["owner"] = int(points[towers.size()])


func present_online(dt: float) -> void:
	if kill_call != null:
		kill_call["t"] = float(kill_call["t"]) - dt
		if float(kill_call["t"]) <= 0.0:
			kill_call = null
	for u in units:
		u.swing_vis = maxf(0.0, u.swing_vis - dt)
	for d in diamonds:
		if d.carrier != null and is_instance_valid(d.carrier):
			d.pos = d.carrier.global_position + Vector2(0, -0.2)
	_tick_fx(dt)
	_sync_diamonds()
	if player and is_instance_valid(player):
		camera.global_position = camera.global_position.lerp(player.global_position, minf(1.0, dt * 6.0))
