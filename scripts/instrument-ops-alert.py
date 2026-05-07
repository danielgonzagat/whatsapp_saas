#!/usr/bin/env python3
"""Instrument OpsAlertService into catch blocks of priority services."""

import os, re, sys

TARGETS = [
    # kloel core — highest risk (lead processing, unified agent, payments)
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
    # whatsapp — auth/integration
    "backend/src/whatsapp/account-agent.service.ts",
    "backend/src/whatsapp/agent-events.service.ts",
    "backend/src/whatsapp/cia-runtime-state.service.ts",
    "backend/src/whatsapp/providers/waha.provider.ts",
    "backend/src/whatsapp/providers/waha-session.provider.ts",
    "backend/src/whatsapp/providers/waha-transport.ts",
    # auth
    "backend/src/auth/auth-partner.service.ts",
    # checkout
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

def compute_import_path(filepath: str) -> str:
    """Compute relative import path from file to backend/src/observability/ops-alert.service"""
    rel = os.path.relpath(
        "backend/src/observability/ops-alert.service",
        os.path.dirname(filepath)
    )
    if not rel.startswith("."):
        rel = "./" + rel
    return rel.replace("\\", "/")

def extract_class_name(content: str) -> str:
    m = re.search(r'export\s+class\s+(\w+)', content)
    return m.group(1) if m else "UnknownService"

def find_method_name_for_line(content: str, line_idx: int) -> str:
    """Walk backwards from line_idx to find the enclosing method name."""
    lines = content.split('\n')
    for i in range(line_idx, -1, -1):
        line = lines[i]
        # Match method declaration: async methodName( or methodName(
        m = re.search(r'(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{', line)
        if m:
            name = m.group(1)
            if name not in ('constructor', 'if', 'for', 'while', 'switch', 'catch', 'try', 'else'):
                return name
    return "unknown"

def is_jest_or_test_env(line: str) -> bool:
    return bool(re.search(r'JEST_WORKER_ID|NODE_ENV.*test|process\.env\..*test', line))

def process_file(filepath: str) -> list[str]:
    """Process a single file, returning list of changes made."""
    with open(filepath, 'r') as f:
        content = f.read()

    if "opsAlert?.alertOnCriticalError" in content:
        return []  # already instrumented

    changes = []
    original = content

    # 1. Add import for OpsAlertService
    import_path = compute_import_path(filepath)
    import_line = f"import {{ OpsAlertService }} from '{import_path}';"

    if "OpsAlertService" not in content:
        # Find the last import line and add after it
        lines = content.split('\n')
        last_import_idx = -1
        for i, line in enumerate(lines):
            if re.match(r'^import\s+', line):
                last_import_idx = i

        if last_import_idx >= 0:
            # Insert after last import
            lines.insert(last_import_idx + 1, import_line)
            content = '\n'.join(lines)
            changes.append(f"  + import OpsAlertService")

    # 2. Ensure Optional is in @nestjs/common import
    if "Optional" not in content or "@nestjs/common" not in content:
        content = re.sub(
            r'(import\s*\{)([^}]*)\}\s*from\s*[\'"]@nestjs/common[\'"]',
            lambda m: m.group(0).replace('@nestjs/common', '@nestjs/common').replace(m.group(0), '') if 'Optional' in m.group(2) else None,
            content
        )
        # Simpler approach: add Optional to the import
        content = re.sub(
            r'import\s*\{([^}]*(?:Logger)[^}]*)\}\s*from\s*[\'"]@nestjs/common[\'"]',
            lambda m: m.group(0).replace('{', '{ Optional, ') if 'Optional' not in m.group(1) else m.group(0),
            content
        )
    if "Optional" not in content:
        # Add Optional import separately
        content = re.sub(
            r'import\s+(\{[^}]*)\}\s*from\s*[\'"]@nestjs/common[\'"]',
            lambda m: f"import {m.group(1).replace('{', '{ Optional, ')} from '@nestjs/common'",
            content,
            count=1   # Only first occurrence
        )

    # Also handle: import { Injectable, Logger } from '@nestjs/common';
    content = re.sub(
        r'(import\s*\{[^}]*Logger[^}]*)\}\s*from\s*[\'"]@nestjs/common[\'"]',
        lambda m: m.group(0).replace('{', '{ Optional, ') if 'Optional' not in m.group(1) else m.group(0),
        content,
        count=1
    )

    # 3. Find constructor and add @Optional() opsAlert parameter
    class_name = extract_class_name(content)

    # Find the constructor closing paren
    constructor_re = r'(constructor\s*\([^)]*)\)'
    match = re.search(constructor_re, content)
    if match:
        existing_params = match.group(1)
        # Check if opsAlert already injected
        if 'opsAlert' not in existing_params:
            # Add the param before closing paren of constructor
            new_params = existing_params.rstrip()
            if not new_params.endswith('('):
                new_params += ','
            new_params += '\n    @Optional() private readonly opsAlert?: OpsAlertService'
            content = content.replace(existing_params, new_params, 1)
            changes.append(f"  + @Optional() opsAlert in constructor")

    # 4. Find catch blocks with logger.error and add alert
    # Pattern: catch (error...) { ... this.logger.error(...); ... }
    # We look for catch blocks within methods and add the alert

    lines = content.split('\n')
    new_lines = list(lines)
    offset = 0  # track line insertions

    # Find all catch blocks
    catch_pattern = re.compile(r'^\s*catch\s*\((\w+)\s*(?::\s*(\w+))?\)\s*\{')
    logger_error_pattern = re.compile(r'this\.logger\.(error|warn)\s*\(')

    i = 0
    while i < len(lines):
        line = lines[i]
        catch_match = catch_pattern.match(line)
        if catch_match:
            err_var = catch_match.group(1) or 'error'
            catch_line_idx = i

            # Find the catch block body — look ahead for logger.error/warn
            depth = 1
            j = i + 1
            found_logger = False
            logger_line_idx = -1

            while j < len(lines) and depth > 0:
                depth += lines[j].count('{') - lines[j].count('}')
                if logger_error_pattern.search(lines[j]):
                    found_logger = True
                    logger_line_idx = j
                j += 1

            if found_logger and logger_line_idx > 0:
                # Check if alert already exists right after the logger line
                next_line_idx = logger_line_idx + 1
                if next_line_idx < len(lines):
                    next_line = lines[next_line_idx]
                    if 'opsAlert?.alertOnCriticalError' not in next_line and 'void this.opsAlert' not in next_line:
                        # Check if we're in a test file or non-business logic
                        # Skip if this is inside a non-critical catch (e.g., audit logging, test env)
                        logger_line = lines[logger_line_idx]

                        # Only instrument if it's a true logger.error (not just warn for audit)
                        if 'this.logger.error' in logger_line:
                            method_name = find_method_name_for_line(lines, catch_line_idx)
                            indent = re.match(r'^(\s*)', logger_line)
                            base_indent = indent.group(1) if indent else '      '

                            # Check if workspaceId is available in scope
                            # Default: use workspaceId if it's in the method
                            scope_has_wsid = 'workspaceId' in '\n'.join(lines[catch_line_idx-20:catch_line_idx+5])

                            if scope_has_wsid:
                                alert_line = f'{base_indent}void this.opsAlert?.alertOnCriticalError({err_var},\'{class_name}.{method_name}\', {{ metadata: {{ workspaceId }} }});'
                            else:
                                alert_line = f'{base_indent}void this.opsAlert?.alertOnCriticalError({err_var},\'{class_name}.{method_name}\');'

                            # Insert after the logger line (add offset for previous inserts)
                            insert_pos = logger_line_idx + 1 + offset
                            new_lines.insert(insert_pos, alert_line)
                            offset += 1
                            changes.append(f"  + alert in {class_name}.{method_name}")

            i = j
        else:
            i += 1

    if changes:
        new_content = '\n'.join(new_lines)
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"✓ {filepath}")
        for c in changes:
            print(c)
    else:
        print(f"  {filepath} (no changes)")

    return changes

def main():
    os.chdir("/Users/danielpenin/whatsapp_saas")
    total = 0
    for target in TARGETS:
        if os.path.exists(target):
            changes = process_file(target)
            if changes:
                total += 1
        else:
            print(f"✗ {target} (not found)")

    print(f"\nTotal files instrumented: {total}")

if __name__ == "__main__":
    main()
