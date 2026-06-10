# atomic-swarm — servidor MCP irmão do atomic-edit

Superfície de paridade-TUI **com prova**: cada capacidade que a TUI nativa tem de graça
(web fetch, busca, skills, fan-out paralelo, locks, tarefas) existe aqui na forma
governada — toda ação deixa um **receipt com sha256 dos bytes exatos** e uma entrada em
**ledger append-only** sob `<repo>/.atomic/`. O que a TUI faz sem verificação, a swarm
faz com evidência reproduzível ou recusa.

## Doutrina fail-closed

- **Recusa explícita, nunca degradação silenciosa.** Toda violação de política lança
  `refusal(...)` com a razão exata (ver `swarm-core.mjs`); nenhum caminho "tenta mesmo assim".
- **Sem credenciais.** `swarm_fetch` recusa userinfo na URL e headers
  `Authorization`/`Cookie`/`Proxy-Authorization` — nunca os descarta em silêncio. Valores de
  env que parecem segredo (`TOKEN|SECRET|KEY|...`) são redigidos de toda superfície retornada/persistida.
- **Broker obrigatório para shell.** `swarm_exec_batch` e a aceitação de tarefas delegam ao
  MESMO broker fora-do-sandbox que serve `atomic_exec` (sandbox deny-by-default por comando,
  sem writes, sem rede). Broker inalcançável ⇒ recusa; a swarm **nunca** faz spawn sem sandbox.
- **Drift = veneno.** Skill cujo hash divergiu do manifesto registrado é recusada com o
  delta por arquivo, não servida com aviso.

## Tools

| Tool | O que faz | Ledger |
|---|---|---|
| `swarm_fetch` | GET/HEAD http(s) read-only, corpo capado (2 MiB padrão / 8 MiB máx), binário vira base64 | `swarm-fetch-ledger.jsonl` |
| `swarm_web_search` | Busca DuckDuckGo HTML (sem chave); receipt carrega sha256 da página crua; parse falho ⇒ `ok:false`, nunca fabrica | `swarm-search-ledger.jsonl` |
| `swarm_skill_register` | Hasheia cada arquivo da árvore da skill + merkle root; grava manifesto em `.atomic/skills/<nome>.manifest.json` | `swarm-skills-ledger.jsonl` |
| `swarm_skill_load` | Re-verifica TODOS os hashes e só então serve o arquivo (padrão `SKILL.md`); drift ⇒ recusa | `swarm-skills-ledger.jsonl` |
| `swarm_skill_list` | Lista manifestos com veredito de verificação ao vivo (read-only) | — |
| `swarm_skill_verify` | Re-hasheia uma skill e reporta drift exato (changed/missing/added), sem servir conteúdo | — |
| `swarm_exec_batch` | Até 64 jobs shell read-only em paralelo (8 workers padrão, máx 16), cada um via broker; receipt por job | `swarm-batch-ledger.jsonl` |
| `swarm_status` | Raiz do repo, alcançabilidade do broker, ledgers e contagem de skills (read-only) | — |
| `swarm_lock_*` (acquire/heartbeat/status/steal/release) | Locks com lease TTL + heartbeat sobre `.atomic-edit-locks/`; steal SÓ de lock provadamente expirado | `swarm-locks-ledger.jsonl` |
| `swarm_task_*` (create/list/update) | Tarefas persistentes (`.atomic/swarm-tasks.json`); `acceptanceCommand` exige exit 0 via broker para concluir | `swarm-tasks-ledger.jsonl` |

## Formato dos receipts

Cada entrada do ledger é uma linha JSON (`JSONL`) com `at` (ISO-8601) + `tool` + campos da ação.
Exemplos dos campos verificáveis:

- `swarm_fetch`: `{url, finalUrl, method, status, contentType, bytes, bodySha256, truncated, durationMs}`
  — `bodySha256` é o hash dos bytes exatos do corpo; citações podem ser re-derivadas e auditadas.
- `swarm_web_search`: `{query, engine, pageSha256, resultCount, status}` — a lista de resultados
  é re-derivável da página cujo hash está no receipt.
- `swarm_exec_batch` (agregado): `{jobs, passed, failed, wallMs, receipts[]}`; por job:
  `{label, command, ok, exitCode, stdoutSha256, stderrSha256, durationMs}` (saídas hashadas, não persistidas).
- `swarm_skill_register`: `{name, root, fileCount, merkleRoot, manifestSha256}`.
- `swarm_lock_steal`: `{frontId, newOwner, priorRecord, provenStaleByMs}` — o registro anterior
  inteiro viaja no receipt; roubo sem prova de expiração é estruturalmente impossível.
- `swarm_task_update` (gated): `completion = {verified, command, exitCode, stdoutSha256, stderrSha256, at}`;
  conclusão sem `acceptanceCommand` registra `verified:false` (paridade com TodoWrite, mas honesta).

## Rodando os gates (provas)

Cada módulo tem um gate executável em `gates/`, com fixture isolada via
`ATOMIC_SWARM_REPO_ROOT` (dir `.proof-*-<pid>` temporário) e saída `--json`:

```bash
node gates/swarm-fetch.proof.mjs --json
node gates/swarm-batch.proof.mjs --json
node gates/swarm-skills.proof.mjs --json
node gates/swarm-locks.proof.mjs --json
node gates/swarm-tasks.proof.mjs --json
```

Saída: `{ok, total, failed, results[]}`; exit 1 se qualquer prova falhar. Os gates importam
o módulo sob teste com query-string única (fura o cache de módulos) e limpam a fixture em `finally`.

## Relação com o atomic-edit

- **Superfície irmã, fora da janela selada.** A janela de admissão do atomic-edit é selada
  (cresce só por auto-extensão provada); a swarm cobre as superfícies que a janela ainda não
  pode crescer — sem tocar no servidor selado e sem bypass: shell continua passando pelo
  mesmo broker do `atomic_exec`.
- **Locks compartilham `.atomic-edit-locks/`.** Mesmo primitivo anti-TOCTOU (`mkdir` atômico)
  e mesmos campos de registro que `atomic_lock_acquire`, então o `listLocks` do atomic-edit
  lê locks da swarm transparentemente. A swarm adiciona `leaseMs` + `heartbeatTimestampMs`:
  lock sem heartbeat dentro do lease está EXPIRADO e só então pode ser roubado — todo steal
  é auditado em `swarm-locks-ledger.jsonl` com o registro anterior completo. Não existe flag
  de força; lock legado sem lease nunca auto-expira.
- **Modo single-tool para gates/orquestração:** `SWARM_SINGLE_TOOL_NAME` +
  `SWARM_SINGLE_TOOL_ARGS` (JSON) executam uma tool e saem com exit code real, sem transporte stdio.
