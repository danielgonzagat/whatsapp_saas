// Parsers extracted from coverage-sidecar-emitter for size budget
export function parseLcov(content) {
  /** @type {Map<string, {linesHit:number,linesFound:number,branchesHit:number,branchesFound:number}>} */
  const map = new Map();
  let current = null;
  let linesHit = 0;
  let linesFound = 0;
  let branchesHit = 0;
  let branchesFound = 0;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line === 'end_of_record') {
      if (current) {
        // Use summary values; fall back to DA/BRDA counts if no summary
        if (linesHit > 0 || linesFound > 0) {
          current.linesHit = linesHit;
          current.linesFound = linesFound;
        }
        if (branchesHit > 0 || branchesFound > 0) {
          current.branchesHit = branchesHit;
          current.branchesFound = branchesFound;
        }
      }
      current = null;
      linesHit = 0;
      linesFound = 0;
      branchesHit = 0;
      branchesFound = 0;
      continue;
    }
    if (line.startsWith('SF:')) {
      const file = line.slice(3);
      if (!map.has(file))
        {map.set(file, { linesHit: 0, linesFound: 0, branchesHit: 0, branchesFound: 0 });}
      current = map.get(file);
      continue;
    }
    if (!current) {continue;}
    if (line.startsWith('DA:')) {
      const parts = line.slice(3).split(',');
      current.linesFound++;
      if (Number(parts[1]) > 0) {current.linesHit++;}
    } else if (line.startsWith('LH:')) {
      linesHit = Number(line.slice(3));
    } else if (line.startsWith('LF:')) {
      linesFound = Number(line.slice(3));
    } else if (line.startsWith('BRH:')) {
      branchesHit = Number(line.slice(4));
    } else if (line.startsWith('BRF:')) {
      branchesFound = Number(line.slice(4));
    }
  }
  return map;
}

// ── Istanbul / coverage-final.json parser ────────────────────────────────────

export function parseIstanbul(content) {
  /** @type {Map<string, {linesHit:number,linesFound:number,branchesHit:number,branchesFound:number}>} */
  const map = new Map();
  const obj = JSON.parse(content);
  for (const [file, stats] of Object.entries(obj)) {
    let linesHit = 0;
    let linesFound = 0;
    let branchesHit = 0;
    let branchesFound = 0;
    if (stats.s) {
      for (const v of Object.values(stats.s)) {
        linesFound++;
        if (Number(v) > 0) {linesHit++;}
      }
    }
    if (stats.b) {
      for (const v of Object.values(stats.b)) {
        if (Array.isArray(v)) {
          branchesFound += v.length;
          branchesHit += v.filter((x) => Number(x) > 0).length;
        }
      }
    }
    map.set(file, { linesHit, linesFound, branchesHit, branchesFound });
  }
  return map;
}

// ── Normalizer ───────────────────────────────────────────────────────────────

