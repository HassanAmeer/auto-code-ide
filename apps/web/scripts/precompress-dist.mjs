/**
 * Pre-compress the production build with Brotli and gzip so the static file
 * server can answer with Content-Encoding: br / gzip without compressing on
 * the fly. Run automatically as part of `pnpm build` (see package.json).
 *
 * Idempotent: regenerates .br/.gz next to every compressible text asset.
 */
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createBrotliCompress, createGzip, constants as zlibConstants } from "node:zlib";
import { pipeline } from "node:stream/promises";

const DIST = resolve(import.meta.dirname, "..", "dist");

const COMPRESSIBLE = new Set([
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".svg",
  ".json",
  ".xml",
  ".map",
  ".wasm",
  ".txt",
  ".webmanifest",
  ".md",
]);

const MIN_BYTES = 1024; // Below 1KB compression isn't worth the CPU or bytes.

if (!existsSync(DIST)) {
  console.log("[precompress] dist/ not found, skipping");
  process.exit(0);
}

/** @type {string[]} */
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (
      COMPRESSIBLE.has(extname(entry.name).toLowerCase()) &&
      !entry.name.endsWith(".br") &&
      !entry.name.endsWith(".gz")
    ) {
      files.push(full);
    }
  }
}

async function compress(file, suffix, factory) {
  const target = `${file}${suffix}`;
  try {
    await unlink(target);
  } catch {}
  await pipeline(createReadStream(file), factory(), createWriteStream(target));
}

await walk(DIST);

let brBytes = 0;
let gzBytes = 0;
let count = 0;
for (const file of files) {
  const info = await stat(file);
  if (info.size < MIN_BYTES) continue;
  await compress(file, ".br", () =>
    createBrotliCompress({
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 },
    }),
  );
  await compress(file, ".gz", () => createGzip({ level: 9 }));
  const [br, gz] = await Promise.all([stat(`${file}.br`), stat(`${file}.gz`)]);
  brBytes += br.size;
  gzBytes += gz.size;
  count += 1;
}

console.log(
  `[precompress] ${count} assets -> .br ${(brBytes / 1024 / 1024).toFixed(1)} MB, .gz ${(gzBytes / 1024 / 1024).toFixed(1)} MB`,
);
