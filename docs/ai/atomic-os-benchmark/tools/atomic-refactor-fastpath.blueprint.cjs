'use strict';

const path = require('node:path');
const { relPath } = require('./atomic-refactor-fastpath.io.cjs');

function directFirstWriteBlueprint(macroRefactorShape, facadeDelegationShape, retainedFacadeSymbols, args, siblingReusePlan = null) {
  const template = macroRefactorShape.available && Array.isArray(macroRefactorShape.selectedDecompositionTemplate)
    ? macroRefactorShape.selectedDecompositionTemplate
    : [];
  const defaultWriteTargets = template.map((entry) => ({
    file: entry.file,
    symbols: entry.symbols || entry.supportSymbolsMoved || [],
    responsibility: entry.responsibility,
    observedLines: entry.observedLines,
    internalCompactionSections: entry.internalCompactionSections || [],
    internalCompactionPlan: entry.internalCompactionPlan || null,
  }));
  const marginTemplate = macroRefactorShape.available && Array.isArray(macroRefactorShape.marginAmplificationTemplate)
    ? macroRefactorShape.marginAmplificationTemplate
    : template;
  const marginWriteTargets = marginTemplate.map((entry) => ({
    file: entry.file,
    symbols: entry.symbols || entry.supportSymbolsMoved || [],
    responsibility: entry.responsibility,
    observedLines: entry.observedLines,
    internalCompactionSections: entry.internalCompactionSections || [],
    internalCompactionPlan: entry.internalCompactionPlan || null,
  }));
  const supportReleaseTemplate = macroRefactorShape.balancedSupportReleasePlan && macroRefactorShape.balancedSupportReleasePlan.available
    ? macroRefactorShape.balancedSupportReleasePlan.selectedDecompositionTemplate
    : null;
  const supportReleaseWriteTargets = Array.isArray(supportReleaseTemplate)
    ? supportReleaseTemplate.map((entry) => ({
        file: entry.file,
        symbols: entry.symbols || entry.supportSymbolsMoved || [],
        responsibility: entry.responsibility,
        observedLines: entry.observedLines,
        internalCompactionSections: entry.internalCompactionSections || [],
        internalCompactionPlan: entry.internalCompactionPlan || null,
      }))
    : null;
  const reuseActive = Boolean(siblingReusePlan && siblingReusePlan.applied && siblingReusePlan.residualWriteTargets.length > 0);
  const preferredCandidate = macroRefactorShape.available && Array.isArray(macroRefactorShape.candidates)
    ? macroRefactorShape.candidates.find((candidate) => candidate.shape === macroRefactorShape.preferredShape)
    : null;
  const clearNonTradeoffShape = Boolean(preferredCandidate && preferredCandidate.dynamicReleasePass && !(preferredCandidate.operationalTradeoff && preferredCandidate.operationalTradeoff.economyTradeoffDebt));
  const compactExecutionBrief = clearNonTradeoffShape
    ? {
        mode: 'clear_non_tradeoff_shape_brief',
        decisionAuthority: 'derived from macroRefactorShape preferred candidate with dynamic release pass and no operational economy tradeoff debt',
        selectedShape: macroRefactorShape.preferredShape,
        writeTargets: reuseActive ? siblingReusePlan.residualWriteTargets : defaultWriteTargets,
        validationOrder: ['write selected modules', 'replace facade once', 'run scorecard', 'run focused Jest', 'run typecheck impact'],
        avoid: ['extra architecture exploration before first write', 'support split candidates marked as economy tradeoff debt', 'per-method writes before the batch fails validation'],
      }
    : null;
  const retainedRootSymbols = Array.isArray(macroRefactorShape.retainedFacadeRootSymbols)
    ? macroRefactorShape.retainedFacadeRootSymbols
    : [];
  const allRetainedFacadeSymbols = [...retainedFacadeSymbols, ...retainedRootSymbols];
  return {
    mode: 'policy_to_first_write_batch',
    selectedShape: macroRefactorShape.preferredShape,
    compactExecutionBrief,
    marginAmplification: {
      shape: macroRefactorShape.marginAmplificationShape || macroRefactorShape.preferredShape,
      writeTargets: marginWriteTargets,
      metrics: macroRefactorShape.marginAmplificationMetrics || null,
      useWhen: 'Use this measured shape when the loop objective is larger structural margin and the standard scorecard stays green.',
    },
    balancedSupportRelease: macroRefactorShape.balancedSupportReleasePlan && macroRefactorShape.balancedSupportReleasePlan.available
      ? {
          shape: macroRefactorShape.balancedSupportReleasePlan.shape,
          writeTargets: supportReleaseWriteTargets,
          metrics: macroRefactorShape.balancedSupportReleasePlan.metrics,
          decisionAuthority: macroRefactorShape.balancedSupportReleasePlan.decisionAuthority,
          useWhen: macroRefactorShape.balancedSupportReleasePlan.useWhen,
        }
      : macroRefactorShape.balancedSupportReleasePlan,
    delegationShape: facadeDelegationShape.available ? facadeDelegationShape.preferredShape : null,
    retainInFacade: allRetainedFacadeSymbols.map((symbol) => symbol.name),
    retainedFacadeSymbols: allRetainedFacadeSymbols.map((symbol) => ({
      name: symbol.name,
      lines: symbol.lines,
      calls: symbol.calls || [],
      reason: symbol.reason,
      releaseEligible: symbol.releaseEligible !== false,
    })),
    writeTargets: reuseActive ? siblingReusePlan.residualWriteTargets : defaultWriteTargets,
    dominantRootRetentionPlan: macroRefactorShape.dominantRootRetentionPlan || null,
    reuseExistingModules: reuseActive ? siblingReusePlan.existingModules : [],
    siblingReusePlan: reuseActive ? siblingReusePlan : null,
    preserve: {
      className: args.className,
      target: args.target,
      spec: args.spec,
      publicApi: Boolean(args.className),
    },
    firstAction: reuseActive
      ? 'reuse existing runtime sibling modules, create only the residual target module, then replace the facade from this blueprint before broader architecture exploration.'
      : 'create selected target modules and replace the facade from this blueprint before doing broader architecture exploration.',
    proofAfterFirstBatch: ['focused spec', 'scorecard', 'public API audit', 'scope check'],
    facadeDelegationCompactness: reuseActive
      ? {
          mode: 'delegate_public_methods_by_domain_owner',
          rule: 'Each public facade method should be a one-statement delegation to the existing sibling module or residual helper selected by siblingReusePlan.',
          avoid: ['duplicated type aliases in facade', 'inline method bodies in facade', 'private facade helpers', 'per-method dependency bundle rebuilds'],
          expectedFacadeShape: 'imports, constructor, cached delegate accessors only when needed, and 24 one-statement public methods.',
        }
      : {
          mode: 'delegate_public_methods_to_selected_modules',
          rule: 'Facade keeps public signatures and delegates behavior; no retained implementation bodies unless retainedFacadeSymbols explicitly says so.',
          avoid: ['private facade helpers', 'inline implementation bodies'],
          expectedFacadeShape: 'imports, constructor, and one-statement public methods.',
        },
    traceBatching: {
      mode: 'product_batch_unit_trace',
      rule: 'Planning can be method-aware, but writing must be module/facade-batch aware. Use the fewest Atomic write units matching writeTargets plus facade replacement.',
      childEvidence: 'Per-method atomic writes are fallback only after the macro batch fails validation; otherwise they are macro-atomicity debt.',
    },
  };
}

function bestExportForSymbolName(symbolName, exportedRuntimeSymbols = []) {
  const symbolTokens = splitName(symbolName);
  const ranked = exportedRuntimeSymbols
    .filter(Boolean)
    .map((name) => ({
      name,
      score: tokenRelationScore(symbolTokens, splitName(name)),
    }))
    .sort((left, right) => right.score - left.score || left.name.length - right.name.length || left.name.localeCompare(right.name));
  const [best] = ranked;
  return best && best.score > 0 ? best : null;
}

function pascalToken(token) {
  return token ? token[0].toUpperCase() + token.slice(1) : '';
}

function ownerAliasFromFile(ownerFile, targetFile, usedAliases) {
  const ownerBase = path.posix.basename(ownerFile, path.posix.extname(ownerFile)).replace(/[.]+/g, '-');
  const targetBase = path.posix.basename(targetFile || '', path.posix.extname(targetFile || '')).replace(/[.]+/g, '-');
  const ownerTokens = splitName(ownerBase);
  const targetTokens = splitName(targetBase);
  let sharedPrefix = 0;
  while (
    sharedPrefix < ownerTokens.length &&
    sharedPrefix < targetTokens.length &&
    ownerTokens[sharedPrefix] === targetTokens[sharedPrefix]
  ) {
    sharedPrefix += 1;
  }
  const aliasTokens = ownerTokens.slice(sharedPrefix).length > 0 ? ownerTokens.slice(sharedPrefix) : ownerTokens;
  const baseAlias = aliasTokens.map(pascalToken).join('') || 'OwnerModule';
  let alias = baseAlias;
  let suffix = 2;
  while (usedAliases.has(alias)) {
    alias = baseAlias + suffix;
    suffix += 1;
  }
  usedAliases.add(alias);
  return alias;
}

function facadeImportPressurePlan(targetFile, ownerFiles, delegationOwners) {
  const usedAliases = new Set();
  const owners = ownerFiles.map((ownerFile) => {
    const ownerDelegations = delegationOwners.filter((owner) => owner.ownerFile === ownerFile);
    const preferredExports = ownerDelegations.map((owner) => owner.preferredExport).filter(Boolean);
    return {
      file: ownerFile,
      namespaceAlias: ownerAliasFromFile(ownerFile, targetFile, usedAliases),
      delegatedMethodCount: ownerDelegations.length,
      preferredExports,
    };
  });
  const namedBindingCount = owners.reduce(
    (total, owner) => total + (owner.preferredExports.length > 0 ? owner.preferredExports.length : owner.delegatedMethodCount),
    0,
  );
  const namespaceBindingCount = owners.length;
  const bindingReduction = Math.max(0, namedBindingCount - namespaceBindingCount);
  return {
    mode: bindingReduction > 0 ? 'namespace_owner_imports' : 'named_owner_imports',
    decisionAuthority: 'derived from facade owner count and delegated binding count; no fixed line budget is used',
    ownerCount: owners.length,
    namedBindingCount,
    namespaceBindingCount,
    bindingReduction,
    owners,
    rule: bindingReduction > 0
      ? 'Prefer namespace imports per owner module for runtime calls only when public signature types are imported or namespace-qualified from owner modules; never keep or recreate local facade type declarations.'
      : 'Named imports are acceptable because namespace imports do not reduce the observed binding surface.',
  };
}

function facadeDependencyBundleReusePlan(delegationOwners, facadeSurface) {
  const owners = new Map();
  for (const owner of delegationOwners) {
    if (!owner || !owner.ownerFile || owner.ownerKind === 'facade_retained') continue;
    const current = owners.get(owner.ownerFile) || {
      ownerFile: owner.ownerFile,
      methods: [],
      preferredExports: [],
    };
    current.methods.push(owner.method);
    if (owner.preferredExport) current.preferredExports.push(owner.preferredExport);
    owners.set(owner.ownerFile, current);
  }
  const dependencySurfaceCount = facadeSurface && facadeSurface.available
    ? (facadeSurface.constructorParamProperties.length + facadeSurface.privateFields.length)
    : 0;
  const dependencyNames = facadeSurface && facadeSurface.available
    ? [
        ...facadeSurface.constructorParamProperties.map((dependency) => dependency.name),
        ...facadeSurface.privateFields.map((dependency) => dependency.name),
      ].filter(Boolean)
    : [];
  const assignedAfterConstructor = new Set(
    facadeSurface && Array.isArray(facadeSurface.postConstructorAssignedFields)
      ? facadeSurface.postConstructorAssignedFields
      : [],
  );
  const mutableBundleFields = dependencyNames.filter((name) => assignedAfterConstructor.has(name));
  const sharedBundleAccessMode = {
    mode: mutableBundleFields.length === 0 ? 'direct_value_bundle' : 'accessor_bundle',
    mutableBundleFields,
    postConstructorAssignedFields: [...assignedAfterConstructor].sort(),
    decisionAuthority: 'derived from AST assignment scan over this.<field> outside the constructor; direct values are used only when the facade dependencies are not reassigned after construction',
  };
  const accessorSurfacePenalty = sharedBundleAccessMode.mode === 'accessor_bundle' ? mutableBundleFields.length : 0;
  const ownerEntries = [...owners.values()];
  const reusableOwners = ownerEntries
    .filter((owner) => owner.methods.length > 1)
    .map((owner) => ({
      ...owner,
      repeatedDelegationCount: owner.methods.length,
    }));
  const delegatedMethodCount = ownerEntries.reduce((total, owner) => total + owner.methods.length, 0);
  const repeatedMethodCount = reusableOwners.reduce((total, owner) => total + owner.methods.length, 0);
  const ownerFileCount = owners.size;
  const repeatedDirectSurface = reusableOwners.reduce(
    (total, owner) => total + (owner.methods.length * dependencySurfaceCount),
    0,
  );
  const crossOwnerDirectSurface = delegatedMethodCount * dependencySurfaceCount;
  const sameOwnerCachedSurface = dependencySurfaceCount > 0
    ? (dependencySurfaceCount * (reusableOwners.length + ownerFileCount)) + repeatedMethodCount
    : repeatedMethodCount;
  const crossOwnerSharedSurface = dependencySurfaceCount > 0
    ? dependencySurfaceCount + delegatedMethodCount + ownerFileCount + accessorSurfacePenalty
    : delegatedMethodCount + ownerFileCount + accessorSurfacePenalty;
  const sameOwnerBundlePass = reusableOwners.length > 0 && repeatedDirectSurface > sameOwnerCachedSurface;
  const crossOwnerBundlePass = reusableOwners.length === 0 && ownerFileCount > 1 && delegatedMethodCount > 1 && crossOwnerDirectSurface > crossOwnerSharedSurface;
  const cachedBundleSurface = crossOwnerBundlePass ? crossOwnerSharedSurface : sameOwnerCachedSurface;
  const economyPass = sameOwnerBundlePass || crossOwnerBundlePass;
  const reuseCandidates = reusableOwners.map((owner) => ({
    ...owner,
    action: sameOwnerBundlePass
      ? 'build one owner-local dependency bundle or cached delegate for these public methods because measured repeated direct dependency surface is larger than typed bundle surface'
      : 'keep direct per-method dependency objects because measured typed bundle/support surface is not smaller than repeated direct dependency surface',
  }));
  const sharedBundleOwners = crossOwnerBundlePass
    ? ownerEntries.map((owner) => ({
        ownerFile: owner.ownerFile,
        methods: owner.methods,
        preferredExports: owner.preferredExports,
        action: 'consume the shared facade dependency bundle instead of rebuilding the same dependency object per owner method',
      }))
    : [];
  return {
    available: economyPass,
    decisionAuthority: 'derived from owner method delegations, facade dependency surface, owner-file count, and typed bundle surface estimate across owners; no fixed facade line budget or hardcoded owner name',
    dependencyBundleEconomy: {
      dependencySurfaceCount,
      delegatedMethodCount,
      repeatedMethodCount,
      reusableOwnerCount: reusableOwners.length,
      ownerFileCount,
      repeatedDirectSurface,
      crossOwnerDirectSurface,
      sameOwnerCachedSurface,
      crossOwnerSharedSurface,
      accessorSurfacePenalty,
      sharedBundleAccessMode,
      cachedBundleSurface,
      sameOwnerBundlePass,
      crossOwnerBundlePass,
      pass: economyPass,
      interpretation: 'Bundle reuse is an economy win when measured direct dependency repetition exceeds the typed bundle/support surface, whether repetition is inside one owner or across sibling owners.',
    },
    reusableOwners: reuseCandidates,
    sharedBundleOwners,
    sharedBundleAccessMode,
    action: economyPass
      ? (crossOwnerBundlePass
          ? 'Compress repeated facade dependency objects into one shared dependency bundle consumed by sibling owners while preserving constructor shape, public method signatures, and source inventory economy.'
          : 'Compress repeated facade dependency objects per owner while preserving constructor shape, public method signatures, and source inventory economy.')
      : 'Do not materialize cached dependency bundles; direct facade delegation remains lower total inventory until measured repetition outweighs the typed bundle/support surface.',
  };
}


module.exports = {
  directFirstWriteBlueprint,
  bestExportForSymbolName,
  pascalToken,
  ownerAliasFromFile,
  facadeImportPressurePlan,
  facadeDependencyBundleReusePlan,
};
