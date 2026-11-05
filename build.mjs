// src/index.html 의 <link>/<script src> 를 인라인해 설치 없이 여는 단일 HTML 을 만든다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(join(root, 'src', name), 'utf8');

let html = src('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, file) => `<style>\n${src(file)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, file) => `<script>\n${src(file).replace(/<\/script/gi, '<\\/script')}</script>`);

if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('외부 리소스 참조가 남아 있습니다.');

const out = join(root, 'dist', 'cpp-code-island.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`);
