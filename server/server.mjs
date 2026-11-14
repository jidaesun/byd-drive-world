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
      me = { id: nextId++, ws, name: cleanName(m.name), model: MODELS.includes(m.model) ? m.model : 'atto3', look: cleanLook(m.look), s: [0, 15, Math.PI, 0, 0, 0, 0, 0], rl: {} };
      ws.send(JSON.stringify({ t: 'welcome', id: me.id, players: [...players.values()].map(pub) }));
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
      case 'horn': if (allow(me, 'horn', 4, 4000)) broadcast({ t: 'horn', id: me.id }, me); break;
      case 'emote': if (allow(me, 'emote', 4, 6000)) broadcast({ t: 'emote', id: me.id, e: String(m.e ?? '').slice(0, 8) }, me); break;
    }
  });
  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id); broadcast({ t: 'leave', id: me.id });
    console.log(`[leave] #${me.id} ${me.name} (${players.size}명 접속 중)`);
  });
  ws.on('error', () => {});
});

// 15Hz 스냅샷 브로드캐스트
setInterval(() => {
  if (players.size < 2) return;
  const r = v => Math.round(v * 100) / 100;
  const snap = JSON.stringify({ t: 'snap', s: [...players.values()].map(p => [p.id, r(p.s[0]), r(p.s[1]), r(p.s[2]), r(p.s[3]), r(p.s[4]), r(p.s[5]), r(p.s[6]), p.s[7]]) });
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(snap);
}, 66);
// 끊어진 연결 정리
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);

server.listen(PORT, () => console.log(`BYD DRIVE WORLD 서버 실행 중 → http://localhost:${PORT}`));
