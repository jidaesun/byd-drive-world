// 월드: 타원형 섬. 중앙 오너 라운지, 서쪽 세차장, 동쪽 카페, 북쪽 튜닝샵, 섬을 한 바퀴 도는 오션뷰 드라이브 코스
import { MB } from './geom';
import { V3, rng } from './math';

export const ISL = { A: 190, B: 150 };
export const LOOP = { a: 172, b: 132, w: 9 };
export interface Collider { x: number; z: number; r?: number; hx?: number; hz?: number; }
export interface Place { id: string; name: string; icon: string; desc: string; x: number; z: number; r: number; spawn: [number, number, number]; ly: number; }

export const PLACES: Place[] = [
  { id: 'lounge', name: '오너 라운지', icon: '🏁', desc: '차를 세워두고 구경하고 사진 찍는 광장', x: 0, z: 0, r: 30, spawn: [0, 15, Math.PI], ly: 9 },
  { id: 'wash', name: '셀프 세차장', icon: '🫧', desc: '베이에 정차하면 세차를 시작할 수 있어요', x: -85, z: -20, r: 15, spawn: [-85, -6, Math.PI], ly: 8.5 },
  { id: 'cafe', name: '감성 카페', icon: '☕', desc: '테라스 앞 주차장에 세우고 쉬어가요', x: 72, z: 14, r: 16, spawn: [68, 2, 0], ly: 9 },
  { id: 'coast', name: '오션뷰 드라이브 코스', icon: '🌊', desc: '섬을 한 바퀴 도는 해안도로와 전망대', x: 0, z: 142, r: 17, spawn: [-14, 132, Math.PI / 2], ly: 7 },
  { id: 'tune', name: '튜닝샵', icon: '🔧', desc: '턴테이블 위에서 차량을 꾸며보세요', x: 9, z: -70, r: 7, spawn: [9, -70, -Math.PI / 2], ly: 9.5 },
];
export const WASH_BAYS = [-91, -85, -79].map(x => ({ x, z0: -26, z1: -14 }));
export const DISPLAY_SPOTS: [number, number, number][] = [[-17, -17, 0.8], [17, -17, -0.8], [-19, 15, 2.3], [19, 15, -2.3]];
export const PIER = { x0: -3.2, x1: 3.2, z0: 140, z1: 193 };

const ell = (x: number, z: number, a: number, b: number) => Math.sqrt(x * x / (a * a) + z * z / (b * b));

/** 주행 가능 영역으로 위치를 제한. 밀려났으면 true */
export function confine(p: { x: number; z: number }): boolean {
  if (p.x > PIER.x0 && p.x < PIER.x1 && p.z > PIER.z0 - 10 && p.z < PIER.z1) return false;
  const e = ell(p.x, p.z, ISL.A, ISL.B);
  if (e > 0.975) {
    if (Math.abs(p.x) < PIER.x1 + 1.5 && p.z > 0 && p.z < PIER.z1 + 2) { // 부두 가장자리
      p.x = Math.max(PIER.x0 + 0.05, Math.min(PIER.x1 - 0.05, p.x)); p.z = Math.min(p.z, PIER.z1 - 0.05); return true;
    }
    p.x *= 0.975 / e; p.z *= 0.975 / e; return true;
  }
  return false;
}
export function onRoad(x: number, z: number): boolean {
  if (Math.abs(ell(x, z, LOOP.a, LOOP.b) - 1) * 150 < LOOP.w / 2 + 0.5) return true;
  if (Math.abs(z) < 4.5 && Math.abs(x) < LOOP.a) return true;
  if (Math.abs(x) < 4.5 && Math.abs(z) < LOOP.b + 40) return true;
  if (x * x + z * z < 29 * 29) return true;
  for (const r of PADS) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return true;
  return false;
}
// 포장된 구역 [x0,z0,x1,z1]
const PADS: [number, number, number, number][] = [
  [-97, -32, -73, -4], // 세차장
  [58, 4, 108, 34],    // 카페
  [2, -80, 34, -60],   // 튜닝샵
  [-13, 137, 13, 151], // 전망대
];

export function buildWorld() {
  const mb = new MB(), col: Collider[] = [], R = rng(20261114);
  const rr = (a: number, b: number) => a + (b - a) * R();
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];

  // ---------- 지형
  const grass = ['#a9de8c', '#9fd884', '#b3e394', '#a3db8a', '#97d47e'];
  const rings = [0, .12, .24, .36, .48, .6, .7, .8, .88, .95, 1.0], SEG = 96;
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2, r0 = rings[j], r1 = rings[j + 1];
    mb.c(pick(grass));
    const P = (a: number, r: number): V3 => [Math.cos(a) * ISL.A * r, 0, Math.sin(a) * ISL.B * r];
    mb.quad(P(a0, r0), P(a0, r1), P(a1, r1), P(a1, r0), [0, 1, 0]);
  }
  // 해변 + 얕은 바닥
  const beach: [number, number, string][] = [[0, 0, '#f8e7bd'], [8, -0.45, '#f3dca8'], [18, -1.7, '#e3cf9c'], [46, -7, '#9fcfc0']];
  for (let j = 0; j < beach.length - 1; j++) for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
    const P = (a: number, k: number): V3 => [Math.cos(a) * (ISL.A + beach[k][0]), beach[k][1], Math.sin(a) * (ISL.B + beach[k][0])];
    mb.c(beach[j][2]); mb.quad(P(a0, j), P(a0, j + 1), P(a1, j + 1), P(a1, j), [0, 1, 0]);
  }

  // ---------- 도로
  const ASP = '#9aa1b5', LINE = '#fff8e0', EDGE = '#e8e2d4';
  const ringStrip = (a: number, b: number, w0: number, w1: number, y: number, seg = 160, t0 = 0, t1 = Math.PI * 2, dash = false) => {
    for (let i = 0; i < seg; i++) {
      if (dash && i % 2) continue;
      const u0 = t0 + (t1 - t0) * i / seg, u1 = t0 + (t1 - t0) * (i + 1) / seg;
      const P = (u: number, w: number): V3 => [Math.cos(u) * (a + w), y, Math.sin(u) * (b + w)];
      mb.quad(P(u0, w0), P(u0, w1), P(u1, w1), P(u1, w0), [0, 1, 0]);
    }
  };
  mb.c(EDGE); ringStrip(LOOP.a, LOOP.b, -LOOP.w / 2 - 0.5, LOOP.w / 2 + 0.5, 0.02);
  mb.c(ASP); ringStrip(LOOP.a, LOOP.b, -LOOP.w / 2, LOOP.w / 2, 0.035);
  mb.c(LINE); ringStrip(LOOP.a, LOOP.b, -0.14, 0.14, 0.05, 240, 0, Math.PI * 2, true);
  const road = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    mb.c(EDGE); alongX ? mb.flat(x0, z0 - 4.5, x1, z1 + 4.5, 0.02) : mb.flat(x0 - 4.5, z0, x1 + 4.5, z1, 0.02);
    mb.c(ASP); alongX ? mb.flat(x0, z0 - 4, x1, z1 + 4, 0.036) : mb.flat(x0 - 4, z0, x1 + 4, z1, 0.036);
    mb.c(LINE);
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let d = 2; d < len - 2; d += 5) alongX ? mb.flat(x0 + d, z0 - 0.13, x0 + d + 2.4, z0 + 0.13, 0.05) : mb.flat(x0 - 0.13, z0 + d, x0 + 0.13, z0 + d + 2.4, 0.05);
  };
  road(-LOOP.a + 3, 0, -27, 0); road(27, 0, LOOP.a - 3, 0); road(0, -LOOP.b + 3, 0, -27); road(0, 27, 0, LOOP.b - 3);
  // 남쪽 산책로
  mb.c('#f0dcc0'); ringStrip(183.5, 143.5, -1.3, 1.3, 0.03, 80, 0.2, Math.PI - 0.2);

  // ---------- 오너 라운지
  mb.c('#d9cbb6'); mb.disc(0, 0.03, 0, 0, 29, 64);
  mb.c('#eadfca'); mb.disc(0, 0.045, 0, 0, 27.6, 64);
  mb.c('#dccdb4'); mb.disc(0, 0.05, 0, 9, 9.6, 48); mb.disc(0, 0.05, 0, 21, 21.5, 64);
  // 분수
  mb.c('#e3d8c8'); mb.cyl(0, 0, 0, 3.6, 3.4, 0.55, 28); mb.c('#8fd6ee'); mb.disc(0, 0.56, 0, 0, 3.05, 28);
  mb.c('#f3eadb'); mb.cyl(0, 0.5, 0, 0.9, 0.6, 1.3, 16); mb.c('#8fd6ee'); mb.disc(0, 1.81, 0, 0, 0.55, 16);
  mb.c('#ff9fb2'); mb.blob(0, 2.9, 0, 0.75, 0.75, 0.75, 12, 8); mb.c('#f3eadb'); mb.cyl(0, 1.8, 0, 0.16, 0.12, 0.5, 8);
  col.push({ x: 0, z: 0, r: 3.9 });
  // 주차선 (남쪽/북쪽)
  mb.c('#ffffff');
  for (const zc of [14, -14]) for (let i = 0; i <= 6; i++) mb.flat(-9 + i * 3 - 0.07, zc - 2.6, -9 + i * 3 + 0.07, zc + 2.6, 0.06);
  // 전시 포디움
  for (const [x, z] of DISPLAY_SPOTS) {
    mb.c('#fff3f6'); mb.cyl(x, 0, z, 3.5, 3.3, 0.22, 28); mb.c('#ffc2d1'); mb.disc(x, 0.225, z, 2.95, 3.2, 28);
    col.push({ x, z, r: 2.6 });
  }
  // 가로등 + 화분
  for (let i = 0; i < 16; i++) {
    const a = (i + 0.5) / 16 * Math.PI * 2, x = Math.cos(a) * 27.9, z = Math.sin(a) * 27.9;
    if (i % 2 === 0) { lamp(mb, x, z, 4.2); col.push({ x, z, r: 0.3 }); }
    else { mb.c('#e9dcc8'); mb.cyl(x, 0, z, 0.9, 1.05, 0.7, 10); mb.c('#8fd19e'); mb.blob(x, 1.0, z, 0.95, 0.6, 0.95, 7, 4, true);
      for (let k = 0; k < 5; k++) { mb.c(pick(['#ff9fb2', '#ffe08a', '#ffffff', '#c9b6ff'])); mb.blob(x + rr(-.6, .6), 1.45, z + rr(-.6, .6), 0.2, 0.2, 0.2, 5, 3, true); }
      col.push({ x, z, r: 1.1 }); }
  }
  // 클럽하우스
  building(mb, col, -30, -34, 16, 10, 4.6, '#fff4e3', '#ff9fb2', 'S');
  mb.c('#ffd4dd'); mb.box(-30, 4.6, -34, 6, 1.6, 4);  mb.c('#ff9fb2'); mb.box(-30, 6.2, -34, 6.6, 0.3, 4.6);
  // 포토존 프레임
  for (const sx of [-1, 1]) { mb.c('#ff9fb2'); mb.box(31 + sx * 2.3, 0.4, 30, 0.45, 3.4, 0.45); mb.c('#ffffff'); mb.blob(31 + sx * 2.3, 4.0, 30, 0.42, 0.42, 0.42, 8, 5); }
  mb.c('#ff9fb2'); mb.box(31, 3.5, 30, 5.05, 0.45, 0.45);
  mb.c('#ff7a92'); mb.blob(30.55, 4.75, 30, 0.6, 0.6, 0.4, 10, 6); mb.blob(31.45, 4.75, 30, 0.6, 0.6, 0.4, 10, 6);
  mb.tri([29.98, 4.6, 30.01], [32.02, 4.6, 30.01], [31, 3.75, 30.01], [0, 0, 1]); mb.tri([29.98, 4.6, 29.99], [32.02, 4.6, 29.99], [31, 3.75, 29.99], [0, 0, -1]);
  mb.c('#fff4e3'); mb.box(31, 0, 30, 5.6, 0.4, 1.6); col.push({ x: 31, z: 30, hx: 2.9, hz: 0.9 });

  // ---------- 셀프 세차장
  mb.c('#dfe7ee'); mb.flat(-97, -32, -73, -4, 0.04);
  mb.c('#c8eaf5'); mb.flat(-94.2, -27, -75.8, -13, 0.055);
  for (let i = 0; i < 4; i++) {
    const x = -94 + i * 6;
    mb.c('#ffffff'); mb.box(x, 0, -20, 0.4, 3.4, 10); mb.c('#7fd3ee'); mb.box(x, 3.4, -20, 0.5, 0.25, 10.2);
    col.push({ x, z: -20, hx: 0.35, hz: 5.1 });
    for (const z of [-24.6, -15.4]) { mb.c('#ffffff'); mb.cyl(x, 0, z, 0.3, 0.3, 5.2, 10); }
    // 브러시 롤러
    if (i < 3) for (const s of [0.9, 5.1]) { mb.c(i % 2 ? '#ff9fb2' : '#7fd3ee'); mb.cyl(x + s, 0.3, -25.2, 0.42, 0.42, 2.6, 10); mb.c('#ffffff'); mb.cyl(x + s, 2.9, -25.2, 0.2, 0.2, 0.4, 8); col.push({ x: x + s, z: -25.2, r: 0.5 }); }
  }
  mb.c('#9ee3d6'); mb.box(-85, 5.2, -20, 21, 0.45, 14.5); mb.c('#ffffff'); mb.box(-85, 5.65, -20, 21.6, 0.18, 15.1);
  mb.c('#ffffff'); mb.box(-85, 5.83, -13.2, 12, 1.7, 0.5); mb.c('#7fd3ee'); mb.box(-85, 6.1, -12.9, 11, 1.15, 0.12);
  for (const [bx, by, br] of [[-93, 6.6, 1.3], [-91.2, 7.6, 0.8], [-77.5, 6.5, 1.1], [-79, 7.5, 0.65], [-76.4, 7.7, 0.5]]) { mb.c(br > 1 ? '#e6f8ff' : '#ffffff'); mb.blob(bx, by, -19, br, br, br, 12, 8); }
  for (const z of [-8, -29]) { mb.c('#ffe08a'); mb.box(-96, 0, z, 0.9, 1.5, 0.9); mb.c('#5b6472'); mb.cyl(-96, 1.5, z, 0.12, 0.12, 0.7, 6); col.push({ x: -96, z, r: 0.7 }); }

  // ---------- 감성 카페
  mb.c('#e9e2d6'); mb.flat(58, 4, 108, 34, 0.04);
  mb.c('#ffffff'); for (let i = 0; i <= 5; i++) mb.flat(60 + i * 3.2 - 0.07, 9, 60 + i * 3.2 + 0.07, 15, 0.06);
  mb.c('#d9b48f'); mb.box(92, 0, 16.5, 28, 0.3, 9); mb.c('#c9a37d'); for (let i = 0; i < 9; i++) mb.flat(78.2 + i * 3.1, 12.1, 78.3 + i * 3.1, 20.9, 0.31);
  building(mb, col, 92, 26.5, 18, 11, 4.4, '#fff6e9', '#f3a9a0', 'N');
  // 박공 지붕
  mb.c('#f3a9a0'); mb.quad([82.4, 4.7, 20.4], [101.6, 4.7, 20.4], [101.6, 7.3, 26.5], [82.4, 7.3, 26.5], [0, 1, -1]);
  mb.quad([82.4, 4.7, 32.6], [101.6, 4.7, 32.6], [101.6, 7.3, 26.5], [82.4, 7.3, 26.5], [0, 1, 1]);
  mb.c('#fff6e9'); for (const x of [83, 101]) mb.tri([x, 4.7, 21], [x, 4.7, 32], [x, 7.2, 26.5], [x > 90 ? 1 : -1, 0, 0]);
  // 커피컵 사인
  mb.c('#ffffff'); mb.cyl(98, 7.0, 24, 0.9, 1.25, 1.9, 16); mb.c('#8b5a3c'); mb.disc(98, 8.85, 24, 0, 1.15, 16);
  mb.c('#ffffff'); mb.box(99.5, 7.6, 24, 0.7, 0.9, 0.25); mb.c('#f3a9a0'); mb.cyl(98, 6.9, 24, 1.5, 1.5, 0.12, 16);
  for (const [sx, sy, sr] of [[97.8, 9.6, 0.32], [98.3, 10.3, 0.26], [97.9, 10.9, 0.2]]) { mb.c('#ffffff'); mb.blob(sx, sy, 24, sr, sr, sr, 8, 5); }
  // 테라스: 파라솔 테이블, 화분 울타리
  const paras = ['#ffb9c9', '#9fe0d2', '#ffe08a', '#cdc4f5'];
  for (let i = 0; i < 4; i++) {
    const x = 81.5 + i * 7, z = 16.2;
    mb.c('#fffaf2'); mb.cyl(x, 0.3, z, 0.12, 0.12, 0.75, 8); mb.cyl(x, 1.05, z, 0.85, 0.85, 0.08, 14);
    mb.c('#8b6b55'); mb.cyl(x, 1.1, z, 0.05, 0.05, 1.9, 6); mb.c(paras[i]); mb.cyl(x, 2.6, z, 1.9, 0.05, 0.7, 10, false);
    for (const a of [0.6, 2.2, 3.9, 5.4]) { mb.c('#fffaf2'); mb.cyl(x + Math.cos(a) * 1.35, 0.3, z + Math.sin(a) * 1.35, 0.3, 0.3, 0.5, 8); }
  }
  for (let i = 0; i < 9; i++) { const x = 79 + i * 3.25; mb.c('#fffaf2'); mb.box(x, 0.3, 12.4, 2.2, 0.55, 0.6); mb.c(i % 2 ? '#8fd19e' : '#a9de8c'); mb.blob(x, 1.0, 12.4, 1.05, 0.42, 0.4, 7, 4, true);
    if (i % 2) { mb.c('#ff9fb2'); mb.blob(x + 0.3, 1.3, 12.4, 0.18, 0.18, 0.18, 5, 3, true); mb.c('#ffe08a'); mb.blob(x - 0.4, 1.28, 12.3, 0.16, 0.16, 0.16, 5, 3, true); } }
  col.push({ x: 92, z: 16.5, hx: 14.2, hz: 4.7 });
  // 줄 조명
  for (let i = 0; i <= 14; i++) { const x = 78.5 + i * 1.93; mb.glow(pick(['#fff1b8', '#ffd0d8', '#c8f1ff'])); mb.blob(x, 3.5 - Math.sin(i / 14 * Math.PI) * 0.5, 12.2, 0.13, 0.13, 0.13, 5, 3); }
  for (const x of [78.5, 105.5]) { mb.c('#8b6b55'); mb.cyl(x, 0.3, 12.2, 0.07, 0.07, 3.3, 6); }

  // ---------- 튜닝샵
  mb.c('#d7d9e6'); mb.flat(2, -80, 34, -60, 0.04);
  mb.c('#4b4f66'); mb.disc(9, 0.055, -70, 0, 5.4, 36); mb.c('#f7f7f2'); mb.disc(9, 0.065, -70, 4.6, 5.0, 36);
  for (let i = 0; i < 12; i++) { mb.c(i % 2 ? '#ff9fb2' : '#ffe08a'); mb.disc(9, 0.07, -70, 5.0, 5.4, 3, i / 12 * Math.PI * 2, (i + 1) / 12 * Math.PI * 2); }
  building(mb, col, 26, -70, 14, 17, 6, '#5a5f80', '#cdc4f5', 'W');
  mb.c('#2f3247'); mb.box(18.95, 0.05, -70, 0.2, 4.2, 9); // 롤러 도어
  for (let i = 0; i < 7; i++) { mb.c('#3c4060'); mb.box(18.83, 0.5 + i * 0.55, -70, 0.06, 0.08, 8.8); }
  mb.glow('#ff9fb2'); mb.box(18.9, 4.5, -70, 0.14, 0.16, 9.6); mb.glow('#9fe0d2'); mb.box(18.9, 5.3, -70, 0.14, 0.12, 13);
  // 휠 간판
  mb.push(new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 19.6, 7.9, -70, 1]));
  mb.c('#2a2e38'); mb.cyl(0, -0.25, 0, 1.7, 1.7, 0.5, 20, true, true); mb.c('#ffe08a'); mb.cyl(0, 0.25, 0, 1.1, 1.0, 0.1, 20); mb.pop();
  // 타이어 더미, 공구함
  for (const [x, z] of [[4, -62], [5.2, -61.6], [4.5, -78.4]]) { for (let k = 0; k < 3; k++) { mb.c('#2a2e38'); mb.cyl(x, k * 0.34, z, 0.52, 0.52, 0.3, 12); } col.push({ x, z, r: 0.7 }); }
  mb.c('#e8636b'); mb.box(15, 0, -61.5, 1.6, 1.1, 0.8); mb.c('#5b6472'); mb.box(15, 1.1, -61.5, 1.7, 0.08, 0.9); col.push({ x: 15, z: -61.5, hx: 0.9, hz: 0.5 });

  // ---------- 전망대 + 부두
  mb.c('#e3c7a1'); mb.flat(-13, 137, 13, 151, 0.045);
  mb.c('#d4b48a'); for (let i = 0; i < 4; i++) mb.flat(-13, 139 + i * 3.4, 13, 139.12 + i * 3.4, 0.05);
  mb.c("#c9a37d"); mb.box(0, -0.27, 171, 7.4, 0.3, 46);
  mb.c('#b8926c'); for (let z = 150; z <= 192; z += 6) for (const x of [-3.3, 3.3]) { mb.cyl(x, -5, z, 0.22, 0.22, 5.9, 8); }
  for (const x of [-3.55, 3.55]) { mb.c('#fffaf2'); mb.box(x, 0.75, 171.5, 0.1, 0.1, 43); for (let z = 150; z <= 193; z += 3.07) mb.box(x, 0.05, z, 0.12, 0.75, 0.12); }
  mb.c('#fffaf2'); mb.box(0, 0.75, 193.6, 7.2, 0.1, 0.1); for (let x = -3.5; x <= 3.5; x += 1.75) mb.box(x, 0.05, 193.6, 0.12, 0.75, 0.12);
  lamp(mb, -3.3, 191, 3.4); lamp(mb, 3.3, 191, 3.4);
  // 전망대 난간, 벤치, 망원경
  for (const sx of [-1, 1]) { mb.c('#fffaf2'); mb.box(sx * 13, 0.8, 144, 0.12, 0.12, 13); for (let z = 137.6; z <= 150.5; z += 3.2) mb.box(sx * 13, 0.05, z, 0.14, 0.8, 0.14); col.push({ x: sx * 13, z: 144, hx: 0.25, hz: 6.6 });
    mb.c('#c9a37d'); mb.box(sx * 10.5, 0.35, 143, 0.9, 0.12, 3.2); mb.box(sx * 10.9, 0.5, 143, 0.12, 0.6, 3.2); mb.c('#8b6b55'); mb.box(sx * 10.5, 0.05, 141.8, 0.7, 0.3, 0.15); mb.box(sx * 10.5, 0.05, 144.2, 0.7, 0.3, 0.15);
    col.push({ x: sx * 10.6, z: 143, hx: 0.6, hz: 1.7 });
    mb.c('#5b6472'); mb.cyl(sx * 9, 0.05, 147.5, 0.1, 0.1, 1.2, 8); mb.c('#8ec5e8'); mb.box(sx * 9, 1.25, 147.5, 0.3, 0.3, 0.7); col.push({ x: sx * 9, z: 147.5, r: 0.4 });
    for (let z = 150.4; z < 151; z += 1) for (let x = 4.2; x <= 13; x += 2.9) { mb.c('#fffaf2'); mb.box(sx * x, 0.05, z, 0.14, 0.8, 0.14); }
    mb.c('#fffaf2'); mb.box(sx * 8.4, 0.8, 150.4, 9.3, 0.12, 0.12); col.push({ x: sx * 8.5, z: 150.6, hx: 4.9, hz: 0.3 });
  }
  // 등대 (동쪽 끝)
  mb.c('#c9ced6'); mb.blob(214, -1.5, 0, 9, 3.2, 8, 8, 5, true); mb.c('#e3d8c8'); mb.cyl(214, 0, 0, 3.4, 3.1, 0.8, 16);
  const lc = ['#ffffff', '#ff9fb2', '#ffffff', '#ff9fb2', '#ffffff'];
  for (let i = 0; i < 5; i++) { mb.c(lc[i]); mb.cyl(214, 0.8 + i * 2.6, 0, 2.3 - i * 0.22, 2.08 - i * 0.22, 2.6, 16); }
  mb.c('#5b6472'); mb.cyl(214, 13.8, 0, 1.7, 1.7, 0.25, 16); mb.glow('#fff1b8'); mb.cyl(214, 14.05, 0, 1.0, 1.0, 1.5, 12);
  mb.c('#ff9fb2'); mb.cyl(214, 15.55, 0, 1.5, 0.05, 1.3, 12, false);

  // ---------- 도로 가로등
  for (let i = 0; i < 28; i++) {
    const a = (i + 0.5) / 28 * Math.PI * 2, x = Math.cos(a) * (LOOP.a + 6.6), z = Math.sin(a) * (LOOP.b + 6.6);
    if (Math.abs(x) < 9 || Math.abs(z) < 9) continue;
    lamp(mb, x, z, 4.6); col.push({ x, z, r: 0.28 });
  }
  for (const s of [-1, 1]) for (let d = 40; d < 100; d += 20) { lamp(mb, d * s, 6, 4.2); col.push({ x: d * s, z: 6, r: 0.28 }); lamp(mb, 6, d * s, 4.2); col.push({ x: 6, z: d * s, r: 0.28 }); }

  // ---------- 나무, 꽃, 바위
  const blocked = (x: number, z: number, m: number) => {
    if (ell(x, z, LOOP.a, LOOP.b) > 1 - (LOOP.w / 2 + m + 1) / 132) return true; // 해안도로 바깥은 바다 전망을 위해 비움
    if (Math.abs(z) < 5.5 + m && Math.abs(x) < LOOP.a) return true;
    if (Math.abs(x) < 5.5 + m && Math.abs(z) < LOOP.b) return true;
    if (x * x + z * z < (31 + m) ** 2) return true;
    for (const r of PADS) if (x > r[0] - m - 1 && x < r[2] + m + 1 && z > r[1] - m - 1 && z < r[3] + m + 1) return true;
    if (x > -40 - m && x < -20 + m && z > -41 - m && z < -27 + m) return true; // 클럽하우스
    return false;
  };
  const leaf = ['#8fd19e', '#7ec98f', '#a6dd9a', '#9ad6a6', '#8fd19e', '#ffc4d6', '#ffd9a8'];
  let placed = 0;
  for (let t = 0; t < 1600 && placed < 240; t++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.9, x = Math.cos(a) * ISL.A * r, z = Math.sin(a) * ISL.B * r;
    if (blocked(x, z, 2.2)) continue;
    placed++;
    const s = rr(0.85, 1.5);
    if (R() < 0.3) { // 침엽수
      mb.c('#9b7a5e'); mb.cyl(x, 0, z, 0.24 * s, 0.2 * s, 1.1 * s, 6);
      const g = pick(['#6fbf9a', '#7cc9a4', '#62b58f']);
      for (let k = 0; k < 3; k++) { mb.c(g); mb.cyl(x, (0.9 + k * 1.15) * s, z, (1.75 - k * 0.42) * s, 0.02, 1.9 * s, 7, false, true); }
    } else {
      mb.c('#a98464'); mb.cyl(x, 0, z, 0.28 * s, 0.2 * s, 1.9 * s, 6);
      const g = pick(leaf);
      mb.c(g); mb.blob(x, 3.0 * s, z, 1.75 * s, 1.5 * s, 1.75 * s, 7, 5, true);
      mb.blob(x + rr(-.9, .9) * s, 2.5 * s, z + rr(-.9, .9) * s, 1.15 * s, 1.0 * s, 1.15 * s, 6, 4, true);
      mb.blob(x + rr(-.7, .7) * s, 3.9 * s, z + rr(-.7, .7) * s, 1.05 * s, 0.9 * s, 1.05 * s, 6, 4, true);
    }
    col.push({ x, z, r: 0.45 * s });
  }
  for (let t = 0; t < 260; t++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.95, x = Math.cos(a) * ISL.A * r, z = Math.sin(a) * ISL.B * r;
    if (blocked(x, z, 0.3)) continue;
    if (R() < 0.18) { mb.c(pick(['#c9ced6', '#b9c0cc', '#d6d9de'])); const s = rr(0.4, 1.0); mb.blob(x, s * 0.3, z, s, s * 0.7, s * 0.85, 6, 4, true); if (s > 0.6) col.push({ x, z, r: s * 0.8 }); continue; }
    const fc = pick(['#ff9fb2', '#ffe08a', '#ffffff', '#c9b6ff', '#ffb38a']);
    for (let k = 0; k < 6; k++) { const fx = x + rr(-1.4, 1.4), fz = z + rr(-1.4, 1.4); mb.c('#7ec98f'); mb.cyl(fx, 0, fz, 0.03, 0.03, 0.32, 4, false); mb.c(fc); mb.blob(fx, 0.38, fz, 0.16, 0.12, 0.16, 5, 3, true); }
  }
  // 해변 야자수
  for (let i = 0; i < 46; i++) {
    const a = (i + R() * 0.6) / 46 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.16) continue;
    const k = rr(0.985, 1.02), x = Math.cos(a) * ISL.A * k, z = Math.sin(a) * ISL.B * k, h = rr(4, 6), lean = rr(-0.7, 0.7);
    mb.c('#c9a37d'); for (let s = 0; s < 4; s++) mb.cyl(x + lean * s / 4, s * h / 4 - 0.3, z, 0.22 - s * 0.02, 0.2 - s * 0.02, h / 4 + 0.35, 6);
    const tx = x + lean, ty = h - 0.1;
    for (let l = 0; l < 6; l++) { const la = l / 6 * Math.PI * 2 + a; mb.c(l % 2 ? '#7ec98f' : '#8fd19e');
      const dx = Math.cos(la), dz = Math.sin(la), px = -dz * 0.45, pz = dx * 0.45;
      mb.quad([tx, ty + 0.2, z], [tx + dx * 1.4 + px, ty + 0.25, z + dz * 1.4 + pz], [tx + dx * 3, ty - 0.9, z + dz * 3], [tx + dx * 1.4 - px, ty + 0.25, z + dz * 1.4 - pz], [0, 1, 0]); }
    mb.c('#a98464'); mb.blob(tx, ty, z, 0.3, 0.3, 0.3, 6, 4, true);
    col.push({ x, z, r: 0.35 });
  }
  // 먼 섬, 돛단배
  for (const [x, z, s] of [[420, -260, 60], [-460, -120, 80], [-300, 420, 50], [520, 240, 70], [60, -520, 90], [-140, 560, 45]]) {
    mb.c('#f3dca8'); mb.cyl(x, -1.2, z, s * 1.25, s * 1.1, 1.6, 14); mb.c('#9ad6a6'); mb.blob(x, 0, z, s, s * 0.42, s * 0.9, 10, 5, true); mb.c('#8fd19e'); mb.blob(x + s * 0.3, s * 0.15, z - s * 0.2, s * 0.5, s * 0.36, s * 0.5, 8, 4, true);
  }
  for (const [x, z, r] of [[40, 235, 0.4], [-120, 215, -0.6], [245, 60, 1.2], [-250, -40, 2]] as number[][]) {
    mb.push(new Float32Array([Math.cos(r), 0, -Math.sin(r), 0, 0, 1, 0, 0, Math.sin(r), 0, Math.cos(r), 0, x, -0.55, z, 1]));
    mb.c('#ffffff'); mb.box(0, -0.2, 0, 2.2, 0.9, 6); mb.c('#ff9fb2'); mb.box(0, 0.7, 0, 2.3, 0.15, 6.1);
    mb.c('#8b6b55'); mb.cyl(0, 0.7, 0.4, 0.07, 0.07, 6.2, 6); mb.c('#fffaf2'); mb.tri([0, 1.4, 0.3], [0, 6.6, 0.3], [0, 1.4, -2.9], [1, 0, 0]); mb.c('#ffe08a'); mb.tri([0, 1.4, 0.6], [0, 5.4, 0.6], [0, 1.4, 2.6], [1, 0, 0]);
    mb.pop();
  }
  return { data: mb.build(), colliders: col };

}

function lamp(mb: MB, x: number, z: number, h: number) {
  mb.c('#6b7385'); mb.cyl(x, 0, z, 0.16, 0.1, 0.4, 8); mb.cyl(x, 0.4, z, 0.07, 0.06, h - 0.4, 6);
  mb.c('#fffaf2'); mb.cyl(x, h, z, 0.3, 0.38, 0.12, 8); mb.glow('#fff1b8'); mb.blob(x, h + 0.42, z, 0.36, 0.36, 0.36, 8, 5);
  mb.c('#6b7385'); mb.cyl(x, h + 0.74, z, 0.2, 0.02, 0.2, 8, false);
}

/** 창문·문이 있는 단순 건물. front: 정면 방향 */
function building(mb: MB, col: Collider[], x: number, z: number, sx: number, sz: number, h: number, wall: string, trim: string, front: 'N' | 'S' | 'W') {
  mb.c(wall); mb.box(x, 0, z, sx, h, sz);
  mb.c(trim); mb.box(x, h, z, sx + 0.8, 0.35, sz + 0.8); mb.box(x, 0, z, sx + 0.15, 0.5, sz + 0.15);
  col.push({ x, z, hx: sx / 2 + 0.2, hz: sz / 2 + 0.2 });
  const win = (wx: number, wy: number, wz: number, w: number, hh: number, alongX: boolean) => {
    mb.c('#ffffff'); alongX ? mb.box(wx, wy - 0.1, wz, w + 0.25, hh + 0.2, 0.16) : mb.box(wx, wy - 0.1, wz, 0.16, hh + 0.2, w + 0.25);
    mb.glow('#ffe9b0'); alongX ? mb.box(wx, wy, wz, w, hh, 0.22) : mb.box(wx, wy, wz, 0.22, hh, w);
  };
  if (front === 'W') {
    const fx = x - sx / 2;
    for (const dz of [-6.3, 6.3]) win(fx, 1.4, z + dz, 2.4, 2.0, false);
  } else {
    const fz = front === 'N' ? z - sz / 2 : z + sz / 2, n = Math.floor(sx / 4);
    for (let i = 0; i < n; i++) {
      const wx = x - sx / 2 + (i + 0.5) * sx / n;
      if (i === Math.floor(n / 2)) { mb.c(trim); mb.box(wx, 0, fz, 2.0, 2.9, 0.2); mb.glow('#ffe9b0'); mb.box(wx, 1.3, fz, 1.3, 1.2, 0.26);
        mb.c(trim); mb.box(wx, 3.0, fz + (front === 'N' ? -0.8 : 0.8), 3.6, 0.14, 1.7); }
      else win(wx, 1.2, fz, 2.4, 1.9, true);
    }
  }
}
