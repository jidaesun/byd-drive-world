// 클라이언트 번들 빌드: dist/ (서버 배포용) + dist/standalone.html (단일 파일, 오프라인 체험용)
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: ['client/src/main.ts'], bundle: true, minify: !watch, sourcemap: watch,
  target: 'es2020', format: 'iife', outfile: 'dist/app.js', logLevel: 'info',
};
function copyStatic() {
  mkdirSync('dist', { recursive: true });
  const html = readFileSync('client/index.html', 'utf8');
  const css = readFileSync('client/style.css', 'utf8');
  writeFileSync('dist/index.html', html);
  writeFileSync('dist/style.css', css);
  const js = readFileSync('dist/app.js', 'utf8');
  const single = html
    .replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
    .replace('<script src="app.js"></script>', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`);
  writeFileSync('dist/standalone.html', single);
}
if (watch) {
  const ctx = await context({ ...opts, plugins: [{ name: 'copy', setup(b) { b.onEnd(() => { try { copyStatic(); } catch (e) { console.error(e); } }); } }] });
  await ctx.watch();
} else {
  await build(opts);
  copyStatic();
}
