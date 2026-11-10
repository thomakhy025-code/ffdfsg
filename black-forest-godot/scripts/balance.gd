extends RefCounted
## Numbers from docs/black-forest/game.js (1 world unit = 1 meter).
## Throw distance matches throwDiamond (`dist = 1`), not the older 12 m design note.

const MAP_W := 88.0
const MAP_H := 50.0
const KEEP_INSET := 0.31

const SWORD_DAMAGE := 10.0
const BARE_DAMAGE := 5.0
const SWORD_RANGE := 0.5
const FIRE_SWORD_RANGE := 0.75
const SWORD_ARC := PI * 120.0 / 180.0
const FIRE_SWORD_ARC := PI
const THROW_METERS := 1.0
const THROW_SPEED := 8.0
const CARRY_SPEED := 0.5
const GUARD_DRAIN := 5.0
const PLAYER_SPEED := 7.6
const BOT_SPEED := 6.55
const BANK_TIME := 10.0
const MATCH_TIME := 300.0
const RESPAWN_TIME := 6.0

const MEGA_AHEAD := 7.0
const MEGA_RADIUS := 5.0
const MEGA_TIME := 2.5
const MEGA_DAMAGE := 200.0
const SABER_LEN := 7.5
const SABER_W := 2.0
const SABER_TIME := 1.5
const SABER_DAMAGE := 75.0
const DASH_DIST := 4.0
const DASH_REACH := 0.95
const FIREBALL_DIRECT := 30.0
const FIREBALL_SPLASH := 10.0
const FIREBALL_SPLASH_R := 0.8
const FIREBALL_SPEED := 7.5
const FIREBALL_LIFE := 1.25
const FIREBALL_RADIUS := 0.95
const TOWER_CAPTURE := 3.0

const LAYER_WALL := 1
const LAYER_ROCK := 2
const LAYER_DOOR_CRIMSON := 4
const LAYER_DOOR_AZURE := 8
const LAYER_UNIT := 16
const LAYER_WATER := 32
const LAYER_BRIDGE := 64
const LAYER_ISLAND := 128

const SKILL_ORDER := ["fireball", "ice", "firesword", "lightning", "mega", "saber"]

const SKILLS := {
	"fireball": {
		"name": "Fireball", "pool": "magic", "key": "1", "cast": 0.5, "cd": 8.0, "mp": 0.25,
		"blurb": "Flies along your facing. Wide hit: 30 on the first enemy, 10 splash in 0.8m. The trail burns for 5s at 5 HP each second. Farther from inside a captured bridge tower. Hits gates, covers, and ore. Ice clones block it."
	},
	"ice": {
		"name": "Ice Shadowing", "pool": "magic", "key": "2", "cast": 0.5, "cd": 20.0, "mp": 0.5,
		"blurb": "Two clones, 0.5m out at ±45°. They copy your swing at 25% damage. 10s or 25 HP."
	},
	"firesword": {
		"name": "Fire Sword", "pool": "sword", "key": "3", "cast": 0.1, "cd": 15.0, "mp": 0.3,
		"blurb": "8s or 5 connecting hits. Melee becomes 0.75m / 180°, double fire damage, and 5 burn DPS for 3s."
	},
	"lightning": {
		"name": "Lightning Quick Move", "pool": "sword", "key": "4", "cast": 0.5, "cd": 5.0, "mp": 0.1,
		"blurb": "After the startup, dash 4m along your facing. A wide strike covers the whole path: 10 damage and a 1s shock. The target cannot move, and can still cast Fireball. For 5s their skill casts take twice as long. Immune during the dash."
	},
	"mega": {
		"name": "Mega Explosion", "pool": "magic", "key": "5", "cast": 2.5, "cd": 30.0, "mp": 0.0, "mp_flat": 70.0,
		"blurb": "Channel 2.5s. You cannot move, attack, or use other skills. Blast centered 7m along your facing, radius 5m. 200 HP to everyone inside, teammates included. 70 MP. 30s cooldown, shortened by INT."
	},
	"saber": {
		"name": "Lightsaber Beam", "pool": "sword", "key": "6", "cast": 1.5, "cd": 24.0, "mp": 0.0, "mp_flat": 50.0,
		"blurb": "Channel 1.5s. You cannot move, attack, or use other skills. A lane 7.5m long and 2m wide. 75 HP to everyone in that lane, teammates included. 50 MP. 24s cooldown, shortened by INT."
	}
}

const SHORT := {
	"fireball": "Fire", "ice": "Ice", "firesword": "Sword",
	"lightning": "Dash", "mega": "Boom", "saber": "Beam"
}

const KEY_SKILL := {
	"1": "fireball", "2": "ice", "3": "firesword", "4": "lightning", "5": "mega", "6": "saber"
}

## Path nodes are already in the halved map (game.js NODES).
const NODES := {
	"wDia": Vector2(9, 20), "wVault": Vector2(10, 33), "wIn": Vector2(14, 25.5), "wOut": Vector2(25, 25.5),
	"nW": Vector2(31, 9.1), "bridgeNW": Vector2(38, 9.1), "bridgeN": Vector2(44, 11.7),
	"bridgeNE": Vector2(50, 9.1), "nE": Vector2(57, 9.1),
	"isleW": Vector2(38, 24), "isle": Vector2(44.1, 25.2), "isleE": Vector2(50, 26),
	"sW": Vector2(31, 42.6), "bridgeSW": Vector2(38, 42.6), "bridgeS": Vector2(44, 38.9),
	"bridgeSE": Vector2(50, 42.6), "sE": Vector2(57, 42.6),
	"eOut": Vector2(63, 25.5), "eIn": Vector2(74, 25.5), "eDia": Vector2(79, 20), "eVault": Vector2(78, 33)
}

const GRAPH := {
	"wDia": ["wIn"], "wVault": ["wIn"],
	"wIn": ["wDia", "wVault", "wOut"],
	"wOut": ["wIn", "nW", "sW", "isleW"],
	"nW": ["wOut", "bridgeNW"], "bridgeNW": ["nW", "bridgeN"], "bridgeN": ["bridgeNW", "bridgeNE"],
	"bridgeNE": ["bridgeN", "nE"], "nE": ["bridgeNE", "eOut"],
	"sW": ["wOut", "bridgeSW"], "bridgeSW": ["sW", "bridgeS"], "bridgeS": ["bridgeSW", "bridgeSE"],
	"bridgeSE": ["bridgeS", "sE"], "sE": ["bridgeSE", "eOut"],
	"isleW": ["wOut", "isle"], "isle": ["isleW", "isleE"], "isleE": ["isle", "eOut"],
	"eOut": ["nE", "sE", "isleE", "eIn"],
	"eIn": ["eOut", "eDia", "eVault"],
	"eDia": ["eIn"], "eVault": ["eIn"]
}


static func skill_cost(def: Dictionary, max_mp: float) -> float:
	if def.has("mp_flat"):
		return float(def["mp_flat"])
	return float(def["mp"]) * max_mp


static func mp_label(def: Dictionary) -> String:
	if def.has("mp_flat"):
		return "%d MP" % int(def["mp_flat"])
	return "%d%% MP" % int(round(float(def["mp"]) * 100.0))


static func cd_mul(stats: Dictionary) -> float:
	return 1.0 - 0.005 * float(stats.get("int", 0))


static func spd_mul(stats: Dictionary) -> float:
	return 1.0 + 0.005 * float(stats.get("spd", 0))


static func agi_mul(stats: Dictionary) -> float:
	return 1.0 - 0.005 * float(stats.get("agi", 0))


static func pwr_mul(stats: Dictionary) -> float:
	return 1.0 + 0.005 * float(stats.get("pwr", 0))


static func max_hp(stats: Dictionary) -> float:
	return 100.0 * (1.0 + 0.025 * float(stats.get("str", 0)))


static func max_mp(stats: Dictionary) -> float:
	return 100.0 * (1.0 + 0.02 * float(stats.get("int", 0)))


static func solid_mask(team: int, ignore_rocks: bool) -> int:
	var mask := LAYER_WALL
	if not ignore_rocks:
		mask |= LAYER_ROCK
	if team != 0:
		mask |= LAYER_DOOR_CRIMSON
	if team != 1:
		mask |= LAYER_DOOR_AZURE
	return mask


static func ang_diff(a: float, b: float) -> float:
	return atan2(sin(a - b), cos(a - b))


static func closest_node(p: Vector2) -> String:
	var best := "isle"
	var bd := 1.0e9
	for id in NODES.keys():
		var d: float = NODES[id].distance_to(p)
		if d < bd:
			bd = d
			best = id
	return best


static func astar(start: String, goal: String) -> Array:
	if start == goal:
		return [start]
	var open: Array = [start]
	var came := {}
	var g := {start: 0.0}
	var f := {start: NODES[start].distance_to(NODES[goal])}
	while open.size() > 0:
		open.sort_custom(func(a, b): return float(f.get(a, 1e9)) < float(f.get(b, 1e9)))
		var cur: String = open.pop_front()
		if cur == goal:
			var path: Array = [cur]
			while came.has(path[0]):
				path.push_front(came[path[0]])
			return path
		for nb in GRAPH.get(cur, []):
			var tg: float = float(g[cur]) + NODES[cur].distance_to(NODES[nb])
			if not g.has(nb) or tg < float(g[nb]):
				came[nb] = cur
				g[nb] = tg
				f[nb] = tg + NODES[nb].distance_to(NODES[goal])
				if not open.has(nb):
					open.append(nb)
	return [start]
