// Pure function — also runnable in Node. Browser imports the named export.
// Regenerates MAINTENANCE.md from data.json so the markdown stays a faithful mirror.

export function dataToMaintenanceMd(data) {
  const today = new Date().toISOString().slice(0, 10);
  const v = data.vehicle;
  const s = data.status;
  const fsm = data.fsm;

  const fsmLink = (printedPage) => {
    const pdf = printedPage + (fsm.pdfPageOffset || 0);
    return `[FSM p${printedPage}](${encodeURI(fsm.filename)}#page=${pdf})`;
  };

  const lines = [];

  lines.push(`> Generated from data.json on ${today} — do not hand-edit.`);
  lines.push('');
  lines.push(`# ${v.year} Polaris ${v.model} — Maintenance Log`);
  lines.push('');
  lines.push(`**Photo album (all years):** ${data.settings.albumUrl}`);
  lines.push(`**Factory service manual:** [${fsm.label}](${encodeURI(fsm.filename)})`);
  lines.push(`**Parts purchase history:** [PARTS LIST.md](PARTS%20LIST.md)`);
  lines.push('');
  lines.push(`> Manual page references use the **printed page number** (bottom of page).${fsm.offsetVerified ? ` The PDF viewer's page number is +${fsm.pdfPageOffset}.` : ' PDF-page offset not yet verified — set it in the site\'s FSM modal.'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Current Status
  lines.push('## Current Status');
  lines.push('');
  lines.push('| Field            | Value         |');
  lines.push('|------------------|---------------|');
  lines.push(`| Engine hours     | ${s.engineHours ?? '_TBD_'}         |`);
  lines.push(`| Odometer (mi)    | ${s.odometerMi ?? '_TBD_'}        |`);
  lines.push(`| Last service     | ${s.lastServiceDate ?? '_TBD_'} — ${s.lastServiceTitle ?? ''} |`);
  lines.push(`| Next service due | _see Recommended Upcoming on the site_ |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Reference Notes
  lines.push('## Reference Notes');
  lines.push('');
  lines.push('> Standing facts and gotchas worth keeping at the top — tool sizes, torque specs, oil capacities, weird bolts.');
  lines.push('');
  for (const n of data.referenceNotes) {
    lines.push(`- ${n.text}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Periodic Schedule
  lines.push('## Periodic Maintenance Schedule (from FSM p66–68)');
  lines.push('');
  lines.push('> Check items off as you complete them. The site auto-stamps `lastDone` when you tick a box.');
  lines.push('>');
  lines.push('> Legend: **⚠ severe-use** = service more often if used in mud/water/sand. **🔧 dealer** = factory recommends an authorized Polaris dealer.');
  lines.push('');

  // group schedule by section
  const sections = [];
  const bySection = new Map();
  for (const item of data.schedule) {
    if (!bySection.has(item.section)) {
      sections.push(item.section);
      bySection.set(item.section, []);
    }
    bySection.get(item.section).push(item);
  }
  for (const section of sections) {
    lines.push(`### ${section}`);
    for (const item of bySection.get(section)) {
      const tags = [item.dealer ? '🔧' : '', item.severeUse ? '⚠' : ''].filter(Boolean).join(' ');
      const tagPrefix = tags ? `${tags} ` : '';
      const checked = item.lastDoneDate ? 'x' : ' ';
      const done = item.lastDoneDate
        ? ` — **DONE ${item.lastDoneDate}${item.lastDoneHours != null ? ` @ ${item.lastDoneHours}h` : ''}${item.lastDoneMiles != null ? ` @ ${item.lastDoneMiles} mi` : ''}**`
        : '';
      lines.push(`- [${checked}] ${tagPrefix}${item.label}${done}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Service History
  lines.push('## Service History');
  lines.push('');
  lines.push('> Reverse-chronological. Newest first.');
  lines.push('');

  const history = [...data.serviceHistory].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of history) {
    lines.push(`### ${entry.date} — ${entry.title}`);
    lines.push('');
    lines.push(`- **Hours / mi:** ${entry.hours ?? '_TBD_'}${entry.miles != null ? ` h / ${entry.miles} mi` : ''}`);
    lines.push(`- **Category:** ${entry.category ?? ''}`);
    if (entry.fsmPage) lines.push(`- **Manual reference:** ${fsmLink(entry.fsmPage)}`);
    if (entry.partsUsed?.length) {
      const partLabels = entry.partsUsed
        .map((pid) => data.parts.find((p) => p.id === pid)?.description ?? pid)
        .join('; ');
      lines.push(`- **Parts used:** ${partLabels}`);
    }
    if (entry.photos?.length) {
      lines.push(`- **Photos:** ${entry.photos.map((f) => `[${f}](ATV%20PICS/${encodeURIComponent(f)})`).join(', ')}`);
    }
    if (entry.procedure?.length) {
      lines.push(`- **Procedure followed:**`);
      for (const p of entry.procedure) lines.push(`  - ${p}`);
    }
    if (entry.notes?.length) {
      lines.push(`- **Notes:**`);
      for (const n of entry.notes) lines.push(`  - ${n}`);
    }
    if (entry.scheduleItemsCompleted?.length) {
      const labels = entry.scheduleItemsCompleted
        .map((sid) => data.schedule.find((x) => x.id === sid)?.label ?? sid)
        .join(', ');
      lines.push(`- **Schedule items completed:** ${labels}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Node CLI: `node scripts/export-maintenance-md.js` reads ../data.json and writes ../MAINTENANCE.md
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('export-maintenance-md.js')) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const data = JSON.parse(await fs.readFile(path.join(here, '..', 'data.json'), 'utf8'));
  const md = dataToMaintenanceMd(data);
  await fs.writeFile(path.join(here, '..', 'MAINTENANCE.md'), md, 'utf8');
  console.log('Wrote MAINTENANCE.md');
}
