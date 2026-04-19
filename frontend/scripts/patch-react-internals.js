#!/usr/bin/env node
/**
 * Patches React 19 to re-expose __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
 * for backward compatibility with libraries compiled against React 18 (like Polotno).
 *
 * This runs as a postinstall script after npm install. CommonJS is required because
 * the frontend package is not declared as ESM (no "type": "module" in package.json),
 * and converting to ESM without that flag would break postinstall execution.
 */

async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');

  const reactIndexPath = pathToFileURL(
    path.join(__dirname, '..', 'node_modules', 'react', 'cjs', 'react.production.js'),
  );
  const reactDevPath = pathToFileURL(
    path.join(__dirname, '..', 'node_modules', 'react', 'cjs', 'react.development.js'),
  );
  const reactIndexMain = pathToFileURL(
    path.join(__dirname, '..', 'node_modules', 'react', 'index.js'),
  );

  function patchFile(filePath) {
    if (!fs.existsSync(filePath)) return false;

    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')) {
      console.log(`  Already patched: ${path.basename(filePath.pathname)}`);
      return true;
    }

    const newInternalsName = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE';

    if (!content.includes(newInternalsName)) {
      console.log(`  No internals found to patch: ${path.basename(filePath.pathname)}`);
      return false;
    }

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
    fs.writeFileSync(filePath, content);
    console.log(`  Patched: ${path.basename(filePath.pathname)}`);
    return true;
  }

  console.log('🔧 Patching React 19 for Polotno compatibility...');
  patchFile(reactIndexPath);
  patchFile(reactDevPath);

  if (fs.existsSync(reactIndexMain)) {
    const main = fs.readFileSync(reactIndexMain, 'utf8');
    if (!main.includes('__SECRET_INTERNALS')) {
      console.log('  Main index.js does not need patching (delegates to cjs)');
    }
  }

  console.log('✅ React 19 patched for Polotno compatibility');
}

void main();
