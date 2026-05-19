export function gateStatusLabel(gate) {
  if (!gate) {
    return 'MISSING';
  }
  return gate.status === 'pass' ? 'PASS' : 'FAIL';
}

export function countExecutedRuntimeProbes(cert) {
  const probes = cert?.evidenceSummary?.runtime?.probes ?? [];
  return probes.filter((probe) => probe.executed).length;
}

export function allGatesPass(cert) {
  return cert?.status === 'CERTIFIED';
}

export function findFailingGates(cert) {
  if (!cert?.gates) {
    return ['NO_GATES'];
  }
  return Object.entries(cert.gates)
    .filter(([, gate]) => gate?.status !== 'pass')
    .map(([name]) => name);
}

export function findRegressions(prevGates, currGates) {
  if (!prevGates || !currGates) {
    return [];
  }
  const regressions = [];
  for (const name of Object.keys(currGates)) {
    const prev = prevGates[name];
    const curr = currGates[name];
    if (prev?.status === 'pass' && curr?.status !== 'pass') {
      regressions.push({ gate: name, previous: 'pass', current: curr?.status ?? 'missing' });
    }
  }
  return regressions;
}

export function countPassedGates(cert) {
  if (!cert?.gates) {
    return 0;
  }
  return Object.values(cert.gates).filter((gate) => gate?.status === 'pass').length;
}

export function totalGates(cert) {
  if (!cert?.gates) {
    return 0;
  }
  return Object.keys(cert.gates).length;
}

export function buildAssertionReport(cycleResults, cycleCount) {
  const report = {
    cycles: cycleCount,
    timestamp: new Date().toISOString(),
    cycles_detail: [],
    assertions: {
      runtime_evidence_gt_zero: { passed: true, per_cycle: [], detail: '' },
      target_certified: { passed: true, per_cycle: [], detail: '', failing_gates_by_cycle: {} },
      no_regression: { passed: true, detail: '', regressions: [] },
    },
    overall: 'PASS',
  };

  for (let i = 0; i < cycleResults.length; i += 1) {
    const { cert, certPath } = cycleResults[i];
    const label = `cycle_${i + 1}`;

    if (!cert) {
      report.cycles_detail.push({
        cycle: i + 1,
        certificate_path: certPath,
        found: false,
        error: 'Certificate file not found or unparseable',
        runtime_probes_executed: 0,
        gates_passed: 0,
        gates_total: 0,
        all_gates_pass: false,
        failing_gates: ['CERTIFICATE_MISSING'],
      });
      report.assertions.runtime_evidence_gt_zero.passed = false;
      report.assertions.runtime_evidence_gt_zero.per_cycle.push(false);
      report.assertions.target_certified.passed = false;
      report.assertions.target_certified.per_cycle.push(false);
      report.assertions.target_certified.failing_gates_by_cycle[label] = ['CERTIFICATE_MISSING'];
      continue;
    }

    const probesExecuted = countExecutedRuntimeProbes(cert);
    const gatesPassed = countPassedGates(cert);
    const gatesTotal = totalGates(cert);
    const allPass = allGatesPass(cert);
    const failingGates = allPass ? [] : findFailingGates(cert);

    report.cycles_detail.push({
      cycle: i + 1,
      certificate_path: certPath,
      found: true,
      status: cert.status,
      humanReplacementStatus: cert.humanReplacementStatus,
      score: cert.score,
      environment: cert.environment,
      commitSha: cert.commitSha,
      runtime_probes_executed: probesExecuted,
      gates_passed: gatesPassed,
      gates_total: gatesTotal,
      all_gates_pass: allPass,
      failing_gates: failingGates,
    });

    report.assertions.runtime_evidence_gt_zero.per_cycle.push(probesExecuted > 0);
    report.assertions.target_certified.per_cycle.push(allPass);
    report.assertions.target_certified.failing_gates_by_cycle[label] = failingGates;
  }

  updateAssertionDetails(report, cycleResults, cycleCount);
  return report;
}

function updateAssertionDetails(report, cycleResults, cycleCount) {
  if (!report.assertions.runtime_evidence_gt_zero.per_cycle.every(Boolean)) {
    report.assertions.runtime_evidence_gt_zero.passed = false;
    report.assertions.runtime_evidence_gt_zero.detail =
      `Expected runtime_evidence > 0 in all ${cycleCount} cycles. ` +
      report.assertions.runtime_evidence_gt_zero.per_cycle
        .map((value, index) => `Cycle ${index + 1}: ${value ? 'OK' : 'FAIL (0 probes)'}`)
        .join('; ');
  } else {
    report.assertions.runtime_evidence_gt_zero.detail =
      `All ${cycleCount} cycles have runtime_evidence > 0.`;
  }

  if (!report.assertions.target_certified.per_cycle.every(Boolean)) {
    report.assertions.target_certified.passed = false;
    const badCycles = report.assertions.target_certified.per_cycle
      .map((value, index) => (value ? null : `Cycle ${index + 1}`))
      .filter(Boolean);
    report.assertions.target_certified.detail =
      `Not all target certification gates PASS in: ${badCycles.join(', ')}.`;
  } else {
    report.assertions.target_certified.detail =
      `All target certification gates PASS in all ${cycleCount} cycles.`;
  }

  for (let i = 1; i < cycleResults.length; i += 1) {
    const prevCert = cycleResults[i - 1].cert;
    const currCert = cycleResults[i].cert;
    if (!prevCert || !currCert) {
      continue;
    }
    const regressions = findRegressions(prevCert.gates, currCert.gates);
    if (regressions.length > 0) {
      report.assertions.no_regression.passed = false;
      for (const regression of regressions) {
        report.assertions.no_regression.regressions.push({
          ...regression,
          from_cycle: i,
          to_cycle: i + 1,
        });
      }
    }
  }

  if (report.assertions.no_regression.passed) {
    report.assertions.no_regression.detail =
      'No subgate regression detected between consecutive cycles.';
  } else {
    report.assertions.no_regression.detail = report.assertions.no_regression.regressions
      .map(
        (regression) =>
          `Gate "${regression.gate}" regressed from PASS (cycle ${regression.from_cycle}) to ${regression.current.toUpperCase()} (cycle ${regression.to_cycle})`,
      )
      .join('; ');
  }

  if (
    !report.assertions.runtime_evidence_gt_zero.passed ||
    !report.assertions.target_certified.passed ||
    !report.assertions.no_regression.passed
  ) {
    report.overall = 'FAIL';
  }
}
