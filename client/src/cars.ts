// 차량 4종: 공개된 제원(전장/전폭/전고/축거) 비율을 참고해 직접 만든 독자적 로우폴리 모델.
// 제조사 로고·공식 3D 에셋은 사용하지 않는다.
import { MB, hex } from './geom';
import { V3, norm, cross, sub, trans, rotZ, mul } from './math';

type Sec = [number, number, number, number]; // z(전장 비율), 반폭 비율, y 하단, y 상단
export interface CarSpec {
  id: string; name: string; kind: string; L: number; W: number; H: number; wb: number; wr: number;
  belt: number; clad: number; hl: number; tl: number; color: string; body: Sec[]; cabin: Sec[];
  bp: number;                     // B필러 위치 (전장 비율)
  doors: [number, number, number]; // 도어 분할선 위치 (전장 비율): 앞도어 앞, 앞/뒤 도어 사이, 뒷도어 뒤
  lamp: [number, number, number];  // 헤드램프 폭, 높이, 감싸는 각도
  rails: boolean; skid: boolean; spoiler: 0 | 1 | 2; // 루프레일, 스키드 플레이트, 0 없음 / 1 루프 스포일러 / 2 덕테일
}
export interface Look {
  body: string; roof: string; twoTone: boolean; rim: string; wheel: number;
  decal: number; decalCol: string; plate: number;
}

export const CARS: CarSpec[] = [
  { id: 'dolphin', name: 'DOLPHIN', kind: '해치백', L: 4.29, W: 1.77, H: 1.57, wb: 2.70, wr: 0.35, belt: .98, clad: 0.34, hl: 0.79, tl: 0.95, color: '#f4f4f0',
    bp: -.03, doors: [.20, -.03, -.27], lamp: [.46, .13, .5], rails: false, skid: false, spoiler: 1,
    body: [[-.5, .70, .50, .86], [-.492, .88, .38, .97], [-.47, .96, .30, 1.02], [-.42, 1, .26, 1.035], [-.15, 1, .23, 1.02], [.15, 1, .23, 1.0], [.31, 1, .25, .965], [.40, .98, .27, .91], [.455, .93, .30, .84], [.487, .84, .35, .76], [.5, .64, .44, .66]],
    cabin: [[-.475, .78, .9, .97], [-.44, .85, .9, 1.47], [-.36, .875, .9, 1.55], [-.2, .885, .9, 1.57], [.0, .885, .9, 1.565], [.12, .87, .9, 1.52], [.22, .84, .9, 1.33], [.325, .79, .9, .96]] },
  { id: 'atto3', name: 'ATTO 3', kind: '컴팩트 SUV', L: 4.455, W: 1.875, H: 1.615, wb: 2.72, wr: 0.37, belt: 1.0, clad: 0.5, hl: 0.80, tl: 0.93, color: '#9aa0a8',
    bp: -.03, doors: [.19, -.03, -.26], lamp: [.52, .085, .42], rails: true, skid: true, spoiler: 1,
    body: [[-.5, .70, .52, .88], [-.492, .89, .40, 1.0], [-.47, .97, .31, 1.04], [-.42, 1, .28, 1.055], [-.15, 1, .25, 1.04], [.12, 1, .25, 1.02], [.28, 1, .27, .99], [.38, .98, .29, .95], [.445, .94, .31, .88], [.485, .86, .36, .80], [.5, .66, .46, .70]],
    cabin: [[-.46, .79, .92, .99], [-.425, .855, .92, 1.50], [-.34, .88, .92, 1.595], [-.18, .885, .92, 1.615], [.0, .885, .92, 1.61], [.09, .87, .92, 1.57], [.185, .84, .92, 1.38], [.285, .79, .92, .99]] },
  { id: 'seal', name: 'SEAL', kind: '스포츠 세단', L: 4.80, W: 1.875, H: 1.46, wb: 2.92, wr: 0.36, belt: .92, clad: 0.3, hl: 0.68, tl: 0.85, color: '#2b2f38',
    bp: -.04, doors: [.17, -.04, -.26], lamp: [.56, .065, .55], rails: false, skid: false, spoiler: 2,
    body: [[-.5, .68, .46, .78], [-.492, .88, .36, .89], [-.47, .96, .28, .93], [-.42, 1, .245, .945], [-.15, 1, .215, .935], [.12, 1, .215, .92], [.26, 1, .225, .87], [.36, .985, .24, .80], [.44, .94, .26, .72], [.485, .85, .30, .65], [.5, .62, .40, .57]],
    cabin: [[-.415, .76, .82, .90], [-.33, .82, .82, 1.20], [-.22, .855, .82, 1.37], [-.1, .865, .82, 1.445], [.01, .865, .82, 1.46], [.08, .85, .82, 1.42], [.16, .82, .82, 1.24], [.26, .77, .82, .89]] },
  { id: 'sealion7', name: 'SEALION 7', kind: '쿠페형 SUV', L: 4.83, W: 1.925, H: 1.62, wb: 2.93, wr: 0.39, belt: 1.03, clad: 0.5, hl: 0.83, tl: 1.0, color: '#f4f4f0',
    bp: -.03, doors: [.18, -.03, -.26], lamp: [.56, .075, .5], rails: false, skid: true, spoiler: 2,
    body: [[-.5, .70, .54, .93], [-.492, .89, .42, 1.04], [-.47, .97, .33, 1.075], [-.42, 1, .29, 1.085], [-.15, 1, .26, 1.07], [.12, 1, .26, 1.05], [.27, 1, .28, 1.01], [.37, .985, .30, .96], [.445, .94, .32, .88], [.485, .86, .37, .79], [.5, .65, .47, .69]],
    cabin: [[-.45, .77, .94, 1.04], [-.37, .83, .94, 1.33], [-.26, .865, .94, 1.52], [-.12, .875, .94, 1.605], [.01, .875, .94, 1.62], [.09, .86, .94, 1.58], [.18, .83, .94, 1.38], [.275, .78, .94, 1.0]] },
];
export const carById = (id: string) => CARS.find(c => c.id === id) ?? CARS[0];

export const BODY_COLORS = ['#f4f4f0', '#9aa0a8', '#2b2f38']; // 화이트, 그레이, 블랙
export const RIM_COLORS = ['#e9edf2', '#8d939c', '#3a3f4a'];
export const TRIM_COLORS = ['#f4f4f0', '#9aa0a8', '#2b2f38']; // 루프·데칼용
export const WHEEL_NAMES = ['5-스포크', '에어로 디스크', '멀티 스포크', '플라워'];
export const DECAL_NAMES = ['없음', '트윈 스트라이프', '사이드 라인', '웨이브 투톤', '도트', '센터 스트라이프'];
export const PLATES = [{ name: '화이트', c: '#f6f6f1' }, { name: 'EV 블루', c: '#8fd0f5' }, { name: '파스텔 핑크', c: '#ffc7d6' }, { name: '민트', c: '#b5ecd8' }, { name: '블랙', c: '#2a2d36' }];

export function defaultLook(spec: CarSpec): Look {
  return { body: spec.color, roof: '#2b2f38', twoTone: false, rim: '#e9edf2', wheel: 0, decal: 0, decalCol: spec.color === '#2b2f38' ? '#f4f4f0' : '#2b2f38', plate: 1 };
}
const HEXRE = /^#[0-9a-fA-F]{6}$/;
export function sanitizeLook(l: any, spec: CarSpec): Look {
  const d = defaultLook(spec); if (!l || typeof l !== 'object') return d;
  // 허용된 색상만 통과 (이전 버전에서 저장된 다른 색은 기본값으로 되돌림)
  const col = (v: any, f: string, ok: string[] = TRIM_COLORS) => typeof v === 'string' && HEXRE.test(v) && ok.includes(v.toLowerCase()) ? v.toLowerCase() : f;
  const int = (v: any, n: number, f: number) => Number.isInteger(v) && v >= 0 && v < n ? v : f;
  return { body: col(l.body, d.body, BODY_COLORS), roof: col(l.roof, d.roof), twoTone: !!l.twoTone, rim: col(l.rim, d.rim, RIM_COLORS), wheel: int(l.wheel, WHEEL_NAMES.length, 0),
    decal: int(l.decal, DECAL_NAMES.length, 0), decalCol: col(l.decalCol, d.decalCol), plate: int(l.plate, PLATES.length, 1) };
}

/** 팔레트: 0 차체, 1 루프, 2 림, 3 데칼, 4 유리, 5 테일램프, 6 헤드램프, 7 번호판 */
export function palette(look: Look, braking: boolean, night: number, out: Float32Array = new Float32Array(24)) {
  const set = (i: number, c: number[], k = 1) => { out[i * 3] = c[0] * k; out[i * 3 + 1] = c[1] * k; out[i * 3 + 2] = c[2] * k; };
  set(0, hex(look.body)); set(1, hex(look.twoTone ? look.roof : look.body)); set(2, hex(look.rim)); set(3, hex(look.decalCol));
  set(4, [0.17, 0.23, 0.30]);
  set(5, [1, 0.22, 0.25], braking ? 1 : 0.55 + night * 0.2);
  set(6, [1, 0.97, 0.86], 0.75 + night * 0.25);
  set(7, hex(PLATES[look.plate].c));
  return out;
}

function loft(mb: MB, secs: { z: number; hw: number; y0: number; y1: number }[], n: number, taper: number, K: number, matFn: (i: number, n: V3, y: number) => void) {
  const P: V3[][] = [], R: V3[][] = [], e = 2 / n;
  for (const s of secs) {
    const ring: V3[] = [], rad: V3[] = [];
    for (let k = 0; k < K; k++) {
      const a = k / K * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const sx = Math.sign(cs) * Math.pow(Math.abs(cs), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const t = (sy + 1) / 2, x = s.hw * sx * (1 - taper * t), y = (s.y0 + s.y1) / 2 + (s.y1 - s.y0) / 2 * sy;
      ring.push([x, y, s.z]); rad.push([cs, sn, 0]);
    }
    P.push(ring); R.push(rad);
  }
  const N: V3[][] = P.map((ring, i) => ring.map((_, k) => {
    const du = sub(P[Math.min(i + 1, P.length - 1)][k], P[Math.max(i - 1, 0)][k]);
    const dv = sub(ring[(k + 1) % K], ring[(k + K - 1) % K]);
    let nn = cross(du, dv); const l = Math.hypot(nn[0], nn[1], nn[2]);
    if (l < 1e-6) return R[i][k];
    nn = [nn[0] / l, nn[1] / l, nn[2] / l];
    const r = R[i][k]; if (nn[0] * r[0] + nn[1] * r[1] < 0) nn = [-nn[0], -nn[1], -nn[2]];
    return nn;
  }));
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < K; k++) {
    const k1 = (k + 1) % K;
    const a = P[i][k], b = P[i + 1][k], c = P[i + 1][k1], d = P[i][k1];
    const q = [N[i][k], N[i + 1][k], N[i + 1][k1], N[i][k1]];
    matFn(i, [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4], (a[1] + b[1] + c[1] + d[1]) / 4);
    mb.triN(a, N[i][k], b, N[i + 1][k], c, N[i + 1][k1]); mb.triN(a, N[i][k], c, N[i + 1][k1], d, N[i][k1]);
  }
  // 양 끝 캡
  for (const [i, nz] of [[0, -1], [P.length - 1, 1]] as [number, number][]) {
    const s = secs[i], ctr: V3 = [0, (s.y0 + s.y1) / 2, s.z], nn: V3 = [0, 0, nz];
    matFn(-1, nn, ctr[1]);
    for (let k = 0; k < K; k++) mb.triN(ctr, nn, P[i][k], nn, P[i][(k + 1) % K], nn);
  }
}

export interface CarMeshData { body: Float32Array; wheels: Float32Array[]; }

export function buildCar(spec: CarSpec): CarMeshData {
  const mb = new MB(), hw = spec.W / 2, L = spec.L, DARK = '#2a2e38', TRIM = '#3c4250';
  // ----- 차체
  const bodySecs = spec.body.map(s => ({ z: s[0] * L, hw: s[1] * hw, y0: s[2], y1: s[3] }));
  loft(mb, bodySecs, 4.2, 0.07, 32, (_i, _n, y) => { if (y < spec.clad) mb.c(TRIM); else mb.m(0); });
  // ----- 캐빈: 루프, 앞·뒤·옆 유리, A/B/C 필러
  const cab = spec.cabin.map(s => ({ z: s[0] * L, hw: s[1] * hw, y0: s[2], y1: s[3] }));
  const at = (z: number) => { // 단면 보간
    let i = 0; while (i < cab.length - 2 && cab[i + 1].z < z) i++;
    const a = cab[i], b = cab[i + 1], t = (z - a.z) / (b.z - a.z);
    return { z, hw: a.hw + (b.hw - a.hw) * t, y0: a.y0 + (b.y0 - a.y0) * t, y1: a.y1 + (b.y1 - a.y1) * t };
  };
  const bz = spec.bp * L, secs = [...cab, at(bz - 0.055), at(bz + 0.055)].sort((a, b) => a.z - b.z);
  const bStrip = secs.findIndex(s => Math.abs(s.z - (bz - 0.055)) < 1e-6), last = secs.length - 2;
  loft(mb, secs, 3.4, 0.2, 28, (i, n) => {
    if (n[1] > 0.6) mb.m(1);                                   // 루프
    else if (i === 0 || i === last) { if (Math.abs(n[0]) > 0.5) mb.m(1); else mb.m(4); } // A·C 필러 / 앞·뒤 유리
    else if (i === bStrip) mb.c('#1d2027');                    // B필러
    else if (i === 1 && Math.abs(n[0]) > 0.5 && spec.spoiler !== 1) mb.m(1); // 패스트백 쿼터 패널
    else mb.m(4);
  });
  // ----- 헤드램프 (모서리를 감싸는 형태) + 주간주행등
  const [lw, lh, la] = spec.lamp;
  for (const sx of [-1, 1]) {
    mb.m(6); mb.box(sx * hw * 0.61, spec.hl - lh / 2, L * 0.458, lw, lh, 0.17, sx * la);
    mb.c('#1d2027'); mb.box(sx * hw * 0.61, spec.hl - lh / 2 - 0.035, L * 0.455, lw + 0.06, 0.035, 0.18, sx * la);
    mb.m(6); mb.box(sx * hw * 0.7, spec.hl - 0.27, L * 0.468, 0.2, 0.035, 0.1, sx * 0.6); // 하단 포인트 램프
  }
  // ----- 앞 범퍼: 하단 인테이크, 에어 커튼, 스키드 플레이트
  mb.c(DARK); mb.box(0, spec.hl - 0.4, L * 0.487, spec.W * 0.46, 0.15, 0.08);
  for (const sx of [-1, 1]) { mb.c(DARK); mb.box(sx * hw * 0.74, spec.hl - 0.42, L * 0.462, 0.09, 0.2, 0.12, sx * 0.5); }
  if (spec.skid) { mb.c('#c3c8d0'); mb.box(0, spec.hl - 0.5, L * 0.482, spec.W * 0.5, 0.07, 0.1); mb.box(0, spec.tl - 0.56, -L * 0.484, spec.W * 0.5, 0.07, 0.1); }
  // ----- 후면: 라이트 바 + 코너 램프, 디퓨저, 반사판
  mb.m(5); mb.box(0, spec.tl - 0.035, -L * 0.486, spec.W * 0.66, 0.06, 0.1);
  for (const sx of [-1, 1]) { mb.m(5); mb.box(sx * hw * 0.74, spec.tl - 0.05, -L * 0.468, 0.34, 0.1, 0.14, -sx * 0.55);
    mb.c('#b8434c'); mb.box(sx * hw * 0.62, spec.tl - 0.47, -L * 0.489, 0.22, 0.04, 0.06); }
  mb.c(DARK); mb.box(0, spec.tl - 0.52, -L * 0.488, spec.W * 0.62, 0.13, 0.08);
  // ----- 번호판
  mb.m(7); mb.box(0, spec.hl - 0.37, L * 0.5 + 0.012, 0.52, 0.12, 0.04); mb.box(0, spec.tl - 0.3, -L * 0.5 - 0.012, 0.52, 0.12, 0.04);
  // ----- 사이드 미러 (지지대 + 하우징)
  const mz = spec.cabin[spec.cabin.length - 1][0] * L - 0.32;
  for (const sx of [-1, 1]) {
    mb.c('#1d2027'); mb.box(sx * (hw - 0.02), spec.belt - 0.04, mz, 0.16, 0.05, 0.07);
    mb.m(0); mb.box(sx * (hw + 0.1), spec.belt - 0.03, mz - 0.01, 0.19, 0.11, 0.1);
    mb.c('#1d2027'); mb.box(sx * (hw + 0.1), spec.belt - 0.03, mz - 0.065, 0.17, 0.09, 0.02);
  }
  // ----- 루프: 레일, 샤크핀 안테나, 스포일러
  const roofY = spec.H, tail = cab[1];
  if (spec.rails) for (const sx of [-1, 1]) { mb.c('#c3c8d0'); mb.box(sx * hw * 0.64, roofY - 0.035, -L * 0.1, 0.05, 0.045, L * 0.36); }
  mb.m(1); mb.tri([0.03, roofY - 0.03, -L * 0.2], [0.03, roofY - 0.03, -L * 0.2 - 0.26], [0.03, roofY + 0.07, -L * 0.2 - 0.22], [1, 0, 0]);
  mb.tri([-0.03, roofY - 0.03, -L * 0.2], [-0.03, roofY - 0.03, -L * 0.2 - 0.26], [-0.03, roofY + 0.07, -L * 0.2 - 0.22], [-1, 0, 0]);
  mb.quad([0.03, roofY - 0.03, -L * 0.2], [-0.03, roofY - 0.03, -L * 0.2], [-0.03, roofY + 0.07, -L * 0.2 - 0.22], [0.03, roofY + 0.07, -L * 0.2 - 0.22], [0, 1, 1]);
  if (spec.spoiler === 1) { mb.m(1); mb.box(0, tail.y1 - 0.045, tail.z - 0.13, tail.hw * 1.62, 0.05, 0.34); mb.c('#1d2027'); mb.box(0, tail.y1 - 0.075, tail.z - 0.27, tail.hw * 1.3, 0.03, 0.05); }
  if (spec.spoiler === 2) { const d = bodySecs[1]; mb.m(0); mb.box(0, d.y1 - 0.01, d.z + 0.07, d.hw * 1.7, 0.06, 0.16); }
  // ----- 사이드 스커트 (클래딩이 없는 차종), 하부
  if (spec.clad < 0.45) for (const sx of [-1, 1]) { mb.c(TRIM); mb.box(sx * (hw - 0.03), 0.2, 0, 0.08, 0.1, spec.wb - spec.wr * 2 - 0.3); }
  mb.c('#1d2027'); mb.box(0, 0.19, 0, spec.W * 0.8, 0.08, L * 0.8);
  // ----- 휠 아치
  const flare = spec.clad >= 0.45 ? 0.095 : 0.06;
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    mb.c(DARK); mb.push(mul(trans(sx * (hw - 0.3), spec.wr, sz * spec.wb / 2), rotZ(-Math.PI / 2 * sx)));
    mb.cyl(0, 0, 0, spec.wr + flare, spec.wr + flare, 0.275 + (spec.clad >= 0.45 ? 0.012 : 0), 24, true, false); mb.pop();
  }
  return { body: mb.build(), wheels: [0, 1, 2, 3].map(s => buildWheel(spec.wr, s)) };
}

function buildWheel(r: number, style: number): Float32Array {
  const mb = new MB(), w = 0.25;
  mb.push(rotZ(-Math.PI / 2)); // y축 원기둥 → x축
  mb.c('#23262e'); mb.cyl(0, -w / 2 + 0.03, 0, r, r, w - 0.06, 24, false, false);
  mb.cyl(0, w / 2 - 0.03, 0, r, r * 0.9, 0.03, 24, true, false); mb.cyl(0, -w / 2, 0, r * 0.9, r, 0.03, 24, false, true);
  for (const side of [1, -1]) {
    mb.push(side === 1 ? trans(0, 0, 0) : rotZ(Math.PI));
    const y = w / 2 + 0.004;
    mb.c('#30343d'); mb.disc(0, y, 0, 0, r * 0.76, 24); mb.c('#8d939c'); mb.disc(0, y + 0.001, 0, r * 0.3, r * 0.6, 20);
    mb.m(2);
    if (style === 0) for (let i = 0; i < 5; i++) mb.box(Math.cos(i * 1.2566) * r * 0.37, y, Math.sin(i * 1.2566) * r * 0.37, r * 0.72, 0.02, r * 0.17, -i * 1.2566);
    if (style === 1) { mb.disc(0, y + 0.012, 0, 0, r * 0.72, 20); mb.c('#3a3f4a'); for (let i = 0; i < 3; i++) mb.box(Math.cos(i * 2.094) * r * 0.42, y + 0.014, Math.sin(i * 2.094) * r * 0.42, r * 0.3, 0.004, r * 0.09, -i * 2.094); mb.m(2); }
    if (style === 2) for (let i = 0; i < 10; i++) mb.box(Math.cos(i * 0.6283) * r * 0.37, y, Math.sin(i * 0.6283) * r * 0.37, r * 0.72, 0.02, r * 0.07, -i * 0.6283);
    if (style === 3) for (let i = 0; i < 6; i++) mb.cyl(Math.cos(i * 1.047) * r * 0.42, y, Math.sin(i * 1.047) * r * 0.42, r * 0.24, r * 0.2, 0.02, 10);
    mb.cyl(0, y, 0, r * 0.2, r * 0.16, 0.035, 12);
    mb.disc(0, y + 0.002, 0, r * 0.7, r * 0.78, 20);
    mb.pop();
  }
  mb.pop();
  return mb.build();
}
