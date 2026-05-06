#!/usr/bin/env python3
"""Add OpsAlertService alert calls to catch blocks in priority services."""

import os, re, sys

TARGETS = [
    "backend/src/kloel/kloel-lead-brain.service.ts",
    "backend/src/kloel/kloel-lead-processor.service.ts",
    "backend/src/kloel/kloel-reply-engine.service.ts",
    "backend/src/kloel/kloel-thinker.service.ts",
    "backend/src/kloel/kloel-tool-executor.service.ts",
    "backend/src/kloel/kloel-tool-executor-whatsapp.service.ts",
    "backend/src/kloel/unified-agent.service.ts",
    "backend/src/kloel/unified-agent-actions.service.ts",
    "backend/src/kloel/unified-agent-actions-billing.service.ts",
    "backend/src/kloel/unified-agent-actions-commerce.service.ts",
    "backend/src/kloel/unified-agent-actions-crm.service.ts",
    "backend/src/kloel/unified-agent-actions-sales.service.ts",
    "backend/src/kloel/unified-agent-actions-workspace.service.ts",
    "backend/src/kloel/kloel.service.ts",
    "backend/src/kloel/kloel-conversation-store.ts",
    "backend/src/kloel/memory.service.ts",
    "backend/src/kloel/cart-recovery.service.ts",
    "backend/src/kloel/conversational-onboarding.service.ts",
    "backend/src/kloel/kloel-thread-summary.service.ts",
    "backend/src/kloel/audio.service.ts",
    "backend/src/whatsapp/account-agent.service.ts",
    "backend/src/whatsapp/agent-events.service.ts",
    "backend/src/whatsapp/cia-runtime-state.service.ts",
    "backend/src/whatsapp/providers/waha.provider.ts",
    "backend/src/whatsapp/providers/waha-session.provider.ts",
    "backend/src/whatsapp/providers/waha-transport.ts",
    "backend/src/auth/auth-partner.service.ts",
    "backend/src/checkout/checkout-social-recovery.service.ts",
    "backend/src/checkout/checkout-catalog.service.ts",
    "backend/src/campaigns/campaigns.service.ts",
    "backend/src/inbox/inbox.service.ts",
    "backend/src/flows/flows.service.ts",
    "backend/src/flows/flow-optimizer.service.ts",
    "backend/src/copilot/copilot.service.ts",
    "backend/src/followup/followup.service.ts",
    "backend/src/autopilot/autopilot-analytics-insights.service.ts",
    "backend/src/autopilot/autopilot-analytics-report.service.ts",
    "backend/src/autopilot/autopilot-ops-conversion.service.ts",
]

CATCH_RE = re.compile(r'\}\s*catch\s*\((\w+)\s*(?::\s*(\w+))?\s*\)\s*\{')
LOGGER_ERROR_RE = re.compile(r'this\.logger\.(error|warn)\s*\(')

def extract_class_name(content: str) -> str:
    m = re.search(r'export\s+class\s+(\w+)', content)
    return m.group(1) if m else "UnknownService"

def find_enclosing_method(lines: list[str], line_idx: int) -> str:
    """Walk backwards from line_idx to find the enclosing method name."""
    for i in range(line_idx, -1, -1):
        line = lines[i]
        m = re.search(r'(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|&\s,]+)?\s*\{', line)
        if m:
            name = m.group(1)
            if name not in ('constructor', 'if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'then'):
                return name
    return "unknown"

def process_file(filepath: str) -> int:
    with open(filepath, 'r') as f:
        content = f.read()
    lines = content.split('\n')

    if "opsAlert?.alertOnCriticalError" in content:
        return 0  # already has alert calls

    class_name = extract_class_name(content)
    if not class_name or class_name == "UnknownService":
        return 0

    alerts_added = 0
    new_lines = list(lines)
    offset = 0

    i = 0
    while i < len(lines):
        line = lines[i]
        cm = CATCH_RE.search(line)
        if cm:
            err_var = cm.group(1) or 'error'
            catch_indent = len(line) - len(line.lstrip())
            catch_idx = i

            # Find the end of this catch block by counting braces
            depth = 1
            j = i + 1
            logger_found_at = -1
            while j < len(lines) and depth > 0:
                # Track brace depth (skip braces in strings/comments is imperfect but good enough)
                stripped = lines[j].strip()
                depth += stripped.count('{') - stripped.count('}')
                if depth > 0 and logger_found_at < 0 and LOGGER_ERROR_RE.search(lines[j]):
                    logger_found_at = j
                j += 1

            if logger_found_at >= 0:
                # Check alert not already added right after this logger line
                next_idx = logger_found_at + 1 + offset
                if next_idx < len(new_lines):
                    next_content = new_lines[next_idx]
                    if 'opsAlert' not in next_content and 'void this.opsAlert' not in next_content:
                        method_name = find_enclosing_method(lines, catch_idx)
                        logger_line = lines[logger_found_at]
                        logger_indent = len(logger_line) - len(logger_line.lstrip())

                        # Check if workspaceId is referenced nearby
                        scope_start = max(0, catch_idx - 30)
                        scope_lines = '\n'.join(lines[scope_start:catch_idx + 5])
                        has_wsid = 'workspaceId' in scope_lines

                        indent_str = ' ' * logger_indent
                        if has_wsid:
                            alert_line = f"{indent_str}void this.opsAlert?.alertOnCriticalError({err_var}, '{class_name}.{method_name}', {{ metadata: {{ workspaceId }} }});"
                        else:
                            alert_line = f"{indent_str}void this.opsAlert?.alertOnCriticalError({err_var}, '{class_name}.{method_name}');"

                        insert_pos = logger_found_at + 1 + offset
                        new_lines.insert(insert_pos, alert_line)
                        offset += 1
                        alerts_added += 1

            i = j
        else:
            i += 1

    if alerts_added > 0:
        new_content = '\n'.join(new_lines)
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"  {filepath}: {alerts_added} alerts added")
    return alerts_added

def main():
    os.chdir("/Users/danielpenin/whatsapp_saas")
    total_files = 0
    total_alerts = 0
    for target in TARGETS:
        if os.path.exists(target):
            n = process_file(target)
            if n > 0:
                total_files += 1
                total_alerts += n
        else:
            print(f"  ✗ {target} (not found)")

    print(f"\nFiles with new alerts: {total_files}")
    print(f"Total alerts added: {total_alerts}")

if __name__ == "__main__":
    main()
