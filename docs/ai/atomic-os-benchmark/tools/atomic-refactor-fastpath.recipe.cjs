'use strict';

function firstObservableWritePlan(writeTargets) {
  const candidates = (Array.isArray(writeTargets) ? writeTargets : [])
    .map((target, index) => {
      const observedLines = Number(target && target.observedLines);
      const symbolCount = Array.isArray(target && target.symbols) ? target.symbols.length : 0;
      const measuredReleaseSurface = Number.isFinite(observedLines) && observedLines > 0 ? observedLines : symbolCount;
      return {
        file: target ? target.file : null,
        index,
        observedLines: Number.isFinite(observedLines) && observedLines > 0 ? observedLines : null,
        symbolCount,
        measuredReleaseSurface,
        responsibility: target ? target.responsibility : null,
      };
    })
    .filter((candidate) => candidate.file)
    .sort((left, right) => {
      if (left.measuredReleaseSurface !== right.measuredReleaseSurface) return right.measuredReleaseSurface - left.measuredReleaseSurface;
      if (left.symbolCount !== right.symbolCount) return right.symbolCount - left.symbolCount;
      return left.file.localeCompare(right.file);
    });
  const firstWriteTarget = candidates[0] || null;
  return {
    available: Boolean(firstWriteTarget),
    firstWriteTarget,
    orderedTargets: candidates,
    decisionAuthority: 'derived from selected writeTargets observedLines and symbol count; no fixed latency, file-name, or tool-call budget is used',
    action: firstWriteTarget
      ? 'make the first durable write against ' + firstWriteTarget.file + ' because it has the largest measured release surface among ready product batch units'
      : 'no write target available; read code_outline and recompile policy before writing',
  };
}

function retainedPublicLeafReleaseEconomyPlan(retained, ownerTarget, ownerCall, options = {}) {
  const leafLines = Number(retained && retained.lines);
  const measuredLeafLines = Number.isFinite(leafLines) && leafLines > 0 ? leafLines : null;
  const ownerObservedLines = Number(ownerTarget && ownerTarget.observedLines);
  const measuredOwnerLines = Number.isFinite(ownerObservedLines) && ownerObservedLines > 0 ? ownerObservedLines : null;
  const facadeReduction = measuredLeafLines || 0;
  const ownerLargestIncrease = measuredLeafLines || 0;
  const productSourceFileDelta = 0;
  const changedInventoryDelta = 0;
  const ownerAlreadyExists = Boolean(ownerTarget && ownerTarget.file);
  const runtimeOwnerClassPreferred = Boolean(options.runtimeOwnerClassPreferred);
  const measurable = measuredLeafLines !== null && ownerAlreadyExists;
  const standardEconomyPass = measurable && (
    productSourceFileDelta < 0 ||
    changedInventoryDelta < 0 ||
    facadeReduction > ownerLargestIncrease + Math.max(0, changedInventoryDelta)
  );
  const runtimeOwnerDelegationPass = measurable && runtimeOwnerClassPreferred && productSourceFileDelta <= 0 && changedInventoryDelta <= 0;
  const pass = standardEconomyPass || runtimeOwnerDelegationPass;
  return {
    available: measurable,
    pass,
    ownerCall,
    ownerFile: ownerTarget ? ownerTarget.file : null,
    ownerObservedLinesBefore: measuredOwnerLines,
    facadeReduction,
    ownerLargestIncrease,
    productSourceFileDelta,
    changedInventoryDelta,
    runtimeOwnerClassPreferred,
    standardEconomyPass,
    runtimeOwnerDelegationPass,
    interpretation: pass
      ? (runtimeOwnerDelegationPass
          ? 'Retained public leaf delegates through the runtime owner because runtime_owner_class_delegation is already preferred and the wrapper move does not add product source files or changed inventory.'
          : 'Retained public leaf release is active because measured economy is Pareto-improving across facade, owner pressure, source count, and inventory surfaces.')
      : 'Retained public leaf stays in the facade when release is only a surface transfer without runtime-owner delegation or a measured economy win.',
  };
}

function compactExecutionBriefWithDynamicDominance(blueprint) {
  if (!blueprint.compactExecutionBrief) return null;
  const recipe = blueprint.executableFirstBatchRecipe || null;
  const facadeRewritePlan = recipe ? recipe.facadeRewritePlan : null;
  const recipeWriteTargets = recipe
    ? recipe.writePlan.map((target) => ({
        file: target.file,
        symbols: target.symbols || [],
        responsibility: target.responsibility,
      }))
    : null;
  return {
    ...blueprint.compactExecutionBrief,
    ...(recipeWriteTargets ? { writeTargets: recipeWriteTargets } : {}),
    executableOwnerMap: recipe
      ? {
          publicMethodCount: recipe.publicMethodCount,
          readOnlyExistingModules: recipe.readOnlyExistingModules,
          firstObservableWritePlan: recipe.firstObservableWritePlan,
          writePlan: recipe.writePlan,
          facadeRewritePlan,
          firstBatchOrder: recipe.firstBatchOrder,
          unresolvedPublicMethods: recipe.unresolvedPublicMethods,
        }
      : null,
    dynamicDominanceObjective: {
      decisionAuthority: 'derived from scorecard surfaces, executable owner map, and validation results; no fixed line or time budget',
      optimizeSurfaces: [
        'target facade lines',
        'changed inventory lines',
        'largest changed source lines',
        'product churn',
        'net source deletion',
      ],
      firstObservableWritePlan: recipe ? recipe.firstObservableWritePlan : null,
      compactionRule: 'After the first green scorecard, keep only compactions that reduce at least one optimize surface without worsening other gates or increasing product source count.',
      stopRule: 'Stop when the next available product-batch compaction would require a new write target, type-only spillover file, public API change, spec/protected edit, or increased scorecard surface.',
      facadeShape: blueprint.facadeDelegationCompactness ? blueprint.facadeDelegationCompactness.expectedFacadeShape : null,
      facadeCompactnessGuard: facadeRewritePlan ? facadeRewritePlan.compactnessGuard : null,
      importPressurePlan: facadeRewritePlan ? facadeRewritePlan.importPressurePlan : null,
      dependencyBundleReusePlan: facadeRewritePlan ? facadeRewritePlan.dependencyBundleReusePlan : null,
      runtimeOwnerClassPlan: facadeRewritePlan ? facadeRewritePlan.runtimeOwnerClassPlan : null,
      balancedSupportReleasePlan: blueprint.balancedSupportRelease || null,
      postSplitFacadeCompactionPlan: facadeRewritePlan ? facadeRewritePlan.postSplitFacadeCompactionPlan : null,
      writeGranularityPlan: recipe ? recipe.writeGranularityPlan : null,
    },
  };
}

function executionStartCapsule(recipe) {
  const firstPlan = recipe && recipe.firstObservableWritePlan ? recipe.firstObservableWritePlan : null;
  const firstTarget = firstPlan && firstPlan.firstWriteTarget ? firstPlan.firstWriteTarget : null;
  if (!recipe || !firstTarget) {
    return {
      available: false,
      decisionAuthority: 'derived from executableFirstBatchRecipe availability; no fixed latency, file, or tool-call budget is used',
      action: 'compile or refresh the executable first-batch recipe before making a durable write',
    };
  }
  const productBatchUnits = recipe.writeGranularityPlan && Array.isArray(recipe.writeGranularityPlan.productBatchUnits)
    ? recipe.writeGranularityPlan.productBatchUnits
    : [];
  const firstProductBatchUnit = productBatchUnits.find((unit) => unit && unit.file === firstTarget.file) || null;
  const postFirstWriteValidations = [
    recipe.facadeRewritePlan && recipe.facadeRewritePlan.target ? 'replace facade through the compiled owner map after selected owner modules exist' : null,
    'run scorecard command generated for this worktree',
    'run focused public API audit when class surface is detected',
    'run focused Jest after the product batch exists',
  ].filter(Boolean);
  return {
    available: true,
    decisionAuthority: 'derived from firstObservableWritePlan, writeGranularityPlan, and validation surfaces in the current worktree; no fixed latency, file-name, or prompt budget is used',
    firstDurableMutation: {
      file: firstTarget.file,
      observedLines: firstTarget.observedLines,
      symbolCount: firstTarget.symbolCount,
      measuredReleaseSurface: firstTarget.measuredReleaseSurface,
      productBatchUnit: firstProductBatchUnit,
    },
    startNowWhen: [
      'target source and focused spec have been read enough to preserve public behavior',
      'the compiled first product batch unit has a non-empty owner responsibility',
      'no unresolved public method blocks the selected owner file',
      'governance and allowed-scope surfaces are already known from the compiled policy',
    ],
    deferUntilAfterFirstWrite: [
      'broad scorecard optimization',
      'facade compaction beyond one statement per resolved public method',
      'extra exploratory reads not tied to preserving the first product batch unit',
      'style-only cleanup that is not required for syntax or focused validation',
    ],
    postFirstWriteValidations,
    action: 'perform the first durable Atomic OS mutation against ' + firstTarget.file + ' as soon as the startNowWhen evidence is true, then continue the compiled product batch and validate; do not wait for a fixed clock or hardcoded command budget',
  };
}

function minimalDispatchBrief(blueprint, startCapsule, validation) {
  const recipe = blueprint.executableFirstBatchRecipe || null;
  const facadeRewritePlan = recipe ? recipe.facadeRewritePlan : null;
  const dependencyBundleReusePlan = facadeRewritePlan ? facadeRewritePlan.dependencyBundleReusePlan : null;
  const sharedBundleAccessMode = dependencyBundleReusePlan ? dependencyBundleReusePlan.sharedBundleAccessMode : null;
  return {
    decisionAuthority: 'compiled from the current executable first-batch recipe, start capsule, bundle-economy plan, and validation commands; no reusable prompt template, latency budget, file list, or command count is hardcoded',
    missionShape: blueprint.selectedShape,
    delegationShape: blueprint.delegationShape,
    firstDurableMutation: startCapsule.firstDurableMutation || null,
    startNowWhen: startCapsule.startNowWhen || [],
    deferUntilAfterFirstWrite: startCapsule.deferUntilAfterFirstWrite || [],
    firstBatchOrder: recipe && Array.isArray(recipe.firstBatchOrder) ? recipe.firstBatchOrder : [],
    productBatchUnits: recipe && recipe.writeGranularityPlan ? recipe.writeGranularityPlan.productBatchUnits : [],
    dependencyBundleAccessMode: sharedBundleAccessMode,
    facadeRewriteGuard: facadeRewritePlan ? facadeRewritePlan.compactnessGuard : null,
    validation,
    workerInstruction: [
      'Use this minimalDispatchBrief as the execution brief and the full policy JSON only as lookup evidence.',
      'Do not re-summarize the full policy before the first durable mutation when startNowWhen is already true.',
      'Make the first durable mutation against firstDurableMutation.file, continue firstBatchOrder, then run validation.',
      'Escalate back to the full policy only if the first mutation is refused, public API preservation is ambiguous, or validation fails.',
    ],
  };
}

function atomicWorkerBrief(blueprint, scorecardCommand, publicApiAuditCommand, scopeDisciplineCommand, traceIsolationCommand, typecheckImpactCommand) {
  const compactExecutionBrief = compactExecutionBriefWithDynamicDominance(blueprint);
  const startCapsule = executionStartCapsule(blueprint.executableFirstBatchRecipe);
  const validation = {
    scorecard: scorecardCommand,
    publicApiAudit: publicApiAuditCommand,
    scopeDiscipline: scopeDisciplineCommand,
    traceIsolation: traceIsolationCommand,
    typecheckImpact: typecheckImpactCommand,
  };
  return {
    execute: blueprint.firstAction,
    executionStartCapsule: startCapsule,
    minimalDispatchBrief: minimalDispatchBrief(blueprint, startCapsule, validation),
    selectedShape: blueprint.selectedShape,
    compactExecutionBrief,
    marginAmplification: blueprint.marginAmplification,
    balancedSupportRelease: blueprint.balancedSupportRelease,
    delegationShape: blueprint.delegationShape,
    retainInFacade: blueprint.retainInFacade,
    writeTargets: compactExecutionBrief && compactExecutionBrief.writeTargets ? compactExecutionBrief.writeTargets : blueprint.writeTargets,
    reuseExistingModules: blueprint.reuseExistingModules,
    siblingReusePlan: blueprint.siblingReusePlan,
    executableFirstBatchRecipe: blueprint.executableFirstBatchRecipe,
    facadeDelegationCompactness: blueprint.facadeDelegationCompactness,
    traceBatching: blueprint.traceBatching,
    preserve: blueprint.preserve,
    validation: {
      scorecard: scorecardCommand,
      publicApiAudit: publicApiAuditCommand,
      scopeDiscipline: scopeDisciplineCommand,
      traceIsolation: traceIsolationCommand,
      typecheckImpact: typecheckImpactCommand,
    },
  };
}

module.exports = {
  firstObservableWritePlan,
  retainedPublicLeafReleaseEconomyPlan,
  compactExecutionBriefWithDynamicDominance,
  executionStartCapsule,
  minimalDispatchBrief,
  atomicWorkerBrief,
};
