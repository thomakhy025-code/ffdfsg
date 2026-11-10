extends Node
## Dedicated server for the 5v5 match, using Godot's high-level multiplayer API.
##
## Desktop server (UDP 7777):
##   godot --headless --path <project> -- --server
## Browser server (WebSocket, then expose it with a TLS tunnel):
##   godot --headless --path <project> -- --server --websocket
## Desktop client:
##   godot --path <project> -- --client --address 127.0.0.1 --port 7777
## The website build always uses WebSocket and the host in web_endpoint.gd.
## Versus Robots never opens a peer.
##
## The listen process runs the match. Each client sends its own input every tick and
## does not wait for the other team. The server simulates hits, diamonds, and the win.
## A client predicts its own walk. Everyone else is drawn from a world-state buffer
## 100 ms in the past, using a clock synced to the server.

const Balance = preload("res://scripts/balance.gd")
const MatchScene = preload("res://scenes/match.tscn")
const WebEndpoint = preload("res://scripts/web_endpoint.gd")

const DEFAULT_PORT := 7777
const MAX_CLIENTS := 2
const TICK_HZ := 30
const TICK_DT := 1.0 / 30.0
const INTERP_OFFSET_MS := 100
const INPUT_GAP_MSEC := 200
const LATENCY_SAMPLES := 9

const BIT_ATTACK := 1
const BIT_THROW := 2
const BIT_HOP := 4
const BIT_INTERACT := 8
const BIT_WEAPON := 16
const BIT_GUARD := 32

signal status_changed

var role := "offline"
var peer: MultiplayerPeer
var use_websocket := false
var status := "Versus Robots stays on this machine. Online play joins a dedicated server on UDP 7777."
var address := "127.0.0.1"
var port := DEFAULT_PORT
var smoke := false
var smoke_name := "You"

var seats: Array = []
var queues := {}
var last_wish := {}
var last_applied := {}
var last_input_msec := {}
var action_seq := {}
var input_peers := {}
var match_node: Node = null
var pending_profile: Dictionary = {}
var _join_timer := 0.0
var held_snapshot := PackedByteArray()
var has_held := false

var local_seq := 0
var history: Array = []
var world_states: Array = []
var pending_buttons := 0
var snapshot_count := 0
var clock_synced := false
var client_clock := 0
var decimal_collector := 0.0
var latency := 0
var delta_latency := 0
var latency_samples: Array = []
var latency_wait := 0.0

var _acc := 0.0
var _boot_msec := 0
var _closing := false
var _finished := false
var _smoke_ready_msec := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_boot_msec = Time.get_ticks_msec()
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)
	if OS.has_feature("web"):
		use_websocket = true
		address = str(WebEndpoint.HOST).strip_edges()
		port = int(WebEndpoint.PORT)
		if address == "" or address.begins_with("pending."):
			_status("Play online needs the public WebSocket server. Versus Robots stays on this machine.")
		else:
			_status("Play online uses WebSocket at %s:%d. Versus Robots stays on this machine." % [address, port])
	_parse_args()


func _physics_process(delta: float) -> void:
	if role == "client":
		_advance_clock(delta)
		_poll_latency(delta)
		if match_node == null and not _closing:
			_join_timer += delta
			if _join_timer >= 0.6:
				_join_timer = 0.0
				_send_join()
	if role == "offline":
		_smoke_watch()
		return
	_acc += delta
	if _acc > TICK_DT * 3.0:
		_acc = TICK_DT * 3.0
	var steps := 0
	while _acc >= TICK_DT and steps < 3:
		_acc -= TICK_DT
		steps += 1
		if role == "server":
			_server_tick()
		elif role == "client":
			_client_tick()
	_smoke_watch()


func _parse_args() -> void:
	var args := OS.get_cmdline_user_args()
	var i := 0
	while i < args.size():
		var arg := str(args[i])
		if arg == "--server":
			role = "server"
		elif arg == "--client":
			role = "client"
		elif arg == "--smoke":
			smoke = true
		elif arg == "--address" and i + 1 < args.size():
			i += 1
			address = str(args[i])
		elif arg == "--port" and i + 1 < args.size():
			i += 1
			port = int(args[i])
		elif arg == "--name" and i + 1 < args.size():
			i += 1
			smoke_name = str(args[i])
		elif arg == "--websocket":
			use_websocket = true
		i += 1
	if role == "server":
		start_server(port)
	elif role == "client":
		var profile: Dictionary = _smoke_profile() if smoke else _disk_profile()
		start_client(address, port, profile)


func start_server(prt: int) -> void:
	_shutdown_peer()
	role = "server"
	port = prt
	var err := _open_server(prt)
	if err != OK:
		peer = null
		role = "offline"
		var kind := "WebSocket" if use_websocket else "UDP"
		_status("Could not listen for %s on port %d (%s)." % [kind, prt, error_string(err)])
		if smoke:
			_fail("create_server %s" % error_string(err))
		return
	multiplayer.multiplayer_peer = peer
	if use_websocket:
		_status("Dedicated server listening for WebSocket on port %d. Waiting for 2 players." % prt)
		print("NET listening websocket ", prt)
	else:
		_status("Dedicated server listening on UDP %d. Waiting for 2 players." % prt)
		print("NET listening udp ", prt)


func start_client(addr: String, prt: int, profile: Dictionary) -> void:
	_shutdown_peer()
	role = "client"
	address = addr.strip_edges()
	port = prt
	pending_profile = profile
	local_seq = 0
	history.clear()
	world_states.clear()
	_reset_clock()
	var websocket := _client_uses_websocket(address)
	var err := FAILED
	var target := "%s:%d" % [address, prt]
	if websocket:
		use_websocket = true
		target = _websocket_url(address, prt)
		err = _open_websocket_client(target)
	else:
		err = _open_enet_client(address, prt)
	if err != OK:
		peer = null
		role = "offline"
		_status("Could not reach the server at %s (%s)." % [target, error_string(err)])
		if smoke:
			_fail("create_client %s" % error_string(err))
		return
	multiplayer.multiplayer_peer = peer
	_status("Connecting to %s." % target)
	print("NET connecting ", target)


func _open_server(prt: int) -> Error:
	if use_websocket:
		var ws := WebSocketMultiplayerPeer.new()
		var err := ws.create_server(prt, "*")
		if err != OK:
			return err
		peer = ws
		return OK
	if not ClassDB.class_exists("ENetMultiplayerPeer"):
		return ERR_UNAVAILABLE
	var enet: MultiplayerPeer = ClassDB.instantiate("ENetMultiplayerPeer") as MultiplayerPeer
	if enet == null:
		return ERR_UNAVAILABLE
	var err_code := int(enet.call("create_server", prt, MAX_CLIENTS))
	if err_code != OK:
		return err_code as Error
	var host: Object = enet.get("host")
	if host != null:
		host.call("compress", ClassDB.class_get_integer_constant("ENetConnection", "COMPRESS_RANGE_CODER"))
	peer = enet
	return OK


func _open_enet_client(addr: String, prt: int) -> Error:
	if not ClassDB.class_exists("ENetMultiplayerPeer"):
		return ERR_UNAVAILABLE
	var enet: MultiplayerPeer = ClassDB.instantiate("ENetMultiplayerPeer") as MultiplayerPeer
	if enet == null:
		return ERR_UNAVAILABLE
	var err_code := int(enet.call("create_client", addr, prt))
	if err_code != OK:
		return err_code as Error
	var host: Object = enet.get("host")
	if host != null:
		host.call("compress", ClassDB.class_get_integer_constant("ENetConnection", "COMPRESS_RANGE_CODER"))
	peer = enet
	return OK


func _open_websocket_client(url: String) -> Error:
	var ws := WebSocketMultiplayerPeer.new()
	var err := ERR_CANT_CONNECT
	if url.begins_with("wss://") and not OS.has_feature("web"):
		err = ws.create_client(url, TLSOptions.client())
	else:
		err = ws.create_client(url)
	if err != OK:
		return err
	peer = ws
	return OK


func _client_uses_websocket(addr: String) -> bool:
	if OS.has_feature("web") or use_websocket:
		return true
	return addr.begins_with("ws://") or addr.begins_with("wss://")


func _websocket_url(addr: String, prt: int) -> String:
	var a := addr.strip_edges()
	if a.begins_with("ws://") or a.begins_with("wss://"):
		return a
	var secure := OS.has_feature("web") or prt == 443
	var scheme := "wss" if secure else "ws"
	if secure and (prt == 443 or prt == 0):
		return "%s://%s" % [scheme, a]
	if not secure and (prt == 80 or prt == 0):
		return "%s://%s" % [scheme, a]
	return "%s://%s:%d" % [scheme, a, prt]


func leave(back_to_armory: bool = true) -> void:
	if _closing:
		return
	var show := back_to_armory and role == "client"
	_closing = true
	_clear_match()
	_shutdown_peer()
	_reset_runtime()
	role = "offline"
	_closing = false
	_status("Disconnected.")
	if show:
		var main := get_tree().root.get_node_or_null("Main")
		if main and main.has_method("show_armory"):
			main.match_node = null
			main.show_armory()


func note_attack() -> void:
	pending_buttons |= BIT_ATTACK


func note_throw() -> void:
	pending_buttons |= BIT_THROW


func note_hop() -> void:
	pending_buttons |= BIT_HOP


func note_interact() -> void:
	pending_buttons |= BIT_INTERACT


func note_weapon() -> void:
	pending_buttons |= BIT_WEAPON


func note_guard() -> void:
	pending_buttons |= BIT_GUARD


func note_skill(index: int) -> void:
	pending_buttons = (pending_buttons & ~448) | ((index & 7) << 6)


func clear_history() -> void:
	history.clear()


func reconcile(player, server_pos: Vector2, ack_seq: int) -> void:
	if player == null or ack_seq <= 0:
		return
	var idx := -1
	for i in history.size():
		var row: Dictionary = history[i]
		if int(row["seq"]) == ack_seq:
			idx = i
			break
	if idx < 0:
		if player.global_position.distance_to(server_pos) > 0.35:
			player.global_position = server_pos
			player.force_update_transform()
		return
	var predicted: Vector2 = history[idx]["pos"]
	if predicted.distance_to(server_pos) > 0.2:
		player.global_position = server_pos
		player.force_update_transform()
		for j in range(idx + 1, history.size()):
			var step: Dictionary = history[j]
			player.wish = step["wish"]
			player.facing = float(step["facing"])
			player.predict_move(TICK_DT)
			if match_node:
				match_node.eject_keep(player)
			step["pos"] = player.global_position
	while history.size() > 0 and int(history[0]["seq"]) <= ack_seq:
		history.pop_front()


func push_world_state(server_ms: int, units: Dictionary) -> void:
	if server_ms <= 0 or units.is_empty():
		return
	if world_states.size() > 0:
		var last: Dictionary = world_states[world_states.size() - 1]
		if int(last["t"]) >= server_ms:
			return
	world_states.append({"t": server_ms, "units": units})
	while world_states.size() > 40:
		world_states.pop_front()


func publish_result(result: Dictionary) -> void:
	if role != "server" or not _can_rpc():
		return
	rpc_result.rpc(str(result.get("type", "draw")), int(result.get("team", -1)))


@rpc("any_peer", "reliable")
func rpc_join(profile: Dictionary) -> void:
	if role != "server":
		return
	if not smoke:
		_reclaim_abandoned_match()
	if match_node != null:
		return
	var id := multiplayer.get_remote_sender_id()
	var already := false
	for seat in seats:
		if int(seat["peer_id"]) == id:
			already = true
			break
	if not already:
		if seats.size() >= MAX_CLIENTS:
			return
		var clean := _clean_profile(profile)
		seats.append({"peer_id": id, "profile": clean})
		_status("Players %d/2." % seats.size())
		print("NET join ", id, " ", str(clean["name"]))
	if seats.size() == MAX_CLIENTS and match_node == null:
		_begin_server_match()
	if _can_rpc() and multiplayer.get_peers().has(id):
		rpc_lobby.rpc_id(id, seats.size())


@rpc("authority", "reliable")
func rpc_lobby(count: int) -> void:
	if role != "client" or not _from_server() or match_node != null:
		return
	_status("Connected. Waiting for the other player. Players %d/2." % count)


@rpc("authority", "reliable")
func rpc_start(info: Dictionary) -> void:
	if not _from_server() or role != "client" or match_node != null:
		return
	var node := _host_match()
	var mine := multiplayer.get_unique_id()
	var crimson: Dictionary = info["crimson"]
	var azure: Dictionary = info["azure"]
	node.start_online_match(
		crimson,
		azure,
		int(info["crimson_peer"]),
		int(info["azure_peer"]),
		mine,
		not smoke
	)
	var team := "Crimson" if mine == int(info["crimson_peer"]) else "Azure"
	_status("Playing as %s." % team)
	print("NET client team ", team)
	if has_held:
		node.apply_net_bytes(held_snapshot)
		has_held = false


@rpc("any_peer", "unreliable_ordered")
func rpc_input(seq: int, x: float, y: float, facing: float, _buttons: int) -> void:
	if role != "server":
		return
	var id := multiplayer.get_remote_sender_id()
	var applied := int(last_applied.get(id, 0))
	if seq <= applied:
		return
	var q: Array = queues.get(id, [])
	if q.size() > 0 and int(q[q.size() - 1]["seq"]) >= seq:
		return
	q.append({"seq": seq, "x": x, "y": y, "facing": facing})
	while q.size() > 30:
		q.pop_front()
	queues[id] = q
	last_input_msec[id] = Time.get_ticks_msec()
	input_peers[id] = int(input_peers.get(id, 0)) + 1
	if int(input_peers[id]) == 1:
		print("NET input ", id)


@rpc("any_peer", "reliable")
func rpc_action(seq: int, buttons: int) -> void:
	if role != "server" or match_node == null or buttons == 0:
		return
	var id := multiplayer.get_remote_sender_id()
	if seq <= int(action_seq.get(id, -1)):
		return
	action_seq[id] = seq
	var unit = match_node.unit_by_peer(id)
	if unit:
		match_node.apply_net_buttons(unit, buttons)


@rpc("authority", "unreliable_ordered")
func rpc_snapshot(blob: PackedByteArray) -> void:
	if role != "client" or not _from_server():
		return
	snapshot_count += 1
	if snapshot_count == 1:
		print("NET snapshot ", blob.size())
	if match_node == null:
		held_snapshot = blob
		has_held = true
		return
	match_node.apply_net_bytes(blob)


@rpc("authority", "reliable")
func rpc_result(kind: String, team: int) -> void:
	if role != "client" or not _from_server() or match_node == null:
		return
	if match_node.phase == "play":
		match_node.end_match(kind, team)


@rpc("any_peer", "reliable")
func rpc_fetch_server_time(client_time: int) -> void:
	if role != "server":
		return
	rpc_return_server_time.rpc_id(multiplayer.get_remote_sender_id(), Time.get_ticks_msec(), client_time)


@rpc("authority", "reliable")
func rpc_return_server_time(server_time: int, client_time: int) -> void:
	if role != "client" or not _from_server() or clock_synced:
		return
	var now := Time.get_ticks_msec()
	var rtt := now - client_time
	if rtt < 0:
		rtt = 0
	latency = int(rtt / 2)
	client_clock = server_time + latency
	decimal_collector = 0.0
	clock_synced = true
	latency_wait = 0.0
	print("NET clock synced latency ", latency)


@rpc("any_peer", "reliable")
func rpc_determine_latency(client_time: int) -> void:
	if role != "server":
		return
	rpc_return_latency.rpc_id(multiplayer.get_remote_sender_id(), client_time)


@rpc("authority", "reliable")
func rpc_return_latency(client_time: int) -> void:
	if role != "client" or not _from_server() or not clock_synced:
		return
	var now := Time.get_ticks_msec()
	var rtt := now - client_time
	if rtt < 0:
		return
	latency_samples.append(int(rtt / 2))
	if latency_samples.size() < LATENCY_SAMPLES:
		return
	latency_samples.sort()
	var midpoint := int(latency_samples[4])
	var total := 0
	var kept := 0
	for value in latency_samples:
		var sample := int(value)
		if sample > midpoint * 2 and sample > 20:
			continue
		total += sample
		kept += 1
	latency_samples.clear()
	if kept == 0:
		return
	var new_latency := int(total / float(kept))
	delta_latency = new_latency - latency
	latency = new_latency


func _server_tick() -> void:
	if match_node == null or not is_instance_valid(match_node) or match_node.phase != "play":
		return
	var ack := _consume_inputs()
	match_node.tick(TICK_DT)
	if match_node.phase != "play" or not _can_rpc():
		return
	var blob: PackedByteArray = match_node.pack_net_bytes(ack)
	rpc_snapshot.rpc(blob)
	snapshot_count += 1
	if snapshot_count == 1:
		print("NET snapshot")


func _client_tick() -> void:
	if match_node == null or not is_instance_valid(match_node):
		return
	if match_node.phase == "play" and match_node.player != null:
		_predict_local()
		_interpolate()
	match_node.present_online(TICK_DT)


func _predict_local() -> void:
	var player = match_node.player
	if player == null:
		return
	var wish := _poll_wish(player)
	var facing: float = player.facing
	if wish.length_squared() > 0.0:
		facing = wish.angle()
	var buttons := _take_buttons()
	if smoke and local_seq + 1 == 5:
		buttons |= BIT_ATTACK
	player.wish = wish
	player.facing = facing
	local_seq += 1
	var special: bool = player.dead or player.net_pose == 3 or player.net_pose == 4 or player.net_pose == 6
	if special:
		history.clear()
	else:
		player.predict_move(TICK_DT)
		match_node.eject_keep(player)
		history.append({"seq": local_seq, "wish": wish, "facing": facing, "pos": player.global_position})
		while history.size() > 64:
			history.pop_front()
	if buttons & BIT_ATTACK and player.carrying == null and not player.root_locked() and not player.dead:
		player.swing_vis = 0.26
	elif buttons & BIT_ATTACK and player.carrying != null:
		match_node.float_at(player.global_position + Vector2(0, -0.9), "CAN'T ATTACK", Color.WHITE)
	if not _can_rpc():
		return
	rpc_input.rpc_id(1, local_seq, wish.x, wish.y, facing, 0)
	if buttons != 0:
		rpc_action.rpc_id(1, local_seq, buttons)
	if local_seq == 1:
		print("NET input sent")


func _consume_inputs() -> Dictionary:
	var ack := {}
	var now := Time.get_ticks_msec()
	for u in match_node.units:
		var id := int(u.peer_id)
		if id == 0:
			continue
		var q: Array = queues.get(id, [])
		var wish := Vector2.ZERO
		var facing: float = u.facing
		var seq := int(last_applied.get(id, 0))
		var fresh := false
		if q.size() > 0:
			var item: Dictionary = q.pop_front()
			queues[id] = q
			wish = Vector2(float(item["x"]), float(item["y"]))
			facing = float(item["facing"])
			seq = int(item["seq"])
			last_applied[id] = seq
			last_wish[id] = {"x": wish.x, "y": wish.y, "facing": facing}
			fresh = true
		elif last_wish.has(id) and now - int(last_input_msec.get(id, now)) <= INPUT_GAP_MSEC:
			var prev: Dictionary = last_wish[id]
			wish = Vector2(float(prev["x"]), float(prev["y"]))
			facing = float(prev["facing"])
		if wish.length_squared() > 1.0:
			wish = wish.normalized()
		if not fresh and q.is_empty() and now - int(last_input_msec.get(id, now)) > INPUT_GAP_MSEC:
			wish = Vector2.ZERO
		u.wish = wish
		u.facing = facing
		ack[str(id)] = seq
	return ack


func _interpolate() -> void:
	if match_node == null or world_states.is_empty():
		return
	if not clock_synced:
		_place_from_state(world_states[world_states.size() - 1])
		return
	var render := client_clock - INTERP_OFFSET_MS
	while world_states.size() > 2 and render > int(world_states[2]["t"]):
		world_states.pop_front()
	if world_states.size() > 2 and render >= int(world_states[1]["t"]):
		_blend_states(world_states[1], world_states[2], render, false)
	elif world_states.size() >= 2 and render > int(world_states[1]["t"]):
		_blend_states(world_states[0], world_states[1], render, true)
	elif world_states.size() >= 2:
		_blend_states(world_states[0], world_states[1], render, false)
	else:
		_place_from_state(world_states[0])


func _blend_states(older: Dictionary, newer: Dictionary, render_ms: int, extrap: bool) -> void:
	var t0 := int(older["t"])
	var t1 := int(newer["t"])
	var span := maxi(1, t1 - t0)
	var units0: Dictionary = older["units"]
	var units1: Dictionary = newer["units"]
	for id in units1.keys():
		if not units0.has(id):
			continue
		var u = match_node.unit_by_id(str(id))
		if u == null or u == match_node.player:
			continue
		var a: Dictionary = units0[id]
		var b: Dictionary = units1[id]
		var a_pos: Vector2 = a["pos"]
		var b_pos: Vector2 = b["pos"]
		var a_face := float(a["facing"])
		var b_face := float(b["facing"])
		if extrap:
			var ahead := mini(render_ms - t1, INTERP_OFFSET_MS)
			var factor := float(ahead) / float(span)
			var delta := b_pos - a_pos
			u.global_position = b_pos + delta * factor
			u.facing = b_face + angle_difference(a_face, b_face) * factor
		else:
			var alpha := clampf(float(render_ms - t0) / float(span), 0.0, 1.0)
			u.global_position = a_pos.lerp(b_pos, alpha)
			u.facing = lerp_angle(a_face, b_face, alpha)
		u.force_update_transform()


func _place_from_state(state: Dictionary) -> void:
	var units: Dictionary = state["units"]
	for id in units.keys():
		var u = match_node.unit_by_id(str(id))
		if u == null or u == match_node.player:
			continue
		var sample: Dictionary = units[id]
		u.global_position = sample["pos"]
		u.facing = float(sample["facing"])
		u.force_update_transform()


func _advance_clock(delta: float) -> void:
	if not clock_synced:
		return
	var ms := delta * 1000.0
	var whole := int(ms)
	client_clock += whole
	if delta_latency != 0:
		client_clock += delta_latency
		delta_latency = 0
	decimal_collector += ms - float(whole)
	if decimal_collector >= 1.0:
		client_clock += 1
		decimal_collector -= 1.0


func _poll_latency(delta: float) -> void:
	if not clock_synced or not _can_rpc():
		return
	latency_wait += delta
	if latency_wait < 0.5:
		return
	latency_wait = 0.0
	rpc_determine_latency.rpc_id(1, Time.get_ticks_msec())


func _reset_clock() -> void:
	clock_synced = false
	client_clock = 0
	decimal_collector = 0.0
	latency = 0
	delta_latency = 0
	latency_samples.clear()
	latency_wait = 0.0


func _from_server() -> bool:
	return multiplayer.get_remote_sender_id() == 1


func _poll_wish(player) -> Vector2:
	if smoke:
		if smoke_name == "Blue":
			return Vector2(-1, 0)
		return Vector2(1, 0)
	if player.dead:
		return Vector2.ZERO
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
		player.click_target = null
		return Vector2(mx, my).normalized()
	var stick := Vector2.ZERO
	if player.sim != null and player.sim.hud != null and player.sim.hud.has_method("stick_wish"):
		var raw: Vector2 = player.sim.hud.call("stick_wish")
		stick = raw
	if stick.length() > 0.18:
		player.click_target = null
		return stick.normalized()
	if player.click_target != null:
		var delta: Vector2 = player.click_target - player.global_position
		if delta.length() < 0.35:
			player.click_target = null
			return Vector2.ZERO
		return delta.normalized()
	return Vector2.ZERO


func _take_buttons() -> int:
	var b := pending_buttons
	pending_buttons = 0
	if smoke:
		return b
	if Input.is_action_just_pressed("attack"):
		b |= BIT_ATTACK
	if Input.is_action_just_pressed("throw"):
		b |= BIT_THROW
	if Input.is_action_just_pressed("hop"):
		b |= BIT_HOP
	if Input.is_action_just_pressed("interact"):
		b |= BIT_INTERACT
	if Input.is_action_just_pressed("weapon"):
		b |= BIT_WEAPON
	if Input.is_action_just_pressed("guard"):
		b |= BIT_GUARD
	for i in 6:
		if Input.is_action_just_pressed("skill%d" % (i + 1)):
			b = (b & ~448) | ((i + 1) << 6)
	return b


func _begin_server_match() -> void:
	var node := _host_match()
	var crimson: Dictionary = seats[0]
	var azure: Dictionary = seats[1]
	node.start_online_match(
		crimson["profile"],
		azure["profile"],
		int(crimson["peer_id"]),
		int(azure["peer_id"]),
		0,
		false
	)
	_status("Match running on UDP %d." % port)
	print("NET match units ", node.units.size())
	if not _can_rpc():
		return
	rpc_start.rpc({
		"crimson": crimson["profile"],
		"azure": azure["profile"],
		"crimson_peer": int(crimson["peer_id"]),
		"azure_peer": int(azure["peer_id"])
	})


func _host_match() -> Node:
	var node := MatchScene.instantiate()
	var main := get_tree().root.get_node_or_null("Main")
	if main:
		main.add_child(node)
		main.match_node = node
		if "ui" in main and main.ui:
			main.ui.visible = false
	else:
		add_child(node)
	match_node = node
	return node


func _on_peer_connected(id: int) -> void:
	print("NET peer ", id)
	if role == "server" and use_websocket and multiplayer.get_peers().size() > MAX_CLIENTS:
		if peer != null:
			peer.disconnect_peer(id)
		print("NET refused extra peer ", id)
		return
	if role == "server":
		_status("Peer %d connected. Players %d/2." % [id, seats.size()])


func _on_peer_disconnected(id: int) -> void:
	print("NET peer left ", id)
	if role != "server" or _closing:
		return
	var was_seated := false
	var next: Array = []
	for seat in seats:
		if int(seat["peer_id"]) == id:
			was_seated = true
		else:
			next.append(seat)
	seats = next
	queues.erase(id)
	last_wish.erase(id)
	last_applied.erase(id)
	last_input_msec.erase(id)
	var playing := false
	if match_node != null and is_instance_valid(match_node) and str(match_node.get("phase")) == "play":
		playing = true
	if was_seated and playing and not smoke:
		match_node.end_match("left", -1)
	if was_seated and not smoke:
		_open_lobby_again()
		if playing:
			_kick_remaining_peers.call_deferred()
	elif match_node == null:
		_status("Players %d/2." % seats.size())


func _send_join() -> void:
	if role != "client" or pending_profile.is_empty() or not _can_rpc():
		return
	rpc_join.rpc_id(1, pending_profile)


func _reclaim_abandoned_match() -> void:
	if match_node == null or not is_instance_valid(match_node):
		match_node = null
		return
	if str(match_node.get("phase")) == "play" and _live_seats() >= MAX_CLIENTS:
		return
	print("NET reclaim abandoned match")
	_open_lobby_again()


func _live_seats() -> int:
	var peers: PackedInt32Array = multiplayer.get_peers()
	var live := 0
	for seat in seats:
		if peers.has(int(seat["peer_id"])):
			live += 1
	return live


func _open_lobby_again() -> void:
	if match_node and is_instance_valid(match_node):
		match_node.queue_free()
	match_node = null
	queues.clear()
	last_wish.clear()
	last_applied.clear()
	last_input_msec.clear()
	action_seq.clear()
	input_peers.clear()
	var peers: PackedInt32Array = multiplayer.get_peers()
	var kept: Array = []
	for seat in seats:
		if peers.has(int(seat["peer_id"])):
			kept.append(seat)
	seats = kept
	var kind := "WebSocket" if use_websocket else "UDP"
	_status("Dedicated server listening for %s on port %d. Players %d/2." % [kind, port, seats.size()])


func _kick_remaining_peers() -> void:
	if peer == null or smoke:
		return
	var ids: PackedInt32Array = multiplayer.get_peers()
	for id in ids:
		peer.disconnect_peer(int(id))


func _on_connected() -> void:
	if role != "client":
		return
	_status("Connected. Waiting for the other player.")
	_join_timer = 0.0
	print("NET connected id ", multiplayer.get_unique_id())
	rpc_fetch_server_time.rpc_id(1, Time.get_ticks_msec())
	_send_join()


func _on_connection_failed() -> void:
	var target := _websocket_url(address, port) if use_websocket else "%s:%d" % [address, port]
	_status("Could not reach the server at %s." % target)
	print("NET connection failed")
	if smoke and role == "client":
		_fail("connection failed")


func _on_server_disconnected() -> void:
	if _closing or role != "client":
		return
	print("NET server closed")
	if smoke:
		if snapshot_count >= 8 and local_seq >= 5:
			_pass("client snapshots=%d inputs=%d" % [snapshot_count, local_seq])
		else:
			_fail("server closed snapshots=%d seq=%d" % [snapshot_count, local_seq])
		return
	_status("The server closed the match.")
	_closing = true
	_clear_match()
	_shutdown_peer()
	_reset_runtime()
	role = "offline"
	_closing = false
	var main := get_tree().root.get_node_or_null("Main")
	if main and main.has_method("show_armory"):
		main.match_node = null
		main.show_armory()


func _smoke_watch() -> void:
	if not smoke or _finished:
		return
	var elapsed := float(Time.get_ticks_msec() - _boot_msec) / 1000.0
	if role == "server":
		var inputs_ok := input_peers.size() >= 2
		for id in input_peers.keys():
			if int(input_peers[id]) < 5:
				inputs_ok = false
		if snapshot_count >= 8 and inputs_ok:
			if _smoke_ready_msec == 0:
				_smoke_ready_msec = Time.get_ticks_msec()
			elif Time.get_ticks_msec() - _smoke_ready_msec > 800:
				_pass("server snapshots=%d" % snapshot_count)
		elif elapsed > 20.0:
			_fail("server timeout snapshots=%d seats=%d inputs=%s" % [snapshot_count, seats.size(), str(input_peers)])
	elif role == "client":
		if snapshot_count >= 8 and local_seq >= 5 and match_node != null:
			_pass("client snapshots=%d inputs=%d" % [snapshot_count, local_seq])
		elif elapsed > 20.0:
			_fail("client timeout snapshots=%d seq=%d" % [snapshot_count, local_seq])


func _pass(msg: String) -> void:
	if _finished:
		return
	_finished = true
	print("NET_SMOKE OK ", msg)
	get_tree().quit(0)


func _fail(msg: String) -> void:
	if _finished:
		return
	_finished = true
	print("NET_SMOKE FAIL ", msg)
	get_tree().quit(1)


func _can_rpc() -> bool:
	return peer != null and multiplayer.multiplayer_peer == peer and multiplayer.get_peers().size() > 0


func _status(text: String) -> void:
	status = text
	status_changed.emit()


func _shutdown_peer() -> void:
	if peer != null:
		peer.close()
	peer = null
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer = null


func _clear_match() -> void:
	if match_node and is_instance_valid(match_node):
		match_node.queue_free()
	match_node = null
	var main := get_tree().root.get_node_or_null("Main")
	if main:
		main.match_node = null


func _reset_runtime() -> void:
	seats.clear()
	queues.clear()
	last_wish.clear()
	last_applied.clear()
	last_input_msec.clear()
	action_seq.clear()
	input_peers.clear()
	history.clear()
	world_states.clear()
	_reset_clock()
	pending_buttons = 0
	has_held = false
	local_seq = 0
	_acc = 0.0


func _disk_profile() -> Dictionary:
	var data: Dictionary = Profile.snapshot()
	var gender := str(data.get("gender", "female"))
	if gender != "male" and gender != "female":
		gender = "female"
	var pname := str(data.get("name", "You")).strip_edges()
	if pname == "":
		pname = "You"
	var skills := {}
	var count := 0
	var unlocked: Dictionary = data.get("unlocked", {})
	var equipped: Dictionary = data.get("equipped", {})
	for id in Balance.SKILL_ORDER:
		var on := bool(unlocked.get(id, false)) and bool(equipped.get(id, false))
		skills[id] = on
		if on:
			count += 1
	if count != 3:
		for id in Balance.SKILL_ORDER:
			skills[id] = id == "fireball" or id == "ice" or id == "lightning"
	return _clean_profile({
		"name": pname,
		"gender": gender,
		"stats": data.get("stats", {}),
		"skills": skills
	})


func _smoke_profile() -> Dictionary:
	var gender := "male" if smoke_name == "Red" else "female"
	var skills := {}
	for id in Balance.SKILL_ORDER:
		skills[id] = id == "fireball" or id == "ice" or id == "lightning"
	return _clean_profile({
		"name": smoke_name,
		"gender": gender,
		"stats": {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0},
		"skills": skills
	})


func _clean_profile(raw: Dictionary) -> Dictionary:
	var pname := str(raw.get("name", "You")).strip_edges()
	if pname.length() > 16:
		pname = pname.substr(0, 16)
	if pname == "":
		pname = "You"
	var gender := str(raw.get("gender", "female"))
	if gender != "male" and gender != "female":
		gender = "female"
	var stats := {"agi": 0, "spd": 0, "str": 0, "pwr": 0, "int": 0}
	var incoming: Dictionary = raw.get("stats", {})
	var spent := 0
	for key in stats.keys():
		var value := clampi(int(incoming.get(key, 0)), 0, 10)
		if spent + value > 10:
			value = 10 - spent
		spent += value
		stats[key] = value
	var skills := {}
	var incoming_skills: Dictionary = raw.get("skills", {})
	var picked := 0
	for id in Balance.SKILL_ORDER:
		var on := bool(incoming_skills.get(id, false)) and picked < 3
		if on:
			picked += 1
		skills[id] = on
	if picked == 0:
		skills["fireball"] = true
		skills["ice"] = true
		skills["lightning"] = true
	return {"name": pname, "gender": gender, "stats": stats, "skills": skills}
