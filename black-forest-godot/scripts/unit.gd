extends CharacterBody2D
## One hero. Movement uses Godot's physics motion test against walls, trees,
## rocks, and gates. Bridge-tower solidity stays in the match keep rule.

const Balance = preload("res://scripts/balance.gd")
const State = preload("res://scripts/state.gd")

var sim: Node
var unit_id := ""
var unit_name := "You"
var team := 0
var gender := "female"
var is_player := false
var is_remote := false
var net_controlled := false
var peer_id := 0
var net_pose := 0
var role := "fight"
var radius := 0.48
var facing := 0.0
var stats := {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0}
var hp := 100.0
var max_hp := 100.0
var mp := 100.0
var max_mp := 100.0
var weapon := "sword"
var shock := 0.0
var slow_cast := 0.0
var skills := {}
var cds := {}
var cast = null
var attack_wind := 0.0
var attack_cd := 0.0
var swing_vis := 0.0
var swing_arc := Balance.SWORD_ARC
var swing_range := Balance.SWORD_RANGE
var fire_sword_t := 0.0
var fire_sword_hits := 0
var burn = null
var clones: Array = []
var dash = null
var hop = null
var hop_cd := 0.0
var flight = null
var channel = null
var invuln := 0.0
var respawn_t := 0.0
var dead := false
var hit_flash := 0.0
var carrying = null
var guard := false
var guard_block := false
var wish := Vector2.ZERO
var click_target = null
var warp_cd := 0.0
var move_blend := 0.0
var cast_face := 0.0
var has_cast_face := false
var kills := 0
var active := false
var _font: Font

@onready var sprite: Sprite2D = $Visual/Sprite2D
@onready var fighter: Node2D = $Visual/Fighter
@onready var visual: Node2D = $Visual
@onready var blade: Polygon2D = $Visual/WeaponPivot/Blade
@onready var anim: AnimationPlayer = $AnimationPlayer
@onready var sensor: Area2D = $Sensor


func _ready() -> void:
	motion_mode = MOTION_MODE_FLOATING
	safe_margin = 0.02
	collision_layer = Balance.LAYER_UNIT
	collision_mask = Balance.LAYER_WALL
	var shape := CircleShape2D.new()
	shape.radius = radius
	$CollisionShape2D.shape = shape
	var sensor_shape := CircleShape2D.new()
	sensor_shape.radius = 0.08
	$Sensor/CollisionShape2D.shape = sensor_shape
	sensor.monitoring = true
	sensor.monitorable = false
	sensor.collision_layer = 0
	sensor.collision_mask = Balance.LAYER_WATER | Balance.LAYER_BRIDGE | Balance.LAYER_ISLAND
	sprite.visible = false
	blade.visible = false
	_font = ThemeDB.fallback_font
	_build_anims()
	set_physics_process(false)


func setup(def: Dictionary, sim_node: Node) -> void:
	sim = sim_node
	unit_id = str(def["id"])
	unit_name = str(def["name"])
	name = unit_id
	team = int(def["team"])
	var raw_gender := str(def.get("gender", "female"))
	gender = raw_gender if raw_gender == "male" or raw_gender == "female" else "female"
	is_player = bool(def.get("is_player", false))
	is_remote = bool(def.get("is_remote", false))
	net_controlled = bool(def.get("net_controlled", false))
	peer_id = int(def.get("peer_id", 0))
	role = str(def.get("role", "fight"))
	global_position = def["pos"]
	facing = float(def.get("facing", 0.0))
	stats = (def["stats"] as Dictionary).duplicate(true)
	max_hp = Balance.max_hp(stats)
	hp = max_hp
	max_mp = Balance.max_mp(stats)
	mp = max_mp
	skills = (def["skills"] as Dictionary).duplicate(true)
	cds = {}
	for id in Balance.SKILL_ORDER:
		cds[id] = 0.0
		if not skills.has(id):
			skills[id] = false
	invuln = float(def.get("invuln", 0.0))
	collision_mask = sim.mask_for(team)
	active = true


func _process(_delta: float) -> void:
	if not active:
		return
	_sync_visual()
	queue_redraw()


func tick(dt: float) -> void:
	if not active:
		return
	collision_mask = sim.mask_for(team)
	if dead:
		respawn_t -= dt
		if respawn_t <= 0.0:
			sim.respawn_unit(self)
		_sync_visual()
		return
	for id in cds.keys():
		if float(cds[id]) > 0.0:
			cds[id] = maxf(0.0, float(cds[id]) - dt)
	shock = maxf(0.0, shock - dt)
	slow_cast = maxf(0.0, slow_cast - dt)
	if guard and carrying == null:
		guard = false
		guard_block = false
	if guard and carrying != null:
		mp = maxf(0.0, mp - Balance.GUARD_DRAIN * dt)
		if mp <= 0.0:
			mp = 0.0
			guard = false
			guard_block = true
			if is_player:
				sim.float_at(global_position + Vector2(0, -0.9), "DEFENSE DOWN", Color(0.75, 0.96, 1))
	else:
		mp = minf(max_mp, mp + 1.0 * dt)
	invuln = maxf(0.0, invuln - dt)
	hop_cd = maxf(0.0, hop_cd - dt)
	warp_cd = maxf(0.0, warp_cd - dt)
	attack_cd = maxf(0.0, attack_cd - dt)
	hit_flash = maxf(0.0, hit_flash - dt)
	swing_vis = maxf(0.0, swing_vis - dt)
	if fire_sword_t > 0.0:
		fire_sword_t -= dt
		if fire_sword_t <= 0.0 or fire_sword_hits <= 0:
			fire_sword_t = 0.0
			fire_sword_hits = 0
	if burn != null and float(burn.t) > 0.0:
		if invuln <= 0.0:
			hp -= sim.mitigated(self, float(burn.dps) * dt)
		burn.t = float(burn.t) - dt
		if hp <= 0.0:
			sim.kill_unit(self, burn.src)
			return
		if float(burn.t) <= 0.0:
			burn = null
	if cast != null:
		if carrying != null:
			cast = null
		else:
			cast.t = float(cast.t) - dt
			if float(cast.t) <= 0.0:
				sim.finish_cast(self)
	if attack_wind > 0.0:
		if carrying != null or dead:
			attack_wind = 0.0
		else:
			attack_wind -= dt
			if attack_wind <= 0.0:
				sim.resolve_swing(self)
	if channel != null:
		channel.t = float(channel.t) - dt
		if float(channel.t) <= 0.0:
			sim.finish_channel(self)
		if channel != null:
			wish = Vector2.ZERO
			if channel.kind == "mega" or channel.kind == "saber":
				click_target = null
				attack_wind = 0.0
				hop = null
				dash = null
				cast = null
	if flight != null:
		flight.t = float(flight.t) + dt
		var k := clampf(float(flight.t) / float(flight.dur), 0.0, 1.0)
		global_position = Vector2(lerpf(flight.x0, flight.x1, k), lerpf(flight.y0, flight.y1, k))
		force_update_transform()
		if k >= 1.0:
			flight = null
			sim.float_at(global_position + Vector2(0, -0.9), "LAND", Color.WHITE)
	elif dash != null:
		var step := (float(dash.dist) / float(dash.dur)) * dt
		var before := global_position
		try_step(cos(dash.dir) * step, sin(dash.dir) * step)
		dash.traveled = float(dash.traveled) + global_position.distance_to(before)
		dash.from_pos = before
		sim.strike_dash(self)
		dash.t = float(dash.t) - dt
		if float(dash.t) <= 0.0 or float(dash.traveled) >= float(dash.dist) - 0.05:
			dash = null
	elif hop != null:
		if shock > 0.0:
			hop = null
		else:
			var hop_step := (float(hop.dist) / float(hop.dur)) * dt
			try_step(cos(hop.dir) * hop_step, sin(hop.dir) * hop_step)
			hop.t = float(hop.t) - dt
			if float(hop.t) <= 0.0:
				hop = null
	elif root_locked():
		wish = Vector2.ZERO
		click_target = null
	else:
		if net_controlled:
			if wish.length_squared() > 0.0:
				facing = wish.angle()
		elif is_player:
			read_player()
		else:
			tick_bot(dt)
		predict_move(dt)
	if dash != null:
		move_blend = 1.0
	elif wish == Vector2.ZERO:
		move_blend = maxf(0.0, move_blend - dt / 0.24)
	sim.eject_keep(self)
	if invuln <= 0.0 and sim.standing_in_fire(self):
		hp -= sim.mitigated(self, 5.0 * dt)
		if hp <= 0.0:
			sim.kill_unit(self, null)
			return
	_follow_clones(dt)
	if carrying != null:
		carrying.pos = global_position + Vector2(0, -0.2)
	_sync_visual()


func predict_move(dt: float) -> void:
	if dead:
		return
	if shock > 0.0:
		wish = Vector2.ZERO
		click_target = null
	var sp := move_speed() * dt
	if sp > 0.0 and wish.length_squared() > 0.0:
		var before2 := global_position
		try_step(wish.x * sp, wish.y * sp)
		if global_position.distance_to(before2) < sp * 0.25:
			var base: float = wish.angle()
			for off in [0.7, -0.7, 1.3, -1.3]:
				try_step(cos(base + off) * sp, sin(base + off) * sp)
				if global_position.distance_to(before2) > sp * 0.25:
					break
		if global_position.distance_to(before2) > 0.004:
			move_blend = minf(1.0, move_blend + dt / 0.18)


func read_player() -> void:
	var mx := 0.0
	var my := 0.0
	if Input.is_action_pressed("move_up"):
		my -= 1.0
	if Input.is_action_pressed("move_down"):
		my += 1.0
	if Input.is_action_pressed("move_left"):
		mx -= 1.0
	if Input.is_action_pressed("move_right"):
		mx += 1.0
	if mx != 0.0 or my != 0.0:
		wish = Vector2(mx, my).normalized()
		click_target = null
	else:
		var stick := _stick_wish()
		if stick.length() > 0.18:
			wish = stick.normalized()
			click_target = null
		elif click_target != null:
			var delta: Vector2 = click_target - global_position
			if delta.length() < 0.35:
				wish = Vector2.ZERO
				click_target = null
			else:
				wish = delta.normalized()
		else:
			wish = Vector2.ZERO
	if wish != Vector2.ZERO:
		facing = wish.angle()


func tick_bot(_dt: float) -> void:
	var foe = null if carrying != null else sim.nearest_enemy(self, 2.1)
	var door = null if carrying != null else sim.enemy_door(self)
	if carrying == null and cast == null and dash == null:
		if foe != null and attack_cd <= 0.0:
			try_swing()
		elif door != null and attack_cd <= 0.0:
			try_swing()
		elif skills.get("fireball", false) and float(cds["fireball"]) <= 0.0 and foe == null:
			var shot = sim.nearest_enemy(self, 12.0)
			if shot != null and global_position.distance_to(shot.global_position) > 4.0 and sim.los(global_position, shot.global_position, team):
				cast_face = (shot.global_position - global_position).angle()
				has_cast_face = true
				facing = cast_face
				try_cast("fireball")
		elif skills.get("lightning", false) and float(cds["lightning"]) <= 0.0:
			var shot2 = sim.nearest_enemy(self, 8.0)
			if shot2 != null and global_position.distance_to(shot2.global_position) > 3.2 and sim.los(global_position, shot2.global_position, team):
				facing = (shot2.global_position - global_position).angle()
				try_cast("lightning")
	if role == "defend":
		sim.maybe_repair(self)
	if warp_cd <= 0.0:
		sim.bot_use_map(self)
	var goal: Dictionary = sim.bot_goal(self)
	var goal_pos: Vector2 = goal["pos"]
	var goal_unit = goal["unit"]
	if goal_unit != null and goal_unit != self and goal_unit.team == team and goal_unit.carrying != null:
		var away: Vector2 = global_position - goal_unit.global_position
		if away.length() < 1.7:
			var n := away.normalized() if away.length() > 0.05 else Vector2(cos(float(unit_id.length())), sin(float(unit_id.length())))
			goal_pos = goal_unit.global_position + n * 1.7
	var wp: Vector2 = sim.steer_point(self, goal_pos)
	var delta := wp - global_position
	var length := delta.length()
	if length < 0.6 and role == "defend" and sim.nearest_enemy(self, 9.0) == null:
		wish = Vector2.ZERO
	elif length > 0.001:
		wish = delta / length
	else:
		wish = Vector2.ZERO
	if cast != null and str(cast.name) == "fireball" and has_cast_face:
		facing = cast_face
	elif wish != Vector2.ZERO:
		facing = wish.angle()


func move_speed() -> float:
	var s := (Balance.PLAYER_SPEED if is_player or is_remote else Balance.BOT_SPEED) * Balance.spd_mul(stats)
	if carrying != null:
		s *= Balance.CARRY_SPEED
	if sim.in_water(global_position) and hop == null and dash == null and flight == null:
		s *= 0.5
	if cast != null and cast.root:
		return 0.0
	if cast != null and cast.slow:
		s *= 0.5
	if channel != null:
		return 0.0
	if attack_wind > 0.0:
		s *= 0.82
	return s


func try_step(dx: float, dy: float) -> void:
	collision_mask = sim.mask_for(team)
	if absf(dx) > 0.00001:
		var nx := global_position.x + dx
		if not _motion_hits(Vector2(dx, 0.0)) and not sim.keep_blocks(Vector2(nx, global_position.y), team):
			global_position.x = nx
			force_update_transform()
	if absf(dy) > 0.00001:
		var ny := global_position.y + dy
		if not _motion_hits(Vector2(0.0, dy)) and not sim.keep_blocks(Vector2(global_position.x, ny), team):
			global_position.y = ny
			force_update_transform()


func _motion_hits(motion: Vector2) -> bool:
	var params := PhysicsTestMotionParameters2D.new()
	params.from = global_transform
	params.motion = motion
	params.margin = 0.01
	var result := PhysicsTestMotionResult2D.new()
	return PhysicsServer2D.body_test_motion(get_rid(), params, result)


func root_locked() -> bool:
	return channel != null and (channel.kind == "mega" or channel.kind == "saber")


func try_cast(skill_name: String) -> bool:
	if dead or cast != null or dash != null or flight != null:
		return false
	if channel != null:
		if is_player and root_locked():
			sim.float_at(global_position + Vector2(0, -0.9), "CHANNELING", Color(1, 0.69, 0.69))
		return false
	if carrying != null:
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "CAN'T CAST", Color.WHITE)
		return false
	if shock > 0.0 and skill_name != "fireball":
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "SHOCKED", Color(1, 0.96, 0.66))
		return false
	if not skills.get(skill_name, false):
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "LOCKED", Color(0.87, 0.87, 0.87))
		return false
	var def: Dictionary = Balance.SKILLS[skill_name]
	if float(cds.get(skill_name, 0.0)) > 0.0:
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "COOLDOWN", Color(1, 0.82, 0.66))
		return false
	var cost := Balance.skill_cost(def, max_mp)
	if mp + 0.001 < cost:
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "NO MP", Color(0.73, 0.86, 1))
		return false
	if skill_name == "mega" or skill_name == "saber":
		mp -= cost
		cds[skill_name] = float(def["cd"]) * Balance.cd_mul(stats)
		if skill_name == "mega":
			sim.begin_mega(self)
		else:
			sim.begin_saber(self)
		Sfx.play("mega" if skill_name == "mega" else "saber")
		return true
	mp -= cost
	var dur := cast_duration(skill_name)
	cds[skill_name] = float(def["cd"]) * Balance.cd_mul(stats)
	var rooted := skill_name == "lightning" or skill_name == "firesword"
	cast = State.new()
	cast.name = skill_name
	cast.t = dur
	cast.dur = dur
	cast.root = rooted
	cast.slow = not rooted
	if skill_name == "fireball":
		Sfx.play("fireball")
	elif skill_name == "lightning":
		Sfx.play("lightning")
	return true


func cast_duration(skill_name: String) -> float:
	var def: Dictionary = Balance.SKILLS[skill_name]
	var t := float(def["cast"])
	if skill_name == "lightning":
		t *= 1.0 - 0.005 * float(stats.get("spd", 0))
	if slow_cast > 0.0:
		t *= 2.0
	return t


func try_swing() -> bool:
	if dead or carrying != null or cast != null or dash != null or flight != null or attack_cd > 0.0 or attack_wind > 0.0:
		return false
	if root_locked():
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "CHANNELING", Color(1, 0.69, 0.69))
		return false
	if shock > 0.0:
		if is_player:
			sim.float_at(global_position + Vector2(0, -0.9), "SHOCKED", Color(1, 0.96, 0.66))
		return false
	var base := 0.18 if weapon == "bare" else 0.22
	attack_wind = base * Balance.agi_mul(stats)
	attack_cd = 0.5
	return true


func try_hop() -> void:
	if dead or dash != null or flight != null or hop != null or hop_cd > 0.0 or shock > 0.0:
		return
	if cast != null and cast.root:
		return
	if root_locked():
		return
	if channel != null:
		channel = null
	var dir := wish.angle() if wish != Vector2.ZERO else facing
	var dur := 0.26 * (1.0 - 0.005 * float(stats.get("spd", 0)))
	hop = State.new()
	hop.t = dur
	hop.dur = dur
	hop.dir = dir
	hop.dist = 1.25
	hop_cd = 0.85 * (1.0 - 0.005 * float(stats.get("spd", 0)))
	Sfx.play("hop")


func toggle_weapon() -> void:
	if carrying != null:
		sim.float_at(global_position + Vector2(0, -0.9), "HANDS FULL", Color.WHITE)
		return
	weapon = "bare" if weapon == "sword" else "sword"
	sim.float_at(global_position + Vector2(0, -0.9), "SWORD" if weapon == "sword" else "BARE HAND", Color.WHITE)


func toggle_guard() -> void:
	if dead or carrying == null:
		return
	if guard:
		guard = false
		guard_block = false
		sim.float_at(global_position + Vector2(0, -0.9), "DEFENSE OFF", Color(0.75, 0.96, 1))
		return
	if mp <= 0.0:
		sim.float_at(global_position + Vector2(0, -0.9), "NO MP", Color(0.73, 0.86, 1))
		return
	guard = true
	guard_block = false
	sim.float_at(global_position + Vector2(0, -0.9), "DEFENSE", Color(0.75, 0.96, 1))


func clear_guard() -> void:
	guard = false
	guard_block = false


func swing_shape() -> Dictionary:
	var lit := fire_sword_t > 0.0 and fire_sword_hits > 0
	return {
		"range": Balance.FIRE_SWORD_RANGE if lit else Balance.SWORD_RANGE,
		"arc": Balance.FIRE_SWORD_ARC if lit else Balance.SWORD_ARC,
		"lit": lit
	}


func _follow_clones(dt: float) -> void:
	for c in clones:
		if not c.alive:
			continue
		c.t = float(c.t) - dt
		if float(c.t) <= 0.0 or float(c.hp) <= 0.0:
			c.alive = false
			if c.node:
				c.node.visible = false
			sim.burst(c.pos, Color(0.73, 0.96, 1), 8, 2.4)
			continue
		var ang := facing + float(c.side)
		c.pos = global_position + Vector2(cos(ang), sin(ang)) * 0.5
		c.facing = facing
		if c.node:
			c.node.global_position = c.pos
			var rig: Node = c.node.get_node_or_null("Fighter")
			if rig:
				rig.set("facing", facing)
				rig.set("move_blend", move_blend)
				rig.set("swing", swing_vis)
				rig.set("attack_wind", attack_wind)
				rig.set("gender", gender)
				rig.set("team", team)
				rig.set("ghost", true)
				rig.set("lit_sword", fire_sword_t > 0.0)
				rig.set("dead", false)
				rig.set("carrying", carrying != null)


func _view_for(angle: float) -> Dictionary:
	var choices: Array = [
		{"view": "front", "ang": PI / 2.0, "flip": false},
		{"view": "back", "ang": -PI / 2.0, "flip": false},
		{"view": "side", "ang": 0.0, "flip": false},
		{"view": "side", "ang": PI, "flip": true}
	]
	var best: Dictionary = choices[0]
	var best_d := 99.0
	for choice in choices:
		var d := absf(Balance.ang_diff(angle, float(choice["ang"])))
		if d < best_d:
			best_d = d
			best = choice
	return best


func _stick_wish() -> Vector2:
	if sim == null or sim.hud == null or not sim.hud.has_method("stick_wish"):
		return Vector2.ZERO
	var value: Vector2 = sim.hud.call("stick_wish")
	return value


func _sync_visual() -> void:
	if sprite:
		sprite.visible = false
	if blade:
		blade.visible = false
	if fighter and fighter.has_method("sync_from"):
		fighter.sync_from(self)
		if invuln > 0.0 and fmod(sim.time * 12.0, 1.0) < 0.35:
			fighter.modulate.a = 0.45
		else:
			fighter.modulate.a = 1.0
	z_index = int(global_position.y * 10.0)
	$CollisionShape2D.disabled = dead
	if anim == null:
		return
	var next := "lib/idle"
	if dead:
		next = "lib/death"
	elif root_locked():
		next = "lib/channel"
	elif swing_vis > 0.0:
		next = "lib/swing"
	elif cast != null:
		next = "lib/cast"
	elif move_blend > 0.25:
		next = "lib/walk"
	if anim.current_animation != next:
		anim.play(next)


func _draw() -> void:
	var ring := Color(0.95, 0.28, 0.42) if team == 0 else Color(0.3, 0.72, 1.0)
	if guard and carrying != null:
		ring = Color(0.7, 0.95, 1.0)
		draw_arc(Vector2.ZERO, radius + 0.12, 0.0, TAU, 24, ring, 0.07, true)
	if not dead:
		draw_arc(Vector2.ZERO, radius, 0.0, TAU, 28, ring, 0.055, true)
	if swing_vis > 0.0:
		draw_arc(Vector2.ZERO, swing_range + radius, facing - swing_arc * 0.5, facing + swing_arc * 0.5, 10, Color(1, 0.75, 0.35, 0.85), 0.07, true)
	if not dead and _font != null:
		var w := 0.9
		var ratio := clampf(hp / max_hp, 0.0, 1.0)
		draw_rect(Rect2(-w * 0.5, -1.42, w, 0.08), Color(0, 0, 0, 0.55))
		draw_rect(Rect2(-w * 0.5, -1.42, w * ratio, 0.08), Color(0.35, 0.85, 0.4) if ratio > 0.35 else Color(0.9, 0.3, 0.25))
		draw_set_transform(Vector2(0, -1.62), 0.0, Vector2(0.02, 0.02))
		var width := _font.get_string_size(unit_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		draw_string(_font, Vector2(-width * 0.5, 0), unit_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _build_anims() -> void:
	var lib := AnimationLibrary.new()
	lib.add_animation("idle", _bob_anim(0.9, 0.045))
	lib.add_animation("walk", _bob_anim(0.42, 0.07))
	var swing := Animation.new()
	swing.length = 0.26
	var track := swing.add_track(Animation.TYPE_VALUE)
	swing.track_set_path(track, "Visual/WeaponPivot:rotation")
	swing.track_insert_key(track, 0.0, -1.15)
	swing.track_insert_key(track, 0.26, 1.15)
	lib.add_animation("swing", swing)
	var cast_anim := Animation.new()
	cast_anim.length = 0.5
	cast_anim.loop_mode = Animation.LOOP_LINEAR
	var scale_track := cast_anim.add_track(Animation.TYPE_VALUE)
	cast_anim.track_set_path(scale_track, "Visual:scale")
	cast_anim.track_insert_key(scale_track, 0.0, Vector2.ONE)
	cast_anim.track_insert_key(scale_track, 0.25, Vector2(1.06, 1.06))
	cast_anim.track_insert_key(scale_track, 0.5, Vector2.ONE)
	lib.add_animation("cast", cast_anim)
	var channel := Animation.new()
	channel.length = 0.3
	channel.loop_mode = Animation.LOOP_LINEAR
	var pos_track := channel.add_track(Animation.TYPE_VALUE)
	channel.track_set_path(pos_track, "Visual:position")
	channel.track_insert_key(pos_track, 0.0, Vector2.ZERO)
	channel.track_insert_key(pos_track, 0.15, Vector2(0.04, 0))
	channel.track_insert_key(pos_track, 0.3, Vector2.ZERO)
	lib.add_animation("channel", channel)
	var death := Animation.new()
	death.length = 0.45
	var rot := death.add_track(Animation.TYPE_VALUE)
	death.track_set_path(rot, "Visual:rotation")
	death.track_insert_key(rot, 0.0, 0.0)
	death.track_insert_key(rot, 0.45, 1.2)
	lib.add_animation("death", death)
	anim.root_node = NodePath("..")
	anim.add_animation_library("lib", lib)
	anim.play("lib/idle")


func _bob_anim(length: float, amount: float) -> Animation:
	var anim_bob := Animation.new()
	anim_bob.length = length
	anim_bob.loop_mode = Animation.LOOP_LINEAR
	var track := anim_bob.add_track(Animation.TYPE_VALUE)
	anim_bob.track_set_path(track, "Visual:position")
	anim_bob.track_insert_key(track, 0.0, Vector2.ZERO)
	anim_bob.track_insert_key(track, length * 0.5, Vector2(0, -amount))
	anim_bob.track_insert_key(track, length, Vector2.ZERO)
	return anim_bob
