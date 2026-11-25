// news-image-20261125 entrypoint (Node 22, standard library only).
// Copies the bundled front-page image (entry.png beside this file) to
// /output/entry.png, or to $MAKEFUN_OUTPUT_DIR when set (local runs).
// The image is a JPEG in a .png name, which the gate accepts: it tells
// PNG from JPEG by first bytes. Before copying, the entrypoint refuses
// anything that is not a complete JPEG within the gate limits (at most
// 1 MiB, at most 1024x1024), and after copying it re-checks the bytes
// on disk, so two runs always write the same valid bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 1_048_576;
const MAX_DIM = 1024;
const SOF = new Set([0xc0, 0xc1, 0xc2]);
const NO_LEN = new Set([0xd8, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function jpegSize(blob: Buffer): [number, number] | null {
  if (blob.length < 4 || blob[0] !== 0xff || blob[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 <= blob.length) {
    if (blob[pos] !== 0xff) return null;
    const marker = blob[pos + 1];
    if (SOF.has(marker)) {
      const height = blob.readUInt16BE(pos + 5);
      const width = blob.readUInt16BE(pos + 7);
      return [width, height];
    }
    if (marker === 0xda) return null; // scan data follows; no frame after it
    if (NO_LEN.has(marker)) {
      pos += 2;
      continue;
    }
    pos += 2 + blob.readUInt16BE(pos + 2);
  }
  return null;
}

function check(blob: Buffer): [number, number] {
  if (blob.length > MAX_BYTES) die(`bundled image too large: ${blob.length} bytes`);
  if (blob[blob.length - 2] !== 0xff || blob[blob.length - 1] !== 0xd9) {
    die('bundled image has no JPEG end marker');
  }
  const size = jpegSize(blob);
  if (!size) die('cannot read the bundled image dimensions');
  const [w, h] = size;
  if (w > MAX_DIM || h > MAX_DIM) die(`bundled image too big: ${w}x${h}`);
  return size;
}

const source = new URL('./entry.png', import.meta.url);
const blob = readFileSync(source);
const [width, height] = check(blob);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const dest = join(outDir, 'entry.png');
mkdirSync(outDir, { recursive: true });
copyFileSync(source, dest);

const written = readFileSync(dest);
if (!written.equals(blob)) die('written output differs from the bundled image');
const [ow, oh] = check(written);
if (ow !== width || oh !== height) die('written output dimensions changed');
const sha = createHash('sha256').update(written).digest('hex');
console.log(`entry.png: ${width}x${height}, ${written.length} bytes, sha256 ${sha} -> ${dest}`);
