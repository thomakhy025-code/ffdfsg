"use strict";
/* Static host, matchmaking, and account storage for Black Forest. */
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PORT = Number(process.env.PORT || 8765);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

const queue = [];
const tokens = new Map();
const rooms = new Map();
const DATA_FILE = path.join(ROOT, "data", "accounts.json");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const BLOCKED = "Google sign-in cannot open because this server has no Google OAuth client id.";

const store = loadStore();

function loadStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    return {
      accounts: data.accounts || {},
      sessions: data.sessions || {}
    };
  } catch (err) {
    return { accounts: {}, sessions: {} };
  }
}

let storeTimer = null;
function saveStore() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store));
  }, 40);
}

function displayName(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { ok: false, error: "Enter a display name." };
  if (words.length > 8) return { ok: false, error: "Use at most 8 words." };
  return { ok: true, name: words.join(" ") };
}

function blankAccount(key) {
  return {
    key,
    name: "",
    gender: null,
    coins: 10000,
    diamonds: 1000,
    statPoints: 10,
    stats: { agi: 0, spd: 0, str: 0, pwr: 0, int: 0 },
    cards: { fireball: 10, ice: 10, firesword: 10, lightning: 10 },
    unlocked: { fireball: false, ice: false, firesword: false, lightning: false },
    equipped: { fireball: false, ice: false, firesword: false, lightning: false },
    freeUnlocks: 2,
    tokens: 0,
    pendingDraw: false,
    wins: 0,
    matches: 0
  };
}

function publicAccount(account) {
  return {
    name: account.name || "",
    gender: account.gender || null,
    coins: account.coins,
    diamonds: account.diamonds,
    statPoints: account.statPoints,
    stats: account.stats,
    cards: account.cards,
    unlocked: account.unlocked,
    equipped: account.equipped,
    freeUnlocks: account.freeUnlocks,
    tokens: account.tokens,
    pendingDraw: !!account.pendingDraw,
    wins: account.wins || 0,
    matches: account.matches || 0
  };
}

function sessionFor(key) {
  const existing = Object.keys(store.sessions).find((token) => store.sessions[token] === key);
  if (existing) return existing;
  const token = id();
  store.sessions[token] = key;
  saveStore();
  return token;
}

function accountBySession(session) {
  const key = store.sessions[session];
  if (!key) return null;
  return store.accounts[key] || null;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function applyProgress(account, body) {
  const src = body || {};
  account.gender = src.gender === "male" ? "male" : (src.gender === "female" ? "female" : account.gender);
  account.coins = num(src.coins, account.coins);
  account.diamonds = num(src.diamonds, account.diamonds);
  account.statPoints = num(src.statPoints, account.statPoints);
  account.freeUnlocks = num(src.freeUnlocks, account.freeUnlocks);
  account.tokens = num(src.tokens, account.tokens);
  account.wins = num(src.wins, account.wins);
  account.matches = num(src.matches, account.matches);
  account.pendingDraw = !!src.pendingDraw;
  const stats = src.stats || {};
  account.stats = {
    agi: num(stats.agi, 0),
    spd: num(stats.spd, 0),
    str: num(stats.str, 0),
    pwr: num(stats.pwr, 0),
    int: num(stats.int, 0)
  };
  const cards = src.cards || {};
  account.cards = {
    fireball: num(cards.fireball, 0),
    ice: num(cards.ice, 0),
    firesword: num(cards.firesword, 0),
    lightning: num(cards.lightning, 0)
  };
  for (const bucket of ["unlocked", "equipped"]) {
    const incoming = src[bucket] || {};
    account[bucket] = {
      fireball: !!incoming.fireball,
      ice: !!incoming.ice,
      firesword: !!incoming.firesword,
      lightning: !!incoming.lightning
    };
  }
  if (src.name !== undefined) {
    const named = displayName(src.name);
    if (!named.ok) return named;
    account.name = named.name;
  }
  saveStore();
  return { ok: true };
}

let googleCerts = { at: 0, keys: [] };
async function googleKeys() {
  if (Date.now() - googleCerts.at < 3600000 && googleCerts.keys.length) return googleCerts.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const json = await res.json();
  googleCerts = { at: Date.now(), keys: json.keys || [] };
  return googleCerts.keys;
}

function b64url(value) {
  const text = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(text.padEnd(text.length + (4 - text.length % 4) % 4, "="), "base64");
}

async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) return { ok: false, blocked: BLOCKED };
  const parts = String(credential || "").split(".");
  if (parts.length !== 3) return { ok: false, error: "Google did not return a usable token." };
  const header = JSON.parse(b64url(parts[0]).toString("utf8"));
  const payload = JSON.parse(b64url(parts[1]).toString("utf8"));
  const keys = await googleKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) return { ok: false, error: "Google signing key was not found." };
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const valid = crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, b64url(parts[2]));
  if (!valid) return { ok: false, error: "Google token signature was rejected." };
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== GOOGLE_CLIENT_ID) return { ok: false, error: "Google token was not issued for this client id." };
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") return { ok: false, error: "Google token issuer was rejected." };
  if (!payload.sub || payload.exp < now) return { ok: false, error: "Google token has expired." };
  return { ok: true, sub: String(payload.sub), name: payload.name || "" };
}

function id() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function publicSide(side) {
  return {
    name: side.name,
    team: side.team,
    gender: side.gender,
    stats: side.stats,
    skills: side.skills
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 100000) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function cleanName(value) {
  const named = displayName(value);
  return named.ok ? named.name : "Player";
}

function sideBlob(body, team) {
  const stats = body.stats || {};
  const skills = body.skills || {};
  return {
    name: cleanName(body.name),
    team,
    gender: body.gender === "male" ? "male" : "female",
    stats: {
      agi: Number(stats.agi) || 0,
      spd: Number(stats.spd) || 0,
      str: Number(stats.str) || 0,
      pwr: Number(stats.pwr) || 0,
      int: Number(stats.int) || 0
    },
    skills: {
      fireball: !!skills.fireball,
      ice: !!skills.ice,
      firesword: !!skills.firesword,
      lightning: !!skills.lightning,
      mega: !!skills.mega,
      saber: !!skills.saber
    }
  };
}

function joinQueue(body) {
  const token = id();
  const player = { token, ts: Date.now(), room: null };
  tokens.set(token, player);
  const waiting = queue.find((entry) => tokens.get(entry.token) && !tokens.get(entry.token).room);
  if (!waiting) {
    player.blob = sideBlob(body, 0);
    queue.push(player);
    return { token, status: "waiting" };
  }
  const host = tokens.get(waiting.token);
  const idx = queue.indexOf(waiting);
  if (idx >= 0) queue.splice(idx, 1);
  const crimson = host.blob;
  const azure = sideBlob(body, 1);
  if (azure.name === crimson.name) {
    azure.name = /\s/.test(azure.name) ? azure.name.replace(/\S+$/, (word) => word + "2") : azure.name + "2";
  }
  const room = {
    id: id(),
    hostToken: host.token,
    players: [
      Object.assign({ token: host.token }, crimson, { team: 0 }),
      Object.assign({ token }, azure, { team: 1 })
    ],
    inputs: {},
    poses: {},
    state: null,
    ended: false
  };
  rooms.set(room.id, room);
  host.room = room;
  player.room = room;
  return { token, status: "matched" };
}

function view(token) {
  const player = tokens.get(token);
  if (!player) return { status: "missing" };
  if (!player.room) return { status: "waiting" };
  const room = player.room;
  if (room.ended) return { status: "ended" };
  const me = room.players.find((p) => p.token === token);
  const foe = room.players.find((p) => p.token !== token);
  let input = room.inputs[foe.token] || null;
  if (input && Date.now() - input.at > 500) {
    input = { mx: 0, my: 0, aim: input.aim, actions: [], seq: input.seq, at: input.at };
  }
  return {
    status: "matched",
    team: me.team,
    room: room.id,
    you: publicSide(me),
    foe: publicSide(foe),
    input,
    state: me.team === 1 ? room.state : null
  };
}

function foePose(room, token) {
  const foe = room.players.find((p) => p.token !== token);
  if (!foe) return null;
  const pose = room.poses[foe.token] || null;
  if (!pose) return null;
  if (Date.now() - pose.at > 400) return null;
  return pose;
}

function sync(token, body) {
  const player = tokens.get(token);
  if (!player || !player.room || player.room.ended) return { ok: false, status: "missing" };
  const room = player.room;
  if (body.pose && typeof body.pose === "object") {
    body.pose.at = Date.now();
    room.poses[token] = body.pose;
    room.inputs[token] = body.pose;
  }
  if (body.state && player.token === room.hostToken) room.state = body.state;
  const me = room.players.find((p) => p.token === token);
  const foe = room.players.find((p) => p.token !== token);
  return {
    ok: true,
    status: "matched",
    team: me.team,
    you: publicSide(me),
    foe: publicSide(foe),
    pose: foePose(room, token),
    state: room.state
  };
}

function push(token, body) {
  const player = tokens.get(token);
  if (!player || !player.room || player.room.ended) return { ok: false };
  const room = player.room;
  if (body.input && typeof body.input === "object") {
    body.input.at = Date.now();
    room.inputs[token] = body.input;
  }
  if (body.state && player.token === room.hostToken) room.state = body.state;
  return { ok: true };
}

function leave(token) {
  const player = tokens.get(token);
  if (!player) return { ok: true };
  const qi = queue.findIndex((entry) => entry.token === token);
  if (qi >= 0) queue.splice(qi, 1);
  if (player.room) player.room.ended = true;
  tokens.delete(token);
  return { ok: true };
}

function serveFile(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || file.endsWith(path.sep + "server.mjs") || file.includes(path.sep + "data" + path.sep)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/api/auth/config" && req.method === "GET") {
      send(res, 200, GOOGLE_CLIENT_ID ? { google: true, clientId: GOOGLE_CLIENT_ID, blocked: "" } : { google: false, blocked: BLOCKED });
      return;
    }
    if (url.pathname === "/api/auth/browser" && req.method === "POST") {
      const body = await readBody(req);
      const browserId = String(body.browserId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      if (browserId.length < 8) {
        send(res, 400, { error: "This browser needs a stable id." });
        return;
      }
      const key = "browser:" + browserId;
      if (!store.accounts[key]) store.accounts[key] = blankAccount(key);
      const session = sessionFor(key);
      send(res, 200, { session, kind: "browser", profile: publicAccount(store.accounts[key]) });
      return;
    }
    if (url.pathname === "/api/auth/google" && req.method === "POST") {
      const body = await readBody(req);
      const checked = await verifyGoogle(body.credential);
      if (!checked.ok) {
        send(res, checked.blocked ? 503 : 400, checked);
        return;
      }
      const key = "google:" + checked.sub;
      if (!store.accounts[key]) store.accounts[key] = blankAccount(key);
      const account = store.accounts[key];
      const named = displayName(checked.name || "");
      if (named.ok && !account.name) {
        account.name = named.name;
        saveStore();
      }
      const session = sessionFor(key);
      send(res, 200, { session, kind: "google", profile: publicAccount(store.accounts[key]) });
      return;
    }
    if (url.pathname === "/api/auth/name" && req.method === "POST") {
      const body = await readBody(req);
      const account = accountBySession(body.session || "");
      if (!account) {
        send(res, 401, { ok: false, error: "Sign in again." });
        return;
      }
      const named = displayName(body.name);
      if (!named.ok) {
        send(res, 400, { ok: false, error: named.error });
        return;
      }
      account.name = named.name;
      saveStore();
      send(res, 200, { ok: true, name: account.name, profile: publicAccount(account) });
      return;
    }
    if (url.pathname === "/api/auth/save" && req.method === "POST") {
      const body = await readBody(req);
      const account = accountBySession(body.session || "");
      if (!account) {
        send(res, 401, { ok: false, error: "Sign in again." });
        return;
      }
      const saved = applyProgress(account, body.profile || {});
      if (!saved.ok) {
        send(res, 400, saved);
        return;
      }
      send(res, 200, { ok: true, profile: publicAccount(account) });
      return;
    }
    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const account = accountBySession(url.searchParams.get("session") || "");
      if (!account) {
        send(res, 200, { profile: null });
        return;
      }
      const kind = account.key.startsWith("google:") ? "google" : "browser";
      send(res, 200, { profile: publicAccount(account), kind });
      return;
    }
    if (url.pathname === "/api/sync" && req.method === "POST") {
      const body = await readBody(req);
      send(res, 200, sync(body.token || "", body));
      return;
    }
    if (url.pathname === "/api/queue" && req.method === "POST") {
      const body = await readBody(req);
      send(res, 200, joinQueue(body));
      return;
    }
    if (url.pathname === "/api/poll" && req.method === "GET") {
      send(res, 200, view(url.searchParams.get("token") || ""));
      return;
    }
    if (url.pathname === "/api/push" && req.method === "POST") {
      const body = await readBody(req);
      send(res, 200, push(body.token || "", body));
      return;
    }
    if (url.pathname === "/api/leave" && req.method === "POST") {
      const body = await readBody(req);
      send(res, 200, leave(body.token || ""));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      send(res, 404, { error: "unknown" });
      return;
    }
    serveFile(req, res);
  } catch (err) {
    send(res, 400, { error: "bad request" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("black-forest listening on http://127.0.0.1:" + PORT);
});
