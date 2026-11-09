"use strict";
/* Black Forest — Capture the Diamond. 1 world unit = 1 meter. */
(() => {
  const BARE_DAMAGE = 5;
  const SWORD_DAMAGE = 10;
  const SAVE_KEY = "black-forest-ctd-v1";
  const MAP = { w: 88, h: 50 };
  const KEEP_INSET = 0.31;
  const SKILLS = {
    fireball: { name: "Fireball", pool: "magic", key: "1", cast: 0.5, cd: 8, mp: 0.25, blurb: "Flies along your facing. Wide hit: 30 on the first enemy, 10 splash in 0.8m. The trail burns for 5s at 5 HP each second. Farther from inside a captured bridge tower. Hits gates, covers, and ore. Ice clones block it." },
    ice: { name: "Ice Shadowing", pool: "magic", key: "2", cast: 0.5, cd: 20, mp: 0.5, blurb: "Two clones, 0.5m out at ±45°. They copy your swing at 25% damage. 10s or 25 HP." },
    firesword: { name: "Fire Sword", pool: "sword", key: "3", cast: 0.1, cd: 15, mp: 0.3, blurb: "8s or 5 connecting hits. Melee becomes 0.75m / 180°, double fire damage, and 5 burn DPS for 3s." },
    lightning: { name: "Lightning Quick Move", pool: "sword", key: "4", cast: 0.5, cd: 5, mp: 0.1, blurb: "After the startup, dash 4m along your facing. A wide strike covers the whole path: 10 damage and a 1s shock. The target cannot move, and can still cast Fireball. For 5s their skill casts take twice as long. Immune during the dash." },
    mega: { name: "Mega Explosion", pool: "magic", key: "5", cast: 2.5, cd: 30, mp: 0, mpFlat: 70, blurb: "Channel 2.5s. You cannot move, attack, or use other skills. A pale red disk with a bold red ring marks the blast, centered 7m along your facing, radius 5m, so the near edge is 2m in front of you. 200 HP to everyone inside, teammates included. 70 MP. 30s cooldown, shortened by INT like other skills." },
    saber: { name: "Lightsaber Beam", pool: "sword", key: "6", cast: 1.5, cd: 24, mp: 0, mpFlat: 50, blurb: "Channel 1.5s. You cannot move, attack, or use other skills. A pale yellow lane with a bold yellow border runs 7.5m straight ahead and is 2m wide. 75 HP to everyone in that lane, teammates included. 50 MP. 24s cooldown, shortened by INT like other skills." }
  };
  const STATS = [
    ["agi", "AGI", "+0.5% evasion and −0.5% melee startup per point"],
    ["spd", "SPD", "+0.5% move and dash speed, −0.5% dash startup per point"],
    ["str", "STR", "+2.5% max HP per point (base 100)"],
    ["pwr", "PWR", "+0.5% damage per point"],
    ["int", "INT", "−0.5% cooldowns and +2% max MP per point"]
  ];
  const KEY_SKILL = { Digit1: "fireball", Digit2: "ice", Digit3: "firesword", Digit4: "lightning", Digit5: "mega", Digit6: "saber" };
  const MEGA_AHEAD = 7;
  const MEGA_RADIUS = 5;
  const MEGA_TIME = 2.5;
  const SABER_LEN = 7.5;
  const SABER_W = 2;
  const SABER_TIME = 1.5;

  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const heroImages = {};
  const spriteScratch = document.createElement("canvas");
  const spriteCtx = spriteScratch.getContext("2d");
  for (const who of ["boy", "girl"]) {
    for (const view of ["front", "side", "back"]) {
      const img = new Image();
      img.src = who + "-" + view + ".png";
      heroImages[who + "-" + view] = img;
    }
  }
  let profile = null;
  let pickerResolve = null;
  const session = { helpSeen: false };
  const NAMES = ["Peter", "Marry", "Elena", "Jonas", "Mina", "Caleb", "Ruth", "Oscar"];
  const net = {
    mode: "bots",
    token: null,
    team: 0,
    you: null,
    foe: null,
    remoteInput: null,
    appliedSeq: 0,
    seq: 0,
    pending: [],
    timer: null,
    searching: false,
    buffer: [],
    lastPoseSeq: 0,
    busy: 0,
    remoteLife: null,
    rejectFarUntil: 0,
    sentAt: 0
  };
  const auth = { session: null, kind: "", google: false, blocked: "" };
  let googlePhase = "idle";
  let gisPromise = null;
  const SESSION_KEY = "black-forest-session";
  const BROWSER_KEY = "black-forest-browser";

  let G = blank();

  function blank() {
    return {
      phase: "boot",
      units: [], walls: [], trees: [], rocks: [], shots: [], fx: [], floats: [],
      diamonds: [], sewers: [], catapults: [], ladders: [], springs: [], towers: [],
      cakes: [], isles: [], rivers: [], bridges: [], fires: [], keeps: [],
      megaFx: [], megaHeard: [], booms: 0, megaSeq: 0,
      saberFx: [], saberHeard: [], blasts: 0, saberSeq: 0,
      keys: {},
      stick: { active: false, x: 0, y: 0, id: null },
      mouse: { valid: false, wx: 44, wy: 25 },
      camX: 44, camY: 25, zoom: 32, shake: 0, time: 0, clock: 300,
      takedowns: [0, 0], pausedForHelp: false, frozen: false, player: null,
      lake: { x: 88, y: 50, rx: 15, ry: 12 },
      outpost: null, dpr: 1, viewW: 800, viewH: 600,
      pathWarnings: [], debugCounts: { swings: 0, fireballs: 0, pickups: 0, throws: 0, dashes: 0 },
      killCall: null,
      vaults: [
        { x: 20, y: 66, r: 3.5 },
        { x: 156, y: 66, r: 3.5 }
      ]
    };
  }

  function defaultProfile() {
    return {
      gender: null,
      coins: 10000,
      diamonds: 1000,
      statPoints: 10,
      stats: { agi: 0, spd: 0, str: 0, pwr: 0, int: 0 },
      cards: { fireball: 10, ice: 10, firesword: 10, lightning: 10, mega: 10, saber: 10 },
      unlocked: { fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false },
      equipped: { fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false },
      freeUnlocks: 2,
      tokens: 0,
      pendingDraw: false,
      wins: 0,
      matches: 0
    };
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      profile = Object.assign(defaultProfile(), data);
      profile.stats = Object.assign({ agi: 0, spd: 0, str: 0, pwr: 0, int: 0 }, data.stats || {});
      profile.cards = Object.assign({ fireball: 0, ice: 0, firesword: 0, lightning: 0, mega: 0, saber: 0 }, data.cards || {});
      profile.unlocked = Object.assign({ fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false }, data.unlocked || {});
      profile.equipped = Object.assign({ fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false }, data.equipped || {});
      return true;
    } catch (err) {
      profile = null;
      return false;
    }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (err) { /* private mode */ }
    queueAccountSave();
  }

  function nameWords(value) {
    return String(value || "").trim().split(/\s+/).filter(Boolean);
  }

  function acceptName(value) {
    const words = nameWords(value);
    if (!words.length) return { ok: false, error: "Enter a display name." };
    if (words.length > 8) return { ok: false, error: "Use at most 8 words." };
    return { ok: true, name: words.join(" ") };
  }

  function spentPoints() {
    return STATS.reduce((n, s) => n + (profile.stats[s[0]] || 0), 0);
  }

  function unlock(id) {
    if (profile.unlocked[id]) return { ok: true, already: true };
    if ((profile.cards[id] || 0) < 10) return { ok: false, reason: "Need 10 " + SKILLS[id].name + " cards." };
    const waived = profile.freeUnlocks > 0;
    if (!waived && profile.coins < 10000) return { ok: false, reason: "Need 10,000 coins." };
    profile.cards[id] -= 10;
    if (waived) profile.freeUnlocks -= 1;
    else profile.coins -= 10000;
    profile.unlocked[id] = true;
    profile.equipped[id] = true;
    save();
    return { ok: true, waived };
  }

  function applySuggested() {
    profile.stats = { agi: 2, spd: 2, str: 2, pwr: 2, int: 2 };
    for (const id of ["fireball", "lightning"]) unlock(id);
    profile.equipped.fireball = !!profile.unlocked.fireball;
    profile.equipped.lightning = !!profile.unlocked.lightning;
    save();
  }

  function rollDraw(pool) {
    const keys = pool === "magic" ? ["fireball", "ice"] : ["firesword", "lightning"];
    const got = { fireball: 0, ice: 0, firesword: 0, lightning: 0 };
    for (let i = 0; i < 5; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      got[k] += 1;
      profile.cards[k] += 1;
    }
    return got;
  }

  function formatGot(got) {
    return Object.keys(SKILLS).filter((k) => got[k]).map((k) => got[k] + " " + SKILLS[k].name).join(", ") || "nothing";
  }

  function grantDraws(pool, times) {
    const sum = { fireball: 0, ice: 0, firesword: 0, lightning: 0 };
    for (let i = 0; i < times; i++) {
      const got = rollDraw(pool);
      Object.keys(sum).forEach((k) => { sum[k] += got[k]; });
    }
    save();
    return sum;
  }

  function showScreen(name) {
    for (const id of ["screen-title", "screen-armory", "screen-match"]) {
      $(id).classList.toggle("hidden", id !== "screen-" + name);
    }
    const stick = $("stick");
    const cluster = $("skill-cluster");
    if (stick) {
      stick.hidden = name !== "match";
      if (name !== "match") resetStick();
    }
    if (cluster) cluster.hidden = name !== "match";
  }

  function setStatus(text) { $("armory-status").textContent = text; }

  function renderArmory() {
    const purse = $("purse");
    purse.replaceChildren();
    const bits = [
      ["Coins", profile.coins.toLocaleString()],
      ["Diamonds", profile.diamonds.toLocaleString()],
      ["Skill points", String(10 - spentPoints())],
      ["Draw tokens", String(profile.tokens)],
      ["Starter waivers", String(profile.freeUnlocks)],
      ["Record", profile.wins + " wins / " + profile.matches]
    ];
    for (const [k, v] of bits) {
      const b = document.createElement("b");
      b.textContent = k + "  " + v;
      purse.appendChild(b);
    }
    $("points-left").textContent = (10 - spentPoints()) + " unallocated of 10. Points only change between matches.";
    const rows = $("stat-rows");
    rows.replaceChildren();
    for (const [key, label, desc] of STATS) {
      const row = document.createElement("div");
      row.className = "stat";
      const name = document.createElement("strong");
      name.textContent = label + " " + profile.stats[key];
      const small = document.createElement("small");
      small.textContent = desc;
      const controls = document.createElement("div");
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "–";
      minus.addEventListener("click", () => {
        if (profile.stats[key] > 0) { profile.stats[key] -= 1; save(); renderArmory(); }
      });
      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.addEventListener("click", () => {
        if (spentPoints() < 10) { profile.stats[key] += 1; save(); renderArmory(); }
      });
      controls.append(minus, plus);
      row.append(name, small, controls);
      rows.appendChild(row);
    }
    const cards = $("skill-cards");
    cards.replaceChildren();
    for (const id of Object.keys(SKILLS)) {
      const def = SKILLS[id];
      const card = document.createElement("div");
      card.className = "skill " + def.pool;
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = def.key + "  " + def.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      const state = profile.unlocked[id]
        ? (profile.equipped[id] ? "Unlocked · equipped" : "Unlocked · unequipped")
        : "Locked · " + (profile.cards[id] || 0) + "/10 cards";
      meta.textContent = state + " · " + (profile.cards[id] || 0) + " cards · " + Math.round(def.cd) + "s cd · " + mpLabel(def);
      const blurb = document.createElement("p");
      blurb.textContent = def.blurb;
      info.append(title, meta, blurb);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = profile.unlocked[id] ? "ghost" : "go";
      if (!profile.unlocked[id]) btn.textContent = profile.freeUnlocks > 0 ? "Unlock (waiver)" : "Unlock";
      else btn.textContent = profile.equipped[id] ? "Unequip" : "Equip";
      btn.addEventListener("click", () => {
        if (!profile.unlocked[id]) {
          const res = unlock(id);
          setStatus(res.ok ? (res.already ? "Already unlocked." : (res.waived ? "Unlocked with a starter waiver. Cards spent, coins kept." : "Unlocked. 10,000 coins and 10 cards spent.")) : res.reason);
        } else {
          profile.equipped[id] = !profile.equipped[id];
          save();
        }
        renderArmory();
      });
      card.append(info, btn);
      cards.appendChild(card);
    }
    const pend = $("pending-draw");
    pend.classList.toggle("hidden", !profile.pendingDraw);
    pend.replaceChildren();
    if (profile.pendingDraw) {
      const p = document.createElement("p");
      p.textContent = "A draw is waiting. Choose a pool.";
      const magic = document.createElement("button");
      magic.type = "button";
      magic.className = "go";
      magic.textContent = "Magic pool";
      const sword = document.createElement("button");
      sword.type = "button";
      sword.className = "ghost";
      sword.textContent = "Sword pool";
      const claim = (pool) => {
        profile.pendingDraw = false;
        const got = grantDraws(pool, 1);
        setStatus("Draw: " + formatGot(got) + ".");
        renderArmory();
      };
      magic.addEventListener("click", () => claim("magic"));
      sword.addEventListener("click", () => claim("sword"));
      pend.append(p, magic, sword);
    }
    $("btn-start").disabled = false;
    $("btn-online").disabled = false;
    $("btn-start").textContent = "Versus robots";
  }

  function equippedIds() {
    return Object.keys(SKILLS).filter((id) => profile.equipped[id]);
  }

  let loadoutNext = null;

  function openLoadout(next) {
    if (!profile) return;
    loadoutNext = next;
    for (const id of Object.keys(SKILLS)) profile.unlocked[id] = true;
    if (equippedIds().length !== 3) {
      for (const id of Object.keys(SKILLS)) profile.equipped[id] = id === "fireball" || id === "ice" || id === "lightning";
    }
    save();
    renderLoadout();
    $("loadout").classList.remove("hidden");
  }

  function renderLoadout() {
    const wrap = $("loadout-picks");
    wrap.replaceChildren();
    for (const id of Object.keys(SKILLS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "loadout-skill" + (profile.equipped[id] ? " on" : "");
      btn.setAttribute("aria-pressed", profile.equipped[id] ? "true" : "false");
      const def = SKILLS[id];
      btn.textContent = def.key + "  " + def.name;
      btn.addEventListener("click", () => {
        if (profile.equipped[id]) profile.equipped[id] = false;
        else if (equippedIds().length < 3) profile.equipped[id] = true;
        save();
        renderLoadout();
      });
      wrap.appendChild(btn);
    }
    const n = equippedIds().length;
    $("loadout-count").textContent = n === 3
      ? "3 of 3 equipped. Unequip one to change the set."
      : n + " of 3 equipped.";
    $("loadout-go").disabled = n !== 3;
  }

  function confirmLoadout() {
    if (equippedIds().length !== 3) return;
    const next = loadoutNext;
    $("loadout").classList.add("hidden");
    loadoutNext = null;
    if (next === "online") openOnline();
    else beginMatch(next === "help");
  }

  function choosePool(title, body) {
    $("picker-title").textContent = title;
    $("picker-body").textContent = body;
    $("picker").classList.remove("hidden");
    return new Promise((resolve) => { pickerResolve = resolve; });
  }

  function pwrMul(u) { return 1 + 0.005 * (u.stats.pwr || 0); }
  function cdMul(u) { return 1 - 0.005 * (u.stats.int || 0); }
  function skillCost(def, u) { return def.mpFlat != null ? def.mpFlat : def.mp * u.maxMp; }
  function mpLabel(def) { return def.mpFlat != null ? def.mpFlat + " MP" : Math.round(def.mp * 100) + "% MP"; }
  function megaLocked(u) { return !!(u && u.channel && u.channel.kind === "mega"); }
  function saberLocked(u) { return !!(u && u.channel && u.channel.kind === "saber"); }
  function rootLocked(u) { return megaLocked(u) || saberLocked(u); }
  function spdMul(u) { return 1 + 0.005 * (u.stats.spd || 0); }
  function agiMul(u) { return 1 - 0.005 * (u.stats.agi || 0); }
  function maxHpOf(stats) { return 100 * (1 + 0.025 * (stats.str || 0)); }
  function maxMpOf(stats) { return 100 * (1 + 0.02 * (stats.int || 0)); }

  function makeUnit(opts) {
    const stats = Object.assign({ agi: 0, spd: 0, str: 0, pwr: 0, int: 0 }, opts.stats || {});
    return {
      id: opts.id, name: opts.name, team: opts.team, gender: opts.gender || "male",
      isPlayer: !!opts.isPlayer, isRemote: !!opts.isRemote, role: opts.role || "fight",
      x: opts.x, y: opts.y, r: 0.48, facing: opts.facing || 0, aim: opts.facing || 0,
      stats,
      hp: maxHpOf(stats), maxHp: maxHpOf(stats),
      mp: maxMpOf(stats), maxMp: maxMpOf(stats),
      weapon: "sword",
      shock: 0, slowCast: 0,
      skills: Object.assign({ fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false }, opts.skills || {}),
      cds: { fireball: 0, ice: 0, firesword: 0, lightning: 0, mega: 0, saber: 0 },
      cast: null, attackWind: 0, attackCd: 0, swingVis: 0, swingDur: 0.26,
      flourish: null, perform: null, performDash: null, visualWind: null,
      fireSwordT: 0, fireSwordHits: 0, burn: null,
      clones: [], dash: null, hop: null, hopCd: 0, flight: null, channel: null,
      invuln: opts.invuln || 0, respawn: 0, dead: false, life: 0, holdingRespawn: false, hitFlash: 0,
      carrying: null, guard: false, guardBlock: false, wishX: 0, wishY: 0, clickTarget: null, walk: 0, warpCd: 0,
      gait: 0, moveBlend: 0, idlePh: Math.random(), attackDur: 0.22, recover: 0, pendingRecover: false,
      kills: 0
    };
  }

  const NODES = {
    wDia: { x: 9, y: 20 }, wVault: { x: 10, y: 33 }, wIn: { x: 14, y: 25.5 }, wOut: { x: 25, y: 25.5 },
    nW: { x: 31, y: 9.1 }, bridgeNW: { x: 38, y: 9.1 }, bridgeN: { x: 44, y: 11.7 }, bridgeNE: { x: 50, y: 9.1 }, nE: { x: 57, y: 9.1 },
    isleW: { x: 38, y: 24 }, isle: { x: 44.1, y: 25.2 }, isleE: { x: 50, y: 26 },
    sW: { x: 31, y: 42.6 }, bridgeSW: { x: 38, y: 42.6 }, bridgeS: { x: 44, y: 38.9 }, bridgeSE: { x: 50, y: 42.6 }, sE: { x: 57, y: 42.6 },
    eOut: { x: 63, y: 25.5 }, eIn: { x: 74, y: 25.5 }, eDia: { x: 79, y: 20 }, eVault: { x: 78, y: 33 }
  };
  const GRAPH = {};
  function link(a, b) {
    (GRAPH[a] || (GRAPH[a] = [])).push(b);
    (GRAPH[b] || (GRAPH[b] = [])).push(a);
  }
  link("wDia", "wIn"); link("wVault", "wIn"); link("wIn", "wOut");
  link("wOut", "nW"); link("nW", "bridgeNW"); link("bridgeNW", "bridgeN"); link("bridgeN", "bridgeNE"); link("bridgeNE", "nE"); link("nE", "eOut");
  link("wOut", "sW"); link("sW", "bridgeSW"); link("bridgeSW", "bridgeS"); link("bridgeS", "bridgeSE"); link("bridgeSE", "sE"); link("sE", "eOut");
  link("wOut", "isleW"); link("isleW", "isle"); link("isle", "isleE"); link("isleE", "eOut");
  link("eOut", "eIn"); link("eIn", "eDia"); link("eIn", "eVault");

  function buildWorld(online) {
    const keys = G.keys;
    const mouse = G.mouse;
    const view = { dpr: G.dpr, viewW: G.viewW, viewH: G.viewH, zoom: G.zoom };
    G = blank();
    G.keys = keys;
    G.mouse = mouse;
    Object.assign(G, view);
    G.phase = "play";
    G.clock = 300;

    const wall = (x, y, w, h) => G.walls.push({ kind: "wall", x, y, w, h });
    const door = (team, x, y, w, h) => G.walls.push({ kind: "door", team, x, y, w, h, hp: 70, max: 70 });
    wall(6, 26, 36, 3); wall(6, 73, 36, 3); wall(6, 26, 3, 50);
    wall(39, 26, 3, 18); wall(39, 58, 3, 18);
    door(0, 39, 44, 3, 7); door(0, 39, 51, 3, 7);
    wall(134, 26, 36, 3); wall(134, 73, 36, 3); wall(167, 26, 3, 50);
    wall(134, 26, 3, 18); wall(134, 58, 3, 18);
    door(1, 134, 44, 3, 7); door(1, 134, 51, 3, 7);

    layRivers();
    G.sewers = [
      { team: 0, x: 28, y: 40, r: 1.3, hp: 32, max: 32, exitX: 66, exitY: 48 },
      { team: 1, x: 148, y: 40, r: 1.3, hp: 32, max: 32, exitX: 110, exitY: 48 }
    ];
    G.catapults = [
      { team: 0, x: 30, y: 56, destX: 148, destY: 52 },
      { team: 1, x: 146, y: 56, destX: 28, destY: 52 }
    ];
    G.ladders = [
      { x: 22, y: 80, toX: 22, toY: 68 },
      { x: 154, y: 80, toX: 154, toY: 68 }
    ];
    G.springs = [
      { x: 16, y: 22, toX: 20, toY: 36 },
      { x: 160, y: 22, toX: 156, toY: 36 }
    ];
    G.towers = [
      { name: "West Tower", x: 58, y: 92, r: 2.4, capR: 6, progress: 0, owner: null, destX: 30, destY: 66, side: 0 },
      { name: "East Tower", x: 118, y: 92, r: 2.4, capR: 6, progress: 0, owner: null, destX: 146, destY: 66, side: 1 }
    ];
    G.outpost = { name: "Middle Outpost", x: 88, y: 15, r: 2.1, capR: 6.4, progress: 0, owner: null };
    G.rocks = [
      { x: 84.2, y: 8.2, r: 3.45, hp: 48, max: 48 },
      { x: 91.8, y: 8.2, r: 3.45, hp: 48, max: 48 }
    ];
    const treeSpots = [
      [28, 12], [46, 11], [62, 13], [108, 12], [126, 11], [148, 13], [164, 16],
      [70, 16.2], [70, 27.6], [106, 16.2], [106, 27.6],
      [38, 36], [138, 36],
      [38, 70], [138, 70],
      [72, 80.2], [72, 91.4], [104, 80.2],
      [30, 96], [102, 96], [150, 96],
      [172, 40], [172, 70]
    ];
    for (const [x, y] of treeSpots) G.trees.push({ x, y, r: 1.55 });

    G.diamonds = [
      { team: 0, x: 18, y: 40, homeX: 18, homeY: 40, carrier: null, bank: 0, atHome: true, inFlight: false, throwLock: 0, dropDelay: 0, lastThrower: null },
      { team: 1, x: 158, y: 40, homeX: 158, homeY: 40, carrier: null, bank: 0, atHome: true, inFlight: false, throwLock: 0, dropDelay: 0, lastThrower: null }
    ];

    const ps = profile.stats;
    const pSkills = {};
    for (const id of Object.keys(SKILLS)) pSkills[id] = !!(profile.unlocked[id] && profile.equipped[id]);
    const bots = [
      makeUnit({ id: "nia", name: "Nia", team: 0, gender: "female", role: "defend", x: 16, y: 48 }),
      makeUnit({ id: "joss", name: "Joss", team: 0, gender: "male", role: "escort", x: 26, y: 58 }),
      makeUnit({ id: "pico", name: "Pico", team: 0, gender: "male", role: "raid", x: 32, y: 50 }),
      makeUnit({ id: "bram", name: "Bram", team: 0, gender: "male", role: "fight", x: 22, y: 42, skills: { fireball: true } }),
      makeUnit({ id: "holt", name: "Holt", team: 1, gender: "male", role: "defend", x: 160, y: 48 }),
      makeUnit({ id: "sable", name: "Sable", team: 1, gender: "female", role: "escort", x: 150, y: 58 }),
      makeUnit({ id: "vex", name: "Vex", team: 1, gender: "female", role: "raid", x: 144, y: 52 }),
      makeUnit({ id: "mira", name: "Mira", team: 1, gender: "female", role: "fight", x: 156, y: 56, skills: { fireball: true } })
    ];
    let you;
    if (online && net.you && net.foe) {
      const team = Number(net.team);
      const crimsonInfo = team === 0 ? net.you : net.foe;
      const azureInfo = team === 1 ? net.you : net.foe;
      const crimson = makeUnit({
        id: "crimson", name: crimsonInfo.name, team: 0, gender: crimsonInfo.gender || "female",
        isPlayer: team === 0, isRemote: team !== 0, role: "player",
        x: 24, y: 50, facing: 0, stats: crimsonInfo.stats, skills: crimsonInfo.skills, invuln: 1.8
      });
      const azure = makeUnit({
        id: "azure", name: azureInfo.name, team: 1, gender: azureInfo.gender || "male",
        isPlayer: team === 1, isRemote: team !== 1, role: "player",
        x: 152, y: 50, facing: Math.PI, stats: azureInfo.stats, skills: azureInfo.skills, invuln: 1.8
      });
      you = team === 0 ? crimson : azure;
      G.units = [crimson, azure, ...bots];
    } else {
      you = makeUnit({
        id: "you", name: "You", team: 0, gender: profile.gender || "female", isPlayer: true, role: "player",
        x: 24, y: 50, facing: 0, stats: ps, skills: pSkills, invuln: 1.8
      });
      G.units = [
        you,
        ...bots,
        makeUnit({ id: "quinn", name: "Quinn", team: 1, gender: "male", role: "fight", x: 148, y: 46, skills: { lightning: true } })
      ];
    }
    G.player = you;
    G.camX = you.x;
    G.camY = you.y;
    halveWorld();
    auditPaths();
  }

  function halveXY(o) {
    if (typeof o.x === "number") o.x *= 0.5;
    if (typeof o.y === "number") o.y *= 0.5;
  }

  function halveBox(o) {
    halveXY(o);
    if (typeof o.w === "number") o.w *= 0.5;
    if (typeof o.h === "number") o.h *= 0.5;
  }

  function halvePoly(poly) {
    if (poly) for (const p of poly) halveXY(p);
  }

  function halveWorld() {
    for (const w of G.walls) halveBox(w);
    for (const t of G.trees) { halveXY(t); t.r *= 0.5; }
    for (const rk of G.rocks) { halveXY(rk); rk.r *= 0.5; }
    for (const poly of G.rivers) halvePoly(poly);
    if (G.moat) {
      halveXY(G.moat);
      halvePoly(G.moat.poly);
    }
    for (const isle of G.isles) {
      halveXY(isle);
      if (typeof isle.r === "number") isle.r *= 0.5;
      halvePoly(isle.poly);
    }
    for (const c of G.cakes) halveXY(c);
    for (const b of G.bridges) halveBox(b);
    for (const k of G.keeps) { halveXY(k); k.r *= 0.5; }
    for (const s of G.sewers) {
      halveXY(s);
      s.r *= 0.5;
      s.exitX *= 0.5;
      s.exitY *= 0.5;
    }
    for (const c of G.catapults) {
      halveXY(c);
      c.destX *= 0.5;
      c.destY *= 0.5;
    }
    for (const L of G.ladders) {
      halveXY(L);
      L.toX *= 0.5;
      L.toY *= 0.5;
    }
    for (const s of G.springs) {
      halveXY(s);
      s.toX *= 0.5;
      s.toY *= 0.5;
    }
    for (const t of G.towers) {
      halveXY(t);
      t.r *= 0.5;
      t.capR *= 0.5;
      t.destX *= 0.5;
      t.destY *= 0.5;
    }
    if (G.outpost) {
      halveXY(G.outpost);
      G.outpost.r *= 0.5;
      G.outpost.capR *= 0.5;
    }
    for (const d of G.diamonds) {
      halveXY(d);
      d.homeX *= 0.5;
      d.homeY *= 0.5;
    }
    for (const v of G.vaults) {
      halveXY(v);
      v.r *= 0.5;
    }
    for (const u of G.units) halveXY(u);
    if (G.lake) {
      halveXY(G.lake);
      G.lake.rx *= 0.5;
      G.lake.ry *= 0.5;
    }
    G.camX *= 0.5;
    G.camY *= 0.5;
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function distToRect(x, y, w) {
    const nx = clamp(x, w.x, w.x + w.w);
    const ny = clamp(y, w.y, w.y + w.h);
    return { d: Math.hypot(x - nx, y - ny), x: nx, y: ny };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < cr * cr;
  }

  function bandPolygon(stations) {
    const pts = [];
    for (let i = 0; i < stations.length; i++) pts.push({ x: stations[i].l, y: stations[i].y });
    for (let i = stations.length - 1; i >= 0; i--) pts.push({ x: stations[i].r, y: stations[i].y });
    return pts;
  }

  function ribbonPolygon(points, half) {
    const left = [];
    const right = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      left.push({ x: points[i].x - dy * half, y: points[i].y + dx * half });
      right.push({ x: points[i].x + dy * half, y: points[i].y - dx * half });
    }
    return left.concat(right.reverse());
  }

  function pondOutline(cx) {
    const top = 20.6;
    const topNeck = 26.6;
    const botNeck = 73.6;
    const bot = 82.2;
    const neck = 2.55;
    const wide = 18.8;
    const ys = [];
    for (let y = top; y < bot - 0.01; y += 1.05) ys.push(y);
    ys.push(bot);
    const sample = (y) => {
      let s = 0;
      if (y > topNeck && y < botNeck) {
        const t = (y - topNeck) / (botNeck - topNeck);
        const arch = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
        s = Math.pow(arch, 0.42);
      }
      const half = neck + (wide - neck) * s;
      const bias = Math.sin((y - 38) * 0.22) * 1.15 * s;
      return { half, bias };
    };
    const left = [];
    const right = [];
    for (const y of ys) {
      const row = sample(y);
      left.push({ x: cx - row.half + row.bias, y });
    }
    for (let i = ys.length - 1; i >= 0; i--) {
      const row = sample(ys[i]);
      right.push({ x: cx + row.half + row.bias, y: ys[i] });
    }
    return left.concat(right);
  }

  function layRivers() {
    const cx = 88;
    const poly = pondOutline(cx);
    G.moat = { x: cx, y: 50, poly };
    const islePoly = [
      { x: 84.2, y: 47.4 },
      { x: 86.6, y: 45.5 },
      { x: 90.4, y: 46.2 },
      { x: 93.4, y: 48.5 },
      { x: 94.1, y: 51.8 },
      { x: 92.0, y: 54.6 },
      { x: 88.4, y: 55.5 },
      { x: 85.0, y: 54.2 },
      { x: 83.2, y: 51.4 },
      { x: 83.4, y: 48.6 }
    ];
    G.isles = [
      { x: 88.2, y: 50.4, poly: islePoly },
      { x: 96.8, y: 43.4, r: 1.55 }
    ];
    G.cakes = [
      { x: 88.2, y: 50.2, t: 0 },
      { x: 96.8, y: 43.4, t: 0 }
    ];
    const deck = 7.6;
    G.bridges = [
      { x: cx - deck / 2, y: 21.8, w: deck, h: 3.2 },
      { x: cx - deck / 2, y: 76.2, w: deck, h: 3.2 }
    ];
    const westHalf = 1.75;
    const west = [
      { x: 49.4, y: 38 },
      { x: 52.6, y: 43 },
      { x: 48.2, y: 48 },
      { x: 52.4, y: 53 },
      { x: 48.4, y: 58 },
      { x: 51.8, y: 64 }
    ];
    const east = west.map((p) => ({ x: 176 - p.x, y: p.y }));
    G.rivers = [
      ribbonPolygon(west, westHalf),
      ribbonPolygon(east, westHalf)
    ];
    layKeeps();
  }

  function layKeeps() {
    const spec = [
      { id: "nw", x: 80.6, y: 23.4, door: 0 },
      { id: "ne", x: 95.4, y: 23.4, door: Math.PI },
      { id: "sw", x: 80.6, y: 77.8, door: 0 },
      { id: "se", x: 95.4, y: 77.8, door: Math.PI }
    ];
    G.keeps = spec.map((k) => ({
      id: k.id, x: k.x, y: k.y, r: 2, door: k.door,
      hp: 200, max: 200, owner: null, cap: 0, capTeam: null, down: 0
    }));
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i].y;
      const yj = poly[j].y;
      if ((yi > y) === (yj > y)) continue;
      const xi = poly[i].x;
      const xj = poly[j].x;
      const xHit = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xHit) inside = !inside;
    }
    return inside;
  }

  function onBridge(x, y) {
    for (const b of G.bridges) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  function onIsle(x, y) {
    for (const isle of G.isles) {
      if (isle.poly) {
        if (pointInPoly(x, y, isle.poly)) return true;
      } else if (Math.hypot(x - isle.x, y - isle.y) < isle.r) return true;
    }
    return false;
  }

  function inMoat(x, y) {
    const m = G.moat;
    if (!m || !m.poly) return false;
    return pointInPoly(x, y, m.poly);
  }

  function inWater(x, y) {
    if (onBridge(x, y)) return false;
    if (onIsle(x, y)) return false;
    if (inMoat(x, y)) return true;
    for (const poly of G.rivers) if (pointInPoly(x, y, poly)) return true;
    return false;
  }

  function hitsSolid(x, y, r, team) {
    if (x - r < 1 || y - r < 1.5 || x + r > MAP.w - 1 || y + r > MAP.h - 1.5) return true;
    for (const w of G.walls) {
      if (w.kind === "door" && (w.hp <= 0 || w.team === team)) continue;
      if (circleRect(x, y, r, w.x, w.y, w.w, w.h)) return true;
    }
    for (const t of G.trees) if (Math.hypot(x - t.x, y - t.y) < r + t.r) return true;
    const ignoreRocks = G.outpost && G.outpost.owner === team;
    if (!ignoreRocks) {
      for (const rk of G.rocks) {
        if (rk.hp <= 0) continue;
        if (Math.hypot(x - rk.x, y - rk.y) < r + rk.r) return true;
      }
    }
    if (keepBlocks(x, y, team)) return true;
    return false;
  }

  function keepBlocks(x, y, team) {
    for (const k of G.keeps || []) {
      if (k.down > 0) continue;
      const d = Math.hypot(x - k.x, y - k.y);
      if (d >= k.r) continue;
      const ang = Math.atan2(y - k.y, x - k.x);
      const door = Math.abs(angDiff(ang, k.door)) < 0.72;
      if (k.owner === team && (d < k.r - KEEP_INSET || door)) continue;
      return true;
    }
    return false;
  }

  function tryMove(u, dx, dy) {
    u.x += dx;
    if (hitsSolid(u.x, u.y, u.r, u.team)) u.x -= dx;
    u.y += dy;
    if (hitsSolid(u.x, u.y, u.r, u.team)) u.y -= dy;
  }

  function los(x1, y1, x2, y2, team) {
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (hitsSolid(x, y, 0.175, team)) return false;
    }
    return true;
  }

  function auditPaths() {
    const bad = [];
    for (const a of Object.keys(GRAPH)) {
      for (const b of GRAPH[a]) {
        if (a >= b) continue;
        if ((a === "wIn" && b === "wOut") || (a === "eIn" && b === "eOut")) continue;
        if (!los(NODES[a].x, NODES[a].y, NODES[b].x, NODES[b].y, 0)) bad.push(a + "-" + b);
      }
    }
    G.pathWarnings = bad;
  }

  function closestNode(x, y) {
    let best = "isle";
    let bd = 1e9;
    for (const id of Object.keys(NODES)) {
      const d = Math.hypot(NODES[id].x - x, NODES[id].y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  function astar(start, goal) {
    if (start === goal) return [start];
    const open = [start];
    const came = {};
    const g = { [start]: 0 };
    const f = { [start]: Math.hypot(NODES[start].x - NODES[goal].x, NODES[start].y - NODES[goal].y) };
    while (open.length) {
      open.sort((a, b) => f[a] - f[b]);
      const cur = open.shift();
      if (cur === goal) {
        const path = [cur];
        while (came[path[0]]) path.unshift(came[path[0]]);
        return path;
      }
      for (const nb of GRAPH[cur] || []) {
        const tg = g[cur] + Math.hypot(NODES[cur].x - NODES[nb].x, NODES[cur].y - NODES[nb].y);
        if (g[nb] === undefined || tg < g[nb]) {
          came[nb] = cur;
          g[nb] = tg;
          f[nb] = tg + Math.hypot(NODES[nb].x - NODES[goal].x, NODES[nb].y - NODES[goal].y);
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    return [start];
  }

  function steerPoint(u, goal) {
    if (los(u.x, u.y, goal.x, goal.y, u.team)) return goal;
    const path = astar(closestNode(u.x, u.y), closestNode(goal.x, goal.y));
    if (!path || !path.length) return goal;
    const here = Math.hypot(u.x - goal.x, u.y - goal.y);
    for (let i = 0; i < path.length; i++) {
      const n = NODES[path[i]];
      if (Math.hypot(u.x - n.x, u.y - n.y) < 2.4) continue;
      if (Math.hypot(n.x - goal.x, n.y - goal.y) < here - 0.4) return n;
    }
    for (let i = 0; i < path.length; i++) {
      const n = NODES[path[i]];
      if (Math.hypot(u.x - n.x, u.y - n.y) >= 2.4) return n;
    }
    return goal;
  }

  function moveSpeed(u) {
    let s = ((u.isPlayer || u.isRemote) ? 7.6 : 6.55) * spdMul(u);
    if (u.carrying) s *= 0.5;
    if (inWater(u.x, u.y) && !u.hop && !u.dash && !u.flight) s *= 0.5;
    if (u.cast && u.cast.root) return 0;
    if (u.cast && u.cast.slow) s *= 0.5;
    if (u.channel) return 0;
    if (u.attackWind > 0) s *= 0.82;
    return s;
  }

  function nearestEnemy(u, rad) {
    let best = null;
    let bd = rad;
    for (const o of G.units) {
      if (o === u || o.dead || o.team === u.team) continue;
      const d = dist(u, o);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function enemyDoorTouching(u) {
    let best = null;
    let bd = 1.5;
    for (const w of G.walls) {
      if (w.kind !== "door" || w.hp <= 0 || w.team === u.team) continue;
      const hit = distToRect(u.x, u.y, w);
      if (hit.d < bd) { bd = hit.d; best = w; best._hx = hit.x; best._hy = hit.y; }
    }
    return best;
  }

  function botGoal(u) {
    const mine = G.diamonds[u.team];
    const theirs = G.diamonds[1 - u.team];
    if (u.carrying) return G.vaults[u.team];
    if (u.role === "defend") {
      if (mine.carrier && mine.carrier.team !== u.team) return mine.carrier;
      if (!mine.atHome && !mine.carrier && !mine.inFlight) return mine;
      const foe = nearestEnemy(u, 9);
      if (foe) return foe;
      return { x: mine.homeX, y: mine.homeY + 3 };
    }
    if (u.role === "escort") {
      if (theirs.carrier && theirs.carrier.team === u.team) return theirs.carrier;
      if (!theirs.carrier && !theirs.inFlight) return theirs;
      const foe = nearestEnemy(u, 12);
      return foe || NODES.isle;
    }
    if (u.role === "raid") {
      if (!theirs.carrier && !theirs.inFlight) return theirs;
      if (theirs.carrier && theirs.carrier.team === u.team) return theirs.carrier;
      if (mine.carrier && mine.carrier.team !== u.team) return mine.carrier;
      return NODES.isle;
    }
    const foe = nearestEnemy(u, 16);
    return foe || NODES.isle;
  }

  function tickBot(u, dt) {
    if (u.dead) return;
    const foe = nearestEnemy(u, u.carrying ? 0 : 2.1);
    const door = !u.carrying ? enemyDoorTouching(u) : null;
    if (!u.carrying && !u.cast && !u.dash) {
      if (foe && u.attackCd <= 0) {
        trySwing(u);
      } else if (door && u.attackCd <= 0) {
        trySwing(u);
      } else if (u.skills.fireball && u.cds.fireball <= 0 && !foe) {
        const shot = nearestEnemy(u, 12);
        if (shot && dist(u, shot) > 4 && los(u.x, u.y, shot.x, shot.y, u.team)) {
          u.castFace = Math.atan2(shot.y - u.y, shot.x - u.x);
          u.facing = u.castFace;
          u.aim = u.facing;
          tryCast(u, "fireball");
        }
      } else if (u.skills.lightning && u.cds.lightning <= 0) {
        const shot = nearestEnemy(u, 8);
        if (shot && dist(u, shot) > 3.2 && los(u.x, u.y, shot.x, shot.y, u.team)) tryCast(u, "lightning");
      }
    }
    if (u.role === "defend") maybeRepair(u);
    if (u.warpCd <= 0) botUseMap(u);
    const goal = botGoal(u);
    let gx = goal.x;
    let gy = goal.y;
    if (goal !== u && goal.team === u.team && goal.carrying) {
      const ax = u.x - goal.x;
      const ay = u.y - goal.y;
      const al = Math.hypot(ax, ay);
      if (al < 1.7) {
        const nx = al > 0.05 ? ax / al : Math.cos(u.id.charCodeAt(0));
        const ny = al > 0.05 ? ay / al : Math.sin(u.id.charCodeAt(0));
        gx = goal.x + nx * 1.7;
        gy = goal.y + ny * 1.7;
      }
    }
    const wp = steerPoint(u, { x: gx, y: gy });
    const dx = wp.x - u.x;
    const dy = wp.y - u.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len < 0.6 && u.role === "defend" && !nearestEnemy(u, 9)) {
      u.wishX = 0; u.wishY = 0;
    } else {
      u.wishX = dx / len; u.wishY = dy / len;
    }
    if (u.cast && u.cast.name === "fireball" && typeof u.castFace === "number") u.facing = u.castFace;
    else if (u.wishX || u.wishY) u.facing = Math.atan2(u.wishY, u.wishX);
  }

  function maybeRepair(u) {
    if (u.channel || nearestEnemy(u, 8)) return;
    for (const w of G.walls) {
      if (w.kind !== "door" || w.team !== u.team || w.hp >= w.max) continue;
      if (distToRect(u.x, u.y, w).d < 1.6) {
        u.channel = { kind: "repair", t: 1.1, door: w };
        return;
      }
    }
  }

  function botUseMap(u) {
    const theirs = G.diamonds[1 - u.team];
    if (u.carrying) {
      for (const s of G.sewers) {
        if (s.hp > 0) continue;
        if (Math.hypot(u.x - s.x, u.y - s.y) < 1.6) { useSewer(u, s); return; }
      }
      for (const tower of G.towers) {
        if (tower.owner !== u.team) continue;
        if (Math.hypot(u.x - tower.x, u.y - tower.y) < 2.4 && tower.side === u.team) { warpTo(u, tower.destX, tower.destY); return; }
      }
    } else if (u.role === "raid" && !theirs.carrier) {
      for (const tower of G.towers) {
        if (tower.side !== 1 - u.team || tower.owner !== u.team) continue;
        const doorsUp = G.walls.some((w) => w.kind === "door" && w.team === tower.side && w.hp > 0);
        if (doorsUp && Math.hypot(u.x - tower.x, u.y - tower.y) < 2.4) { warpTo(u, tower.destX, tower.destY); return; }
      }
    }
  }

  function warpTo(u, x, y) {
    u.x = x; u.y = y; u.warpCd = 1.2; u.invuln = Math.max(u.invuln, 0.25);
  }

  function useSewer(u, s) {
    u.x = s.exitX; u.y = s.exitY; u.warpCd = 1.2; u.invuln = Math.max(u.invuln, 0.2);
    float(u, "SEWER", "#c7f9ff");
  }

  function readPlayer(u) {
    let mx = 0;
    let my = 0;
    if (G.keys.KeyW || G.keys.ArrowUp) my -= 1;
    if (G.keys.KeyS || G.keys.ArrowDown) my += 1;
    if (G.keys.KeyA || G.keys.ArrowLeft) mx -= 1;
    if (G.keys.KeyD || G.keys.ArrowRight) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      u.wishX = mx / len; u.wishY = my / len;
      u.clickTarget = null;
    } else {
      const st = G.stick;
      const sm = st && st.active ? Math.hypot(st.x, st.y) : 0;
      if (sm > 0.18) {
        u.wishX = st.x / sm;
        u.wishY = st.y / sm;
        u.clickTarget = null;
      } else if (u.clickTarget) {
        const dx = u.clickTarget.x - u.x;
        const dy = u.clickTarget.y - u.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.35) { u.wishX = 0; u.wishY = 0; u.clickTarget = null; }
        else { u.wishX = dx / len; u.wishY = dy / len; }
      } else { u.wishX = 0; u.wishY = 0; }
    }
    if (u.wishX || u.wishY) u.facing = Math.atan2(u.wishY, u.wishX);
    if (G.mouse.valid) u.aim = Math.atan2(G.mouse.wy - u.y, G.mouse.wx - u.x);
  }

  function readRemote(u) {
    const inp = net.remoteInput;
    if (!inp || !u) return;
    if (typeof inp.aim === "number") u.aim = inp.aim;
    if (inp.seq !== net.appliedSeq) {
      net.appliedSeq = inp.seq;
      for (const action of inp.actions || []) {
        if (action === "swing") {
          if (u.carrying) float(u, "CAN'T ATTACK", "#fff");
          else trySwing(u);
        } else if (action === "throw") throwDiamond(u);
        else if (action === "hop") hop(u);
        else if (action === "interact") interact(u);
        else if (String(action).indexOf("skill:") === 0) tryCast(u, String(action).slice(6));
        else if (action === "guard:1") {
          if (!u.guardBlock && u.carrying && u.mp > 0) u.guard = true;
        } else if (action === "guard:0") {
          u.guard = false;
          u.guardBlock = false;
        }
      }
    }
  }

  function aimAngle(u) {
    return typeof u.aim === "number" ? u.aim : u.facing;
  }

  function update(dt, opts) {
    const skipPlayer = !!(opts && opts.skipPlayer);
    G.time += dt;
    for (const d of G.diamonds) {
      if (d.throwLock > 0) d.throwLock -= dt;
      if (d.dropDelay > 0) d.dropDelay -= dt;
    }
    for (const u of G.units) {
      if (skipPlayer && u.isPlayer) continue;
      updateUnit(u, dt);
    }
    for (const u of G.units) separate(u);
    updateShots(dt);
    tickFires(dt);
    for (const u of G.units) if (!u.dead) {
      for (const c of u.clones) if (c.alive && c.hp <= 0) c.alive = false;
      u.clones = u.clones.filter((c) => c.alive);
    }
    resolvePickups();
    tickKeeps(dt);
    tickPoints(dt);
    tickReturns();
    tickBanks(dt);
    tickKillCall(dt);
    for (const cake of G.cakes) {
      if (cake.t > 0) cake.t -= dt;
      else {
        for (const u of G.units) {
          if (!u.dead && dist(u, cake) < 1.2) {
            u.hp = Math.min(u.maxHp, u.hp + 30);
            cake.t = 18;
            float(u, "+30", "#ffe08a");
            break;
          }
        }
      }
    }
    if (G.phase === "play") {
      G.clock -= dt;
      if (G.clock <= 0) endMatch({ type: "draw" });
    }
    G.shake = Math.max(0, G.shake - dt * 1.8);
    tickMegaFx(dt);
    for (const f of G.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.t -= dt; }
    G.fx = G.fx.filter((f) => f.t > 0);
    for (const f of G.floats) { f.y -= dt * 0.8; f.t -= dt; }
    G.floats = G.floats.filter((f) => f.t > 0).slice(-40);
    const p = G.player;
    if (p && !skipPlayer) {
      G.camX += (p.x - G.camX) * Math.min(1, dt * 6);
      G.camY += (p.y - G.camY) * Math.min(1, dt * 6);
    }
  }

  function stepLocal(dt) {
    const p = G.player;
    if (!p) return;
    updateUnit(p, dt);
    if (isGuest()) tickMegaFx(dt);
    if (Number(net.team) !== 0) tickKillCall(dt);
    G.camX += (p.x - G.camX) * Math.min(1, dt * 6);
    G.camY += (p.y - G.camY) * Math.min(1, dt * 6);
  }

  function updateUnit(u, dt) {
    if (u.dead) {
      u.respawn -= dt;
      if (u.respawn <= 0) respawn(u);
      return;
    }
    for (const id of Object.keys(u.cds)) if (u.cds[id] > 0) u.cds[id] -= dt;
    if (u.shock > 0) u.shock = Math.max(0, u.shock - dt);
    if (u.slowCast > 0) u.slowCast = Math.max(0, u.slowCast - dt);
    if (u.guard && !u.carrying) {
      u.guard = false;
      u.guardBlock = false;
    }
    if (u.guard && u.carrying) {
      u.mp = Math.max(0, u.mp - 5 * dt);
      if (u.mp <= 0) {
        u.mp = 0;
        u.guard = false;
        u.guardBlock = true;
        if (u.isPlayer) {
          float(u, "DEFENSE DOWN", "#bff6ff");
          if (isGuest()) queueAction("guard:0");
        }
      }
    } else u.mp = Math.min(u.maxMp, u.mp + 1 * dt);
    u.invuln = Math.max(0, u.invuln - dt);
    u.hopCd = Math.max(0, u.hopCd - dt);
    u.warpCd = Math.max(0, u.warpCd - dt);
    u.attackCd = Math.max(0, u.attackCd - dt);
    u.hitFlash = Math.max(0, u.hitFlash - dt);
    u.swingVis = Math.max(0, u.swingVis - dt);
    if (u.swingVis <= 0 && u.pendingRecover) {
      u.recover = u.recoverDur || 0.32;
      u.pendingRecover = false;
    }
    if (u.flourish) {
      u.flourish.t -= dt;
      if (u.flourish.t <= 0) u.flourish = null;
    }
    if (u.visualWind) {
      u.visualWind.t -= dt;
      if (u.visualWind.t <= 0) {
        u.visualWind = null;
        if (u.swingVis <= 0) beginSwingFollow(u);
      }
    }
    if (u.perform && !u.cast) {
      u.perform.t -= dt;
      if (u.perform.t <= 0) {
        const shown = u.perform.name;
        u.perform = null;
        if (shown === "lightning" && !u.dash) {
          const dur = dashDuration(u);
          u.performDash = { t: dur, dur };
        } else if (shown !== "lightning") startFlourish(u, shown);
      }
    }
    if (u.performDash && !u.dash) {
      u.performDash.t -= dt;
      if (u.performDash.t <= 0) {
        u.performDash = null;
        u.flourish = { name: "lightning", t: 0.32, dur: 0.32, recoverOnly: true };
      }
    }
    if (u.attackWind <= 0 && u.swingVis <= 0 && u.recover > 0) u.recover = Math.max(0, u.recover - dt);
    u.idlePh = ((u.idlePh || 0) + dt / 1.5) % 1;
    if (u.fireSwordT > 0) {
      u.fireSwordT -= dt;
      if (u.fireSwordT <= 0 || u.fireSwordHits <= 0) { u.fireSwordT = 0; u.fireSwordHits = 0; }
    }
    if (u.burn && u.burn.t > 0) {
      if (u.invuln <= 0) u.hp -= mitigate(u, u.burn.dps * dt);
      u.burn.t -= dt;
      if (u.hp <= 0) kill(u, u.burn.src || null);
      if (u.burn.t <= 0) u.burn = null;
    }
    if (u.cast) {
      if (u.carrying) u.cast = null;
      else {
        u.cast.t -= dt;
        if (u.cast.t <= 0) finishCast(u);
      }
    }
    if (u.attackWind > 0) {
      if (u.carrying || u.dead) u.attackWind = 0;
      else {
        u.attackWind -= dt;
        if (u.attackWind <= 0) doSwing(u);
      }
    }
    if (u.channel) {
      const rooted = u.channel.kind === "mega" || u.channel.kind === "saber";
      if (rooted && isGuest() && u.isPlayer) {
        if (u.channel.predict) {
          u.channel.t = Math.max(0.05, u.channel.t - dt);
          if (performance.now() - (u.channel.started || 0) > 1600) u.channel = null;
        }
      } else {
        u.channel.t -= dt;
        if (u.channel && u.channel.t <= 0) finishChannel(u);
      }
      if (u.channel) {
        u.wishX = 0;
        u.wishY = 0;
        if (u.channel.kind === "mega" || u.channel.kind === "saber") {
          u.clickTarget = null;
          u.attackWind = 0;
          u.hop = null;
          u.dash = null;
          u.cast = null;
        }
      }
    }
    if (u.flight) {
      u.flight.t += dt;
      const k = clamp(u.flight.t / u.flight.dur, 0, 1);
      u.x = u.flight.x0 + (u.flight.x1 - u.flight.x0) * k;
      u.y = u.flight.y0 + (u.flight.y1 - u.flight.y0) * k;
      u.flight.h = Math.sin(k * Math.PI);
      if (k >= 1) { u.flight = null; float(u, "LAND", "#fff"); }
    } else if (u.dash) {
      const step = (u.dash.dist / u.dash.dur) * dt;
      const dx = Math.cos(u.dash.dir) * step;
      const dy = Math.sin(u.dash.dir) * step;
      const beforeX = u.x;
      const beforeY = u.y;
      tryMove(u, dx, dy);
      u.dash.traveled += Math.hypot(u.x - beforeX, u.y - beforeY);
      u.dash.fromX = beforeX;
      u.dash.fromY = beforeY;
      strikeDash(u);
      u.dash.t -= dt;
      if (u.dash.t <= 0 || u.dash.traveled >= u.dash.dist - 0.05) {
        u.dash = null;
        u.flourish = { name: "lightning", t: 0.32, dur: 0.32, recoverOnly: true };
      }
    } else if (u.hop) {
      if (u.shock > 0) u.hop = null;
      else {
        const step = (u.hop.dist / u.hop.dur) * dt;
        tryMove(u, Math.cos(u.hop.dir) * step, Math.sin(u.hop.dir) * step);
        u.hop.t -= dt;
        if (u.hop.t <= 0) u.hop = null;
      }
    } else if (rootLocked(u)) {
      u.wishX = 0;
      u.wishY = 0;
      u.clickTarget = null;
    } else {
      if (u.isPlayer) readPlayer(u);
      else if (u.isRemote) { u.wishX = 0; u.wishY = 0; }
      else tickBot(u, dt);
      if (u.shock > 0) {
        u.wishX = 0;
        u.wishY = 0;
        u.clickTarget = null;
      }
      if (u.isRemote) { /* both clients interpolate this human from the same pose stream */ }
      else {
      const sp = moveSpeed(u) * dt;
      if (sp > 0 && (u.wishX || u.wishY)) {
        const ox = u.x; const oy = u.y;
        tryMove(u, u.wishX * sp, u.wishY * sp);
        if (Math.hypot(u.x - ox, u.y - oy) < sp * 0.25) {
          const base = Math.atan2(u.wishY, u.wishX);
          for (const off of [0.7, -0.7, 1.3, -1.3]) {
            tryMove(u, Math.cos(base + off) * sp, Math.sin(base + off) * sp);
            if (Math.hypot(u.x - ox, u.y - oy) > sp * 0.25) break;
          }
        }
        const moved = Math.hypot(u.x - ox, u.y - oy);
        if (moved > 0.004) {
          const step = clamp(0.64 / Math.max(moved / dt, 2.4), 0.28, 0.46);
          const targetRate = 1 / (step * 2);
          const rate = u.gaitRate || targetRate;
          u.gaitRate = rate + (targetRate - rate) * Math.min(1, dt / 0.2);
          u.gait = ((u.gait || 0) + dt * u.gaitRate) % 1;
          u.moveBlend = Math.min(1, (u.moveBlend || 0) + dt / 0.18);
        }
      }
      }
    }
    if (u.dash) u.moveBlend = 1;
    else if (!u.wishX && !u.wishY) u.moveBlend = Math.max(0, (u.moveBlend || 0) - dt / 0.24);
    ejectKeeps(u);
    if (u.invuln <= 0 && standingInFire(u)) {
      u.hp -= mitigate(u, 5 * dt);
      if (u.hp <= 0) kill(u, null);
    }
    followClones(u, dt);
    if (u.carrying) {
      u.carrying.x = u.x;
      u.carrying.y = u.y - 0.2;
    }
  }

  function followClones(u, dt) {
    for (const c of u.clones) {
      if (!c.alive) continue;
      c.t -= dt;
      if (c.t <= 0 || c.hp <= 0) { c.alive = false; burst(c.x, c.y, "#b9f6ff", 8, 2.4); continue; }
      const ang = u.facing + c.side;
      c.x = u.x + Math.cos(ang) * 0.5;
      c.y = u.y + Math.sin(ang) * 0.5;
      c.facing = u.facing;
      c.swingVis = Math.max(0, (c.swingVis || 0) - dt);
    }
  }

  function separate(u) {
    if (u.dead || u.flight || u.isPlayer || rootLocked(u)) return;
    for (const o of G.units) {
      if (o === u || o.dead) continue;
      const d = dist(u, o);
      const need = u.r + o.r;
      if (d > 0 && d < need) {
        const push = (need - d) * (o.isPlayer ? 1 : 0.5);
        const nx = (u.x - o.x) / d;
        const ny = (u.y - o.y) / d;
        tryMove(u, nx * push, ny * push);
      }
    }
  }

  function respawn(u) {
    const spot = u.team === 0 ? { x: 12, y: 26 } : { x: 77, y: 25 };
    u.dead = false;
    u.x = spot.x + (Math.random() - 0.5) * 1.2;
    u.y = spot.y + (Math.random() - 0.5) * 1.2;
    u.hp = u.maxHp;
    u.mp = u.maxMp * 0.6;
    u.invuln = 1.4;
    u.respawn = 0;
    u.cast = null;
    u.dash = null;
    u.hop = null;
    u.flight = null;
    u.burn = null;
    u.clones = [];
    u.flourish = null;
    u.perform = null;
    u.performDash = null;
    u.visualWind = null;
    u.shock = 0;
    u.slowCast = 0;
    clearGuard(u);
    if (u.isPlayer) u.life = (u.life || 0) + 1;
    if (u.isRemote) {
      net.buffer = [];
      net.rejectFarUntil = performance.now() + 1200;
    }
    float(u, "READY", "#fff");
  }

  function tryCast(u, name) {
    if (!u || u.dead || u.cast || u.dash || u.flight) return false;
    if (u.channel) {
      if (u.isPlayer && rootLocked(u)) float(u, "CHANNELING", "#ffb0b0");
      return false;
    }
    if (u.carrying) { if (u.isPlayer) float(u, "CAN'T CAST", "#fff"); return false; }
    if (u.shock > 0 && name !== "fireball") { if (u.isPlayer) float(u, "SHOCKED", "#fff4a8"); return false; }
    if (!u.skills[name]) { if (u.isPlayer) float(u, "LOCKED", "#ddd"); return false; }
    const def = SKILLS[name];
    if (u.cds[name] > 0) { if (u.isPlayer) float(u, "COOLDOWN", "#ffd0a8"); return false; }
    const cost = skillCost(def, u);
    if (u.mp + 0.001 < cost) { if (u.isPlayer) float(u, "NO MP", "#b9dcff"); return false; }
    if (name === "mega" || name === "saber") {
      u.mp -= cost;
      u.cds[name] = def.cd * cdMul(u);
      if (name === "mega") beginMegaChannel(u, false);
      else beginSaberChannel(u, false);
      float(u, name === "mega" ? "MEGA" : "SABER", name === "mega" ? "#ffb0b0" : "#ffe08a");
      return true;
    }
    u.mp -= cost;
    const dur = castDuration(u, name);
    u.cds[name] = def.cd * cdMul(u);
    const root = name === "lightning" || name === "firesword";
    u.recover = 0;
    u.flourish = null;
    u.perform = null;
    u.cast = { name, t: dur, dur, root, slow: !root };
    if (name === "fireball") sfx(520, 0.08, "square", 0.03);
    if (name === "lightning") sfx(180, 0.1, "sawtooth", 0.03);
    return true;
  }

  function finishCast(u) {
    const name = u.cast.name;
    u.cast = null;
    if (u.carrying || u.dead) return;
    if (name === "fireball") spawnFireball(u);
    else if (name === "ice") spawnClones(u);
    else if (name === "firesword") {
      u.fireSwordT = 8;
      u.fireSwordHits = 5;
      float(u, "FIRE SWORD", "#ffb020");
      sfx(660, 0.08, "square", 0.04);
    } else if (name === "lightning") startDash(u);
    if (name !== "lightning") startFlourish(u, name);
  }

  function castDuration(u, name) {
    const def = SKILLS[name];
    if (!def) return 0.5;
    let t = def.cast;
    if (name === "lightning") t *= (1 - 0.005 * ((u.stats && u.stats.spd) || 0));
    if (u && u.slowCast > 0) t *= 2;
    return t;
  }

  function dashDuration(u) {
    return 0.25 * (1 - 0.005 * ((u.stats && u.stats.spd) || 0));
  }

  function startFlourish(u, name) {
    const dur = name === "ice" ? 0.52 : name === "firesword" ? 0.5 : 0.46;
    u.flourish = { name, t: dur, dur, recoverOnly: false };
  }

  function beginSwingFollow(u) {
    u.swingVis = 0.26;
    u.swingDur = 0.26;
    u.pendingRecover = true;
    u.recoverDur = 0.32;
    u.recoverKind = "swing";
    u.flourish = null;
  }

  function beginCastVisual(u, name) {
    if (!u || u.dead || u.carrying || u.cast || u.perform || !SKILLS[name]) return;
    if (u.skills && !u.skills[name]) return;
    const dur = castDuration(u, name);
    u.perform = { name, t: dur, dur };
    u.flourish = null;
    u.recover = 0;
  }

  function beginSwingVisual(u) {
    if (!u || u.dead || u.carrying || u.attackCd > 0 || u.attackWind > 0 || u.visualWind) return;
    const base = u.weapon === "bare" ? 0.18 : 0.22;
    const dur = base * agiMul(u);
    u.visualWind = { t: dur, dur };
    u.attackCd = 0.5;
    u.recover = 0;
    u.flourish = null;
  }

  function fireballRangeMul(u) {
    for (const k of G.keeps || []) {
      if (k.down > 0 || k.owner !== u.team) continue;
      if (Math.hypot(u.x - k.x, u.y - k.y) < k.r - 0.1) return 1.8;
    }
    return 1;
  }

  function spawnFireball(u) {
    const sp = 7.5;
    const ang = u.facing;
    const x = u.x + Math.cos(ang) * 0.7;
    const y = u.y + Math.sin(ang) * 0.7;
    G.shots.push({
      kind: "fireball",
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: 0.95,
      team: u.team,
      owner: u,
      direct: 30 * pwrMul(u),
      splash: 10 * pwrMul(u),
      life: 1.25 * fireballRangeMul(u),
      trail: 0
    });
    dropFire(x, y);
    G.debugCounts.fireballs += 1;
    burst(u.x, u.y, "#ffb15a", 6, 2);
  }

  function spawnClones(u) {
    u.clones = [-Math.PI / 4, Math.PI / 4].map((side) => ({
      owner: u, team: u.team, side, x: u.x, y: u.y, hp: 25, max: 25, t: 10, alive: true, r: 0.42, facing: u.facing, flash: 0
    }));
    float(u, "ICE", "#b9f3ff");
    sfx(880, 0.12, "triangle", 0.04);
  }

  function startDash(u) {
    const dur = dashDuration(u);
    u.dash = { t: dur, dur, dist: 4, dir: u.facing, traveled: 0, hit: new Set(), fromX: u.x, fromY: u.y };
    u.invuln = Math.max(u.invuln, dur);
    G.debugCounts.dashes += 1;
    sfx(1400, 0.09, "square", 0.04);
  }

  function pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-8) t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  function strikeDash(u) {
    const dmg = 10 * pwrMul(u);
    const x1 = u.dash.fromX;
    const y1 = u.dash.fromY;
    const reach = 0.95;
    for (const o of G.units) {
      if (o.dead || o.team === u.team || u.dash.hit.has(o.id)) continue;
      if (pointSegDist(o.x, o.y, x1, y1, u.x, u.y) > reach) continue;
      u.dash.hit.add(o.id);
      if (tryHit(o, dmg, u, "#fff4a8")) {
        o.shock = Math.max(o.shock || 0, 1);
        o.slowCast = Math.max(o.slowCast || 0, 5);
        float(o, "SHOCK", "#fff4a8");
        burst(o.x, o.y, "#fff4a8", 8, 2.4);
      }
    }
    for (const owner of G.units) {
      for (const c of owner.clones) {
        if (!c.alive || c.team === u.team || u.dash.hit.has(c)) continue;
        if (pointSegDist(c.x, c.y, x1, y1, u.x, u.y) > reach) continue;
        u.dash.hit.add(c);
        damageClone(c, dmg);
      }
    }
  }

  function trySwing(u) {
    if (!u || u.dead || u.carrying || u.cast || u.dash || u.flight || u.attackCd > 0 || u.attackWind > 0) return false;
    if (rootLocked(u)) { if (u.isPlayer) float(u, "CHANNELING", "#ffb0b0"); return false; }
    if (u.shock > 0) { if (u.isPlayer) float(u, "SHOCKED", "#fff4a8"); return false; }
    const base = u.weapon === "bare" ? 0.18 : 0.22;
    u.attackWind = base * agiMul(u);
    u.attackDur = u.attackWind;
    u.attackCd = 0.5;
    u.recover = 0;
    u.pendingRecover = false;
    return true;
  }

  function swingShape(u) {
    const lit = u.fireSwordT > 0 && u.fireSwordHits > 0;
    return {
      range: lit ? 0.75 : 0.5,
      arc: (lit ? 180 : 120) * Math.PI / 180,
      lit
    };
  }

  function inArc(ax, ay, facing, target, range, arc) {
    const dx = target.x - ax;
    const dy = target.y - ay;
    const d = Math.hypot(dx, dy);
    const reach = range + (target.r || 0.4);
    if (d > reach) return false;
    const ang = Math.atan2(dy, dx);
    return Math.abs(angDiff(ang, facing)) <= arc / 2;
  }

  function doSwing(u) {
    const shape = swingShape(u);
    G.debugCounts.swings += 1;
    beginSwingFollow(u);
    u.swingArc = shape.arc;
    u.swingRange = shape.range;
    sfx(shape.lit ? 240 : 190, 0.05, "square", 0.03);
    let connected = false;
    const dmg = baseWeaponDamage(u) * (shape.lit ? 2 : 1);
    for (const o of G.units) {
      if (o.dead || o.team === u.team) continue;
      if (!inArc(u.x, u.y, u.facing, o, shape.range, shape.arc)) continue;
      if (tryHit(o, dmg, u, shape.lit ? "#ffb020" : "#fff")) {
        connected = true;
        if (shape.lit) o.burn = { dps: 5 * pwrMul(u), t: 3, src: u };
      }
    }
    for (const owner of G.units) {
      for (const c of owner.clones) {
        if (!c.alive || c.team === u.team) continue;
        if (!inArc(u.x, u.y, u.facing, c, shape.range, shape.arc)) continue;
        damageClone(c, dmg);
        connected = true;
      }
    }
    for (const w of G.walls) {
      if (w.kind !== "door" || w.hp <= 0 || w.team === u.team) continue;
      const hit = distToRect(u.x, u.y, w);
      if (hit.d > shape.range + 0.05) continue;
      const ang = Math.atan2(hit.y - u.y, hit.x - u.x);
      if (Math.abs(angDiff(ang, u.facing)) > shape.arc / 2) continue;
      w.hp = Math.max(0, w.hp - dmg);
      connected = true;
      floatAt(hit.x, hit.y, Math.round(dmg), "#ffd0a0");
      if (w.hp <= 0) burst(hit.x, hit.y, "#c9843a", 8, 2);
    }
    for (const s of G.sewers) {
      if (s.hp <= 0) continue;
      if (!inArc(u.x, u.y, u.facing, s, shape.range, shape.arc)) continue;
      s.hp = Math.max(0, s.hp - dmg);
      connected = true;
      floatAt(s.x, s.y, Math.round(dmg), "#e7d3b0");
      if (s.hp <= 0) floatAt(s.x, s.y, "COVER BROKEN", "#fff");
    }
    for (const rk of G.rocks) {
      if (rk.hp <= 0) continue;
      if (!inArc(u.x, u.y, u.facing, rk, shape.range, shape.arc)) continue;
      rk.hp = Math.max(0, rk.hp - dmg);
      connected = true;
    }
    for (const k of G.keeps || []) {
      if (k.down > 0 || k.owner == null || k.owner === u.team) continue;
      if (!inArc(u.x, u.y, u.facing, k, shape.range, shape.arc)) continue;
      hurtKeep(k, dmg);
      connected = true;
    }
    if (connected && shape.lit) {
      u.fireSwordHits -= 1;
      if (u.fireSwordHits <= 0) u.fireSwordT = 0;
    }
    for (const c of u.clones) if (c.alive) cloneSwing(c, u, shape);
  }

  function baseWeaponDamage(u) {
    return (u.weapon === "bare" ? BARE_DAMAGE : SWORD_DAMAGE) * pwrMul(u);
  }

  function cloneSwing(c, owner, shape) {
    const dmg = baseWeaponDamage(owner) * 0.25;
    c.swingVis = 0.26;
    c.swingDur = 0.26;
    for (const o of G.units) {
      if (o.dead || o.team === c.team) continue;
      if (inArc(c.x, c.y, c.facing, o, shape.range, shape.arc)) tryHit(o, dmg, owner, "#d7f7ff");
    }
  }

  function mitigate(u, amount) {
    return u && u.guard && u.carrying ? amount * 0.5 : amount;
  }

  function tryHit(target, amount, src, color) {
    if (!target || target.dead) return false;
    if (target.invuln > 0) return false;
    if (Math.random() < 0.005 * (target.stats.agi || 0)) {
      float(target, "EVADE", "#ffe27a");
      return false;
    }
    amount = mitigate(target, amount);
    target.hp -= amount;
    target.hitFlash = 0.12;
    float(target, String(Math.round(amount)), color || "#fff");
    G.shake = Math.min(1, G.shake + (target.isPlayer ? 0.35 : 0.12));
    burst(target.x, target.y, color || "#fff", 4, 1.5);
    if (target.hp <= 0) kill(target, src);
    return true;
  }

  function damageClone(c, amount) {
    c.hp -= amount;
    c.flash = 0.1;
    floatAt(c.x, c.y, Math.round(amount), "#d7f7ff");
    if (c.hp <= 0) { c.alive = false; burst(c.x, c.y, "#b9f6ff", 10, 2.5); }
  }

  function kill(u, src) {
    if (!u || u.dead) return;
    u.dead = true;
    u.hp = 0;
    u.respawn = 6;
    if (u.carrying) detach(u.carrying, u.x, u.y);
    u.cast = null;
    u.dash = null;
    u.flight = null;
    u.channel = null;
    u.clones = [];
    u.flourish = null;
    u.perform = null;
    u.performDash = null;
    u.visualWind = null;
    clearGuard(u);
    if (src && src.team !== u.team) {
      src.kills += 1;
      G.takedowns[src.team] += 1;
      announceKill(src, u);
    }
    burst(u.x, u.y, u.team === 0 ? "#ff8aa8" : "#8ec5ff", 12, 2.6);
    sfx(90, 0.12, "sawtooth", 0.04);
    if (u.isRemote) {
      net.buffer = [];
      net.rejectFarUntil = performance.now() + 1200;
    }
  }

  function speakLine(line) {
    G.lastSpoken = line;
    try {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance !== "function") return;
      const utt = new SpeechSynthesisUtterance(line);
      utt.lang = "en-US";
      utt.rate = 1.06;
      utt.pitch = 0.78;
      utt.volume = 1;
      const voices = synth.getVoices ? synth.getVoices() : [];
      const voice = voices.filter((v) => /^en/i.test(v.lang)).sort((a, b) => {
        const score = (v) => (/male|david|daniel|alex|fred|aaron/i.test(v.name) ? 0 : 1);
        return score(a) - score(b);
      })[0];
      if (voice) utt.voice = voice;
      synth.cancel();
      synth.speak(utt);
    } catch (err) { /* this browser has no speech voice */ }
  }

  function announceKill(src, victim) {
    const spoken = src.name + " successfully killed " + victim.name;
    G.killCall = { text: src.name + " kill " + victim.name, spoken, t: 2.2 };
    speakLine(spoken);
    killSting();
  }

  function tickKillCall(dt) {
    if (!G.killCall) return;
    G.killCall.t -= dt;
    if (G.killCall.t <= 0) G.killCall = null;
  }

  function clearGuard(u) {
    if (!u) return;
    u.guard = false;
    u.guardBlock = false;
  }

  function detach(d, x, y) {
    if (d.carrier) {
      d.carrier.carrying = null;
      clearGuard(d.carrier);
    }
    d.carrier = null;
    d.x = x;
    d.y = y;
    d.atHome = false;
    d.bank = 0;
    d.inFlight = false;
    d.dropDelay = 0.35;
  }

  function throwDiamond(u) {
    if (!u || !u.carrying || u.dead) return;
    const d = u.carrying;
    const dir = u.facing;
    d.carrier = null;
    u.carrying = null;
    clearGuard(u);
    d.inFlight = true;
    d.atHome = false;
    d.bank = 0;
    d.lastThrower = u;
    d.throwLock = 0.75;
    const dist = 1;
    const speed = 8;
    G.shots.push({
      kind: "gem", diamond: d, x: u.x, y: u.y,
      vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed,
      destX: u.x + Math.cos(dir) * dist, destY: u.y + Math.sin(dir) * dist,
      r: 0.35, life: dist / speed, team: u.team
    });
    G.debugCounts.throws += 1;
    float(u, "THROW", "#bff6ff");
  }

  function resolvePickups() {
    const order = G.player ? [G.player, ...G.units.filter((u) => u !== G.player)] : G.units.slice();
    for (const u of order) {
      if (!u || u.dead || u.carrying) continue;
      for (const d of G.diamonds) {
        if (d.carrier || d.inFlight || d.dropDelay > 0) continue;
        if (d.throwLock > 0 && d.lastThrower === u) continue;
        if (Math.hypot(u.x - d.x, u.y - d.y) > 1.15) continue;
        if (u.team === d.team && d.atHome) continue;
        if (!u.isPlayer && G.player && !G.player.dead && G.player.team === u.team && Math.hypot(G.player.x - d.x, G.player.y - d.y) < 12) continue;
        d.carrier = u;
        u.carrying = d;
        d.atHome = false;
        u.cast = null;
        u.attackWind = 0;
        u.channel = null;
        G.debugCounts.pickups += 1;
        float(u, "DIAMOND", "#7ef0ff");
        break;
      }
    }
  }

  function tickPoints(dt) {
    const points = [...G.towers, G.outpost];
    for (const p of points) {
      let w = 0;
      let e = 0;
      for (const u of G.units) {
        if (u.dead) continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) <= p.capR) {
          if (u.team === 0) w += 1; else e += 1;
        }
      }
      const rate = 0.45;
      if (w > e) p.progress = Math.min(1, p.progress + dt * rate * (w - e));
      else if (e > w) p.progress = Math.max(-1, p.progress - dt * rate * (e - w));
      if (p.progress >= 0.98) p.owner = 0;
      else if (p.progress <= -0.98) p.owner = 1;
      else if (Math.abs(p.progress) < 0.15) p.owner = null;
      if (p.owner === null) continue;
      for (const u of G.units) {
        if (u.dead || u.team !== p.owner) continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) <= p.r + 1.4) u.hp = Math.min(u.maxHp, u.hp + 7 * dt);
      }
    }
  }

  function tickReturns() {
    if (G.phase !== "play") return;
    for (const d of G.diamonds) {
      const c = d.carrier;
      if (!c || c.dead || c.team !== d.team) continue;
      const v = G.vaults[d.team];
      if (Math.hypot(c.x - v.x, c.y - v.y) > v.r) continue;
      c.carrying = null;
      clearGuard(c);
      d.carrier = null;
      d.x = d.homeX;
      d.y = d.homeY;
      d.atHome = true;
      d.bank = 0;
      d.inFlight = false;
      d.dropDelay = 0;
      d.throwLock = 0;
      float(c, "RETURNED", "#ffe08a");
    }
  }

  function tickBanks(dt) {
    if (G.phase !== "play") return;
    for (const d of G.diamonds) {
      const c = d.carrier;
      const holding = !!(c && !c.dead && c.team !== d.team && Math.hypot(c.x - G.vaults[c.team].x, c.y - G.vaults[c.team].y) <= G.vaults[c.team].r);
      if (holding) {
        d.bank += dt;
        if (d.bank >= 10) {
          endMatch({ type: "win", team: c.team });
          return;
        }
      } else if (d.bank > 0.2) {
        d.bank = 0;
        if (c) float(c, "HOLD BROKEN", "#ffd0dc");
      } else d.bank = 0;
    }
  }

  function updateShots(dt) {
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const s = G.shots[i];
      const distLeft = Math.hypot(s.vx, s.vy) * dt;
      const steps = Math.max(1, Math.ceil(distLeft / 0.2));
      let dead = false;
      for (let n = 0; n < steps; n++) {
        s.x += (s.vx * dt) / steps;
        s.y += (s.vy * dt) / steps;
        if (s.kind === "fireball") {
          s.trail = (s.trail || 0) + Math.hypot(s.vx, s.vy) * dt / steps;
          while (s.trail >= 0.55) {
            s.trail -= 0.55;
            dropFire(s.x, s.y);
          }
          const hit = fireballHit(s);
          if (hit) { explodeFireball(s, hit); dead = true; break; }
        } else if (hitsSolid(s.x, s.y, s.r * 0.4, -1)) {
          landGem(s);
          dead = true;
          break;
        }
      }
      s.life -= dt;
      if (!dead && s.life <= 0) {
        if (s.kind === "gem") {
          if (s.destX != null) { s.x = s.destX; s.y = s.destY; }
          landGem(s);
        }
        else if (s.kind === "fireball") dropFire(s.x, s.y);
        dead = true;
      }
      if (dead) G.shots.splice(i, 1);
    }
  }

  function blockingKeep(s) {
    let best = null;
    let bd = 1e9;
    for (const k of G.keeps || []) {
      if (k.down > 0 || k.owner === s.team) continue;
      const d = Math.hypot(s.x - k.x, s.y - k.y);
      if (d <= k.r + s.r && d < bd) { bd = d; best = k; }
    }
    return best;
  }

  function fireballHit(s) {
    let best = null;
    let bd = 1e9;
    const take = (d, obj, kind) => { if (d < bd) { bd = d; best = { obj, kind }; } };
    const wallKeep = blockingKeep(s);
    for (const u of G.units) {
      if (u.dead || u.team === s.team) continue;
      if (wallKeep && Math.hypot(u.x - wallKeep.x, u.y - wallKeep.y) < wallKeep.r) continue;
      const d = Math.hypot(s.x - u.x, s.y - u.y);
      if (d <= s.r + u.r) take(d, u, "unit");
    }
    for (const owner of G.units) {
      for (const c of owner.clones) {
        if (!c.alive || c.team === s.team) continue;
        const d = Math.hypot(s.x - c.x, s.y - c.y);
        if (d <= s.r + c.r) take(d, c, "clone");
      }
    }
    for (const t of G.trees) {
      const d = Math.hypot(s.x - t.x, s.y - t.y);
      if (d <= s.r + t.r) take(d, t, "tree");
    }
    for (const w of G.walls) {
      if (w.kind === "door" && (w.hp <= 0 || w.team === s.team)) continue;
      if (!circleRect(s.x, s.y, s.r, w.x, w.y, w.w, w.h)) continue;
      take(distToRect(s.x, s.y, w).d, w, w.kind === "door" ? "door" : "wall");
    }
    for (const rk of G.rocks) {
      if (rk.hp <= 0) continue;
      const d = Math.hypot(s.x - rk.x, s.y - rk.y);
      if (d <= s.r + rk.r) take(d, rk, "rock");
    }
    for (const sew of G.sewers) {
      if (sew.hp <= 0) continue;
      const d = Math.hypot(s.x - sew.x, s.y - sew.y);
      if (d <= s.r + sew.r) take(d, sew, "sewer");
    }
    if (wallKeep) take(Math.hypot(s.x - wallKeep.x, s.y - wallKeep.y), wallKeep, "keep");
    return best;
  }

  function explodeFireball(s, hit) {
    const hx = s.x;
    const hy = s.y;
    burst(hx, hy, "#ff8a3d", 14, 3.2);
    sfx(140, 0.08, "square", 0.04);
    if (hit.kind === "unit") tryHit(hit.obj, s.direct, s.owner, "#ffb15a");
    else if (hit.kind === "clone") damageClone(hit.obj, s.direct);
    else if (hit.kind === "door") {
      hit.obj.hp = Math.max(0, hit.obj.hp - s.direct);
      floatAt(hx, hy, Math.round(s.direct), "#ffd0a0");
    } else if (hit.kind === "rock") hit.obj.hp = Math.max(0, hit.obj.hp - s.direct);
    else if (hit.kind === "sewer") {
      hit.obj.hp = Math.max(0, hit.obj.hp - s.direct);
      if (hit.obj.hp <= 0) floatAt(hit.obj.x, hit.obj.y, "COVER BROKEN", "#fff");
    } else if (hit.kind === "keep") {
      if (hit.obj.owner != null && hit.obj.owner !== s.team) hurtKeep(hit.obj, s.direct);
    }
    dropFire(hx, hy);
    if (hit.kind === "tree" || hit.kind === "wall") return;
    for (const u of G.units) {
      if (u.dead || u.team === s.team || u === hit.obj) continue;
      if (hit.kind === "clone" && u === hit.obj.owner) continue;
      if (hit.kind === "keep" && Math.hypot(u.x - hit.obj.x, u.y - hit.obj.y) < hit.obj.r) continue;
      if (Math.hypot(u.x - hx, u.y - hy) <= 0.8) tryHit(u, s.splash, s.owner, "#ffd7b0");
    }
  }

  function dropFire(x, y) {
    G.fires.push({ x, y, r: 0.45, t: 5 });
    if (G.fires.length > 420) G.fires.splice(0, G.fires.length - 420);
  }

  function standingInFire(u) {
    for (const f of G.fires || []) {
      if (f.t <= 0) continue;
      if (Math.hypot(u.x - f.x, u.y - f.y) <= f.r) return true;
    }
    return false;
  }

  function tickFires(dt) {
    for (const f of G.fires) f.t -= dt;
    if (G.fires.length) G.fires = G.fires.filter((f) => f.t > 0);
  }

  function hurtKeep(k, dmg) {
    if (!k || k.down > 0 || k.owner == null) return;
    k.hp -= dmg;
    floatAt(k.x, k.y - 1.2, String(Math.round(dmg)), "#ffd0a0");
    if (k.hp <= 0) {
      k.hp = 0;
      k.down = 20;
      k.owner = null;
      k.cap = 0;
      k.capTeam = null;
      burst(k.x, k.y, "#c9843a", 12, 2.4);
      floatAt(k.x, k.y, "TOWER DOWN", "#fff");
    }
  }

  function tickKeeps(dt) {
    for (const k of G.keeps || []) {
      if (k.down > 0) {
        k.down -= dt;
        k.owner = null;
        k.cap = 0;
        k.capTeam = null;
        if (k.down <= 0) {
          k.down = 0;
          k.hp = k.max;
        }
        continue;
      }
      const px = k.x + Math.cos(k.door) * (k.r + 0.15);
      const py = k.y + Math.sin(k.door) * (k.r + 0.15);
      let team = null;
      let contested = false;
      for (const u of G.units) {
        if (u.dead) continue;
        if (Math.hypot(u.x - px, u.y - py) > 1.15) continue;
        if (team == null) team = u.team;
        else if (team !== u.team) contested = true;
      }
      if (contested || team == null || team === k.owner) {
        k.cap = 0;
        k.capTeam = null;
        continue;
      }
      if (k.capTeam !== team) {
        k.capTeam = team;
        k.cap = 0;
      }
      k.cap += dt;
      if (k.cap >= 3) {
        k.owner = team;
        k.cap = 0;
        k.capTeam = null;
        floatAt(k.x, k.y - 2.4, team === 0 ? "CRIMSON" : "AZURE", team === 0 ? "#ff5d7a" : "#5ad0ff");
      }
    }
  }

  function ejectKeeps(u) {
    if (!u || u.dead) return;
    for (const k of G.keeps || []) {
      if (k.down > 0 || k.owner === u.team) continue;
      const dx = u.x - k.x;
      const dy = u.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d >= k.r) continue;
      const nx = d > 0.001 ? dx / d : Math.cos(k.door);
      const ny = d > 0.001 ? dy / d : Math.sin(k.door);
      u.x = k.x + nx * (k.r + 0.02);
      u.y = k.y + ny * (k.r + 0.02);
    }
  }

  function landGem(s) {
    const d = s.diamond;
    d.inFlight = false;
    d.x = s.x;
    d.y = s.y;
    d.atHome = false;
    const spot = nearestWalkable(d.x, d.y, 0.2, 0);
    d.x = spot.x;
    d.y = spot.y;
  }

  function nearestWalkable(x, y, r, team) {
    if (!hitsSolid(x, y, r, team)) return { x, y };
    for (let rad = 0.25; rad <= 6; rad += 0.25) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const nx = x + Math.cos(ang) * rad;
        const ny = y + Math.sin(ang) * rad;
        if (!hitsSolid(nx, ny, r, team)) return { x: nx, y: ny };
      }
    }
    return { x: clamp(x, 2, MAP.w - 2), y: clamp(y, 2.5, MAP.h - 2.5) };
  }

  function interact(u) {
    if (!u || u.dead || u.flight || u.channel) return;
    let best = null;
    let bd = 2.3;
    const consider = (d, obj, kind) => { if (d < bd) { bd = d; best = { obj, kind }; } };
    for (const s of G.sewers) consider(Math.hypot(u.x - s.x, u.y - s.y), s, "sewer");
    for (const t of G.towers) consider(Math.hypot(u.x - t.x, u.y - t.y), t, "tower");
    for (const c of G.catapults) if (c.team === u.team) consider(Math.hypot(u.x - c.x, u.y - c.y), c, "catapult");
    for (const L of G.ladders) consider(Math.hypot(u.x - L.x, u.y - L.y), L, "ladder");
    for (const s of G.springs) consider(Math.hypot(u.x - s.x, u.y - s.y), s, "spring");
    for (const w of G.walls) {
      if (w.kind !== "door" || w.team !== u.team || w.hp >= w.max) continue;
      consider(distToRect(u.x, u.y, w).d, w, "repair");
    }
    if (!best) { float(u, "NOTHING TO USE", "#fff"); return; }
    if (best.kind === "sewer") {
      if (best.obj.hp > 0) { float(u, "BREAK THE COVER", "#fff"); return; }
      useSewer(u, best.obj);
    } else if (best.kind === "tower") {
      if (best.obj.owner !== u.team) { float(u, "NEUTRAL TOWER", "#fff"); return; }
      warpTo(u, best.obj.destX, best.obj.destY);
      float(u, "WARP", "#fff");
    } else if (best.kind === "catapult") {
      u.channel = { kind: "catapult", t: 0.7, cat: best.obj };
      float(u, "LOADING", "#ffe08a");
    } else if (best.kind === "ladder") {
      warpTo(u, best.obj.toX, best.obj.toY);
      float(u, "CLIMB", "#fff");
    } else if (best.kind === "spring") {
      u.flight = { t: 0, dur: 0.4, x0: u.x, y0: u.y, x1: best.obj.toX, y1: best.obj.toY, h: 0 };
      u.invuln = Math.max(u.invuln, 0.4);
    } else if (best.kind === "repair") {
      u.channel = { kind: "repair", t: 1.1, door: best.obj };
    }
  }

  function finishChannel(u) {
    const ch = u.channel;
    u.channel = null;
    if (!ch || u.dead) return;
    if (ch.kind === "repair" && ch.door) {
      ch.door.hp = Math.min(ch.door.max, ch.door.hp + 40);
      float(u, "REPAIR", "#ffe08a");
    } else if (ch.kind === "catapult" && ch.cat) {
      u.flight = { t: 0, dur: 0.55, x0: u.x, y0: u.y, x1: ch.cat.destX, y1: ch.cat.destY, h: 0 };
      u.invuln = Math.max(u.invuln, 0.55);
      sfx(220, 0.12, "square", 0.04);
    } else if (ch.kind === "mega") detonateMega(u, ch);
    else if (ch.kind === "saber") detonateSaber(u, ch);
  }

  function beginMegaChannel(u, predict) {
    const ang = u.facing;
    const dur = MEGA_TIME * (u.slowCast > 0 ? 2 : 1);
    u.recover = 0;
    u.flourish = null;
    u.perform = null;
    u.cast = null;
    u.attackWind = 0;
    u.hop = null;
    u.dash = null;
    u.clickTarget = null;
    u.wishX = 0;
    u.wishY = 0;
    u.channel = {
      kind: "mega",
      t: dur,
      dur,
      x: u.x + Math.cos(ang) * MEGA_AHEAD,
      y: u.y + Math.sin(ang) * MEGA_AHEAD,
      r: MEGA_RADIUS,
      predict: !!predict,
      started: performance.now()
    };
  }

  function detonateMega(u, ch) {
    const r = ch.r || MEGA_RADIUS;
    for (const o of G.units) {
      if (!o || o.dead) continue;
      if (Math.hypot(o.x - ch.x, o.y - ch.y) > r) continue;
      tryHit(o, 200, u, "#ff5a5a");
    }
    burst(ch.x, ch.y, "#ffb0a0", 28, 4.2);
    burst(ch.x, ch.y, "#fff2e8", 14, 2.4);
    G.shake = 1.35;
    G.megaFx = G.megaFx || [];
    G.megaFx.push({ x: ch.x, y: ch.y, t: 1.7, dur: 1.7, r });
    G.megaSeq = (G.megaSeq || 0) + 1;
    G.megaHeard = G.megaHeard || [];
    G.megaHeard.push({ id: G.megaSeq, x: ch.x, y: ch.y });
    if (G.megaHeard.length > 8) G.megaHeard.shift();
    playMegaBoom();
  }

  function beginSaberChannel(u, predict) {
    const dur = SABER_TIME * (u.slowCast > 0 ? 2 : 1);
    u.recover = 0;
    u.flourish = null;
    u.perform = null;
    u.cast = null;
    u.attackWind = 0;
    u.hop = null;
    u.dash = null;
    u.clickTarget = null;
    u.wishX = 0;
    u.wishY = 0;
    u.channel = {
      kind: "saber",
      t: dur,
      dur,
      x: u.x,
      y: u.y,
      ang: u.facing,
      len: SABER_LEN,
      w: SABER_W,
      predict: !!predict,
      started: performance.now()
    };
  }

  function inSaberLane(ch, o) {
    const ang = ch.ang || 0;
    const fx = Math.cos(ang);
    const fy = Math.sin(ang);
    const dx = o.x - ch.x;
    const dy = o.y - ch.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-fy * dx + fx * dy);
    const len = ch.len || SABER_LEN;
    const half = (ch.w || SABER_W) / 2;
    return along >= -1e-4 && along <= len + 1e-4 && side <= half + 1e-4;
  }

  function detonateSaber(u, ch) {
    for (const o of G.units) {
      if (!o || o.dead || o === u) continue;
      if (!inSaberLane(ch, o)) continue;
      tryHit(o, 75, u, "#ffe08a");
    }
    const fx = Math.cos(ch.ang || 0);
    const fy = Math.sin(ch.ang || 0);
    const len = ch.len || SABER_LEN;
    const hx = ch.x + fx * len * 0.5;
    const hy = ch.y + fy * len * 0.5;
    burst(hx, hy, "#ffe9a0", 22, 3.4);
    burst(hx, hy, "#fff8e4", 10, 1.8);
    G.shake = 1.15;
    G.saberFx = G.saberFx || [];
    G.saberFx.push({ x: ch.x, y: ch.y, ang: ch.ang || 0, len, w: ch.w || SABER_W, t: 0.9, dur: 0.9 });
    G.saberSeq = (G.saberSeq || 0) + 1;
    G.saberHeard = G.saberHeard || [];
    G.saberHeard.push({
      id: G.saberSeq, x: hx, y: hy,
      ox: ch.x, oy: ch.y, ang: ch.ang || 0, len, w: ch.w || SABER_W
    });
    if (G.saberHeard.length > 8) G.saberHeard.shift();
    playSaberBlast();
  }

  function tickMegaFx(dt) {
    if (G.megaFx) {
      for (const fx of G.megaFx) fx.t -= dt;
      G.megaFx = G.megaFx.filter((fx) => fx.t > 0);
    }
    if (G.saberFx) {
      for (const fx of G.saberFx) fx.t -= dt;
      G.saberFx = G.saberFx.filter((fx) => fx.t > 0);
    }
  }

  function hop(u) {
    if (!u || u.dead || u.dash || u.flight || u.hop || u.hopCd > 0 || u.shock > 0) return;
    if (u.cast && u.cast.root) return;
    if (rootLocked(u)) return;
    if (u.channel) u.channel = null;
    const dir = (u.wishX || u.wishY) ? Math.atan2(u.wishY, u.wishX) : u.facing;
    const dur = 0.26 * (1 - 0.005 * (u.stats.spd || 0));
    u.hop = { t: dur, dur, dir, dist: 1.25 };
    u.hopCd = 0.85 * (1 - 0.005 * (u.stats.spd || 0));
  }

  function endMatch(result) {
    if (G.phase !== "play") return;
    G.phase = "result";
    G.result = result;
    profile.matches = (profile.matches || 0) + 1;
    if (result.type === "win") {
      profile.coins += 2500;
      profile.diamonds += 100;
      profile.tokens += 1;
      profile.wins = (profile.wins || 0) + 1;
      sfx(523, 0.12, "square", 0.05);
      setTimeout(() => sfx(659, 0.14, "square", 0.05), 120);
    } else {
      profile.pendingDraw = true;
    }
    save();
    showResult();
  }

  function showResult() {
    const sheet = $("result-sheet");
    sheet.replaceChildren();
    const h = document.createElement("h2");
    const p = document.createElement("p");
    const res = G.result;
    if (res.type === "win") {
      const youWon = res.team === 0;
      h.textContent = youWon ? "Crimson wins" : "Azure wins";
      p.textContent = (youWon ? "You" : "Azure") + " held the enemy diamond in their Designated Vault for 10 seconds. Purse: +2,500 coins, +100 diamonds, +1 skill draw token.";
    } else {
      h.textContent = "Draw";
      p.textContent = "Five minutes passed with no vault hold. Choose a pool. One draw puts 5 cards, split at random, into that pool.";
    }
    sheet.append(h, p);
    const row = document.createElement("div");
    row.className = "row-btns";
    if (res.type === "draw") {
      const magic = document.createElement("button");
      magic.type = "button"; magic.className = "go"; magic.textContent = "Magic pool";
      const sword = document.createElement("button");
      sword.type = "button"; sword.className = "ghost"; sword.textContent = "Sword pool";
      const note = document.createElement("p");
      note.id = "draw-note";
      const claim = (pool) => {
        if (!profile.pendingDraw) return;
        profile.pendingDraw = false;
        const got = grantDraws(pool, 1);
        note.textContent = "Received " + formatGot(got) + ".";
        magic.disabled = true; sword.disabled = true;
      };
      magic.addEventListener("click", () => claim("magic"));
      sword.addEventListener("click", () => claim("sword"));
      row.append(magic, sword);
      sheet.append(row, note);
    }
    const again = document.createElement("button");
    again.type = "button"; again.className = "go"; again.textContent = "Rematch";
    again.addEventListener("click", () => openLoadout("bots"));
    const armory = document.createElement("button");
    armory.type = "button"; armory.className = "ghost"; armory.textContent = "Armory";
    armory.addEventListener("click", () => { showScreen("armory"); renderArmory(); });
    const row2 = document.createElement("div");
    row2.className = "row-btns";
    row2.append(again, armory);
    sheet.append(row2);
    $("result").classList.remove("hidden");
  }

  function float(u, text, color) { floatAt(u.x, u.y - 0.9, text, color); }
  function floatAt(x, y, text, color) {
    G.floats.push({ x, y, text: String(text), color: color || "#fff", t: 0.85 });
  }
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random());
      G.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.35 + Math.random() * 0.25, color, r: 0.08 + Math.random() * 0.16 });
    }
    if (G.fx.length > 240) G.fx.splice(0, G.fx.length - 240);
  }

  let audioCtx = null;
  function killSting() {
    try {
      unlockAudio();
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const notes = [
        { f: 146.8, dur: 0.18, type: "sawtooth", gain: 0.05 },
        { f: 220, dur: 0.16, type: "square", gain: 0.045 },
        { f: 349.2, dur: 0.2, type: "square", gain: 0.05 },
        { f: 440, dur: 0.28, type: "triangle", gain: 0.04 }
      ];
      notes.forEach((n, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const start = t + i * 0.075;
        o.type = n.type;
        o.frequency.setValueAtTime(n.f, start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(n.gain, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(start);
        o.stop(start + n.dur + 0.02);
      });
    } catch (err) { /* ignore */ }
  }

  function sfx(freq, dur, type, vol) {
    try {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (err) { /* ignore */ }
  }
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (err) { /* ignore */ }
  }

  function scheduleMegaBoom(ctx, when) {
    const t0 = when || 0;
    const pre = ctx.createGain();
    pre.gain.setValueAtTime(1, t0);
    const clip = ctx.createWaveShaper();
    const curveN = 2048;
    const curve = new Float32Array(curveN);
    const drive = 1.25;
    const norm = Math.tanh(drive);
    for (let i = 0; i < curveN; i++) {
      const x = (i / (curveN - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    clip.curve = curve;
    clip.oversample = "2x";
    const master = ctx.createGain();
    master.gain.setValueAtTime(1, t0);
    pre.connect(clip);
    clip.connect(master);
    master.connect(ctx.destination);

    function tone(type, f0, f1, peak, attack, hold, decay) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + hold + decay);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * 0.72), t0 + attack + hold);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + attack + hold + decay);
      osc.connect(gain);
      gain.connect(pre);
      osc.start(t0);
      osc.stop(t0 + attack + hold + decay + 0.05);
    }

    tone("sine", 50, 28, 0.62, 0.018, 0.22, 1.9);
    tone("triangle", 34, 22, 0.34, 0.02, 0.16, 1.35);
    tone("sawtooth", 186, 92, 0.46, 0.012, 0.34, 0.85);
    tone("triangle", 280, 150, 0.22, 0.01, 0.26, 0.5);

    const crackLen = Math.max(1, Math.floor(ctx.sampleRate * 0.62));
    const buffer = ctx.createBuffer(1, crackLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.09) * 0.982;
      const air = Math.random() * 2 - 1;
      data[i] = Math.max(-1, Math.min(1, brown * 1.6 + air * 0.85));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const rumble = ctx.createBiquadFilter();
    rumble.type = "lowpass";
    rumble.frequency.setValueAtTime(240, t0);
    rumble.frequency.exponentialRampToValueAtTime(70, t0 + 0.4);
    const rumbleG = ctx.createGain();
    rumbleG.gain.setValueAtTime(0.0001, t0);
    rumbleG.gain.exponentialRampToValueAtTime(0.48, t0 + 0.012);
    rumbleG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    const voice = ctx.createBiquadFilter();
    voice.type = "bandpass";
    voice.frequency.setValueAtTime(980, t0);
    voice.frequency.exponentialRampToValueAtTime(420, t0 + 0.28);
    voice.Q.setValueAtTime(0.7, t0);
    const voiceG = ctx.createGain();
    voiceG.gain.setValueAtTime(0.0001, t0);
    voiceG.gain.exponentialRampToValueAtTime(0.72, t0 + 0.008);
    voiceG.gain.exponentialRampToValueAtTime(0.5, t0 + 0.16);
    voiceG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    noise.connect(rumble);
    rumble.connect(rumbleG);
    rumbleG.connect(pre);
    noise.connect(voice);
    voice.connect(voiceG);
    voiceG.connect(pre);
    noise.start(t0);
    noise.stop(t0 + 0.62);

    const taps = [
      { delay: 0.22, gain: 0.42, cut: 1400 },
      { delay: 0.48, gain: 0.28, cut: 900 },
      { delay: 0.82, gain: 0.16, cut: 640 },
      { delay: 1.25, gain: 0.1, cut: 420 },
      { delay: 1.75, gain: 0.055, cut: 280 }
    ];
    for (const tap of taps) {
      const delay = ctx.createDelay(2.4);
      delay.delayTime.setValueAtTime(tap.delay, t0);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tap.cut, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(tap.gain, t0);
      master.connect(delay);
      delay.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
    }
  }

  function playMegaBoom() {
    try {
      unlockAudio();
      if (!audioCtx) return;
      scheduleMegaBoom(audioCtx, audioCtx.currentTime + 0.012);
      G.booms = (G.booms || 0) + 1;
    } catch (err) { /* ignore */ }
  }

  function scheduleSaberBlast(ctx, when) {
    const t0 = when || 0;
    const pre = ctx.createGain();
    pre.gain.setValueAtTime(1, t0);
    const clip = ctx.createWaveShaper();
    const curveN = 2048;
    const curve = new Float32Array(curveN);
    const drive = 1.25;
    const norm = Math.tanh(drive);
    for (let i = 0; i < curveN; i++) {
      const x = (i / (curveN - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    clip.curve = curve;
    clip.oversample = "2x";
    const master = ctx.createGain();
    master.gain.setValueAtTime(1, t0);
    pre.connect(clip);
    clip.connect(master);
    master.connect(ctx.destination);

    function tone(type, f0, f1, peak, attack, hold, decay) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, f0), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + hold + decay);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * 0.72), t0 + attack + hold);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + attack + hold + decay);
      osc.connect(gain);
      gain.connect(pre);
      osc.start(t0);
      osc.stop(t0 + attack + hold + decay + 0.05);
    }

    tone("sine", 72, 40, 0.7, 0.006, 0.1, 0.48);
    tone("triangle", 46, 30, 0.32, 0.008, 0.08, 0.36);
    tone("sawtooth", 168, 96, 0.44, 0.004, 0.28, 0.32);
    tone("triangle", 320, 180, 0.2, 0.004, 0.18, 0.22);

    const crackLen = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, crackLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.11) * 0.97;
      const air = Math.random() * 2 - 1;
      data[i] = Math.max(-1, Math.min(1, brown * 1.4 + air * 0.9));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const thump = ctx.createBiquadFilter();
    thump.type = "lowpass";
    thump.frequency.setValueAtTime(180, t0);
    thump.frequency.exponentialRampToValueAtTime(60, t0 + 0.2);
    const thumpG = ctx.createGain();
    thumpG.gain.setValueAtTime(0.0001, t0);
    thumpG.gain.exponentialRampToValueAtTime(0.55, t0 + 0.006);
    thumpG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    const punch = ctx.createBiquadFilter();
    punch.type = "bandpass";
    punch.frequency.setValueAtTime(740, t0);
    punch.frequency.exponentialRampToValueAtTime(420, t0 + 0.24);
    punch.Q.setValueAtTime(0.85, t0);
    const punchG = ctx.createGain();
    punchG.gain.setValueAtTime(0.0001, t0);
    punchG.gain.exponentialRampToValueAtTime(0.8, t0 + 0.005);
    punchG.gain.exponentialRampToValueAtTime(0.62, t0 + 0.26);
    punchG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.46);
    noise.connect(thump);
    thump.connect(thumpG);
    thumpG.connect(pre);
    noise.connect(punch);
    punch.connect(punchG);
    punchG.connect(pre);
    noise.start(t0);
    noise.stop(t0 + 0.5);

    const taps = [
      { delay: 0.14, gain: 0.38, cut: 1600 },
      { delay: 0.31, gain: 0.22, cut: 1000 },
      { delay: 0.55, gain: 0.12, cut: 640 }
    ];
    for (const tap of taps) {
      const delay = ctx.createDelay(1.2);
      delay.delayTime.setValueAtTime(tap.delay, t0);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tap.cut, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(tap.gain, t0);
      master.connect(delay);
      delay.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
    }
  }

  function playSaberBlast() {
    try {
      unlockAudio();
      if (!audioCtx) return;
      scheduleSaberBlast(audioCtx, audioCtx.currentTime + 0.012);
      G.blasts = (G.blasts || 0) + 1;
    } catch (err) { /* ignore */ }
  }

  function teamColor(team, alt) {
    if (team === 0) return alt ? "#ff8aa8" : "#ff3d62";
    return alt ? "#9fd0ff" : "#2f86f0";
  }

  function draw() {
    resizeIfNeeded();
    const dpr = G.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, G.viewW, G.viewH);
    G.zoom = G.viewH / 18;
    const shakeX = (Math.random() - 0.5) * G.shake * 8;
    const shakeY = (Math.random() - 0.5) * G.shake * 8;
    ctx.save();
    ctx.translate(G.viewW / 2 + shakeX, G.viewH / 2 + shakeY);
    ctx.scale(G.zoom, G.zoom);
    ctx.translate(-G.camX, -G.camY);
    drawWorld();
    ctx.restore();
    drawMinimap();
    syncHud();
  }

  function resizeIfNeeded() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(240, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    G.viewW = w; G.viewH = h; G.dpr = dpr;
  }

  function drawWorld() {
    ctx.fillStyle = "#3ec96a";
    ctx.fillRect(-20, -20, MAP.w + 40, MAP.h + 40);
    for (let y = 0; y < MAP.h; y += 2) {
      for (let x = 0; x < MAP.w; x += 2) {
        const n = hash(x, y);
        if (n > 0.72) {
          ctx.fillStyle = n > 0.86 ? "#66de86" : "#2eae55";
          ctx.beginPath();
          ctx.ellipse(x, y, 0.7, 0.35, n * 3, 0, 7);
          ctx.fill();
        }
      }
    }
    drawMountains();
    drawOldSpace(drawPaths);
    drawLake();
    drawOldSpace(() => {
      drawCastleFloor(8, 29, 31, 44, 0);
      drawCastleFloor(137, 29, 30, 44, 1);
    });
    for (const w of G.walls) drawWall(w);
    drawOldSpace(drawKeepDressing);
    drawProps();
    for (const t of G.trees) drawTree(t);
    for (const rk of G.rocks) if (rk.hp > 0) drawRock(rk);
    drawFires();
    drawSaberMarks();
    for (const d of G.diamonds) if (!d.carrier && !d.inFlight) drawDiamond(d.x, d.y, d.team, 0.55);
    for (const s of G.shots) drawShot(s);
    const clones = [];
    for (const u of G.units) for (const c of u.clones) if (c.alive) clones.push(c);
    const sprites = [...G.units.filter((u) => !u.dead), ...clones];
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) {
      if (s.owner) drawClone(s);
      else drawUnit(s);
    }
    drawMegaMarks();
    drawSaberBlades();
    for (const u of G.units) if (u.dead) drawDead(u);
    for (const f of G.fx) {
      ctx.globalAlpha = Math.max(0, f.t * 2);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawOldSpace(drawLabels);
    for (const f of G.floats) {
      ctx.globalAlpha = clamp(f.t, 0, 1);
      label(f.text, f.x, f.y, 0.42, f.color);
      ctx.globalAlpha = 1;
    }
    if (G.player && G.mouse.valid && !G.player.dead) {
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(G.mouse.wx, G.mouse.wy, 0.28, 0, 7);
      ctx.stroke();
    }
    for (const d of G.diamonds) {
      if (d.bank > 0) {
        const v = G.vaults[d.carrier.team];
        label(d.bank.toFixed(1), v.x, v.y - 1.3, 0.9, "#1b1428");
      }
    }
  }

  function hash(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function drawOldSpace(fn) {
    ctx.save();
    ctx.scale(0.5, 0.5);
    fn();
    ctx.restore();
  }

  function drawMountains() {
    ctx.fillStyle = "#8d78c4";
    for (let x = 0; x < MAP.w; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x + 2, 0.6);
      ctx.lineTo(x + 4, 4);
      ctx.fill();
    }
    ctx.fillStyle = "#f2d7a2";
    ctx.fillRect(0, 47, MAP.w, 4);
    ctx.fillStyle = "#67b7ea";
    ctx.fillRect(0, 48.75, MAP.w, 1.5);
  }

  function drawPaths() {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const road = (width, build) => {
      ctx.beginPath();
      build();
      ctx.strokeStyle = "#e6c27a";
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.strokeStyle = "#c8944a";
      ctx.lineWidth = 0.28;
      ctx.stroke();
    };
    road(5.2, () => {
      ctx.moveTo(42, 51); ctx.lineTo(64, 51); ctx.lineTo(64, 22); ctx.lineTo(126, 22); ctx.lineTo(126, 51); ctx.lineTo(134, 51);
      ctx.moveTo(64, 51); ctx.lineTo(64, 86); ctx.lineTo(126, 86); ctx.lineTo(126, 51);
    });
    road(2.6, () => {
      ctx.moveTo(64, 51); ctx.lineTo(76, 50); ctx.lineTo(100, 50); ctx.lineTo(126, 51);
    });
  }

  function tracePoly(poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  function drawBridge(b) {
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#c9a06a";
    ctx.fillRect(b.x + 0.12, b.y + 0.12, b.w - 0.24, b.h - 0.24);
    ctx.strokeStyle = "#6a4224";
    ctx.lineWidth = 0.07;
    ctx.fillStyle = "#5c3a1e";
    if (b.h > b.w) {
      for (let i = 1; i < 5; i++) {
        const y = b.y + (b.h * i) / 5;
        ctx.beginPath();
        ctx.moveTo(b.x + 0.28, y);
        ctx.lineTo(b.x + b.w - 0.28, y);
        ctx.stroke();
      }
      ctx.fillRect(b.x, b.y, 0.22, b.h);
      ctx.fillRect(b.x + b.w - 0.22, b.y, 0.22, b.h);
    } else {
      for (let i = 1; i < 5; i++) {
        const x = b.x + (b.w * i) / 5;
        ctx.beginPath();
        ctx.moveTo(x, b.y + 0.28);
        ctx.lineTo(x, b.y + b.h - 0.28);
        ctx.stroke();
      }
      ctx.fillRect(b.x, b.y, b.w, 0.22);
      ctx.fillRect(b.x, b.y + b.h - 0.22, b.w, 0.22);
    }
  }

  function traceMoat() {
    const poly = G.moat && G.moat.poly;
    if (!poly || !poly.length) return;
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  function traceIsle(isle) {
    if (isle.poly) {
      ctx.moveTo(isle.poly[0].x, isle.poly[0].y);
      for (let i = 1; i < isle.poly.length; i++) ctx.lineTo(isle.poly[i].x, isle.poly[i].y);
      ctx.closePath();
    } else {
      ctx.moveTo(isle.x + isle.r, isle.y);
      ctx.arc(isle.x, isle.y, isle.r, 0, Math.PI * 2);
    }
  }

  function drawLake() {
    ctx.fillStyle = "#1f6ec4";
    for (const poly of G.rivers) {
      tracePoly(poly);
      ctx.fill();
    }
    if (G.moat) {
      ctx.beginPath();
      traceMoat();
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    for (const poly of G.rivers) {
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
    }
    if (G.moat) traceMoat();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.38)";
    ctx.lineWidth = 0.18;
    const drift = (G.time * 0.7) % 2;
    for (let y = -3; y < MAP.h + 4; y += 1.6) {
      ctx.beginPath();
      ctx.moveTo(-2, y + drift);
      ctx.bezierCurveTo(MAP.w * 0.25, y - 0.35 + drift, MAP.w * 0.75, y + 0.4 + drift, MAP.w + 2, y + drift);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#8fd4ff";
    ctx.lineWidth = 0.35;
    for (const poly of G.rivers) {
      tracePoly(poly);
      ctx.stroke();
    }
    if (G.moat && G.moat.poly) {
      tracePoly(G.moat.poly);
      ctx.stroke();
    }
    for (const isle of G.isles) {
      ctx.fillStyle = "#8d5a32";
      ctx.beginPath();
      traceIsle(isle);
      ctx.fill();
      ctx.fillStyle = "#67d36a";
      ctx.beginPath();
      if (isle.poly) {
        const c = { x: isle.x, y: isle.y };
        ctx.moveTo(c.x + (isle.poly[0].x - c.x) * 0.62, c.y + (isle.poly[0].y - c.y) * 0.62);
        for (let i = 1; i < isle.poly.length; i++) {
          ctx.lineTo(c.x + (isle.poly[i].x - c.x) * 0.62, c.y + (isle.poly[i].y - c.y) * 0.62);
        }
        ctx.closePath();
      } else {
        ctx.arc(isle.x, isle.y, isle.r * 0.72, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.strokeStyle = "#d8ecff";
      ctx.lineWidth = 0.16;
      ctx.beginPath();
      traceIsle(isle);
      ctx.stroke();
    }
    for (const b of G.bridges) drawBridge(b);
    for (const k of G.keeps || []) drawKeep(k);
    for (const cake of G.cakes) {
      if (cake.t > 0) continue;
      ctx.fillStyle = "#fff";
      ctx.fillRect(cake.x - 0.35, cake.y - 0.25, 0.7, 0.5);
      ctx.fillStyle = "#ff7ab0";
      ctx.fillRect(cake.x - 0.35, cake.y - 0.45, 0.7, 0.22);
    }
  }

  function drawCastleFloor(x, y, w, h, team) {
    ctx.fillStyle = "rgba(28, 16, 8, .34)";
    roundRect(x - 3.2, y + 2.2, w + 8.4, h + 6.2, 2.4);
    ctx.fill();
    ctx.fillStyle = "rgba(28, 16, 8, .2)";
    roundRect(x - 1.4, y + 4.4, w + 6.2, h + 5.4, 2);
    ctx.fill();
    ctx.fillStyle = "#e7d3ae";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(92, 66, 38, .28)";
    ctx.lineWidth = 0.06;
    for (let iy = 1.4; iy < h - 1; iy += 6.6) {
      for (let ix = 1.2; ix < w - 1; ix += 7.4) {
        const n = hash(Math.floor(x + ix) + 4, Math.floor(y + iy) + 11);
        roundRect(x + ix, y + iy, 2.1 + n * 1.6, 1.5 + n * 0.8, 0.22);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(62, 42, 22, .2)";
    ctx.fillRect(x, y, w, 2.05);
    ctx.fillRect(x, y, 1.55, h);
    ctx.fillRect(x + w - 1.45, y, 1.45, h);
    ctx.fillStyle = team === 0 ? "rgba(176, 32, 58, .9)" : "rgba(32, 96, 190, .9)";
    if (team === 0) ctx.fillRect(x + w * 0.52, y + h * 0.46, w * 0.5, 1.55);
    else ctx.fillRect(x - 0.2, y + h * 0.46, w * 0.5, 1.55);
    const spine = team === 0 ? 20 : 156;
    ctx.fillRect(spine - 0.78, y + 11, 1.56, 18);
    ctx.fillStyle = "#f0d48a";
    ctx.fillRect((team === 0 ? x + w * 0.52 : x - 0.2), y + h * 0.46, 0.12, 1.55);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawProps() {
    G.vaults.forEach((v, team) => {
      ctx.fillStyle = "rgba(255, 206, 90, .16)";
      ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(231, 178, 58, .9)";
      ctx.lineWidth = 0.14;
      ctx.stroke();
      ctx.fillStyle = "rgba(32, 20, 10, .32)";
      ctx.beginPath(); ctx.ellipse(v.x + 0.4, v.y + 1.85, 2.9, 1.25, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#5a3c24";
      ctx.beginPath(); ctx.ellipse(v.x + 0.12, v.y + 1.35, 2.65, 1.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#cbb892";
      ctx.beginPath(); ctx.ellipse(v.x, v.y + 0.62, 2.4, 1.28, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#8a6230";
      ctx.lineWidth = 0.08;
      ctx.stroke();
      ctx.fillStyle = "#4a3018";
      ctx.beginPath(); ctx.ellipse(v.x + 0.1, v.y + 0.85, 1.9, 1.08, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#f6ecda";
      ctx.beginPath(); ctx.ellipse(v.x, v.y + 0.12, 1.72, 0.96, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#e0b04a";
      ctx.lineWidth = 0.12;
      ctx.stroke();
      const cx = v.x;
      const cy = v.y + 0.48;
      ctx.fillStyle = "#3a2414";
      ctx.fillRect(cx - 0.64, cy + 0.18, 1.28, 0.95);
      ctx.fillStyle = "#8a5a28";
      ctx.fillRect(cx - 0.54, cy + 0.28, 1.08, 0.75);
      ctx.fillStyle = "#e1b34a";
      ctx.fillRect(cx - 0.7, cy - 0.02, 1.4, 0.34);
      ctx.fillStyle = "#f8e2a4";
      ctx.fillRect(cx - 0.7, cy - 0.34, 1.4, 0.34);
      ctx.fillStyle = teamColor(team);
      ctx.fillRect(cx - 0.12, cy + 0.06, 0.24, 0.32);
      ctx.strokeStyle = "#6b4a1e";
      ctx.lineWidth = 0.05;
      ctx.strokeRect(cx - 0.7, cy - 0.34, 1.4, 0.34);
    });
    for (const d of G.diamonds) {
      ctx.fillStyle = "rgba(40,28,12,.2)";
      ctx.beginPath(); ctx.ellipse(d.homeX + 0.15, d.homeY + 0.45, 1.55, 0.75, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#b89a68";
      ctx.beginPath(); ctx.ellipse(d.homeX, d.homeY + 0.2, 1.4, 0.85, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#f4e7c8";
      ctx.beginPath(); ctx.ellipse(d.homeX, d.homeY - 0.12, 1.18, 0.68, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = teamColor(d.team);
      ctx.lineWidth = 0.1;
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const px = d.homeX + Math.cos(a) * 1.05;
        const py = d.homeY + Math.sin(a) * 0.72;
        ctx.fillStyle = "#6e5432";
        ctx.fillRect(px - 0.1, py - 0.02, 0.22, 0.42);
        ctx.fillStyle = "#f1e2c4";
        ctx.fillRect(px - 0.1, py - 0.28, 0.22, 0.28);
      }
    }
    for (const s of G.sewers) {
      ctx.fillStyle = s.hp > 0 ? "#6b4a2a" : "#243044";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      if (s.hp > 0) {
        ctx.strokeStyle = "#e6c9a0";
        ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.moveTo(s.x - 0.7, s.y); ctx.lineTo(s.x + 0.7, s.y); ctx.stroke();
      }
    }
    for (const c of G.catapults) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(-0.8, -0.35, 1.6, 0.7);
      ctx.strokeStyle = "#3a2414";
      ctx.lineWidth = 0.1;
      ctx.beginPath(); ctx.moveTo(-0.2, 0); ctx.lineTo(0.9, -0.8); ctx.stroke();
      ctx.restore();
    }
    for (const L of G.ladders) {
      ctx.strokeStyle = "#d7b072";
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(L.x - 0.3, L.y); ctx.lineTo(L.toX - 0.3, L.toY);
      ctx.moveTo(L.x + 0.3, L.y); ctx.lineTo(L.toX + 0.3, L.toY);
      ctx.stroke();
    }
    for (const s of G.springs) {
      ctx.fillStyle = "#67e08a";
      ctx.beginPath(); ctx.arc(s.x, s.y, 0.7, 0, 7); ctx.fill();
      ctx.strokeStyle = "#14532d";
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }
    for (const t of [...G.towers, G.outpost]) drawTower(t);
  }

  function drawTower(t) {
    ctx.fillStyle = "#e7d3a4";
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#8a6230";
    ctx.lineWidth = 0.12;
    ctx.stroke();
    const col = t.owner === null ? "#d9d3c7" : teamColor(t.owner);
    ctx.fillStyle = col;
    ctx.fillRect(t.x - 0.12, t.y - t.r - 1.4, 0.24, 1.5);
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - t.r - 1.4);
    ctx.lineTo(t.x + 1.1, t.y - t.r - 0.9);
    ctx.lineTo(t.x, t.y - t.r - 0.5);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * t.progress);
    ctx.stroke();
  }

  function drawTree(t) {
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 0.3, t.r * 0.7, 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#1f8a3a";
    ctx.beginPath(); ctx.arc(t.x, t.y - 0.2, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = "#46c85d";
    ctx.beginPath(); ctx.arc(t.x - 0.3, t.y - 0.5, t.r * 0.45, 0, 7); ctx.fill();
  }

  function drawRock(rk) {
    ctx.fillStyle = "#8d877c";
    ctx.beginPath(); ctx.arc(rk.x, rk.y, rk.r, 0, 7); ctx.fill();
    ctx.fillStyle = "#b7b1a6";
    ctx.beginPath(); ctx.arc(rk.x - 0.6, rk.y - 0.5, rk.r * 0.35, 0, 7); ctx.fill();
  }

  function drawWall(w) {
    if (w.kind === "door") {
      drawGateLeaf(w);
      return;
    }
    drawStoneCourse(w.x, w.y, w.w, w.h, wallOuter(w));
  }

  function drawMerlon(x, y, w, h) {
    ctx.fillStyle = "#5a3c24";
    ctx.fillRect(x, y + h * 0.4, w, h);
    ctx.fillStyle = "#f7edd8";
    ctx.fillRect(x, y, w, h * 0.58);
    ctx.fillStyle = "#6a4e30";
    ctx.fillRect(x + w - 0.08, y, 0.08, h * 0.58);
  }

  function drawStoneCourse(x, y, w, h, outer) {
    const team = x + w / 2 < MAP.w / 2 ? 0 : 1;
    const drop = w > h ? 1.85 : 1.6;
    ctx.fillStyle = "rgba(32, 20, 10, .34)";
    if (outer === "e") roundRect(x + 0.15, y + 0.65, w + drop + 0.5, h + 1.6, 0.4);
    else if (outer === "w") roundRect(x - drop - 0.35, y + 0.65, w + drop + 0.55, h + 1.6, 0.4);
    else roundRect(x - 0.25, y + 0.35, w + 0.9, h + drop + 1.2, 0.4);
    ctx.fill();

    ctx.fillStyle = "#4a301c";
    if (outer === "e") ctx.fillRect(x + w, y, drop, h);
    else if (outer === "w") ctx.fillRect(x - drop, y, drop, h);
    else ctx.fillRect(x, y + h, w, drop);
    ctx.fillStyle = "#8d6a44";
    if (outer === "e") ctx.fillRect(x + w, y, drop * 0.4, h);
    else if (outer === "w") ctx.fillRect(x - drop * 0.4, y, drop * 0.4, h);
    else ctx.fillRect(x, y + h, w, drop * 0.36);
    ctx.fillStyle = "#ead7b4";
    if (outer === "e") ctx.fillRect(x + w, y, 0.16, h);
    else if (outer === "w") ctx.fillRect(x - 0.16, y, 0.16, h);
    else ctx.fillRect(x, y + h, w, 0.16);

    ctx.strokeStyle = "rgba(48, 30, 16, .55)";
    ctx.lineWidth = 0.045;
    if (outer === "e" || outer === "w") {
      const fx = outer === "e" ? x + w : x - drop;
      for (let yy = y + 0.7; yy < y + h - 0.08; yy += 0.76) {
        ctx.beginPath(); ctx.moveTo(fx + 0.04, yy); ctx.lineTo(fx + drop - 0.04, yy); ctx.stroke();
      }
      for (let xx = fx + 1.1; xx < fx + drop - 0.1; xx += 1.5) {
        ctx.beginPath(); ctx.moveTo(xx, y + 0.06); ctx.lineTo(xx, y + h - 0.06); ctx.stroke();
      }
    } else {
      const fy = y + h;
      for (let yy = fy + 0.62; yy < fy + drop - 0.06; yy += 0.76) {
        ctx.beginPath(); ctx.moveTo(x + 0.06, yy); ctx.lineTo(x + w - 0.06, yy); ctx.stroke();
      }
      let stagger = 0;
      for (let yy = fy + 0.08; yy < fy + drop; yy += 0.76) {
        stagger = stagger ? 0 : 0.75;
        for (let xx = x + 0.35 + stagger; xx < x + w; xx += 1.7) {
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(fy + drop - 0.04, yy + 0.76)); ctx.stroke();
        }
      }
    }

    ctx.fillStyle = "#f4e6cc";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fff8ec";
    if (w > h) ctx.fillRect(x, y, w, 0.28);
    else ctx.fillRect(x, y, 0.22, h);
    ctx.fillStyle = "#a88858";
    if (w > h) ctx.fillRect(x, y + h - 0.2, w, 0.2);
    else ctx.fillRect(x + w - 0.2, y, 0.2, h);
    ctx.strokeStyle = "rgba(74, 48, 24, .4)";
    ctx.lineWidth = 0.04;
    if (w > h) {
      for (let yy = y + 0.52; yy < y + h - 0.08; yy += 0.68) {
        ctx.beginPath(); ctx.moveTo(x + 0.08, yy); ctx.lineTo(x + w - 0.08, yy); ctx.stroke();
      }
    } else {
      for (let xx = x + 0.52; xx < x + w - 0.08; xx += 0.68) {
        ctx.beginPath(); ctx.moveTo(xx, y + 0.08); ctx.lineTo(xx, y + h - 0.08); ctx.stroke();
      }
    }

    const step = 2.05;
    if (outer === "n") {
      for (let mx = x + 0.28; mx < x + w - 0.8; mx += step) drawMerlon(mx, y - 0.7, 0.98, 0.78);
    } else if (outer === "s") {
      for (let mx = x + 0.28; mx < x + w - 0.8; mx += step) drawMerlon(mx, y + h - 0.22, 0.98, 0.78);
    } else if (outer === "w") {
      for (let my = y + 0.35; my < y + h - 0.8; my += step) drawMerlon(x - 0.62, my, 0.68, 0.95);
    } else {
      for (let my = y + 0.35; my < y + h - 0.8; my += step) drawMerlon(x + w - 0.06, my, 0.68, 0.95);
    }
    ctx.fillStyle = team === 0 ? "rgba(176, 28, 52, .96)" : "rgba(28, 96, 196, .96)";
    if (w > h) ctx.fillRect(x + 0.28, y + h * 0.4, w - 0.56, 0.24);
    else ctx.fillRect(x + w * 0.34, y + 0.28, 0.24, h - 0.56);
    ctx.strokeStyle = "#5c4328";
    ctx.lineWidth = 0.09;
    ctx.strokeRect(x, y, w, h);
  }

  function wallOuter(w) {
    if (w.w > w.h) return w.y < MAP.h / 2 ? "n" : "s";
    const mid = MAP.w / 2;
    if (w.x + w.w / 2 < mid) return w.x < mid * 0.25 ? "w" : "e";
    return w.x > mid * 1.7 ? "e" : "w";
  }

  function drawGateLeaf(w) {
    const fieldEast = w.x < MAP.w / 2;
    ctx.fillStyle = "#5c4332";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = "#120e0a";
    ctx.fillRect(w.x + 0.22, w.y + 0.5, w.w - 0.44, w.h - 1);
    ctx.strokeStyle = "rgba(232, 196, 140, .2)";
    ctx.lineWidth = 0.05;
    for (let i = 1; i <= 4; i++) {
      const xx = w.x + (w.w * i) / 5;
      ctx.beginPath();
      ctx.moveTo(xx, w.y + 0.6);
      ctx.lineTo(xx, w.y + w.h - 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = "#e4d2b0";
    ctx.fillRect(w.x - 0.06, w.y, w.w + 0.12, 0.58);
    ctx.fillRect(w.x - 0.06, w.y + w.h - 0.58, w.w + 0.12, 0.58);
    ctx.fillStyle = "#5e4128";
    ctx.fillRect(w.x - 0.06, w.y + 0.58, w.w + 0.12, 0.9);
    ctx.fillRect(w.x - 0.06, w.y + w.h, w.w + 0.12, 1.05);
    const mouth = fieldEast ? w.x + w.w - 0.12 : w.x + 0.12;
    ctx.fillStyle = "rgba(16, 10, 6, .3)";
    ctx.beginPath();
    ctx.ellipse(fieldEast ? mouth + 1.35 : mouth - 1.35, w.y + w.h / 2 + 0.85, 1.55, w.h * 0.3, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#0c0907";
    ctx.beginPath();
    ctx.ellipse(mouth, w.y + w.h / 2, 1.28, w.h * 0.4, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#f4e7cb";
    ctx.lineWidth = 0.36;
    ctx.beginPath();
    ctx.ellipse(mouth, w.y + w.h / 2, 1.2, w.h * 0.38, 0, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = "#7a5a38";
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.ellipse(mouth, w.y + w.h / 2, 1.42, w.h * 0.44, 0, 0, 7);
    ctx.stroke();
    if (w.hp <= 0) {
      ctx.fillStyle = "#c4a67a";
      ctx.fillRect(w.x + 0.45, w.y + w.h * 0.36, 1.45, 0.4);
      ctx.fillRect(w.x + 1.05, w.y + w.h * 0.64, 1.15, 0.32);
      return;
    }
    const dx = fieldEast ? w.x + 0.2 : w.x + w.w - 1.4;
    const dy = w.y + 1.05;
    const dw = 1.18;
    const dh = w.h - 2.1;
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.fillRect(dx + (fieldEast ? 0.5 : -0.28), dy + 0.12, dw, dh);
    ctx.fillStyle = "#6a3818";
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = "#e09048";
    ctx.fillRect(dx + 0.08, dy + 0.1, dw - 0.16, dh - 0.16);
    ctx.strokeStyle = "#4a2c12";
    ctx.lineWidth = 0.055;
    for (let i = 1; i <= 4; i++) {
      const yy = dy + (dh * i) / 5;
      ctx.beginPath(); ctx.moveTo(dx + 0.1, yy); ctx.lineTo(dx + dw - 0.1, yy); ctx.stroke();
    }
    ctx.strokeStyle = "#2a3036";
    ctx.lineWidth = 0.09;
    ctx.strokeRect(dx + 0.16, dy + dh * 0.18, dw - 0.32, dh * 0.62);
    ctx.fillStyle = teamColor(w.team);
    ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh * 0.5, 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = "#f0d48a";
    ctx.lineWidth = 0.06;
    ctx.stroke();
    ctx.fillStyle = "#ffe7a4";
    ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh * 0.5, 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = "#f6e7c8";
    ctx.fillRect(dx, dy, dw, 0.14);
    if (w.hp < w.max) {
      ctx.fillStyle = "#1b1428";
      ctx.fillRect(w.x, w.y - 0.5, w.w, 0.2);
      ctx.fillStyle = "#67d36a";
      ctx.fillRect(w.x, w.y - 0.5, w.w * (w.hp / w.max), 0.2);
    }
  }

  function drawKeepDressing() {
    const towers = [
      [6, 26, 0], [42, 26, 0], [6, 76, 0], [42, 76, 0],
      [134, 26, 1], [170, 26, 1], [134, 76, 1], [170, 76, 1]
    ];
    for (const [x, y, team] of towers) drawDrumTower(x, y, team);
    drawPier(43.2, 43.3, 0);
    drawPier(43.2, 58.6, 0);
    drawPier(132.8, 43.3, 1);
    drawPier(132.8, 58.6, 1);
    drawGateHeader(39, 44, 0, true);
    drawGateHeader(134, 44, 1, false);
    drawBanner(15, 33.5, 0);
    drawBanner(27, 33.5, 0);
    drawBanner(149, 33.5, 1);
    drawBanner(161, 33.5, 1);
    drawClump(11.2, 35, 0);
    drawClump(11.2, 67.5, 0);
    drawClump(34.2, 35.2, 0);
    drawClump(34.2, 67.2, 0);
    drawClump(3.4, 50, 0);
    drawClump(47.2, 36, 0);
    drawClump(47.2, 66, 0);
    drawClump(141.2, 35, 1);
    drawClump(141.2, 67.5, 1);
    drawClump(163.4, 35.2, 1);
    drawClump(163.4, 67.2, 1);
    drawClump(128.6, 50, 1);
    drawClump(173.2, 36, 1);
    drawClump(173.2, 66, 1);
    drawStonePile(30.5, 44);
    drawStonePile(145.5, 44);
    drawCourtyard(0, 8);
    drawCourtyard(1, 137);
  }

  function drawCourtyard(team, ox) {
    const cloth = team === 0 ? "#9d1838" : "#1a4e9a";
    const light = team === 0 ? "#ff7b93" : "#9fd0ff";
    const wood = team === 0 ? "#6a3b24" : "#3c4e66";
    const X = (lx) => ox + lx;
    ctx.save();
    ctx.strokeStyle = team === 0 ? "rgba(122, 36, 48, .7)" : "rgba(28, 70, 140, .72)";
    ctx.lineWidth = 0.14;
    ctx.strokeRect(X(2.3), 32.1, 24.6, 39.2);
    ctx.strokeStyle = team === 0 ? "rgba(240, 206, 140, .8)" : "rgba(214, 230, 248, .85)";
    ctx.lineWidth = 0.045;
    ctx.strokeRect(X(2.7), 32.5, 23.8, 38.4);
    ctx.strokeStyle = cloth;
    ctx.lineWidth = 0.06;
    for (let i = 0; i < 4; i++) {
      const y = 34 + i * 9.2;
      ctx.beginPath();
      ctx.moveTo(X(2.3), y);
      ctx.lineTo(X(3.5), y);
      ctx.moveTo(X(25.7), y);
      ctx.lineTo(X(26.9), y);
      ctx.stroke();
    }
    drawGarden(X(3.3), 42.6, team);
    drawGarden(X(21.6), 42.6, team);
    drawGarden(X(3.3), 55.4, team);
    drawGarden(X(21.6), 55.4, team);
    drawFinial(X(3.1), 42.2, team);
    drawFinial(X(26.4), 42.2, team);
    drawFinial(X(3.1), 59.2, team);
    drawFinial(X(26.4), 59.2, team);
    drawPlanter(X(5.4), 44.4, team);
    drawPlanter(X(23.6), 44.6, team);
    drawPlanter(X(5.2), 57.4, team);
    drawPlanter(X(23.8), 57.2, team);
    drawStandard(X(4.4), 47.2, team, cloth, light);
    drawStandard(X(4.4), 56.2, team, cloth, light);
    drawStandard(X(24.6), 47.4, team, cloth, light);
    drawStandard(X(24.6), 56.4, team, cloth, light);
    drawFenceRun(X(8.2), X(12.4), 44.1, wood, light);
    drawFenceRun(X(16.4), X(20.6), 44.1, wood, light);
    drawFenceRun(X(8.4), X(12.2), 57.6, wood, light);
    drawFenceRun(X(16.6), X(20.8), 57.6, wood, light);
    drawBed(X(6.2), 50.6, 2.4, team);
    drawBed(X(20.2), 46.4, 2.6, team);
    drawInlay(X(19.4), 47.6, team, cloth, light);
    ctx.restore();
  }

  function drawGarden(x, y, team) {
    ctx.fillStyle = team === 0 ? "rgba(120, 32, 48, .28)" : "rgba(24, 64, 130, .28)";
    roundRect(x, y, 3.4, 2.15, 0.2);
    ctx.fill();
    ctx.strokeStyle = team === 0 ? "rgba(240, 206, 140, .55)" : "rgba(210, 228, 246, .6)";
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.fillStyle = "#237a38";
    ctx.fillRect(x + 0.18, y + 0.35, 3.05, 1.45);
  }

  function drawFinial(x, y, team) {
    ctx.fillStyle = "rgba(30,20,10,.22)";
    ctx.beginPath(); ctx.ellipse(x + 0.08, y + 0.28, 0.38, 0.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e7d4b0";
    ctx.fillRect(x - 0.16, y - 0.72, 0.32, 0.9);
    ctx.fillStyle = "#f7efe0";
    ctx.fillRect(x - 0.22, y - 0.8, 0.44, 0.12);
    ctx.fillStyle = team === 0 ? "#9d1838" : "#1a4e9a";
    ctx.beginPath();
    ctx.moveTo(x - 0.24, y - 0.72);
    ctx.lineTo(x, y - 1.2);
    ctx.lineTo(x + 0.24, y - 0.72);
    ctx.fill();
  }

  function drawPlanter(x, y, team) {
    ctx.fillStyle = "rgba(30,20,10,.25)";
    ctx.beginPath(); ctx.ellipse(x + 0.08, y + 0.42, 0.72, 0.28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8d6a42";
    ctx.fillRect(x - 0.58, y - 0.02, 1.16, 0.42);
    ctx.fillStyle = "#d8c09a";
    ctx.fillRect(x - 0.58, y - 0.12, 1.16, 0.12);
    ctx.fillStyle = "#1c7a34";
    ctx.beginPath(); ctx.arc(x - 0.22, y - 0.28, 0.28, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 0.24, y - 0.24, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#49c85e";
    ctx.beginPath(); ctx.arc(x, y - 0.46, 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = team === 0 ? "#ff4d6a" : "#8ec6ff";
    for (const [dx, dy] of [[-0.18, -0.34], [0.16, -0.42], [0.02, -0.16], [0.26, -0.18]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 0.075, 0, 7); ctx.fill();
    }
  }

  function drawStandard(x, y, team, cloth, light) {
    const wave = Math.sin((G.time || 0) * 2.4 + x * 0.7) * 0.07;
    ctx.fillStyle = "rgba(20,12,8,.25)";
    ctx.beginPath(); ctx.ellipse(x + 0.12, y + 0.28, 0.36, 0.14, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a3424";
    ctx.fillRect(x - 0.05, y - 1.85, 0.1, 2.15);
    ctx.fillStyle = "#e1b34a";
    ctx.fillRect(x - 0.16, y - 1.92, 0.32, 0.1);
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(x + 0.05, y - 1.72);
    ctx.lineTo(x + 1.15, y - 1.55 + wave);
    ctx.lineTo(x + 1.02, y - 0.62 + wave);
    ctx.lineTo(x + 0.55, y - 0.38);
    ctx.lineTo(x + 0.98, y - 0.42 + wave * 0.5);
    ctx.lineTo(x + 0.05, y - 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x + 0.48, y - 1.2);
    ctx.lineTo(x + 0.64, y - 1.0);
    ctx.lineTo(x + 0.48, y - 0.8);
    ctx.lineTo(x + 0.32, y - 1.0);
    ctx.fill();
    ctx.fillStyle = team === 0 ? "#f0d48a" : "#e7f1ff";
    ctx.fillRect(x + 0.18, y - 1.48, 0.08, 1.05);
  }

  function drawFenceRun(x0, x1, y, wood, cap) {
    ctx.fillStyle = wood;
    const step = x1 >= x0 ? 0.72 : -0.72;
    for (let x = x0; step > 0 ? x <= x1 + 0.01 : x >= x1 - 0.01; x += step) {
      ctx.fillRect(x - 0.045, y - 0.58, 0.09, 0.72);
      ctx.fillStyle = cap;
      ctx.fillRect(x - 0.06, y - 0.64, 0.12, 0.08);
      ctx.fillStyle = wood;
    }
    ctx.strokeStyle = cap;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(x0, y - 0.4);
    ctx.lineTo(x1, y - 0.4);
    ctx.moveTo(x0, y - 0.18);
    ctx.lineTo(x1, y - 0.18);
    ctx.stroke();
  }

  function drawBed(x, y, len, team) {
    ctx.fillStyle = "#6a4528";
    ctx.fillRect(x, y, len, 0.62);
    ctx.fillStyle = "#2f8a3e";
    ctx.fillRect(x + 0.08, y + 0.08, len - 0.16, 0.46);
    ctx.fillStyle = team === 0 ? "#ff5d7a" : "#b9dcff";
    for (let i = 0.22; i < len - 0.1; i += 0.36) {
      ctx.beginPath(); ctx.arc(x + i, y + 0.3, 0.09, 0, 7); ctx.fill();
    }
  }

  function drawInlay(x, y, team, cloth, light) {
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(x, y - 0.72);
    ctx.lineTo(x + 0.58, y);
    ctx.lineTo(x, y + 0.72);
    ctx.lineTo(x - 0.58, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = light;
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.fillStyle = "#f7efe0";
    ctx.beginPath();
    ctx.moveTo(x, y - 0.28);
    ctx.lineTo(x + 0.22, y);
    ctx.lineTo(x, y + 0.28);
    ctx.lineTo(x - 0.22, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawGateHeader(x, y, team, fieldEast) {
    const hx = fieldEast ? x + 0.55 : x + 0.2;
    ctx.fillStyle = "#5e4128";
    ctx.fillRect(hx, y - 1.15, 1.85, 1.55);
    ctx.fillRect(hx, y + 13.65, 1.85, 1.4);
    ctx.fillStyle = "#f6ead4";
    ctx.fillRect(hx, y - 1.7, 1.85, 0.62);
    ctx.fillRect(hx, y + 13.55, 1.85, 0.52);
    drawMerlon(hx + 0.12, y - 2.2, 0.62, 0.58);
    drawMerlon(hx + 1.05, y - 2.2, 0.62, 0.58);
    drawMerlon(hx + 0.12, y + 13.35, 0.62, 0.52);
    drawMerlon(hx + 1.05, y + 13.35, 0.62, 0.52);
    ctx.fillStyle = teamColor(team);
    ctx.fillRect(hx + 0.7, y - 1.02, 0.42, 0.78);
  }

  function drawDrumTower(x, y, team) {
    const cone = team === 0 ? "#7a1834" : "#1a3f88";
    const slate = team === 0 ? "#3d2430" : "#1e2c44";
    ctx.fillStyle = "rgba(24, 14, 8, .38)";
    ctx.beginPath(); ctx.ellipse(x + 0.75, y + 2.15, 3.35, 1.75, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#5a3c24";
    ctx.beginPath(); ctx.ellipse(x + 0.2, y + 1.45, 2.25, 1.7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3d2818";
    ctx.beginPath(); ctx.ellipse(x + 0.7, y + 1.7, 1.35, 1.15, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e7d4b0";
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#b89268";
    ctx.beginPath(); ctx.arc(x + 0.9, y + 0.4, 1.35, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(70, 46, 26, .55)";
    ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.arc(x, y, 1.75, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 1.05, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#5a4030";
    ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.stroke();
    ctx.fillStyle = "#f7efe0";
    ctx.beginPath(); ctx.ellipse(x, y - 1.55, 1.95, 1.28, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#6a5038";
    ctx.lineWidth = 0.08;
    ctx.stroke();
    ctx.fillStyle = "#f4e7cb";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mx = x + Math.cos(a) * 1.62;
      const my = y - 1.55 + Math.sin(a) * 1.05;
      ctx.fillStyle = "#6a4c30";
      ctx.fillRect(mx - 0.2, my + 0.05, 0.4, 0.28);
      ctx.fillStyle = "#f7edd8";
      ctx.fillRect(mx - 0.2, my - 0.22, 0.4, 0.32);
    }
    ctx.fillStyle = slate;
    ctx.beginPath();
    ctx.moveTo(x - 1.7, y - 1.85);
    ctx.lineTo(x, y - 5.35);
    ctx.lineTo(x + 1.7, y - 1.75);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(x - 1.25, y - 1.95);
    ctx.lineTo(x - 0.08, y - 4.95);
    ctx.lineTo(x + 1.15, y - 1.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.beginPath();
    ctx.moveTo(x - 0.4, y - 2.05);
    ctx.lineTo(x - 0.08, y - 4.7);
    ctx.lineTo(x + 0.28, y - 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(x + 0.15, y - 4.7); ctx.lineTo(x + 0.15, y - 6.35); ctx.stroke();
    ctx.fillStyle = teamColor(team);
    ctx.beginPath();
    ctx.moveTo(x + 0.15, y - 6.35);
    ctx.lineTo(x + 1.45, y - 5.85);
    ctx.lineTo(x + 0.15, y - 5.35);
    ctx.fill();
    ctx.fillStyle = "#f0d48a";
    ctx.fillRect(x + 0.45, y - 6.05, 0.16, 0.16);
  }

  function drawPier(x, y, team) {
    const cone = team === 0 ? "#7a1834" : "#1a3f88";
    ctx.fillStyle = "rgba(24,14,8,.32)";
    ctx.beginPath(); ctx.ellipse(x + 0.35, y + 1.35, 1.7, 0.85, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#5a3c24";
    ctx.beginPath(); ctx.ellipse(x + 0.15, y + 0.85, 1.15, 0.95, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e7d4b0";
    ctx.beginPath(); ctx.arc(x, y, 1.28, 0, 7); ctx.fill();
    ctx.fillStyle = "#b89268";
    ctx.beginPath(); ctx.arc(x + 0.45, y + 0.2, 0.7, 0, 7); ctx.fill();
    ctx.strokeStyle = "#5e4630";
    ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.arc(x, y, 1.28, 0, 7); ctx.stroke();
    ctx.fillStyle = "#f7efe0";
    ctx.beginPath(); ctx.ellipse(x, y - 0.95, 0.95, 0.62, 0, 0, 7); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(x - 0.7, y - 1.05);
    ctx.lineTo(x, y - 2.55);
    ctx.lineTo(x + 0.7, y - 1);
    ctx.fill();
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(x + 0.05, y - 2.4); ctx.lineTo(x + 0.05, y - 3.45); ctx.stroke();
    ctx.fillStyle = teamColor(team);
    ctx.beginPath();
    ctx.moveTo(x + 0.05, y - 3.45);
    ctx.lineTo(x + 1.05, y - 3.05);
    ctx.lineTo(x + 0.05, y - 2.65);
    ctx.fill();
  }

  function drawBanner(x, y, team) {
    ctx.fillStyle = "rgba(30,18,8,.25)";
    ctx.beginPath(); ctx.ellipse(x + 0.55, y + 1.7, 0.7, 0.28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a3420";
    ctx.fillRect(x, y, 0.12, 1.7);
    ctx.fillStyle = teamColor(team);
    ctx.beginPath();
    ctx.moveTo(x + 0.12, y + 0.12);
    ctx.lineTo(x + 1.25, y + 0.28);
    ctx.lineTo(x + 1.12, y + 1.55);
    ctx.quadraticCurveTo(x + 0.62, y + 1.25, x + 0.12, y + 1.65);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f0d48a";
    ctx.fillRect(x + 0.28, y + 0.32, 0.12, 1.05);
  }

  function drawClump(x, y, team) {
    ctx.fillStyle = "rgba(20, 40, 16, .28)";
    ctx.beginPath(); ctx.ellipse(x + 0.15, y + 0.35, 0.85, 0.38, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#1c7a34";
    ctx.beginPath(); ctx.arc(x - 0.28, y + 0.05, 0.48, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 0.32, y + 0.02, 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#46c85d";
    ctx.beginPath(); ctx.arc(x, y - 0.22, 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = team === 0 ? "#e23b5a" : "#3aa0ff";
    ctx.beginPath(); ctx.arc(x - 0.22, y - 0.18, 0.14, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 0.24, y - 0.28, 0.13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 0.02, y + 0.08, 0.12, 0, 7); ctx.fill();
  }

  function drawStonePile(x, y) {
    ctx.fillStyle = "rgba(30,20,10,.22)";
    ctx.beginPath(); ctx.ellipse(x + 0.15, y + 0.4, 1.15, 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8d7b68";
    ctx.beginPath(); ctx.ellipse(x - 0.35, y + 0.1, 0.55, 0.38, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#b7a894";
    ctx.beginPath(); ctx.ellipse(x + 0.35, y - 0.05, 0.62, 0.4, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#6e5e50";
    ctx.beginPath(); ctx.ellipse(x, y + 0.22, 0.4, 0.28, 0, 0, 7); ctx.fill();
  }
  function facingPose(facing) {
    let a = facing;
    const choices = [
      { view: "front", ang: Math.PI / 2, flip: false },
      { view: "back", ang: -Math.PI / 2, flip: false },
      { view: "side", ang: 0, flip: false },
      { view: "side", ang: Math.PI, flip: true }
    ];
    let best = choices[0];
    let bestDiff = 99;
    for (const choice of choices) {
      const diff = Math.abs(Math.atan2(Math.sin(a - choice.ang), Math.cos(a - choice.ang)));
      if (diff < bestDiff) { bestDiff = diff; best = choice; }
    }
    return best;
  }

  function heroFrame(u) {
    const who = u.gender === "female" ? "girl" : "boy";
    const pose = facingPose(u.facing);
    const img = heroImages[who + "-" + pose.view];
    if (!img || !img.complete || !img.naturalWidth) return null;
    return { img, flip: pose.flip };
  }

  function paintHero(img, tint, flash) {
    if (spriteScratch.width !== img.width || spriteScratch.height !== img.height) {
      spriteScratch.width = img.width;
      spriteScratch.height = img.height;
    }
    spriteCtx.setTransform(1, 0, 0, 1, 0, 0);
    spriteCtx.globalCompositeOperation = "source-over";
    spriteCtx.clearRect(0, 0, img.width, img.height);
    spriteCtx.drawImage(img, 0, 0);
    spriteCtx.globalCompositeOperation = "source-atop";
    if (tint) {
      spriteCtx.fillStyle = tint;
      spriteCtx.fillRect(0, 0, img.width, img.height);
    }
    if (flash) {
      spriteCtx.fillStyle = "rgba(255,255,255,.7)";
      spriteCtx.fillRect(0, 0, img.width, img.height);
    }
    spriteCtx.globalCompositeOperation = "source-over";
    return spriteScratch;
  }

  function bendJoint(ax, ay, bx, by, lenA, lenB, prefer, side) {
    let dx = bx - ax;
    let dy = by - ay;
    let dist = Math.hypot(dx, dy) || 0.001;
    const max = lenA + lenB - 0.02;
    const min = Math.abs(lenA - lenB) + 0.02;
    if (dist > max) { const s = max / dist; dx *= s; dy *= s; dist = max; }
    if (dist < min) { const s = min / dist; dx *= s; dy *= s; dist = min; }
    const a = (lenA * lenA - lenB * lenB + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0.0004, lenA * lenA - a * a));
    const ux = dx / dist;
    const uy = dy / dist;
    const j1 = { x: ax + ux * a - uy * h, y: ay + uy * a + ux * h };
    const j2 = { x: ax + ux * a + uy * h, y: ay + uy * a - ux * h };
    if (prefer === "up") return j1.y < j2.y ? j1 : j2;
    if (side < 0) return j1.x < j2.x ? j1 : j2;
    return j1.x > j2.x ? j1 : j2;
  }

  function limb(x0, y0, x1, y1, r, fill, ink) {
    ctx.lineCap = "round";
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 2 + 0.06;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  const LIMB_NEUTRAL = { f: 0.06, up: -0.42, lat: 0.08, bend: 0.12 };
  const POSES = {
    swing: {
      windup: {
        lean: -0.42, crouch: 0.16,
        weapon: { f: -0.68, up: 0.82, lat: 0.22, bend: 0.22 },
        off: { f: 0.52, up: 0.12, lat: -0.18, bend: 0.14 },
        lead: { f: -0.36, up: 0.04, lat: 0.06 },
        trail: { f: 0.32, up: 0, lat: -0.04 },
        blade: { f: -0.18, up: 0.95, lat: 0.08 }
      },
      action: {
        lean: 0.55, crouch: 0.04,
        weapon: { f: 0.92, up: 0.08, lat: 0.28, bend: 0.08 },
        off: { f: -0.42, up: 0.18, lat: -0.22, bend: 0.16 },
        lead: { f: 0.7, up: 0.02, lat: 0.08 },
        trail: { f: -0.42, up: 0.16, lat: -0.06 },
        blade: { f: 1.05, up: 0.02, lat: 0.12 }
      }
    },
    fireball: {
      windup: {
        lean: -0.22, crouch: 0.2,
        weapon: { f: 0.12, up: 0.62, lat: 0.16, bend: 0.2 },
        off: { f: 0.12, up: 0.6, lat: -0.16, bend: 0.2 },
        lead: { f: -0.08, up: 0.06, lat: 0.1 },
        trail: { f: -0.12, up: 0.05, lat: -0.08 },
        blade: { f: 0, up: 0, lat: 0 }
      },
      action: {
        lean: 0.62, crouch: 0.06,
        weapon: { f: 0.98, up: 0.22, lat: 0.1, bend: 0.06 },
        off: { f: 0.9, up: 0.18, lat: -0.1, bend: 0.06 },
        lead: { f: 0.74, up: 0.04, lat: 0.06 },
        trail: { f: -0.28, up: 0.14, lat: -0.04 },
        blade: { f: 0, up: 0, lat: 0 }
      }
    },
    ice: {
      windup: {
        lean: 0.05, crouch: 0.24,
        weapon: { f: 0.22, up: 0.32, lat: -0.38, bend: 0.18 },
        off: { f: 0.24, up: 0.3, lat: 0.36, bend: 0.18 },
        lead: { f: 0.08, up: 0.02, lat: 0.22 },
        trail: { f: -0.06, up: 0.02, lat: -0.22 },
        blade: { f: 0, up: 0, lat: 0 }
      },
      action: {
        lean: 0.08, crouch: 0.1,
        weapon: { f: 0.72, up: 0.42, lat: 0.78, bend: 0.1 },
        off: { f: 0.18, up: 0.16, lat: -0.78, bend: 0.1 },
        lead: { f: 0.16, up: 0, lat: 0.34 },
        trail: { f: -0.12, up: 0, lat: -0.34 },
        blade: { f: 0, up: 0, lat: 0 }
      }
    },
    firesword: {
      windup: {
        lean: -0.18, crouch: 0.22,
        weapon: { f: 0.16, up: -0.15, lat: 0.12, bend: 0.16 },
        off: { f: 0.2, up: 0.05, lat: -0.05, bend: 0.14 },
        lead: { f: 0.04, up: 0.08, lat: 0.12 },
        trail: { f: -0.16, up: 0.06, lat: -0.1 },
        blade: { f: 0.05, up: -0.35, lat: 0.04 }
      },
      action: {
        lean: 0.06, crouch: 0.02,
        weapon: { f: 0.04, up: 1.08, lat: 0.06, bend: 0.08 },
        off: { f: 0.16, up: 0.7, lat: -0.02, bend: 0.12 },
        lead: { f: 0.22, up: 0, lat: 0.2 },
        trail: { f: -0.16, up: 0, lat: -0.18 },
        blade: { f: 0.02, up: 1.05, lat: 0 }
      }
    },
    lightning: {
      windup: {
        lean: -0.48, crouch: 0.36,
        weapon: { f: -0.72, up: 0.16, lat: 0.12, bend: 0.16 },
        off: { f: -0.58, up: 0.05, lat: -0.16, bend: 0.14 },
        lead: { f: 0.42, up: 0.1, lat: 0.06 },
        trail: { f: -0.5, up: 0.02, lat: -0.04 },
        blade: { f: 0, up: 0, lat: 0 }
      },
      action: {
        lean: 0.88, crouch: 0.12,
        weapon: { f: -0.78, up: 0.22, lat: 0.08, bend: 0.08 },
        off: { f: -0.7, up: 0.12, lat: -0.1, bend: 0.08 },
        lead: { f: 0.82, up: 0.02, lat: 0.04 },
        trail: { f: -0.78, up: 0.2, lat: -0.02 },
        blade: { f: 0, up: 0, lat: 0 }
      }
    },
    mega: {
      windup: {
        lean: -0.16, crouch: 0.2,
        weapon: { f: 0.2, up: 0.95, lat: 0.42, bend: 0.22 },
        off: { f: 0.2, up: 0.95, lat: -0.42, bend: 0.22 },
        lead: { f: -0.08, up: 0.06, lat: 0.18 },
        trail: { f: -0.12, up: 0.04, lat: -0.18 },
        blade: { f: 0, up: 0, lat: 0 }
      },
      action: {
        lean: 0.48, crouch: 0.06,
        weapon: { f: 0.85, up: 0.42, lat: 0.16, bend: 0.08 },
        off: { f: 0.85, up: 0.42, lat: -0.16, bend: 0.08 },
        lead: { f: 0.55, up: 0.02, lat: 0.1 },
        trail: { f: -0.22, up: 0.12, lat: -0.06 },
        blade: { f: 0, up: 0, lat: 0 }
      }
    },
    saber: {
      windup: {
        lean: -0.22, crouch: 0.1,
        weapon: { f: 0.15, up: 1.05, lat: 0.12, bend: 0.16 },
        off: { f: 0.28, up: 0.28, lat: -0.22, bend: 0.14 },
        lead: { f: 0.12, up: 0.02, lat: 0.16 },
        trail: { f: -0.18, up: 0.06, lat: -0.12 },
        blade: { f: 0.2, up: 1.2, lat: 0.04 }
      },
      action: {
        lean: 0.5, crouch: 0.05,
        weapon: { f: 1.2, up: 0.28, lat: 0.06, bend: 0.05 },
        off: { f: 0.15, up: 0.18, lat: -0.28, bend: 0.12 },
        lead: { f: 0.62, up: 0, lat: 0.08 },
        trail: { f: -0.38, up: 0.14, lat: -0.05 },
        blade: { f: 1.7, up: 0.16, lat: 0.02 }
      }
    }
  };

  function motionOf(u) {
    if (!u) return null;
    if (u.channel && (u.channel.kind === "mega" || u.channel.kind === "saber") && u.channel.dur > 0) {
      const k = clamp(1 - u.channel.t / u.channel.dur, 0, 1);
      if (k < 0.78) return { kind: u.channel.kind, stage: "windup", k: k / 0.78 };
      return { kind: u.channel.kind, stage: "action", k: (k - 0.78) / 0.22 };
    }
    if (u.visualWind && u.visualWind.dur > 0 && u.visualWind.t > 0) {
      return { kind: "swing", stage: "windup", k: clamp(1 - u.visualWind.t / u.visualWind.dur, 0, 1) };
    }
    if (u.attackWind > 0 && u.attackDur > 0) {
      return { kind: "swing", stage: "windup", k: clamp(1 - u.attackWind / u.attackDur, 0, 1) };
    }
    if (u.swingVis > 0) {
      const dur = u.swingDur || 0.26;
      return { kind: "swing", stage: "action", k: clamp(1 - u.swingVis / dur, 0, 1) };
    }
    const casting = u.cast || (!u.cast && u.perform);
    if (casting && casting.name && casting.dur > 0 && casting.t > 0) {
      return { kind: casting.name, stage: "windup", k: clamp(1 - casting.t / casting.dur, 0, 1) };
    }
    if (u.dash && u.dash.dur > 0) {
      return { kind: "lightning", stage: "action", k: clamp(1 - u.dash.t / u.dash.dur, 0, 1) };
    }
    if (u.performDash && u.performDash.dur > 0 && u.performDash.t > 0) {
      return { kind: "lightning", stage: "action", k: clamp(1 - u.performDash.t / u.performDash.dur, 0, 1) };
    }
    if (u.flourish && u.flourish.dur > 0 && u.flourish.t > 0) {
      const k = clamp(1 - u.flourish.t / u.flourish.dur, 0, 1);
      if (u.flourish.recoverOnly) return { kind: u.flourish.name, stage: "recover", k };
      if (k < 0.42) return { kind: u.flourish.name, stage: "action", k: k / 0.42 };
      return { kind: u.flourish.name, stage: "recover", k: (k - 0.42) / 0.58 };
    }
    if (u.recover > 0) {
      const dur = u.recoverDur || 0.32;
      return { kind: u.recoverKind || "swing", stage: "recover", k: clamp(1 - u.recover / dur, 0, 1) };
    }
    return null;
  }

  function lerpLimb(a, b, s) {
    return {
      f: a.f + (b.f - a.f) * s,
      up: a.up + (b.up - a.up) * s,
      lat: (a.lat || 0) + ((b.lat || 0) - (a.lat || 0)) * s,
      bend: (a.bend || 0.12) + ((b.bend || 0.12) - (a.bend || 0.12)) * s
    };
  }

  function lerpPose(a, b, k) {
    const s = k * k * (3 - 2 * k);
    const n = (x, y) => x + (y - x) * s;
    return {
      lean: n(a.lean, b.lean),
      crouch: n(a.crouch, b.crouch),
      weapon: lerpLimb(a.weapon, b.weapon, s),
      off: lerpLimb(a.off, b.off, s),
      lead: lerpLimb(a.lead, b.lead, s),
      trail: lerpLimb(a.trail, b.trail, s),
      blade: lerpLimb(a.blade, b.blade, s)
    };
  }

  function combatDoll(motion) {
    const book = POSES[motion.kind];
    if (!book) return null;
    const neutral = {
      lean: 0, crouch: 0,
      weapon: LIMB_NEUTRAL,
      off: { f: 0.05, up: -0.42, lat: -0.08, bend: 0.12 },
      lead: { f: 0.02, up: 0, lat: 0.06, bend: 0 },
      trail: { f: -0.02, up: 0, lat: -0.06, bend: 0 },
      blade: { f: 0.12, up: -0.5, lat: 0.02, bend: 0 }
    };
    if (motion.stage === "windup") return lerpPose(neutral, book.windup, motion.k);
    if (motion.stage === "action") return lerpPose(book.windup, book.action, motion.k);
    return lerpPose(book.action, neutral, motion.k);
  }

  function projectDoll(view, f, up, lat) {
    if (view === "side") return { x: f, y: -up };
    if (view === "back") return { x: lat, y: -f * 0.82 - up * 0.28 };
    return { x: lat, y: f * 0.82 - up * 0.28 };
  }

  // Step time 0.28–0.46s (Williams cartoon walk is ~0.33s/step). Visual stride 0.92m.
  // Arms oppose the legs on the contact pose. Elbows break. Idle breath is 1.5s.
  function actorPose(u) {
    const view = facingPose(u.facing).view;
    const motion = motionOf(u);
    const doll = motion ? combatDoll(motion) : null;
    const walk = doll ? 0 : (u.moveBlend || 0);
    const phase = u.gait || 0;
    const idle = u.idlePh || 0;
    const bob = Math.sin(phase * Math.PI * 4) * 0.055 * walk + Math.sin(idle * Math.PI * 2) * 0.03 * (doll ? 0.25 : (1 - walk));
    const hipY = -0.52 + bob + (doll ? doll.crouch * 0.2 : 0);
    const sway = Math.sin(idle * Math.PI * 2) * 0.05 * (1 - walk);
    const showBlade = !!(doll && (motion.kind === "swing" || motion.kind === "firesword") && u.weapon !== "bare");
    let feet;
    let hands;
    if (!doll) {
      const weight = Math.cos(phase * Math.PI * 2) * 0.055 * walk;
      const legs = [-1, 1].map((side) => {
        const lp = phase + (side === 1 ? 0 : 0.5);
        const ang = lp * Math.PI * 2;
        const along = Math.cos(ang) * 0.5 * walk;
        const swing = Math.pow(Math.max(0, -Math.sin(ang)), 1.35);
        const lift = swing * 0.2 * walk + (1 - walk) * Math.max(0, Math.sin(idle * Math.PI * 2) * side) * 0.035;
        return { side, along, lift, swing };
      });
      const arms = [-1, 1].map((side) => {
        const lp = phase + (side === 1 ? 0.5 : 0);
        const along = Math.cos(lp * Math.PI * 2) * 0.4 * walk + Math.sin(idle * Math.PI * 2 + side) * 0.08 * (1 - walk);
        return { side, along };
      });
      const forward = view === "back" ? -1 : 1;
      feet = legs.map((leg) => {
        if (view === "side") {
          return { side: leg.side, hx: weight * 0.4, hy: hipY, fx: leg.along + weight * 0.4, fy: 0.2 - leg.lift, prefer: "up", depth: leg.along };
        }
        const hx = leg.side * 0.2 + sway + weight;
        const fy = 0.2 + leg.along * forward - leg.lift;
        const fx = hx + leg.side * (0.04 + leg.swing * 0.12 * walk);
        return { side: leg.side, hx, hy: hipY, fx, fy, prefer: "out", depth: fy };
      });
      hands = arms.map((arm) => {
        const shoulder = { x: view === "side" ? 0.02 + weight * 0.25 : arm.side * 0.32 + weight * 0.35, y: hipY - 0.28 };
        let hand;
        if (view === "side") hand = { x: arm.along * 1.45 + weight * 0.2, y: shoulder.y + 0.36 - Math.abs(arm.along) * 0.16 };
        else hand = { x: shoulder.x + arm.side * 0.1, y: shoulder.y + 0.38 + arm.along * forward * 1.05 };
        const elbow = bendJoint(shoulder.x, shoulder.y, hand.x, hand.y, 0.24, 0.22, "up", arm.side);
        return { side: arm.side, shoulder, elbow, hand, tip: null, depth: hand.y };
      });
    } else {
      const lean = projectDoll(view, doll.lean, 0, 0);
      const buildArm = (side, limb) => {
        const shoulder = {
          x: (view === "side" ? 0.02 : side * 0.32) + lean.x,
          y: hipY - 0.28 + lean.y
        };
        const p = projectDoll(view, limb.f, limb.up, limb.lat);
        const hand = { x: shoulder.x + p.x, y: shoulder.y + p.y };
        const dx = hand.x - shoulder.x;
        const dy = hand.y - shoulder.y;
        const len = Math.hypot(dx, dy) || 1;
        let px = -dy / len;
        let py = dx / len;
        if (view === "side") { px = 0.2; py = -Math.abs(py); }
        else if (px * side < 0) { px = -px; py = -py; }
        const elbow = { x: (shoulder.x + hand.x) / 2 + px * limb.bend, y: (shoulder.y + hand.y) / 2 + py * limb.bend };
        let tip = null;
        if (showBlade && side === 1) {
          const b = projectDoll(view, doll.blade.f, doll.blade.up, doll.blade.lat);
          tip = { x: hand.x + b.x, y: hand.y + b.y };
        }
        return { side, shoulder, elbow, hand, tip, depth: hand.y + (tip ? 2 : 0) };
      };
      const buildFoot = (side, limb) => {
        const hx = view === "side" ? 0 : side * 0.2;
        const p = projectDoll(view, limb.f, limb.up, limb.lat);
        return {
          side, hx, hy: hipY, fx: hx + p.x, fy: 0.2 + p.y,
          prefer: limb.up > 0.05 ? "up" : "out", depth: 0.2 + p.y
        };
      };
      hands = [buildArm(1, doll.weapon), buildArm(-1, doll.off)];
      feet = [buildFoot(1, doll.lead), buildFoot(-1, doll.trail)];
    }
    return {
      view, hipY, sway, bob, feet, hands, walk, motion, doll,
      showBlade, lean: doll ? doll.lean : 0, crouch: doll ? doll.crouch : 0
    };
  }

  function drawBlade(hand, tip, lit, ink, flame) {
    ctx.lineCap = "round";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.18;
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = lit || flame > 0 ? "#ffb020" : "#f4f7fb";
    ctx.lineWidth = lit || flame > 0 ? 0.14 : 0.1;
    ctx.stroke();
    if (flame > 0) {
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 0.2);
        const wobble = Math.sin(G.time * 16 + i * 1.7) * 0.06 * flame;
        const x = hand.x + (tip.x - hand.x) * t + wobble;
        const y = hand.y + (tip.y - hand.y) * t - Math.abs(Math.cos(G.time * 14 + i)) * 0.08 * flame;
        ctx.fillStyle = i % 2 ? "#ff7a18" : "#ffe08a";
        ctx.beginPath();
        ctx.arc(x, y, 0.045 + flame * 0.055, 0, 7);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#e1b34a";
    ctx.beginPath(); ctx.arc(hand.x, hand.y, 0.07, 0, 7); ctx.fill();
  }

  function drawActorLocal(u, opt) {
    opt = opt || {};
    const pose = actorPose(u);
    const who = u.gender === "female" ? "girl" : "boy";
    const flash = u.hitFlash > 0;
    const hair = flash ? "#fff" : (opt.ice ? "#b7e7f0" : (who === "girl" ? "#c4883e" : "#6b3a22"));
    const skin = flash ? "#fff" : (opt.ice ? "#e7fbff" : (who === "girl" ? "#f3c2a2" : "#f0b892"));
    const tunic = flash ? "#fff" : (opt.ice ? "#f4ffff" : "#2c68d6");
    const sleeve = flash ? "#fff" : (opt.ice ? "#ffffff" : "#f4ead6");
    const boot = flash ? "#fff" : (opt.ice ? "#8fd0dc" : "#6e4528");
    const ink = opt.ice ? "#1b6f86" : "#2a1c14";
    const view = pose.view;
    ctx.fillStyle = "rgba(20, 16, 24, .28)";
    ctx.beginPath(); ctx.ellipse(0.08, 0.28, 0.42, 0.16, 0, 0, 7); ctx.fill();
    const feet = pose.feet.slice().sort((a, b) => a.depth - b.depth);
    const hands = pose.hands.slice().sort((a, b) => a.depth - b.depth);
    const backFoot = feet[0];
    const frontFoot = feet[1];
    let backHand = hands[0];
    let frontHand = hands[1];
    if (pose.motion) {
      frontHand = pose.hands.find((h) => h.side === 1) || hands[1];
      backHand = pose.hands.find((h) => h.side !== frontHand.side) || hands[0];
    }
    const armed = pose.motion && (pose.motion.kind === "swing" || pose.motion.kind === "firesword");
    if (pose.motion && pose.motion.kind === "ice") drawIceFx(pose);
    drawLimbChain(backHand, sleeve, ink, 0.075);
    drawLeg(backFoot, skin, boot, ink);
    drawTorso(pose.hipY, view, tunic, ink, u.team, opt.ice);
    drawLeg(frontFoot, skin, boot, ink);
    if (!armed) drawSheath(pose, view, ink);
    drawLimbChain(frontHand, sleeve, ink, 0.085);
    if (frontHand.tip) {
      const flame = pose.motion && pose.motion.kind === "firesword"
        ? (pose.motion.stage === "windup" ? pose.motion.k * 0.35 : 1)
        : (u.fireSwordT > 0 ? 0.65 : 0);
      drawBlade(frontHand.hand, frontHand.tip, u.fireSwordT > 0 || flame > 0.4, ink, flame);
    } else if (pose.motion && pose.motion.kind === "swing" && u.weapon === "bare") {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(frontHand.hand.x, frontHand.hand.y, 0.1, 0, 7); ctx.fill();
    }
    if (pose.motion && pose.motion.kind === "fireball") drawFireballFx(pose, frontHand, backHand);
    if (u.fireSwordT > 0 && !pose.motion) {
      ctx.fillStyle = "#ffb020";
      ctx.beginPath(); ctx.arc(view === "back" ? -0.14 : 0.16, pose.hipY + 0.02, 0.08, 0, 7); ctx.fill();
    }
    const lean = pose.doll ? projectDoll(view, pose.doll.lean, 0, 0) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(lean.x, lean.y);
    drawHeroHead(who, view, pose.hipY, hair, skin, ink);
    ctx.restore();
  }

  function drawFireballFx(pose, front, back) {
    const ax = front.hand.x;
    const ay = front.hand.y;
    const bx = back.hand.x;
    const by = back.hand.y;
    const stage = pose.motion.stage;
    const k = pose.motion.k;
    let x = (ax + bx) / 2;
    let y = (ay + by) / 2;
    let rad = 0.08;
    let alpha = 0.95;
    if (stage === "windup") rad = 0.06 + 0.2 * k;
    else if (stage === "action") {
      const fwd = projectDoll(pose.view, 0.35 + k * 0.8, 0.05, 0);
      x += fwd.x;
      y += fwd.y;
      rad = 0.24 * (1 - k * 0.85);
      alpha = 1 - k * 0.7;
    } else {
      alpha = 0.25 * (1 - k);
      rad = 0.08 * (1 - k);
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = "#ffb15a";
    ctx.beginPath(); ctx.arc(x, y, rad + 0.08, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffe7a8";
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.03, rad * 0.55), 0, 7); ctx.fill();
    if (stage === "windup") {
      for (let i = 0; i < 3; i++) {
        const a = G.time * 7 + i * 2.1;
        const orbit = 0.12 + rad;
        ctx.fillStyle = i === 1 ? "#fff4d2" : "#ff7a18";
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * orbit, y + Math.sin(a) * orbit * 0.72, 0.035 + k * 0.02, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawIceFx(pose) {
    const stage = pose.motion.stage;
    const k = pose.motion.k;
    ctx.save();
    if (stage === "windup") {
      ctx.strokeStyle = "rgba(186, 236, 255, .85)";
      ctx.lineWidth = 0.04;
      for (let i = 0; i < 4; i++) {
        const a = k * 4 + i * Math.PI / 2;
        const x = Math.cos(a) * (0.25 + k * 0.2);
        const y = Math.sin(a) * (0.18 + k * 0.12) - 0.15;
        ctx.beginPath(); ctx.arc(x, y, 0.05, 0, 7); ctx.stroke();
      }
    } else {
      const rad = stage === "action" ? 0.45 + k * 1.35 : 1.35 * (1 - k);
      const alpha = stage === "action" ? 0.9 - k * 0.45 : 0.35 * (1 - k);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.strokeStyle = "#dff6ff";
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(0, 0.02, Math.max(0.05, rad), 0, 7); ctx.stroke();
      ctx.strokeStyle = "#7fd0ea";
      ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(0, 0.02, Math.max(0.02, rad * 0.72), 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLeg(spec, skin, boot, ink) {
    const knee = bendJoint(spec.hx, spec.hy, spec.fx, spec.fy, 0.28, 0.26, spec.prefer, spec.side);
    limb(spec.hx, spec.hy, knee.x, knee.y, 0.11, skin, ink);
    limb(knee.x, knee.y, spec.fx, spec.fy, 0.1, boot, ink);
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(spec.fx, spec.fy + 0.02, 0.13, 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = boot;
    ctx.beginPath(); ctx.ellipse(spec.fx, spec.fy + 0.01, 0.1, 0.05, 0, 0, 7); ctx.fill();
  }

  function drawLimbChain(arm, fill, ink, r) {
    limb(arm.shoulder.x, arm.shoulder.y, arm.elbow.x, arm.elbow.y, r, fill, ink);
    limb(arm.elbow.x, arm.elbow.y, arm.hand.x, arm.hand.y, r * 0.86, fill, ink);
  }

  function drawTorso(hipY, view, tunic, ink, team, ice) {
    const top = hipY - 0.34;
    const wide = view === "side" ? 0.22 : 0.3;
    ctx.beginPath();
    ctx.moveTo(-wide, top + 0.06);
    ctx.quadraticCurveTo(-wide - 0.04, (top + hipY) / 2, -wide + 0.04, hipY + 0.12);
    ctx.lineTo(wide - 0.04, hipY + 0.12);
    ctx.quadraticCurveTo(wide + 0.04, (top + hipY) / 2, wide, top + 0.06);
    ctx.closePath();
    ctx.fillStyle = tunic;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.05;
    ctx.stroke();
    if (!ice) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = teamColor(team);
      ctx.fillRect(-1, top, 2, 1.2);
      ctx.restore();
    }
    ctx.fillStyle = "#6b4428";
    ctx.fillRect(-wide + 0.02, hipY - 0.02, (wide - 0.02) * 2, 0.09);
    ctx.fillStyle = "#e1b34a";
    ctx.fillRect(-0.07, hipY - 0.04, 0.14, 0.12);
  }

  function drawSheath(pose, view, ink) {
    const x = view === "side" ? -0.02 : (view === "back" ? -0.14 : 0.16);
    const y = pose.hipY + 0.02;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.09;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y - 0.12); ctx.lineTo(x + 0.03, y + 0.18); ctx.stroke();
    ctx.strokeStyle = "#6b4428";
    ctx.lineWidth = 0.055;
    ctx.stroke();
    ctx.fillStyle = "#e1b34a";
    ctx.beginPath(); ctx.arc(x, y - 0.12, 0.045, 0, 7); ctx.fill();
  }

  function drawHeroHead(who, view, hipY, hair, skin, ink) {
    const hy = hipY - 0.66;
    const hx = view === "side" ? 0.05 : 0;
    ctx.fillStyle = hair;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(hx, hy, 0.3, 0, 7); ctx.fill(); ctx.stroke();
    if (view !== "back") {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(view === "side" ? hx + 0.06 : hx, hy + 0.03, 0.23, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#24180f";
      if (view === "front") {
        ctx.beginPath(); ctx.arc(hx - 0.08, hy, 0.045, 0, 7); ctx.arc(hx + 0.08, hy, 0.045, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(hx - 0.068, hy - 0.016, 0.015, 0, 7); ctx.arc(hx + 0.092, hy - 0.016, 0.015, 0, 7); ctx.fill();
        ctx.strokeStyle = "#c47b6a";
        ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.arc(hx, hy + 0.09, 0.05, 0.15, Math.PI - 0.15); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(hx + 0.12, hy, 0.042, 0, 7); ctx.fill();
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.arc(hx + 0.24, hy + 0.04, 0.05, 0, 7); ctx.fill();
        ctx.strokeStyle = ink;
        ctx.stroke();
      }
    }
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(hx, hy - 0.02, 0.28, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (who === "boy") {
      ctx.beginPath(); ctx.ellipse(hx + 0.1, hy - 0.32, 0.07, 0.13, 0.5, 0, 7); ctx.fill();
    } else if (view === "front") {
      ctx.beginPath(); ctx.ellipse(hx - 0.24, hy + 0.08, 0.09, 0.2, 0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + 0.24, hy + 0.08, 0.09, 0.2, -0.3, 0, 7); ctx.fill();
    } else if (view === "side") {
      ctx.beginPath(); ctx.ellipse(hx - 0.24, hy + 0.16, 0.11, 0.32, 0.6, 0, 7); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(hx, hy + 0.34, 0.11, 0.28, 0, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.arc(hx, hy, 0.3, 0, 7); ctx.stroke();
  }

  function drawLightningFx(u, motion) {
    ctx.save();
    ctx.rotate(u.facing);
    const k = motion.k;
    if (motion.stage === "windup") {
      ctx.fillStyle = "#fff4a8";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-0.45 - k * 0.15, (i - 1.5) * 0.14, 0.045 + k * 0.04, 0, 7);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = "rgba(255, 244, 168, .95)";
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(-0.15, 0.02);
      let x = -0.15;
      for (let i = 0; i < 6; i++) {
        x -= 0.32;
        const jag = Math.sin(G.time * 28 + i * 1.4) * 0.08;
        ctx.lineTo(x, (i % 2 ? 0.28 : -0.28) * (1 - k * 0.2) + jag);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 0.035;
      ctx.stroke();
    }
    ctx.restore();
  }

  function flameTongue(x, y, ang, len, wid, hot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = hot ? "#fff1c4" : "#ff5a12";
    ctx.beginPath();
    ctx.moveTo(0, -wid * 0.35);
    ctx.quadraticCurveTo(len * 0.55, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.55, wid, 0, wid * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hot ? "#ffd36a" : "#ff8a1e";
    ctx.beginPath();
    ctx.moveTo(0, -wid * 0.16);
    ctx.quadraticCurveTo(len * 0.4, -wid * 0.45, len * 0.72, 0);
    ctx.quadraticCurveTo(len * 0.4, wid * 0.45, 0, wid * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMegaBurst(x, y, r, charge, smokeLift) {
    const smokes = 12;
    for (let i = 0; i < smokes; i++) {
      const a = (i / smokes) * Math.PI * 2 + 0.2;
      const rise = smokeLift * (0.55 + (i % 4) * 0.22);
      const puff = r * (0.16 + (i % 3) * 0.07);
      const sx = x + Math.cos(a) * r * (0.2 + (i % 3) * 0.1);
      const sy = y - rise + Math.sin(a) * r * 0.1;
      ctx.fillStyle = i % 2 ? "rgba(10, 10, 10, .78)" : "rgba(22, 20, 18, .7)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, puff, puff * 0.7, a * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(6, 6, 6, .6)";
      ctx.beginPath();
      ctx.ellipse(sx + puff * 0.15, sy - puff * 0.45, puff * 0.7, puff * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(G.time * 6 + i) * 0.08;
      const flick = 0.75 + Math.sin(G.time * 18 + i * 1.3) * 0.25;
      const dist = r * (0.15 + (i % 5) * 0.12) * (0.45 + charge * 0.7);
      const len = r * (0.22 + (i % 4) * 0.06) * flick * (0.35 + charge);
      flameTongue(
        x + Math.cos(a) * dist,
        y + Math.sin(a) * dist,
        a + Math.sin(G.time * 9 + i) * 0.25,
        len,
        0.28 + (i % 3) * 0.12,
        i % 2 === 0
      );
    }
    ctx.fillStyle = "#ff7a18";
    ctx.beginPath();
    ctx.arc(x, y, r * (0.22 + charge * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 236, 190, .95)";
    ctx.beginPath();
    ctx.arc(x, y, r * (0.1 + charge * 0.1), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMegaMarks() {
    for (const u of G.units) {
      if (u.dead || !u.channel || u.channel.kind !== "mega") continue;
      const ch = u.channel;
      const r = ch.r || MEGA_RADIUS;
      const charge = clamp(1 - ch.t / (ch.dur || MEGA_TIME), 0, 1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(40, 12, 8, .28)";
      ctx.fill();
      drawMegaBurst(ch.x, ch.y, r, 0.25 + charge * 0.6, r * 0.55 * charge);
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = "#e10600";
      ctx.stroke();
      ctx.restore();
    }
    for (const fx of G.megaFx || []) {
      const dur = fx.dur || 1.7;
      const k = clamp(1 - fx.t / dur, 0, 1);
      const r = fx.r || MEGA_RADIUS;
      ctx.save();
      if (k < 0.18) {
        ctx.globalAlpha = 1 - k / 0.18;
        ctx.fillStyle = "#fff6e4";
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * (0.35 + k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = Math.max(0, 1 - k * 0.85);
      drawMegaBurst(fx.x, fx.y, r, 1 - k * 0.35, r * (0.35 + k * 1.35));
      ctx.restore();
    }
  }

  function drawGroundSplit(len, width, open) {
    ctx.save();
    const gap = 0.08 + open * 0.42;
    const lip = Math.min(width * 0.46, 0.35 + open * (width * 0.42));
    ctx.fillStyle = "#24160e";
    ctx.beginPath();
    ctx.moveTo(0.4, -gap);
    ctx.lineTo(len, -gap * 0.55);
    ctx.lineTo(len, -lip);
    ctx.lineTo(0.4, -lip * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.4, gap);
    ctx.lineTo(len, gap * 0.55);
    ctx.lineTo(len, lip);
    ctx.lineTo(0.4, lip * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3a2918";
    for (let i = 0; i < 7; i++) {
      const x = 0.8 + (len - 1) * (i / 6);
      const s = 0.16 + (i % 3) * 0.06;
      ctx.beginPath();
      ctx.moveTo(x, -gap - 0.02);
      ctx.lineTo(x + s, -lip * 0.85);
      ctx.lineTo(x - s * 0.4, -lip * 0.45);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 0.2, gap + 0.02);
      ctx.lineTo(x + s, lip * 0.8);
      ctx.lineTo(x - s * 0.3, lip * 0.4);
      ctx.fill();
    }
    ctx.strokeStyle = "#fff6c2";
    ctx.lineWidth = 0.1 + open * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0.35, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.strokeStyle = "#f5c400";
    ctx.lineWidth = 0.28 + open * 0.22;
    ctx.stroke();
    ctx.fillStyle = "#ffe9a0";
    for (let i = 0; i < 8; i++) {
      const x = 0.6 + (len - 0.8) * (i / 7);
      const y = Math.sin(G.time * 20 + i) * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 0.05 + (i % 3) * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHeldSaber(open) {
    const len = 2.7 + open * 0.45;
    const pulse = 0.82 + Math.sin(G.time * 22) * 0.18;
    ctx.save();
    const base = ctx.globalAlpha;
    ctx.globalAlpha = base * 0.55 * pulse;
    ctx.fillStyle = "#fff6c0";
    ctx.beginPath();
    ctx.moveTo(-0.05, -0.42);
    ctx.lineTo(len + 0.2, 0);
    ctx.lineTo(-0.05, 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = base;
    ctx.fillStyle = "#f5c400";
    ctx.beginPath();
    ctx.moveTo(0.12, -0.2);
    ctx.lineTo(len, 0);
    ctx.lineTo(0.12, 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath();
    ctx.moveTo(0.35, -0.06);
    ctx.lineTo(len - 0.4, 0);
    ctx.lineTo(0.35, 0.06);
    ctx.closePath();
    ctx.fill();
    const shine = (G.time * 3.2) % 1;
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(0.45 + shine * (len * 0.55), 0);
    ctx.lineTo(0.75 + shine * (len * 0.55), 0);
    ctx.stroke();
    ctx.fillStyle = "#e8c35a";
    ctx.fillRect(0.02, -0.46, 0.16, 0.92);
    ctx.fillStyle = "#5c3a16";
    ctx.fillRect(-0.2, -0.1, 0.36, 0.2);
    ctx.restore();
  }

  function drawSaberScene(x, y, ang, len, w, open, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang || 0);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = "rgba(255, 236, 150, .2)";
    ctx.fillRect(0, -w / 2, len, w);
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = "#f5c400";
    ctx.strokeRect(0, -w / 2, len, w);
    const reach = Math.max(1.2, len * (0.18 + 0.82 * open));
    drawGroundSplit(reach, w, open);
    ctx.restore();
  }

  function drawSaberBlades() {
    for (const u of G.units) {
      if (u.dead || !u.channel || u.channel.kind !== "saber") continue;
      const ch = u.channel;
      const open = clamp(1 - ch.t / (ch.dur || SABER_TIME), 0, 1);
      ctx.save();
      ctx.translate(u.x, u.y - 0.62);
      ctx.rotate(ch.ang || 0);
      drawHeldSaber(open);
      ctx.restore();
    }
    for (const fx of G.saberFx || []) {
      const dur = fx.dur || 0.9;
      const fade = clamp(fx.t / dur, 0, 1);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(fx.x, fx.y - 0.62);
      ctx.rotate(fx.ang || 0);
      drawHeldSaber(1);
      ctx.restore();
    }
  }

  function drawSaberMarks() {
    for (const u of G.units) {
      if (u.dead || !u.channel || u.channel.kind !== "saber") continue;
      const ch = u.channel;
      const len = ch.len || SABER_LEN;
      const w = ch.w || SABER_W;
      const open = clamp(1 - ch.t / (ch.dur || SABER_TIME), 0, 1);
      drawSaberScene(ch.x, ch.y, ch.ang || 0, len, w, open, 1);
    }
    for (const fx of G.saberFx || []) {
      const len = fx.len || SABER_LEN;
      const w = fx.w || SABER_W;
      const dur = fx.dur || 0.9;
      const fade = clamp(fx.t / dur, 0, 1);
      drawSaberScene(fx.x, fx.y, fx.ang || 0, len, w, 1, fade);
    }
  }

  function drawShock(u) {
    if (!u.shock || u.shock <= 0) return;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.fillStyle = "rgba(255, 236, 120, .42)";
    ctx.beginPath();
    ctx.arc(0, -0.35, 0.95, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#fff4a8";
    ctx.lineWidth = 0.16;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0.02, -1.7);
    const zig = [0.34, -0.4, 0.28, -0.36, 0.22];
    let y = -1.7;
    for (let i = 0; i < zig.length; i++) {
      y += 0.34;
      ctx.lineTo(i % 2 ? zig[i] : -zig[i], y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 0.06;
    ctx.stroke();
    ctx.restore();
  }

  function drawShield(u) {
    if (!u.guard || !u.carrying) return;
    const pulse = 1 + Math.sin(G.time * 6) * 0.07;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.fillStyle = "rgba(150, 236, 255, .38)";
    ctx.beginPath();
    ctx.ellipse(0, -0.62, 1.12 * pulse, 1.48 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f7fdff";
    ctx.lineWidth = 0.12;
    ctx.stroke();
    ctx.strokeStyle = "#67e4ff";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.ellipse(0, -0.62, 0.86 * pulse, 1.16 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0.22, 1.02 * pulse, 0.34 * pulse, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#f4fdff";
    ctx.lineWidth = 0.09;
    ctx.stroke();
    ctx.fillStyle = "#f7fdff";
    ctx.strokeStyle = "#14506a";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0, -2.62);
    ctx.lineTo(0.3, -2.38);
    ctx.lineTo(0.24, -1.98);
    ctx.quadraticCurveTo(0, -1.76, -0.24, -1.98);
    ctx.lineTo(-0.3, -2.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawUnit(u) {
    const top = 1.78;
    ctx.save();
    ctx.translate(u.x, u.y);
    if (u.flight) ctx.translate(0, -u.flight.h * 2.2);
    ctx.globalAlpha = u.invuln > 0 ? 0.55 + Math.sin(G.time * 24) * 0.2 : 1;
    ctx.fillStyle = u.team === 0 ? "rgba(255,61,98,.28)" : "rgba(58,160,255,.28)";
    ctx.beginPath(); ctx.ellipse(0, 0.22, 0.62, 0.28, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = teamColor(u.team);
    ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.arc(0, 0.08, u.r, 0, 7); ctx.stroke();
    const motion = motionOf(u);
    if (u.swingVis > 0) {
      const dur = u.swingDur || 0.26;
      const k = clamp(1 - u.swingVis / dur, 0, 1);
      const sweep = Math.sin(Math.min(1, k) * Math.PI);
      ctx.save();
      ctx.rotate(u.facing);
      ctx.globalAlpha = 0.25 + 0.55 * sweep;
      ctx.fillStyle = u.fireSwordT > 0 ? "rgba(255,140,30,.55)" : "rgba(255,255,255,.45)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, (u.swingRange || 1) * (0.45 + 0.55 * k), -(u.swingArc || 2) / 2, (u.swingArc || 2) / 2);
      ctx.fill();
      ctx.restore();
    }
    if (motion && motion.kind === "lightning" && motion.stage !== "recover") drawLightningFx(u, motion);
    const poseView = facingPose(u.facing);
    ctx.save();
    if (poseView.flip) ctx.scale(-1, 1);
    ctx.translate(0, 0.36);
    ctx.scale(1.22, 1.22);
    ctx.translate(0, -0.36);
    drawActorLocal(u);
    ctx.restore();
    if (u.carrying) drawDiamond(0, -1.7, u.carrying.team, 0.42);
    if (u.channel) {
      const barDur = u.channel.dur || 1.1;
      ctx.fillStyle = u.channel.kind === "mega" ? "#e10600" : u.channel.kind === "saber" ? "#f5c400" : "#ffc44d";
      ctx.fillRect(-0.45, -top + 0.15, 0.9 * clamp(1 - u.channel.t / barDur, 0, 1), 0.12);
    }
    ctx.restore();
    drawShield(u);
    drawShock(u);
    label(u.isPlayer ? "YOU" : u.name, u.x, u.y - top, 0.34, "#1b1428");
    if (!u.isPlayer) {
      ctx.fillStyle = "#1b1428";
      ctx.fillRect(u.x - 0.4, u.y - top + 0.16, 0.8, 0.1);
      ctx.fillStyle = teamColor(u.team);
      ctx.fillRect(u.x - 0.4, u.y - top + 0.16, 0.8 * clamp(u.hp / u.maxHp, 0, 1), 0.1);
    }
  }

  function drawClone(c) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.translate(c.x, c.y);
    const poseView = facingPose(c.facing);
    if (poseView.flip) ctx.scale(-1, 1);
    ctx.translate(0, 0.36);
    ctx.scale(1.22, 1.22);
    ctx.translate(0, -0.36);
    drawActorLocal({
      facing: c.facing,
      gender: c.owner.gender,
      team: c.team,
      gait: c.owner.gait,
      moveBlend: c.owner.moveBlend,
      idlePh: c.owner.idlePh,
      attackWind: 0,
      attackDur: 1,
      swingVis: c.swingVis || 0,
      swingDur: c.swingDur || 0.26,
      attackWind: c.owner.attackWind || 0,
      attackDur: c.owner.attackDur || 0,
      recover: c.owner.recover || 0,
      recoverDur: c.owner.recoverDur || 0.32,
      recoverKind: "swing",
      fireSwordT: 0,
      hitFlash: c.flash > 0 ? 1 : 0,
      dash: c.owner.dash,
      weapon: "sword"
    }, { ice: true });
    ctx.restore();
  }
  function drawDead(u) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(u.x, u.y);
    ctx.strokeStyle = teamColor(u.team);
    ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.lineTo(0.3, 0.3); ctx.moveTo(0.3, -0.3); ctx.lineTo(-0.3, 0.3); ctx.stroke();
    ctx.restore();
    label(Math.ceil(u.respawn) + "s", u.x, u.y - 0.6, 0.32, "#fff");
  }

  function drawDiamond(x, y, team, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = team === 0 ? "#ff5d7a" : "#5ad0ff";
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.72, -s * 0.2);
    ctx.lineTo(s * 0.4, s * 0.85);
    ctx.lineTo(-s * 0.4, s * 0.85);
    ctx.lineTo(-s * 0.72, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillRect(-s * 0.1, -s * 0.55, s * 0.16, s * 0.4);
    ctx.restore();
  }

  function drawFires() {
    for (const f of G.fires || []) {
      const a = clamp(f.t / 5, 0, 1);
      ctx.globalAlpha = 0.35 + 0.4 * a;
      ctx.fillStyle = "#ff6a1a";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 0.75 * a;
      ctx.fillStyle = "#ffd27a";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.42, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawKeep(k) {
    if (k.down > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#6b5344";
      ctx.beginPath();
      ctx.arc(k.x, k.y, k.r * 0.72, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(Math.ceil(k.down) + "s", k.x, k.y, 0.42, "#fff");
      return;
    }
    ctx.fillStyle = "#d7c4a4";
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#8d7760";
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r * 0.78, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#5c4636";
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r * 0.55, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#1b1428";
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r, k.door - 0.55, k.door + 0.55);
    ctx.arc(k.x, k.y, Math.max(0.2, k.r - KEEP_INSET), k.door + 0.55, k.door - 0.55, true);
    ctx.fill();
    const col = k.owner == null ? "#d9d3c7" : teamColor(k.owner);
    ctx.fillStyle = col;
    ctx.fillRect(k.x - 0.08, k.y - k.r - 1.15, 0.16, 1.2);
    ctx.beginPath();
    ctx.moveTo(k.x, k.y - k.r - 1.15);
    ctx.lineTo(k.x + 0.7, k.y - k.r - 0.75);
    ctx.lineTo(k.x, k.y - k.r - 0.4);
    ctx.fill();
    if (k.owner != null) {
      const w = 1.6;
      ctx.fillStyle = "#1b1428";
      ctx.fillRect(k.x - w / 2, k.y - 0.12, w, 0.22);
      ctx.fillStyle = col;
      ctx.fillRect(k.x - w / 2, k.y - 0.12, w * clamp(k.hp / k.max, 0, 1), 0.22);
    }
    if (k.cap > 0) {
      ctx.strokeStyle = k.capTeam === 0 ? "#ff5d7a" : "#5ad0ff";
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.arc(k.x, k.y, k.r + 0.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(k.cap / 3, 0, 1));
      ctx.stroke();
    }
  }

  function drawShot(s) {
    if (s.kind === "fireball") {
      const r = s.r || 0.95;
      ctx.fillStyle = "rgba(255,180,60,.35)";
      ctx.beginPath(); ctx.arc(s.x - s.vx * 0.02, s.y - s.vy * 0.02, r * 1.15, 0, 7); ctx.fill();
      ctx.fillStyle = "#ff7a2a";
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.72, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffe7a8";
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.34, 0, 7); ctx.fill();
    } else if (s.diamond) drawDiamond(s.x, s.y, s.diamond.team, 0.5);
  }

  function drawLabels() {
    label("BLACK FOREST", 88, 6.2, 1.05, "#1b1428");
    label("CRIMSON KEEP", 24, 33, 0.55, "#7a1030");
    label("AZURE KEEP", 152, 33, 0.55, "#123e86");
    label("GATE", 47, 47.2, 0.36, "#1b1428");
    label("GATE", 129, 47.2, 0.36, "#1b1428");
    label("TEAM DIAMOND", 18, 37.2, 0.32, "#1b1428");
    label("VAULT", 20, 64.2, 0.38, "#1b1428");
    label("TEAM DIAMOND", 158, 37.2, 0.32, "#1b1428");
    label("VAULT", 156, 64.2, 0.38, "#1b1428");
    label("MIDDLE OUTPOST", 88, 12.2, 0.38, "#1b1428");
    label("WEST TOWER", 58, 89.2, 0.34, "#1b1428");
    label("EAST TOWER", 118, 89.2, 0.34, "#1b1428");
    label("POND", 76, 41, 0.5, "#14365f");
    label("ISLAND", 88.2, 50.4, 0.4, "#14361f");
    label("UPPER BRIDGE", 88, 19.3, 0.32, "#1b1428");
    label("LOWER BRIDGE", 88, 83.2, 0.32, "#1b1428");
    label("ORE", 88, 8.2, 0.32, "#1b1428");
  }

  function label(text, x, y, size, color) {
    ctx.font = "800 " + size + "px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawMinimap() {
    const mw = 168;
    const mh = 96;
    const x = G.viewW - mw - 12;
    const y = 12;
    ctx.save();
    ctx.fillStyle = "rgba(20,10,32,.78)";
    roundRect(x - 6, y - 6, mw + 12, mh + 22, 8);
    ctx.fill();
    ctx.fillStyle = "#3ec96a";
    ctx.fillRect(x, y, mw, mh);
    const px = (wx) => x + (wx / MAP.w) * mw;
    const py = (wy) => y + (wy / MAP.h) * mh;
    ctx.fillStyle = "#2f86e6";
    ctx.beginPath();
    for (const poly of G.rivers) {
      ctx.moveTo(px(poly[0].x), py(poly[0].y));
      for (let i = 1; i < poly.length; i++) ctx.lineTo(px(poly[i].x), py(poly[i].y));
      ctx.closePath();
    }
    ctx.fill();
    if (G.moat && G.moat.poly) {
      const poly = G.moat.poly;
      ctx.beginPath();
      ctx.moveTo(px(poly[0].x), py(poly[0].y));
      for (let i = 1; i < poly.length; i++) ctx.lineTo(px(poly[i].x), py(poly[i].y));
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#67d36a";
    for (const isle of G.isles) {
      ctx.beginPath();
      if (isle.poly) {
        ctx.moveTo(px(isle.poly[0].x), py(isle.poly[0].y));
        for (let i = 1; i < isle.poly.length; i++) ctx.lineTo(px(isle.poly[i].x), py(isle.poly[i].y));
        ctx.closePath();
      } else {
        ctx.arc(px(isle.x), py(isle.y), (isle.r / MAP.w) * mw, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.fillStyle = "#c9a06a";
    for (const b of G.bridges) ctx.fillRect(px(b.x), py(b.y), (b.w / MAP.w) * mw, (b.h / MAP.h) * mh);
    for (const k of G.keeps || []) {
      ctx.fillStyle = k.down > 0 ? "#6b5344" : (k.owner === 0 ? "#ff5d7a" : k.owner === 1 ? "#5ad0ff" : "#d7c4a4");
      ctx.beginPath();
      ctx.arc(px(k.x), py(k.y), Math.max(2.2, (k.r / MAP.w) * mw), 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "#f0d7a2";
    ctx.fillRect(px(4), py(14.5), (15 / MAP.w) * mw, (22 / MAP.h) * mh);
    ctx.fillRect(px(68.5), py(14.5), (15 / MAP.w) * mw, (22 / MAP.h) * mh);
    for (const d of G.diamonds) {
      if (d.inFlight) continue;
      ctx.fillStyle = d.team === 0 ? "#ff3d62" : "#7ad7ff";
      ctx.fillRect(px(d.x) - 2, py(d.y) - 2, 4, 4);
    }
    for (const u of G.units) {
      if (u.dead) continue;
      ctx.fillStyle = u.isPlayer ? "#ffe08a" : teamColor(u.team);
      ctx.beginPath();
      ctx.arc(px(u.x), py(u.y), u.isPlayer ? 3.2 : 2.1, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "#fff6e4";
    ctx.font = "700 11px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Black Forest", x, y + mh + 12);
    ctx.restore();
  }

  function objectiveText() {
    const p = G.player;
    if (!p) return "";
    const mine = G.diamonds[p.team];
    const enemy = G.diamonds[1 - p.team];
    const us = p.team === 0 ? "Crimson" : "Azure";
    const them = p.team === 0 ? "Azure" : "Crimson";
    if (p.carrying === enemy) return "You have the " + them + " diamond. Hold it in your vault for 10 seconds to win.";
    if (p.carrying === mine) return "You have your diamond. Walk into the " + us + " vault and it returns home immediately. No hold.";
    if (mine.carrier && mine.carrier.team === p.team) return mine.carrier.name + " is returning your diamond. It snaps home the moment they enter your vault.";
    if (mine.carrier) return mine.carrier.name + " stole your diamond. Stop them before the 10-second vault hold.";
    if (enemy.carrier && enemy.carrier.team === p.team) return enemy.carrier.name + " has the " + them + " diamond. Hold the " + us + " vault for 10 seconds.";
    if (enemy.carrier) return enemy.carrier.name + " has the " + them + " diamond and is heading for a 10-second vault hold.";
    if (!mine.atHome) return "Your diamond is on the ground. Only " + us + " can return it: carry it into your vault and it snaps home.";
    if (!enemy.atHome) return "The " + them + " diamond is loose. Steal it and hold it in your vault for 10 seconds.";
    return "Steal the " + them + " diamond and hold your vault for 10 seconds. A dropped diamond stays put. Carry yours home to reset it instantly.";
  }

  function syncHud() {
    const p = G.player;
    if (!p) return;
    $("hp-fill").style.width = (100 * clamp(p.hp / p.maxHp, 0, 1)) + "%";
    $("mp-fill").style.width = (100 * clamp(p.mp / p.maxMp, 0, 1)) + "%";
    $("hp-text").textContent = "HP " + Math.ceil(Math.max(0, p.hp)) + " / " + Math.round(p.maxHp);
    $("mp-text").textContent = "MP " + Math.ceil(p.mp) + " / " + Math.round(p.maxMp);
    const down = p.dead ? "Down. Back in " + Math.ceil(p.respawn) + "s. " : "";
    $("hud-obj").textContent = down + objectiveText();
    const enemy = G.diamonds[1];
    const mine = G.diamonds[0];
    const who = (d) => d.carrier ? (d.carrier.isPlayer ? "you" : d.carrier.name) : (d.atHome ? "at home" : "dropped");
    $("hud-diamond").textContent = "Azure gem: " + who(enemy) + "   ·   Crimson gem: " + who(mine);
    const banks = G.diamonds.map((d) => d.bank > 0 ? ((d.carrier && d.carrier.team === 0) ? "Crimson" : "Azure") + " vault " + d.bank.toFixed(1) + "s / 10" : null).filter(Boolean);
    $("hud-bank").textContent = banks.join("   ") || "Vault hold 0 / 10";
    $("hud-score").textContent = "Takedowns  Crimson " + G.takedowns[0] + "  ·  Azure " + G.takedowns[1];
    const c = Math.max(0, G.clock);
    $("hud-clock").textContent = "Time " + Math.floor(c / 60) + ":" + String(Math.floor(c % 60)).padStart(2, "0") + (G.pausedForHelp ? "  ·  paused" : "");
    const call = $("kill-call");
    if (G.killCall) {
      call.hidden = false;
      call.textContent = G.killCall.text;
      call.style.opacity = G.killCall.t < 0.35 ? String(G.killCall.t / 0.35) : "0.92";
    } else {
      call.hidden = true;
      call.textContent = "";
    }
    const weapon = p.weapon === "bare" ? "Bare hand · 5 HP" : "Sword · 10 HP";
    $("weapon-label").textContent = weapon + (p.carrying ? " · sealed" : "");
    const buffs = [];
    if (p.fireSwordT > 0) buffs.push("Fire Sword " + p.fireSwordT.toFixed(1) + "s / " + p.fireSwordHits + " hits");
    if (p.clones.some((cl) => cl.alive)) buffs.push("Ice clones");
    if (p.burn && p.burn.t > 0) buffs.push("Burn");
    if (p.shock > 0) buffs.push("Shock " + p.shock.toFixed(1) + "s");
    if (p.slowCast > 0) buffs.push("Slow cast " + p.slowCast.toFixed(1) + "s");
    if (p.guard && p.carrying) buffs.push("Defense");
    if (p.channel && p.channel.kind === "mega") buffs.push("Mega " + Math.max(0, p.channel.t).toFixed(1) + "s");
    if (p.channel && p.channel.kind === "saber") buffs.push("Saber " + Math.max(0, p.channel.t).toFixed(1) + "s");
    $("buff-label").textContent = buffs.join(" · ");
    $("carry-hint").textContent = p.carrying ? "Carrying — half speed, no attacks. Throw or F. Defense halves damage for 5 MP/s." : "";
    const throwBtn = $("btn-throw");
    if (throwBtn) throwBtn.hidden = !(p.carrying && !p.dead);
    const guardBtn = $("btn-guard");
    if (guardBtn) {
      const show = !!(p.carrying && !p.dead);
      guardBtn.hidden = !show;
      guardBtn.classList.toggle("on", !!(show && p.guard));
      guardBtn.setAttribute("aria-pressed", show && p.guard ? "true" : "false");
    }
    document.querySelectorAll(".slot").forEach((el) => {
      const id = el.dataset.skill;
      const unlocked = p.skills[id];
      el.classList.toggle("locked", !unlocked);
      el.classList.toggle("on", !!(p.cast && p.cast.name === id) || (id === "mega" && megaLocked(p)) || (id === "saber" && saberLocked(p)));
      const em = el.querySelector("em");
      if (!unlocked) em.textContent = "locked";
      else if (p.cds[id] > 0.05) em.textContent = p.cds[id].toFixed(1) + "s";
      else em.textContent = mpLabel(SKILLS[id]);
    });
  }

  const SKILL_SHORT = { fireball: "Fire", ice: "Ice", firesword: "Sword", lightning: "Dash", mega: "Boom", saber: "Beam" };

  function isGuest() { return net.mode === "online" && Number(net.team) === 1; }

  function queueAction(action) {
    net.pending.push(action);
    if (net.pending.length > 8) net.pending.shift();
  }

  function pressSkill(id) {
    if (G.phase !== "play" || G.pausedForHelp) return;
    const p = G.player;
    if (!p || p.dead || !p.skills[id]) return;
    if (rootLocked(p)) { float(p, "CHANNELING", "#ffb0b0"); return; }
    if (p.shock > 0 && id !== "fireball") { float(p, "SHOCKED", "#fff4a8"); return; }
    if (isGuest()) {
      if (id === "mega" || id === "saber") {
        const def = SKILLS[id];
        const cost = skillCost(def, p);
        if ((p.cds[id] || 0) > 0) { float(p, "COOLDOWN", "#ffd0a8"); return; }
        if (p.mp + 0.001 < cost) { float(p, "NO MP", "#b9dcff"); return; }
        p.mp -= cost;
        p.cds[id] = def.cd * cdMul(p);
        if (id === "mega") beginMegaChannel(p, true);
        else beginSaberChannel(p, true);
        queueAction("skill:" + id);
      } else {
        queueAction("skill:" + id);
        beginCastVisual(p, id);
      }
      return;
    }
    tryCast(p, id);
  }

  function pressAttack() {
    if (G.phase !== "play" || G.pausedForHelp) return;
    const p = G.player;
    if (!p || p.dead) return;
    if (rootLocked(p)) { float(p, "CHANNELING", "#ffb0b0"); return; }
    if (isGuest()) { queueAction("swing"); beginSwingVisual(p); return; }
    if (p.carrying) float(p, "CAN'T ATTACK", "#fff");
    else trySwing(p);
  }

  function pressThrow() {
    if (G.phase !== "play" || G.pausedForHelp) return;
    const p = G.player;
    if (!p || p.dead) return;
    if (isGuest()) { queueAction("throw"); return; }
    throwDiamond(p);
  }

  function pressGuard() {
    if (G.phase !== "play" || G.pausedForHelp) return;
    const p = G.player;
    if (!p || p.dead || !p.carrying) return;
    if (p.guard) {
      p.guard = false;
      p.guardBlock = false;
      if (isGuest()) queueAction("guard:0");
      float(p, "DEFENSE OFF", "#bff6ff");
      return;
    }
    if (p.mp <= 0) {
      float(p, "NO MP", "#b9dcff");
      return;
    }
    p.guard = true;
    p.guardBlock = false;
    if (isGuest()) queueAction("guard:1");
    float(p, "DEFENSE", "#bff6ff");
  }

  function buildSlots() {
    const wrap = $("slots");
    wrap.replaceChildren();
    const skills = (G.player && G.player.skills) || {};
    for (const id of Object.keys(SKILLS)) {
      if (!skills[id]) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "slot";
      el.dataset.skill = id;
      el.setAttribute("aria-label", SKILLS[id].name);
      const b = document.createElement("b");
      b.textContent = SKILLS[id].key;
      const i = document.createElement("i");
      i.textContent = SKILL_SHORT[id];
      const em = document.createElement("em");
      el.append(b, i, em);
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pressSkill(id);
      });
      wrap.appendChild(el);
    }
  }

  function beginMatch(showHelp) {
    stopOnline();
    net.mode = "bots";
    buildWorld(false);
    buildSlots();
    showScreen("match");
    resetStick();
    $("result").classList.add("hidden");
    $("search-overlay").classList.add("hidden");
    G.pausedForHelp = showHelp && !session.helpSeen;
    $("help").classList.toggle("hidden", !G.pausedForHelp);
    resizeIfNeeded();
    G.camX = G.player.x;
    G.camY = G.player.y;
  }

  function onKeyDown(e) {
    unlockAudio();
    if (e.repeat) return;
    if (!$("picker").classList.contains("hidden")) return;
    if ($("loadout") && !$("loadout").classList.contains("hidden")) return;
    G.keys[e.code] = true;
    const matchOn = !$("screen-match").classList.contains("hidden");
    if (!matchOn) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (G.pausedForHelp) {
      if (e.code === "Enter" || e.code === "Escape") dismissHelp();
      return;
    }
    if (G.phase !== "play") return;
    const p = G.player;
    if (KEY_SKILL[e.code]) pressSkill(KEY_SKILL[e.code]);
    else if (e.code === "KeyF") {
      if (isGuest()) queueAction("throw");
      else throwDiamond(p);
    } else if (e.code === "KeyE") {
      if (isGuest()) queueAction("interact");
      else interact(p);
    } else if (e.code === "Space") {
      if (rootLocked(p)) return;
      if (isGuest()) queueAction("hop");
      else hop(p);
    } else if (e.code === "KeyJ") {
      if (rootLocked(p)) { float(p, "CHANNELING", "#ffb0b0"); return; }
      if (isGuest()) { queueAction("swing"); beginSwingVisual(p); }
      else if (p.carrying) float(p, "CAN'T ATTACK", "#fff");
      else trySwing(p);
    } else if (e.code === "KeyV") {
      if (p.carrying) float(p, "HANDS FULL", "#fff");
      else {
        p.weapon = p.weapon === "sword" ? "bare" : "sword";
        float(p, p.weapon === "sword" ? "SWORD" : "BARE HAND", "#fff");
      }
    } else if (e.code === "KeyH") toggleHelp();
  }

  function onKeyUp(e) { G.keys[e.code] = false; }

  function screenToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return {
      x: (sx - rect.width / 2) / G.zoom + G.camX,
      y: (sy - rect.height / 2) / G.zoom + G.camY
    };
  }

  function dismissHelp() {
    G.pausedForHelp = false;
    session.helpSeen = true;
    $("help").classList.add("hidden");
  }

  function toggleHelp() {
    if (G.phase !== "play") return;
    G.pausedForHelp = !G.pausedForHelp;
    $("help").classList.toggle("hidden", !G.pausedForHelp);
  }

  let accountTimer = null;

  function accountSnapshot() {
    return {
      name: profile.name || "",
      gender: profile.gender,
      coins: profile.coins,
      diamonds: profile.diamonds,
      statPoints: profile.statPoints,
      stats: profile.stats,
      cards: profile.cards,
      unlocked: profile.unlocked,
      equipped: profile.equipped,
      freeUnlocks: profile.freeUnlocks,
      tokens: profile.tokens,
      pendingDraw: profile.pendingDraw,
      wins: profile.wins,
      matches: profile.matches
    };
  }

  function queueAccountSave() {
    if (!auth.session || !profile) return;
    clearTimeout(accountTimer);
    accountTimer = setTimeout(() => { pushAccount(); }, 250);
  }

  async function pushAccount() {
    if (!auth.session || !profile) return;
    await fetch("/api/auth/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: auth.session, profile: accountSnapshot() })
    }).catch(() => {});
  }

  function applyServerProfile(data) {
    const next = Object.assign(defaultProfile(), data || {});
    next.stats = Object.assign({ agi: 0, spd: 0, str: 0, pwr: 0, int: 0 }, (data && data.stats) || {});
    next.cards = Object.assign({ fireball: 0, ice: 0, firesword: 0, lightning: 0, mega: 0, saber: 0 }, (data && data.cards) || {});
    next.unlocked = Object.assign({ fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false }, (data && data.unlocked) || {});
    next.equipped = Object.assign({ fireball: false, ice: false, firesword: false, lightning: false, mega: false, saber: false }, (data && data.equipped) || {});
    next.name = (data && data.name) || "";
    profile = next;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (err) { /* private mode */ }
    paintGender();
    paintAccount();
  }

  function paintAccount() {
    const out = $("account-signed-out");
    const nameBox = $("account-name");
    const hello = $("account-hello");
    const block = $("google-block");
    if (!out || !nameBox || !hello || !block) return;
    if (auth.blocked) block.textContent = auth.blocked;
    const signed = !!auth.session;
    out.classList.toggle("hidden", signed);
    if (!signed) {
      nameBox.classList.add("hidden");
      hello.classList.add("hidden");
      return;
    }
    if (!profile || !profile.name) {
      nameBox.classList.remove("hidden");
      hello.classList.add("hidden");
      return;
    }
    nameBox.classList.add("hidden");
    hello.classList.remove("hidden");
    const via = auth.kind === "google" ? "Google" : "this browser";
    hello.textContent = "Signed in with " + via + " as " + profile.name + ".";
  }

  async function bootAuth() {
    try {
      const cfg = await fetch("/api/auth/config").then((r) => r.json());
      auth.google = !!cfg.google;
      auth.blocked = cfg.blocked || "";
      if (cfg.google && cfg.clientId) mountGoogle(cfg.clientId);
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const me = await fetch("/api/auth/me?session=" + encodeURIComponent(saved)).then((r) => r.json());
        if (me && me.profile) {
          auth.session = saved;
          auth.kind = me.kind || "browser";
          applyServerProfile(me.profile);
        } else localStorage.removeItem(SESSION_KEY);
      }
    } catch (err) {
      auth.blocked = auth.blocked || "The account server is not reachable from this page.";
    }
    paintAccount();
    paintGender();
  }

  function loadGis() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.gis = "1";
      script.onload = () => resolve();
      script.onerror = () => {
        gisPromise = null;
        reject(new Error("gis"));
      };
      document.head.appendChild(script);
    });
    return gisPromise;
  }

  function mountGoogle(clientId) {
    loadGis().then(() => {
      if (!window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => { sendGoogleCredential(response && response.credential); }
      });
      const host = $("google-button");
      if (host && !host.childElementCount) {
        google.accounts.id.renderButton(host, { theme: "outline", size: "large", text: "signin_with" });
      }
    }).catch(() => {});
  }

  async function signInGoogle() {
    const btn = $("btn-google");
    if (btn) btn.textContent = "Opening Google…";
    googlePhase = "opening";
    let cfg = { clientId: "", blocked: "" };
    try {
      cfg = await fetch("/api/auth/config").then((r) => r.json());
    } catch (err) {
      cfg = { clientId: "", blocked: "Google sign-in cannot open because this server has no Google OAuth client id." };
    }
    try { await loadGis(); } catch (err) { /* the client id check still reports the blocker */ }
    if (!cfg.clientId) {
      auth.google = false;
      auth.blocked = cfg.blocked || "Google sign-in cannot open because this server has no Google OAuth client id.";
      googlePhase = "blocked";
      if (btn) btn.textContent = "Sign in with Google";
      paintAccount();
      return;
    }
    if (!window.google || !google.accounts || !google.accounts.id) {
      auth.blocked = "Google sign-in cannot open because this server has no Google OAuth client id.";
      googlePhase = "blocked";
      if (btn) btn.textContent = "Sign in with Google";
      paintAccount();
      return;
    }
    auth.blocked = "";
    auth.google = true;
    google.accounts.id.initialize({
      client_id: cfg.clientId,
      callback: (response) => { sendGoogleCredential(response && response.credential); },
      auto_select: false
    });
    google.accounts.id.prompt();
    googlePhase = "prompt";
    if (btn) btn.textContent = "Sign in with Google";
    paintAccount();
  }

  async function sendGoogleCredential(credential) {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential })
    });
    const data = await res.json();
    if (!data.session) {
      if (data.blocked) auth.blocked = data.blocked;
      paintAccount();
      return;
    }
    acceptSession(data);
  }

  function acceptSession(data) {
    auth.session = data.session;
    auth.kind = data.kind || "browser";
    try { localStorage.setItem(SESSION_KEY, data.session); } catch (err) { /* private mode */ }
    if (!profile) profile = defaultProfile();
    applyServerProfile(data.profile || {});
  }

  async function signInBrowser() {
    let browserId = "";
    try { browserId = localStorage.getItem(BROWSER_KEY) || ""; } catch (err) { browserId = ""; }
    if (!browserId) browserId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    try { localStorage.setItem(BROWSER_KEY, browserId); } catch (err) { /* private mode */ }
    const res = await fetch("/api/auth/browser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browserId })
    });
    const data = await res.json();
    if (!data.session) return;
    acceptSession(data);
  }

  async function saveDisplayName() {
    const verdict = acceptName($("display-name").value);
    const err = $("name-error");
    if (!verdict.ok) {
      if (err) err.textContent = verdict.error;
      return;
    }
    const res = await fetch("/api/auth/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: auth.session, name: verdict.name })
    });
    const data = await res.json();
    if (!data.ok) {
      if (err) err.textContent = data.error || "Use at most 8 words.";
      return;
    }
    if (err) err.textContent = "";
    profile.name = data.name;
    save();
    paintAccount();
    paintGender();
  }

  function bind() {
    $("gender-male").addEventListener("click", () => selectGender("male"));
    $("gender-female").addEventListener("click", () => selectGender("female"));
    $("title-continue").addEventListener("click", () => {
      if (!profile.gender) return;
      save();
      showScreen("armory");
      renderArmory();
    });
    $("btn-suggested").addEventListener("click", () => {
      applySuggested();
      setStatus("Suggested build: 2 in every stat. Fireball and Lightning Quick Move unlocked if you had the cards.");
      renderArmory();
    });
    $("btn-start").addEventListener("click", () => openLoadout("help"));
    $("btn-look").addEventListener("click", () => { showScreen("title"); paintGender(); });
    $("btn-token").addEventListener("click", async () => {
      if (profile.tokens < 1) { setStatus("No skill draw tokens. Win a match to earn one."); return; }
      const pool = await choosePool("Spend 1 skill draw token", "One draw is 5 cards, split at random across the two skills in the pool.");
      if (!pool) return;
      profile.tokens -= 1;
      const got = grantDraws(pool, 1);
      setStatus("Token draw: " + formatGot(got) + ".");
      renderArmory();
    });
    $("btn-premium").addEventListener("click", async () => {
      if (profile.diamonds < 1000) { setStatus("Premium costs 1,000 diamonds."); return; }
      const pool = await choosePool("Premium — 10 draws", "Spend 1,000 diamonds for 10 draws (50 cards) in one pool.");
      if (!pool) return;
      profile.diamonds -= 1000;
      const got = grantDraws(pool, 10);
      setStatus("Premium: " + formatGot(got) + ".");
      renderArmory();
    });
    $("pick-magic").addEventListener("click", () => closePicker("magic"));
    $("pick-sword").addEventListener("click", () => closePicker("sword"));
    $("pick-cancel").addEventListener("click", () => closePicker(null));
    $("btn-restart").addEventListener("click", () => openLoadout("bots"));
    $("loadout-go").addEventListener("click", confirmLoadout);
    $("loadout-cancel").addEventListener("click", () => {
      $("loadout").classList.add("hidden");
      loadoutNext = null;
    });
    $("btn-help").addEventListener("click", () => { if (G.phase === "play") toggleHelp(); });
    $("help-go").addEventListener("click", dismissHelp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousemove", (e) => {
      const w = screenToWorld(e);
      G.mouse.wx = w.x; G.mouse.wy = w.y; G.mouse.valid = true;
    });
    canvas.addEventListener("mousedown", (e) => {
      unlockAudio();
      if (G.phase !== "play" || G.pausedForHelp) return;
      const w = screenToWorld(e);
      const p = G.player;
      if (!p || p.dead) return;
      G.mouse.wx = w.x; G.mouse.wy = w.y; G.mouse.valid = true;
      p.aim = Math.atan2(w.y - p.y, w.x - p.x);
      if (e.button === 2) {
        if (p.carrying) {
          if (isGuest()) queueAction("throw");
          else throwDiamond(p);
        } else p.clickTarget = w;
      } else if (e.button === 0) {
        if (isGuest()) { queueAction("swing"); beginSwingVisual(p); }
        else if (p.carrying) float(p, "CAN'T ATTACK", "#fff");
        else trySwing(p);
      }
    });
    bindStick();
    const throwBtn = $("btn-throw");
    if (throwBtn) {
      throwBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pressThrow();
      });
    }
    const guardBtn = $("btn-guard");
    if (guardBtn) {
      guardBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pressGuard();
      });
    }
    $("btn-online").addEventListener("click", () => { if (!$("btn-online").disabled) openLoadout("online"); });
    $("search-cancel").addEventListener("click", () => cancelSearch());
    const browserBtn = $("btn-browser");
    if (browserBtn) browserBtn.addEventListener("click", () => { signInBrowser(); });
    const googleBtn = $("btn-google");
    if (googleBtn) googleBtn.addEventListener("click", () => { signInGoogle(); });
    const nameBtn = $("btn-name");
    if (nameBtn) nameBtn.addEventListener("click", () => { saveDisplayName(); });
    const attack = $("btn-attack");
    if (attack) {
      attack.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pressAttack();
      });
    }
    window.addEventListener("resize", resizeIfNeeded);
    window.addEventListener("error", (e) => {
      const el = $("boot-error");
      el.hidden = false;
      el.textContent = String(e.message || e.error || "error");
    });
  }

  function resetStick() {
    if (G.stick) {
      G.stick.active = false;
      G.stick.x = 0;
      G.stick.y = 0;
      G.stick.id = null;
    }
    const el = $("stick");
    const knob = $("stick-knob");
    if (el) el.classList.remove("hot");
    if (knob) knob.style.transform = "translate(0px,0px)";
  }

  function bindStick() {
    const el = $("stick");
    const knob = $("stick-knob");
    if (!el || !knob) return;
    let usingPointer = false;

    function place(clientX, clientY) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.36;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const len = Math.hypot(dx, dy);
      const mag = len < 0.001 ? 0 : Math.min(1, len / max);
      const nx = len < 0.001 ? 0 : (dx / len) * mag;
      const ny = len < 0.001 ? 0 : (dy / len) * mag;
      knob.style.transform = "translate(" + (nx * max) + "px," + (ny * max) + "px)";
      G.stick.active = true;
      G.stick.x = nx;
      G.stick.y = ny;
      el.classList.add("hot");
    }

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      usingPointer = true;
      G.stick.id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* element still tracks the drag */ }
      place(e.clientX, e.clientY);
    });
    el.addEventListener("pointermove", (e) => {
      if (!usingPointer || G.stick.id !== e.pointerId) return;
      e.preventDefault();
      place(e.clientX, e.clientY);
    });
    function endPointer(e) {
      if (!usingPointer || G.stick.id !== e.pointerId) return;
      usingPointer = false;
      resetStick();
    }
    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    el.addEventListener("touchstart", (e) => {
      if (usingPointer || e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      G.stick.id = "touch";
      const t = e.touches[0];
      place(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      if (usingPointer || G.stick.id !== "touch") return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) place(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener("touchend", (e) => {
      if (usingPointer || G.stick.id !== "touch") return;
      e.preventDefault();
      resetStick();
    }, { passive: false });
    el.addEventListener("touchcancel", () => {
      if (!usingPointer && G.stick.id === "touch") resetStick();
    });
  }

  function sampleWish() {
    const u = G.player;
    let mx = 0;
    let my = 0;
    if (G.keys.KeyW || G.keys.ArrowUp) my -= 1;
    if (G.keys.KeyS || G.keys.ArrowDown) my += 1;
    if (G.keys.KeyA || G.keys.ArrowLeft) mx -= 1;
    if (G.keys.KeyD || G.keys.ArrowRight) mx += 1;
    let wishX = 0;
    let wishY = 0;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      wishX = mx / len;
      wishY = my / len;
    } else {
      const st = G.stick;
      const sm = st && st.active ? Math.hypot(st.x, st.y) : 0;
      if (sm > 0.18) {
        wishX = st.x / sm;
        wishY = st.y / sm;
      } else if (u && u.clickTarget) {
        const dx = u.clickTarget.x - u.x;
        const dy = u.clickTarget.y - u.y;
        const len = Math.hypot(dx, dy);
        if (len >= 0.35) { wishX = dx / len; wishY = dy / len; }
      }
    }
    let aim = u ? u.facing : 0;
    if (u && G.mouse.valid) aim = Math.atan2(G.mouse.wy - u.y, G.mouse.wx - u.x);
    else if (u && typeof u.aim === "number") aim = u.aim;
    return { mx: wishX, my: wishY, aim };
  }

  function captureState() {
    return {
      phase: G.phase,
      result: G.result,
      clock: G.clock,
      time: G.time,
      takedowns: G.takedowns.slice(),
      kill: G.killCall ? { text: G.killCall.text, spoken: G.killCall.spoken, t: G.killCall.t } : null,
      units: G.units.map((u) => ({
        id: u.id, x: u.x, y: u.y, hp: u.hp, mp: u.mp, facing: u.facing, aim: u.aim,
        dead: u.dead, respawn: u.respawn, wishX: u.wishX, wishY: u.wishY,
        gait: u.gait, moveBlend: u.moveBlend, attackWind: u.attackWind, attackDur: u.attackDur || 0,
        swingVis: u.swingVis, swingDur: u.swingDur || 0, recover: u.recover || 0,
        recoverDur: u.recoverDur || 0, recoverKind: u.recoverKind || "",
        castName: (u.cast && u.cast.name) || "",
        castT: u.cast ? u.cast.t : 0,
        castDur: u.cast ? u.cast.dur : 0,
        flourishName: u.flourish ? u.flourish.name : "",
        flourishT: u.flourish ? u.flourish.t : 0,
        flourishDur: u.flourish ? u.flourish.dur : 0,
        flourishRecover: !!(u.flourish && u.flourish.recoverOnly),
        dashT: u.dash ? u.dash.t : 0,
        dashDur: u.dash ? u.dash.dur : 0,
        guard: !!(u.guard && u.carrying),
        shock: u.shock || 0,
        slowCast: u.slowCast || 0,
        megaT: u.channel && u.channel.kind === "mega" ? u.channel.t : 0,
        megaX: u.channel && u.channel.kind === "mega" ? u.channel.x : 0,
        megaY: u.channel && u.channel.kind === "mega" ? u.channel.y : 0,
        megaDur: u.channel && u.channel.kind === "mega" ? u.channel.dur : 0,
        megaR: u.channel && u.channel.kind === "mega" ? (u.channel.r || MEGA_RADIUS) : 0,
        saberT: u.channel && u.channel.kind === "saber" ? u.channel.t : 0,
        saberX: u.channel && u.channel.kind === "saber" ? u.channel.x : 0,
        saberY: u.channel && u.channel.kind === "saber" ? u.channel.y : 0,
        saberAng: u.channel && u.channel.kind === "saber" ? (u.channel.ang || 0) : 0,
        saberDur: u.channel && u.channel.kind === "saber" ? u.channel.dur : 0,
        saberLen: u.channel && u.channel.kind === "saber" ? (u.channel.len || SABER_LEN) : 0,
        saberW: u.channel && u.channel.kind === "saber" ? (u.channel.w || SABER_W) : 0
      })),
      diamonds: G.diamonds.map((d) => ({
        team: d.team, x: d.x, y: d.y, atHome: d.atHome, bank: d.bank, inFlight: d.inFlight,
        dropDelay: d.dropDelay, carrierId: d.carrier ? d.carrier.id : null
      })),
      shots: G.shots.slice(0, 16).map((s) => ({
        kind: s.kind, x: s.x, y: s.y, vx: s.vx || 0, vy: s.vy || 0, team: s.team,
        r: s.r, life: s.life,
        diamondTeam: s.diamond ? s.diamond.team : null
      })),
      fires: (G.fires || []).slice(-180).map((f) => ({ x: f.x, y: f.y, r: f.r, t: f.t })),
      keeps: (G.keeps || []).map((k) => ({
        id: k.id, hp: k.hp, owner: k.owner, cap: k.cap, capTeam: k.capTeam, down: k.down
      })),
      megaBooms: (G.megaHeard || []).slice(-8),
      saberBlasts: (G.saberHeard || []).slice(-8)
    };
  }

  function applyState(snap) {
    if (!snap || !G.player) return;
    G.clock = snap.clock;
    G.time = snap.time || G.time;
    if (snap.takedowns) G.takedowns = snap.takedowns.slice();
    for (const su of snap.units || []) {
      const u = G.units.find((unit) => unit.id === su.id);
      if (!u) continue;
      if (u.isPlayer) {
        if (su.dead && !u.dead) {
          if (!u.holdingRespawn) {
            u.dead = true;
            u.hp = 0;
            u.respawn = su.respawn > 0 ? su.respawn : 6;
            u.holdingRespawn = true;
            u.cast = null;
            u.dash = null;
            u.hop = null;
            u.flight = null;
            u.burn = null;
            u.channel = null;
            clearGuard(u);
          }
        } else if (u.dead && su.dead) {
          if (typeof su.respawn === "number" && su.respawn + 0.05 < u.respawn) u.respawn = su.respawn;
        } else if (u.dead && !su.dead && u.holdingRespawn) {
          respawn(u);
          u.holdingRespawn = false;
        } else if (!u.dead && !su.dead) {
          u.holdingRespawn = false;
          u.hp = su.hp;
          u.mp = su.mp;
          applyTimers(u, su);
          applyMegaChannel(u, su);
        } else if (rootLocked(u)) u.channel = null;
        u.carrying = null;
        continue;
      }
      if (u.isRemote) {
        if (su.dead && !u.dead) {
          u.dead = true;
          u.hp = 0;
          u.respawn = su.respawn > 0 ? su.respawn : 6;
          u.x = su.x;
          u.y = su.y;
          net.buffer = [];
          net.rejectFarUntil = performance.now() + 1200;
          u.channel = null;
        } else if (!su.dead && u.dead) {
          respawn(u);
        } else if (!u.dead) {
          u.hp = su.hp;
          u.mp = su.mp;
          u.attackWind = su.attackWind;
          u.swingVis = su.swingVis;
          applyMotionState(u, su);
          if (su.guard != null) u.guard = !!su.guard;
          applyTimers(u, su);
          applyMegaChannel(u, su);
        } else if (rootLocked(u)) u.channel = null;
        u.carrying = null;
        continue;
      }
      if (su.guard != null) u.guard = !!su.guard;
      u.x = su.x; u.y = su.y;
      u.facing = su.facing; u.aim = su.aim;
      u.wishX = su.wishX; u.wishY = su.wishY;
      u.gait = su.gait; u.moveBlend = su.moveBlend;
      u.hp = su.hp; u.mp = su.mp; u.dead = su.dead; u.respawn = su.respawn;
      u.attackWind = su.attackWind; u.swingVis = su.swingVis;
      applyMotionState(u, su);
      applyTimers(u, su);
      applyMegaChannel(u, su);
      u.carrying = null;
    }
    for (const sd of snap.diamonds || []) {
      const d = G.diamonds.find((gem) => gem.team === sd.team);
      if (!d) continue;
      d.x = sd.x; d.y = sd.y; d.atHome = sd.atHome; d.bank = sd.bank;
      d.inFlight = sd.inFlight; d.dropDelay = sd.dropDelay;
      d.carrier = sd.carrierId ? G.units.find((unit) => unit.id === sd.carrierId) : null;
      if (d.carrier) d.carrier.carrying = d;
    }
    for (const u of G.units) {
      if (u.dead || !u.carrying) clearGuard(u);
      else if (!u.isPlayer && u.mp <= 0) {
        u.guard = false;
        u.guardBlock = true;
      }
    }
    G.shots = (snap.shots || []).map((s) => ({
      kind: s.kind, x: s.x, y: s.y, vx: s.vx || 0, vy: s.vy || 0, team: s.team,
      r: s.kind === "fireball" ? (s.r || 0.95) : (s.r || 0.2),
      life: s.life == null ? 1 : s.life,
      diamond: s.diamondTeam == null ? null : { team: s.diamondTeam }
    }));
    if (snap.fires) G.fires = snap.fires.map((f) => ({ x: f.x, y: f.y, r: f.r || 0.45, t: f.t }));
    if (snap.keeps && G.keeps) {
      for (const sk of snap.keeps) {
        const k = G.keeps.find((keep) => keep.id === sk.id);
        if (!k) continue;
        k.hp = sk.hp;
        k.owner = sk.owner;
        k.cap = sk.cap;
        k.capTeam = sk.capTeam;
        k.down = sk.down;
      }
    }
    hearMegaBooms(snap.megaBooms);
    hearSaberBlasts(snap.saberBlasts);
    if (snap.kill) {
      if (!G.killCall || G.killCall.text !== snap.kill.text) speakLine(snap.kill.spoken || snap.kill.text);
      G.killCall = { text: snap.kill.text, spoken: snap.kill.spoken, t: snap.kill.t };
    } else G.killCall = null;
    if (snap.phase === "result" && G.phase === "play" && snap.result) endMatch(snap.result);
  }

  function applyTimers(u, su) {
    if (typeof su.shock === "number") u.shock = su.shock;
    if (typeof su.slowCast === "number") u.slowCast = su.slowCast;
  }

  function applyMegaChannel(u, su) {
    if (!u || !su) return;
    if (su.saberT > 0.02) {
      u.channel = {
        kind: "saber",
        t: su.saberT,
        dur: su.saberDur || SABER_TIME,
        x: su.saberX,
        y: su.saberY,
        ang: su.saberAng || 0,
        len: su.saberLen || SABER_LEN,
        w: su.saberW || SABER_W
      };
      u.wishX = 0;
      u.wishY = 0;
      u.clickTarget = null;
      return;
    }
    if (su.megaT > 0.02) {
      u.channel = {
        kind: "mega",
        t: su.megaT,
        dur: su.megaDur || MEGA_TIME,
        x: su.megaX,
        y: su.megaY,
        r: su.megaR || MEGA_RADIUS
      };
      u.wishX = 0;
      u.wishY = 0;
      u.clickTarget = null;
      return;
    }
    if (u.channel && (u.channel.kind === "mega" || u.channel.kind === "saber") && !u.channel.predict) u.channel = null;
  }

  function hearSaberBlasts(list) {
    G.heardBlastIds = G.heardBlastIds || {};
    for (const blast of list || []) {
      if (!blast || G.heardBlastIds[blast.id]) continue;
      G.heardBlastIds[blast.id] = true;
      playSaberBlast();
      burst(blast.x, blast.y, "#ffe9a0", 18, 3.2);
      G.shake = Math.max(G.shake || 0, 1.05);
      G.saberFx = G.saberFx || [];
      G.saberFx.push({
        x: blast.ox != null ? blast.ox : blast.x,
        y: blast.oy != null ? blast.oy : blast.y,
        ang: blast.ang || 0,
        len: blast.len || SABER_LEN,
        w: blast.w || SABER_W,
        t: 0.9,
        dur: 0.9
      });
    }
  }

  function hearMegaBooms(list) {
    G.heardBoomIds = G.heardBoomIds || {};
    for (const boom of list || []) {
      if (!boom || G.heardBoomIds[boom.id]) continue;
      G.heardBoomIds[boom.id] = true;
      playMegaBoom();
      burst(boom.x, boom.y, "#ffb0a0", 26, 4);
      G.shake = Math.max(G.shake || 0, 1.2);
      G.megaFx = G.megaFx || [];
      G.megaFx.push({ x: boom.x, y: boom.y, t: 1.7, dur: 1.7, r: MEGA_RADIUS });
    }
  }

  function applyMotionState(u, su) {
    if (su.attackDur) u.attackDur = su.attackDur;
    if (su.swingDur) u.swingDur = su.swingDur;
    if (typeof su.recover === "number") u.recover = su.recover;
    if (su.recoverDur) u.recoverDur = su.recoverDur;
    if (su.recoverKind) u.recoverKind = su.recoverKind;
    u.perform = su.castName ? { name: su.castName, t: su.castT || 0, dur: su.castDur || 0.5 } : null;
    u.flourish = su.flourishName ? {
      name: su.flourishName,
      t: su.flourishT || 0,
      dur: su.flourishDur || 0.4,
      recoverOnly: !!su.flourishRecover
    } : null;
    if (!u.dash) u.performDash = su.dashT > 0 ? { t: su.dashT, dur: su.dashDur || 0.25 } : null;
  }

  function decayVisual(u, dt) {
    if (u.perform && !u.cast) {
      u.perform.t -= dt;
      if (u.perform.t <= 0) u.perform = null;
    }
    if (u.performDash && !u.dash) {
      u.performDash.t -= dt;
      if (u.performDash.t <= 0) u.performDash = null;
    }
    if (u.flourish) {
      u.flourish.t -= dt;
      if (u.flourish.t <= 0) u.flourish = null;
    }
    if (u.attackWind > 0) u.attackWind = Math.max(0, u.attackWind - dt);
    if (u.swingVis > 0) u.swingVis = Math.max(0, u.swingVis - dt);
    if (u.recover > 0) u.recover = Math.max(0, u.recover - dt);
  }

  function onlineBody(name) {
    const skills = {};
    for (const id of Object.keys(SKILLS)) skills[id] = !!(profile.unlocked[id] && profile.equipped[id]);
    return { name, gender: profile.gender || "female", stats: profile.stats, skills };
  }

  function chosenName() {
    const field = $("online-name");
    const typed = field ? field.value.trim() : "";
    const picked = typed || (profile && profile.name) || "";
    const named = acceptName(picked);
    if (named.ok) return named.name;
    if (!picked) {
      const name = NAMES[Math.floor(Math.random() * NAMES.length)];
      if (field) field.value = name;
      return name;
    }
    return null;
  }

  function angLerp(a, b, k) {
    const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + d * k;
  }

  function pushPoseSample(pose) {
    if (!pose || typeof pose.x !== "number" || typeof pose.y !== "number") return;
    const seq = Number(pose.seq) || 0;
    if (seq && seq <= net.lastPoseSeq) return;
    if (seq) net.lastPoseSeq = seq;
    const life = Number(pose.life) || 0;
    const remote = G.units && G.units.find((unit) => unit.isRemote);
    const now = performance.now();
    if (net.remoteLife != null && life < net.remoteLife) return;
    if (Number(net.team) === 0 && remote) {
      net.remoteInput = pose;
      readRemote(remote);
      if (pose.guard != null) {
        if (!pose.guard || pose.dead) {
          remote.guard = false;
          if (!pose.guard) remote.guardBlock = false;
        } else if (!remote.guardBlock && remote.carrying && remote.mp > 0.001) remote.guard = true;
        else remote.guard = false;
      }
    }
    if (net.remoteLife != null && life !== net.remoteLife) {
      net.remoteLife = life;
      net.buffer = [];
      net.rejectFarUntil = now + 1200;
      if (remote) {
        remote.x = pose.x;
        remote.y = pose.y;
        remote.facing = Number(pose.facing) || 0;
        remote.aim = Number(pose.aim) || remote.facing;
        remote.dead = !!pose.dead;
        remote.respawn = pose.dead ? (remote.respawn || 6) : 0;
        if (!pose.dead && remote.hp <= 0) remote.hp = remote.maxHp;
      }
      return;
    }
    if (pose.dead) {
      if (remote && !remote.dead) {
        remote.dead = true;
        remote.hp = 0;
        remote.x = pose.x;
        remote.y = pose.y;
        remote.respawn = 6;
        net.buffer = [];
        net.rejectFarUntil = now + 1200;
      }
      net.remoteLife = life;
      return;
    }
    if (now < net.rejectFarUntil && remote && Math.hypot(pose.x - remote.x, pose.y - remote.y) > 6) return;
    net.remoteLife = life;
    const prev = net.buffer[net.buffer.length - 1];
    const t = prev && now - prev.t < 10 ? prev.t + 32 : now;
    net.buffer.push({
      t,
      x: pose.x,
      y: pose.y,
      facing: Number(pose.facing) || 0,
      aim: Number(pose.aim) || 0
    });
    if (net.buffer.length > 40) net.buffer.shift();
  }

  function interpolateRemote() {
    const u = G.units && G.units.find((unit) => unit.isRemote);
    if (!u || u === G.player || u.dead || !net.buffer.length) return;
    const now = performance.now() - 70;
    const buf = net.buffer;
    let i = 0;
    while (i < buf.length - 1 && buf[i + 1].t <= now) i++;
    const a = buf[i];
    const b = buf[Math.min(i + 1, buf.length - 1)];
    let x = a.x;
    let y = a.y;
    let facing = a.facing;
    let aim = a.aim;
    if (a !== b && b.t > a.t) {
      const k = clamp((now - a.t) / (b.t - a.t), 0, 1);
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      facing = angLerp(a.facing, b.facing, k);
      aim = angLerp(a.aim, b.aim, k);
    } else if (buf.length >= 2 && now > buf[buf.length - 1].t) {
      const prev = buf[buf.length - 2];
      const newest = buf[buf.length - 1];
      const span = Math.max(16, newest.t - prev.t);
      const extra = Math.min(48, now - newest.t);
      x = newest.x + (newest.x - prev.x) / span * extra;
      y = newest.y + (newest.y - prev.y) / span * extra;
      facing = newest.facing;
      aim = newest.aim;
    }
    const dx = x - u.x;
    const dy = y - u.y;
    u.x = x;
    u.y = y;
    u.facing = facing;
    u.aim = aim;
    const moved = Math.hypot(dx, dy);
    if (moved > 0.001) {
      u.wishX = dx / moved;
      u.wishY = dy / moved;
      u.gait = ((u.gait || 0) + 0.016 / 0.36) % 1;
      u.moveBlend = Math.min(1, (u.moveBlend || 0) + 0.25);
    } else {
      u.wishX = 0;
      u.wishY = 0;
      u.moveBlend = Math.max(0, (u.moveBlend || 0) - 0.08);
    }
    if (u.carrying) {
      u.carrying.x = u.x;
      u.carrying.y = u.y - 0.2;
    }
  }

  let searchGen = 0;

  function stopOnline() {
    net.searching = false;
    searchGen += 1;
    net.mode = "bots";
    if (net.timer) clearInterval(net.timer);
    net.timer = null;
    const token = net.token;
    net.token = null;
    net.you = null;
    net.foe = null;
    net.remoteInput = null;
    net.remoteLife = null;
    net.rejectFarUntil = 0;
    net.sentAt = 0;
    if (token) {
      fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      }).catch(() => {});
    }
  }

  async function netTick() {
    if (net.mode !== "online" || !net.token || !G.player) return;
    if (net.busy >= 2) return;
    const wish = sampleWish();
    const pose = {
      x: G.player.x,
      y: G.player.y,
      facing: G.player.facing,
      aim: wish.aim,
      mx: wish.mx,
      my: wish.my,
      actions: net.pending.splice(0, net.pending.length),
      life: G.player.life || 0,
      dead: !!G.player.dead,
      guard: !!(G.player.guard && G.player.carrying),
      seq: ++net.seq
    };
    const payload = { token: net.token, pose };
    if (Number(net.team) === 0 && G.phase) payload.state = captureState();
    net.busy += 1;
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.pose) pushPoseSample(data.pose);
      if (Number(net.team) === 1 && data.state) applyState(data.state);
    } catch (err) { /* the next tick tries again */ }
    finally { net.busy -= 1; }
  }

  function beginOnline(poll) {
    net.mode = "online";
    net.team = Number(poll.team);
    net.you = poll.you;
    net.foe = poll.foe;
    net.remoteInput = null;
    net.appliedSeq = 0;
    net.seq = 0;
    net.pending = [];
    net.buffer = [];
    net.lastPoseSeq = 0;
    net.busy = 0;
    net.remoteLife = null;
    net.rejectFarUntil = 0;
    net.sentAt = 0;
    buildWorld(true);
    buildSlots();
    showScreen("match");
    resetStick();
    $("result").classList.add("hidden");
    $("search-overlay").classList.add("hidden");
    G.pausedForHelp = false;
    $("help").classList.add("hidden");
    session.helpSeen = true;
    resizeIfNeeded();
    G.camX = G.player.x;
    G.camY = G.player.y;
    if (net.timer) clearInterval(net.timer);
    net.timer = setInterval(netTick, 32);
    netTick();
  }

  async function openOnline() {
    if (!profile || $("btn-online").disabled) return;
    stopOnline();
    const gen = ++searchGen;
    net.searching = true;
    const overlay = $("search-overlay");
    overlay.classList.remove("hidden");
    $("search-status").textContent = "Searching for another player. The match starts as soon as someone else is searching.";
    const field = $("online-name");
    if (field && !field.value.trim() && profile.name) field.value = profile.name;
    const name = chosenName();
    if (!name) {
      $("search-status").textContent = "Use a display name of at most 8 words.";
      net.searching = false;
      return;
    }
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(onlineBody(name))
      });
      const data = await res.json();
      if (gen !== searchGen) return;
      net.token = data.token;
      while (net.searching && gen === searchGen) {
        const poll = await fetch("/api/poll?token=" + encodeURIComponent(net.token)).then((r) => r.json());
        if (gen !== searchGen || !net.searching) return;
        if (poll.status === "matched") {
          net.searching = false;
          beginOnline(poll);
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      if (gen === searchGen) $("search-status").textContent = "The match server is not reachable from this page.";
      net.searching = false;
    }
  }

  function cancelSearch() {
    stopOnline();
    $("search-overlay").classList.add("hidden");
  }

  function closePicker(value) {
    $("picker").classList.add("hidden");
    if (pickerResolve) { const fn = pickerResolve; pickerResolve = null; fn(value); }
  }

  function selectGender(gender) {
    if (!profile) profile = defaultProfile();
    profile.gender = gender;
    paintGender();
    $("title-continue").disabled = false;
  }

  function paintGender() {
    $("gender-male").classList.toggle("selected", profile && profile.gender === "male");
    $("gender-female").classList.toggle("selected", profile && profile.gender === "female");
    const named = !auth.session || !!(profile && profile.name);
    $("title-continue").disabled = !(profile && profile.gender && named);
  }

  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
    last = ts;
    try {
      if (G.phase === "play" && !G.pausedForHelp && !G.frozen) {
        if (net.mode === "online") {
          stepLocal(dt);
          if (Number(net.team) === 0) update(dt, { skipPlayer: true });
          else for (const u of G.units) if (!u.isPlayer) decayVisual(u, dt);
        } else update(dt);
        if (net.mode === "online") {
          interpolateRemote();
          const remote = G.units.find((unit) => unit.isRemote);
          const now = performance.now();
          net.trace = net.trace || [];
          net.trace.push({ t: now, x: G.player.x, rx: remote ? remote.x : null });
          if (net.trace.length > 300) net.trace.shift();
        }
      }
      if (G.phase === "play" || G.phase === "result") draw();
    } catch (err) {
      console.error(err);
      const el = $("boot-error");
      el.hidden = false;
      el.textContent = String(err && err.stack || err);
    }
    requestAnimationFrame(frame);
  }

  bind();
  const params = new URLSearchParams(location.search);
  if (params.has("fresh")) localStorage.removeItem(SAVE_KEY);
  if (!loadProfile()) profile = null;
  if (profile && profile.gender) paintGender();
  if (params.has("autostart")) {
    if (!profile) profile = defaultProfile();
    profile.gender = profile.gender || "female";
    applySuggested();
    for (const id of Object.keys(SKILLS)) profile.unlocked[id] = true;
    const picks = (params.get("loadout") || "fireball,ice,lightning").split(",").filter((id) => SKILLS[id]);
    for (const id of Object.keys(SKILLS)) profile.equipped[id] = picks.indexOf(id) >= 0;
    save();
    session.helpSeen = true;
    beginMatch(false);
  } else {
    showScreen("title");
  }
  bootAuth();

  window.__BF = {
    get phase() { return G.phase; },
    get player() { return G.player; },
    get G() { return G; },
    get map() { return MAP; },
    get profile() { return profile; },
    solid(x, y, team) { return hitsSolid(x, y, 0.48, team); },
    water(x, y) { return inWater(x, y); },
    get paths() { return G.pathWarnings; },
    cast(name) { return tryCast(G.player, name); },
    get booms() { return G.booms || 0; },
    get blasts() { return G.blasts || 0; },
    scheduleBoom(ctx, when) { scheduleMegaBoom(ctx, when); },
    scheduleSaber(ctx, when) { scheduleSaberBlast(ctx, when); },
    swing() { return trySwing(G.player); },
    throwGem() { throwDiamond(G.player); },
    hit(id, amount) {
      const u = G.units.find((unit) => unit.id === id);
      if (!u) return null;
      const before = u.hp;
      const ok = tryHit(u, amount, null, "#fff");
      return { ok, before, after: u.hp, dealt: before - u.hp, guard: !!u.guard };
    },
    interact() { interact(G.player); },
    aim(x, y) { G.mouse.wx = x; G.mouse.wy = y; G.mouse.valid = true; if (G.player) G.player.aim = Math.atan2(y - G.player.y, x - G.player.x); },
    teleport(x, y) { if (G.player) { G.player.x = x; G.player.y = y; } },
    freeze(v) { G.frozen = !!v; },
    step(n) {
      for (let i = 0; i < n; i++) {
        if (net.mode === "online") {
          stepLocal(1 / 60);
          if (Number(net.team) === 0) update(1 / 60, { skipPlayer: true });
          interpolateRemote();
        } else update(1 / 60);
      }
    },
    get googlePhase() { return googlePhase; },
    pose() { return G.player ? actorPose(G.player) : null; },
    key(code, down) { G.keys[code] = !!down; },
    get stick() { return G.stick; },
    get net() { return net; },
    get lastSpoken() { return G.lastSpoken || ""; },
    speedOf(id) {
      const u = G.units.find((unit) => unit.id === id);
      return u ? moveSpeed(u) : null;
    },
    sync() { return netTick(); },
    saveProfile() { save(); return pushAccount(); },
    measure(n) {
      const local = [];
      const remote = [];
      const steps = Math.max(1, n || 1);
      for (let i = 0; i < steps; i++) {
        if (net.mode === "online") {
          stepLocal(1 / 60);
          if (Number(net.team) === 0) update(1 / 60, { skipPlayer: true });
          interpolateRemote();
        } else update(1 / 60);
        local.push(G.player ? G.player.x : null);
        const other = G.units.find((unit) => unit.isRemote);
        remote.push(other ? other.x : null);
      }
      return { local, remote, team: net.team, life: G.player ? G.player.life || 0 : 0 };
    }
  };

  requestAnimationFrame(frame);
})();
