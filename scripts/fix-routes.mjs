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

// 0. 修复 Windows 下的路径分隔符污染
cfg.exclude = cfg.exclude.map(r => r.replace(/\\/g, '/'));

const before = cfg.exclude.length;

// 1. 压缩 /ludo/ 下的冗余静态规则，避免超出 100 条上限
const ludoRules = cfg.exclude.filter(r => r === '/ludo' || r.startsWith('/ludo/'));
if (ludoRules.length > 0) {
  // 移除所有 ludo 相关的具体规则
  cfg.exclude = cfg.exclude.filter(r => r !== '/ludo' && !r.startsWith('/ludo/'));
  // 合并为一条通配符规则
  cfg.exclude.push('/ludo/*');
}

// 2. 只给目录型路由补斜杠；带扩展名的是文件，不能加
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

console.log(`[fix-routes] exclude ${before} → ${cfg.exclude.length} 条 (ludo合并了 ${ludoRules.length} 条)`);
