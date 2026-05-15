#!/usr/bin/env node
// Partzilla offline catalog scraper — STUB.
//
// Personal use only. Partzilla's ToS likely prohibits scraping; keep this
// strictly low-rate, single-user, not redistributed.
//
// Usage:
//   node scripts/scrape-partzilla.mjs [--throttle 1500] [--max-pages 200] [--with-images]
//
// Output: ../partzilla.json with shape:
//   { scrapedAt, source, groups: [{ name, url, parts: [{ partNumber, description, msrp, imageUrl }] }] }
//
// Status: not implemented in v1. The site already loads partzilla.json and shows
// a "Run the scraper to enable OEM lookup" hint when `stub === true`.

import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) { args.set(a.slice(2), next); i++; }
    else args.set(a.slice(2), true);
  }
}

const SOURCE = 'https://www.partzilla.com/catalog/polaris/atv/2007/sportsman-x2-500-efi-a07th50al-aq-au-az-tn50af-as-au';
const THROTTLE_MS = Number(args.get('throttle') ?? 1500);
const MAX_PAGES = Number(args.get('max-pages') ?? 200);
const WITH_IMAGES = !!args.get('with-images');
const UA = 'pughlabs-personal-archive/1.0 (contact: pughlabs@gmail.com)';

console.error('Partzilla scraper is a stub. Edit scripts/scrape-partzilla.mjs to implement.');
console.error(`  source: ${SOURCE}`);
console.error(`  throttle: ${THROTTLE_MS}ms  max-pages: ${MAX_PAGES}  with-images: ${WITH_IMAGES}`);
console.error(`  user-agent: ${UA}`);

const { fileURLToPath } = await import('node:url');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'partzilla.json');
const existing = JSON.parse(await fs.readFile(out, 'utf8').catch(() => '{}'));
if (existing.stub) {
  console.error('partzilla.json is still a stub. Nothing to do.');
  process.exit(0);
}
