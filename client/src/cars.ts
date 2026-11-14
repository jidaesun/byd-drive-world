// 차량 4종: 공개된 제원(전장/전폭/전고/축거) 비율을 참고해 직접 만든 독자적 로우폴리 모델.
// 제조사 로고·공식 3D 에셋은 사용하지 않는다.
import { MB, hex } from './geom';
import { V3, norm, cross, sub, trans, rotZ, mul } from './math';

type Sec = [number, number, number, number]; // z(전장 비율), 반폭 비율, y 하단, y 상단
export interface CarSpec {
  id: string; name: string; kind: string; L: number; W: number; H: number; wb: number; wr: number;
  belt: number; clad: number; hl: number; tl: number; color: string; body: Sec[]; cabin: Sec[];
}
export interface Look {
  body: string; roof: string; twoTone: boolean; rim: string; wheel: number;
  decal: number; decalCol: string; plate: number;
}

export const CARS: CarSpec[] = [
  { id: 'dolphin', name: 'DOLPHIN', kind: '해치백', L: 4.29, W: 1.77, H: 1.57, wb: 2.70, wr: 0.35, belt: .98, clad: 0.34, hl: 0.79, tl: 0.95, color: '#f4f4f0',
    body: [[-.5, .74, .48, .88], [-.485, .93, .34, 1.0], [-.43, 1, .26, 1.03], [-.15, 1, .23, 1.02], [.15, 1, .23, 1.0], [.33, 1, .25, .96], [.43, .96, .27, .88], [.485, .88, .33, .80], [.5, .70, .42, .70]],
    cabin: [[-.47, .80, .9, .97], [-.425, .86, .9, 1.50], [-.25, .88, .9, 1.56], [0, .88, .9, 1.57], [.14, .86, .9, 1.50], [.31, .80, .9, .97]] },
  { id: 'atto3', name: 'ATTO 3', kind: '컴팩트 SUV', L: 4.455, W: 1.875, H: 1.615, wb: 2.72, wr: 0.37, belt: 1.0, clad: 0.5, hl: 0.80, tl: 0.93, color: '#9aa0a8',
    body: [[-.5, .72, .50, .86], [-.485, .92, .36, .99], [-.42, 1, .27, 1.04], [-.15, 1, .24, 1.03], [.12, 1, .24, 1.01], [.30, 1, .26, .98], [.41, .97, .28, .91], [.48, .88, .34, .82], [.5, .68, .44, .72]],
    cabin: [[-.455, .80, .9, .98], [-.40, .86, .9, 1.52], [-.22, .88, .9, 1.60], [0, .88, .9, 1.615], [.10, .86, .9, 1.57], [.27, .80, .9, .99]] },
  { id: 'seal', name: 'SEAL', kind: '스포츠 세단', L: 4.80, W: 1.875, H: 1.46, wb: 2.92, wr: 0.36, belt: .92, clad: 0.3, hl: 0.68, tl: 0.85, color: '#2b2f38',
    body: [[-.5, .70, .46, .80], [-.485, .90, .34, .90], [-.42, 1, .25, .93], [-.15, 1, .22, .93], [.12, 1, .22, .92], [.28, 1, .23, .86], [.40, .96, .25, .76], [.48, .86, .30, .68], [.5, .66, .40, .60]],
    cabin: [[-.40, .78, .82, .90], [-.27, .84, .82, 1.30], [-.10, .86, .82, 1.44], [.02, .86, .82, 1.46], [.10, .84, .82, 1.40], [.24, .78, .82, .90]] },
  { id: 'sealion7', name: 'SEALION 7', kind: '쿠페형 SUV', L: 4.83, W: 1.925, H: 1.62, wb: 2.93, wr: 0.39, belt: 1.03, clad: 0.5, hl: 0.83, tl: 1.0, color: '#f4f4f0',
    body: [[-.5, .72, .52, .92], [-.485, .92, .38, 1.03], [-.42, 1, .28, 1.07], [-.15, 1, .25, 1.06], [.12, 1, .25, 1.04], [.29, 1, .27, 1.0], [.41, .97, .29, .92], [.48, .88, .35, .82], [.5, .68, .45, .72]],
    cabin: [[-.44, .78, .93, 1.05], [-.30, .84, .93, 1.42], [-.12, .87, .93, 1.60], [.02, .87, .93, 1.62], [.11, .85, .93, 1.56], [.27, .79, .93, 1.0]] },
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

function loft(mb: MB, secs: { z: number; hw: number; y0: number; y1: number }[], n: number, taper: number, K: number, matFn: (ny: number, y: number) => void) {
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
    matFn((N[i][k][1] + N[i + 1][k][1] + N[i + 1][k1][1] + N[i][k1][1]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4);
    mb.triN(a, N[i][k], b, N[i + 1][k], c, N[i + 1][k1]); mb.triN(a, N[i][k], c, N[i + 1][k1], d, N[i][k1]);
  }
  // 양 끝 캡
  for (const [i, nz] of [[0, -1], [P.length - 1, 1]] as [number, number][]) {
    const s = secs[i], ctr: V3 = [0, (s.y0 + s.y1) / 2, s.z], nn: V3 = [0, 0, nz];
    matFn(0, ctr[1]);
    for (let k = 0; k < K; k++) mb.triN(ctr, nn, P[i][k], nn, P[i][(k + 1) % K], nn);
  }
}

export interface CarMeshData { body: Float32Array; wheels: Float32Array[]; }

export function buildCar(spec: CarSpec): CarMeshData {
  const mb = new MB(), hw = spec.W / 2, L = spec.L;
  const bodySecs = spec.body.map(s => ({ z: s[0] * L, hw: s[1] * hw, y0: s[2], y1: s[3] }));
  loft(mb, bodySecs, 4.2, 0.07, 28, (_ny, y) => { if (y < spec.clad) mb.c('#3c4250'); else mb.m(0); });
  const cabSecs = spec.cabin.map(s => ({ z: s[0] * L, hw: s[1] * hw, y0: s[2], y1: s[3] }));
  loft(mb, cabSecs, 3.4, 0.2, 24, (ny) => { mb.m(ny > 0.62 ? 1 : 4); });
  // 헤드램프 / 테일램프 바
  for (const sx of [-1, 1]) { mb.m(6); mb.box(sx * hw * 0.6, spec.hl - 0.05, L * 0.47, 0.42, 0.1, 0.2); }
  mb.m(5); mb.box(0, spec.tl - 0.04, -L * 0.487, spec.W * 0.8, 0.075, 0.1);
  mb.c('#2b2f38'); mb.box(0, spec.hl - 0.3, L * 0.492, spec.W * 0.5, 0.14, 0.06); // 하단 인테이크
  // 번호판
  mb.m(7); mb.box(0, 0.47, L * 0.5 + 0.005, 0.52, 0.12, 0.04); mb.box(0, spec.tl - 0.3, -L * 0.5 - 0.01, 0.52, 0.12, 0.04);
  // 사이드 미러
  const mz = spec.cabin[spec.cabin.length - 1][0] * L - 0.25;
  for (const sx of [-1, 1]) { mb.m(0); mb.box(sx * (hw + 0.07), spec.belt - 0.02, mz, 0.2, 0.11, 0.12); }
  // 휠 아치
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    mb.c('#2a2e38'); mb.push(mul(trans(sx * (hw - 0.3), spec.wr, sz * spec.wb / 2), rotZ(-Math.PI / 2 * sx)));
    mb.cyl(0, 0, 0, spec.wr + 0.075, spec.wr + 0.075, 0.275, 20, true, false); mb.pop();
  }
  return { body: mb.build(), wheels: [0, 1, 2, 3].map(s => buildWheel(spec.wr, s)) };
}

function buildWheel(r: number, style: number): Float32Array {
  const mb = new MB(), w = 0.25;
  mb.push(rotZ(-Math.PI / 2)); // y축 원기둥 → x축
  mb.c('#23262e'); mb.cyl(0, -w / 2, 0, r, r, w, 20, true, true);
  for (const side of [1, -1]) {
    mb.push(side === 1 ? trans(0, 0, 0) : rotZ(Math.PI));
    const y = w / 2 + 0.004;
    mb.c('#3a3f4a'); mb.disc(0, y, 0, 0, r * 0.74, 20);
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
