// Helpers extracted from tier-tags-emitter
export function buildFileSignalMap(breaks, repoRoot) {
  const map = new Map();
  for (const b of breaks) {
    let file = b.file || '';
    if (file.startsWith(repoRoot + '/')) {
      file = file.slice(repoRoot.length + 1);
    }
    if (!file) {continue;}

    let entry = map.get(file);
    if (!entry) {
      entry = {
        deadHandlers: 0,
        stubSignals: 0,
        fakeDataSignals: 0,
        weakSignals: 0,
        totalBreaks: 0,
        allTypes: new Set(),
      };
      map.set(file, entry);
    }

    const bt = b.type || '';
    const src = b.source || '';
    const tm = b.truthMode || '';
    const combined = `${bt} ${src}`.toLowerCase();

    if (bt.includes('handler-effect-unobserved') || bt.includes('dead-handler')) {
      entry.deadHandlers++;
    }
    if (combined.includes('dead-code') || combined.includes('stub') || combined.includes('todo')) {
      entry.stubSignals++;
    }
    if (
      combined.includes('fake_data') ||
      combined.includes('fake_save') ||
      combined.includes('hardcoded_data') ||
      combined.includes('random_data')
    ) {
      entry.fakeDataSignals++;
    }
    if (tm === 'weak_signal') {
      entry.weakSignals++;
    }
    entry.totalBreaks++;
    entry.allTypes.add(bt);
  }
  return map;
}

export function buildModuleStateMap() {
  if (!existsSync(PULSE_MANIFEST_PATH)) {return new Map();}
  try {
    const manifest = JSON.parse(readFileSync(PULSE_MANIFEST_PATH, 'utf8'));
    const map = new Map();
    for (const mod of manifest.modules || []) {
      if (mod.name) {map.set(mod.name.toLowerCase(), mod.state);}
    }
    for (const mod of manifest.legacyModules || []) {
      if (mod.name) {map.set(mod.name.toLowerCase(), mod.state);}
    }
    return map;
  } catch {
    return new Map();
  }
}

export function inferTier(relPath, signalEntry, testsExist, sourceSize, entryFields) {
  const deadHandlers = signalEntry ? signalEntry.deadHandlers : 0;
  const stubSignals = signalEntry ? signalEntry.stubSignals : 0;
  const fakeData = signalEntry ? signalEntry.fakeDataSignals : 0;
  const totalBreaks = signalEntry ? signalEntry.totalBreaks : 0;
  const weakSignals = signalEntry ? signalEntry.weakSignals : 0;
  const hardSignals = deadHandlers + stubSignals + fakeData;

  const evidence = [];
  if (deadHandlers > 0) {evidence.push(`pulse:${deadHandlers} dead-handler(s)`);}
  if (stubSignals > 0) {evidence.push(`pulse:${stubSignals} stub signal(s)`);}
  if (fakeData > 0) {evidence.push(`pulse:${fakeData} fake-data signal(s)`);}
  if (weakSignals > 0) {evidence.push(`pulse:${weakSignals} weak signal(s)`);}
  if (totalBreaks > 0 && evidence.length === 0) {
    evidence.push(`pulse:${totalBreaks} diagnostic break(s)`);
  }
  if (testsExist) {evidence.push('test:exists');}

  if (sourceSize < SHELL_SIZE_THRESHOLD) {
    return {
      tier: 4,
      evidence: [`size:${sourceSize}b below ${SHELL_SIZE_THRESHOLD}b threshold`, ...evidence],
    };
  }

  if (hardSignals >= 3) {
    return { tier: 3, evidence };
  }

  if (hardSignals === 0 && testsExist) {
    return { tier: 1, evidence };
  }

  if (hardSignals >= 1 && hardSignals <= 2) {
    return { tier: 2, evidence };
  }

  return { tier: 2, evidence };
}

