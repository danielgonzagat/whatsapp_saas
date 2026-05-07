#!/usr/bin/env python3
"""Minimal OpsAlert instrumentation — add import, constructor param, catch alerts."""

import os, re, sys

os.chdir("/Users/danielpenin/whatsapp_saas")

TARGETS = [
    "backend/src/kloel/kloel-lead-brain.service.ts",
    "backend/src/kloel/kloel-lead-processor.service.ts",
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


def import_path(filepath: str) -> str:
    rel = os.path.relpath("backend/src/observability/ops-alert.service", os.path.dirname(filepath))
    if not rel.startswith("."): rel = "./" + rel
    return rel.replace("\\", "/")


def find_class_name(lines: list[str]) -> str:
    for line in lines:
        m = re.search(r'export\s+class\s+(\w+)', line)
        if m: return m.group(1)
    return ""


def process_file(filepath: str):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    original = ''.join(lines)
    if "opsAlert?.alertOnCriticalError" in original:
        return 0, 0

    class_name = find_class_name(lines)
    if not class_name:
        return 0, 0

    ipath = import_path(filepath)
    changed_import = False
    changed_ctor = False

    # ---- Step 1: Add OpsAlertService import ----
    if "OpsAlertService" not in original:
        # Find last import line
        last_import = -1
        for i, line in enumerate(lines):
            if re.match(r'^import\s+', line):
                last_import = i
        if last_import >= 0:
            lines.insert(last_import + 1, f"import {{ OpsAlertService }} from '{ipath}';\n")
            changed_import = True

    # ---- Step 2: Ensure Optional in @nestjs/common import ----
    new_text = ''.join(lines)
    nestjs_re = re.compile(r"(import\s*\{)([^}]*)\}\s*from\s*['\"]@nestjs/common['\"]")
    m = nestjs_re.search(new_text)
    if m and 'Optional' not in m.group(2):
        idx = new_text.index(m.group(0))
        replacement = m.group(1) + ' Optional, ' + m.group(2).lstrip() + ' } ' + m.group(0)[m.group(0).index('from'):]
        # Simpler approach: replace the matched group
        old_import = m.group(0)
        new_import = old_import.replace('{', '{ Optional, ')
        new_text = new_text.replace(old_import, new_import, 1)
        lines = new_text.splitlines(True)
        changed_import = True

    # ---- Step 3: Add @Optional() opsAlert to constructor ----
    new_text = ''.join(lines)
    ctor_re = re.compile(r'(constructor\s*\()((?:[^()]|\([^)]*\))*)\)')
    # This regex captures everything between constructor( and the matching close-paren
    m = ctor_re.search(new_text)
    if m and 'opsAlert' not in m.group(0):
        params = m.group(2).rstrip()
        # Ensure we append properly
        if params.strip():
            new_params = params.rstrip() + ',\n    @Optional() private readonly opsAlert?: OpsAlertService\n  '
        else:
            new_params = '\n    @Optional() private readonly opsAlert?: OpsAlertService\n  '
        replacement = 'constructor(' + new_params + ')'
        new_text = new_text.replace(m.group(0), replacement, 1)
        lines = new_text.splitlines(True)
        changed_ctor = True

    # ---- Step 4: Add alert calls in catch blocks with this.logger.error ----
    new_text = ''.join(lines)
    alerts_added = 0

    # Find all catch blocks with logger.error
    catch_re = re.compile(
        r'\}\s*catch\s*\((\w+)\s*(?::\s*(\w+))?\s*\)\s*\{'
        r'((?:[^{}]|\{[^{}]*\})*)'  # catch body (1 level deep braces handled)
        r'\}',
        re.DOTALL,
    )

    # More reliable: iterate character by character to find catch blocks
    idx = 0
    result_chars = list(new_text)
    offset_chars = 0

    catch_start_re = re.compile(r'\}\s*catch\s*\((\w+)\s*(?::\s*(\w+))?\s*\)\s*\{')

    i = 0
    while i < len(new_text):
        cm = catch_start_re.match(new_text, i)
        if cm:
            body_start = cm.end()
            err_var = cm.group(1)

            # Find matching close brace
            depth = 1
            pos = body_start
            while pos < len(new_text) and depth > 0:
                if new_text[pos] == '{':
                    depth += 1
                elif new_text[pos] == '}':
                    depth -= 1
                pos += 1

            body = new_text[body_start:pos - 1]

            # Check for logger.error inside this catch body
            logger_match = re.search(r'this\.logger\.error\s*\(', body)
            if logger_match:
                # Ensure alert doesn't already exist
                if 'opsAlert?.alertOnCriticalError' not in body:
                    # Find node position before the closing brace
                    insert_pos = pos - 1  # closing brace position

                    # Recalculate insert position with offset
                    actual_insert = insert_pos + offset_chars

                    # Find method name by searching backwards
                    method = "unknown"
                    for k in range(i - 1, 0, -1):
                        mname = re.search(r'(?:async\s+)?(\w+)\s*\(', new_text[k:k+80])
                        if mname and mname.group(1) not in (
                            'constructor','if','for','while','switch','catch','try','else','then','return','new','throw'
                        ):
                            # Verify it's a method declaration (followed by : or { after params)
                            rest = new_text[k:k+200]
                            if re.search(r'\)\s*(?::\s*[\w<>\[\]|&\s,]+)?\s*\{', rest):
                                method = mname.group(1)
                                break

                    # Check workspaceId in scope
                    scope = new_text[max(0,i-500):i]
                    has_wsid = 'workspaceId' in scope

                    # Determine indent from context
                    indent = '      '
                    ctx_lines = new_text[max(0,i-50):i].split('\n')
                    if len(ctx_lines) >= 2:
                        last_line = ctx_lines[-1] if ctx_lines[-1].strip() else ctx_lines[-2]
                        indent = re.match(r'^(\s*)', last_line).group(1)

                    if has_wsid:
                        alert = f"\n{indent}void this.opsAlert?.alertOnCriticalError({err_var}, '{class_name}.{method}', {{ metadata: {{ workspaceId }} }});\n{indent}"
                    else:
                        alert = f"\n{indent}void this.opsAlert?.alertOnCriticalError({err_var}, '{class_name}.{method}');\n{indent}"

                    # Insert before closing brace
                    result_chars.insert(actual_insert, alert)
                    offset_chars += len(alert)
                    alerts_added += 1

            i = pos
        else:
            i += 1

    final = ''.join(result_chars)
    if changed_import or changed_ctor or alerts_added > 0:
        with open(filepath, 'w') as f:
            f.write(final)

    return 1 if (changed_import or changed_ctor or alerts_added > 0) else 0, alerts_added


def main():
    total_files = 0
    total_alerts = 0
    for target in TARGETS:
        if not os.path.exists(target):
            print(f"  MISS {target}")
            continue
        changed, alerts = process_file(target)
        if changed:
            print(f"  OK   {target}: +{alerts} alerts")
            total_files += 1
            total_alerts += alerts
        else:
            print(f"  SAME {target}")

    print(f"\nFiles changed: {total_files}")
    print(f"Alerts added:  {total_alerts}")

if __name__ == "__main__":
    main()
