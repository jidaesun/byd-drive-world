// 실시간 멀티플레이 클라이언트. 서버가 없으면 오프라인(싱글) 모드로 동작한다.
import { Look } from './cars';

export interface Remote {
  id: number; name: string; model: string; look: Look;
  x: number; z: number; h: number; v: number; st: number; dirt: number; foam: number; brake: boolean;
  tx: number; tz: number; th: number; spin: number; seen: boolean; hp: number;
  bubble?: string; bubbleT?: number;
}
export interface RaceResult { id: number; name: string; model: string; ms: number | null; cp: number; }
export interface RaceBest { name: string; model: string; ms: number; }
export interface ChatMsg { id: number; name: string; ch: 'all' | 'near'; text: string; }
type Handler = {
  join?: (r: Remote) => void; leave?: (r: Remote) => void; chat?: (m: ChatMsg) => void;
  shot?: (m: { b: number; id: number; x: number; z: number; h: number }) => void; hit?: (m: { b: number; id: number; hp: number; by: number }) => void;
  ko?: (m: { id: number; name: string; by: number; byName: string }) => void; arena?: () => void;
  horn?: (r: Remote) => void; race?: () => void; raceSlot?: (pos: [number, number, number]) => void; raceEnd?: (r: RaceResult[]) => void; cp?: (n: number) => void; status?: () => void; look?: (r: Remote) => void; notice?: (t: string) => void;
};

export class Net {
  ws: WebSocket | null = null;
  id = 0; online = false; everOnline = false; full = false;
  players = new Map<number, Remote>();
  on: Handler = {};
  // 레이스 상태 (서버 판정)
  race = { phase: 'idle' as 'idle' | 'lobby' | 'countdown' | 'running', ids: new Set<number>(), until: 0, max: 6, t0: 0, prog: new Map<number, number>() };
  cps: [number, number][] = []; best: RaceBest[] = [];
  // 서바이벌 (서버 판정)
  hp = 100; arena = new Map<number, number>(); // 운동장 안에 있는 플레이어 id → 처치 수
  private setArena(p: [number, number][]) { this.arena = new Map(p); this.on.arena?.(); }
  private setRace(m: any) {
    const was = this.race.phase;
    this.race.phase = m.phase; this.race.ids = new Set(m.ids); this.race.until = performance.now() + m.left; this.race.max = m.max;
    if (m.phase === 'running' && was !== 'running') { this.race.t0 = performance.now(); this.race.prog.clear(); }
    if (m.phase === 'idle') this.race.prog.clear();
    this.on.race?.();
  }
  private hello: any = null; private tries = 0; private timer = 0;

  url(): string | null {
    const q = new URLSearchParams(location.search).get('server');
    const g = (window as any).BDW_SERVER as string | undefined;
    if (q) return q; if (g) return g;
    if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return null;
  }
  connect(hello: { name: string; model: string; look: Look }) {
    this.hello = hello;
    const url = this.url(); if (!url) return;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return; }
    this.ws = ws;
    ws.onopen = () => { this.tries = 0; this.send({ t: 'hello', ...this.hello }); };
    ws.onmessage = ev => { let m: any; try { m = JSON.parse(ev.data); } catch { return; } this.handle(m); };
    ws.onclose = () => {
      const was = this.online; this.online = false; this.ws = null;
      for (const r of this.players.values()) this.on.leave?.(r);
      this.players.clear(); this.race.phase = 'idle'; this.race.ids.clear(); this.on.race?.(); this.hp = 100; this.setArena([]); this.on.status?.();
      if (was) this.on.notice?.('서버 연결이 끊어졌어요. 다시 연결하는 중…');
      if (this.full) return;
      // 한 번도 연결된 적 없으면(정적 호스팅 등) 천천히 재시도
      const delay = this.everOnline ? Math.min(8000, 1000 * 2 ** this.tries) : (this.tries < 2 ? 3000 : 30000);
      this.tries++; clearTimeout(this.timer); this.timer = window.setTimeout(() => this.connect(this.hello), delay);
    };
    ws.onerror = () => { /* onclose에서 처리 */ };
  }
  private mk(p: any): Remote {
    const s = p.p || [0, 0, 0, 0, 0, 0, 0, 0];
    return { id: p.id, name: p.name, model: p.model, look: p.look, x: s[0], z: s[1], h: s[2], v: s[3], st: s[4], dirt: s[5], foam: s[6], brake: !!s[7], tx: s[0], tz: s[1], th: s[2], spin: 0, seen: false, hp: 100 };
  }
  private handle(m: any) {
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.online = true; this.everOnline = true; this.players.clear();
        for (const p of m.players) { const r = this.mk(p); r.seen = true; this.players.set(r.id, r); this.on.join?.(r); }
        this.cps = m.track?.cps ?? []; this.best = m.best ?? []; if (m.race) this.setRace(m.race); this.hp = 100; this.setArena(m.arena ?? []);
        this.on.status?.(); break;
      case 'race': this.setRace(m); break;
      case 'arena': this.setArena(m.p); break;
      case 'shot': this.on.shot?.(m); break;
      case 'hit': if (m.id === this.id) this.hp = m.hp; else { const r = this.players.get(m.id); if (r) r.hp = m.hp; } this.on.hit?.(m); break;
      case 'ko': this.on.ko?.(m); break;
      case 'race_slot': this.on.raceSlot?.(m.pos); break;
      case 'cp': this.race.prog.set(this.id, m.n); this.on.cp?.(m.n); break;
      case 'rp': this.race.t0 = performance.now() - m.el; for (const e of m.p) if (e[0] !== this.id || e[1] > (this.race.prog.get(this.id) ?? 0)) this.race.prog.set(e[0], e[1]); break;
      case 'race_fin': this.on.notice?.(`🏁 ${m.rank}위 ${m.name} · ${(m.ms / 1000).toFixed(2)}초`); break;
      case 'race_end': this.best = m.best ?? []; this.on.raceEnd?.(m.results); break;
      case 'join': { const r = this.mk(m.player); this.players.set(r.id, r); this.on.join?.(r); this.on.status?.(); this.on.notice?.(`${r.name} 님이 입장했어요`); break; }
      case 'leave': { const r = this.players.get(m.id); if (r) { this.players.delete(m.id); this.on.leave?.(r); this.on.status?.(); this.on.notice?.(`${r.name} 님이 나갔어요`); } break; }
      case 'snap':
        for (const s of m.s) { if (s[0] === this.id) { this.hp = s[9] ?? 100; continue; } const r = this.players.get(s[0]); if (!r) continue; r.hp = s[9] ?? 100;
          r.tx = s[1]; r.tz = s[2]; r.th = s[3]; r.v = s[4]; r.st = s[5]; r.dirt = s[6]; r.foam = s[7]; r.brake = !!s[8];
          if (!r.seen || Math.hypot(r.tx - r.x, r.tz - r.z) > 25) { r.x = r.tx; r.z = r.tz; r.h = r.th; r.seen = true; } }
        break;
      case 'chat': this.on.chat?.(m); { const r = this.players.get(m.id); if (r) { r.bubble = m.text; r.bubbleT = 5; } } break;
      case 'look': { const r = this.players.get(m.id); if (r) { r.model = m.model; r.look = m.look; this.on.look?.(r); } break; }
      case 'horn': { const r = this.players.get(m.id); if (r) this.on.horn?.(r); break; }
      case 'emote': { const r = this.players.get(m.id); if (r) { r.bubble = m.e; r.bubbleT = 4; } break; }
      case 'full': this.full = true; this.on.notice?.('월드 정원이 가득 찼어요. 혼자 드라이브 모드로 전환합니다.'); break;
    }
  }
  send(o: any) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  count() { return this.online ? this.players.size + 1 : 0; }
}
