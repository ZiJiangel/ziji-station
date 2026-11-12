import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// 规避编辑器（如 Cuckoo Code）注入的 ESBUILD_BINARY_PATH 指向不兼容版本
const candidates = [
  'node_modules/.pnpm/@esbuild+win32-x64@0.21.5/node_modules/@esbuild/win32-x64/esbuild.exe',
  'node_modules/.pnpm/@esbuild+linux-x64@0.21.5/node_modules/@esbuild/linux-x64/bin/esbuild',
  'node_modules/.pnpm/@esbuild+darwin-arm64@0.21.5/node_modules/@esbuild/darwin-arm64/bin/esbuild',
  'node_modules/.pnpm/@esbuild+darwin-x64@0.21.5/node_modules/@esbuild/darwin-x64/bin/esbuild',
];

for (const rel of candidates) {
  const abs = resolve(process.cwd(), rel);
  if (existsSync(abs)) {
    process.env.ESBUILD_BINARY_PATH = abs;
    break;
  }
}

const sub = process.argv[2] || 'build';
// 用 pnpm exec 而非裸 astro：确保解析到 node_modules/.bin，不依赖全局安装
execSync('pnpm exec astro ' + sub, { stdio: 'inherit', env: process.env });
