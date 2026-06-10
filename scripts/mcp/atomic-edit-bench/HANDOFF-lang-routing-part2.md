# HANDOFF — lang-routing Parte 2 (candidato pronto-para-promover)

**Para o próximo agente com lattice estável** (sessão codex/genesis — o lattice desta
sessão roda sob sandbox aninhado e 2 gates flutuam: `atomic-exec-readonly-usability`
falha com `sandbox-exec: sandbox_apply: Operation not permitted` ao aninhar, e
`compiled-mcp-y-certificate` estourava timeout sob carga embora rode em 1s isolado).

## Estado

- **Parte 1 PROMOVIDA e commitada**: `scripts/mcp/atomic-edit/lang-validate-wasm.mjs`
  (receipt `b6fab215a7e5d02e2aa9d3076e60c0df856fc711a68343b5dd3f3efa2363c325`) — juiz
  in-node das gramáticas wasm vendored css/sql/html. Calibrado: sql distingue
  `SELECT`/`SELEC` e aceita comentário `--`; css flagra chave aberta; html flagra
  atributo rasgado.
- **Parte 2 = 1 create + 5 replace_text em lang-bridge.ts**, rejeitada 3× SOMENTE
  pelos 2 gates ambientais acima (type-soundness, algebra e os demais 38 PASSARAM
  na última tentativa). Payload exato abaixo.
- Evidência do defeito: `docs/evidence/atomic-evidence-dossier-2026-06-09.md` §3
  (87% falso-negativo SQL; css truncado pela metade admitido; 40/40 benignos SQL
  recusados; latência 180-290ms de pseudo-erros JS) + witness
  `scripts/mcp/atomic-edit-bench/lang-misrouting.repro.mjs` (3/3 defectPresent).

## Payload da transação (atomic_expand_self)

Âncora: `lang-bridge.ts` sha256
`f9ba4c9713c21cec55ab39c18291ab80ad43d4cbc064b7e5d683c12d4545d34c` (se divergir,
re-verificar os oldText abaixo — são únicos no arquivo).

1. **create `scripts/mcp/atomic-edit/gates/lang-routing-real-grammar.proof.mjs`** —
   regression-proof com 10 asserts (RED 5/10 pré-conserto: sql-benign-comment-admitted,
   sql-broken-refused, sql-unbalanced-refused, css-unbalanced-refused,
   html-broken-refused falham; ts/json não-regressão passam). Fonte completa na
   última chamada `atomic_expand_self` do transcript da sessão f4e02fe0 (2026-06-10)
   — ou reconstruir: importa `../dist/engine.js`, valida os pares probe.sql/css/html/ts/json
   listados no dossiê §3, exit 1 em assert quebrado.

2. **replace_text em lang-bridge.ts** (ORDEM IMPORTA — declaração antes do uso, o
   lattice recusa invertido com TS2304):
   - a) Em `validateTreeSitter` (bloco que inicia com o guard
     `if (!ts3Available()) return { errorCount: -1 };`): inserir ANTES da função as
     consts `WASM_TS_LANGS = new Set(['css','sql','html'])` e `WASM_VALIDATE_SCRIPT`
     (path.join(dirname(dirname(import.meta.url.pathname)), 'lang-validate-wasm.mjs'))
     + função `validateWasmGrammar` (spawnSync node [WASM_VALIDATE_SCRIPT, absPath, lang],
     timeout 15000, contrato {errors,firstError}/{skipped}); na função, derivar `lang`
     PRIMEIRO, rotear `WASM_TS_LANGS.has(lang)` → `validateWasmGrammar`, e só então
     gatear `ts3Available()` para o bridge python.
   - b) Em `tryTreeSitterValidation`: mover o guard `ts3Available()` para DEPOIS de
     derivar lang, condicionado a `!WASM_TS_LANGS.has(lang)`.
   - c) Tabela `EXT_TO_TS_LANG_PRE` (linha ~189): `'.css': 'css'`, `'.sql': 'sql'`,
     adicionar `'.html': 'html'`; manter `'.scss'/'.less': 'javascript'` (gramática
     css pura marcaria nesting SCSS válido como erro).
   - d) Set `TREE_SITTER_FALLBACK_EXTS`: adicionar `'.html'`.
   - e) Tabela `EXT_TO_TS_LANG` (linha ~298): idem (c); os comentários
     "catches brace errors" morrem com o mapeamento (descrevem comportamento
     factualmente falso — falso-verde provado).

3. **proofCommands**: `["node gates/lang-routing-real-grammar.proof.mjs --json"]`.

## Critério de aceite

`node gates/lang-routing-real-grammar.proof.mjs --json` → passed 10/10; o witness
`lang-misrouting.repro.mjs` imprime `defectPresent:false` nos 3 casos e vira
regression-companion. Ganhos: mata 87% FN SQL + falso-verde CSS + 40/40 FP benigno
SQL, e ~180× de latência nas gramáticas afetadas (181-290ms → ~1-2ms).

— sessão f4e02fe0, 2026-06-10. Corpus de disprovas já contém as paredes das 3
tentativas (briefing aponta para esta região).
