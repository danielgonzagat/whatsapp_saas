# Dossiê de evidência do atomic — 2026-06-09

Eixo "mais rápido / mais econômico / mais infalível" da régua de revolução. Tudo abaixo
passou por um painel adversarial de 5 verificadores independentes (workflow
`wf_1fcf4f07`, 294k tokens, recompute do zero com parsers próprios — proibidos de
reusar os harnesses). **2 alegações minhas foram refutadas e estão incorporadas como
limites declarados, não escondidas.** Instrumentos commitados em
`scripts/mcp/atomic-edit-bench/` (`5723ea81f`).

## 1. Números de produção VERIFICADOS (ledgers reais deste repo)

| Alegação | Recompute independente | Veredito |
|---|---|---|
| 9.303 operações persistidas, **0 quebras de sintaxe introduzidas** | 9.314 traces (ledger vivo), 100% com validação numérica, **0 casos before==0 && after>before; max(after−before)=0 sobre TODA a população** — nem as 6 bases pré-sujas pioraram (5 melhoraram 1→0) | **CONFIRMADO, mais forte que o alegado** |
| exec-ledger ~21,5k: 14.871 exec / 6.508 recusas pré-spawn / 125 spawn-error / 14 timeout; p50 208ms | 21.609 linhas, kinds idênticos (+≤0,5% crescimento append-only), **p50 = 208ms exato**, 6.531/6.531 recusas com `reason` e zero marcador de execução (pré-spawn confirmado) | **CONFIRMADO** |
| bypass-ledger: 994 bloqueados, 0 silenciosos | 1.027 registros, 1.020 `blockedByDenyHook:true`, **0 `silentlyAllowed`/`bypassed`**; os 7 não-prevenidos são LOGADOS (rg×2, sed×4, pwd×1, época pré-modo-estrito, `strictAtomicOnly:false`) — permitidos por política, não falha do hook | **CONFIRMADO com nuance** |

Limite declarado (v1): traces provam apenas operações que geraram trace; escrita que
contornasse o mecanismo não apareceria neste dataset. O fechamento desse limite é o
deny-hook (994-1.020 bloqueios reais) + T7 do programa sem-precedentes.

## 2. AtomicBench v1 — o que PODE e o que NÃO pode ser afirmado

Desenho: mesmas 635 propostas quebradoras + 182 benignas nos 2 braços; braço atomic =
`engine.validate` pré-disco; braço controle = `writeFileSync` incondicional.

**Sobreviveu à refutação:**
- **Enforcement sem vazamento**: sob a bateria declarada do próprio engine, 0 escritas
  judge-refused chegaram ao disco no braço atomic, enquanto o escritor incondicional
  persistiu todas (376–383 conforme a árvore). Invariante `atomicRefused ==
  controlPersistedInvalid` manteve-se nas 3 execuções do painel.
- **Braço JSON é não-circular e defensável**: o juiz foi validado contra árbitro
  independente (`JSON.parse`): 0 desacordos em 200 propostas.
- **Benignas**: 142/182 admitidas, estável nas 3 execuções; os 40 falsos-positivos são
  100% SQL (causa na §3). Excluindo gramáticas cegas do numerador, FP real = 25% — piso,
  pois o benigno testado (append de comentário) é o caso mais fácil.

**Refutado e aceito (não afirmar):**
- ~~"atomic persistiu 0 estados inválidos"~~ sem relativização — é tautologia
  (mesmo juiz define "inválido" e aplica o gate); o bench prova ENFORCEMENT, não
  acurácia do juiz. 252/635 mutações que permanecem parseáveis (ex.: rasgo dentro de
  string) persistem TAMBÉM no braço atomic.
- ~~"determinístico/re-executável byte-idêntico"~~ — só para árvore CONGELADA. O bench é
  auto-minante: os próprios outputs entram no pool de amostragem e o cache graphify
  muda entre runs (378→376→382). Corrigir no v2: ancorar a um commit, excluir
  bench-dir e caches do pool.
- ~~controle representa agentes reais~~ — é o teto vs escritor-sem-feedback (strawman
  declarado); métrica honesta do v2: tempo-até-recuperação vs recusa-pré-disco.
- ~~proteção em html/css~~ — cegos (html `generic`; css mis-roteado, §3).

## 3. O ACHADO — mis-routing de gramática no juiz clássico (causa-raiz localizada)

**`engine.validate` — o juiz de TODOS os operadores clássicos (`atomic_replace_text`,
`atomic_create_file`, …) — julga `.sql` e `.css` com a gramática JAVASCRIPT e `.html`
com `generic` (sem parser).** Causa-raiz provada pelo painel:
`scripts/mcp/atomic-edit/dist/lang-bridge.js:161-162` e `:268-271` mapeiam
`'.sql'`/`'.css'` → `'javascript'`. As gramáticas reais (wasm) existem no caminho
universal — a correção da missão language-coverage cobriu as tools universais, não o
validate clássico.

Consequências medidas (witness executável commitado:
`scripts/mcp/atomic-edit-bench/lang-misrouting.repro.mjs`, 3/3 `defectPresent`):

- **SQL falso-positivo**: appendar `SELECT 1;` válido a uma migração real é RECUSADO
  (vira "erro JS" novo); appendar comentário `--` idem (decremento em JS); `/* */` é
  aceito porque é comentário válido em JS. Todo append benigno de comentário `--` em
  migração é bloqueado em produção.
- **SQL falso-NEGATIVO (87%)**: truncar a migração a 73% → 40/40 ADMITIDO; substituir a
  migração inteira por código JavaScript é admitido como MELHORIA (before=1→after=0).
  O gate SQL é simultaneamente obstrutivo e não-protetor.
- **CSS falso-verde**: css válido tem floor de 286 "erros JS"; truncar METADE do
  arquivo é ADMITIDO.
- **HTML cego**: `generic`, 0 erros sempre.

Correção: rotear ext→gramática real no validate clássico (como o caminho universal já
faz). Mora em `scripts/mcp/atomic-edit/**` — sob lock do front `darwin-godel-thread`
no momento da descoberta; este dossiê + repro são o handoff. Quando consertado, o
repro imprime `defectPresent:false` e vira regression-proof.

## 4. Leitura honesta do conjunto

O que este dossiê demonstra não é "o atomic é perfeito" — é o contrário e melhor: **o
processo encontra e localiza as próprias mentiras**. Em uma janela: a produção provou
0 quebras introduzidas em 9,3k operações sob o juiz declarado; o bench controlado
provou enforcement pré-disco sem vazamento; e o mesmo aparato descobriu um buraco real
no juiz (mis-routing sql/css/html) com causa file:line, quantificação (87% FN SQL) e
reprodutor executável. Recusa virou sinal; sinal virou artefato; artefato vira gate na
próxima janela. Os números de velocidade/economia (p50 208ms por comando; 1.959 ops
com expansão ≥2× evitada, 316 ≥10×, 14 ≥100×) ficam como observacionais — sem braço
comparativo ainda (v2).
