# KLOEL HUD — Pacote Portável do Vault Obsidian

Este diretório contém o **sistema de espelhamento funcional do workspace no
Obsidian** (o "HUD KLOEL") empacotado para que outra pessoa o replique na
máquina dela exatamente como roda na máquina de origem.

## O que é o HUD

Um vault Obsidian que funciona como painel de estado do projeto: o **mirror
daemon** espelha a árvore de código em notas markdown, ~12 _emitters_ enriquecem
cada nota com sidecars (severidade, tier, fase, cobertura, CI, provider), o
`blocker-rank` prioriza, e o `hubs-generator` gera os hubs (`00-NEXT`,
`00-BLOCKERS`, `00-DAG`, …). Arquitetura completa em
[`docs/HUD_README.md`](../../docs/HUD_README.md) e
[`docs/adr/0004-obsidian-as-production-hud.md`](../../docs/adr/0004-obsidian-as-production-hud.md).

## Conteúdo deste pacote

| Arquivo                              | Função                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| `kloel-obsidian-hud-skeleton.tar.gz` | Esqueleto portável do vault (~3 MB): `.obsidian` + estrutura `Kloel` |
| `bootstrap.sh`                       | Instalador para a máquina do amigo (extrai + ajusta paths + env)    |
| `build-skeleton.mjs`                 | Regenera o tarball a partir do vault vivo (lado do dono)            |
| `README.md`                          | Este arquivo                                                        |

### O que o esqueleto inclui

- `.obsidian/` completo: `app/appearance/core-plugins/community-plugins.json`,
  `graph.json` + lentes de cor, `snippets/kloel-theme.css`, e **todos os 18
  plugins** já instalados (homepage, local-rest-api, git, claudian, kloel-hud,
  templater, linter, periodic-notes, devops-companion, etc.).
- `Kloel/`: toda a estrutura de pastas, `_templates/`, `_meta/` (instruções),
  `00-HUD/00-HUD-README.md` e bases/canvas estruturais.

### O que **não** inclui (de propósito)

- **`99 - Espelho do Codigo/_source`** (123 MB): o mirror daemon regenera a
  partir do código na máquina do amigo. Vai pesado e desatualizado seria pior.
- **Segredos**: chave do Local REST API, token do codex-bridge, apiKey do
  MCP plugin e cert TLS são removidos — cada máquina gera os seus no 1º boot.
- **Layout de janelas** (`workspace.json`) e caches (`.smart-env`, backups):
  específicos de máquina; o Obsidian recria.
- Hubs auto-gerados (`00-NEXT`, `00-BLOCKERS`, …): o orchestrator escreve no
  primeiro refresh.

Todos os caminhos absolutos viram placeholders (`__KLOEL_REPO_ROOT__`,
`__KLOEL_VAULT_ROOT__`, `__KLOEL_HOME__`) que o `bootstrap.sh` substitui pelos
caminhos reais da máquina do amigo.

---

## Instruções para o amigo

> Pré-requisito: ter **este mesmo repositório git clonado** (os scripts do HUD
> vêm junto com o código).

```bash
# 1. Atualize o repo (traz este pacote)
git pull

# 2. Rode o bootstrap (vault padrão: ~/Documents/Obsidian Vault)
tools/hud-portable/bootstrap.sh
#   ou escolhendo onde criar o vault:
tools/hud-portable/bootstrap.sh "/caminho/que/eu/quero/Obsidian Vault"
```

O bootstrap extrai o esqueleto, ajusta todos os caminhos para a máquina dele e
grava `tools/hud-portable/.hud-env`. Depois ele segue os passos impressos no
final (rodar `npm ci`, abrir o Obsidian, gerar a chave do Local REST API, subir
os 4 daemons, rodar o primeiro refresh). Esses passos também estão em
`docs/HUD_README.md` seções 2–3.

Re-executar é seguro; para sobrescrever um vault já existente:
`tools/hud-portable/bootstrap.sh --force`.

---

## Atualizar o pacote (lado do dono)

Quando o esqueleto mudar (novo plugin, nova estrutura, novo tema), regenere o
tarball a partir do vault vivo e faça commit:

```bash
node tools/hud-portable/build-skeleton.mjs
git add tools/hud-portable/kloel-obsidian-hud-skeleton.tar.gz
git commit -m "chore(hud-portable): refresh skeleton bundle"
```

O `build-skeleton.mjs` falha em alto e bom som se qualquer caminho de máquina ou
segredo escapar para o bundle — é seguro rodar e commitar o resultado.
