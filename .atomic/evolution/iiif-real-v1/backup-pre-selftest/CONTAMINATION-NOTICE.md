# AVISO DE CONTAMINAÇÃO — geração 4 (2026-06-09 ~21:17 BRT)

Dois despachantes concorrentes operaram este experimento sem saber um do outro:
a sessão original (claude-genesis, gerações 1–3, prompts evoluindo corretamente)
e uma segunda sessão Claude (esta), que leu o estado ainda na geração 1, despachou
12 propostas contra o baseline e as submeteu ao `--judge` quando as linhagens já
estavam na geração 4.

## Registros contaminados (NÃO usar nas métricas M1–M5)

- TODOS os registros `generation: 4` nos dois ledgers (`run-ledger-haiku.jsonl`,
  `run-ledger-opus.jsonl`): 12 registros com `promptSha256` da geração 1
  (`7a1a3d76…` ESCALAR / `0c214423…` GRADIENTE) — propostas respondendo a um
  estado obsoleto.
- PIOR: 2 promotes estaleiros mudaram `currentText` de linhagens haiku
  (`haiku|ESCALAR|s2`, `haiku|GRADIENTE|s3` — promote g4 score=1 sobre texto
  construído contra o baseline). As gerações ≥5 dessas linhagens herdam estado
  envenenado. As linhagens opus tiveram 6/6 rejects na g4 (currentText intacto;
  apenas M2 da g4 poluída).

## Causa-raiz de aparato (achado real, classe stale-world-hash)

`cmdJudge`/`judgeOne` NÃO verificam que `proposal.promptSha256` corresponde ao
prompt da geração corrente da linhagem — aceitam qualquer dispatch, inclusive
obsoleto. A doutrina atomic exige recusa de mundo-desatualizado. Correção:
o juiz reconstrói o prompt esperado da linhagem e RECUSA (sem avançar geração)
propostas cujo promptSha256 não bate.

## Consequência pré-registrada

O pré-registro (G=5) está comprometido a partir da g4. Gerações 1–3 estão
LIMPAS nos dois ledgers. Qualquer análise v1 deve: (a) declarar este desvio,
(b) usar só g1–g3, ou (c) reiniciar como v1.1 com a recusa-estaleira ativa e
UM único despachante (serializado pelo lock). Nada acima da linha de Resultados
do pré-registro será editado retroativamente.

— sessão Claude f4e02fe0 (despachante contaminador, autodeclarado)
