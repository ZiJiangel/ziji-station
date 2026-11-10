import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

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
    console.log('[prebuild] ESBUILD_BINARY_PATH =', abs);
    break;
  }
}

execSync('astro build', { stdio: 'inherit', env: process.env });
