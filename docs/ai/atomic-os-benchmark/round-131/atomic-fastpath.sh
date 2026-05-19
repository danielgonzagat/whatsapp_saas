#!/usr/bin/env bash
set -euo pipefail
R="/Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/round-131"
W="/Users/danielpenin/kloel-ab-worktrees/kloel-ab131-atomic-20260518101359"
cd "$W"
export ATOMIC_OS_REPO_ROOT="$W"
read_json() { node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$1"; }
call_atomic() { node "$W/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs" "$@"; }
call_atomic extract_class_methods_to_file "$(read_json "$R/atomic-runtime-extract-args.json")"
call_atomic extract_class_methods_to_file "$(read_json "$R/atomic-router-extract-args.json")"
call_atomic atomic_create_file "$(read_json "$R/atomic-parser-create-args.json")"
call_atomic atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"ExecuteToolActionDeps","typeOnly":true}'
call_atomic atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-parser.helpers","name":"parseToolArgs"}'
call_atomic atomic_replace_text "$(read_json "$R/atomic-parser-replace-args.json")"
call_atomic extract_symbols_to_file "$(read_json "$R/atomic-top-extract-args.json")"
call_atomic atomic_create_file "$(read_json "$R/atomic-cognitive-create-args.json")"
call_atomic atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-cognitive-state.helpers","name":"buildUnifiedAgentCognitiveState"}'
call_atomic atomic_replace_text "$(read_json "$R/atomic-cognitive-replace-args.json")"
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./abi/abi-validator","name":"validateAbiPayload"}'
call_atomic atomic_create_file "$(read_json "$R/atomic-incoming-create-args.json")"
call_atomic atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-incoming-message.helpers","name":"processIncomingUnifiedAgentMessage"}'
call_atomic atomic_replace_text "$(read_json "$R/atomic-incoming-replace-args.json")"
call_atomic atomic_create_file "$(read_json "$R/atomic-tool-call-processing-create-args.json")"
call_atomic atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-call-processing.helpers","name":"processUnifiedAgentToolCalls"}'
call_atomic atomic_replace_text "$(read_json "$R/atomic-tool-call-processing-replace-args.json")"
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"../common/async-sequence","name":"forEachSequential"}'
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-parser.helpers","name":"parseToolArgs"}'
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-parser.helpers","name":"isAllowedTool"}'
call_atomic atomic_create_file "$(read_json "$R/atomic-predecided-create-args.json")"
call_atomic atomic_add_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-predecided-processing.helpers","name":"processUnifiedAgentPredecidedActions"}'
call_atomic atomic_replace_text "$(read_json "$R/atomic-predecided-replace-args.json")"
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-predecided-actions.part","name":"buildPredecidedActionDraft"}'
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-predecided-actions.part","name":"executePredecidedAgentActions"}'
call_atomic atomic_replace_text "$(read_json "$R/atomic-inline-deps-helper-param-args.json")"
call_atomic atomic_replace_text "$(read_json "$R/atomic-inline-deps-execute-tool-args.json")"
call_atomic atomic_replace_text "$(read_json "$R/atomic-remove-tool-router-deps-property-args.json")"
call_atomic atomic_replace_text "$(read_json "$R/atomic-remove-tool-router-deps-assignment-args.json")"
call_atomic atomic_remove_import '{"file":"backend/src/kloel/unified-agent.service.ts","module":"./unified-agent-tool-router.helpers","name":"ExecuteToolActionDeps"}'
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-router-replace-args.json")"
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-parser-replace-args.json")"
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-cognitive-replace-args.json")"
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-tool-call-processing-replace-args.json")"
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-predecided-processing-replace-args.json")"
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-incoming-replace-args.json")"
call_atomic replace_file_with_current_anchor "$(read_json "$R/atomic-facade-service-replace-args.json")"
call_atomic atomic_apply_eslint_dry_run_fixes '{"cwd":"backend","args":["src/kloel/unified-agent.service.ts","src/kloel/unified-agent-tool-router.helpers.ts","src/kloel/unified-agent-runtime.helpers.ts","src/kloel/unified-agent-tool-parser.helpers.ts","src/kloel/unified-agent-cognitive-state.helpers.ts","src/kloel/unified-agent-incoming-message.helpers.ts","src/kloel/unified-agent-tool-call-processing.helpers.ts","src/kloel/unified-agent-predecided-processing.helpers.ts","--fix-dry-run","--fix-type","layout","--format","json"],"allowedPaths":["backend/src/kloel/unified-agent.service.ts","backend/src/kloel/unified-agent-tool-router.helpers.ts","backend/src/kloel/unified-agent-runtime.helpers.ts","backend/src/kloel/unified-agent-tool-parser.helpers.ts","backend/src/kloel/unified-agent-cognitive-state.helpers.ts","backend/src/kloel/unified-agent-incoming-message.helpers.ts","backend/src/kloel/unified-agent-tool-call-processing.helpers.ts","backend/src/kloel/unified-agent-predecided-processing.helpers.ts"],"applyKnownResidueFixes":false}'
call_atomic validate_kloel_unified_agent "$(read_json "$R/atomic-final-validation-args.json")"
