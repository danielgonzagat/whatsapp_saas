# PULSE E2E Blockers
**Generated:** 2026-04-27 15:25 UTC-3

---

## Blocker 1: customerPass — Missing Synthetic Evidence

- **Comando que falhou:** `node -e "..."` — PULSE_CERTIFICATE.json gate check
- **Erro:** `customer synthetic evidence is missing for: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox`
- **Causa provável:** Playwright E2E tests existem (`e2e/specs/customer-auth-shell.spec.ts`, `e2e/specs/customer-product-and-checkout.spec.ts`, `e2e/specs/customer-whatsapp-and-inbox.spec.ts`) mas nunca foram executados contra ambiente live com PULSE evidence capture ativo. O PULSE precisa de traces reais de execução (HTTP responses, DB queries, Playwright screenshots), não apenas inferência estrutural.
- **Próximo passo:** Subir `npm run dev` (backend + frontend), rodar `npx playwright test e2e/specs/customer-*.spec.ts` com PULSE runtime capture ativo.

---

## Blocker 2: operatorPass — Zero Runtime Evidence

- **Comando que falhou:** `node -e "..."` — PULSE_CERTIFICATE.json gate check
- **Erro:** `operator synthetic scenarios have no observed (runtime-executed) evidence — 0 scenario(s) passed via structural inference only (truthMode='inferred'). Real HTTP/Playwright/DB execution is required.`
- **Causa provável:** Mesma raiz do Blocker 1 — nenhum teste E2E foi executado com evidência capturada. Operator scenarios mapeiam operações de workspace management, invite flows, role assignment — todos precisam de HTTP requests reais.
- **Próximo passo:** Identificar quais specs E2E cobrem operator scenarios. Rodar com PULSE runtime capture.

---

## Blocker 3: adminPass — Missing admin-settings-kyc-banking

- **Comando que falhou:** `node -e "..."` — PULSE_CERTIFICATE.json gate check
- **Erro:** `admin synthetic evidence is missing for: admin-settings-kyc-banking`
- **Causa provável:** Spec `e2e/specs/settings-kyc.spec.ts` existe mas sem evidência de execução.
- **Próximo passo:** Rodar `npx playwright test e2e/specs/settings-kyc.spec.ts` com ambiente live.

---

## Blocker 4: multiCycleConvergencePass — 0/2 Non-Regressing Cycles

- **Comando que falhou:** `node -e "..."` — PULSE_CERTIFICATE.json gate check
- **Erro:** `multiCycleConvergence: 0/2 non-regressing real cycles (recorded=10, realExecuted=1, nonRegressing=0/2, failedValidation=1, missingValidation=0, missingRuntimeValidation=0, regressedScore=0, regressedTier=0)`
- **Causa provável:** PULSE registrou 10 ciclos de scan, mas apenas 1 teve execução real (runtime). Desses, 0/2 passaram na validação não-regressiva. 1 falhou validação. Para o gate passar, precisa de 2+ ciclos consecutivos com execução real onde score e tier não regridem.
- **Próximo passo:** Executar PULSE scan completo com runtime ativo pelo menos 2 vezes consecutivas, garantindo que os resultados não regridam entre ciclos.

---

## Blocker 5: Dev Environment Not Running

- **Comando que falhou:** `lsof -i :3000 -i :3001 -i :5173`
- **Erro:** Nenhum processo ouvindo nas portas 3000 (backend), 3001 (worker), 5173 (frontend Vite). PostgreSQL está rodando na 5432.
- **Causa provável:** Ambiente de desenvolvimento não foi iniciado nesta sessão.
- **Próximo passo:** `npm run dev` ou equivalente para subir backend + frontend + worker. Verificar `.env` com credenciais de banco e serviços externos.

---

## Nota: PULSE Internal Gates (All PASS)

Os sub-gates internos do PULSE estão todos saudáveis:
- scopeClosed ✅
- adapterSupported ✅
- specComplete ✅
- truthExtractionPass ✅
- runtimePass ✅
- changeRiskPass ✅
- productionDecisionPass ✅
- flowPass ✅
- invariantPass ✅
- isolationPass ✅
- syntheticCoveragePass ✅
- evidenceFresh ✅
- pulseSelfTrustPass ✅
- noOverclaimPass ✅
- testHonestyPass ✅
- assertionStrengthPass ✅
- typeIntegrityPass ✅

Os únicos gates falhando são os que exigem **evidência sintética real** (Playwright/HTTP/DB traces), que por sua vez exigem ambiente live.

---

## Sub-Gates com Falhas de Infraestrutura (Não bloqueiam E2E)

- **staticPass:** 86 scan findings + 1116 Codacy HIGH issues
- **securityPass:** migration baseline, email.service.ts, package.json
- **recoveryPass:** BACKUP_MISSING, DR_RPO_TOO_HIGH
- **performancePass:** não exercitado em scan mode
- **observabilityPass:** sem alerting, sem tracing

Estes são problemas de infra/config, não de código, e não impedem a execução dos E2E tests.
