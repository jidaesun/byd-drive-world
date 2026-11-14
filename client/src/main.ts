// BYD DRIVE WORLD — 클라이언트 진입점: 게임 루프, 운전 물리, 카메라, UI, 세차, 멀티플레이 연동
import { Renderer, DrawItem, Env, Mesh } from './renderer';
import { buildWorld, PLACES, Place, WASH_BAYS, DISPLAY_SPOTS, confine, onRoad, Collider } from './world';
import { CARS, CarSpec, Look, carById, buildCar, palette, defaultLook, sanitizeLook, BODY_COLORS, RIM_COLORS, WHEEL_NAMES, DECAL_NAMES, PLATES } from './cars';
import { Net, Remote } from './net';
import { MB } from './geom';
import { M4, V3, mul, trans, rotX, rotY, rotZ, lerp, clamp, angLerp, norm } from './math';

// ---------- 유틸
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('bdw.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('bdw.' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
// 모바일 전용 서비스: 항상 터치 UI를 사용한다 (키보드는 개발·테스트용으로만 동작)
const touch = true;
document.body.classList.add('touch');

// ---------- 렌더러 & 에셋
const canvas = $<HTMLCanvasElement>('c');
let R: Renderer;
try { R = new Renderer(canvas); } catch (e) {
  document.body.innerHTML = '<p style="padding:40px;font:16px sans-serif">이 브라우저는 WebGL2를 지원하지 않아 실행할 수 없습니다.</p>'; throw e;
}
const world = buildWorld();
const worldMesh = R.mesh(world.data);
const colliders: Collider[] = world.colliders;
const carMesh: Record<string, { body: Mesh; wheels: Mesh[] }> = {};
for (const c of CARS) { const d = buildCar(c); carMesh[c.id] = { body: R.mesh(d.body), wheels: d.wheels.map(w => R.mesh(w)) }; }
const I4 = trans(0, 0, 0);

// ---------- 상태
const savedLooks = store.get<Record<string, any>>('looks', {});
const lookFor = (id: string) => sanitizeLook(savedLooks[id], carById(id));
const me = {
  name: store.get('name', ''), model: carById(store.get('model', 'atto3')).id, look: null as unknown as Look,
  x: 0, z: 15, h: Math.PI, v: 0, steer: 0, spin: 0, roll: 0, pitch: 0, brake: false,
  dirt: store.get('dirt', 0.45), foam: 0, gloss: 0, bubble: '', bubbleT: 0,
};
me.look = lookFor(me.model);
let started = false, time = 0, place: Place | null = null;
const settings = store.get('settings', { tod: 'auto', quality: 1, sound: true });
let todClock = 0.18; // 0..1 하루 주기
const net = new Net();

// ---------- 시간대
type EnvKey = { sun: V3; sunCol: V3; skyAmb: V3; gndAmb: V3; zen: V3; hor: V3; cloud: V3; glow: V3; night: number };
const hx = (h: string): V3 => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const mulv = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const ENV: Record<string, EnvKey> = {
  day: { sun: norm([0.52, 0.6, 0.42]), sunCol: [1.12, 1.06, 0.95], skyAmb: mulv([0.62, 0.74, 0.92], 0.62), gndAmb: mulv([0.6, 0.55, 0.45], 0.34), zen: hx('#58b0f2'), hor: hx('#d4f0ff'), cloud: hx('#ffffff'), glow: [1, 0.95, 0.8], night: 0 },
  sunset: { sun: norm([-0.5, 0.2, 0.84]), sunCol: [1.15, 0.68, 0.42], skyAmb: mulv([0.72, 0.56, 0.72], 0.5), gndAmb: mulv([0.6, 0.4, 0.4], 0.3), zen: hx('#6f7fd0'), hor: hx('#ffc9a0'), cloud: hx('#ffd6c4'), glow: [1, 0.6, 0.3], night: 0.35 },
  night: { sun: norm([0.35, 0.7, -0.45]), sunCol: [0.34, 0.42, 0.66], skyAmb: mulv([0.3, 0.38, 0.66], 0.42), gndAmb: mulv([0.2, 0.22, 0.36], 0.3), zen: hx('#0f1740'), hor: hx('#33437a'), cloud: hx('#3c4878'), glow: [0.7, 0.8, 1], night: 1 },
};
function mixEnv(a: EnvKey, b: EnvKey, t: number): Env {
  const m = (x: V3, y: V3): V3 => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return { sun: norm(m(a.sun, b.sun)), sunCol: m(a.sunCol, b.sunCol), skyAmb: m(a.skyAmb, b.skyAmb), gndAmb: m(a.gndAmb, b.gndAmb), zen: m(a.zen, b.zen), hor: m(a.hor, b.hor), cloud: m(a.cloud, b.cloud), glow: m(a.glow, b.glow), night: lerp(a.night, b.night, t) };
}
function envAt(c: number): Env {
  const s = (a: number, b: number) => clamp((c - a) / (b - a), 0, 1);
  if (c < 0.46) return mixEnv(ENV.day, ENV.day, 0);
  if (c < 0.58) return mixEnv(ENV.day, ENV.sunset, s(0.46, 0.58));
  if (c < 0.66) return mixEnv(ENV.sunset, ENV.sunset, 0);
  if (c < 0.74) return mixEnv(ENV.sunset, ENV.night, s(0.66, 0.74));
  if (c < 0.92) return mixEnv(ENV.night, ENV.night, 0);
  return mixEnv(ENV.night, ENV.day, s(0.92, 1));
}
const TOD_FIX: Record<string, number> = { day: 0.2, sunset: 0.62, night: 0.8 };
let env: Env = envAt(todClock);

// ---------- 파티클
const PMAX = 1800, pData = new Float32Array(PMAX * 8);
interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number; a: number; grav: number; grow: number; }
const parts: P[] = [];
function spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c: V3, a = 1, grav = 0, grow = 0) {
  if (parts.length < PMAX) parts.push({ x, y, z, vx, vy, vz, life, max: life, size, r: c[0], g: c[1], b: c[2], a, grav, grow });
}
function updateParticles(dt: number) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0 || p.y < -0.6) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += p.grow * dt;
  }
  for (const p of parts) {
    const k = p.life / p.max, o = n * 8;
    pData[o] = p.x; pData[o + 1] = p.y; pData[o + 2] = p.z; pData[o + 3] = p.size;
    pData[o + 4] = p.r; pData[o + 5] = p.g; pData[o + 6] = p.b; pData[o + 7] = p.a * Math.min(1, k * 3); n++;
  }
  return n;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** 차량 로컬 좌표 → 월드 */
const carPt = (c: { x: number; z: number; h: number }, lx: number, lz: number): [number, number] =>
  [c.x + lx * Math.cos(c.h) + lz * Math.sin(c.h), c.z - lx * Math.sin(c.h) + lz * Math.cos(c.h)];

// ---------- 사운드
let actx: AudioContext | null = null;
function horn(vol = 1) {
  if (!settings.sound || vol <= 0.02) return;
  try {
    actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = actx.currentTime, g = actx.createGain(), f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.02);
    g.gain.setValueAtTime(0.12 * vol, t + 0.22); g.gain.linearRampToValueAtTime(0, t + 0.32);
    for (const fr of [415, 523]) { const o = actx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + 0.34); }
    f.connect(g); g.connect(actx.destination);
  } catch { /* 오디오 불가 */ }
}

// ---------- 입력
const keys = new Set<string>(), pad = { left: false, right: false, gas: false, brake: false, stick: 0 };
const typing = () => document.activeElement instanceof HTMLInputElement;
addEventListener('keydown', e => {
  if (typing()) { if (e.key === 'Escape') (document.activeElement as HTMLElement).blur(); return; }
  if (!started) return;
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyH') doHorn();
  if (e.code === 'KeyC') openCustom();
  if (e.code === 'KeyP') takePhoto = true;
  if (e.code === 'KeyR') teleport(place ?? PLACES[0]);
  if (e.code === 'Enter') { e.preventDefault(); $('chat').classList.add('open'); $('chatIn').focus(); }
  if (e.code === 'Escape') closeSheet();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); pad.gas = pad.brake = false; pad.stick = 0; });
document.querySelectorAll<HTMLButtonElement>('#pad button').forEach(b => {
  const k = b.dataset.k as 'gas' | 'brake' | 'horn';
  const set = (v: boolean) => { b.classList.toggle('dn', v); if (k === 'horn') { if (v) doHorn(); } else pad[k] = v; };
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  b.addEventListener('contextmenu', e => e.preventDefault());
});
// 조향 조이스틱: 좌우로 기울인 만큼 아날로그 조향
{
  const st = $('stick'), knob = st.querySelector('i') as HTMLElement; let pid = -1;
  const move = (e: PointerEvent) => {
    const r = st.getBoundingClientRect(), R0 = r.width / 2 - 30;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy); if (l > R0) { dx *= R0 / l; dy *= R0 / l; }
    knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    const v = clamp(dx / R0, -1, 1), a = Math.abs(v);
    pad.stick = a < 0.1 ? 0 : -Math.sign(v) * Math.pow((a - 0.1) / 0.9, 1.3);
  };
  const end = (e: PointerEvent) => { if (e.pointerId !== pid) return; pid = -1; pad.stick = 0; knob.style.transform = ''; st.classList.remove('on'); };
  st.addEventListener('pointerdown', e => { e.preventDefault(); if (pid !== -1) return; pid = e.pointerId; st.setPointerCapture(pid); st.classList.add('on'); move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) st.addEventListener(ev, e => end(e as PointerEvent));
  st.addEventListener('contextmenu', e => e.preventDefault());
}
// 카메라 드래그 / 줌
const cam = { h: Math.PI, yaw: 0, pitch: 0.3, dist: 9, lastDrag: -99, eye: [0, 5, 25] as V3, tgt: [0, 1, 15] as V3 };
let drag: { id: number; x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', e => { if (drag) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); (document.activeElement as HTMLElement)?.blur?.(); });
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  cam.yaw -= (e.clientX - drag.x) * 0.0065; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.005, 0.06, 1.25);
  drag.x = e.clientX; drag.y = e.clientY; cam.lastDrag = time;
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, e => { if (drag && (e as PointerEvent).pointerId === drag.id) drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 4.5, 26); }, { passive: false });

// ---------- 운전 물리
function drive(dt: number) {
  const spec = carById(me.model);
  const up = keys.has('KeyW') || keys.has('ArrowUp') || pad.gas, dn = keys.has('KeyS') || keys.has('ArrowDown') || pad.brake;
  const lf = keys.has('KeyA') || keys.has('ArrowLeft'), rt = keys.has('KeyD') || keys.has('ArrowRight');
  const hb = keys.has('Space');
  const road = onRoad(me.x, me.z), vmax = road ? 30 : 17, v0 = me.v;
  me.brake = false;
  if (!started || washAnim) { me.v = lerp(me.v, 0, Math.min(1, dt * 6)); }
  else {
    if (up && !dn) { if (me.v < -0.3) { me.v += 20 * dt; me.brake = true; } else me.v += 9.5 * Math.max(0, 1 - me.v / vmax) * dt; }
    else if (dn && !up) { if (me.v > 0.4) { me.v -= 22 * dt; me.brake = true; } else me.v -= 6 * Math.max(0, 1 + me.v / 9) * dt; }
    if (hb) { me.brake = true; me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), 30 * dt); }
    const dragF = (road ? 0.9 : 2.4) + Math.abs(me.v) * (road ? 0.035 : 0.09) + (!up && !dn ? 1.2 : 0);
    me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), dragF * dt);
    if (me.v > vmax) me.v = lerp(me.v, vmax, Math.min(1, dt * 2));
  }
  const maxSteer = lerp(0.6, 0.11, clamp(Math.abs(me.v) / 26, 0, 1));
  const sIn = lf || rt ? (lf ? 1 : 0) - (rt ? 1 : 0) : pad.stick;
  const target = (started && !washAnim ? sIn : 0) * maxSteer;
  me.steer += (target - me.steer) * Math.min(1, dt * (target === 0 ? 7 : pad.stick ? 8 : 4.5));
  const yawRate = me.v / spec.wb * Math.tan(me.steer);
  me.h += yawRate * dt;
  me.x += Math.sin(me.h) * me.v * dt; me.z += Math.cos(me.h) * me.v * dt;
  me.spin += me.v / spec.wr * dt;
  // 차체 롤/피치 연출
  me.roll = lerp(me.roll, clamp(-yawRate * me.v * 0.006, -0.07, 0.07), Math.min(1, dt * 6));
  me.pitch = lerp(me.pitch, clamp(-(me.v - v0) / Math.max(dt, 1e-3) * 0.0035, -0.045, 0.045), Math.min(1, dt * 5));
  // 충돌
  let hit = false; const r = spec.W * 0.52;
  for (const off of [spec.L * 0.3, 0, -spec.L * 0.3]) {
    const [px, pz] = carPt(me, 0, off);
    for (const c of colliders) {
      let nx = 0, nz = 0, pen = 0;
      if (c.r !== undefined) { const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), lim = r + c.r; if (d >= lim) continue; pen = lim - d; nx = d > 1e-4 ? dx / d : 1; nz = d > 1e-4 ? dz / d : 0; }
      else { const hx2 = c.hx!, hz2 = c.hz!; const qx = clamp(px, c.x - hx2, c.x + hx2), qz = clamp(pz, c.z - hz2, c.z + hz2); const dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-4) { pen = r - d; nx = dx / d; nz = dz / d; }
        else { const ex = hx2 - Math.abs(px - c.x), ez = hz2 - Math.abs(pz - c.z); if (ex < ez) { nx = Math.sign(px - c.x) || 1; pen = ex + r; } else { nz = Math.sign(pz - c.z) || 1; pen = ez + r; } } }
      me.x += nx * pen; me.z += nz * pen; hit = true;
    }
    for (const o of net.players.values()) { const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz); if (d < r + 1.05 && d > 1e-4) { const pen = r + 1.05 - d; me.x += dx / d * pen; me.z += dz / d * pen; hit = true; } }
  }
  if (confine(me)) hit = true;
  if (hit) me.v *= 1 - Math.min(1, dt * 5);
  // 오염 & 먼지
  const sp = Math.abs(me.v);
  me.dirt = clamp(me.dirt + sp * dt * (road ? 0.00022 : 0.0011), 0, 1);
  if (me.gloss > 0) me.gloss = Math.max(0, me.gloss - sp * dt * 0.0006);
  if (!road && sp > 5 && Math.random() < dt * 30) { const [dx2, dz2] = carPt(me, rnd(-0.8, 0.8), -spec.L * 0.42); spawn(dx2, 0.15, dz2, rnd(-.5, .5), rnd(.4, 1), rnd(-.5, .5), 0.9, 0.5, [0.85, 0.78, 0.62], 0.4, -0.3, 1.2); }
  if (me.foam > 0 && !inBay()) { me.foam = Math.max(0, me.foam - dt * 0.05); if (Math.random() < dt * 12 * me.foam) { const [fx, fz] = carPt(me, rnd(-.9, .9), rnd(-2, 2)); spawn(fx, rnd(0.5, 1.4), fz, rnd(-.6, .6), rnd(.2, .8), rnd(-.6, .6), 1.6, rnd(.15, .3), [1, 1, 1], 0.9, 0.6); } }
}

// ---------- 세차
let washStage = 0; // 0 시작 전, 1 거품 완료, 2 헹굼 완료
let washAnim: { kind: 'foam' | 'rinse' | 'polish'; t: number; dur: number; d0: number; f0: number } | null = null;
function inBay() { return WASH_BAYS.some(b => Math.abs(me.x - b.x) < 2.2 && me.z > b.z0 && me.z < b.z1); }
function startWash(kind: 'foam' | 'rinse' | 'polish') {
  if (washAnim) return;
  washAnim = { kind, t: 0, dur: kind === 'polish' ? 2.6 : 3.4, d0: me.dirt, f0: me.foam };
  toast(kind === 'foam' ? '🫧 거품을 뿌리는 중…' : kind === 'rinse' ? '💦 고압수로 헹구는 중…' : '✨ 광택을 내는 중…');
  net.send({ t: 'emote', e: kind === 'foam' ? '🫧' : kind === 'rinse' ? '💦' : '✨' });
  cam.yaw = 0; cam.pitch = 0.42; cam.dist = 7; cam.lastDrag = time + 5;
  renderZone();
}
function updateWash(dt: number) {
  const a = washAnim; if (!a) return;
  const spec = carById(me.model); a.t += dt; const k = Math.min(1, a.t / a.dur);
  const surf = (): [number, number, number] => { const [x, z] = carPt(me, rnd(-spec.W / 2, spec.W / 2), rnd(-spec.L / 2, spec.L / 2)); return [x, rnd(0.4, spec.H), z]; };
  if (a.kind === 'foam') {
    me.foam = lerp(a.f0, 1, k);
    for (let i = 0; i < 5; i++) { const [x, y, z] = surf(); spawn(x + rnd(-.5, .5), y + 1.6, z + rnd(-.5, .5), rnd(-.3, .3), -rnd(1.5, 3), rnd(-.3, .3), 0.9, rnd(.14, .3), [1, 1, 1], 0.95); }
    if (Math.random() < 0.5) { const [x, y, z] = surf(); spawn(x, y, z, rnd(-.3, .3), rnd(.3, .9), rnd(-.3, .3), 1.8, rnd(.2, .42), [0.93, 0.98, 1], 0.7, -0.1); }
  } else if (a.kind === 'rinse') {
    me.foam = lerp(a.f0, 0, k); me.dirt = lerp(a.d0, 0, k);
    const sweep = lerp(-spec.L / 2, spec.L / 2, (a.t * 0.9) % 1);
    for (let i = 0; i < 9; i++) { const side = Math.random() < 0.5 ? -1 : 1; const [x, z] = carPt(me, side * 2.6, sweep + rnd(-.4, .4)); const [tx2, tz2] = carPt(me, rnd(-.6, .6), sweep);
      spawn(x, 2.2, z, (tx2 - x) * 2.6, rnd(-1.5, .5), (tz2 - z) * 2.6, 0.55, rnd(.1, .2), [0.66, 0.88, 1], 0.85, 6); }
    for (let i = 0; i < 3; i++) { const [x, y, z] = surf(); spawn(x, y, z, rnd(-2, 2), rnd(1, 3), rnd(-2, 2), 0.5, rnd(.08, .16), [0.85, 0.95, 1], 0.8, 9); }
  } else {
    me.gloss = lerp(0, 1, k);
    for (let i = 0; i < 2; i++) { const [x, y, z] = surf(); spawn(x, y + 0.1, z, 0, rnd(.1, .4), 0, 0.5, rnd(.12, .34), [1, 0.97, 0.75], 1, 0, -0.3); }
  }
  if (k >= 1) {
    washAnim = null;
    if (a.kind === 'foam') washStage = 1;
    else if (a.kind === 'rinse') { washStage = 2; me.dirt = 0; me.foam = 0; }
    else {
      washStage = 0; me.gloss = 1; store.set('dirt', 0);
      toast('✨ 세차 완료! 반짝반짝해졌어요');
      const cols: V3[] = [[1, .62, .7], [.62, .88, .82], [1, .88, .54], [.8, .77, .96], [1, 1, 1]];
      for (let i = 0; i < 140; i++) { const [x, z] = carPt(me, rnd(-1, 1), rnd(-2, 2)); const an = Math.random() * 6.28, s = rnd(1, 4.5); spawn(x, 1.4, z, Math.cos(an) * s, rnd(3, 8), Math.sin(an) * s, rnd(1.2, 2.2), rnd(.12, .26), cols[i % 5], 1, 7); }
      flashScreen();
    }
    renderZone();
  }
}

// ---------- 카메라
function updateCamera(dt: number) {
  const portrait = innerHeight > innerWidth * 1.1;
  if (!started) {
    const yaw = time * 0.22 + 0.6, d = portrait ? 12.5 : 9.5, p = 0.24;
    const tgt: V3 = portrait ? [me.x, -2.7, me.z] : [me.x, 0.9, me.z];
    cam.tgt = tgt; cam.eye = [tgt[0] + Math.sin(yaw) * d * Math.cos(p), tgt[1] + d * Math.sin(p) + (portrait ? 1.6 : 0), tgt[2] + Math.cos(yaw) * d * Math.cos(p)];
    if (!portrait) { // 카드 반대쪽으로 차를 배치
      const rx = Math.cos(yaw), rz = -Math.sin(yaw); cam.tgt = [tgt[0] - rx * 2.4, tgt[1], tgt[2] - rz * 2.4]; cam.eye = [cam.eye[0] - rx * 2.4, cam.eye[1], cam.eye[2] - rz * 2.4];
    }
    return;
  }
  if (!drag && time - cam.lastDrag > 2.2 && Math.abs(me.v) > 1.5) cam.yaw = angLerp(cam.yaw, 0, Math.min(1, dt * 2.2));
  cam.h = angLerp(cam.h, me.h, Math.min(1, dt * 4));
  const a = cam.h + cam.yaw, d = cam.dist * (1 + Math.abs(me.v) * 0.006);
  // 세로 화면에서 하단 시트가 열리면 차가 위쪽에 보이도록 시선을 내린다
  const tgt: V3 = [me.x, 1.25 - (portrait && !sheet.classList.contains('hidden') ? 2.6 : 0), me.z];
  const want: V3 = [tgt[0] - Math.sin(a) * d * Math.cos(cam.pitch), tgt[1] + d * Math.sin(cam.pitch), tgt[2] - Math.cos(a) * d * Math.cos(cam.pitch)];
  const k = Math.min(1, dt * 12);
  cam.eye = [lerp(cam.eye[0], want[0], k), lerp(cam.eye[1], want[1], k), lerp(cam.eye[2], want[2], k)];
  cam.tgt = [lerp(cam.tgt[0], tgt[0], k), lerp(cam.tgt[1], tgt[1], k), lerp(cam.tgt[2], tgt[2], k)];
}

// ---------- 차량 그리기
interface View { pal: Float32Array; fx: Float32Array; dc: Float32Array; }
const views = new Map<unknown, View>();
function pushCar(items: DrawItem[], key: unknown, model: string, look: Look, x: number, y: number, z: number, h: number, steer: number, spin: number, dirt: number, foam: number, gloss: number, brake: boolean, roll = 0, pitch = 0) {
  const spec = carById(model), ms = carMesh[spec.id];
  let v = views.get(key); if (!v) { v = { pal: new Float32Array(24), fx: new Float32Array(4), dc: new Float32Array(4) }; views.set(key, v); }
  palette(look, brake, env.night, v.pal);
  v.fx[0] = dirt; v.fx[1] = foam; v.fx[2] = gloss; v.fx[3] = look.decal; v.dc[0] = spec.belt;
  const base = mul(trans(x, y, z), rotY(h));
  const body = roll || pitch ? mul(mul(base, trans(0, 0.3, 0)), mul(mul(rotX(pitch), rotZ(roll)), trans(0, -0.3, 0))) : base;
  items.push({ mesh: ms.body, m: body, pal: v.pal, fx: v.fx, dc: v.dc });
  const wm = ms.wheels[look.wheel] ?? ms.wheels[0], wx = spec.W / 2 - 0.12;
  for (const sz of [1, -1]) for (const sx of [1, -1]) {
    let m: M4 = mul(base, trans(sx * wx, spec.wr, sz * spec.wb / 2));
    if (sz === 1 && steer) m = mul(m, rotY(steer));
    items.push({ mesh: wm, m: mul(m, rotX(spin)), pal: v.pal });
  }
}
const displayLooks: Look[] = CARS.map((c, i) => ({ ...defaultLook(c), twoTone: i % 2 === 0, decal: [0, 1, 4, 2][i], decalCol: '#ffffff', wheel: i, rim: RIM_COLORS[[0, 2, 4, 3][i]] }));

// ---------- 이름표 / 장소 라벨
const tagsEl = $('tags'), tags = new Map<string, HTMLElement>();
function tag(key: string, cls: string, text: string, p: V3, maxD: number, bubble = '') {
  let t = tags.get(key);
  const s = R.project(p);
  if (!s || s[2] > maxD) { if (t) t.style.display = 'none'; return; }
  if (!t) { t = el('div', 'tag ' + cls); t.append(el('u'), el('b')); tagsEl.append(t); tags.set(key, t); }
  const b = t.lastChild as HTMLElement, u = t.firstChild as HTMLElement;
  if (b.textContent !== text) b.textContent = text;
  if (u.textContent !== bubble) u.textContent = bubble; u.style.display = bubble ? 'block' : 'none';
  t.style.display = 'block'; t.style.transform = `translate(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px) translate(-50%,-100%)`;
  t.style.opacity = String(clamp((maxD - s[2]) / (maxD * 0.25), 0, 1));
}
function dropTag(key: string) { tags.get(key)?.remove(); tags.delete(key); }

// ---------- UI
function toast(text: string) {
  const t = el('div', 'toast', text); $('toasts').append(t);
  while ($('toasts').children.length > 3) $('toasts').firstChild!.remove();
  setTimeout(() => t.remove(), 3200);
}
function flashScreen() { const f = $('flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on'))); }
function swatches(host: HTMLElement, colors: string[], cur: () => string, pick: (c: string) => void) {
  host.innerHTML = '';
  for (const c of colors) { const b = el('button'); b.style.background = c; b.title = c; b.classList.toggle('on', cur().toLowerCase() === c.toLowerCase());
    b.onclick = () => { pick(c); host.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }; host.append(b); }
}
function pills(host: HTMLElement, names: string[], cur: () => number, pick: (i: number) => void) {
  host.innerHTML = '';
  names.forEach((n, i) => { const b = el('button', i === cur() ? 'on' : '', n); b.onclick = () => { pick(i); host.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }; host.append(b); });
}
let lookTimer = 0;
function lookChanged() {
  savedLooks[me.model] = me.look; store.set('looks', savedLooks); store.set('model', me.model);
  refreshCarCard();
  clearTimeout(lookTimer); lookTimer = window.setTimeout(() => net.send({ t: 'look', model: me.model, look: me.look }), 250);
}
function setModel(id: string) { me.model = carById(id).id; me.look = lookFor(me.model); lookChanged(); }
function refreshCarCard() {
  const s = carById(me.model);
  $('carModel').textContent = 'BYD ' + s.name; $('carKind').textContent = s.kind; $('carDot').style.background = me.look.body;
}
function refreshStatus() {
  const n = net.count();
  $('chipOnline').innerHTML = n ? `<i class="dot on"></i>접속 ${n}명` : `<i class="dot"></i>오프라인 · 혼자 드라이브`;
  $('chatHint').textContent = n ? '' : '서버 연결 시 채팅 가능';
}
// 시작 화면
function buildStart() {
  const mp = $('modelPick'), locked = store.get('locked', false);
  const draw = () => {
    mp.innerHTML = '';
    for (const c of CARS) { const b = el('button', c.id === me.model ? 'on' : '') as HTMLButtonElement; b.append(el('b', '', c.name), el('small', '', c.kind));
      if (locked) b.disabled = c.id !== me.model; else b.onclick = () => { setModel(c.id); draw(); };
      mp.append(b); }
    $('lockNote').textContent = locked ? '· 내 차량으로 고정됨' : '· 한 번 선택하면 바꿀 수 없어요';
    swatches($('colorPick'), BODY_COLORS, () => me.look.body, c => { me.look.body = c; lookChanged(); });
  };
  draw();
  const nick = $<HTMLInputElement>('nick'); nick.value = me.name;
  const go = () => {
    me.name = nick.value.replace(/[<>]/g, '').trim().slice(0, 12) || '드라이버' + Math.floor(100 + Math.random() * 900);
    store.set('name', me.name); store.set('model', me.model); store.set('locked', true); nick.blur();
    $('start').classList.add('hidden'); $('hud').classList.remove('hidden');
    $('chipName').textContent = '🙂 ' + me.name;
    const slot = Math.floor(Math.random() * 6); me.x = -7.5 + slot * 3; me.z = 14; me.h = Math.PI; cam.h = me.h; cam.yaw = 0;
    started = true; refreshCarCard(); refreshStatus();
    net.connect({ name: me.name, model: me.model, look: me.look });
    toast('왼쪽 조이스틱으로 조향, 오른쪽 버튼으로 가속·브레이크');
    sysMsg('BYD DRIVE WORLD에 오신 것을 환영해요. 세차장에서 차를 닦고, 튜닝샵에서 꾸며보세요.');
  };
  $('btnStart').onclick = go; nick.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
// 장소 메뉴
function buildPlaces() {
  for (const p of PLACES) {
    const b = el('button'); b.dataset.id = p.id; b.append(el('span', '', p.icon), document.createTextNode(p.name));
    b.append(el('small'));
    b.onclick = () => { setDest(dest === p ? null : p); $('places').classList.remove('open'); }; $('placeList').append(b);
  }
}
// 목적지 안내: 순간이동 대신 핀과 방향 화살표를 표시하고 직접 운전해서 찾아간다
let dest: Place | null = null;
const pinMesh = new Map<string, Mesh>(), pinPal = new Float32Array(24);
pinPal.set([1, 0.42, 0.52], 18);
function pinFor(p: Place) {
  let m = pinMesh.get(p.id); if (m) return m;
  const mb = new MB(), top = p.ly + 2.2; mb.m(6);
  mb.cyl(0, 0.06, 0, 0.09, 0.09, top - 0.06, 6, false);
  mb.cyl(0, top, 0, 0.05, 1.15, 2.2, 14, false); mb.blob(0, top + 2.6, 0, 1.25, 1.25, 1.25, 14, 8);
  mb.disc(0, 0.09, 0, 3.0, 3.6, 28);
  m = R.mesh(mb.build()); pinMesh.set(p.id, m); return m;
}
function setDest(p: Place | null) {
  if (p && place === p) { toast(`이미 ${p.name}에 있어요`); p = null; }
  dest = p;
  document.querySelectorAll<HTMLElement>('#placeList button').forEach(b => { (b.lastChild as HTMLElement).textContent = b.dataset.id === dest?.id ? '안내 중' : ''; });
  $('nav').classList.toggle('hidden', !dest); dropTag('dest');
  if (dest) toast(`📍 ${dest.name}까지 핀을 따라 운전해 보세요`);
}
function updateNav() {
  if (!dest) return;
  const dx = dest.x - me.x, dz = dest.z - me.z, d = Math.hypot(dx, dz);
  if (place === dest) { toast(`🎉 ${dest.name}에 도착했어요`); setDest(null); return; }
  const rel = Math.atan2(dx, dz) - (cam.h + cam.yaw);
  $('navArrow').style.transform = `rotate(${(-rel).toFixed(2)}rad)`;
  $('navText').textContent = `${dest.icon} ${dest.name} · ${Math.round(Math.max(0, d - dest.r))}m`;
}
function teleport(p: Place) {
  if (washAnim) return;
  const j = Math.random() * 2 - 1;
  me.x = p.spawn[0] + (p.id === 'lounge' ? j * 7 : 0); me.z = p.spawn[1]; me.h = p.spawn[2]; me.v = 0; me.steer = 0; cam.h = me.h; cam.yaw = 0;
  const a = cam.h; cam.tgt = [me.x, 1.25, me.z]; cam.eye = [me.x - Math.sin(a) * cam.dist * Math.cos(cam.pitch), 1.25 + cam.dist * Math.sin(cam.pitch), me.z - Math.cos(a) * cam.dist * Math.cos(cam.pitch)];
  flashScreen();
}
// 구역 액션
let zoneKey = '';
function renderZone() {
  const z = $('zone'); z.innerHTML = '';
  const btn = (t: string, fn: () => void, ghost = false) => { const b = el('button', 'btn sm' + (ghost ? ' ghost' : ''), t); b.onclick = fn; z.append(b); return b; };
  if (!place) return;
  if (place.id === 'wash') {
    if (washAnim) { z.append(el('span', '', washAnim.kind === 'foam' ? '🫧 거품 뿌리는 중…' : washAnim.kind === 'rinse' ? '💦 헹구는 중…' : '✨ 광택 내는 중…')); return; }
    if (!inBay()) { z.append(el('span', '', '🫧 빈 세차 베이 안으로 들어가 주세요')); return; }
    if (Math.abs(me.v) > 0.6) { z.append(el('span', '', '차를 완전히 세워주세요')); return; }
    const st = el('div', 'steps'); for (let i = 0; i < 3; i++) st.append(el('i', i < washStage ? 'on' : '')); z.append(st);
    if (washStage === 0) btn('① 거품 뿌리기', () => startWash('foam'));
    else if (washStage === 1) btn('② 고압수 세척', () => startWash('rinse'));
    else btn('③ 광택 내기', () => startWash('polish'));
  } else if (place.id === 'tune') { z.append(el('span', '', '🔧 튜닝샵')); btn('🎨 꾸미기 열기', openCustom); }
  else if (place.id === 'cafe') { z.append(el('span', '', '☕ 감성 카페')); btn('커피 한 잔', () => emote('☕', '따뜻한 라떼 한 잔 나왔어요 ☕')); btn('📷 사진', () => { takePhoto = true; }, true); }
  else if (place.id === 'lounge') { z.append(el('span', '', '🏁 오너 라운지')); btn('👋 인사하기', () => emote('👋', '주변에 인사를 건넸어요')); btn('📷 사진', () => { takePhoto = true; }, true); }
  else { z.append(el('span', '', '🌊 오션뷰 전망대')); btn('📷 사진', () => { takePhoto = true; }); }
}
function emote(e: string, msg: string) { me.bubble = e; me.bubbleT = 3.5; net.send({ t: 'emote', e }); toast(msg); }
function updateZone() {
  let best: Place | null = null;
  for (const p of PLACES) if (Math.hypot(me.x - p.x, me.z - p.z) < p.r) best = p;
  if (best !== place) {
    place = best;
    document.querySelectorAll<HTMLElement>('#placeList button').forEach(b => b.classList.toggle('on', b.dataset.id === place?.id));
    if (place) { const b = $('banner'); b.innerHTML = ''; b.append(document.createTextNode(place.icon + ' ' + place.name), el('small', '', place.desc)); b.classList.add('on'); clearTimeout(bannerT); bannerT = window.setTimeout(() => b.classList.remove('on'), 3200); }
    if (!place || place.id !== 'wash') { if (washStage === 2) washStage = 0; }
  }
  const key = (place?.id ?? '') + '|' + (place?.id === 'wash' ? [inBay(), Math.abs(me.v) > 0.6, washStage, !!washAnim].join() : '');
  if (key !== zoneKey) { zoneKey = key; renderZone(); }
}
let bannerT = 0;
// 시트 (꾸미기 / 설정 / 인증 안내)
const sheet = $('sheet'), sheetBody = $('sheetBody');
function closeSheet() { sheet.classList.add('hidden'); }
$('sheetClose').onclick = closeSheet;
function section(title: string) { sheetBody.append(el('div', 'lbl', title)); const d = el('div'); sheetBody.append(d); return d; }
function openCustom() {
  sheetBody.innerHTML = ''; sheet.classList.remove('hidden');
  sheetBody.append(el('h2', '', '🎨 차량 꾸미기'), el('p', '', `내 차량: BYD ${carById(me.model).name} (차종은 변경할 수 없어요). 변경 사항은 바로 적용되고 저장돼요.`));
  const b = section('차체 색상'); b.className = 'swatches'; swatches(b, BODY_COLORS, () => me.look.body, c => { me.look.body = c; lookChanged(); });
  const t = section('투톤 루프'); t.className = 'pills'; pills(t, ['끄기', '켜기'], () => me.look.twoTone ? 1 : 0, i => { me.look.twoTone = !!i; lookChanged(); });
  const r = section('루프 색상'); r.className = 'swatches'; swatches(r, ['#f7f7f2', '#2b2f38', ...BODY_COLORS.slice(0, 7)], () => me.look.roof, c => { me.look.roof = c; me.look.twoTone = true; lookChanged(); pills(t, ['끄기', '켜기'], () => 1, i => { me.look.twoTone = !!i; lookChanged(); }); });
  const w = section('휠 디자인'); w.className = 'pills'; pills(w, WHEEL_NAMES, () => me.look.wheel, i => { me.look.wheel = i; lookChanged(); });
  const wc = section('휠 색상'); wc.className = 'swatches'; swatches(wc, RIM_COLORS, () => me.look.rim, c => { me.look.rim = c; lookChanged(); });
  const d = section('데칼'); d.className = 'pills'; pills(d, DECAL_NAMES, () => me.look.decal, i => { me.look.decal = i; lookChanged(); });
  const dc = section('데칼 색상'); dc.className = 'swatches'; swatches(dc, ['#f7f7f2', '#2b2f38', '#ff8fa3', '#ffe08a', '#6fd3bd', '#3f7fd9', '#e8636b'], () => me.look.decalCol, c => { me.look.decalCol = c; lookChanged(); });
  const p = section('번호판'); p.className = 'pills'; pills(p, PLATES.map(x => x.name), () => me.look.plate, i => { me.look.plate = i; lookChanged(); });
  cam.yaw = 2.5; cam.lastDrag = time + 6;
}
function openSettings() {
  sheetBody.innerHTML = ''; sheet.classList.remove('hidden');
  sheetBody.append(el('h2', '', '⚙️ 설정'));
  const save = () => { store.set('settings', settings); applySettings(); };
  const tod = section('시간대'); tod.className = 'pills'; const keys2 = ['auto', 'day', 'sunset', 'night'];
  pills(tod, ['자동 순환', '낮', '노을', '밤'], () => keys2.indexOf(settings.tod), i => { settings.tod = keys2[i]; save(); });
  const q = section('그래픽 품질'); q.className = 'pills'; pills(q, ['낮음', '보통', '높음'], () => settings.quality, i => { settings.quality = i; save(); });
  const s = section('소리'); s.className = 'pills'; pills(s, ['끄기', '켜기'], () => settings.sound ? 1 : 0, i => { settings.sound = !!i; save(); });
  const n = section('닉네임'); const b = el('button', 'btn ghost sm', '시작 화면에서 다시 설정'); b.onclick = () => location.reload(); n.append(b);
  const u = section('차가 끼었을 때'); const ub = el('button', 'btn ghost sm', '🏁 오너 라운지로 복귀'); ub.onclick = () => { teleport(PLACES[0]); closeSheet(); }; u.append(ub);
  sheetBody.append(el('p', 'fine', 'BYD DRIVE WORLD는 BYD와 무관한 비공식 오너 커뮤니티 데모입니다.'));
}
function openAuth() {
  sheetBody.innerHTML = ''; sheet.classList.remove('hidden');
  sheetBody.append(el('h2', '', '오너 인증 안내'),
    el('p', '', '현재 상태: 미인증 (데모 입장)'),
    el('p', '', '오너 인증(회원가입 → 인증 신청 → 관리자 승인)은 아직 구현되지 않았습니다. 지금은 누구나 입장할 수 있는 체험판이며, 인증 완료로 표시되는 사용자는 없습니다.'),
    el('p', '', '정식 인증은 실제 백엔드와 연결되는 4단계 개발에서 제공될 예정입니다.'));
}
function applySettings() {
  R.quality = [0.6, 0.8, 1][settings.quality] ?? 1; R.shadows = settings.quality > 0;
  $('btnTime').textContent = settings.tod === 'auto' ? '🕒' : settings.tod === 'day' ? '☀️' : settings.tod === 'sunset' ? '🌇' : '🌙';
}
// 채팅
let chatCh: 'all' | 'near' = 'all';
function addMsg(p: HTMLElement) { const log = $('chatLog'); log.append(p); while (log.children.length > 80) log.firstChild!.remove(); log.scrollTop = log.scrollHeight; if (!$('chat').classList.contains('open')) $('chatDot').classList.add('on'); }
function sysMsg(t: string) { addMsg(el('p', 'sys', t)); }
function buildChat() {
  document.querySelectorAll<HTMLButtonElement>('.chat-head button').forEach(b => b.onclick = () => { chatCh = b.dataset.ch as 'all' | 'near'; document.querySelectorAll('.chat-head button').forEach(x => x.classList.toggle('on', x === b)); });
  $<HTMLFormElement>('chatForm').onsubmit = e => {
    e.preventDefault(); const i = $<HTMLInputElement>('chatIn'), text = i.value.trim(); if (!text) { i.blur(); return; }
    i.value = '';
    if (!net.online) { sysMsg('오프라인 상태예요. 서버에 연결되면 다른 오너들과 채팅할 수 있어요.'); return; }
    net.send({ t: 'chat', ch: chatCh, text });
  };
  net.on.chat = m => {
    const p = el('p', m.id === net.id ? 'me' : m.id === 0 ? 'sys' : ''); if (m.ch === 'near') p.append(el('i', '', '주변'));
    if (m.id !== 0) p.append(el('b', '', m.name)); p.append(document.createTextNode(m.text)); addMsg(p);
    if (m.id === net.id) { me.bubble = m.text; me.bubbleT = 5; }
  };
  net.on.status = refreshStatus;
  net.on.notice = t => sysMsg(t);
  net.on.leave = r => { dropTag('p' + r.id); views.delete(r); };
  net.on.horn = r => horn(clamp(1 - Math.hypot(r.x - me.x, r.z - me.z) / 90, 0, 1));
}
function doHorn() { horn(1); net.send({ t: 'horn' }); me.bubble = '📯'; me.bubbleT = 1; }
// 사진
let takePhoto = false;
function savePhoto() {
  flashScreen();
  canvas.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `byd-drive-world-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('📷 사진을 저장했어요'); }, 'image/png');
}

// ---------- 메인 루프
let last = performance.now(), sendAcc = 0, uiAcc = 0, saveAcc = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (settings.tod === 'auto') todClock = (todClock + dt / 420) % 1;
  env = envAt(settings.tod === 'auto' ? todClock : TOD_FIX[settings.tod]);

  drive(dt); updateWash(dt); updateCamera(dt);
  if (started) { updateZone(); updateNav(); }

  // 원격 플레이어 보간
  for (const o of net.players.values()) {
    o.tx += Math.sin(o.th) * o.v * dt; o.tz += Math.cos(o.th) * o.v * dt;
    const k = Math.min(1, dt * 10); o.x = lerp(o.x, o.tx, k); o.z = lerp(o.z, o.tz, k); o.h = angLerp(o.h, o.th, k);
    o.spin += o.v / carById(o.model).wr * dt;
    if (o.bubbleT) { o.bubbleT -= dt; if (o.bubbleT <= 0) { o.bubbleT = 0; o.bubble = ''; } }
  }
  if (me.bubbleT) { me.bubbleT -= dt; if (me.bubbleT <= 0) { me.bubbleT = 0; me.bubble = ''; } }
  // 분수
  if (Math.hypot(cam.eye[0], cam.eye[2]) < 120) for (let i = 0; i < 2; i++) { const a = Math.random() * 6.28; spawn(0, 2.0, 0, Math.cos(a) * rnd(.6, 1.6), rnd(2.5, 4), Math.sin(a) * rnd(.6, 1.6), 1.1, rnd(.08, .15), [0.8, 0.94, 1], 0.8, 9); }

  // 그리기 목록
  const items: DrawItem[] = [{ mesh: worldMesh, m: I4 }];
  const bounce = Math.sin(time * 9) * 0.004 * Math.min(1, Math.abs(me.v) / 6);
  pushCar(items, me, me.model, me.look, me.x, bounce, me.z, me.h, me.steer, me.spin, me.dirt, me.foam, me.gloss, me.brake, me.roll, me.pitch);
  for (const o of net.players.values()) pushCar(items, o, o.model, o.look, o.x, 0, o.z, o.h, o.st * 0.5, o.spin, o.dirt, o.foam, 0, o.brake);
  if (dest) items.push({ mesh: pinFor(dest), m: mul(trans(dest.x, Math.sin(time * 2.2) * 0.25, dest.z), rotY(time * 0.8)), pal: pinPal });
  DISPLAY_SPOTS.forEach((d, i) => pushCar(items, 'd' + i, CARS[i].id, displayLooks[i], d[0], 0.225, d[1], d[2] + time * 0.12, 0.3, 0, 0, 0, 1, false));

  const pCount = updateParticles(dt);
  const portrait = innerHeight > innerWidth;
  R.render({ eye: cam.eye, target: cam.tgt, fov: portrait ? 1.2 : 0.95, env, time, items, particles: pData, pCount, focus: [cam.tgt[0], 0, cam.tgt[2]] });
  if (takePhoto) { takePhoto = false; savePhoto(); }

  // 이름표
  if (started) tag('me', 'me', me.name, [me.x, carById(me.model).H + 0.55, me.z], 60, me.bubble);
  for (const o of net.players.values()) tag('p' + o.id, '', o.name, [o.x, carById(o.model).H + 0.55, o.z], 140, o.bubble || '');
  for (const p of PLACES) if (p !== dest) tag('pl' + p.id, 'place', p.icon + ' ' + p.name, [p.x, p.ly, p.z], 230); else dropTag('pl' + p.id);
  if (dest) tag('dest', 'dest', `📍 ${dest.name}`, [dest.x, dest.ly + 7, dest.z], 2000);
  DISPLAY_SPOTS.forEach((d, i) => tag('d' + i, 'disp', '전시 · ' + CARS[i].name, [d[0], 2.6, d[1]], 26));

  // 네트워크 전송 15Hz
  sendAcc += dt;
  if (started && net.online && sendAcc > 0.066) { sendAcc = 0; const r2 = (v: number) => Math.round(v * 100) / 100;
    net.send({ t: 's', p: [r2(me.x), r2(me.z), r2(me.h), r2(me.v), r2(me.steer / 0.6), r2(me.dirt), r2(me.foam), me.brake ? 1 : 0] }); }
  // HUD 갱신
  uiAcc += dt;
  if (started && uiAcc > 0.1) { uiAcc = 0;
    $('spd').textContent = String(Math.round(Math.abs(me.v) * 3.6));
    const clean = Math.round((1 - me.dirt) * 100); $('cleanBar').style.width = clean + '%'; $('cleanPct').textContent = clean + '%';
    $('carState').textContent = me.foam > 0.3 ? '거품 가득 🫧' : me.gloss > 0.5 ? '광택 반짝 ✨' : clean > 80 ? '깨끗함' : clean > 45 ? '먼지 조금' : '세차가 필요해요'; }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; store.set('dirt', Math.round(me.dirt * 100) / 100); }
  requestAnimationFrame(frame);
}

// ---------- 시작
buildStart(); buildPlaces(); buildChat(); applySettings(); refreshCarCard(); refreshStatus();
$('btnCustom').onclick = openCustom; $('btnPhoto').onclick = () => { takePhoto = true; }; $('btnHornPc').onclick = doHorn;
$('btnSet').onclick = openSettings; $('nav').onclick = () => setDest(null); $('chipAuth').onclick = openAuth;
$('btnTime').onclick = () => { const o = ['auto', 'day', 'sunset', 'night']; settings.tod = o[(o.indexOf(settings.tod) + 1) % 4]; store.set('settings', settings); applySettings(); toast('시간대: ' + ['자동 순환', '낮', '노을', '밤'][o.indexOf(settings.tod)]); };
document.querySelectorAll<HTMLButtonElement>('#mtoggles button').forEach(b => b.onclick = () => {
  const id = b.dataset.open!; const was = $(id).classList.contains('open');
  for (const k of ['places', 'carCard', 'chat']) $(k).classList.remove('open');
  if (!was) { $(id).classList.add('open'); if (id === 'chat') $('chatDot').classList.remove('on'); }
});
(window as any).__bdw = { me, net, cam, pad, setDest, get dest() { return dest; }, get time() { return time; }, teleport, PLACES, settings, start: () => $('btnStart').click() }; // 테스트/디버그용
requestAnimationFrame(frame);
