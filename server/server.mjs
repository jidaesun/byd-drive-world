// BYD DRIVE WORLD 실시간 서버: 정적 파일 제공 + WebSocket 월드 동기화
// 실행: node server/server.mjs  (PORT 환경변수로 포트 지정, 기본 3000)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 30;
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const MODELS = ['atto3', 'seal', 'dolphin', 'sealion7'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, players: players.size })); }
  const rel = normalize(path === '/' ? '/index.html' : path);
  if (rel.includes('..')) { res.writeHead(400); return res.end(); }
  try {
    const buf = await readFile(join(DIST, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(buf);
  } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found — 먼저 npm run build 를 실행하세요.'); }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
/** @type {Map<number, any>} */
const players = new Map();
let nextId = 1;

const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const BODY = ['#f4f4f0', '#9aa0a8', '#2b2f38'], RIM = ['#e9edf2', '#8d939c', '#3a3f4a']; // 화이트·그레이·블랙만 허용
const col = (v, d, ok = BODY) => (typeof v === 'string' && HEX.test(v) && ok.includes(v.toLowerCase()) ? v.toLowerCase() : d);
const int = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
function cleanName(s) {
  s = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return s || '드라이버';
}
function cleanLook(l) {
  l = l && typeof l === 'object' ? l : {};
  return { body: col(l.body, '#f4f4f0'), roof: col(l.roof, '#2b2f38'), twoTone: !!l.twoTone, rim: col(l.rim, '#e9edf2', RIM), wheel: int(l.wheel, 4, 0), decal: int(l.decal, 6, 0), decalCol: col(l.decalCol, '#2b2f38'), plate: int(l.plate, 5, 1) };
}
// ---------- 레이스: 해안도로 한 바퀴. 참가·출발·체크포인트·순위를 모두 서버가 판정한다
const RACE_MAX = 6, RACE_LOBBY_MS = Number(process.env.RACE_LOBBY_MS) || 20000, RACE_COUNT_MS = 4000;
const RACE_LIMIT_MS = 240000, RACE_AFTER_FIRST_MS = 30000, RACE_MIN_MS = Number(process.env.RACE_MIN_MS ?? 28000), CP_RADIUS = 16;
const TRACK = (() => {
  const a = 172, b = 132, x0 = 24, zc = x => b * Math.sqrt(1 - (x / a) ** 2); // client/src/world.ts 의 LOOP, START_X 와 같은 값
  const th0 = Math.atan2(zc(x0) / b, x0 / a), cps = [];
  for (let k = 1; k <= 8; k++) { const th = th0 - k * Math.PI / 4; cps.push([Math.round(a * Math.cos(th) * 10) / 10, Math.round(b * Math.sin(th) * 10) / 10]); }
  const grid = []; // 출발선 뒤 2열 그리드
  for (let i = 0; i < RACE_MAX; i++) { const x = x0 - 6 - Math.floor(i / 2) * 7; grid.push([x, Math.round((zc(x) + (i % 2 ? 2.2 : -2.2)) * 10) / 10, Math.PI / 2]); }
  return { cps, grid };
})();
const race = { phase: 'idle', entrants: new Map(), t0: 0, deadline: 0, best: [] };
const raceState = () => ({ t: 'race', phase: race.phase, ids: [...race.entrants.keys()], left: Math.max(0, race.deadline - Date.now()), max: RACE_MAX });
function raceJoin(p) {
  if (race.phase !== 'idle' && race.phase !== 'lobby') return;
  if (race.entrants.has(p.id) || race.entrants.size >= RACE_MAX) return;
  if (race.phase === 'idle') { race.phase = 'lobby'; race.deadline = Date.now() + RACE_LOBBY_MS; }
  const used = new Set([...race.entrants.values()].map(e => e.slot)); let slot = 0; while (used.has(slot)) slot++;
  race.entrants.set(p.id, { p, slot, cp: 0, done: false, ms: 0 });
  if (race.entrants.size >= RACE_MAX) race.deadline = Math.min(race.deadline, Date.now() + 5000);
  p.ws.send(JSON.stringify({ t: 'race_slot', slot, pos: TRACK.grid[slot] }));
  broadcast(raceState());
}
function raceLeave(p) {
  if (!race.entrants.delete(p.id)) return;
  if (race.entrants.size === 0) { race.phase = 'idle'; race.deadline = 0; }
  broadcast(raceState());
}
function raceProgress(p) {
  const e = race.entrants.get(p.id); if (race.phase !== 'running' || !e || e.done) return;
  const c = TRACK.cps[e.cp]; if (Math.hypot(p.s[0] - c[0], p.s[1] - c[1]) > CP_RADIUS) return;
  e.cp++; p.ws.send(JSON.stringify({ t: 'cp', n: e.cp }));
  if (e.cp < TRACK.cps.length) return;
  const now = Date.now(); e.done = true; e.ms = now - race.t0;
  if (e.ms < RACE_MIN_MS) { e.ms = 0; e.dq = true; } // 물리적으로 불가능한 기록은 실격
  const rank = [...race.entrants.values()].filter(x => x.done && !x.dq).length;
  if (!e.dq) { broadcast({ t: 'race_fin', id: p.id, name: p.name, ms: e.ms, rank }); race.deadline = Math.min(race.deadline, now + RACE_AFTER_FIRST_MS); }
}
function raceFinish() {
  const fin = e => e.done && !e.dq;
  const list = [...race.entrants.values()].sort((x, y) => (fin(x) ? 0 : 1) - (fin(y) ? 0 : 1) || (fin(x) ? x.ms - y.ms : y.cp - x.cp));
  const results = list.map(e => ({ id: e.p.id, name: e.p.name, model: e.p.model, ms: e.done && !e.dq ? e.ms : null, cp: e.cp }));
  for (const r of results) if (r.ms) { // 오늘의 기록: 닉네임별 최고 기록 상위 5개 (서버 재시작 시 초기화)
    const old = race.best.find(b => b.name === r.name);
    if (!old) race.best.push({ name: r.name, model: r.model, ms: r.ms }); else if (r.ms < old.ms) { old.ms = r.ms; old.model = r.model; }
  }
  race.best.sort((x, y) => x.ms - y.ms); race.best.length = Math.min(race.best.length, 5);
  race.phase = 'idle'; race.entrants.clear(); race.deadline = 0;
  broadcast({ t: 'race_end', results, best: race.best }); broadcast(raceState());
}
setInterval(() => {
  const now = Date.now();
  if (race.phase === 'lobby' && now >= race.deadline) {
    race.phase = 'countdown'; race.deadline = now + RACE_COUNT_MS;
    for (const e of race.entrants.values()) { e.cp = 0; e.done = false; e.ms = 0; }
    broadcast(raceState());
  } else if (race.phase === 'countdown' && now >= race.deadline) {
    for (const e of [...race.entrants.values()]) { const g = TRACK.grid[e.slot]; if (Math.hypot(e.p.s[0] - g[0], e.p.s[1] - g[1]) > 25) race.entrants.delete(e.p.id); } // 그리드를 벗어난 참가자 제외
    if (!race.entrants.size) { race.phase = 'idle'; race.deadline = 0; } else { race.phase = 'running'; race.t0 = now; race.deadline = now + RACE_LIMIT_MS; }
    broadcast(raceState());
  } else if (race.phase === 'running' && (now >= race.deadline || [...race.entrants.values()].every(e => e.done))) raceFinish();
}, 100);
setInterval(() => {
  if (race.phase !== 'running') return;
  broadcast({ t: 'rp', el: Date.now() - race.t0, p: [...race.entrants.values()].map(e => [e.p.id, e.cp, e.done ? 1 : 0]) });
}, 500);

// ---------- 서바이벌: 종합운동장 안에서만 발사·피격이 일어난다. 총알 이동·명중·HP·처치는 서버가 판정한다
const ARENA = { x: -100, z: -64, r: 23.5, obs: [[-100, -64, 2.4], [-90, -56, 1.6], [-110, -56, 1.6], [-90, -72, 1.6], [-110, -72, 1.6]] }; // client/src/world.ts 의 ARENA 와 같은 값
const SHOT = { cd: 300, speed: 46, life: 1.0, dmg: 10, hitR: 1.2, muzzle: 2.9 };
const bullets = []; let bulletId = 1;
const r2 = v => Math.round(v * 100) / 100;
const arenaBoard = () => ({ t: 'arena', p: [...players.values()].filter(p => p.inArena).map(p => [p.id, p.kills]) });
function arenaTrack(p) {
  const inside = Math.hypot(p.s[0] - ARENA.x, p.s[1] - ARENA.z) < ARENA.r;
  if (inside === p.inArena) return;
  p.inArena = inside; if (!inside) { p.hp = 100; p.ko = false; } // 운동장을 나가면 체력 회복
  broadcast(arenaBoard());
}
function fire(p) {
  const now = Date.now(); if (!p.inArena || p.ko || now - p.lastShot < SHOT.cd) return;
  p.lastShot = now;
  const h = p.s[2], dx = Math.sin(h), dz = Math.cos(h), b = { id: bulletId++, o: p.id, x: p.s[0] + dx * SHOT.muzzle, z: p.s[1] + dz * SHOT.muzzle, dx, dz, t: now };
  bullets.push(b); broadcast({ t: 'shot', b: b.id, id: p.id, x: r2(b.x), z: r2(b.z), h: r2(h) });
}
setInterval(() => {
  const now = Date.now(), step = SHOT.speed * 0.05;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i], x0 = b.x, z0 = b.z; b.x += b.dx * step; b.z += b.dz * step;
    // 이번 구간(선분)에서 가장 먼저 닿는 대상을 찾는다
    const along = (cx, cz, r) => { let t = ((cx - x0) * b.dx + (cz - z0) * b.dz) / step; t = Math.max(0, Math.min(1, t)); const px = x0 + b.dx * step * t - cx, pz = z0 + b.dz * step * t - cz; return px * px + pz * pz < r * r ? t : 2; };
    let bestT = 2, victim = null;
    for (const o of ARENA.obs) { const t = along(o[0], o[1], o[2]); if (t < bestT) { bestT = t; victim = null; } }
    for (const p of players.values()) {
      if (p.id === b.o || !p.inArena || p.ko) continue;
      const fx = Math.sin(p.s[2]) * 1.1, fz = Math.cos(p.s[2]) * 1.1; // 차체 앞·뒤 두 원으로 근사
      const t = Math.min(along(p.s[0] + fx, p.s[1] + fz, SHOT.hitR), along(p.s[0] - fx, p.s[1] - fz, SHOT.hitR));
      if (t < bestT) { bestT = t; victim = p; }
    }
    if (victim) {
      const shooter = players.get(b.o); victim.hp = Math.max(0, victim.hp - SHOT.dmg);
      broadcast({ t: 'hit', b: b.id, id: victim.id, hp: victim.hp, by: b.o });
      if (victim.hp === 0) { victim.ko = true; if (shooter) shooter.kills++; broadcast({ t: 'ko', id: victim.id, name: victim.name, by: b.o, byName: shooter ? shooter.name : '' }); broadcast(arenaBoard()); }
    }
    if (bestT <= 1 || now - b.t > SHOT.life * 1000 || Math.hypot(b.x - ARENA.x, b.z - ARENA.z) > ARENA.r + 1.5) bullets.splice(i, 1);
  }
}, 50);

const pub = p => ({ id: p.id, name: p.name, model: p.model, look: p.look, p: p.s });
function broadcast(obj, except, filter) {
  const data = JSON.stringify(obj);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1 && (!filter || filter(p))) p.ws.send(data);
}
/** 토큰 버킷 방식 속도 제한 */
function allow(p, key, max, perMs) {
  const now = Date.now(), b = p.rl[key] || (p.rl[key] = { n: max, t: now });
  b.n = Math.min(max, b.n + (now - b.t) / perMs * max); b.t = now;
  if (b.n < 1) return false; b.n -= 1; return true;
}

wss.on('connection', ws => {
  /** @type {any} */
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!me) {
      if (m.t !== 'hello') return;
      if (players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
      me = { id: nextId++, ws, name: cleanName(m.name), model: MODELS.includes(m.model) ? m.model : 'atto3', look: cleanLook(m.look), s: [0, 15, Math.PI, 0, 0, 0, 0, 0], rl: {}, hp: 100, kills: 0, ko: false, inArena: false, lastShot: 0 };
      ws.send(JSON.stringify({ t: 'welcome', id: me.id, players: [...players.values()].map(pub), race: raceState(), track: { cps: TRACK.cps }, best: race.best, arena: arenaBoard().p }));
      players.set(me.id, me);
      broadcast({ t: 'join', player: pub(me) }, me);
      console.log(`[join] #${me.id} ${me.name} (${players.size}명 접속 중)`);
      return;
    }
    switch (m.t) {
      case 's': {
        if (!Array.isArray(m.p) || !allow(me, 's', 40, 1000)) return;
        const a = m.p;
        me.s = [num(a[0], -400, 400), num(a[1], -400, 400), num(a[2], -1e4, 1e4), num(a[3], -60, 60), num(a[4], -1, 1), num(a[5], 0, 1), num(a[6], 0, 1), a[7] ? 1 : 0];
        raceProgress(me); arenaTrack(me);
        break;
      }
      case 'chat': {
        if (!allow(me, 'chat', 5, 6000)) return ws.send(JSON.stringify({ t: 'chat', id: 0, name: '시스템', ch: 'all', text: '메시지를 너무 빠르게 보내고 있어요.' }));
        const text = String(m.text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
        if (!text) return;
        const ch = m.ch === 'near' ? 'near' : 'all';
        const near = p => Math.hypot(p.s[0] - me.s[0], p.s[1] - me.s[1]) < 45;
        broadcast({ t: 'chat', id: me.id, name: me.name, ch, text }, null, ch === 'near' ? near : null);
        break;
      }
      case 'look':
        if (!allow(me, 'look', 20, 10000)) return;
        me.look = cleanLook(m.look); // 차종은 입장 시 선택한 모델로 고정
        broadcast({ t: 'look', id: me.id, model: me.model, look: me.look }, me);
        break;
      case 'race_join': if (allow(me, 'race', 6, 10000)) raceJoin(me); break;
      case 'race_leave': raceLeave(me); break;
      case 'fire': fire(me); break;
      case 'horn': if (allow(me, 'horn', 4, 4000)) broadcast({ t: 'horn', id: me.id }, me); break;
      case 'emote': if (allow(me, 'emote', 4, 6000)) broadcast({ t: 'emote', id: me.id, e: String(m.e ?? '').slice(0, 8) }, me); break;
    }
  });
  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id); raceLeave(me); if (me.inArena) broadcast(arenaBoard()); broadcast({ t: 'leave', id: me.id });
    console.log(`[leave] #${me.id} ${me.name} (${players.size}명 접속 중)`);
  });
  ws.on('error', () => {});
});

// 15Hz 스냅샷 브로드캐스트
setInterval(() => {
  if (players.size < 2) return;
  const r = v => Math.round(v * 100) / 100;
  const snap = JSON.stringify({ t: 'snap', s: [...players.values()].map(p => [p.id, r(p.s[0]), r(p.s[1]), r(p.s[2]), r(p.s[3]), r(p.s[4]), r(p.s[5]), r(p.s[6]), p.s[7], p.hp]) });
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(snap);
}, 66);
// 끊어진 연결 정리
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);

server.listen(PORT, () => console.log(`BYD DRIVE WORLD 서버 실행 중 → http://localhost:${PORT}`));
