import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Astro cloudflare adapter 生成的 _routes.json 里，静态路由写作 "/arcade"，
// 但浏览器访问 "/arcade/"（带斜杠）不匹配，会落到 Worker 多走一趟 SSR。
// 构建后统一补上带斜杠的版本。

const P = 'dist/_routes.json';
if (!existsSync(P)) {
  console.warn('[fix-routes] 未找到 dist/_routes.json，跳过');
  process.exit(0);
}

const cfg = JSON.parse(readFileSync(P, 'utf8'));
const before = cfg.exclude.length;

// 只给目录型路由补斜杠；带扩展名的是文件，不能加
const extra = [];
for (const r of cfg.exclude) {
  if (r === '/') continue;
  if (r.endsWith('/*')) continue;
  if (r.endsWith('/')) continue;
  const last = r.split('/').pop() || '';
  if (last.includes('.')) continue;   // /favicon.svg、/layout.js
  extra.push(r + '/');
}

cfg.exclude = [...new Set([...cfg.exclude, ...extra])];
writeFileSync(P, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

console.log(`[fix-routes] exclude ${before} → ${cfg.exclude.length} 条`);
