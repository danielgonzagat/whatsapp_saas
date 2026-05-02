// PULSE — Live Codebase Nervous System
// OpenTelemetry Runtime Call Graph Integration
//
// Builds a runtime call graph tracer using OpenTelemetry concepts through a
// lightweight manual span tracing system that works without the real OTel SDK.
//
// Modes:
//   - Manual tracing (default): captures spans during PULSE scenario execution
//   - Simulation mode: generates trace data from the AST/structural graph edges
//   - Real collector mode: reads from an OTel collector endpoint or local trace file
//
// Outputs:
//   - PULSE_RUNTIME_TRACES.json — full runtime trace evidence
//   - PULSE_TRACE_DIFF.json      — diff between runtime traces and static graph

export { ManualSpanTracer, createManualTracer } from './__parts__/otel-runtime/manual-tracer';

export type { InstrumentationHint } from './__parts__/otel-runtime/pattern-detection';
export {
  detectNestjsPatterns,
  detectPrismaPatterns,
  detectBullMQPatterns,
  detectAxiosPatterns,
  detectHttpPatterns,
  detectRedisPatterns,
  detectAllPatterns,
} from './__parts__/otel-runtime/pattern-detection';

export { loadTracesFromFile } from './__parts__/otel-runtime/trace-loading';

export { collectRuntimeTraces } from './__parts__/otel-runtime/core-collection';

export { compareWithStaticGraph, compareWithAstGraph } from './__parts__/otel-runtime/comparison';

export {
  exportTraceToJson,
  saveRuntimeTracesArtifact,
  saveTraceDiffArtifact,
  saveRuntimeCallGraphArtifact,
  loadRuntimeCallGraphArtifact,
  loadTraceDiffArtifact,
} from './__parts__/otel-runtime/artifacts';
