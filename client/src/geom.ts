// 절차적 메시 빌더. 정점 포맷: pos3, normal3, color3, material1 (10 floats)
// material: -1 = 정점 색상, -2 = 밤에 빛나는 정점 색상, 0..7 = 차량 팔레트 슬롯
import { M4, V3, mul, tp, td, norm, cross, sub, trans, rotY } from './math';

export type RGB = [number, number, number];
export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export class MB {
  d: number[] = [];
  col: RGB = [1, 1, 1];
  mat = -1;
  xf: M4 | null = null;
  private stack: (M4 | null)[] = [];
  push(m: M4) { this.stack.push(this.xf); this.xf = this.xf ? mul(this.xf, m) : m; return this; }
  pop() { this.xf = this.stack.pop() ?? null; return this; }
  c(h: string) { this.col = hex(h); this.mat = -1; return this; }
  glow(h: string) { this.col = hex(h); this.mat = -2; return this; }
  m(i: number) { this.mat = i; return this; }
  v(p: V3, n: V3) {
    if (this.xf) { p = tp(this.xf, p); n = norm(td(this.xf, n)); }
    this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], this.col[0], this.col[1], this.col[2], this.mat);
  }
  triN(a: V3, na: V3, b: V3, nb: V3, c: V3, nc: V3) { this.v(a, na); this.v(b, nb); this.v(c, nc); }
  /** 평면 삼각형. hint 방향을 향하도록 법선을 자동 정렬 */
  tri(a: V3, b: V3, c: V3, hint?: V3) {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
    this.v(a, n); this.v(b, n); this.v(c, n);
  }
  quad(a: V3, b: V3, c: V3, d: V3, hint?: V3) { this.tri(a, b, c, hint); this.tri(a, c, d, hint); }
  /** 위를 향하는 수평 사각형 */
  flat(x0: number, z0: number, x1: number, z1: number, y: number) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0]);
  }
  /** 박스: (x,z) 중심, y는 바닥 높이 */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
    if (ry) this.push(mul(trans(x, 0, z), rotY(ry))), x = 0, z = 0;
    const a = x - sx / 2, b = x + sx / 2, c = y, d = y + sy, e = z - sz / 2, f = z + sz / 2;
    this.quad([a, d, e], [a, d, f], [b, d, f], [b, d, e], [0, 1, 0]);
    this.quad([a, c, e], [a, c, f], [b, c, f], [b, c, e], [0, -1, 0]);
    this.quad([a, c, f], [b, c, f], [b, d, f], [a, d, f], [0, 0, 1]);
    this.quad([a, c, e], [b, c, e], [b, d, e], [a, d, e], [0, 0, -1]);
    this.quad([b, c, e], [b, c, f], [b, d, f], [b, d, e], [1, 0, 0]);
    this.quad([a, c, e], [a, c, f], [a, d, f], [a, d, e], [-1, 0, 0]);
    if (ry) this.pop();
  }
  /** 원기둥/원뿔: y축 방향, 바닥 (x,y,z) */
  cyl(x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 10, capTop = true, capBot = false) {
    const sl = (r0 - r1) / h;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = norm([c0, sl, s0]), n1 = norm([c1, sl, s1]);
      const p0: V3 = [x + c0 * r0, y, z + s0 * r0], p1: V3 = [x + c1 * r0, y, z + s1 * r0];
      const q0: V3 = [x + c0 * r1, y + h, z + s0 * r1], q1: V3 = [x + c1 * r1, y + h, z + s1 * r1];
      this.triN(p0, n0, p1, n1, q1, n1);
      if (r1 > 0) this.triN(p0, n0, q1, n1, q0, n0);
      if (capTop && r1 > 0) this.triN([x, y + h, z], [0, 1, 0], q0, [0, 1, 0], q1, [0, 1, 0]);
      if (capBot) this.triN([x, y, z], [0, -1, 0], p0, [0, -1, 0], p1, [0, -1, 0]);
    }
  }
  /** 타원체 블롭. flat=true면 로우폴리 면 셰이딩 */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, seg = 8, rings = 5, flat = false) {
    const P = (i: number, j: number): [V3, V3] => {
      const th = j / rings * Math.PI - Math.PI / 2, ph = i / seg * Math.PI * 2;
      const n: V3 = [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)];
      return [[x + n[0] * rx, y + n[1] * ry, z + n[2] * rz], n];
    };
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const [a, na] = P(i, j), [b, nb] = P(i + 1, j), [c, nc] = P(i + 1, j + 1), [d, nd] = P(i, j + 1);
      if (flat) {
        const h: V3 = [(na[0] + nc[0]) / 2, (na[1] + nc[1]) / 2, (na[2] + nc[2]) / 2];
        if (j > 0) this.tri(a, b, c, h);
        if (j < rings - 1) this.tri(a, c, d, h);
      } else {
        if (j > 0) this.triN(a, na, b, nb, c, nc);
        if (j < rings - 1) this.triN(a, na, c, nc, d, nd);
      }
    }
  }
  /** 수평 원판/링 (위를 향함) */
  disc(x: number, y: number, z: number, r0: number, r1: number, seg = 32, a0 = 0, a1 = Math.PI * 2, sx = 1, sz = 1) {
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
      const c0 = Math.cos(t0) * sx, s0 = Math.sin(t0) * sz, c1 = Math.cos(t1) * sx, s1 = Math.sin(t1) * sz;
      if (r0 <= 0) this.tri([x, y, z], [x + c0 * r1, y, z + s0 * r1], [x + c1 * r1, y, z + s1 * r1], [0, 1, 0]);
      else this.quad([x + c0 * r0, y, z + s0 * r0], [x + c0 * r1, y, z + s0 * r1], [x + c1 * r1, y, z + s1 * r1], [x + c1 * r0, y, z + s1 * r0], [0, 1, 0]);
    }
  }
  build() { return new Float32Array(this.d); }
}
