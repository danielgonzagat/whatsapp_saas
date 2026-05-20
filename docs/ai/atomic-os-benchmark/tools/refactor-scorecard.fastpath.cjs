'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runGit, lineCount } = require('./refactor-scorecard.io.cjs');


function readFastpathPolicy(policyPath) {
  if (!policyPath) return { available: false, reason: 'policy_not_configured', debt: false, pass: true };
  if (!fs.existsSync(policyPath)) {
    return { available: false, reason: 'policy_file_not_found', policyPath, debt: true, pass: false };
  }
  try {
    return { available: true, policyPath, data: JSON.parse(fs.readFileSync(policyPath, 'utf8')) };
  } catch (error) {
    return {
      available: false,
      reason: 'policy_json_invalid',
      policyPath,
      error: error instanceof Error ? error.message : String(error),
      debt: true,
      pass: false,
    };
  }
}

function fastpathMacroPolicy(policy) {
  const data = policy && policy.data ? policy.data : {};
  const macroShape = data.macroRefactorShape || {};
  const direct = data.directFirstWriteBlueprint || {};
  const plan =
    macroShape.dominantRootRetentionPlan ||
    data.dominantRootRetentionPlan ||
    direct.dominantRootRetentionPlan ||
    null;
  return {
    preferredShape: macroShape.preferredShape || data.preferredShape || direct.selectedShape || null,
    dominantRootRetentionPlan: plan,
  };
}

function firstClassNode(ts, source) {
  let found = null;
  function visit(node) {
    if (!found && ts.isClassDeclaration(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function classMethodSurface(ts, source, className, methodName) {
  const classNode = className ? findNamedClass(ts, source, className) : firstClassNode(ts, source);
  if (!classNode) return { found: false, reason: className ? 'class_not_found' : 'class_not_detected' };
  const method = classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .find((member) => memberName(ts, source, member) === methodName);
  if (!method) return { found: false, reason: 'method_not_found', className: classNode.name ? classNode.name.text : null, methodName };
  const startLine = source.getLineAndCharacterOfPosition(method.getStart(source)).line + 1;
  const endLine = source.getLineAndCharacterOfPosition(method.getEnd()).line + 1;
  const isPrivate = hasModifier(ts, method, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]);
  return {
    found: true,
    className: classNode.name ? classNode.name.text : null,
    methodName,
    visibility: isPrivate ? 'private_or_protected' : 'public',
    startLine,
    endLine,
    lines: endLine - startLine + 1,
  };
}

function dominantRootNameFromPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (typeof plan.dominantRoot === 'string' && plan.dominantRoot) return plan.dominantRoot;
  if (typeof plan.rootMethod === 'string' && plan.rootMethod) return plan.rootMethod;
  const retained = Array.isArray(plan.retainedFacadeRootSymbols) ? plan.retainedFacadeRootSymbols : [];
  const [first] = retained.filter((entry) => entry && typeof entry.name === 'string' && entry.name);
  return first ? first.name : null;
}

function dynamicRetainedRootLineFloor(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const direct = Number(plan.retainedRootLinesAfterInternalCompaction);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const retained = Number(plan.retainedRootLines);
  const compacted = Number(plan.internalCompactionLineSurface);
  if (Number.isFinite(retained) && retained > 0 && Number.isFinite(compacted) && compacted >= 0) {
    return Math.max(0, retained - compacted);
  }
  return null;
}

function fastpathPolicyAdherence(worktree, target, className, policyPath) {
  const policy = readFastpathPolicy(policyPath);
  if (!policy.available) return policy;
  const macroPolicy = fastpathMacroPolicy(policy);
  if (macroPolicy.preferredShape !== 'dominant_public_root_retention') {
    return {
      available: true,
      relevant: false,
      policyPath: policy.policyPath,
      preferredShape: macroPolicy.preferredShape,
      debt: false,
      pass: true,
      decisionAuthority: 'policy preferred shape is not dominant_public_root_retention, so no retained-root adherence check applies',
    };
  }
  const plan = macroPolicy.dominantRootRetentionPlan;
  const dominantRoot = dominantRootNameFromPlan(plan);
  const retainedRootLineFloor = dynamicRetainedRootLineFloor(plan);
  if (!dominantRoot || retainedRootLineFloor === null) {
    return {
      available: true,
      relevant: true,
      policyPath: policy.policyPath,
      preferredShape: macroPolicy.preferredShape,
      dominantRoot,
      retainedRootLineFloor,
      debt: true,
      pass: false,
      reason: 'dominant_root_policy_incomplete',
    };
  }
  const ts = loadTypeScript(worktree);
  if (!ts) return { available: false, reason: 'typescript_unavailable', policyPath: policy.policyPath, debt: true, pass: false };
  const absTarget = path.join(worktree, target);
  const text = fs.readFileSync(absTarget, 'utf8');
  const source = ts.createSourceFile(absTarget, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const targetMethod = classMethodSurface(ts, source, className, dominantRoot);
  const retainedRootPresent = targetMethod.found && targetMethod.visibility === 'public';
  const retainedRootLinePass = retainedRootPresent && targetMethod.lines >= retainedRootLineFloor;
  const debt = !retainedRootLinePass;
  return {
    available: true,
    relevant: true,
    policyPath: policy.policyPath,
    preferredShape: macroPolicy.preferredShape,
    dominantRoot,
    retainedRootLineFloor,
    targetMethod,
    retainedRootPresent,
    retainedRootLinePass,
    debt,
    pass: !debt,
    decisionAuthority: 'derived from the current fast-path policy JSON and final target AST; no fixed method name, file name, latency budget, or line threshold is embedded in the scorecard',
    interpretation: debt
      ? 'The planner selected retained dominant public root topology, but the final facade did not keep that root with the dynamically derived retained line surface.'
      : 'The final facade follows the retained dominant public root topology selected by the fast-path policy.',
  };
}


module.exports = {
  readFastpathPolicy,
  fastpathMacroPolicy,
  firstClassNode,
  classMethodSurface,
  dominantRootNameFromPlan,
  dynamicRetainedRootLineFloor,
  fastpathPolicyAdherence,
};
