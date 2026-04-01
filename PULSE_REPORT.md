# PULSE REPORT — 2026-04-01T16:18:01.858Z

## Certification Status: PARTIAL

- Score: 47/100 (raw scan: 48/100)
- Environment: total
- Commit: 6edc33a75c66978e97318f53da42f37512f07778
- Manifest: /Users/danielpenin/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)

## Health Score: 47/100
`█████████░░░░░░░░░░░` 47%

## Gates

| Gate | Status | Failure Class | Reason |
|------|--------|---------------|--------|
| scopeClosed | PASS | — | All discovered surfaces are declared or explicitly excluded in the manifest. |
| adapterSupported | PASS | — | All declared stack adapters are supported by the current PULSE foundation. |
| specComplete | PASS | — | pulse.manifest.json is present and passed structural validation. |
| staticPass | FAIL | product_failure | Static certification found 651 critical/high blocking finding(s). |
| runtimePass | FAIL | product_failure | Runtime evidence found blocking break types: AUDIT_DELETION_NO_LOG, AUDIT_FINANCIAL_NO_TRAIL, CACHE_REDIS_STALE, CACHE_STALE_AFTER_WRITE, CRUD_BROKEN, DEPLOY_NO_ROLLBACK, DR_BACKUP_INCOMPLETE, DR_CANNOT_REBUILD, DR_NO_RUNBOOK, DR_RPO_TOO_HIGH, E2E_FLOW_NOT_TESTED, E2E_REGISTRATION_BROKEN, NETWORK_OFFLINE_DATA_LOST, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING, ORDERING_WEBHOOK_OOO, RACE_CONDITION_DATA_CORRUPTION, RACE_CONDITION_FINANCIAL, RACE_CONDITION_OVERWRITE, STATE_PAYMENT_INVALID. |
| browserPass | FAIL | missing_evidence | Browser evidence failed before completing the stress run. browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /Users/danielpenin/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/tm/rhc2d8y11pxff_1n51kmb8jr0000gn/T/playwright_chromiumdev_profile-7eK1FE --remote-debugging-pipe --no-startup-window
<launched> pid=20485
[pid=20485][err] [0401/131801.829052:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9
[pid=20485][err] [0401/131801.846226:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.
[pid=20485][err] [0401/131801.847347:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.
[pid=20485][err] [0401/131801.854315:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.20485: Permission denied (1100)
Call log:
[2m  - <launching> /Users/danielpenin/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/tm/rhc2d8y11pxff_1n51kmb8jr0000gn/T/playwright_chromiumdev_profile-7eK1FE --remote-debugging-pipe --no-startup-window[22m
[2m  - <launched> pid=20485[22m
[2m  - [pid=20485][err] [0401/131801.829052:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9[22m
[2m  - [pid=20485][err] [0401/131801.846226:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.[22m
[2m  - [pid=20485][err] [0401/131801.847347:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.[22m
[2m  - [pid=20485][err] [0401/131801.854315:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.20485: Permission denied (1100)[22m
[2m  - [pid=20485] <gracefully close start>[22m
[2m  - [pid=20485] <kill>[22m
[2m  - [pid=20485] <will force kill>[22m
[2m  - [pid=20485] exception while trying to kill process: Error: kill EPERM[22m
[2m  - [pid=20485] <process did exit: exitCode=null, signal=SIGTRAP>[22m
[2m  - [pid=20485] starting temporary directories cleanup[22m
[2m  - [pid=20485] finished temporary directories cleanup[22m
[2m  - [pid=20485] <gracefully close end>[22m |
| flowPass | FAIL | missing_evidence | Critical flow evidence is missing for: auth-login, product-create, checkout-payment, wallet-withdrawal, whatsapp-message-send. |
| invariantPass | FAIL | product_failure | Invariant-related blocking findings remain open: AUDIT_DELETION_NO_LOG, AUDIT_FINANCIAL_NO_TRAIL, CACHE_REDIS_STALE, CACHE_STALE_AFTER_WRITE, IDEMPOTENCY_FINANCIAL, IDEMPOTENCY_JOB, IDEMPOTENCY_MISSING, ORDERING_WEBHOOK_OOO, RACE_CONDITION_DATA_CORRUPTION, RACE_CONDITION_FINANCIAL, RACE_CONDITION_OVERWRITE, STATE_PAYMENT_INVALID. |
| securityPass | FAIL | product_failure | Security certification found blocking findings. Blocking types: LGPD_NON_COMPLIANT. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | FAIL | product_failure | Recovery certification found blocking findings. Blocking types: BACKUP_MISSING, DEPLOY_NO_ROLLBACK, DR_BACKUP_INCOMPLETE, DR_CANNOT_REBUILD, DR_NO_RUNBOOK, DR_RPO_TOO_HIGH, MIGRATION_NO_ROLLBACK. |
| performancePass | PASS | — | Performance budgets have no blocking findings in this run. |
| observabilityPass | FAIL | product_failure | Observability certification found blocking findings. Blocking types: AUDIT_DELETION_NO_LOG, AUDIT_FINANCIAL_NO_TRAIL, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING. |
| evidenceFresh | PASS | — | All certification artifacts in this run are fresh. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Evidence Summary

- Runtime: Runtime evidence executed with 213 blocking runtime finding(s).
- Browser: Browser evidence failed before completing the stress run. browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /Users/danielpenin/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/tm/rhc2d8y11pxff_1n51kmb8jr0000gn/T/playwright_chromiumdev_profile-7eK1FE --remote-debugging-pipe --no-startup-window
<launched> pid=20485
[pid=20485][err] [0401/131801.829052:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9
[pid=20485][err] [0401/131801.846226:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.
[pid=20485][err] [0401/131801.847347:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.
[pid=20485][err] [0401/131801.854315:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.20485: Permission denied (1100)
Call log:
[2m  - <launching> /Users/danielpenin/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/tm/rhc2d8y11pxff_1n51kmb8jr0000gn/T/playwright_chromiumdev_profile-7eK1FE --remote-debugging-pipe --no-startup-window[22m
[2m  - <launched> pid=20485[22m
[2m  - [pid=20485][err] [0401/131801.829052:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9[22m
[2m  - [pid=20485][err] [0401/131801.846226:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.[22m
[2m  - [pid=20485][err] [0401/131801.847347:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.[22m
[2m  - [pid=20485][err] [0401/131801.854315:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.20485: Permission denied (1100)[22m
[2m  - [pid=20485] <gracefully close start>[22m
[2m  - [pid=20485] <kill>[22m
[2m  - [pid=20485] <will force kill>[22m
[2m  - [pid=20485] exception while trying to kill process: Error: kill EPERM[22m
[2m  - [pid=20485] <process did exit: exitCode=null, signal=SIGTRAP>[22m
[2m  - [pid=20485] starting temporary directories cleanup[22m
[2m  - [pid=20485] finished temporary directories cleanup[22m
[2m  - [pid=20485] <gracefully close end>[22m
- Flows: No formal flow evidence is attached for 5 declared flow(s).
- Invariants: No formal invariant evidence is attached for 4 declared invariant(s).

## Gate Evidence

### staticPass

- artifact | executed=true | 651 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=651, totalBreaks=958

### runtimePass

- runtime | executed=true | Runtime evidence executed with 213 blocking runtime finding(s).
- Artifacts: (none) | Metrics: executedChecks=41, blockingBreakTypes=20

### browserPass

- browser | executed=false | Browser evidence failed before completing the stress run. browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /Users/danielpenin/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/tm/rhc2d8y11pxff_1n51kmb8jr0000gn/T/playwright_chromiumdev_profile-7eK1FE --remote-debugging-pipe --no-startup-window
<launched> pid=20485
[pid=20485][err] [0401/131801.829052:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9
[pid=20485][err] [0401/131801.846226:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.
[pid=20485][err] [0401/131801.847347:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.
[pid=20485][err] [0401/131801.854315:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.20485: Permission denied (1100)
Call log:
[2m  - <launching> /Users/danielpenin/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --enable-automation --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/tm/rhc2d8y11pxff_1n51kmb8jr0000gn/T/playwright_chromiumdev_profile-7eK1FE --remote-debugging-pipe --no-startup-window[22m
[2m  - <launched> pid=20485[22m
[2m  - [pid=20485][err] [0401/131801.829052:ERROR:base/power_monitor/thermal_state_observer_mac.mm:140] ThermalStateObserverMac unable to register to power notifications. Result: 9[22m
[2m  - [pid=20485][err] [0401/131801.846226:ERROR:net/dns/dns_config_service_posix.cc:138] DNS config watch failed to start.[22m
[2m  - [pid=20485][err] [0401/131801.847347:WARNING:net/dns/dns_config_service_posix.cc:197] Failed to read DnsConfig.[22m
[2m  - [pid=20485][err] [0401/131801.854315:FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.20485: Permission denied (1100)[22m
[2m  - [pid=20485] <gracefully close start>[22m
[2m  - [pid=20485] <kill>[22m
[2m  - [pid=20485] <will force kill>[22m
[2m  - [pid=20485] exception while trying to kill process: Error: kill EPERM[22m
[2m  - [pid=20485] <process did exit: exitCode=null, signal=SIGTRAP>[22m
[2m  - [pid=20485] starting temporary directories cleanup[22m
[2m  - [pid=20485] finished temporary directories cleanup[22m
[2m  - [pid=20485] <gracefully close end>[22m
- Artifacts: /Users/danielpenin/whatsapp_saas/screenshots | Metrics: attempted=true, totalPages=0, totalTested=0, passRate=0, blockingInteractions=0

### flowPass

- flow | executed=false | No formal flow evidence is attached for 5 declared flow(s).
- Artifacts: (none) | Metrics: declared=5, executed=0, missing=5

### invariantPass

- invariant | executed=false | No formal invariant evidence is attached for 4 declared invariant(s).
- Artifacts: (none) | Metrics: declared=4, evaluated=0, missing=4

### evidenceFresh

- artifact | executed=true | Certification artifacts were generated in the current run.
- Artifacts: PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 899 | 1 dead handlers |
| API Calls | 641 | 0 no backend |
| Backend Routes | 631 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 1 | 1 critical, 0 warning |
| Proxy Routes | 48 | 0 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 0 issues |
| Quality | - | 955 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (958 total)

### AUDIT_DELETION_NO_LOG (19)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/analytics/advanced-analytics.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/api-keys/api-keys.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/auth/auth.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/crm/crm.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/asaas.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/external-payment.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/guest-chat.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/memory.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/mercadopago.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kyc/kyc.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/notifications/notifications.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/partnerships/partnerships.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/team/team.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/whatsapp/agent-events.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/whatsapp/cia-runtime.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |

### AUDIT_FINANCIAL_NO_TRAIL (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |
| CRITICAL | backend/src/checkout/checkout.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |
| CRITICAL | backend/src/kloel/mercadopago.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |
| CRITICAL | backend/src/kloel/payment.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |
| CRITICAL | backend/src/kloel/smart-payment.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |
| CRITICAL | backend/src/audit/audit.interceptor.ts:0 | Potentially sensitive fields (password/token/CPF) may be logged in AuditLog |
| CRITICAL | backend/src/kloel/middleware/audit-log.middleware.ts:0 | Potentially sensitive fields (password/token/CPF) may be logged in AuditLog |

### BACKUP_MISSING (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | No recent DB backup found — backup manifest missing or older than 24 h |
| CRITICAL | docs/RESTORE.md:0 | No DB restore runbook or restore script found in repo |
| CRITICAL | .backup-validation.log:0 | No backup restore-test validation log found — backup has never been verified |
| CRITICAL | .backup-policy.json:0 | Backup retention policy undefined — set BACKUP_RETENTION_DAYS env var or .backup-policy.json |

### BROWSER_INCOMPATIBLE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:594 | CSS feature with limited browser support used without @supports fallback |
| WARNING | frontend/src/app/(checkout)/layout.tsx:0 | Root layout missing viewport meta tag — mobile users see desktop-scaled view |

### BRUTE_FORCE_VULNERABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src (POST /auth/login):0 | No rate limiting on POST /auth/login — brute-force attack is possible |

### CACHE_REDIS_STALE (18)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/analytics/advanced-analytics.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/autopilot/autopilot.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/billing/payment-method.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/billing/payment-method.service.ts:86 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/inbox/smart-routing.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/asaas.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/external-payment.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/external-payment.service.ts:412 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/external-payment.service.ts:644 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/external-payment.service.ts:645 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/external-payment.service.ts:646 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/external-payment.service.ts:647 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/external-payment.service.ts:648 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/guest-chat.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/mercadopago.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/partnerships/partnerships.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/whatsapp/agent-events.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |

### CACHE_STALE_AFTER_WRITE (76)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/hooks/useCheckout.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/canvas/inicio/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/canvas/modelos/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/inbox/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/products/new/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/anonymous/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/check-email/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/google/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/login/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/refresh/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/register/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/verify/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/canvas/CanvasEditor.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/checkout/KloelChatBubble.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/anuncios/AnunciosView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/carteira.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/chat-container.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/conta/ContaView.tsx:1824 | SWR cache key is not scoped to workspace — cross-tenant cache leakage risk |
| HIGH | frontend/src/components/kloel/dashboard/KloelDashboard.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/home/HomeScreen.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/landing/FloatingChat.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/marketing/MarketingView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/produtos/ProdutosView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/sites/SitesView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/vendas/VendasView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanAffiliateTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanPaymentTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanPaymentTab.tsx:0 | Financial write without any cache invalidation strategy — user may see wrong balance |
| HIGH | frontend/src/components/plans/PlanShippingTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanStoreTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanThankYouTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/CheckoutConfigPage.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductAfterPayTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCommissionsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCouponsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductIATab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductReviewsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductUrlsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useCRM.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useCanvasAI.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useCanvasDesigns.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useConversationHistory.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useMemberAreas.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/usePartnerships.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useProducts.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/anonymous-session.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/asaas.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/auth.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/autopilot.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/billing.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/billing.ts:0 | Financial write without any cache invalidation strategy — user may see wrong balance |
| HIGH | frontend/src/lib/api/campaigns.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/cia.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/conversations.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/core.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/crm.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/flows.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/kloel-api.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/kloel.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/meta.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/misc.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/pipeline.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/products.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/team.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/whatsapp-api.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/whatsapp.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/workspace.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/media-upload.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |

### CICD_INCOMPLETE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas:0 | No deployment configuration found |

### CLOCK_SKEW_TOO_STRICT (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:8 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:30 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:10 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |

### COST_LLM_NO_LIMIT (106)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/agent-assist.service.ts:21 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/agent-assist.service.ts:58 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/agent-assist.service.ts:83 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/agent-assist.service.ts:110 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/hidden-data.service.ts:30 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/media-factory.service.ts:21 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/media-factory.service.ts:49 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/vector.service.ts:24 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/audio/audio.controller.ts:37 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/audio/transcription.service.ts:70 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/audio/transcription.service.ts:97 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/autopilot/autopilot.service.ts:835 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/autopilot/autopilot.service.ts:1844 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/autopilot/autopilot.service.ts:2032 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/campaigns/campaigns.service.ts:336 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/copilot/copilot.service.ts:74 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/copilot/copilot.service.ts:167 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/crm/neuro-crm.service.ts:148 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/crm/neuro-crm.service.ts:199 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/flows/flow-optimizer.service.ts:49 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/i18n/i18n.service.ts:215 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/i18n/i18n.service.ts:288 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:40 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:52 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:138 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:162 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/canvas.controller.ts:157 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/canvas.controller.ts:169 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:18 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:352 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:354 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:400 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:402 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/guest-chat.service.ts:140 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:936 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:937 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:938 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:995 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:998 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1007 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/memory.service.ts:39 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:127 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:130 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:133 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:143 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:145 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:154 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:189 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:193 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:221 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:222 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:238 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/pdf-processor.service.ts:54 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/site.controller.ts:68 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/site.controller.ts:99 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/smart-payment.service.ts:89 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/smart-payment.service.ts:284 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/unified-agent.service.ts:3324 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/:0 | No per-workspace LLM token budget enforcement found — one workspace can exhaust entire monthly budget |
| HIGH | backend/src/analytics/smart-time/smart-time.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/autopilot/autopilot.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/billing/billing.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/billing/plan-limits.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/cia/cia.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/flows/flows.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/inbox/inbox.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/asaas.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/kloel.autonomy-proof.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/kloel.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/middleware/audit-log.middleware.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/unified-agent.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/unified-agent.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/lib/env.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/mass-send/mass-send.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/mass-send/mass-send.worker.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/instagram/instagram.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/instagram/instagram.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/messenger/messenger.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/messenger/messenger.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/webhooks/meta-webhook.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/notifications/notifications.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/partnerships/partnerships.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/partnerships/partnerships.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/partnerships/partnerships.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/public-api/public-api.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/asaas-webhook.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/cia-runtime.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/cia-runtime.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/controllers/whatsapp-api.controller.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/inbound-processor.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/inbound-processor.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/provider-registry.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/provider-registry.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/web-agent.provider.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/whatsapp-api.provider.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp-catchup.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp-watchdog.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |

### COST_NO_TRACKING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/:0 | LLM API calls made without recording token usage per workspace — cannot bill or limit costs |
| HIGH | backend/src/:0 | No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit |

### COST_STORAGE_NO_LIMIT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | File uploads accepted without per-workspace storage quota check |

### COVERAGE_CORE_LOW (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/coverage/coverage-summary.json:0 | Backend coverage report not found — run jest --coverage to generate |

### CRUD_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/products:0 | CRUD CREATE — expected 200/201, got 0 |

### DEPENDENCY_VULNERABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | .github/dependabot.yml:0 | No automated dependency update tool configured (Dependabot or Renovate) |

### DEPLOY_NO_FEATURE_FLAGS (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | No feature flag system detected — risky features deployed to all users simultaneously |

### DEPLOY_NO_ROLLBACK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | .github/workflows/:0 | No deployment rollback mechanism configured — bad deploy cannot be reverted quickly |

### DOCKER_BUILD_FAILS (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 | No Dockerfile found for backend |
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 | No Dockerfile found for frontend |
| HIGH | /Users/danielpenin/whatsapp_saas/docker-compose.yml:29 | docker-compose backend depends_on without healthcheck condition |
| HIGH | /Users/danielpenin/whatsapp_saas/docker-compose.yml:61 | docker-compose worker depends_on without healthcheck condition |

### DR_BACKUP_INCOMPLETE (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | No backup manifest found — cannot verify which data stores are backed up |
| CRITICAL | .backup-manifest.json:0 | POSTGRES backup not configured — data store at risk of permanent loss |
| CRITICAL | .backup-manifest.json:0 | REDIS backup not configured — data store at risk of permanent loss |
| CRITICAL | .backup-manifest.json:0 | S3 backup not configured — data store at risk of permanent loss |
| CRITICAL | .backup-manifest.json:0 | SECRETS backup not configured — data store at risk of permanent loss |

### DR_CANNOT_REBUILD (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/prisma/seed.ts:0 | No Prisma seed script found — after disaster recovery, initial system state cannot be restored |

### DR_NO_RUNBOOK (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | docs/DISASTER_RECOVERY.md:0 | No DR runbook found — incident response will be slow and error-prone without documented steps |
| HIGH | .dr-test.log:0 | No DR test record found — disaster recovery has never been tested |

### DR_RPO_TOO_HIGH (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | Backup frequency not configured — RPO (Recovery Point Objective) is undefined |

### E2E_FLOW_NOT_TESTED (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/e2e:0 | E2E directory exists but no Playwright or Cypress config found — tests cannot run |
| HIGH | e2e:0 | No E2E test found for "Product creation" flow |
| HIGH | .github/workflows/:0 | E2E tests exist but are not included in CI pipeline — they will never catch regressions |

### E2E_REGISTRATION_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/auth/auth.controller.ts:36 | POST /auth/register did not return 201 |

### EDGE_CASE_ARRAY (13)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/dto/create-coupon.dto.ts:25 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-order.dto.ts:32 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-product.dto.ts:7 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:44 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:11 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:14 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:32 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/log-execution.dto.ts:5 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:5 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:9 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/kloel/dto/product-sub-resources.dto.ts:90 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/partnerships/dto/create-affiliate.dto.ts:22 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |

### EDGE_CASE_DATE (277)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/analytics/analytics.controller.ts:18 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.controller.ts:20 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:11 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:13 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:132 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:213 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:313 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:434 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:17 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:39 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/api-keys/api-keys.service.ts:49 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:28 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:60 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1092 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1198 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:217 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:307 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:471 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:508 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:526 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:536 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:549 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:592 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:638 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1184 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1190 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1199 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1205 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1241 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1663 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1710 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1764 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1795 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1872 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2091 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2121 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:362 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:443 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:456 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:487 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:62 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:63 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:123 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:181 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:470 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:479 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:486 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:717 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:799 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:149 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:208 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:215 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:44 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:45 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:57 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:58 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:293 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/campaigns/campaigns.service.ts:89 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:85 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:145 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-public.controller.ts:50 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:167 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:192 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:404 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:352 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:677 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:149 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:198 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/crm.service.ts:454 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/neuro-crm.service.ts:447 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:69 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:410 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:412 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:475 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:494 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:110 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:170 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:188 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:21 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:33 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:87 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/smart-time.service.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:35 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/i18n/i18n.service.ts:333 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/inbox/inbox.service.ts:146 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:46 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:93 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:321 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:413 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:500 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:602 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/cart-recovery.service.ts:73 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:567 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:568 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:57 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:103 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:141 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:183 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:312 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:319 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:330 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:345 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/external-payment.service.ts:374 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/external-payment.service.ts:490 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guards/kloel-security.guard.ts:231 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:83 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:276 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:277 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:582 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:624 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:661 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1400 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1506 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2933 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:162 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:187 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:402 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:455 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:499 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/middleware/audit-log.middleware.ts:92 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/order-alerts.service.ts:226 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:143 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:148 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:192 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:123 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:126 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:223 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:315 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:364 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:464 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:480 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1510 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1906 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2038 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2944 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2962 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3395 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3449 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3473 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3586 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3600 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3605 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3608 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3611 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3614 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3617 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3706 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3739 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3882 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4205 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4272 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4273 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4292 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:5020 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:198 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:199 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:228 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:55 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:77 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.controller.ts:97 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.service.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:50 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:354 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:382 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:406 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/logging/structured-logger.ts:21 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:370 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:423 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:203 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:289 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:203 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:211 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:306 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:307 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:339 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:132 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:216 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:13 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:15 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:345 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:77 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/asaas-webhook.controller.ts:141 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:132 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:290 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:721 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:734 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:203 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:217 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:409 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:416 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:187 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:367 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:446 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:546 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:561 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:731 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:167 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:459 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:542 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:625 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:647 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:878 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:879 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:994 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1012 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1083 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1460 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1471 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1499 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1507 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/agent-events.service.ts:126 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:368 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:410 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:520 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:529 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:805 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2229 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2282 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2305 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2342 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2417 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:230 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:400 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:507 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:609 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:622 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:679 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:697 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:936 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:301 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:90 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:96 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:152 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:297 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:446 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:451 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:583 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:459 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:544 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:616 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:619 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:759 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1349 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1362 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1395 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1430 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1453 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1535 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:186 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:562 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:567 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:684 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:809 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:833 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:938 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:991 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:587 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:649 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:718 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1601 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2145 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2445 | new Date() from user input without validation — invalid dates produce Invalid Date silently |

### EDGE_CASE_FILE (19)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:104 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:107 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:23 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:39 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:39 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:59 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:67 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:16 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:50 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:88 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:154 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kyc/kyc.controller.ts:18 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:46 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:49 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:82 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:85 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/media/media.controller.ts:24 | File upload without size limit — large files may exhaust memory or storage |

### EDGE_CASE_NUMBER (39)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:8 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:9 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:19 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:20 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:21 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:22 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:25 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:26 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:27 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:28 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:29 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:31 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:34 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:13 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:14 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:16 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:8 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:11 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:9 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:10 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:13 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:40 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:42 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:48 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:16 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:17 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:24 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:25 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:55 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:56 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:57 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:99 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:108 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:109 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:114 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:115 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:6 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |

### EDGE_CASE_PAGINATION (13)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/audit/audit.controller.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/autopilot/segmentation.controller.ts:50 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/checkout/checkout.controller.ts:324 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/checkout/checkout.controller.ts:325 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/flows/flows.controller.ts:257 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/leads.controller.ts:18 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/memory.controller.ts:104 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/mercadopago.controller.ts:111 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/wallet.controller.ts:119 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/meta/instagram/instagram.controller.ts:41 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:39 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:55 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |

### EDGE_CASE_STRING (153)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/auth/dto/register.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:22 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:30 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:35 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:36 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:37 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:38 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:39 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:40 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:41 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:42 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-pixel.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-pixel.dto.ts:16 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:22 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:23 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:25 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:26 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:27 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:28 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:29 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:30 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:39 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:46 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:47 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:52 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:53 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:54 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:3 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:3 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/log-execution.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/save-flow-version.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:22 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:23 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:34 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:35 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:36 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:42 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:43 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:44 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:54 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:58 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:62 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:70 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:71 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:72 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:73 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:77 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:78 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:79 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:80 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:88 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:89 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:98 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:100 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:110 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:116 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/media/dto/generate-video.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/media/dto/generate-video.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/media/dto/generate-video.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:3 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:28 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:32 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |

### EMAIL_NO_AUTH (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM |
| HIGH | backend/src/marketing/marketing.controller.ts:0 | Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM |

### FACADE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:330 | [fake_save] setTimeout resets state without API call — fake save feedback |

### IDEMPOTENCY_FINANCIAL (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/billing/payment-method.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:0 | Asaas payment call without idempotency key — Asaas supports idempotency but it is not used |
| CRITICAL | backend/src/checkout/checkout.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/checkout/checkout.service.ts:0 | Asaas payment call without idempotency key — Asaas supports idempotency but it is not used |
| CRITICAL | backend/src/kloel/payment.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/kloel/payment.service.ts:0 | Asaas payment call without idempotency key — Asaas supports idempotency but it is not used |
| CRITICAL | backend/src/reports/reports.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |

### IDEMPOTENCY_JOB (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/health/health.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/mass-send/mass-send.worker.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/metrics/queue-health.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/ops/ops.controller.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/webhooks/webhook-dispatcher.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |

### IDEMPOTENCY_MISSING (44)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/affiliate/affiliate.controller.ts:311 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/affiliate/affiliate.controller.ts:462 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:61 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:70 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/api-keys/api-keys.controller.ts:29 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/audio/audio.controller.ts:17 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/campaigns/campaigns.controller.ts:30 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/checkout/checkout-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/flows/flow-template.controller.ts:27 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/flows/flows.controller.ts:126 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/flows/flows.controller.ts:282 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/followup/followup.controller.ts:42 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/ad-rules.controller.ts:40 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/canvas.controller.ts:52 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.controller.ts:475 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.controller.ts:566 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.controller.ts:599 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:61 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:116 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:171 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:230 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:296 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:369 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:407 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product.controller.ts:164 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product.controller.ts:374 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/sales.controller.ts:198 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/sales.controller.ts:246 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/sales.controller.ts:294 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/site.controller.ts:131 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/wallet.controller.ts:138 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/webinar.controller.ts:36 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:211 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:347 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:480 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:882 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/meta/webhooks/meta-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/reports/reports.controller.ts:155 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/webhooks/asaas-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/webhooks/webhook-settings.controller.ts:26 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/webhooks/webhook-settings.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |

### LGPD_NON_COMPLIANT (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | frontend/src/app/:0 | No privacy policy page found — LGPD requires accessible privacy notice |
| CRITICAL | frontend/src/app/:0 | No terms of service page found — required for user agreements and LGPD consent |
| CRITICAL | frontend/src/:0 | No cookie consent mechanism found — LGPD requires explicit user consent for cookies |
| CRITICAL | frontend/src/app/checkout/:0 | Checkout form lacks explicit data-use consent checkbox — required by LGPD |
| CRITICAL | .data-retention.json:0 | No data retention policy defined — LGPD requires defined retention periods per data category |

### LICENSE_UNKNOWN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | .license-allowlist.json:0 | No license allowlist found — create .license-allowlist.json to document approved exceptions |

### MIGRATION_NO_ROLLBACK (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/prisma/migrations/20251209150035_init_baseline/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20251211173746_add_document_model/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20251211193956_add_external_payment_links/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20251211202429_add_cancel_at_period_end/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260319170000_autonomy_runtime_ledger/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260320183000_account_agency_canonical_models/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260327200000_add_kloel_sites_designs_subscriptions_orders/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260328010000_add_partnerships_payment_relations_enums/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260328020000_add_bank_accounts_anticipations/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260328040000_add_missing_product_member_affiliate_tables/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260328050000_add_checkout_system/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260328060000_add_kyc_models/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260330000000_add_meta_connection/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260331000000_add_webhook_event/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | .github/workflows/:0 | CI runs Prisma migrations without taking a DB backup first |

### MONITORING_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |

### NETWORK_OFFLINE_DATA_LOST (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |
| HIGH | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |

### NETWORK_SLOW_UNUSABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:0 | Page fetches async data but has no loading state — blank/broken UI on slow network |

### NEXTJS_NO_IMAGE_COMPONENT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/products/ProductNerveCenter.tsx:417 | `<img>` used instead of Next.js `<Image>` — missing optimization |

### OBSERVABILITY_NO_ALERTING (10)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout-payment.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout-webhook.controller.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/facebook-capi.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/external-payment.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/payment.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/smart-payment.controller.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/wallet.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |

### OBSERVABILITY_NO_TRACING (23)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/audio/transcription.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/auth.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/email.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/billing/billing.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/checkout/facebook-capi.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/common/storage/storage.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/crm/crm.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/health/system-health.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/asaas.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/audio.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/mercadopago.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/middleware/audit-log.middleware.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/site.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/marketing/marketing.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/media/media.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/meta/meta-auth.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/meta/meta-sdk.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/whatsapp/providers/whatsapp-api.provider.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/whatsapp/whatsapp-watchdog.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |

### ORDERING_WEBHOOK_OOO (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout.module.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/meta/meta.module.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/meta/webhooks/meta-webhook.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhook-dispatcher.service.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhook-settings.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhooks.module.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |

### RACE_CONDITION_DATA_CORRUPTION (19)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/billing/payment-method.service.ts:33 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/conversational-onboarding.service.ts:464 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/external-payment.service.ts:70 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/external-payment.service.ts:319 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/external-payment.service.ts:342 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:1258 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:1282 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:1645 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:1990 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:2020 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:2340 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/kloel.service.ts:2852 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/memory-management.service.ts:482 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/order-alerts.service.ts:219 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/payment.service.ts:134 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:1813 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:1921 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:2017 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:3434 | Read-modify-write without transaction or optimistic lock — race condition possible |

### RACE_CONDITION_FINANCIAL (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/kloel/asaas.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |

### RACE_CONDITION_OVERWRITE (13)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/billing.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/billing/payment-method.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/checkout/checkout-payment.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/ad-rules-engine.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/cart-recovery.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/external-payment.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/kloel.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/order-alerts.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/payment.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/wallet.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |

### ROUTE_NO_CALLER (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/upload.controller.ts:71 | POST /kloel/upload is not called by any frontend code |

### STATE_PAYMENT_INVALID (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:145 | Payment status set to PAID without verifying PROCESSING intermediate state |

### TEST_NO_ASSERTION (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:90 | Hardcoded sleep of 10000ms in test — use jest.useFakeTimers() or await event instead |

### TIMEZONE_REPORT_MISMATCH (10)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/analytics/smart-time/smart-time.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/checkout/checkout-payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/checkout/checkout-public.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/external-payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/smart-payment.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/wallet.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/wallet.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/reports/reports.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/reports/reports.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |

### UI_DEAD_HANDLER (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:677 | form "form" has dead handler |

### WEBHOOK_ASAAS_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/health/system-health.controller.ts:12 | Backend unreachable — GET /health/system timed out or connection refused |

---

## CORRECTION PROMPT

```
Fix the following blocking issues found by PULSE certification:

1. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/checkout/checkout-payment.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
2. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/checkout/checkout.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
3. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/mercadopago.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
4. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/payment.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
5. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/smart-payment.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
6. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/unified-agent.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
7. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/audit/audit.interceptor.ts:0 — Potentially sensitive fields (password/token/CPF) may be logged in AuditLog
   Evidence: Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits
8. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/middleware/audit-log.middleware.ts:0 — Potentially sensitive fields (password/token/CPF) may be logged in AuditLog
   Evidence: Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits
9. [BACKUP_MISSING] .backup-manifest.json:0 — No recent DB backup found — backup manifest missing or older than 24 h
   Evidence: No backup manifest at /Users/danielpenin/whatsapp_saas/.backup-manifest.json; set BACKUP_MANIFEST_PATH or create one
10. [BACKUP_MISSING] docs/RESTORE.md:0 — No DB restore runbook or restore script found in repo
   Evidence: Expected one of: docs/RESTORE.md, scripts/restore.sh, scripts/db-restore.ts, RESTORE.md
11. [BACKUP_MISSING] .backup-validation.log:0 — No backup restore-test validation log found — backup has never been verified
   Evidence: A restore test must be performed and logged; create .backup-validation.log with timestamp + result
12. [BACKUP_MISSING] .backup-policy.json:0 — Backup retention policy undefined — set BACKUP_RETENTION_DAYS env var or .backup-policy.json
   Evidence: Without a retention policy, old backups may be deleted before they are needed or fill storage indefinitely
13. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No privacy policy page found — LGPD requires accessible privacy notice
   Evidence: Expected one of: /app/privacy/page.tsx, /app/politica-de-privacidade/page.tsx, /app/privacy-policy/page.tsx
14. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No terms of service page found — required for user agreements and LGPD consent
   Evidence: Expected one of: /app/terms/page.tsx, /app/termos/page.tsx, /app/terms-of-service/page.tsx, /app/termos-de-uso/page.tsx
15. [LGPD_NON_COMPLIANT] frontend/src/:0 — No cookie consent mechanism found — LGPD requires explicit user consent for cookies
   Evidence: Add a CookieBanner component or useCookieConsent hook; store consent in cookie/localStorage
16. [LGPD_NON_COMPLIANT] frontend/src/app/checkout/:0 — Checkout form lacks explicit data-use consent checkbox — required by LGPD
   Evidence: Add a required checkbox linking to privacy policy before payment submission
17. [LGPD_NON_COMPLIANT] .data-retention.json:0 — No data retention policy defined — LGPD requires defined retention periods per data category
   Evidence: Create .data-retention.json mapping data types to retention periods, or set DATA_RETENTION_DAYS env var
18. [RACE_CONDITION_DATA_CORRUPTION] backend/src/billing/payment-method.service.ts:33 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 33 followed by update at line 59 without $transaction or version check
19. [RACE_CONDITION_FINANCIAL] backend/src/kloel/asaas.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
20. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/conversational-onboarding.service.ts:464 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 464 followed by update at line 516 without $transaction or version check
21. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/external-payment.service.ts:70 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 70 followed by update at line 81 without $transaction or version check
22. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/external-payment.service.ts:319 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 319 followed by update at line 325 without $transaction or version check
23. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/external-payment.service.ts:342 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 342 followed by update at line 369 without $transaction or version check
24. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:1258 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1258 followed by update at line 1264 without $transaction or version check
25. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:1282 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1282 followed by update at line 1307 without $transaction or version check
26. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:1645 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1645 followed by update at line 1675 without $transaction or version check
27. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:1990 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1990 followed by update at line 2002 without $transaction or version check
28. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:2020 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 2020 followed by update at line 2037 without $transaction or version check
29. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:2340 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 2340 followed by update at line 2370 without $transaction or version check
30. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/kloel.service.ts:2852 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 2852 followed by update at line 2946 without $transaction or version check
31. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/memory-management.service.ts:482 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 482 followed by update at line 493 without $transaction or version check
32. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/order-alerts.service.ts:219 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 219 followed by update at line 224 without $transaction or version check
33. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/payment.service.ts:134 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 134 followed by update at line 141 without $transaction or version check
34. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:1813 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1813 followed by update at line 1901 without $transaction or version check
35. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:1921 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1921 followed by update at line 1936 without $transaction or version check
36. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:2017 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 2017 followed by update at line 2027 without $transaction or version check
37. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:3434 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 3434 followed by update at line 3452 without $transaction or version check
38. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — No backup manifest found — cannot verify which data stores are backed up
   Evidence: Create .backup-manifest.json with: { postgres: true/false, redis: true/false, s3: true/false, secrets: true/false }
39. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — POSTGRES backup not configured — data store at risk of permanent loss
   Evidence: Add "postgres": true to backup manifest after setting up automated backup for this data store
40. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — REDIS backup not configured — data store at risk of permanent loss
   Evidence: Add "redis": true to backup manifest after setting up automated backup for this data store
41. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — S3 backup not configured — data store at risk of permanent loss
   Evidence: Add "s3": true to backup manifest after setting up automated backup for this data store
42. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — SECRETS backup not configured — data store at risk of permanent loss
   Evidence: Add "secrets": true to backup manifest after setting up automated backup for this data store
43. [DR_RPO_TOO_HIGH] .backup-manifest.json:0 — Backup frequency not configured — RPO (Recovery Point Objective) is undefined
   Evidence: Set BACKUP_FREQUENCY_MINUTES env var or add frequencyMinutes to manifest; target ≤60 min for financial data
44. [DR_CANNOT_REBUILD] backend/prisma/seed.ts:0 — No Prisma seed script found — after disaster recovery, initial system state cannot be restored
   Evidence: Create prisma/seed.ts with initial workspace, plans, config data; run via prisma db seed
45. [E2E_REGISTRATION_BROKEN] backend/src/auth/auth.controller.ts:36 — POST /auth/register did not return 201
   Evidence: Status: 0, Body: {"error":"fetch failed"}
46. [IDEMPOTENCY_FINANCIAL] backend/src/billing/payment-method.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
47. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout-payment.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
48. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout-payment.service.ts:0 — Asaas payment call without idempotency key — Asaas supports idempotency but it is not used
   Evidence: Pass the idempotency key to Asaas via X-Idempotency-Key header to prevent double-charge at provider level
49. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
50. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout.service.ts:0 — Asaas payment call without idempotency key — Asaas supports idempotency but it is not used
   Evidence: Pass the idempotency key to Asaas via X-Idempotency-Key header to prevent double-charge at provider level
51. [IDEMPOTENCY_FINANCIAL] backend/src/kloel/payment.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
52. [IDEMPOTENCY_FINANCIAL] backend/src/kloel/payment.service.ts:0 — Asaas payment call without idempotency key — Asaas supports idempotency but it is not used
   Evidence: Pass the idempotency key to Asaas via X-Idempotency-Key header to prevent double-charge at provider level
53. [IDEMPOTENCY_FINANCIAL] backend/src/reports/reports.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
54. [BRUTE_FORCE_VULNERABLE] backend/src (POST /auth/login):0 — No rate limiting on POST /auth/login — brute-force attack is possible
   Evidence: Fired 20 rapid login requests. Received 0 HTTP 429 responses. All statuses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]. The auth throttle (5 req/min) does not appear to be active. Configure @nestjs/throttler on the auth controller.
55. [STATE_PAYMENT_INVALID] backend/src/checkout/checkout-payment.service.ts:145 — Payment status set to PAID without verifying PROCESSING intermediate state
   Evidence: data: { status: 'PAID', paidAt: new Date() }, — payment must transition PENDING → PROCESSING → PAID, never jump directly
56. [WEBHOOK_ASAAS_BROKEN] backend/src/health/system-health.controller.ts:12 — Backend unreachable — GET /health/system timed out or connection refused
   Evidence: Backend URL: http://localhost:3001, error: fetch failed
57. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:330 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(()=>setSaved(false),2000);
58. [AUDIT_DELETION_NO_LOG] backend/src/ai-brain/knowledge-base.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
59. [AUDIT_DELETION_NO_LOG] backend/src/analytics/advanced-analytics.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
60. [AUDIT_DELETION_NO_LOG] backend/src/api-keys/api-keys.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
61. [AUDIT_DELETION_NO_LOG] backend/src/auth/auth.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
62. [AUDIT_DELETION_NO_LOG] backend/src/checkout/checkout.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
63. [AUDIT_DELETION_NO_LOG] backend/src/crm/crm.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
64. [AUDIT_DELETION_NO_LOG] backend/src/kloel/asaas.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
65. [AUDIT_DELETION_NO_LOG] backend/src/kloel/conversational-onboarding.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
66. [AUDIT_DELETION_NO_LOG] backend/src/kloel/external-payment.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
67. [AUDIT_DELETION_NO_LOG] backend/src/kloel/guest-chat.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
68. [AUDIT_DELETION_NO_LOG] backend/src/kloel/memory-management.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
69. [AUDIT_DELETION_NO_LOG] backend/src/kloel/memory.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
70. [AUDIT_DELETION_NO_LOG] backend/src/kloel/mercadopago.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
71. [AUDIT_DELETION_NO_LOG] backend/src/kyc/kyc.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
72. [AUDIT_DELETION_NO_LOG] backend/src/notifications/notifications.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
73. [AUDIT_DELETION_NO_LOG] backend/src/partnerships/partnerships.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
74. [AUDIT_DELETION_NO_LOG] backend/src/team/team.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
75. [AUDIT_DELETION_NO_LOG] backend/src/whatsapp/agent-events.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
76. [AUDIT_DELETION_NO_LOG] backend/src/whatsapp/cia-runtime.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
77. [NETWORK_OFFLINE_DATA_LOST] frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
78. [NETWORK_OFFLINE_DATA_LOST] frontend/src/app/(checkout)/components/CheckoutNoir.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
79. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(checkout)/hooks/useCheckout.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
80. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/canvas/inicio/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
81. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/canvas/modelos/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
82. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/inbox/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
83. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/products/new/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
84. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/webinarios/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
85. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/onboarding-chat/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
86. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/anonymous/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
87. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/check-email/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
88. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/google/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
89. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/login/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
90. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/refresh/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
91. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/register/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
92. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
93. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/verify/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
94. [CACHE_STALE_AFTER_WRITE] frontend/src/components/canvas/CanvasEditor.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
95. [CACHE_STALE_AFTER_WRITE] frontend/src/components/checkout/KloelChatBubble.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
96. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/anuncios/AnunciosView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
97. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/carteira.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
98. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/chat-container.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
99. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/conta/ContaView.tsx:1824 — SWR cache key is not scoped to workspace — cross-tenant cache leakage risk
   Evidence: Key '/team' should include workspaceId: `/api/resource/${workspaceId}`
100. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/dashboard/KloelDashboard.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
101. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/home/HomeScreen.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
102. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/landing/FloatingChat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
103. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/marketing/MarketingView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
104. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
105. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/produtos/ProdutosView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
106. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/sites/SitesView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
107. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/vendas/VendasView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
108. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanAIConfigTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
109. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanAffiliateTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
110. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanPaymentTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
111. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanPaymentTab.tsx:0 — Financial write without any cache invalidation strategy — user may see wrong balance
   Evidence: After wallet/payment mutations, call mutate() immediately to show updated balance
112. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanShippingTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
113. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanStoreTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
114. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanThankYouTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
115. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/CheckoutConfigPage.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
116. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductAfterPayTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
117. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCheckoutsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
118. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCommissionsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
119. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCouponsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
120. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductGeneralTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
121. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductIATab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
122. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductPlansTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
123. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductReviewsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
124. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductUrlsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
125. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useCRM.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
126. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useCanvasAI.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
127. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useCanvasDesigns.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
128. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useConversationHistory.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
129. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useMemberAreas.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
130. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/usePartnerships.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
131. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useProducts.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
132. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/anonymous-session.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
133. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/asaas.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
134. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/auth.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
135. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/autopilot.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
136. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/billing.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
137. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/billing.ts:0 — Financial write without any cache invalidation strategy — user may see wrong balance
   Evidence: After wallet/payment mutations, call mutate() immediately to show updated balance
138. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/campaigns.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
139. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/cia.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
140. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/conversations.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
141. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/core.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
142. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/crm.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
143. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/flows.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
144. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/kloel-api.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
145. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/kloel.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
146. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/meta.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
147. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/misc.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
148. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/pipeline.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
149. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/products.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
150. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/team.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
151. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/whatsapp-api.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
152. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/whatsapp.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
153. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/workspace.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
154. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/media-upload.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
155. [CACHE_REDIS_STALE] backend/src/analytics/advanced-analytics.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
156. [CACHE_REDIS_STALE] backend/src/autopilot/autopilot.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
157. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
158. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:86 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
159. [CACHE_REDIS_STALE] backend/src/inbox/smart-routing.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
160. [CACHE_REDIS_STALE] backend/src/kloel/asaas.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
161. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
162. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:412 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
163. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:644 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
164. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:645 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
165. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:646 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
166. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:647 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
167. [CACHE_REDIS_STALE] backend/src/kloel/external-payment.service.ts:648 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
168. [CACHE_REDIS_STALE] backend/src/kloel/guest-chat.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
169. [CACHE_REDIS_STALE] backend/src/kloel/memory-management.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
170. [CACHE_REDIS_STALE] backend/src/kloel/mercadopago.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
171. [CACHE_REDIS_STALE] backend/src/partnerships/partnerships.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
172. [CACHE_REDIS_STALE] backend/src/whatsapp/agent-events.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
173. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas:0 — No deployment configuration found
   Evidence: Neither railway.toml/railway.json nor vercel.json/.vercel found. Deployment target is not declared.
174. [EMAIL_NO_AUTH] backend/src/campaigns/campaigns.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
175. [EMAIL_NO_AUTH] backend/src/kloel/email-campaign.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
176. [EMAIL_NO_AUTH] backend/src/marketing/marketing.controller.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
177. [RACE_CONDITION_OVERWRITE] backend/src/billing/billing.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
178. [RACE_CONDITION_OVERWRITE] backend/src/billing/payment-method.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
179. [RACE_CONDITION_OVERWRITE] backend/src/checkout/checkout-payment.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
180. [RACE_CONDITION_OVERWRITE] backend/src/checkout/checkout.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
181. [RACE_CONDITION_OVERWRITE] backend/src/kloel/ad-rules-engine.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
182. [RACE_CONDITION_OVERWRITE] backend/src/kloel/cart-recovery.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
183. [RACE_CONDITION_OVERWRITE] backend/src/kloel/conversational-onboarding.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
184. [RACE_CONDITION_OVERWRITE] backend/src/kloel/external-payment.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
185. [RACE_CONDITION_OVERWRITE] backend/src/kloel/kloel.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
186. [RACE_CONDITION_OVERWRITE] backend/src/kloel/memory-management.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
187. [RACE_CONDITION_OVERWRITE] backend/src/kloel/order-alerts.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
188. [RACE_CONDITION_OVERWRITE] backend/src/kloel/payment.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
189. [RACE_CONDITION_OVERWRITE] backend/src/kloel/wallet.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
190. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:21 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
191. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:58 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
192. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:83 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
193. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:110 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
194. [COST_LLM_NO_LIMIT] backend/src/ai-brain/hidden-data.service.ts:30 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
195. [COST_LLM_NO_LIMIT] backend/src/ai-brain/media-factory.service.ts:21 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.images.generate({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
196. [COST_LLM_NO_LIMIT] backend/src/ai-brain/media-factory.service.ts:49 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
197. [COST_LLM_NO_LIMIT] backend/src/ai-brain/vector.service.ts:24 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.embeddings.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
198. [COST_LLM_NO_LIMIT] backend/src/audio/audio.controller.ts:37 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await openai.audio.speech.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
199. [COST_LLM_NO_LIMIT] backend/src/audio/transcription.service.ts:70 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: 'https://api.openai.com/v1/audio/transcriptions', — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
200. [COST_LLM_NO_LIMIT] backend/src/audio/transcription.service.ts:97 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: 'https://api.openai.com/v1/audio/transcriptions', — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
201. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.service.ts:835 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
202. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.service.ts:1844 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
203. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.service.ts:2032 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
204. [COST_LLM_NO_LIMIT] backend/src/campaigns/campaigns.service.ts:336 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
205. [COST_LLM_NO_LIMIT] backend/src/copilot/copilot.service.ts:74 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
206. [COST_LLM_NO_LIMIT] backend/src/copilot/copilot.service.ts:167 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
207. [COST_LLM_NO_LIMIT] backend/src/crm/neuro-crm.service.ts:148 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
208. [COST_LLM_NO_LIMIT] backend/src/crm/neuro-crm.service.ts:199 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
209. [COST_LLM_NO_LIMIT] backend/src/flows/flow-optimizer.service.ts:49 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
210. [COST_LLM_NO_LIMIT] backend/src/i18n/i18n.service.ts:215 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
211. [COST_LLM_NO_LIMIT] backend/src/i18n/i18n.service.ts:288 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
212. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:40 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: transcription = await this.openai.audio.transcriptions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
213. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:52 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: transcription = await this.openai.audio.transcriptions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
214. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:138 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.audio.speech.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
215. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:162 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.audio.speech.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
216. [COST_LLM_NO_LIMIT] backend/src/kloel/canvas.controller.ts:157 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await openai.images.generate({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
217. [COST_LLM_NO_LIMIT] backend/src/kloel/canvas.controller.ts:169 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: async generateText( — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
218. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:18 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const ONBOARDING_TOOLS: OpenAI.ChatCompletionTool[] = [ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
219. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:352 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
220. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:354 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: messages: messages as unknown as OpenAI.ChatCompletionMessageParam[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
221. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:400 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const finalResponse = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
222. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:402 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: messages: messages as unknown as OpenAI.ChatCompletionMessageParam[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
223. [COST_LLM_NO_LIMIT] backend/src/kloel/guest-chat.service.ts:140 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
224. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:936 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: assistantMessage as unknown as OpenAI.ChatCompletionMessageParam, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
225. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:937 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ...(toolMessages as unknown as OpenAI.ChatCompletionMessageParam[]), — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
226. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:938 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ] as OpenAI.ChatCompletionMessageParam[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
227. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:995 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: AsyncIterable<OpenAI.ChatCompletionChunk> — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
228. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:998 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create( — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
229. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1007 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ) as Promise<AsyncIterable<OpenAI.ChatCompletionChunk>>, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
230. [COST_LLM_NO_LIMIT] backend/src/kloel/memory.service.ts:39 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.embeddings.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
231. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:127 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
232. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:130 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Chat.ChatCompletion> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
233. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:133 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: () => client.chat.completions.create(normalizedParams, requestOptions), — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
234. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:143 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Embeddings.EmbeddingCreateParams, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
235. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:145 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
236. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:154 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Audio.Speech.SpeechCreateParams, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
237. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:189 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
238. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:193 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Chat.ChatCompletion> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
239. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:221 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
240. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:222 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
241. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:238 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: return payload as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming; — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
242. [COST_LLM_NO_LIMIT] backend/src/kloel/pdf-processor.service.ts:54 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
243. [COST_LLM_NO_LIMIT] backend/src/kloel/site.controller.ts:68 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: 'https://api.openai.com/v1/chat/completions', — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
244. [COST_LLM_NO_LIMIT] backend/src/kloel/site.controller.ts:99 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await fetch('https://api.anthropic.com/v1/messages', { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
245. [COST_LLM_NO_LIMIT] backend/src/kloel/smart-payment.service.ts:89 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const aiResponse = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
246. [COST_LLM_NO_LIMIT] backend/src/kloel/smart-payment.service.ts:284 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
247. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.service.ts:3324 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: response: OpenAI.Chat.Completions.ChatCompletion, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
248. [COST_NO_TRACKING] backend/src/:0 — LLM API calls made without recording token usage per workspace — cannot bill or limit costs
   Evidence: After each LLM call, record: workspaceId, model, promptTokens, completionTokens, totalTokens, cost, timestamp
249. [COST_LLM_NO_LIMIT] backend/src/:0 — No per-workspace LLM token budget enforcement found — one workspace can exhaust entire monthly budget
   Evidence: Add workspace.llmTokensRemaining check before LLM calls; set plan-based limits in workspace settings
250. [COST_NO_TRACKING] backend/src/:0 — No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit
   Evidence: Trigger notification at 80% and 95% of monthly LLM budget; send email/WhatsApp alert to workspace owner
251. [COST_LLM_NO_LIMIT] backend/src/analytics/smart-time/smart-time.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
252. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
253. [COST_LLM_NO_LIMIT] backend/src/billing/billing.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
254. [COST_LLM_NO_LIMIT] backend/src/billing/plan-limits.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
255. [COST_LLM_NO_LIMIT] backend/src/cia/cia.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
256. [COST_LLM_NO_LIMIT] backend/src/flows/flows.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
257. [COST_LLM_NO_LIMIT] backend/src/inbox/inbox.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
258. [COST_LLM_NO_LIMIT] backend/src/kloel/asaas.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
259. [COST_LLM_NO_LIMIT] backend/src/kloel/email-campaign.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
260. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.autonomy-proof.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
261. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
262. [COST_LLM_NO_LIMIT] backend/src/kloel/middleware/audit-log.middleware.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
263. [COST_LLM_NO_LIMIT] backend/src/kloel/smart-payment.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
264. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
265. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
266. [COST_LLM_NO_LIMIT] backend/src/lib/env.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
267. [COST_LLM_NO_LIMIT] backend/src/mass-send/mass-send.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
268. [COST_LLM_NO_LIMIT] backend/src/mass-send/mass-send.worker.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
269. [COST_LLM_NO_LIMIT] backend/src/meta/instagram/instagram.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
270. [COST_LLM_NO_LIMIT] backend/src/meta/instagram/instagram.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
271. [COST_LLM_NO_LIMIT] backend/src/meta/messenger/messenger.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
272. [COST_LLM_NO_LIMIT] backend/src/meta/messenger/messenger.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
273. [COST_LLM_NO_LIMIT] backend/src/meta/webhooks/meta-webhook.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
274. [COST_LLM_NO_LIMIT] backend/src/notifications/notifications.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
275. [COST_LLM_NO_LIMIT] backend/src/partnerships/partnerships.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
276. [COST_LLM_NO_LIMIT] backend/src/partnerships/partnerships.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
277. [COST_LLM_NO_LIMIT] backend/src/partnerships/partnerships.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
278. [COST_LLM_NO_LIMIT] backend/src/public-api/public-api.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
279. [COST_LLM_NO_LIMIT] backend/src/webhooks/asaas-webhook.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
280. [COST_LLM_NO_LIMIT] backend/src/webhooks/payment-webhook.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
281. [COST_LLM_NO_LIMIT] backend/src/webhooks/webhooks.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
282. [COST_LLM_NO_LIMIT] backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
283. [COST_LLM_NO_LIMIT] backend/src/whatsapp/cia-runtime.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
284. [COST_LLM_NO_LIMIT] backend/src/whatsapp/cia-runtime.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
285. [COST_LLM_NO_LIMIT] backend/src/whatsapp/controllers/whatsapp-api.controller.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
286. [COST_LLM_NO_LIMIT] backend/src/whatsapp/controllers/whatsapp-api.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
287. [COST_LLM_NO_LIMIT] backend/src/whatsapp/inbound-processor.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
288. [COST_LLM_NO_LIMIT] backend/src/whatsapp/inbound-processor.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
289. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
290. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
291. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/web-agent.provider.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
292. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/whatsapp-api.provider.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
293. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp-catchup.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
294. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp-watchdog.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
295. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
296. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
297. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
298. [CRUD_BROKEN] backend/src/products:0 — CRUD CREATE — expected 200/201, got 0
   Evidence: {"error":"fetch failed"}
299. [DEPLOY_NO_ROLLBACK] .github/workflows/:0 — No deployment rollback mechanism configured — bad deploy cannot be reverted quickly
   Evidence: Configure Railway instant rollback or Docker image versioning with a CI step to revert to previous image tag
300. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20251209150035_init_baseline/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
301. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20251211173746_add_document_model/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
302. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20251211193956_add_external_payment_links/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
303. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20251211202429_add_cancel_at_period_end/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
304. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260319170000_autonomy_runtime_ledger/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
305. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260320183000_account_agency_canonical_models/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
306. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260327200000_add_kloel_sites_designs_subscriptions_orders/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
307. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260328010000_add_partnerships_payment_relations_enums/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
308. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260328020000_add_bank_accounts_anticipations/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
309. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260328040000_add_missing_product_member_affiliate_tables/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
310. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260328050000_add_checkout_system/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
311. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260328060000_add_kyc_models/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
312. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260330000000_add_meta_connection/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
313. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260331000000_add_webhook_event/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
314. [MIGRATION_NO_ROLLBACK] .github/workflows/:0 — CI runs Prisma migrations without taking a DB backup first
   Evidence: Add a pg_dump step before prisma migrate deploy in CI/CD to enable point-in-time restore if migration fails
315. [DR_NO_RUNBOOK] docs/DISASTER_RECOVERY.md:0 — No DR runbook found — incident response will be slow and error-prone without documented steps
   Evidence: Create docs/DISASTER_RECOVERY.md with: restore steps, redeploy steps, integrity checks, contacts
316. [DR_NO_RUNBOOK] .dr-test.log:0 — No DR test record found — disaster recovery has never been tested
   Evidence: Perform a DR drill (restore from backup to staging, verify data, measure RTO); log result in .dr-test.log
317. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
318. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 — No Dockerfile found for frontend
   Evidence: frontend/Dockerfile does not exist. Cannot build production Docker image.
319. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:29 — docker-compose backend depends_on without healthcheck condition
   Evidence: docker-compose.yml: "backend" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
320. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:61 — docker-compose worker depends_on without healthcheck condition
   Evidence: docker-compose.yml: "worker" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
321. [E2E_FLOW_NOT_TESTED] /Users/danielpenin/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
322. [E2E_FLOW_NOT_TESTED] e2e:0 — No E2E test found for "Product creation" flow
   Evidence: Add a Playwright/Cypress test that exercises the full Product creation user journey
323. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
324. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
325. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:104 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
326. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:107 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
327. [EDGE_CASE_PAGINATION] backend/src/audit/audit.controller.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit) : 50, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
328. [EDGE_CASE_STRING] backend/src/auth/dto/register.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
329. [EDGE_CASE_PAGINATION] backend/src/autopilot/segmentation.controller.ts:50 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: if (limit) overrides.limit = parseInt(limit, 10); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
330. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
331. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
332. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
333. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
334. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
335. [EDGE_CASE_PAGINATION] backend/src/checkout/checkout.controller.ts:324 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: page: page ? parseInt(page, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
336. [EDGE_CASE_PAGINATION] backend/src/checkout/checkout.controller.ts:325 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit: limit ? parseInt(limit, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
337. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
338. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
339. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
340. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
341. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-bump.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
342. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-bump.dto.ts:9 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
343. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
344. [EDGE_CASE_STRING] backend/src/checkout/dto/create-coupon.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
345. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:19 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
346. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:20 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
347. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:21 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
348. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:22 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
349. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
350. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
351. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
352. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
353. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
354. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
355. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
356. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:25 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
357. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:26 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
358. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:27 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
359. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:28 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
360. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:29 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
361. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
362. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:31 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
363. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:34 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
364. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:35 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
365. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:36 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
366. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:37 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
367. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:38 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
368. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:39 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
369. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:40 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
370. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:41 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
371. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:42 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
372. [EDGE_CASE_STRING] backend/src/checkout/dto/create-pixel.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
373. [EDGE_CASE_STRING] backend/src/checkout/dto/create-pixel.dto.ts:16 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
374. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
375. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
376. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:13 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
377. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:14 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
378. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:16 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
379. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
380. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
381. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
382. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
383. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
384. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-product.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
385. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
386. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-product.dto.ts:11 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
387. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
388. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
389. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
390. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
391. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
392. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
393. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:9 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
394. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:10 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
395. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
396. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
397. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:13 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
398. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
399. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
400. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
401. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
402. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
403. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
404. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:23 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
405. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
406. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:25 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
407. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:26 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
408. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:27 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
409. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
410. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:29 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
411. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
412. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:39 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
413. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:40 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
414. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:42 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
415. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:46 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
416. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:47 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
417. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:48 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
418. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:52 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
419. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:53 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
420. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:54 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
421. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
422. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
423. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
424. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
425. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
426. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
427. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
428. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
429. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
430. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
431. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
432. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
433. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
434. [EDGE_CASE_STRING] backend/src/flows/dto/log-execution.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
435. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
436. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
437. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
438. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
439. [EDGE_CASE_STRING] backend/src/flows/dto/save-flow-version.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
440. [EDGE_CASE_PAGINATION] backend/src/flows/flows.controller.ts:257 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit) : 50, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
441. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:23 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
442. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:39 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
443. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:39 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
444. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:59 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
445. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:67 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
446. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
447. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
448. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:16 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
449. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:17 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
450. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
451. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:23 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
452. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:24 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
453. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:25 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
454. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:34 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
455. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:35 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
456. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:36 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
457. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:42 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
458. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:43 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
459. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:44 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
460. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:54 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
461. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:55 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
462. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:56 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
463. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:57 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
464. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:58 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
465. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:62 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
466. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:70 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
467. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:71 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
468. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:72 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
469. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:73 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
470. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:77 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
471. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:78 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
472. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:79 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
473. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:80 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
474. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:88 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
475. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:89 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
476. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:98 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
477. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:99 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
478. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:100 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
479. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:108 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
480. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:109 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
481. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:110 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
482. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:114 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
483. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:115 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
484. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:116 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
485. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
486. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
487. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
488. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
489. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
490. [EDGE_CASE_PAGINATION] backend/src/kloel/leads.controller.ts:18 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const parsedLimit = limit ? Number(limit) : undefined; — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
491. [EDGE_CASE_PAGINATION] backend/src/kloel/memory.controller.ts:104 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: parseInt(page || '1'), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
492. [EDGE_CASE_PAGINATION] backend/src/kloel/mercadopago.controller.ts:111 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit: limit ? parseInt(limit, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
493. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:16 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
494. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:50 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
495. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:88 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
496. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:154 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
497. [EDGE_CASE_PAGINATION] backend/src/kloel/wallet.controller.ts:119 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: parseInt(page || '1'), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
498. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
499. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
500. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
501. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
502. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
503. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
504. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
505. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
506. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
507. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:18 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
508. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
509. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:46 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
510. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:49 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
511. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:82 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
512. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:85 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
513. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
514. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
515. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
516. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
517. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
518. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
519. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
520. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
521. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:24 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
522. [EDGE_CASE_PAGINATION] backend/src/meta/instagram/instagram.controller.ts:41 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit, 10) : 25, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
523. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:39 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
524. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:55 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
525. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
526. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
527. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
528. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
529. [EDGE_CASE_NUMBER] backend/src/partnerships/dto/create-affiliate.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
530. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
531. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
532. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
533. [EDGE_CASE_NUMBER] backend/src/pipeline/dto/create-deal.dto.ts:6 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
534. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
535. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
536. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
537. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
538. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
539. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
540. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
541. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
542. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
543. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
544. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
545. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
546. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
547. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
548. [IDEMPOTENCY_MISSING] backend/src/affiliate/affiliate.controller.ts:311 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
549. [IDEMPOTENCY_MISSING] backend/src/affiliate/affiliate.controller.ts:462 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
550. [IDEMPOTENCY_MISSING] backend/src/ai-brain/knowledge-base.controller.ts:61 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
551. [IDEMPOTENCY_MISSING] backend/src/ai-brain/knowledge-base.controller.ts:70 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
552. [IDEMPOTENCY_JOB] backend/src/ai-brain/knowledge-base.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
553. [IDEMPOTENCY_MISSING] backend/src/api-keys/api-keys.controller.ts:29 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
554. [IDEMPOTENCY_MISSING] backend/src/audio/audio.controller.ts:17 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
555. [IDEMPOTENCY_MISSING] backend/src/campaigns/campaigns.controller.ts:30 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
556. [IDEMPOTENCY_JOB] backend/src/campaigns/campaigns.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
557. [IDEMPOTENCY_MISSING] backend/src/checkout/checkout-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
558. [IDEMPOTENCY_MISSING] backend/src/flows/flow-template.controller.ts:27 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
559. [IDEMPOTENCY_MISSING] backend/src/flows/flows.controller.ts:126 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
560. [IDEMPOTENCY_MISSING] backend/src/flows/flows.controller.ts:282 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
561. [IDEMPOTENCY_MISSING] backend/src/followup/followup.controller.ts:42 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
562. [IDEMPOTENCY_JOB] backend/src/health/health.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
563. [IDEMPOTENCY_MISSING] backend/src/kloel/ad-rules.controller.ts:40 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
564. [IDEMPOTENCY_MISSING] backend/src/kloel/canvas.controller.ts:52 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
565. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.controller.ts:475 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
566. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.controller.ts:566 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
567. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.controller.ts:599 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
568. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
569. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:61 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
570. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:116 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
571. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:171 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
572. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:230 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
573. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:296 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
574. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:369 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
575. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:407 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
576. [IDEMPOTENCY_MISSING] backend/src/kloel/product.controller.ts:164 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
577. [IDEMPOTENCY_MISSING] backend/src/kloel/product.controller.ts:374 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
578. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:198 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
579. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:246 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
580. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:294 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
581. [IDEMPOTENCY_MISSING] backend/src/kloel/site.controller.ts:131 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
582. [IDEMPOTENCY_MISSING] backend/src/kloel/wallet.controller.ts:138 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
583. [IDEMPOTENCY_MISSING] backend/src/kloel/webinar.controller.ts:36 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
584. [IDEMPOTENCY_JOB] backend/src/mass-send/mass-send.worker.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
585. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:211 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
586. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:347 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
587. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:480 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
588. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:882 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
589. [IDEMPOTENCY_MISSING] backend/src/meta/webhooks/meta-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
590. [IDEMPOTENCY_JOB] backend/src/metrics/queue-health.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
591. [IDEMPOTENCY_JOB] backend/src/ops/ops.controller.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
592. [IDEMPOTENCY_MISSING] backend/src/reports/reports.controller.ts:155 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
593. [IDEMPOTENCY_MISSING] backend/src/webhooks/asaas-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
594. [IDEMPOTENCY_JOB] backend/src/webhooks/webhook-dispatcher.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
595. [IDEMPOTENCY_MISSING] backend/src/webhooks/webhook-settings.controller.ts:26 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
596. [IDEMPOTENCY_MISSING] backend/src/webhooks/webhook-settings.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
597. [IDEMPOTENCY_MISSING] backend/src/webhooks/webhooks.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
598. [IDEMPOTENCY_MISSING] backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
599. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
600. [DEPENDENCY_VULNERABLE] .github/dependabot.yml:0 — No automated dependency update tool configured (Dependabot or Renovate)
   Evidence: Create .github/dependabot.yml or renovate.json to get automated PRs for security patches
601. [OBSERVABILITY_NO_TRACING] backend/src/ai-brain/knowledge-base.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
602. [OBSERVABILITY_NO_TRACING] backend/src/audio/transcription.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
603. [OBSERVABILITY_NO_TRACING] backend/src/auth/auth.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
604. [OBSERVABILITY_NO_TRACING] backend/src/auth/email.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
605. [OBSERVABILITY_NO_TRACING] backend/src/billing/billing.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
606. [OBSERVABILITY_NO_TRACING] backend/src/checkout/facebook-capi.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
607. [OBSERVABILITY_NO_TRACING] backend/src/common/storage/storage.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
608. [OBSERVABILITY_NO_TRACING] backend/src/crm/crm.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
609. [OBSERVABILITY_NO_TRACING] backend/src/health/system-health.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
610. [OBSERVABILITY_NO_TRACING] backend/src/kloel/asaas.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
611. [OBSERVABILITY_NO_TRACING] backend/src/kloel/audio.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
612. [OBSERVABILITY_NO_TRACING] backend/src/kloel/email-campaign.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
613. [OBSERVABILITY_NO_TRACING] backend/src/kloel/mercadopago.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
614. [OBSERVABILITY_NO_TRACING] backend/src/kloel/middleware/audit-log.middleware.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
615. [OBSERVABILITY_NO_TRACING] backend/src/kloel/site.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
616. [OBSERVABILITY_NO_TRACING] backend/src/marketing/marketing.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
617. [OBSERVABILITY_NO_TRACING] backend/src/media/media.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
618. [OBSERVABILITY_NO_TRACING] backend/src/meta/meta-auth.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
619. [OBSERVABILITY_NO_TRACING] backend/src/meta/meta-sdk.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
620. [OBSERVABILITY_NO_TRACING] backend/src/webhooks/payment-webhook.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
621. [OBSERVABILITY_NO_TRACING] backend/src/webhooks/webhooks.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
622. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/providers/whatsapp-api.provider.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
623. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/whatsapp-watchdog.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
624. [OBSERVABILITY_NO_ALERTING] backend/src/billing/payment-method.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
625. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout-payment.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
626. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout-webhook.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
627. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
628. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/facebook-capi.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
629. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/external-payment.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
630. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/payment.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
631. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/smart-payment.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
632. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/smart-payment.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
633. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/wallet.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
634. [TIMEZONE_REPORT_MISMATCH] backend/src/analytics/smart-time/smart-time.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
635. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
636. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-public.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
637. [ORDERING_WEBHOOK_OOO] backend/src/checkout/checkout.module.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
638. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/external-payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
639. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
640. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/smart-payment.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
641. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
642. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
643. [ORDERING_WEBHOOK_OOO] backend/src/meta/meta.module.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
644. [ORDERING_WEBHOOK_OOO] backend/src/meta/webhooks/meta-webhook.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
645. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
646. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
647. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhook-dispatcher.service.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
648. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhook-settings.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
649. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhooks.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
650. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhooks.module.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
651. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
```