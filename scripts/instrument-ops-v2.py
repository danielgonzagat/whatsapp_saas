#!/usr/bin/env python3
"""Robust OpsAlert instrumentation — adds import, constructor injection, and catch alerts."""

import os, re, sys

TARGETS = [
    ("backend/src/kloel/kloel-lead-brain.service.ts", 2),
    ("backend/src/kloel/kloel-lead-processor.service.ts", 2),
    ("backend/src/kloel/kloel-reply-engine.service.ts", 1),
    ("backend/src/kloel/kloel-thinker.service.ts", 1),
    ("backend/src/kloel/kloel-tool-executor.service.ts", 2),
    ("backend/src/kloel/kloel-tool-executor-whatsapp.service.ts", 1),
    ("backend/src/kloel/unified-agent.service.ts", 2),
    ("backend/src/kloel/unified-agent-actions.service.ts", 2),
    ("backend/src/kloel/unified-agent-actions-billing.service.ts", 2),
    ("backend/src/kloel/unified-agent-actions-commerce.service.ts", 2),
    ("backend/src/kloel/unified-agent-actions-crm.service.ts", 2),
    ("backend/src/kloel/unified-agent-actions-sales.service.ts", 2),
    ("backend/src/kloel/unified-agent-actions-workspace.service.ts", 2),
    ("backend/src/kloel/kloel.service.ts", 1),
    ("backend/src/kloel/kloel-conversation-store.ts", 1),
    ("backend/src/kloel/memory.service.ts", 1),
    ("backend/src/kloel/cart-recovery.service.ts", 2),
    ("backend/src/kloel/conversational-onboarding.service.ts", 2),
    ("backend/src/kloel/kloel-thread-summary.service.ts", 1),
    ("backend/src/kloel/audio.service.ts", 1),
    ("backend/src/whatsapp/account-agent.service.ts", 2),
    ("backend/src/whatsapp/agent-events.service.ts", 2),
    ("backend/src/whatsapp/cia-runtime-state.service.ts", 2),
    ("backend/src/whatsapp/providers/waha.provider.ts", 1),
    ("backend/src/whatsapp/providers/waha-session.provider.ts", 1),
    ("backend/src/whatsapp/providers/waha-transport.ts", 1),
    ("backend/src/auth/auth-partner.service.ts", 2),
    ("backend/src/checkout/checkout-social-recovery.service.ts", 2),
    ("backend/src/checkout/checkout-catalog.service.ts", 2),
    ("backend/src/campaigns/campaigns.service.ts", 2),
    ("backend/src/inbox/inbox.service.ts", 2),
    ("backend/src/flows/flows.service.ts", 2),
    ("backend/src/flows/flow-optimizer.service.ts", 2),
    ("backend/src/copilot/copilot.service.ts", 2),
    ("backend/src/followup/followup.service.ts", 2),
    ("backend/src/autopilot/autopilot-analytics-insights.service.ts", 2),
    ("backend/src/autopilot/autopilot-analytics-report.service.ts", 2),
    ("backend/src/autopilot/autopilot-ops-conversion.service.ts", 2),
]


def import_path(filepath: str) -> str:
    rel = os.path.relpath("backend/src/observability/ops-alert.service", os.path.dirname(filepath))
    if not rel.startswith("."): rel = "./" + rel
    return rel.replace("\\", "/")


def find_class_name(lines: list[str]) -> str:
    for line in lines:
        m = re.search(r'export\s+class\s+(\w+)', line)
        if m: return m.group(1)
    return "UnknownService"


def add_import_and_constructor(content: str, import_path_val: str) -> tuple[str, bool]:
    """Add OpsAlertService import and @Optional() constructor param. Returns (content, changed)."""
    changed = False
    lines = content.split('\n')
    class_name = find_class_name(lines)

    # Step 1: Add import for OpsAlertService after other imports
    if "OpsAlertService" not in content:
        for i in range(len(lines) - 1, -1, -1):
            if re.match(r'^import\s+', lines[i]):
                lines.insert(i + 1, f"import {{ OpsAlertService }} from '{import_path_val}';")
                changed = True
                break

    content = '\n'.join(lines)

    # Step 2: Ensure Optional is in @nestjs/common import (check first occurrence)
    nestjs_import_re = re.compile(r"(import\s*\{)([^}]*)\}\s*from\s*['\"]@nestjs/common['\"]")
    match = nestjs_import_re.search(content)
    if match and 'Optional' not in match.group(2):
        new_import = match.group(0).replace('{', '{ Optional, ')
        content = content.replace(match.group(0), new_import, 1)
        changed = True
    elif not match:
        # No @nestjs/common import yet — add one
        for i, line in enumerate(content.split('\n')):
            if re.match(r'^import\s+', line):
                lines2 = content.split('\n')
                lines2.insert(i + 1, "import { Injectable, Logger, Optional } from '@nestjs/common';")
                content = '\n'.join(lines2)
                changed = True
                break

    # Step 3: Add @Optional() opsAlert to constructor
    lines = content.split('\n')
    constructor_start = -1
    for i, line in enumerate(lines):
        if re.search(r'^\s*constructor\s*\(', line):
            constructor_start = i
            break

    if constructor_start >= 0:
        # Find the closing paren of constructor params
        # Constructor may span multiple lines
        j = constructor_start
        constructor_lines = []
        depth = 1  # Starts at 1 because we count the opening paren
        while j < len(lines):
            line = lines[j]
            constructor_lines.append(line)
            depth += line.count('(') - line.count(')')
            if depth == 0:
                break
            j += 1

        # Check if opsAlert already in constructor
        constructor_text = '\n'.join(constructor_lines)
        if 'opsAlert' not in constructor_text:
            # Find the last line with a paren that closes the constructor params
            if depth == 0:
                # The closing line ends with ") {" or similar
                close_line = lines[j]
                close_idx = close_line.rfind(')')
                if close_idx >= 0:
                    indent = len(close_line) - len(close_line.lstrip())
                    param_indent = ' ' * (indent + 4)
                    new_close = (
                        close_line[:close_idx]
                        + ',\n'
                        + param_indent
                        + '@Optional() private readonly opsAlert?: OpsAlertService\n'
                        + close_line[close_idx:]
                    )
                    lines[j] = new_close
                    content = '\n'.join(lines)
                    changed = True

    return content, changed


def add_catch_alerts(content: str) -> tuple[str, int]:
    """Add alertOnCriticalError calls after this.logger.error in catch blocks."""
    lines = content.split('\n')
    class_name = find_class_name(lines)

    alerts_added = 0
    new_lines = list(lines)
    offset = 0

    # Pattern: } catch (varname: type) { ... this.logger.error(...); ... }
    catch_re = re.compile(r'\}\s*catch\s*\((\w+)\s*(?::\s*(\w+))?\s*\)\s*\{')
    logger_error_re = re.compile(r'this\.logger\.error\s*\(')  # ONLY error, not warn

    i = 0
    while i < len(lines):
        line = lines[i]
        cm = catch_re.search(line)
        if cm:
            err_var = cm.group(1) or 'error'
            catch_idx = i

            # Find end of catch block by tracking brace depth
            depth = 1
            j = i + 1
            logger_at = -1
            while j < len(lines) and depth > 0:
                s = lines[j].strip()
                depth += s.count('{') - s.count('}')
                if depth > 0 and logger_at < 0 and logger_error_re.search(lines[j]):
                    logger_at = j
                j += 1

            if logger_at >= 0:
                # Check if alert already exists after this logger line
                check_idx = logger_at + 1 + offset
                if check_idx < len(new_lines) and 'opsAlert' not in new_lines[check_idx]:
                    # Find enclosing method name (walk backwards from catch)
                    method_name = "unknown"
                    for k in range(catch_idx - 1, -1, -1):
                        m = re.search(r'(?:async\s+)?(\w+)\s*\(', lines[k])
                        if m and m.group(1) not in (
                            'constructor','if','for','while','switch','catch','try','else','then','return','new','throw'
                        ):
                            method_name = m.group(1)
                            break

                    # Determine indent
                    logger_line = lines[logger_at]
                    indent = len(logger_line) - len(logger_line.lstrip())

                    # Check if workspaceId is in scope (look at method signature and surrounding context)
                    scope_str = '\n'.join(lines[max(0, catch_idx - 40):catch_idx])
                    has_wsid = 'workspaceId' in scope_str

                    indent_s = ' ' * indent
                    if has_wsid:
                        alert = f"{indent_s}void this.opsAlert?.alertOnCriticalError({err_var}, '{class_name}.{method_name}', {{ metadata: {{ workspaceId }} }});"
                    else:
                        alert = f"{indent_s}void this.opsAlert?.alertOnCriticalError({err_var}, '{class_name}.{method_name}');"

                    insert_pos = logger_at + 1 + offset
                    new_lines.insert(insert_pos, alert)
                    offset += 1
                    alerts_added += 1

            i = j
        else:
            i += 1

    return '\n'.join(new_lines), alerts_added


def main():
    os.chdir("/Users/danielpenin/whatsapp_saas")
    total_files = 0
    total_alerts = 0

    for filepath, depth in TARGETS:
        if not os.path.exists(filepath):
            print(f"  SKIP {filepath} (not found)")
            continue

        with open(filepath, 'r') as f:
            content = f.read()

        # Step 1: Add import + constructor injection
        new_content, import_changed = add_import_and_constructor(content, import_path(filepath))

        # Step 2: Add catch block alerts
        new_content, alerts = add_catch_alerts(new_content)

        if import_changed or alerts > 0:
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f"  OK  {filepath}: +{alerts} alerts")
            total_files += 1
            total_alerts += alerts
        else:
            print(f"  --  {filepath}: no changes")

    print(f"\n=== Summary ===")
    print(f"Files changed: {total_files}")
    print(f"Alerts added:  {total_alerts}")

if __name__ == "__main__":
    main()
