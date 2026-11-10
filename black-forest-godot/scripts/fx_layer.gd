extends Node2D

var sim: Node = null
var _font: Font


func _ready() -> void:
	sim = get_parent()
	_font = ThemeDB.fallback_font
	z_index = 20


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if sim == null or sim.get("phase") == "boot":
		return
	for f in sim.fires:
		var a := clampf(float(f.t) / 5.0, 0.0, 1.0)
		draw_circle(f.pos, float(f.r) * 1.15, Color(0.55, 0.08, 0.02, 0.28 * a))
		draw_circle(f.pos, float(f.r), Color(1.0, 0.38, 0.05, 0.5 * a))
		draw_circle(f.pos, float(f.r) * 0.45, Color(1.0, 0.86, 0.35, 0.75 * a))
		draw_circle(f.pos, float(f.r) * 0.16, Color(1.0, 0.98, 0.85, 0.9 * a))
	for s in sim.shots:
		if s.kind == "fireball":
			var tail := Vector2(s.vx, s.vy)
			if tail.length_squared() > 0.01:
				tail = tail.normalized()
			draw_circle(s.pos - tail * 0.28, 0.22, Color(1.0, 0.35, 0.05, 0.35))
			draw_circle(s.pos, 0.26, Color(1.0, 0.45, 0.08, 0.55))
			draw_circle(s.pos, 0.14, Color(1.0, 0.95, 0.7, 0.95))
		elif s.kind == "gem":
			var gem: Vector2 = s.pos
			draw_colored_polygon(PackedVector2Array([
				gem + Vector2(0.0, -0.24),
				gem + Vector2(0.16, 0.0),
				gem + Vector2(0.0, 0.24),
				gem + Vector2(-0.16, 0.0)
			]), Color(0.72, 0.96, 1.0, 0.95))
	for u in sim.units:
		if u.channel == null:
			continue
		if u.channel.kind == "mega":
			var pulse := 0.92 + 0.08 * sin(float(sim.time) * 10.0)
			draw_circle(u.channel.pos, float(u.channel.r) * pulse, Color(1.0, 0.22, 0.18, 0.2))
			draw_circle(u.channel.pos, float(u.channel.r) * 0.45, Color(1.0, 0.55, 0.2, 0.18))
			draw_arc(u.channel.pos, float(u.channel.r), 0.0, TAU, 48, Color(1.0, 0.25, 0.15, 0.95), 0.12, true)
			draw_arc(u.channel.pos, float(u.channel.r) * 0.72, 0.0, TAU, 32, Color(1.0, 0.85, 0.45, 0.7), 0.05, true)
		elif u.channel.kind == "saber":
			var poly := _saber_poly(u.channel)
			draw_colored_polygon(poly, Color(1.0, 0.92, 0.4, 0.28))
			var loop := PackedVector2Array([poly[0], poly[1], poly[2], poly[3], poly[0]])
			draw_polyline(loop, Color(1.0, 0.86, 0.15, 0.95), 0.1, true)
			var mid_a := (poly[0] + poly[3]) * 0.5
			var mid_b := (poly[1] + poly[2]) * 0.5
			draw_line(mid_a, mid_b, Color(1.0, 1.0, 0.85, 0.9), 0.08, true)
	for fx in sim.mega_fx:
		var k := 1.0 - float(fx.t) / float(fx.dur)
		draw_circle(fx.pos, float(fx.r) * (0.15 + 0.9 * k), Color(1.0, 0.4, 0.15, 0.34 * (1.0 - k)))
		draw_arc(fx.pos, float(fx.r) * (0.2 + 0.85 * k), 0.0, TAU, 36, Color(1.0, 0.9, 0.55, 0.8 * (1.0 - k)), 0.08, true)
	for fx in sim.saber_fx:
		var poly2 := _saber_poly(fx)
		var a2 := clampf(float(fx.t) / float(fx.dur), 0.0, 1.0)
		draw_colored_polygon(poly2, Color(1.0, 0.95, 0.7, 0.4 * a2))
		var core_a := (poly2[0] + poly2[3]) * 0.5
		var core_b := (poly2[1] + poly2[2]) * 0.5
		draw_line(core_a, core_b, Color(1.0, 1.0, 0.9, 0.85 * a2), 0.07, true)
	for k in sim.keeps:
		if float(k["cap"]) <= 0.0:
			continue
		var door: float = k["door"]
		var at: Vector2 = k["pos"] + Vector2(cos(door), sin(door)) * (float(k["r"]) + 0.15)
		var col := Color(0.95, 0.3, 0.45) if int(k["cap_team"]) == 0 else Color(0.35, 0.75, 1.0)
		draw_arc(at, 0.55, -PI * 0.5, -PI * 0.5 + TAU * float(k["cap"]) / 3.0, 18, col, 0.08, true)
	for i in sim.diamonds.size():
		var d = sim.diamonds[i]
		if float(d.bank) <= 0.05 or d.carrier == null:
			continue
		var vault = sim.vaults[d.carrier.team]
		var col2 := Color(1.0, 0.85, 0.35, 0.9)
		draw_arc(vault["pos"], float(vault["r"]), -PI * 0.5, -PI * 0.5 + TAU * float(d.bank) / 10.0, 28, col2, 0.07, true)
	for p in sim.bursts:
		var c: Color = p.color
		c.a = clampf(float(p.t) / 0.35, 0.0, 1.0)
		draw_circle(p.pos, float(p.r), c)
	if _font == null:
		return
	for f2 in sim.floats:
		var col3: Color = f2.color
		col3.a = clampf(float(f2.t) / 0.28, 0.0, 1.0)
		draw_set_transform(f2.pos, 0.0, Vector2(0.022, 0.022))
		draw_string(_font, Vector2(-8, 0), str(f2.text), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, col3)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _saber_poly(ch) -> PackedVector2Array:
	var ang := float(ch.ang)
	var fwd := Vector2(cos(ang), sin(ang))
	var side := Vector2(-fwd.y, fwd.x)
	var half := float(ch.w) * 0.5
	var origin: Vector2 = ch.pos
	var length := float(ch.len)
	var a := origin + side * half
	var b := origin - side * half
	var c := b + fwd * length
	var d := a + fwd * length
	return PackedVector2Array([a, d, c, b])
