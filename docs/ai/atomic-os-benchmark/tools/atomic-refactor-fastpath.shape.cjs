'use strict';

const path = require('node:path');
const { relPath } = require('./atomic-refactor-fastpath.io.cjs');

function slugFromCommentTitle(title, fallback) {
  const tokens = splitName(String(title || ''));
  return (tokens.length > 0 ? tokens : splitName(fallback || 'section')).join('-') || 'section';
}

function retainedRootInternalCompactionPlan(targetText, rootMember, scopePrefix, targetExt) {
  if (!targetText || !rootMember || !Number.isFinite(rootMember.startOffset) || !Number.isFinite(rootMember.endOffset)) {
    return { available: false, reason: 'retained_root_offsets_unavailable', selectedSections: [] };
  }
  const rootText = targetText.slice(rootMember.startOffset, rootMember.endOffset);
  const lines = rootText.split(/\r?\n/);
  const sectionStarts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const comment = line.match(/^\s*\/\/\s*(\S[\s\S]*)$/);
    if (comment) {
      sectionStarts.push({ index, title: comment[1].trim() });
    }
  }
  if (sectionStarts.length < 2) {
    return { available: false, reason: 'not_enough_comment_sections_in_retained_root', selectedSections: [] };
  }
  const rootTokens = splitName(rootMember.name || 'root');
  const rootSlug = rootTokens.join('-') || 'root';
  const sections = sectionStarts.map((section, position) => {
    const next = sectionStarts[position + 1];
    const startLine = section.index + 1;
    const endLine = next ? next.index : lines.length;
    const observedLines = Math.max(0, endLine - startLine + 1);
    const sectionText = lines.slice(section.index, endLine).join('\n');
    const titleSlug = slugFromCommentTitle(section.title, rootMember.name);
    return {
      title: section.title,
      startLineWithinRoot: startLine,
      endLineWithinRoot: endLine,
      observedLines,
      titleSlug,
      suggestedExportHint: rootSlug + '-' + titleSlug,
      callHints: (rootMember.calls || []).filter((call) => new RegExp('\\b' + escapeRegExp(call) + '\\s*\\(').test(sectionText)),
    };
  }).filter((section) => section.observedLines > 0);
  const averageSectionLines = sections.length > 0
    ? sections.reduce((total, section) => total + section.observedLines, 0) / sections.length
    : 0;
  const selectedSections = sections
    .filter((section) => section.observedLines > averageSectionLines)
    .sort((left, right) => right.observedLines - left.observedLines || left.title.localeCompare(right.title));
  const selectedLineSurface = sumValues(selectedSections, (section) => section.observedLines);
  return {
    available: selectedSections.length > 0,
    reason: selectedSections.length > 0 ? 'retained_root_has_above_average_comment_sections' : 'retained_root_sections_not_above_dynamic_average',
    rootMethod: rootMember.name,
    rootLines: rootMember.lines,
    averageSectionLines: Number(averageSectionLines.toFixed(3)),
    selectedLineSurface,
    sections,
    selectedSections,
    decisionAuthority: 'derived from retained public root comment-section topology and observed section line surface; no fixed section names, line ceilings, or method names',
    action: selectedSections.length > 0
      ? 'extract above-average internal sections from the retained public root into the already-selected helper/runtime owners before comparing facade compactness'
      : 'retain root body as-is because no internal section exceeds the dynamic average surface',
  };
}

function dominantPublicRootRetentionPlan(clusters, scopePrefix, targetExt, targetText = '') {
  const candidates = (Array.isArray(clusters) ? clusters : [])
    .map((cluster) => {
      const members = Array.isArray(cluster.memberDetails) ? cluster.memberDetails : [];
      const rootMember = members.find((member) => member.name === cluster.root) || null;
      const helperMembers = members.filter((member) => member.name !== cluster.root);
      return {
        cluster,
        rootMember,
        helperMembers,
        rootLines: Number(rootMember && rootMember.lines) || Number(cluster.rootLines) || 0,
        helperLines: sumValues(helperMembers, (member) => member.lines),
      };
    })
    .filter((candidate) => candidate.rootMember && candidate.rootMember.isPublicSurface)
    .filter((candidate) => candidate.rootLines > 0)
    .sort((left, right) => right.rootLines - left.rootLines || left.cluster.root.localeCompare(right.cluster.root));
  const dominant = candidates[0] || null;
  if (!dominant) {
    return { available: false, reason: 'no_public_dominant_root', selectedDecompositionTemplate: [] };
  }
  const otherClusters = clusters.filter((cluster) => cluster !== dominant.cluster);
  const helperSymbols = dominant.helperMembers.map((member) => member.name).filter(Boolean);
  const internalCompactionPlan = retainedRootInternalCompactionPlan(targetText, dominant.rootMember, scopePrefix, targetExt);
  const internalCompactionLineSurface = internalCompactionPlan.available ? internalCompactionPlan.selectedLineSurface : 0;
  const helperObservedLines = dominant.helperLines + internalCompactionLineSurface;
  const helperFile = scopePrefix + '-' + dominant.cluster.cluster + '-helpers' + (targetExt || '.ts');
  const helperTemplate = helperSymbols.length > 0 || internalCompactionPlan.available
    ? [{
        file: helperFile,
        responsibility: 'Extract private helper/support surface and selected internal sections for retained public root ' + dominant.cluster.root + ': ' + helperSymbols.join(', '),
        observedLines: helperObservedLines,
        preserveTogether: 'These helpers and internal sections move only because their public root remains in the facade for measured inventory/churn economy.',
        splitWhen: 'Move a helper or section to another owner only when dependency evidence or validation proves that owner consumes it more directly.',
        symbols: helperSymbols,
        internalCompactionSections: internalCompactionPlan.available ? internalCompactionPlan.selectedSections : [],
        internalCompactionPlan,
      }]
    : [];
  const otherTemplates = otherClusters.map((cluster) => ({
    file: cluster.fileHint,
    responsibility: 'Extract dependency-cohesive cluster rooted at ' + cluster.root + ': ' + (cluster.symbols || []).join(', '),
    observedLines: cluster.totalObservedLines,
    symbols: cluster.symbols || [],
    preserveTogether: 'Keep these symbols together unless a validation or scorecard signal proves that one member belongs to another observed dependency root.',
    splitWhen: 'Split only along an observed dependency edge or repeated validation failure, not by a fixed file or line budget.',
  }));
  const selectedDecompositionTemplate = [...otherTemplates, ...helperTemplate];
  const retainedRootLinesAfterInternalCompaction = Math.max(0, dominant.rootLines - internalCompactionLineSurface);
  const extractedLineTotal = sumValues(otherClusters, (cluster) => cluster.totalObservedLines || cluster.rootLines || 0) + helperObservedLines;
  const extractedLargestModuleLines = maxValue(
    [
      ...otherClusters.map((cluster) => ({ lines: cluster.totalObservedLines || cluster.rootLines || 0 })),
      ...helperTemplate.map((entry) => ({ lines: entry.observedLines || 0 })),
    ],
    (entry) => entry.lines,
  );
  return {
    available: selectedDecompositionTemplate.length > 0,
    reason: selectedDecompositionTemplate.length > 0
      ? 'dominant_public_root_retained_while_private_helpers_and_other_roots_extract'
      : 'no_extractable_residual_surface_after_dominant_root_retention',
    dominantRoot: dominant.cluster.root,
    dominantCluster: dominant.cluster.cluster,
    retainedRootLines: dominant.rootLines,
    retainedRootLinesAfterInternalCompaction,
    retainedRootCalls: dominant.rootMember.calls || [],
    helperLines: dominant.helperLines,
    helperObservedLines,
    internalCompactionLineSurface,
    internalCompactionPlan,
    helperSymbols,
    helperFile: helperSymbols.length > 0 || internalCompactionPlan.available ? helperFile : null,
    extractedLineTotal,
    extractedLargestModuleLines,
    productSourceFileCount: selectedDecompositionTemplate.length,
    selectedDecompositionTemplate,
    retainedFacadeRootSymbols: [{
      name: dominant.cluster.root,
      lines: dominant.rootLines,
      calls: dominant.rootMember.calls || [],
      reason: 'dominant_public_root_retained_for_inventory_churn_economy',
      releaseEligible: false,
    }],
    decisionAuthority: 'derived from public-root line surface, helper surface, dependency clusters, and scorecard economy; no fixed root name, file name, line budget, or latency budget',
  };
}


module.exports = {
  slugFromCommentTitle,
  retainedRootInternalCompactionPlan,
  dominantPublicRootRetentionPlan,
};
