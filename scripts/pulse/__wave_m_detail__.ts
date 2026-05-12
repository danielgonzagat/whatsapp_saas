import { auditPulseNoHardcodedReality } from './no-hardcoded-reality-audit';

const r = auditPulseNoHardcodedReality(process.cwd());

const prefixMap: Record<string, string> = {
  'convergence-plan': 'scripts/pulse/convergence-plan/',
  'property-tester': 'scripts/pulse/property-tester/',
  'certification': 'scripts/pulse/certification/',
  'observability-coverage': 'scripts/pulse/observability-coverage/',
  'chaos-engine': 'scripts/pulse/chaos-engine/',
  'behavior-graph': 'scripts/pulse/behavior-graph/',
  'runtime-fusion': 'scripts/pulse/runtime-fusion/',
  'dataflow-engine': 'scripts/pulse/dataflow-engine/',
};

for (const [name, prefix] of Object.entries(prefixMap)) {
  const matching = r.summary.topFiles.filter((f: any) => f.filePath.startsWith(prefix));
  const total = matching.reduce((sum: number, f: any) => sum + f.findings, 0);
  console.log(`\n${name}: ${total} (${matching.length} sub-files)`);
  matching.sort((a: any, b: any) => b.findings - a.findings).slice(0, 5).forEach((m: any) => {
    console.log(`  ${m.filePath}: ${m.findings}`);
  });
}

// types
const typesMatching = r.summary.topFiles.filter((f: any) => 
  f.filePath.startsWith('scripts/pulse/types.') || 
  f.filePath.startsWith('scripts/pulse/types/')
);
const typesTotal = typesMatching.reduce((sum: number, f: any) => sum + f.findings, 0);
console.log(`\ntypes (aggregate): ${typesTotal} (${typesMatching.length} sub-files)`);
typesMatching.sort((a: any, b: any) => b.findings - a.findings).slice(0, 10).forEach((m: any) => {
  console.log(`  ${m.filePath}: ${m.findings}`);
});
