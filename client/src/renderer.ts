// 의존성 없는 WebGL2 렌더러: 그림자 맵, 하늘/구름, 바다, 파티클, 차량 페인트 셰이더
import { M4, V3, mul, persp, ortho, lookAt, norm, cross, sub, ident } from './math';

export interface Env {
  sun: V3; sunCol: V3; skyAmb: V3; gndAmb: V3;
  zen: V3; hor: V3; cloud: V3; glow: V3; night: number;
}
export interface Mesh { vao: WebGLVertexArrayObject; count: number; }
export interface DrawItem {
  mesh: Mesh; m: M4;
  pal?: Float32Array;   // 8 x rgb
  fx?: Float32Array;    // dirt, foam, gloss, decalType
  dc?: Float32Array;    // decal params (belt height, ...)
}
export interface Frame {
  eye: V3; target: V3; fov: number; env: Env; time: number;
  items: DrawItem[]; particles: Float32Array; pCount: number; focus: V3;
}

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol; layout(location=3) in float aMat;
uniform mat4 uVP, uM, uLVP;
out vec3 vW, vN, vCol, vL; out float vMat; out vec4 vSh;
void main(){
  vec4 w = uM*vec4(aPos,1.); vW = w.xyz; vN = mat3(uM)*aNrm; vCol = aCol; vL = aPos; vMat = aMat;
  vSh = uLVP*vec4(w.xyz + normalize(vN)*0.12, 1.);
  gl_Position = uVP*w;
}`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN, vCol, vL; in float vMat; in vec4 vSh;
uniform vec3 uPal[8]; uniform vec4 uFx, uDc;
uniform vec3 uSun, uSunCol, uSkyAmb, uGndAmb, uFog, uEye;
uniform float uNight, uFogK, uTime, uShOn;
uniform sampler2DShadow uShadow;
out vec4 o;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float shadow(){
  if(uShOn<.5) return 1.;
  vec3 p = vSh.xyz/vSh.w*.5+.5;
  if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.) return 1.;
  float t = 1./2048., z = p.z-.0012, s = 0.;
  s += texture(uShadow, vec3(p.xy+vec2(-t,-t)*.7, z)); s += texture(uShadow, vec3(p.xy+vec2(t,-t)*.7, z));
  s += texture(uShadow, vec3(p.xy+vec2(-t,t)*.7, z));  s += texture(uShadow, vec3(p.xy+vec2(t,t)*.7, z));
  float edge = 1.-smoothstep(.42,.5,max(abs(p.x-.5),abs(p.y-.5)));
  return mix(1., s*.25, edge);
}
void main(){
  vec3 N = normalize(vN); vec3 base = vCol; float spec = 0., emis = 0., shin = 60.;
  if(vMat > -.5){
    int m = int(vMat+.5); base = uPal[m];
    int dt = int(uFx.w+.5);
    if(m==0){
      spec = .32+uFx.z*.6;
      if(dt==1 && N.y>.3 && abs(abs(vL.x)-.17)<.075) base = uPal[3];
      if(dt==2 && abs(N.x)>.45 && abs(vL.y-uDc.x+.14)<.05) base = uPal[3];
      if(dt==3 && abs(N.x)>.3 && vL.y < uDc.x-.3+.09*sin(vL.z*3.2)) base = uPal[3];
      if(dt==4 && abs(N.x)>.45 && length(fract(vec2(vL.z,vL.y)*2.4)-.5)<.2) base = uPal[3];
      if(dt==5 && N.y>.3 && abs(vL.x)<.24) base = uPal[3];
      // 도어 분할선과 로커 라인 (uDc: 벨트 높이, 분할선 z 3개)
      if(uDc.x>0. && abs(N.x)>.55 && vL.y>.34 && vL.y<uDc.x-.03){
        float dl = min(min(abs(vL.z-uDc.y),abs(vL.z-uDc.z)),abs(vL.z-uDc.w));
        if(dl<.012 || abs(vL.y-.44)<.008) base *= .6;
      }
    }
    if(m==1){ spec = .32+uFx.z*.6; if(dt==1 && N.y>.3 && abs(abs(vL.x)-.17)<.075) base = uPal[3]; if(dt==5 && N.y>.3 && abs(vL.x)<.24) base = uPal[3]; }
    if(m==2){ spec = .5; shin = 30.; }
    if(m==4){ spec = .9; shin = 120.; }
    if(m==5||m==6) emis = 1.;
    if(m<=1 || m==4){
      float dn = hash(floor(vL*vec3(9.,14.,14.)));
      float df = uFx.x*(1.-smoothstep(.25,1.35,vL.y))*(.55+.45*dn);
      base = mix(base, vec3(.47,.39,.3), clamp(df,0.,.8)); spec *= 1.-uFx.x*.8;
      if(uFx.y>.001){ float fn = noise(vL*5.5+vec3(0.,uTime*.35,0.))*.85+.15;
        float fm = smoothstep(1.-uFx.y, 1.25-uFx.y, fn); base = mix(base, vec3(1.), fm); spec *= 1.-fm; }
    }
  } else if(vMat < -1.5){ emis = uNight; }
  vec3 bl = pow(base, vec3(2.2));
  float ndl = max(dot(N,uSun),0.); float sh = ndl>0. ? shadow() : 0.;
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y*.5+.5);
  vec3 c = bl*(amb + uSunCol*ndl*sh);
  vec3 V = normalize(uEye-vW);
  if(spec>0.){ vec3 H = normalize(V+uSun);
    c += uSunCol*pow(max(dot(N,H),0.),shin)*spec*sh*1.4;
    c += uSkyAmb*pow(1.-max(dot(N,V),0.),3.)*spec*.7; }
  c += bl*emis*1.7;
  c = c/(1.+c*.32)*1.16;
  c = pow(c, vec3(1./2.2));
  float d = length(uEye-vW); float f = 1.-exp(-d*d*uFogK);
  o = vec4(mix(c, uFog, f), 1.);
}`;
const VS_SH = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP, uM;
void main(){ gl_Position = uLVP*uM*vec4(aPos,1.); }`;
const FS_SH = `#version 300 es
precision mediump float; void main(){}`;
const VS_SKY = `#version 300 es
out vec2 vP; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2))*2.-1.; vP = p; gl_Position = vec4(p,.9999,1.); }`;
const FS_SKY = `#version 300 es
precision highp float; in vec2 vP;
uniform vec3 uF,uR,uU,uZen,uHor,uSun,uGlow,uCloud; uniform vec2 uTan; uniform float uNight,uTime;
out vec4 o;
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*n2(p); p*=2.03; a*=.5; } return s; }
void main(){
  vec3 d = normalize(uF + uR*vP.x*uTan.x + uU*vP.y*uTan.y);
  float h = max(d.y,0.);
  vec3 c = mix(uHor, uZen, pow(h,.55));
  float sd = max(dot(d,uSun),0.);
  c += uGlow*(pow(sd,900.)*4. + pow(sd,12.)*.3 + pow(sd,3.)*.08);
  if(d.y>.01){
    vec2 q = d.xz/(d.y+.12)*.9 + vec2(uTime*.006, uTime*.002);
    float cl = smoothstep(.5,.72,fbm(q))*smoothstep(.01,.22,d.y);
    c = mix(c, uCloud, cl*.9);
    if(uNight>.3){ vec2 g = d.xz/(d.y+.4)*70.; float s = h2(floor(g)); c += step(.988,s)*(uNight-.3)*1.2*(1.-cl)*smoothstep(0.,.3,d.y)*(.6+.4*sin(uTime*2.+s*90.)); }
  }
  o = vec4(c,1.);
}`;
const VS_W = `#version 300 es
layout(location=0) in vec2 aP; uniform mat4 uVP; uniform vec3 uEye; out vec3 vW;
void main(){ vW = vec3(aP.x*2600.+uEye.x*0., -.55, aP.y*2600.); gl_Position = uVP*vec4(vW,1.); }`;
const FS_W = `#version 300 es
precision highp float; in vec3 vW;
uniform vec3 uEye,uSun,uSunCol,uSkyAmb,uFog,uIsl; uniform float uTime,uFogK,uNight;
out vec4 o;
void main(){
  float e = sqrt(vW.x*vW.x/(uIsl.x*uIsl.x) + vW.z*vW.z/(uIsl.y*uIsl.y));
  float depth = (e-1.)*uIsl.z - 5.5;
  float t = uTime;
  float w = sin(vW.x*.16+t*.9)+sin(vW.z*.22-t*.7)+sin((vW.x+vW.z)*.09+t*.45)+sin((vW.x-vW.z)*.31+t*1.3)*.5;
  vec3 N = normalize(vec3(cos(vW.x*.16+t*.9)*.05+cos((vW.x-vW.z)*.31+t*1.3)*.04, 1., cos(vW.z*.22-t*.7)*.05));
  vec3 shallow = vec3(.42,.86,.84), deep = vec3(.16,.50,.78);
  vec3 c = mix(shallow, deep, smoothstep(0.,70.,depth));
  c *= mix(vec3(1.), uSkyAmb*1.5+uSunCol*.35, .75);
  c += .025*w;
  vec3 V = normalize(uEye-vW); vec3 H = normalize(V+uSun);
  c += uSunCol*pow(max(dot(N,H),0.),180.)*1.2;
  c = mix(c, uFog, pow(1.-max(V.y,0.),5.)*.6);
  float ph = sin(t*.6+vW.x*.03+vW.z*.03);
  float foam = 1.-smoothstep(0.,1.3,abs(depth-.6-ph*.9)) + .5*(1.-smoothstep(0.,.9,abs(depth-4.5-ph*1.4)));
  c = mix(c, vec3(1.)*(1.-uNight*.5), clamp(foam,0.,1.)*.85);
  float a = mix(.5,.96,smoothstep(-.5,10.,depth));
  float d = length(uEye-vW); float f = 1.-exp(-d*d*uFogK);
  o = vec4(mix(c,uFog,f), a);
}`;
const VS_P = `#version 300 es
layout(location=0) in vec4 aP; layout(location=1) in vec4 aC; uniform mat4 uVP; uniform float uH; out vec4 vC;
void main(){ gl_Position = uVP*vec4(aP.xyz,1.); gl_PointSize = aP.w*uH/gl_Position.w; vC = aC; }`;
const FS_P = `#version 300 es
precision mediump float; in vec4 vC; out vec4 o;
void main(){ float d = length(gl_PointCoord-.5)*2.; float a = 1.-smoothstep(.55,1.,d); o = vec4(vC.rgb, vC.a*a); }`;

export class Renderer {
  gl: WebGL2RenderingContext;
  quality = 1; shadows = true;
  vp: M4 = ident();
  private prog: Record<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }> = {};
  private shFbo: WebGLFramebuffer; private shTex: WebGLTexture;
  private waterVao: WebGLVertexArrayObject; private pVao: WebGLVertexArrayObject; private pBuf: WebGLBuffer;
  private defPal = new Float32Array(24); private zero4 = new Float32Array(4);
  island: V3 = [190, 150, 170];

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 미지원');
    this.gl = gl;
    this.mk('main', VS, FS); this.mk('sh', VS_SH, FS_SH); this.mk('sky', VS_SKY, FS_SKY); this.mk('water', VS_W, FS_W); this.mk('pt', VS_P, FS_P);
    // shadow map
    this.shTex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 2048, 2048);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shFbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // water quad
    this.waterVao = gl.createVertexArray()!; gl.bindVertexArray(this.waterVao);
    const wb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, wb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // particles
    this.pVao = gl.createVertexArray()!; gl.bindVertexArray(this.pVao);
    this.pBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 2000 * 32, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    this.resize();
  }
  private mk(name: string, vs: string, fs: string) {
    const gl = this.gl;
    const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
    const u: Record<string, WebGLUniformLocation | null> = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i)!; const nm = info.name.replace('[0]', ''); u[nm] = gl.getUniformLocation(p, info.name); }
    this.prog[name] = { p, u };
  }
  mesh(data: Float32Array): Mesh {
    const gl = this.gl, vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const S = 40; let off = 0;
    [3, 3, 3, 1].forEach((n, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, S, off); off += n * 4; });
    gl.bindVertexArray(null);
    return { vao, count: data.length / 10 };
  }
  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  render(f: Frame) {
    const gl = this.gl; this.resize();
    const W = this.canvas.width, H = this.canvas.height, e = f.env;
    const view = lookAt(f.eye, f.target, [0, 1, 0]);
    const proj = persp(f.fov, W / H, 0.4, 1800);
    const vp = mul(proj, view); this.vp = vp;
    const fog: V3 = e.hor, fogK = 0.0000042;

    // --- shadow pass
    const R = 60, sd = e.sun;
    const lv = lookAt([f.focus[0] + sd[0] * 150, f.focus[1] + sd[1] * 150, f.focus[2] + sd[2] * 150], f.focus, [0, 1, 0]);
    // 텍셀 스냅으로 그림자 떨림 방지
    const tex = (2 * R) / 2048; lv[12] = Math.round(lv[12] / tex) * tex; lv[13] = Math.round(lv[13] / tex) * tex;
    const lvp = mul(ortho(-R, R, -R, R, 1, 400), lv);
    const shOn = this.shadows && sd[1] > 0.08;
    if (shOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo); gl.viewport(0, 0, 2048, 2048);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      const s = this.prog.sh; gl.useProgram(s.p); gl.uniformMatrix4fv(s.u.uLVP, false, lvp);
      for (const it of f.items) { gl.uniformMatrix4fv(s.u.uM, false, it.m); gl.bindVertexArray(it.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.count); }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- sky
    const fw = norm(sub(f.target, f.eye)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
    const ty = Math.tan(f.fov / 2);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const k = this.prog.sky; gl.useProgram(k.p);
    gl.uniform3fv(k.u.uF, fw); gl.uniform3fv(k.u.uR, rt); gl.uniform3fv(k.u.uU, up); gl.uniform2f(k.u.uTan, ty * W / H, ty);
    gl.uniform3fv(k.u.uZen, e.zen); gl.uniform3fv(k.u.uHor, e.hor); gl.uniform3fv(k.u.uSun, e.sun); gl.uniform3fv(k.u.uGlow, e.glow); gl.uniform3fv(k.u.uCloud, e.cloud);
    gl.uniform1f(k.u.uNight, e.night); gl.uniform1f(k.u.uTime, f.time);
    gl.bindVertexArray(this.waterVao); gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- opaque
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    const m = this.prog.main; gl.useProgram(m.p);
    gl.uniformMatrix4fv(m.u.uVP, false, vp); gl.uniformMatrix4fv(m.u.uLVP, false, lvp);
    gl.uniform3fv(m.u.uSun, e.sun); gl.uniform3fv(m.u.uSunCol, e.sunCol); gl.uniform3fv(m.u.uSkyAmb, e.skyAmb); gl.uniform3fv(m.u.uGndAmb, e.gndAmb);
    gl.uniform3fv(m.u.uFog, fog); gl.uniform3fv(m.u.uEye, f.eye); gl.uniform1f(m.u.uNight, e.night); gl.uniform1f(m.u.uFogK, fogK);
    gl.uniform1f(m.u.uTime, f.time); gl.uniform1f(m.u.uShOn, shOn ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(m.u.uShadow, 0);
    for (const it of f.items) {
      gl.uniformMatrix4fv(m.u.uM, false, it.m);
      gl.uniform3fv(m.u.uPal, it.pal ?? this.defPal);
      gl.uniform4fv(m.u.uFx, it.fx ?? this.zero4); gl.uniform4fv(m.u.uDc, it.dc ?? this.zero4);
      gl.bindVertexArray(it.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, it.mesh.count);
    }

    // --- water
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    const w = this.prog.water; gl.useProgram(w.p);
    gl.uniformMatrix4fv(w.u.uVP, false, vp); gl.uniform3fv(w.u.uEye, f.eye); gl.uniform3fv(w.u.uSun, e.sun); gl.uniform3fv(w.u.uSunCol, e.sunCol);
    gl.uniform3fv(w.u.uSkyAmb, e.skyAmb); gl.uniform3fv(w.u.uFog, fog); gl.uniform3fv(w.u.uIsl, this.island);
    gl.uniform1f(w.u.uTime, f.time); gl.uniform1f(w.u.uFogK, fogK); gl.uniform1f(w.u.uNight, e.night);
    gl.bindVertexArray(this.waterVao); gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- particles
    if (f.pCount > 0) {
      const p = this.prog.pt; gl.useProgram(p.p);
      gl.uniformMatrix4fv(p.u.uVP, false, vp); gl.uniform1f(p.u.uH, H / (2 * ty));
      gl.bindVertexArray(this.pVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.particles, 0, f.pCount * 8);
      gl.drawArrays(gl.POINTS, 0, f.pCount);
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }
  /** 월드 좌표 → 화면 CSS 픽셀. 카메라 뒤면 null */
  project(p: V3): [number, number, number] | null {
    const m = this.vp, w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.1) return null;
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    return [(x * 0.5 + 0.5) * this.canvas.clientWidth, (1 - (y * 0.5 + 0.5)) * this.canvas.clientHeight, w];
  }
}
