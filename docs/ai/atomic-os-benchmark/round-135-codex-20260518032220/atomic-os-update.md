# Atomic OS Update From Round 135

## Diagnosis

Round 135 proved that cross-owner dependency bundle reuse helped but did not
fully close the gap. Atomic improved inventory and churn, but still lost facade
surface because it materialized the shared dependency bundle with accessor
properties:

- `const facade = this`;
- `get openai() { return facade.openai; }`;
- similar getters for model/runtime fields.

The generated accessor bundle was safe but larger than needed. The original
facade initializes those fields in the constructor and does not reassign them
after construction, so a direct value bundle is the smaller faithful action.

## Update Applied

`atomic-refactor-fastpath.cjs` now extends `classSurfaceInventory` with an AST
assignment scan:

- scans `this.<field> = ...` outside the constructor;
- records `postConstructorAssignedFields`;
- computes `mutableBundleFields` from facade dependencies;
- emits `sharedBundleAccessMode`.

The dependency bundle planner now chooses:

- `direct_value_bundle` when no bundle dependency is assigned after the
  constructor;
- `accessor_bundle` only when post-constructor assignment evidence exists.

The policy also includes `accessorSurfacePenalty` in the shared-bundle surface
estimate, so accessor-heavy bundles must pay their measured surface cost.

This remains dynamic. It is derived from AST assignment evidence and the actual
dependency names in the facade; it does not hardcode service names, method
names, file names, thresholds, or a fixed bundle implementation.

## Update Validation

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`:
  pass.
- Operational hardcode inventory over benchmark tools:
  `operationalHardcodeCount=0`.
- Recompiled fastpath preview after update:
  `dependency_split_modules`, `direct_function_delegation`,
  `dependencyBundleReusePlan.available=true`,
  `sharedBundleAccessMode.mode=direct_value_bundle`,
  `mutableBundleFields=[]`, `postConstructorAssignedFields=[]`.

## Expected Effect

The next Atomic worker should keep the split/largest-module win and the
cross-owner bundle inventory improvement, while reducing facade surface by
building the shared dependency bundle directly from constructor-initialized
values instead of emitting getter-heavy facade capture.
