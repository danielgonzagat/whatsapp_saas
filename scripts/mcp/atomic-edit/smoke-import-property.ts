import { addNamedImport, removeNamedImport, replacePropertyValue } from './advanced.js';
export async function partD(check: (name: string, cond: boolean, detail?: string) => void): Promise<void> {
  process.stdout.write("Part D — v3 import + property ops + sha guard\n");
  // add_named_import: create declaration
  {
    const r = await addNamedImport("a.ts", "const x = 1;\n", "./svc", "AccountService");
    check(
      "add_import creates declaration",
      r.validation.ok && /import \{ AccountService \} from ['"]\.\/svc['"]/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: merge into existing + alias
  {
    const src = "import { A } from './m';\nconst x = 1;\n";
    const r = await addNamedImport("a.ts", src, "./m", "B", "BB");
    check(
      "add_import merges + alias",
      r.validation.ok && /import \{ A, B as BB \} from/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: idempotent
  {
    const src = "import { A } from './m';\n";
    const r = await addNamedImport("a.ts", src, "./m", "A");
    check("add_import idempotent", r.newText === src, JSON.stringify(r.detail));
  }
  // remove_named_import: last specifier drops declaration
  {
    const src = "import { A } from './m';\nconst x = 1;\n";
    const r = await removeNamedImport("a.ts", src, "./m", "A");
    check(
      "remove_import drops declaration",
      r.validation.ok && !r.newText.includes("import {") && r.newText.includes("const x = 1;"),
      r.newText,
    );
  }
  // remove_named_import: one of several, no dangling comma
  {
    const src = "import { A, B, C } from './m';\n";
    const r = await removeNamedImport("a.ts", src, "./m", "B");
    check(
      "remove_import keeps siblings clean",
      r.validation.ok && /import \{ A, C \} from/.test(r.newText) && !r.newText.includes(",,"),
      r.newText,
    );
  }
  // replace_property_value (thesis example, scoped)
  {
    const src =
      "function build() {\n  const cfg = {\n    phone: '5511999999999',\n    on: true,\n  };\n  return cfg;\n}\n";
    const r = await replacePropertyValue("a.ts", src, "phone", "null", "build");
    check(
      "replace_property_value scoped",
      r.validation.ok && r.newText.includes("phone: null") && r.newText.includes("on: true"),
      r.newText,
    );
  }
  // replace_property_value ambiguity refused
  {
    const src = "const a = { k: 1 };\nconst b = { k: 2 };\n";
    let threw = false;
    try {
      await replacePropertyValue("a.ts", src, "k", "9");
    } catch {
      threw = true;
    }
    check("replace_property_value refuses ambiguity", threw);
  }
  // semantic op rejects syntax-breaking value
  {
    const src = "const o = { a: 1 };\n";
    const r = await replacePropertyValue("a.ts", src, "a", "{{");
    check("replace_property_value rejects broken value", r.validation.ok === false, JSON.stringify(r.validation));
  }
}
