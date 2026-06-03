# Codemods — Convencoes

Este diretorio contem codemods que modificam codigo fonte em massa.
Por causa do potencial de causar danos sistemicos, ha regras estritas.

## Regra 1 — AST, nao regex

Codemods que mudam sintaxe TypeScript (props de classe, decorators,
tipos, imports) DEVEM usar AST. Ferramentas:

- `ts-morph` (recomendado, instalar com `npm i -D ts-morph`)
- `jscodeshift` com TS parser
- TypeScript Compiler API direto

Regex pode em: comentarios, docstrings, strings literais, hex colors.
Em qualquer coisa que pareca sintaxe estrutural → proibido.

## Regra 2 — `--dry-run` obrigatorio

Todo codemod novo deve aceitar `--dry-run`:

```js
const isDryRun = process.argv.includes('--dry-run');
// ...
if (!isDryRun) {
  await project.save();
} else {
  console.log('[DRY RUN] Would modify N files');
}
```

## Regra 3 — Test fixture obrigatorio

Cada `nome.mjs` deve ter `__tests__/nome.fixtures.ts` com:

- Input antes do codemod
- Output esperado depois do codemod
- Casos negativos (nao deve modificar)

## Regra 4 — Protocolo de execucao

Antes de rodar em massa:

```bash
# 1. Pegar 1 arquivo representativo
TARGET=backend/src/auth/dto/login.dto.ts
cp $TARGET /tmp/$(basename $TARGET).before

# 2. Rodar o codemod NESSE arquivo so
node scripts/codemods/seu-codemod.mjs $TARGET

# 3. Conferir diff
diff /tmp/$(basename $TARGET).before $TARGET

# 4. Compilar
cd backend && npx tsc --noEmit | grep $(basename $TARGET .ts)

# 5. Se OK: rodar no resto. Se quebrou: revert e refazer codemod.
```

## Regra 5 — Nunca commitar fundacao antes do stack completo

Se uma mudanca tem N etapas interdependentes (ex: ligar strict mode +
corrigir 800 erros), **nenhuma etapa vai pra HEAD ate todas passarem**.
Trabalhe em branch isolada. So faca merge quando todos os gates passarem.

## Codemods removidos desta convencao

Os seguintes codemods foram removidos por violarem estas regras:

- `fix-strict-types.mjs` (regex naive, criou padrao `errorInstanceofError`)
- `fix-ts2564.mjs` (regex matched object literals e decorator args)
- `fix-error-narrowing.mjs` (criou padrao `errorInstanceofError`)
- `revert-bad-bang.mjs` (band-aid pra outros codemods quebrados)
- `fix-error-template.mjs` e `fix-error-template2.mjs` (duplicados, abordagem errada)

## Ferramentas aprovadas

Reescrever os codemods acima usando ts-morph e trabalho da Frente 1.
