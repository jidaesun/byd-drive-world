// 클라이언트 번들 빌드: dist/ (서버 배포용) + dist/standalone.html (단일 파일, 오프라인 체험용)
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const watch = process.argv.includes('--watch');
// 화면에 표시할 빌드 버전: 날짜 + 커밋 (배포된 버전이 최신인지 확인하는 용도)
let commit = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7);
if (!commit) try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; }
const VERSION = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' KST · ' + commit;
const opts = {
  entryPoints: ['client/src/main.ts'], bundle: true, minify: !watch, sourcemap: watch,
  target: 'es2020', format: 'iife', outfile: 'dist/app.js', logLevel: 'info', define: { __BUILD__: JSON.stringify(VERSION) },
};
function copyStatic() {
  mkdirSync('dist', { recursive: true });
  const html = readFileSync('client/index.html', 'utf8');
  const css = readFileSync('client/style.css', 'utf8');
  writeFileSync('dist/index.html', html);
  writeFileSync('dist/style.css', css);
  writeFileSync('dist/version.txt', VERSION);
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
