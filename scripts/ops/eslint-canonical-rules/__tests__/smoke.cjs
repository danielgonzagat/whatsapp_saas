'use strict';

/**
 * Smoke test for the canonical-enforcement ESLint plugin.
 * Runs each rule against inline source strings using ESLint's Linter API
 * (flat-config mode, ESLint >= 9). Prints pass/fail and exits non-zero on failure.
 */

var path = require('path');

var repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
var { Linter } = require(path.join(repoRoot, 'backend', 'node_modules', 'eslint'));

var plugin = require('../index.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var linter = new Linter({ configType: 'flat' });

// Node 25+ does not resolve `exports.default` for require() on this package;
// load the parser via its concrete file path instead of bare module spec.
var parserMod = require(path.join(
  repoRoot, 'backend', 'node_modules', '@typescript-eslint', 'parser', 'dist', 'index.js',
));

/**
 * Build a flat config for a single rule.
 * In ESLint 9 flat-config Linter, plugins are objects whose keys expose
 * { rules: { ... } } and rules reference them by "pluginKey/ruleName".
 */
function flatConfigForRule(pluginKey, ruleName, ruleDef, filename) {
  var plugins = {};
  plugins[pluginKey] = { rules: {} };
  plugins[pluginKey].rules[ruleName] = ruleDef;

  return {
    files: [filename || '**/*.ts'],
    languageOptions: {
      parser: parserMod,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    plugins: plugins,
    rules: {},
  };
}

function check(desc, config, code, filename, expectedMsgCount) {
  var messages = linter.verify(code, config, filename || 'test.ts');
  var ok = messages.length === expectedMsgCount;
  if (ok) {
    console.log('  PASS  ' + desc);
  } else {
    console.log('  FAIL  ' + desc);
    console.log('        expected ' + expectedMsgCount + ' message(s), got ' + messages.length);
    for (var i = 0; i < messages.length; i++) {
      console.log('        -> line ' + messages[i].line + ': ' + messages[i].message + ' [' + messages[i].ruleId + ']');
    }
  }
  return ok;
}

// ---------------------------------------------------------------------------
// no-rogue-unknown-record
// ---------------------------------------------------------------------------

function testUnknownRecord() {
  var pass = true;
  var cfg = flatConfigForRule('canonical', 'no-rogue-unknown-record', plugin.rules['no-rogue-unknown-record']);
  cfg.rules['canonical/no-rogue-unknown-record'] = 'error';

  // OK: canonical file itself should be exempt
  pass = check(
    'canonical declaration exempt',
    cfg,
    'export type UnknownRecord = Record<string, unknown>;\n',
    'backend/src/common/types.ts',
    0
  ) && pass;

  // VIOLATION: a rogue alias elsewhere
  pass = check(
    'rogue alias flagged',
    cfg,
    'type Foo = Record<string, unknown>;\n',
    'backend/src/some-module/rogue.ts',
    1
  ) && pass;

  // OK: different Record (not string + unknown) should be fine
  pass = check(
    'non-matching Record allowed',
    cfg,
    'type Bar = Record<string, number>;\n',
    'backend/src/some-module/ok.ts',
    0
  ) && pass;

  return pass;
}

// ---------------------------------------------------------------------------
// no-rogue-phone-normalizer
// ---------------------------------------------------------------------------

function testPhoneNormalizer() {
  var pass = true;
  var cfg = flatConfigForRule('canonical', 'no-rogue-phone-normalizer', plugin.rules['no-rogue-phone-normalizer']);
  cfg.rules['canonical/no-rogue-phone-normalizer'] = 'error';

  // OK: canonical file exempt
  pass = check(
    'canonical file exempt',
    cfg,
    'export function digitsOnly(v) { return v; }\n',
    'backend/src/common/phone.ts',
    0
  ) && pass;

  // VIOLATION: digitsOnly outside canonical
  pass = check(
    'rogue digitsOnly flagged',
    cfg,
    'export function digitsOnly(v) { return v.replace(/\\D/g, ""); }\n',
    'backend/src/some-module/rogue.ts',
    1
  ) && pass;

  // VIOLATION: whatsappDigits outside canonical
  pass = check(
    'rogue whatsappDigits flagged',
    cfg,
    'export function whatsappDigits(v) { return v; }\n',
    'backend/src/another/rogue.ts',
    1
  ) && pass;

  // OK: unrelated function
  pass = check(
    'unrelated function allowed',
    cfg,
    'export function formatPhone(v) { return v; }\n',
    'backend/src/some-module/ok.ts',
    0
  ) && pass;

  return pass;
}

// ---------------------------------------------------------------------------
// no-rogue-clamp
// ---------------------------------------------------------------------------

function testClamp() {
  var pass = true;
  var cfg = flatConfigForRule('canonical', 'no-rogue-clamp', plugin.rules['no-rogue-clamp']);
  cfg.rules['canonical/no-rogue-clamp'] = 'error';

  // OK: canonical file exempt
  pass = check(
    'canonical file exempt',
    cfg,
    'export function clamp(value, min, max) { return value; }\n',
    'backend/src/common/math.ts',
    0
  ) && pass;

  // VIOLATION: clamp outside canonical
  pass = check(
    'rogue clamp flagged',
    cfg,
    'export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }\n',
    'backend/src/some-module/rogue.ts',
    1
  ) && pass;

  // VIOLATION: clampScore outside canonical
  pass = check(
    'rogue clampScore flagged',
    cfg,
    'export function clampScore(value) { return Math.max(0, Math.min(1, value)); }\n',
    'backend/src/another/rogue.ts',
    1
  ) && pass;

  // OK: daysSince is NOT in the forbidden set
  pass = check(
    'daysSince allowed (not in forbidden set)',
    cfg,
    'export function daysSince(iso, nowMs) { return 0; }\n',
    'backend/src/some-module/ok.ts',
    0
  ) && pass;

  return pass;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

var total = 0;
var failed = 0;

var suites = [
  ['no-rogue-unknown-record', testUnknownRecord],
  ['no-rogue-phone-normalizer', testPhoneNormalizer],
  ['no-rogue-clamp', testClamp],
];

for (var i = 0; i < suites.length; i++) {
  console.log('\n' + suites[i][0] + ':');
  var ok = suites[i][1]();
  total++;
  if (!ok) failed++;
}

console.log('\n' + (total - failed) + '/' + total + ' rule suites passed.');

if (failed > 0) {
  console.log('SMOKE TEST FAILED');
  process.exit(1);
}

console.log('SMOKE TEST PASSED');
process.exit(0);
