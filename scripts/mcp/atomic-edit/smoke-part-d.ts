import { fileURLToPath } from 'node:url';
import {
  addNamedImport, removeNamedImport, replacePropertyValue,
  renamePropertyKey, addAwaitToCall,
} from './advanced.js';
import { check } from './smoke-state.js';

const __filename = fileURLToPath(import.meta.url);

export async function partD(): Promise<void> {
  process.stdout.write('Part D — v3 import + property ops + sha guard\n');

  // add_named_import: create declaration
  {
    const r = await addNamedImport('a.ts', 'const x = 1;\n', './svc', 'AccountService');
    check(
      'add_import creates declaration',
      r.validation.ok && /import \{ AccountService \} from ['"]\.\/svc['"]/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: merge into existing + alias
  {
    const src = "import { A } from './m';\nconst x = 1;\n";
    const r = await addNamedImport('a.ts', src, './m', 'B', 'BB');
    check(
      'add_import merges + alias',
      r.validation.ok && /import \{ A, B as BB \} from/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: merge type-only specifier
  {
    const src = "import { A } from './m';\n";
    const r = await addNamedImport('a.ts', src, './m', 'B', undefined, true);
    check(
      'add_import merges type-only specifier',
      r.validation.ok && /import \{ A, type B \} from/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: idempotent
  {
    const src = "import { A } from './m';\n";
    const r = await addNamedImport('a.ts', src, './m', 'A');
    check('add_import idempotent', r.newText === src, JSON.stringify(r.detail));
  }
  // remove_named_import: last specifier drops declaration
  {
    const src = "import { A } from './m';\nconst x = 1;\n";
    const r = await removeNamedImport('a.ts', src, './m', 'A');
    check(
      'remove_import drops declaration',
      r.validation.ok && !r.newText.includes('import {') && r.newText.includes('const x = 1;'),
      r.newText,
    );
  }
  // remove_named_import: one of several, no dangling comma
  {
    const src = "import { A, B, C } from './m';\n";
    const r = await removeNamedImport('a.ts', src, './m', 'B');
    check(
      'remove_import keeps siblings clean',
      r.validation.ok && /import \{ A, C \} from/.test(r.newText) && !r.newText.includes(',,'),
      r.newText,
    );
  }
  // replace_property_value (thesis example, scoped)
  {
    const src =
      "function build() {\n  const cfg = {\n    phone: '5511999999999',\n    on: true,\n  };\n  return cfg;\n}\n";
    const r = await replacePropertyValue('a.ts', src, 'phone', 'null', 'build');
    check(
      'replace_property_value scoped',
      r.validation.ok && r.newText.includes('phone: null') && r.newText.includes('on: true'),
      r.newText,
    );
  }
  // replace_property_value ambiguity refused
  {
    const src = 'const a = { k: 1 };\nconst b = { k: 2 };\n';
    let threw = false;
    try {
      await replacePropertyValue('a.ts', src, 'k', '9');
    } catch {
      threw = true;
    }
    check('replace_property_value refuses ambiguity', threw);
  }
  // semantic op rejects syntax-breaking value
  {
    const src = 'const o = { a: 1 };\n';
    const r = await replacePropertyValue('a.ts', src, 'a', '{{');
    check(
      'replace_property_value rejects broken value',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }
  // rename_property_key scoped rename preserves value
  {
    const src =
      "function build() {\n  const cfg = {\n    phone: '5511999999999',\n    on: true,\n  };\n  return cfg;\n}\n";
    const r = await renamePropertyKey('a.ts', src, 'phone', 'whatsappPhone', 'build');
    check(
      'rename_property_key scoped preserves value',
      r.validation.ok &&
        r.newText.includes("whatsappPhone: '5511999999999'") &&
        !r.newText.includes('phone:') &&
        r.newText.includes('on: true'),
      r.newText,
    );
  }
  // rename_property_key string-literal key preserves value
  {
    const src = "const o = { 'my-key': 42 };\n";
    const r = await renamePropertyKey('a.ts', src, 'my-key', 'newKey');
    check(
      'rename_property_key string-literal key preserves value',
      r.validation.ok && r.newText.includes('newKey: 42') && !r.newText.includes('my-key'),
      r.newText,
    );
  }
  // rename_property_key ambiguity refused
  {
    const src = 'const a = { k: 1 };\nconst b = { k: 2 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'k', 'key');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses ambiguity', threw);
  }
  // add_await_to_call: helper scoped await preserves args
  {
    const src = [
      'async function build() {',
      '  const ok = fetch("url", { method: "POST" });',
      '  return ok;',
      '}',
      '',
    ].join('\n');
    const r = await addAwaitToCall('a.ts', src, 'fetch', 'build');
    check(
      'add_await_to_call scoped preserves args',
      r.validation.ok &&
        r.newText.includes('await fetch("url", { method: "POST" })') &&
        r.newText.includes('async function build'),
      r.newText,
    );
    check(
      'add_await_to_call detail contains callText',
      (r.detail as { callText?: string }).callText === 'fetch("url", { method: "POST" })',
      JSON.stringify(r.detail),
    );
  }
  // add_await_to_call: missing callee refused
  {
    let threw = false;
    try {
      await addAwaitToCall('a.ts', 'async function f() { fn(); }\n', 'missing');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses missing callee', threw);
  }
  // add_await_to_call: ambiguity refused
  {
    const src = 'async function a() { fn(); }\nasync function b() { fn(); }\n';
    let threw = false;
    try {
      await addAwaitToCall('a.ts', src, 'fn');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses ambiguity', threw);
  }
  // add_await_to_call: ambiguity resolved by selector
  {
    const src = 'async function a() { fn(1); }\nasync function b() { fn(2); }\n';
    const r = await addAwaitToCall('a.ts', src, 'fn', 'a');
    check(
      'add_await_to_call selector resolves ambiguity',
      r.validation.ok && r.newText.includes('await fn(1)') && !r.newText.includes('await fn(2)'),
      r.newText,
    );
  }
  // add_await_to_call: already-awaited call refused
  {
    const src = 'async function f() { await fn(); }\n';
    let threw = false;
    try {
      await addAwaitToCall('a.ts', src, 'fn');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses already-awaited', threw);
  }
  // add_await_to_call: non-async context refused
  {
    const src = 'function f() { ok(); }\n';
    let threw = false;
    try {
      await addAwaitToCall('a.ts', src, 'ok', 'f');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses non-async context', threw);
  }
  // add_await_to_call: valid async wrap syntax-checked
  {
    const src = 'async function f() { ok(); }\n';
    const r = await addAwaitToCall('a.ts', src, 'ok', 'f');
    check(
      'add_await_to_call accepts valid async wrap',
      r.validation.ok && r.newText.includes('await ok()'),
      r.newText,
    );
  }
  // rename_property_key missing property refused
  {
    const src = 'const o = { a: 1 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'missing', 'newKey');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses missing property', threw);
  }
  // rename_property_key invalid identifier refused
  {
    const src = 'const o = { a: 1 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'a', '1invalid');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses invalid new key', threw);
  }
  // rename_property_key keyword refused by identifier guard
  {
    const src = 'const o = { a: 1 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'a', 'for');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses keyword new key', threw);
  }
}
