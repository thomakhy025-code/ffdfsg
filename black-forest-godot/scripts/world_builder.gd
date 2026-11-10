extends RefCounted
## Half-size Black Forest. Geometry is built in the browser's pre-halve space,
## then scaled by 0.5, matching halveWorld() in game.js.

const Balance = preload("res://scripts/balance.gd")
const LabelScript = preload("res://scripts/world_label.gd")


static func populate(match_node: Node2D) -> void:
	var parent: Node2D = match_node.get_node("World")
	for child in parent.get_children():
		child.free()

	var rivers: Array = []
	var pond: PackedVector2Array = pond_outline(88.0)
	var isle_poly := PackedVector2Array([
		Vector2(84.2, 47.4), Vector2(86.6, 45.5), Vector2(90.4, 46.2), Vector2(93.4, 48.5),
		Vector2(94.1, 51.8), Vector2(92.0, 54.6), Vector2(88.4, 55.5), Vector2(85.0, 54.2),
		Vector2(83.2, 51.4), Vector2(83.4, 48.6)
	])
	var west_line: Array = [
		Vector2(49.4, 38), Vector2(52.6, 43), Vector2(48.2, 48),
		Vector2(52.4, 53), Vector2(48.4, 58), Vector2(51.8, 64)
	]
	var west_river: PackedVector2Array = ribbon(west_line, 1.75)
	var east_line: Array = []
	for p in west_line:
		east_line.append(Vector2(176.0 - p.x, p.y))
	var east_river: PackedVector2Array = ribbon(east_line, 1.75)
	rivers.append(scale_poly(west_river, 0.5))
	rivers.append(scale_poly(east_river, 0.5))
	var pond_s := scale_poly(pond, 0.5)
	var isle_s := scale_poly(isle_poly, 0.5)

	_grass(parent)
	_bounds(parent)
	for poly in rivers:
		_area_poly(parent, poly, Balance.LAYER_WATER, "water", Color(0.18, 0.58, 0.9, 0.95))
		_poly(parent, inset_poly(poly, 0.78), Color(0.55, 0.88, 1.0, 0.32))
	_area_poly(parent, pond_s, Balance.LAYER_WATER, "water", Color(0.22, 0.64, 0.94, 0.95))
	_poly(parent, inset_poly(pond_s, 0.8), Color(0.62, 0.9, 1.0, 0.34))

	var isles: Array = []
	isles.append({"pos": Vector2(88.2, 50.4) * 0.5, "poly": isle_s, "r": 0.0})
	isles.append({"pos": Vector2(96.8, 43.4) * 0.5, "r": 1.55 * 0.5})
	for isle in isles:
		if isle.has("poly"):
			_area_poly(parent, isle["poly"], Balance.LAYER_ISLAND, "dry", Color(0.62, 0.4, 0.22, 1))
			_poly(parent, inset_poly(isle["poly"], 0.62), Color(0.55, 0.88, 0.36, 1))
		else:
			var circle := circle_poly(isle["pos"], float(isle["r"]), 18)
			_area_poly(parent, circle, Balance.LAYER_ISLAND, "dry", Color(0.62, 0.4, 0.22, 1))
			_poly(parent, circle_poly(isle["pos"], float(isle["r"]) * 0.72, 14), Color(0.55, 0.88, 0.36, 1))

	var bridges: Array = []
	var deck := 7.6
	var bridge_specs: Array = [
		Rect2((88.0 - deck / 2.0) * 0.5, 21.8 * 0.5, deck * 0.5, 3.2 * 0.5),
		Rect2((88.0 - deck / 2.0) * 0.5, 76.2 * 0.5, deck * 0.5, 3.2 * 0.5)
	]
	for rect_item in bridge_specs:
		var rect: Rect2 = rect_item
		var poly := rect_poly(rect)
		_area_poly(parent, poly, Balance.LAYER_BRIDGE, "dry", Color(0.78, 0.56, 0.3, 1))
		for plank in 4:
			var y: float = rect.position.y + rect.size.y * (float(plank) + 0.5) / 4.0
			_poly(parent, rect_poly(Rect2(rect.position.x + 0.08, y, rect.size.x - 0.16, 0.05)), Color(0.5, 0.34, 0.16, 0.9))
		_poly(parent, rect_poly(Rect2(rect.position.x, rect.position.y, 0.08, rect.size.y)), Color(0.42, 0.28, 0.14))
		_poly(parent, rect_poly(Rect2(rect.position.x + rect.size.x - 0.08, rect.position.y, 0.08, rect.size.y)), Color(0.42, 0.28, 0.14))
		bridges.append(rect)

	_floors(parent)
	var walls: Array = _walls(parent)
	var trees: Array = _trees(parent)
	var rocks: Array = _rocks(parent)
	var keeps: Array = _keeps(parent)
	var towers: Array = _south_towers(parent)
	var outpost: Dictionary = _outpost(parent)
	var sewers: Array = _sewers(parent)
	var catapults: Array = _catapults(parent)
	var ladders: Array = _ladders(parent)
	var springs: Array = _springs(parent)
	var cakes: Array = [
		{"pos": Vector2(88.2, 50.2) * 0.5, "t": 0.0, "node": null},
		{"pos": Vector2(96.8, 43.4) * 0.5, "t": 0.0, "node": null}
	]
	for cake in cakes:
		cake["node"] = _cake_node(parent, cake["pos"])
	var vaults: Array = [
		{"pos": Vector2(20, 66) * 0.5, "r": 3.5 * 0.5, "team": 0},
		{"pos": Vector2(156, 66) * 0.5, "r": 3.5 * 0.5, "team": 1}
	]
	for v in vaults:
		_ring(parent, v["pos"], v["r"], Color(0.91, 0.7, 0.23, 0.95))
		_label(parent, v["pos"] + Vector2(0, -float(v["r"]) - 0.35), "VAULT", Color(0.15, 0.08, 0.05))
	var diamond_homes: Array = [
		{"team": 0, "home": Vector2(18, 40) * 0.5},
		{"team": 1, "home": Vector2(158, 40) * 0.5}
	]
	for home in diamond_homes:
		_ring(parent, home["home"], 0.7, Color(0.95, 0.9, 0.75, 0.8))
		_label(parent, home["home"] + Vector2(0, -1.05), "TEAM DIAMOND", Color(0.1, 0.08, 0.16))

	_label(parent, Vector2(44, 3.1), "BLACK FOREST", Color(0.1, 0.08, 0.16))
	_label(parent, Vector2(12, 16.5), "CRIMSON KEEP", Color(0.48, 0.06, 0.19))
	_label(parent, Vector2(76, 16.5), "AZURE KEEP", Color(0.07, 0.24, 0.53))
	_label(parent, Vector2(38, 20.5), "POND", Color(0.08, 0.21, 0.37))
	_label(parent, Vector2(44, 9.6), "UPPER BRIDGE", Color(0.1, 0.08, 0.16))
	_label(parent, Vector2(44, 41.6), "LOWER BRIDGE", Color(0.1, 0.08, 0.16))
	_label(parent, Vector2(44, 4.1), "ORE", Color(0.1, 0.08, 0.16))

	var water: Array = []
	water.append_array(rivers)
	water.append(pond_s)

	match_node.walls = walls
	match_node.trees = trees
	match_node.rocks = rocks
	match_node.keeps = keeps
	match_node.towers = towers
	match_node.outpost = outpost
	match_node.sewers = sewers
	match_node.catapults = catapults
	match_node.ladders = ladders
	match_node.springs = springs
	match_node.cakes = cakes
	match_node.vaults = vaults
	match_node.diamond_homes = diamond_homes
	match_node.bridges = bridges
	match_node.isles = isles
	match_node.water_polys = water


static func _grass(parent: Node2D) -> void:
	_poly(parent, PackedVector2Array([
		Vector2(0, 0), Vector2(Balance.MAP_W, 0), Vector2(Balance.MAP_W, Balance.MAP_H), Vector2(0, Balance.MAP_H)
	]), Color(0.58, 0.84, 0.28, 1))
	_tufts(parent)
	_poly(parent, PackedVector2Array([
		Vector2(0, 0), Vector2(Balance.MAP_W, 0), Vector2(Balance.MAP_W, 4.2), Vector2(0, 4.2)
	]), Color(0.8, 0.74, 0.58, 1))
	_poly(parent, PackedVector2Array([
		Vector2(0, 45.5), Vector2(Balance.MAP_W, 45.5), Vector2(Balance.MAP_W, Balance.MAP_H), Vector2(0, Balance.MAP_H)
	]), Color(0.92, 0.8, 0.48, 1))


static func _bounds(parent: Node2D) -> void:
	var specs: Array = [
		Rect2(-20, -20, 21, Balance.MAP_H + 40),
		Rect2(Balance.MAP_W - 1.0, -20, 20, Balance.MAP_H + 40),
		Rect2(-20, -20, Balance.MAP_W + 40, 21.5),
		Rect2(-20, Balance.MAP_H - 1.5, Balance.MAP_W + 40, 20)
	]
	for rect in specs:
		var body := StaticBody2D.new()
		body.collision_layer = Balance.LAYER_WALL
		body.collision_mask = 0
		var shape := RectangleShape2D.new()
		shape.size = rect.size
		var col := CollisionShape2D.new()
		col.shape = shape
		col.position = rect.position + rect.size * 0.5
		body.add_child(col)
		parent.add_child(body)


static func _floors(parent: Node2D) -> void:
	_poly(parent, rect_poly(Rect2(4.5, 14.5, 15.0, 22.0)), Color(0.96, 0.9, 0.72, 1))
	_poly(parent, rect_poly(Rect2(68.5, 14.5, 15.0, 22.0)), Color(0.96, 0.9, 0.72, 1))
	_poly(parent, rect_poly(Rect2(12.0, 24.2, 7.5, 0.55)), Color(0.75, 0.16, 0.28, 0.95))
	_poly(parent, rect_poly(Rect2(68.5, 24.2, 7.5, 0.55)), Color(0.16, 0.4, 0.78, 0.95))


static func _walls(parent: Node2D) -> Array:
	var specs: Array = [
		{"kind": "wall", "team": -1, "x": 6, "y": 26, "w": 36, "h": 3},
		{"kind": "wall", "team": -1, "x": 6, "y": 73, "w": 36, "h": 3},
		{"kind": "wall", "team": -1, "x": 6, "y": 26, "w": 3, "h": 50},
		{"kind": "wall", "team": -1, "x": 39, "y": 26, "w": 3, "h": 18},
		{"kind": "wall", "team": -1, "x": 39, "y": 58, "w": 3, "h": 18},
		{"kind": "door", "team": 0, "x": 39, "y": 44, "w": 3, "h": 7, "hp": 70, "max": 70},
		{"kind": "door", "team": 0, "x": 39, "y": 51, "w": 3, "h": 7, "hp": 70, "max": 70},
		{"kind": "wall", "team": -1, "x": 134, "y": 26, "w": 36, "h": 3},
		{"kind": "wall", "team": -1, "x": 134, "y": 73, "w": 36, "h": 3},
		{"kind": "wall", "team": -1, "x": 167, "y": 26, "w": 3, "h": 50},
		{"kind": "wall", "team": -1, "x": 134, "y": 26, "w": 3, "h": 18},
		{"kind": "wall", "team": -1, "x": 134, "y": 58, "w": 3, "h": 18},
		{"kind": "door", "team": 1, "x": 134, "y": 44, "w": 3, "h": 7, "hp": 70, "max": 70},
		{"kind": "door", "team": 1, "x": 134, "y": 51, "w": 3, "h": 7, "hp": 70, "max": 70}
	]
	var walls: Array = []
	for spec in specs:
		var rect := Rect2(float(spec["x"]) * 0.5, float(spec["y"]) * 0.5, float(spec["w"]) * 0.5, float(spec["h"]) * 0.5)
		var layer := Balance.LAYER_WALL
		var color := Color(0.96, 0.91, 0.78)
		if spec["kind"] == "door":
			layer = Balance.LAYER_DOOR_CRIMSON if int(spec["team"]) == 0 else Balance.LAYER_DOOR_AZURE
			color = Color(0.78, 0.22, 0.28) if int(spec["team"]) == 0 else Color(0.22, 0.42, 0.82)
		var body := StaticBody2D.new()
		body.collision_layer = layer
		body.collision_mask = 0
		var shape := RectangleShape2D.new()
		shape.size = rect.size
		var col := CollisionShape2D.new()
		col.shape = shape
		col.position = rect.position + rect.size * 0.5
		body.add_child(col)
		parent.add_child(body)
		var visual := Polygon2D.new()
		visual.polygon = rect_poly(rect)
		visual.color = color
		parent.add_child(visual)
		if spec["kind"] == "door":
			var inset := Rect2(rect.position.x + rect.size.x * 0.22, rect.position.y + 0.04, rect.size.x * 0.56, rect.size.y * 0.22)
			_poly(parent, rect_poly(inset), Color(1, 1, 1, 0.28))
		else:
			var foot := Rect2(rect.position.x, rect.position.y + rect.size.y * 0.62, rect.size.x, rect.size.y * 0.38)
			_poly(parent, rect_poly(foot), Color(0.62, 0.5, 0.34, 0.9))
			_merlons(parent, rect)
		walls.append({
			"kind": spec["kind"],
			"team": int(spec["team"]),
			"rect": rect,
			"hp": float(spec.get("hp", 1)),
			"max": float(spec.get("max", 1)),
			"shape": col,
			"visual": visual,
			"body": body
		})
	return walls


static func _trees(parent: Node2D) -> Array:
	var trees: Array = []
	var spots: Array = [
		[28, 12], [46, 11], [62, 13], [108, 12], [126, 11], [148, 13], [164, 16],
		[70, 16.2], [70, 27.6], [106, 16.2], [106, 27.6],
		[38, 36], [138, 36], [38, 70], [138, 70],
		[72, 80.2], [72, 91.4], [104, 80.2],
		[30, 96], [102, 96], [150, 96], [172, 40], [172, 70]
	]
	for spot in spots:
		var pos := Vector2(float(spot[0]), float(spot[1])) * 0.5
		var radius := 1.55 * 0.5
		var body := StaticBody2D.new()
		body.position = pos
		body.collision_layer = Balance.LAYER_WALL
		body.collision_mask = 0
		var shape := CircleShape2D.new()
		shape.radius = radius
		var col := CollisionShape2D.new()
		col.shape = shape
		body.add_child(col)
		parent.add_child(body)
		_poly(parent, circle_poly(pos, radius, 12), Color(0.16, 0.62, 0.26, 1))
		_poly(parent, circle_poly(pos + Vector2(-0.12, -0.08), radius * 0.42, 8), Color(0.58, 0.88, 0.38, 1))
		_poly(parent, circle_poly(pos + Vector2(0.02, 0.06), radius * 0.22, 8), Color(0.45, 0.28, 0.16, 1))
		trees.append({"pos": pos, "r": radius})
	return trees


static func _rocks(parent: Node2D) -> Array:
	var rocks: Array = []
	for spot in [Vector2(84.2, 8.2), Vector2(91.8, 8.2)]:
		var pos: Vector2 = spot * 0.5
		var radius := 3.45 * 0.5
		var body := StaticBody2D.new()
		body.position = pos
		body.collision_layer = Balance.LAYER_ROCK
		body.collision_mask = 0
		var shape := CircleShape2D.new()
		shape.radius = radius
		var col := CollisionShape2D.new()
		col.shape = shape
		body.add_child(col)
		parent.add_child(body)
		var visual := Polygon2D.new()
		visual.polygon = circle_poly(pos, radius, 16)
		visual.color = Color(0.45, 0.47, 0.52, 1)
		parent.add_child(visual)
		rocks.append({"pos": pos, "r": radius, "hp": 48.0, "max": 48.0, "shape": col, "visual": visual})
	return rocks


static func _keeps(parent: Node2D) -> Array:
	var spec: Array = [
		{"id": "nw", "x": 80.6, "y": 23.4, "door": 0.0},
		{"id": "ne", "x": 95.4, "y": 23.4, "door": PI},
		{"id": "sw", "x": 80.6, "y": 77.8, "door": 0.0},
		{"id": "se", "x": 95.4, "y": 77.8, "door": PI}
	]
	var keeps: Array = []
	for k in spec:
		var pos := Vector2(float(k["x"]), float(k["y"])) * 0.5
		var radius := 2.0 * 0.5
		_poly(parent, circle_poly(pos + Vector2(0.06, 0.08), radius * 0.92, 12), Color(0.22, 0.32, 0.16, 0.35))
		var visual := Polygon2D.new()
		visual.polygon = _keep_poly(pos, radius)
		visual.color = Color(0.95, 0.9, 0.78, 1)
		parent.add_child(visual)
		_keep_trim(parent, pos, radius, float(k["door"]))
		keeps.append({
			"id": k["id"], "pos": pos, "r": radius, "door": float(k["door"]),
			"hp": 200.0, "max": 200.0, "owner": -1, "cap": 0.0, "cap_team": -1, "down": 0.0,
			"visual": visual
		})
	return keeps


static func _south_towers(parent: Node2D) -> Array:
	var spec: Array = [
		{"name": "West Tower", "x": 58, "y": 92, "r": 2.4, "cap_r": 6.0, "dest": Vector2(30, 66), "side": 0},
		{"name": "East Tower", "x": 118, "y": 92, "r": 2.4, "cap_r": 6.0, "dest": Vector2(146, 66), "side": 1}
	]
	var towers: Array = []
	for t in spec:
		var pos := Vector2(float(t["x"]), float(t["y"])) * 0.5
		var radius := float(t["r"]) * 0.5
		var cap_r := float(t["cap_r"]) * 0.5
		_ring(parent, pos, cap_r, Color(1, 1, 1, 0.35))
		_poly(parent, circle_poly(pos + Vector2(0.05, 0.08), radius * 0.9, 12), Color(0.22, 0.32, 0.16, 0.28))
		var visual := Polygon2D.new()
		visual.polygon = _keep_poly(pos, radius)
		visual.color = Color(0.95, 0.9, 0.78, 1)
		parent.add_child(visual)
		_keep_trim(parent, pos, radius, -PI * 0.5)
		_label(parent, pos + Vector2(0, -radius - 0.4), str(t["name"]), Color(0.1, 0.08, 0.16))
		towers.append({
			"name": t["name"], "pos": pos, "r": radius, "cap_r": cap_r,
			"progress": 0.0, "owner": -1,
			"dest": (t["dest"] as Vector2) * 0.5, "side": int(t["side"]), "visual": visual
		})
	return towers


static func _outpost(parent: Node2D) -> Dictionary:
	var pos := Vector2(88, 15) * 0.5
	var radius := 2.1 * 0.5
	var cap_r := 6.4 * 0.5
	_ring(parent, pos, cap_r, Color(1, 0.85, 0.4, 0.45))
	_poly(parent, circle_poly(pos + Vector2(0.05, 0.08), radius * 0.9, 12), Color(0.35, 0.24, 0.08, 0.28))
	var visual := Polygon2D.new()
	visual.polygon = _keep_poly(pos, radius)
	visual.color = Color(0.96, 0.84, 0.42, 1)
	parent.add_child(visual)
	_keep_trim(parent, pos, radius, PI * 0.5)
	_label(parent, pos + Vector2(0, -radius - 0.45), "MIDDLE OUTPOST", Color(0.1, 0.08, 0.16))
	return {"name": "Middle Outpost", "pos": pos, "r": radius, "cap_r": cap_r, "progress": 0.0, "owner": -1, "visual": visual}


static func _sewers(parent: Node2D) -> Array:
	var spec: Array = [
		{"team": 0, "x": 28, "y": 40, "r": 1.3, "exit": Vector2(66, 48)},
		{"team": 1, "x": 148, "y": 40, "r": 1.3, "exit": Vector2(110, 48)}
	]
	var sewers: Array = []
	for s in spec:
		var pos := Vector2(float(s["x"]), float(s["y"])) * 0.5
		var visual := Polygon2D.new()
		visual.polygon = circle_poly(pos, float(s["r"]) * 0.5, 12)
		visual.color = Color(0.42, 0.29, 0.16, 1)
		parent.add_child(visual)
		sewers.append({
			"team": int(s["team"]), "pos": pos, "r": float(s["r"]) * 0.5,
			"hp": 32.0, "max": 32.0, "exit": (s["exit"] as Vector2) * 0.5, "visual": visual
		})
	return sewers


static func _catapults(parent: Node2D) -> Array:
	var spec: Array = [
		{"team": 0, "x": 30, "y": 56, "dest": Vector2(148, 52)},
		{"team": 1, "x": 146, "y": 56, "dest": Vector2(28, 52)}
	]
	var out: Array = []
	for c in spec:
		var pos := Vector2(float(c["x"]), float(c["y"])) * 0.5
		_poly(parent, rect_poly(Rect2(pos.x - 0.4, pos.y - 0.18, 0.8, 0.36)), Color(0.54, 0.35, 0.2, 1))
		out.append({"team": int(c["team"]), "pos": pos, "dest": (c["dest"] as Vector2) * 0.5})
	return out


static func _ladders(parent: Node2D) -> Array:
	var spec: Array = [
		{"x": 22, "y": 80, "to": Vector2(22, 68)},
		{"x": 154, "y": 80, "to": Vector2(154, 68)}
	]
	var out: Array = []
	for L in spec:
		var pos := Vector2(float(L["x"]), float(L["y"])) * 0.5
		var to := (L["to"] as Vector2) * 0.5
		var line := Line2D.new()
		line.points = PackedVector2Array([pos, to])
		line.width = 0.12
		line.default_color = Color(0.84, 0.69, 0.45, 1)
		parent.add_child(line)
		out.append({"pos": pos, "to": to})
	return out


static func _springs(parent: Node2D) -> Array:
	var spec: Array = [
		{"x": 16, "y": 22, "to": Vector2(20, 36)},
		{"x": 160, "y": 22, "to": Vector2(156, 36)}
	]
	var out: Array = []
	for s in spec:
		var pos := Vector2(float(s["x"]), float(s["y"])) * 0.5
		_poly(parent, circle_poly(pos, 0.35, 10), Color(0.45, 0.85, 0.55, 1))
		out.append({"pos": pos, "to": (s["to"] as Vector2) * 0.5})
	return out


static func _cake_node(parent: Node2D, pos: Vector2) -> Node2D:
	var n := Node2D.new()
	n.position = pos
	var base := Polygon2D.new()
	base.polygon = PackedVector2Array([Vector2(-0.28, -0.12), Vector2(0.28, -0.12), Vector2(0.28, 0.16), Vector2(-0.28, 0.16)])
	base.color = Color(1, 1, 1, 1)
	var top := Polygon2D.new()
	top.polygon = PackedVector2Array([Vector2(-0.28, -0.28), Vector2(0.28, -0.28), Vector2(0.28, -0.12), Vector2(-0.28, -0.12)])
	top.color = Color(1.0, 0.48, 0.69, 1)
	n.add_child(base)
	n.add_child(top)
	parent.add_child(n)
	return n


static func pond_outline(cx: float) -> PackedVector2Array:
	var top := 20.6
	var top_neck := 26.6
	var bot_neck := 73.6
	var bot := 82.2
	var neck := 2.55
	var wide := 18.8
	var ys: Array = []
	var y := top
	while y < bot - 0.01:
		ys.append(y)
		y += 1.05
	ys.append(bot)
	var left: Array = []
	var right: Array = []
	for sample_y in ys:
		var row: Dictionary = _pond_row(float(sample_y), top_neck, bot_neck, neck, wide)
		left.append(Vector2(cx - float(row["half"]) + float(row["bias"]), float(sample_y)))
	for i in range(ys.size() - 1, -1, -1):
		var sample_y2: float = ys[i]
		var row2: Dictionary = _pond_row(sample_y2, top_neck, bot_neck, neck, wide)
		right.append(Vector2(cx + float(row2["half"]) + float(row2["bias"]), sample_y2))
	var pts := PackedVector2Array()
	for p in left:
		pts.append(p)
	for p2 in right:
		pts.append(p2)
	return pts


static func _pond_row(sample_y: float, top_neck: float, bot_neck: float, neck: float, wide: float) -> Dictionary:
	var s := 0.0
	if sample_y > top_neck and sample_y < bot_neck:
		var t := (sample_y - top_neck) / (bot_neck - top_neck)
		var arch := sin(clampf(t, 0.0, 1.0) * PI)
		s = pow(arch, 0.42)
	var half := neck + (wide - neck) * s
	var bias := sin((sample_y - 38.0) * 0.22) * 1.15 * s
	return {"half": half, "bias": bias}


static func ribbon(points: Array, half: float) -> PackedVector2Array:
	var left: Array = []
	var right: Array = []
	for i in points.size():
		var prev: Vector2 = points[max(0, i - 1)]
		var next: Vector2 = points[min(points.size() - 1, i + 1)]
		var delta: Vector2 = next - prev
		var length := delta.length()
		if length < 0.0001:
			delta = Vector2.RIGHT
		else:
			delta /= length
		var p: Vector2 = points[i]
		left.append(Vector2(p.x - delta.y * half, p.y + delta.x * half))
		right.append(Vector2(p.x + delta.y * half, p.y - delta.x * half))
	right.reverse()
	var pts := PackedVector2Array()
	for p in left:
		pts.append(p)
	for p2 in right:
		pts.append(p2)
	return pts


static func scale_poly(pts: PackedVector2Array, s: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in pts:
		out.append(p * s)
	return out


static func inset_poly(pts: PackedVector2Array, k: float) -> PackedVector2Array:
	var center := Vector2.ZERO
	for p in pts:
		center += p
	center /= max(1, pts.size())
	var out := PackedVector2Array()
	for p2 in pts:
		out.append(center + (p2 - center) * k)
	return out


static func _tufts(parent: Node2D) -> void:
	for i in 90:
		var x := 2.0 + float(_mix(i * 17 + 3) % 8400) / 100.0
		var y := 5.2 + float(_mix(i * 29 + 11) % 3800) / 100.0
		if y > 44.0:
			continue
		var radius := 0.12 + float(_mix(i * 13) % 16) / 100.0
		var col := Color(0.4, 0.68, 0.16, 0.9) if (i % 3) != 0 else Color(0.78, 0.93, 0.42, 0.85)
		_poly(parent, circle_poly(Vector2(x, y), radius, 5), col)


static func _mix(n: int) -> int:
	return (n * 1103515245 + 12345) & 2147483647


static func _merlons(parent: Node, rect: Rect2) -> void:
	var horizontal := rect.size.x >= rect.size.y
	if not horizontal and rect.position.x > 4.0 and rect.position.x < 80.0:
		return
	var span := rect.size.x if horizontal else rect.size.y
	var count := clampi(int(span / 0.55), 1, 8)
	for i in count:
		var t := (float(i) + 0.5) / float(count)
		if horizontal:
			var x := rect.position.x + rect.size.x * t - 0.11
			_poly(parent, rect_poly(Rect2(x, rect.position.y - 0.16, 0.22, 0.16)), Color(0.99, 0.96, 0.88))
		else:
			var y := rect.position.y + rect.size.y * t - 0.11
			var x2 := rect.position.x - 0.16 if rect.position.x < 40.0 else rect.position.x + rect.size.x
			_poly(parent, rect_poly(Rect2(x2, y, 0.16, 0.22)), Color(0.99, 0.96, 0.88))


static func _keep_poly(pos: Vector2, radius: float) -> PackedVector2Array:
	var s := radius * 0.92
	var c := radius * 0.34
	return PackedVector2Array([
		pos + Vector2(-s + c, -s),
		pos + Vector2(s - c, -s),
		pos + Vector2(s, -s + c),
		pos + Vector2(s, s - c),
		pos + Vector2(s - c, s),
		pos + Vector2(-s + c, s),
		pos + Vector2(-s, s - c),
		pos + Vector2(-s, -s + c),
	])


static func _keep_trim(parent: Node, pos: Vector2, radius: float, door_ang: float) -> void:
	for i in 4:
		var x := pos.x - radius * 0.78 + float(i) * radius * 0.48
		_poly(parent, rect_poly(Rect2(x, pos.y - radius - 0.14, radius * 0.28, 0.18)), Color(0.99, 0.96, 0.88))
	var door_at := pos + Vector2(cos(door_ang), sin(door_ang)) * (radius * 0.62)
	_poly(parent, circle_poly(door_at, 0.14, 8), Color(0.42, 0.26, 0.16))
	var flag := pos + Vector2(0.0, -radius - 0.28)
	_poly(parent, PackedVector2Array([
		flag,
		flag + Vector2(0.28, 0.08),
		flag + Vector2(0.0, 0.16)
	]), Color(0.86, 0.22, 0.28) if pos.x < Balance.MAP_W * 0.5 else Color(0.22, 0.48, 0.9))


static func circle_poly(center: Vector2, radius: float, n: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in n:
		var a := TAU * float(i) / float(n)
		pts.append(center + Vector2(cos(a), sin(a)) * radius)
	return pts


static func rect_poly(rect: Rect2) -> PackedVector2Array:
	return PackedVector2Array([
		rect.position,
		rect.position + Vector2(rect.size.x, 0),
		rect.position + rect.size,
		rect.position + Vector2(0, rect.size.y)
	])


static func _poly(parent: Node, pts: PackedVector2Array, color: Color) -> Polygon2D:
	var visual := Polygon2D.new()
	visual.polygon = pts
	visual.color = color
	parent.add_child(visual)
	return visual


static func _area_poly(parent: Node, pts: PackedVector2Array, layer: int, kind: String, color: Color) -> void:
	var area := Area2D.new()
	area.collision_layer = layer
	area.collision_mask = 0
	area.monitoring = false
	area.monitorable = true
	area.set_meta("kind", kind)
	var col := CollisionPolygon2D.new()
	col.polygon = pts
	area.add_child(col)
	parent.add_child(area)
	if kind == "water" or kind == "dry":
		_poly(parent, pts, color)


static func _ring(parent: Node, pos: Vector2, radius: float, color: Color) -> void:
	var line := Line2D.new()
	line.width = 0.08
	line.default_color = color
	line.closed = true
	var pts := PackedVector2Array()
	for i in 28:
		var a := TAU * float(i) / 28.0
		pts.append(pos + Vector2(cos(a), sin(a)) * radius)
	line.points = pts
	parent.add_child(line)


static func _label(parent: Node, pos: Vector2, text: String, color: Color) -> void:
	var n := Node2D.new()
	n.position = pos
	n.set_script(LabelScript)
	n.set("caption", text)
	n.set("tint", color)
	parent.add_child(n)
