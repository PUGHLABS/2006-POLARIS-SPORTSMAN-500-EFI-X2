export function dataToPartsMd(data) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...data.parts].sort((a, b) => b.date.localeCompare(a.date));
  const total = sorted.reduce((sum, p) => sum + (p.costUsd || 0), 0);

  const lines = [];
  lines.push(`> Generated from data.json on ${today} — do not hand-edit.`);
  lines.push('');
  lines.push(`# ${data.vehicle.year} Polaris ${data.vehicle.model} — Parts Purchase History`);
  lines.push('');
  lines.push('| Date       | Cost     | Polaris P# | Vendor   | Description |');
  lines.push('|------------|----------|------------|----------|-------------|');
  for (const p of sorted) {
    const cost = `$${p.costUsd.toFixed(2)}`;
    lines.push(`| ${p.date} | ${cost.padEnd(8)} | ${(p.polarisPN || '').padEnd(10)} | ${(p.vendor || '').padEnd(8)} | ${p.description} |`);
  }
  lines.push('');
  lines.push(`**Total expenditure:** $${total.toFixed(2)}`);
  lines.push('');
  lines.push(`Photo album: ${data.settings.albumUrl}`);
  lines.push('');
  return lines.join('\n');
}

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('export-parts-md.js')) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const data = JSON.parse(await fs.readFile(path.join(here, '..', 'data.json'), 'utf8'));
  const md = dataToPartsMd(data);
  await fs.writeFile(path.join(here, '..', 'PARTS LIST.md'), md, 'utf8');
  console.log('Wrote PARTS LIST.md');
}
