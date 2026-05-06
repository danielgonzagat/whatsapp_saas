#!/usr/bin/env python3
"""
Batch-instrument catch blocks with void opsAlert?.alertOnCriticalError().
Reads PULSE_HEALTH.json for OBSERVABILITY_NO_ALERTING break files,
skips files that already have the instrumentation.

Strategy: insert the alert line at the START of each catch body (right after
the opening brace), which is safe regardless of what's inside the catch
block (logger, prisma calls, etc.).

Uses `void` prefix to satisfy eslint no-floating-promises.
"""
import json, os, re, sys

ROOT = '/Users/danielpenin/whatsapp_saas'
BACKEND_SRC = f'{ROOT}/backend/src'

ALREADY_DONE = {
    'backend/src/billing/billing-webhook.service.ts',
    'backend/src/auth/auth.password.service.ts',
    'backend/src/auth/email.service.ts',
    'backend/src/auth/auth.token.service.ts',
    'backend/src/auth/auth-verification.service.ts',
    'backend/src/whatsapp/inbound-processor.service.ts',
    'backend/src/payments/connect/connect-payout-approval.service.ts',
    'backend/src/whatsapp/whatsapp.service.ts',
    'backend/src/autopilot/autopilot-cycle-executor.service.ts',
    'backend/src/admin/seed/admin-seed.service.ts',
    'backend/src/autopilot/autopilot.service.ts',
    'backend/src/kloel/kloel-whatsapp-tools.service.ts',
    'backend/src/audit/audit.service.ts',
}

SKIP_METHOD_NAMES = {
    'if', 'while', 'for', 'switch', 'catch', 'try', 'new', 'throw',
    'return', 'break', 'continue', 'constructor', 'get', 'set', 'await',
    'export', 'default', 'import', 'from', 'class', 'interface', 'type',
    'const', 'let', 'var', 'function', 'private', 'public', 'protected',
}


def compute_import_path(file_abspath: str) -> str:
    """Compute relative import path from file to observability/ops-alert.service."""
    file_dir = os.path.dirname(file_abspath)
    target = f'{BACKEND_SRC}/observability/ops-alert.service'
    rel = os.path.relpath(target, file_dir)
    rel = rel.replace('.ts', '')
    if not rel.startswith('.'):
        rel = './' + rel
    return rel


def extract_class_name(lines: list) -> str:
    """Extract the exported class name."""
    for line in lines:
        m = re.search(r'export\s+(?:default\s+)?class\s+(\w+)', line)
        if m:
            return m.group(1)
    return None


def find_catch_blocks(lines: list) -> list:
    """Return list of (catch_line_index, body_start_line) for each catch block."""
    catches = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'\}?\s*catch\s*(\(|$)', stripped):
            catches.append(i)
    return catches


def find_brace(lines: list, start: int, max_scan: int = 10) -> int:
    """Find the opening brace of the catch body. Returns line index or -1."""
    for i in range(start, min(start + max_scan, len(lines))):
        if '{' in lines[i]:
            return i
    return -1


def find_enclosing_method(lines: list, catch_idx: int) -> str:
    """Find the enclosing method name for a catch block."""
    for i in range(catch_idx, -1, -1):
        stripped = lines[i].strip()

        if stripped.startswith('@'):
            continue

        # Method/function declaration:
        # async methodName( | methodName( | private async methodName( | function name(
        m = re.search(r'(?:private\s+|public\s+|protected\s+|static\s+)*(?:async\s+)?(\w+)\s*\(', stripped)
        if m:
            name = m.group(1)
            if name.lower() not in SKIP_METHOD_NAMES and not name[0].isupper() and name[0] != '_':
                return name

        # Arrow function: const name = async ( | const name = (
        m = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(', stripped)
        if m:
            name = m.group(1)
            if name.lower() not in SKIP_METHOD_NAMES:
                return name

    return 'unknown'


def get_indent(lines: list, idx: int) -> str:
    """Get indentation string from a line."""
    line = lines[idx]
    return line[:len(line) - len(line.lstrip())]


def instrument_file(filepath: str) -> bool:
    """Add opsAlert instrumentation. Returns True if changed."""
    with open(filepath, 'r') as f:
        content = f.read()

    if 'alertOnCriticalError' in content:
        return False

    if 'catch' not in content:
        return False

    lines = content.split('\n')
    changed = False

    # --- Find class name ---
    class_name = extract_class_name(lines)

    # --- 1. Add import ---
    import_path = compute_import_path(filepath)
    import_line = f"import {{ OpsAlertService }} from '{import_path}';"

    if 'OpsAlertService' not in content:
        last_import = -1
        for i, line in enumerate(lines):
            if line.strip().startswith('import ') and 'from ' in line:
                last_import = i

        if last_import >= 0:
            lines.insert(last_import + 1, import_line)
            changed = True
        else:
            # Try adding after the first block comment
            for i, line in enumerate(lines):
                if line.strip() == '' and i > 0:
                    lines.insert(i, import_line)
                    changed = True
                    break
            else:
                lines.insert(0, import_line)
                changed = True

    # --- 2. Add @Optional() opsAlert to constructor ---
    if changed:
        content = '\n'.join(lines)
        lines = content.split('\n')

    if 'opsAlert' not in content:
        # Find constructor
        constructor_line = -1
        for i, line in enumerate(lines):
            if re.search(r'constructor\s*\(', line.strip()):
                constructor_line = i
                break

        if constructor_line >= 0:
            # Check if it's multi-line
            if ')' in lines[constructor_line]:
                # Single-line constructor
                old = lines[constructor_line]
                if '()' in old:
                    lines[constructor_line] = old.replace(
                        'constructor()',
                        'constructor(@Optional() private readonly opsAlert?: OpsAlertService)'
                    )
                else:
                    lines[constructor_line] = old.replace(
                        ')',
                        ', @Optional() private readonly opsAlert?: OpsAlertService)'
                    )
                changed = True
            else:
                # Multi-line constructor - find the closing paren
                const_close = -1
                for i in range(constructor_line, min(constructor_line + 20, len(lines))):
                    if ')' in lines[i] and 'constructor' not in lines[i]:
                        const_close = i
                        break

                if const_close >= 0:
                    closing_line = lines[const_close]
                    indent = get_indent(lines, const_close)
                    # Replace closing ) with the opsAlert param + closing )
                    if closing_line.strip() == ')':
                        lines[const_close] = f'{indent}@Optional() private readonly opsAlert?: OpsAlertService,'
                        # Add closing paren back
                        lines.insert(const_close + 1, f'{indent})')
                    else:
                        # Has closing paren but with other content? Rare.
                        new_closing = closing_line.replace(')', ', @Optional() private readonly opsAlert?: OpsAlertService)')
                        lines[const_close] = new_closing
                    changed = True

    # --- 3. Instrument catch blocks ---
    if changed:
        content = '\n'.join(lines)
        lines = content.split('\n')

    catch_indices = find_catch_blocks(lines)

    # Process in reverse to not mess up indices
    for catch_idx in reversed(catch_indices):
        # Find the opening brace
        brace_idx = find_brace(lines, catch_idx)
        if brace_idx < 0:
            # No brace? Try adding after the catch line itself
            brace_idx = catch_idx

        # Get indentation (one level deeper than the brace line)
        base_indent = get_indent(lines, brace_idx)
        if '{' in lines[brace_idx]:
            target_indent = base_indent + '  '
        else:
            target_indent = base_indent

        method_name = find_enclosing_method(lines, catch_idx)
        if class_name:
            context = f"{class_name}.{method_name}"
        else:
            context = method_name

        alert_line = f'{target_indent}void this.opsAlert?.alertOnCriticalError(error, \'{context}\');'

        # Check if alert is already present near the catch
        already_present = False
        for k in range(catch_idx, min(catch_idx + 10, len(lines))):
            if 'alertOnCriticalError' in lines[k]:
                already_present = True
                break

        if already_present:
            continue

        # For catch blocks with explicit error variable name (like catch (err: unknown)),
        # use that variable name in the alert
        catch_line = lines[catch_idx].strip()
        error_var = 'error'
        m = re.search(r'catch\s*\(\s*(\w+)\s*:', catch_line)
        if m:
            error_var = m.group(1)
        elif re.search(r'catch\s*\(\s*(\w+)\s*\)', catch_line):
            m = re.search(r'catch\s*\(\s*(\w+)\s*\)', catch_line)
            error_var = m.group(1)

        alert_line = f'{target_indent}void this.opsAlert?.alertOnCriticalError({error_var}, \'{context}\');'

        # Insert right after the opening brace line
        lines.insert(brace_idx + 1, alert_line)
        changed = True

    # --- Write back ---
    if changed:
        with open(filepath, 'w') as f:
            f.write('\n'.join(lines))
        return True

    return False


def main():
    with open(f'{ROOT}/PULSE_HEALTH.json') as f:
        health = json.load(f)

    files = set()
    for b in health['breaks']:
        if b['type'] == 'OBSERVABILITY_NO_ALERTING':
            files.add(b['file'])

    remaining = sorted(files - ALREADY_DONE)

    to_process = []
    for relpath in remaining:
        abspath = os.path.join(ROOT, relpath)
        if not os.path.exists(abspath):
            continue
        with open(abspath) as f:
            content = f.read()
        if 'catch' not in content:
            continue
        if 'alertOnCriticalError' in content:
            continue
        to_process.append(relpath)

    print(f"Files to instrument: {len(to_process)}")

    instrumented = []
    errors = []
    for relpath in to_process:
        abspath = os.path.join(ROOT, relpath)
        try:
            if instrument_file(abspath):
                instrumented.append(relpath)
                print(f"OK  {relpath}")
            else:
                print(f"--- {relpath}")
        except Exception as e:
            errors.append((relpath, str(e)))
            print(f"ERR {relpath}: {e}")

    print(f"\nInstrumented: {len(instrumented)} | Errors: {len(errors)}")

    for fpath in sorted(instrumented):
        print(f"  {fpath}")

    if errors:
        for fpath, err in errors:
            print(f"  ERR: {fpath}: {err}")


if __name__ == '__main__':
    main()
