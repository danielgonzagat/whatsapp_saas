#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Patches React 19 to re-expose __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
 * for backward compatibility with libraries compiled against React 18 (like Polotno).
 *
 * This runs as a postinstall script after npm install.
 */

const fs = require('node:fs');
const path = require('node:path');

const reactIndexPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react',
  'cjs',
  'react.production.js',
);
const reactDevPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react',
  'cjs',
  'react.development.js',
);
const reactIndexMain = path.join(__dirname, '..', 'node_modules', 'react', 'index.js');

function patchFile(filePath) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: filePath is path.join(__dirname, '..', 'node_modules', 'react', ...) — derived from this script's own directory, no user input. This is an npm postinstall script.
  if (!fs.existsSync(filePath)) return false;

  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: filePath is path.join(__dirname, '..', 'node_modules', 'react', ...) — derived from this script's own directory, no user input.
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already patched
  if (content.includes('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')) {
    console.log(`  Already patched: ${path.basename(filePath)}`);
    return true;
  }

  // Find the new internals name
  const newInternalsName = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE';

  if (!content.includes(newInternalsName)) {
    console.log(`  No internals found to patch: ${path.basename(filePath)}`);
    return false;
  }

  // Add alias at the end of the file, before the last closing
  const patchCode = `

// === POLOTNO COMPAT PATCH (React 18 internals shim) ===
if (typeof exports !== 'undefined' && exports.${newInternalsName} && !exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
  exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
    ReactCurrentOwner: { current: null },
    ReactCurrentBatchConfig: { transition: null },
    ReactCurrentDispatcher: { current: null },
    ...exports.${newInternalsName}
  };
}
// === END POLOTNO COMPAT PATCH ===
`;

  content += patchCode;
  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: filePath is path.join(__dirname, '..', 'node_modules', 'react', ...) — derived from this script's own directory, no user input.
  fs.writeFileSync(filePath, content);
  console.log(`  Patched: ${path.basename(filePath)}`);
  return true;
}

console.log('🔧 Patching React 19 for Polotno compatibility...');
patchFile(reactIndexPath);
patchFile(reactDevPath);

// Also patch the main index.js if it's a re-export
// nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
// Safe: reactIndexMain = path.join(__dirname, '..', 'node_modules', 'react', 'index.js') — derived from this script's own directory, no user input.
if (fs.existsSync(reactIndexMain)) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: reactIndexMain is path.join(__dirname, '..', 'node_modules', 'react', 'index.js') — derived from this script's own directory, no user input.
  let main = fs.readFileSync(reactIndexMain, 'utf8');
  if (!main.includes('__SECRET_INTERNALS')) {
    // The main index.js usually just re-exports from cjs/
    // The patch in the cjs files should be sufficient
    console.log('  Main index.js does not need patching (delegates to cjs)');
  }
}

console.log('✅ React 19 patched for Polotno compatibility');
