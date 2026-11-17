#!/usr/bin/env node
// 从 dsh web 的标准输出里抓取带 token 的 URL，原子写入文件。
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';

const target = process.argv[2];
if (!target) {
  console.error('用法：capture-token.mjs <token 文件>');
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });

createInterface({ input: process.stdin }).on('line', (line) => {
  const match = line.match(/https?:\/\/\S+[?&]token=[\w-]+/);
  if (!match) return;
  writeFileSync(`${target}.tmp`, match[0]);
  renameSync(`${target}.tmp`, target);
  console.error(`token 已更新 → ${target}`);
});
