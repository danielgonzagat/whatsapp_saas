'use strict';

function buildExecutableFirstBatchRecipe(blueprint, facadeSurface, siblingReusePlan = null) {
  const baseWriteTargets = Array.isArray(blueprint.writeTargets) ? blueprint.writeTargets : [];
  const writeTargets = baseWriteTargets.map((target) => ({
    ...target,
    symbols: [...new Set(target.symbols || [])],
  }));
  const retainedFacade = new Set(Array.isArray(blueprint.retainInFacade) ? blueprint.retainInFacade : []);
  const retainedDetails = Array.isArray(blueprint.retainedFacadeSymbols) ? blueprint.retainedFacadeSymbols : [];
  const reuseAssignments = siblingReusePlan && Array.isArray(siblingReusePlan.reuseAssignments)
    ? siblingReusePlan.reuseAssignments
    : [];
  const reuseBySymbol = new Map(reuseAssignments.map((assignment) => [assignment.symbol, assignment]));
  const modulesByFile = new Map(
    (Array.isArray(blueprint.reuseExistingModules) ? blueprint.reuseExistingModules : [])
      .map((module) => [module.file, module]),
  );
  const writeTargetBySymbol = new Map();
  function indexWriteTargets() {
    writeTargetBySymbol.clear();
    for (const target of writeTargets) {
      for (const symbol of target.symbols || []) {
        if (!writeTargetBySymbol.has(symbol)) writeTargetBySymbol.set(symbol, target);
      }
    }
  }
  indexWriteTargets();
  const retainedReleaseBySymbol = new Map();
  const retainedReleaseEconomyBySymbol = new Map();
  for (const retained of retainedDetails) {
    if (!retained || !retainedFacade.has(retained.name)) continue;
    if (retained.releaseEligible === false) {
      retainedReleaseEconomyBySymbol.set(retained.name, {
        available: false,
        pass: false,
        releaseEligible: false,
        interpretation: 'Dominant public root is intentionally retained in the facade because the selected macro shape optimizes inventory/churn by moving helpers and sibling roots instead of the orchestration body.',
      });
      continue;
    }
    const ownerCall = (retained.calls || []).find((call) => writeTargetBySymbol.has(call));
    if (!ownerCall) continue;
    const ownerTarget = writeTargetBySymbol.get(ownerCall);
    if (!ownerTarget) continue;
    const publicLeafReleaseEconomy = retainedPublicLeafReleaseEconomyPlan(retained, ownerTarget, ownerCall, {
      runtimeOwnerClassPreferred: blueprint.delegationShape === 'runtime_owner_class_delegation',
    });
    retainedReleaseEconomyBySymbol.set(retained.name, publicLeafReleaseEconomy);
    if (!publicLeafReleaseEconomy.pass) continue;
    if (!ownerTarget.symbols.includes(retained.name)) ownerTarget.symbols.push(retained.name);
    retainedFacade.delete(retained.name);
    retainedReleaseBySymbol.set(retained.name, {
      ownerKind: 'selected_write_target',
      ownerFile: ownerTarget.file,
      preferredExport: retained.name,
      ownerCall,
      publicLeafReleaseEconomy,
      action: publicLeafReleaseEconomy.runtimeOwnerDelegationPass
        ? 'delegate retained public leaf through its runtime owner class because runtime_owner_class_delegation is already the measured facade shape and source/inventory count do not increase'
        : 'release retained public leaf into its already-created owner module because publicLeafReleaseEconomy proves a measured economy win, not just file-count neutrality',
    });
  }
  indexWriteTargets();
  const publicMethods = facadeSurface && facadeSurface.available
    ? facadeSurface.publicMethods
    : [...new Set([...reuseBySymbol.keys(), ...writeTargetBySymbol.keys()])];
  const delegationOwners = publicMethods.map((method) => {
    const retainedRelease = retainedReleaseBySymbol.get(method);
    if (retainedRelease) {
      return {
        method,
        ...retainedRelease,
      };
    }
    if (retainedFacade.has(method)) {
      const retainedDetail = retainedDetails.find((detail) => detail && detail.name === method) || null;
      const localOwnerCall = retainedDetail && Array.isArray(retainedDetail.calls)
        ? retainedDetail.calls.find((call) => retainedFacade.has(call))
        : null;
      return {
        method,
        ownerKind: localOwnerCall ? 'facade_local_wrapper' : 'facade_retained',
        ownerCall: localOwnerCall || null,
        publicLeafReleaseEconomy: retainedReleaseEconomyBySymbol.get(method) || null,
        action: localOwnerCall
          ? 'compact this retained public leaf locally into one facade statement that calls the retained public root; do not create or grow an owner module for a wrapper-only move'
          : 'preserve public method body in facade unless publicLeafReleaseEconomy proves release is a measured economy win or runtime-owner delegation is the preferred facade shape',
      };
    }
    const reuseAssignment = reuseBySymbol.get(method);
    if (reuseAssignment) {
      const module = modulesByFile.get(reuseAssignment.existingModule) || null;
      const exportMatch = bestExportForSymbolName(method, module ? module.exportedRuntimeSymbols : []);
      return {
        method,
        ownerKind: 'existing_runtime_sibling',
        ownerFile: reuseAssignment.existingModule,
        preferredExport: exportMatch ? exportMatch.name : null,
        exportMatchScore: exportMatch ? exportMatch.score : 0,
        action: 'import the matched existing export and delegate; do not copy or rewrite the existing owner module',
      };
    }
    const writeTarget = writeTargetBySymbol.get(method) || writeTargets[0] || null;
    return {
      method,
      ownerKind: writeTarget ? 'selected_write_target' : 'unresolved',
      ownerFile: writeTarget ? writeTarget.file : null,
      preferredExport: writeTarget ? method : null,
      action: writeTarget
        ? 'move implementation to the selected write target and delegate with one public facade statement'
        : 'resolve with code_outline before writing because no owner was derived',
    };
  });
  const ownerFiles = [...new Set(delegationOwners.map((owner) => owner.ownerFile).filter(Boolean))];
  const facadeDependencyReuse = facadeDependencyBundleReusePlan(delegationOwners, facadeSurface);
  const dependencies = facadeSurface && facadeSurface.available
    ? {
        constructorParamProperties: facadeSurface.constructorParamProperties,
        privateFields: facadeSurface.privateFields,
        privateMethods: facadeSurface.privateMethods || [],
      }
    : { constructorParamProperties: [], privateFields: [], privateMethods: [] };
  const facadePressure = facadeImportPressurePlan(blueprint.preserve.target, ownerFiles, delegationOwners);
  const firstObservableWrite = firstObservableWritePlan(writeTargets);
  const firstWriteFile = firstObservableWrite.firstWriteTarget ? firstObservableWrite.firstWriteTarget.file : null;
  const orderedWriteTargets = [...writeTargets].sort((left, right) => {
    if (left.file === firstWriteFile && right.file !== firstWriteFile) return -1;
    if (right.file === firstWriteFile && left.file !== firstWriteFile) return 1;
    return 0;
  });
  return {
    mode: 'compiled_owner_map_to_first_batch',
    decisionAuthority: 'derived from detected public methods, sibling reuse assignments, selected write targets, and facade surface inventory',
    publicMethodCount: publicMethods.length,
    dependencies,
    readOnlyExistingModules: [...modulesByFile.values()].map((module) => ({
      file: module.file,
      exportedRuntimeSymbols: module.exportedRuntimeSymbols,
      reusedSymbols: module.reusedSymbols,
      action: 'read/import only unless validation proves the owner module itself is broken',
    })),
    firstObservableWritePlan: firstObservableWrite,
    writePlan: orderedWriteTargets.map((target) => ({
      file: target.file,
      symbols: target.symbols || [],
      responsibility: target.responsibility,
      observedLines: target.observedLines || null,
      internalCompactionSections: target.internalCompactionSections || [],
      internalCompactionPlan: target.internalCompactionPlan || null,
      action: firstWriteFile === target.file
        ? 'create or update this module as the first observable write before replacing the facade'
        : 'create or update this module after the first observable write and before replacing the facade',
    })),
    facadeRewritePlan: {
      target: blueprint.preserve.target,
      ownerFiles,
      methodDelegations: delegationOwners,
      importPressurePlan: facadePressure,
      dependencyBundleReusePlan: facadeDependencyReuse,
      runtimeOwnerClassPlan: {
        preferred: blueprint.delegationShape === 'runtime_owner_class_delegation',
        economy: blueprint.facadeDelegationShape && blueprint.facadeDelegationShape.runtimeOwnerClassEconomy ? blueprint.facadeDelegationShape.runtimeOwnerClassEconomy : null,
        action: blueprint.delegationShape === 'runtime_owner_class_delegation'
          ? 'materialize owner runtime classes only because dependency-surface measurement shows a strict win over direct functions while preserving constructor identity and public API'
          : 'do not materialize owner runtime classes when the dependency-surface comparison is tied or worse; prefer direct owner functions to avoid class/private-method runtime-module bloat',
      },
      dominantRootRetentionPlan: blueprint.selectedShape === 'dominant_public_root_retention'
        ? {
            active: true,
            retainedRoots: retainedDetails
              .filter((detail) => detail && detail.releaseEligible === false)
              .map((detail) => detail.name),
            internalCompactionPlan: blueprint.dominantRootRetentionPlan ? blueprint.dominantRootRetentionPlan.internalCompactionPlan : null,
            action: 'retain the dominant public orchestration root in the facade, extract its private helper surface and sibling roots, and compact wrapper leaves locally so inventory/churn do not grow just to move a body across files',
          }
        : { active: false },
      compactnessGuard: 'one public method statement per delegated method; repeated dependency objects collapse into one owner-local or cross-owner shared bundle only when dependencyBundleReusePlan.dependencyBundleEconomy.pass is true; otherwise keep direct per-method dependency objects to avoid support/type inventory bloat; no private facade helper unless this recipe leaves the method unresolved',
      postSplitFacadeCompactionPlan: {
        decisionAuthority: 'derived from methodDelegations, ownerFiles, import pressure, dependency bundle reuse, type consumers, and the next scorecard; no fixed facade line budget',
        compactionActions: [
          'after the first green scorecard, delegate every resolved public method to its owner module with one facade statement',
          'when facadeDelegationShape prefers runtime_owner_class_delegation, materialize owner runtime classes and move owner-local private helper/callback methods out of the facade before scorecard comparison',
          'when public methods repeat dependency objects within one owner or across sibling owners, build the smallest shared dependency bundle only if dependencyBundleEconomy proves lower total inventory than direct dependency objects',
          'compact retained public leaf wrappers locally when they call a retained dominant public root; this reduces facade surface without creating or growing an owner module',
          'delegate retained public leaf wrappers through their runtime owner when runtime_owner_class_delegation is preferred and the move does not increase product source count or changed inventory',
          'otherwise release retained public leaf wrappers only when publicLeafReleaseEconomy proves the move reduces at least one measured surface without worsening owner pressure or inventory',
          'keep retained public leaf bodies in the facade when release is a pure surface transfer instead of a measured Pareto improvement',
          'release facade-local types into an already-created consuming owner module before touching the existing shared type files',
          'touch an existing shared type file only when multiple owner modules consume the released type and scorecard economy stays non-worse',
          'remove facade-only private helpers when methodDelegations has no unresolved owner',
          'choose namespace or named imports from importPressurePlan instead of hand-written import style',
        ],
        typeSpilloverGuard: 'extra type-only changed files are economy debt unless scorecard typeSpilloverEconomy proves the existing shared type-file touch is cheaper than owner-local export/import; small public helper types should live in a newly-created owner module before touching an existing shared type file',
        guard: 'apply only if public API, constructor shape, scorecard, focused Jest, typecheck-impact, spec diff, protected diff, and source count remain non-worse',
      },
    },
    writeGranularityPlan: {
      planningUnit: 'public method owner map',
      writeUnit: 'product batch unit',
      productBatchUnits: [
        ...orderedWriteTargets.map((target) => ({ kind: 'module_write', file: target.file, plannedSymbols: target.symbols || [], observedLines: target.observedLines || null })),
        { kind: 'facade_replace', file: blueprint.preserve.target, plannedMethods: publicMethods },
      ],
      traceEconomy: 'Trace count should follow product batch units derived here, not methodDelegations length.',
      microWriteFallback: 'Use per-method writes only after a batch-sized write fails validation and record the failed validation reason.',
    },
    firstBatchOrder: [
      ...[...modulesByFile.values()].map((module) => ({ action: 'reuse_existing_module', file: module.file })),
      ...orderedWriteTargets.map((target) => ({ action: firstWriteFile === target.file ? 'write_first_observable_selected_module' : 'write_selected_module', file: target.file })),
      { action: 'replace_facade', file: blueprint.preserve.target },
    ],
    unresolvedPublicMethods: delegationOwners.filter((owner) => owner.ownerKind === 'unresolved').map((owner) => owner.method),
  };
}


module.exports = { buildExecutableFirstBatchRecipe };
