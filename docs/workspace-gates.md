# Workspace GitHub-Gates Mirror

Espelho local de TODOS os gates do CI, em modo HARD-BLOCK no tempo de tool-call.
Aplica-se a TODA IA CLI (Claude Code, Codex, OpenCode) e a humanos via pre-commit.
Intransponível por design.

Ativo desde 2026-05-04. Localização das regras canônicas:

- Lib de regras: `scripts/decomp/lib/gate-rules.mjs`
- Hook PreToolUse Write/Edit/MultiEdit: `scripts/decomp/preflight-write-gate.mjs`
- Hook PreToolUse Bash: `scripts/decomp/preflight-bash-gate.mjs`
- Adapter Codex apply_patch: `scripts/decomp/adapters/apply-patch-gate.mjs`
- Pre-commit backstop: `scripts/decomp/validate-staged.mjs`
- Wiring Claude Code: `.claude/settings.json`
- Wiring Codex: `.codex/hooks.json`
- Wiring OpenCode: `.opencode/plugin/workspace-gates.ts`
- Wiring git: `.husky/pre-commit`
- Ferramenta sancionada para split: `scripts/decomp/safe-decompose.mjs`

## Cobertura por CLI

| Operação             | Claude Code |                Codex                 |     OpenCode      | Outros / Humano |
| -------------------- | :---------: | :----------------------------------: | :---------------: | :-------------: |
| Write/Edit/MultiEdit | ✅ Layer 1  | ✅ Layer 1 (apply_patch via adapter) | ✅ Layer 1 plugin |  ⚠️ Layer 3+5   |
| Bash                 | ✅ Layer 1  |              ✅ Layer 1              | ✅ Layer 1 plugin |  ⚠️ Layer 3+5   |
| `git commit`         | ✅ Layer 3  |              ✅ Layer 3              |    ✅ Layer 3     |   ✅ Layer 3    |
| `git push`           | ✅ Layer 4  |              ✅ Layer 4              |    ✅ Layer 4     |   ✅ Layer 4    |
| GitHub CI            | ✅ Layer 5  |              ✅ Layer 5              |    ✅ Layer 5     |   ✅ Layer 5    |

Para Codex: hooks system documentado tem cobertura completa para Bash e
parcial para apply_patch. Adapter próprio resolve a parte de apply_patch
(parse de unified diff → checa paths/tokens/line-limit por arquivo).

Para OpenCode: plugin TS via `tool.execute.before` traduz para o shape
Claude e pipeia para os mesmos hooks do Claude Code — single source of truth.

## Por que existe

IAs CLI gastavam tokens construindo código rejeitado pelo CI, e mais tokens
consertando. Pior: tentativas de "decomposição" deletavam tecnologia (audit
detectou 104 exports perdidos em PR198 nos commits do padrão `__companions__/`).
Solução: o workspace BLOQUEIA antes da escrita.

## Camadas de defesa

```
Layer 1 — PreToolUse hooks
   Write|Edit|MultiEdit → preflight-write-gate
   Bash                  → preflight-bash-gate
Layer 2 — PostToolUse (auto-format/typecheck)
Layer 3 — Pre-commit (validate-staged + lint-staged)
Layer 4 — Pre-push
Layer 5 — GitHub CI (architecture, codeql, codacy, semgrep, visual)
```

Para passar do workspace pro CI, a operação precisa estar limpa nos 5.

## Regras enforced localmente

| Regra                | Detalhe                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Line-limit           | 400 em arquivo novo, 600 em modificado. Excedeu → block, exige `safe-decompose`           |
| Forbidden tokens     | Bypasses de lint/type/codacy/sonar nunca permitidos em fonte. Lista em `FORBIDDEN_TOKENS` |
| Tipo `: any`         | Proibido em código novo (comentários permitidos)                                          |
| `__companions__/`    | Padrão banido (regrediu tecnologia em PR198). Use `__parts__/`                            |
| PROTECTED_FILES      | CLAUDE.md, configs de lint, ai-models.ts, etc. — IA nunca edita                           |
| SELF_IMMUTABLE_FILES | Hooks, settings, pre-commit — não editáveis nem por mim                                   |
| Bash perigoso        | Comandos que destruiriam fontes ou desligariam gates → block                              |

## Quando o hook bloqueia

| Block                    | Ação                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| line-limit               | Planeje decomposição em parts, crie plan.json, use safe-decompose                            |
| forbidden-token          | Corrija a causa raiz. Para mocks: `Partial<T>`, `jest.MockedFunction<T>`, `DeepMockProxy<T>` |
| forbidden-directory      | Substitua `__companions__/` por `__parts__/`                                                 |
| protected/self-immutable | Pare. Apenas Daniel pode editar                                                              |

## safe-decompose — uso

```
node scripts/decomp/safe-decompose.mjs --file <path> --plan <plan.json>
```

plan.json:

```
{ "parts": { "<partName>.ts": ["exportA", "exportB"], ... } }
```

Garantias:

- Snapshot do arquivo em `.audit/safe-decompose/`
- Plano deve cobrir 100% dos exports — falha se faltar
- Verifica parts (line-limit + tokens) e cross-check de exports preservados
- Em falha → rollback automático
- Em sucesso → backup preservado para auditoria

## Self-immutability (anti-burla)

Para que as regras sejam INTRANSPONÍVEIS, os arquivos de regra não podem
ser editáveis pela IA que opera sob elas. Caso contrário, a IA editaria a
regra para relaxar, faria o que queria, restauraria — burla clássica.

Defesa: lista `SELF_IMMUTABLE_FILES` declara os próprios arquivos de
governance como intocáveis. Hook bloqueia toda tentativa de Write, Edit,
MultiEdit, OU shell-redirect a esses paths. Resultado: qualquer IA está
PRESA nas regras atuais. Mudança = humano edita manualmente.

## Como Daniel evolui as regras

1. Edita manualmente os arquivos auto-imutáveis
2. Sanity check: `node scripts/decomp/validate-staged.mjs` em working tree limpa
3. Mantenha sincronia com `scripts/ops/check-architecture-guardrails.mjs`
4. Documente aqui
5. Commit + push

## Smoke test

```
node -e "import('./scripts/decomp/lib/gate-rules.mjs').then(m => console.log(m.evaluateContent({ relPath: 'test.ts', content: 'const x: any = 1;', isNewFile: true })))"
```

Esperado: violação `forbidden-token:any-type`.
