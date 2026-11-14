// 최소 4x4 행렬 유틸 (column-major)
export type M4 = Float32Array;
export type V3 = [number, number, number];

export const ident = (): M4 => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
export function mul(a: M4, b: M4, out: M4 = new Float32Array(16)): M4 {
  const t = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    t[c * 4 + r] = s;
  }
  out.set(t); return out;
}
export function persp(fovy: number, aspect: number, n: number, f: number): M4 {
  const m = new Float32Array(16), t = 1 / Math.tan(fovy / 2);
  m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
}
export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): M4 {
  const m = ident();
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m;
}
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function norm(a: V3): V3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export function lookAt(eye: V3, at: V3, up: V3): M4 {
  const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
  const m = ident();
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
  m[12] = -dot(x, eye); m[13] = -dot(y, eye); m[14] = -dot(z, eye); return m;
}
export function trans(x: number, y: number, z: number): M4 { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
export function scale(x: number, y: number, z: number): M4 { const m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
export function rotX(a: number): M4 { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
export function rotY(a: number): M4 { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
export function rotZ(a: number): M4 { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
export function tp(m: M4, p: V3): V3 {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
export function td(m: M4, p: V3): V3 {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function angLerp(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
