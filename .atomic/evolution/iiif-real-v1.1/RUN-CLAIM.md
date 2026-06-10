# III.f REAL v1.1 — claim de despachante único

- Despachante: sessão Claude `581bb392-d07e-4c68-8133-bce9dab9db13` (claude-genesis, front `darwin-godel-preregistration`).
- Motivo da v1.1: a v1 (`../iiif-real-v1/`, preservada intacta como arquivo-morto) foi contaminada na geração 4
  por um segundo despachante concorrente (sessão `f4e02fe0`, autodeclarada em `../iiif-real-v1/CONTAMINATION-NOTICE.md`).
- Correção de aparato na v1.1: o juiz (`iiif-driver.mjs`) agora RECUSA despachos cujo `promptSha256` não
  corresponde ao prompt recomputado da geração corrente da linhagem (classe stale-world-hash) — recusa
  estrutural, sem avançar geração, sem tocar ledger/corpus. Concorrência vira corrida inofensiva
  (compare-and-swap), não contaminação.
- Gerações 1–3 da v1 estão limpas e podem ser citadas como piloto; TODA métrica v1.1 vem só deste dir.
