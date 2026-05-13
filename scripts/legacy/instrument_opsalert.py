#!/usr/bin/env python3
"""
Batch-instrument catch blocks with opsAlert?.alertOnCriticalError().
Reads PULSE_HEALTH.json for OBSERVABILITY_NO_ALERTING break files,
skips files that already have the instrumentation,
and adds import/constructor-param/alert-on-catch to remaining files.
"""
import json, os, re, sys

ROOT = '/Users/danielpenin/whatsapp_saas'
BACKEND_SRC = f'{ROOT}/backend/src'

# Already instrumented files (from rg output)
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

def compute_relative_import(file_relpath: str) -> str:
    """Compute import path from the file's dir to observability/ops-alert.service"""
    file_dir = os.path.dirname(file_relpath)  # e.g. backend/src/kloel
    target = 'backend/src/observability/ops-alert.service'
    # Normalize to common root
    file_parts = file_dir.split('/')
    target_parts = target.split('/')

    # Find common prefix
    i = 0
    while i < len(file_parts) and i < len(target_parts) and file_parts[i] == target_parts[i]:
        i += 1

    # Go up from file_dir to common ancestor
    up = len(file_parts) - i
    down = target_parts[i:]

    if up == 0:
        # Same directory level or deeper - need relative path
        prefix = './' + '/'.join(down)
    else:
        prefix = '../' * up + '/'.join(down)

    # Remove .ts extension
    if prefix.endswith('.ts'):
        prefix = prefix[:-3]

    return prefix

def extract_class_name(content: str) -> str:
    """Extract the exported class name from a TypeScript file."""
    # Match: export class ClassName
    m = re.search(r'export\s+class\s+(\w+)', content)
    if m:
        return m.group(1)
    # Match: export default class ClassName
    m = re.search(r'export\s+default\s+class\s+(\w+)', content)
    if m:
        return m.group(1)
    # For helper files (no class), use the filename
    return None

def find_enclosing_function(lines, catch_line_idx):
    """Find the enclosing function/method name for a catch block."""
    for i in range(catch_line_idx, -1, -1):
        line = lines[i].strip()
        # Match: async functionName( | functionName( | private async methodName( | etc
        m = re.search(r'(?:async\s+)?(\w+)\s*\([^)]*\)\s*[{:]?\s*$', line)
        if m:
            name = m.group(1)
            # Skip keywords
            if name not in ('if', 'while', 'for', 'switch', 'catch', 'try', 'new', 'throw'):
                return name
        # Match arrow functions bound to variable/const
        m = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(', line)
        if m:
            return m.group(1)
        # Match: private async methodName( | public methodName( | methodName(
        m = re.search(r'(?:private|public|protected)\s+(?:async\s+)?(\w+)\s*\(', line)
        if m:
            return m.group(1)
    return 'unknown'

def instrument_file(filepath: str) -> bool:
    """Add opsAlert instrumentation to a single file. Returns True if changed."""
    with open(filepath, 'r') as f:
        content = f.read()

    lines = content.split('\n')
    changed = False

    # --- 1. Check if already has opsAlert instrumentation ---
    if 'alertOnCriticalError' in content and 'opsAlert' in content:
        return False

    # --- 2. Figure out class name ---
    class_name = extract_class_name(content)

    # --- 3. Add import if missing ---
    relpath = os.path.relpath(filepath, ROOT)  # e.g. backend/src/kloel/audio.service.ts
    import_path = compute_relative_import(relpath)
    import_line = f"import {{ OpsAlertService }} from '{import_path}';"

    if 'OpsAlertService' not in content:
        # Find the last import in the file
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.strip().startswith('import ') and 'from ' in line:
                last_import_idx = i

        if last_import_idx >= 0:
            lines.insert(last_import_idx + 1, import_line)
            changed = True
        else:
            print(f"  WARNING: no imports found in {filepath}")
            return False

    # --- 4. Add @Optional() opsAlert to constructor if missing ---
    if 'opsAlert' not in content or '@Optional()' not in content:
        # Re-read lines if we changed them
        if changed:
            content = '\n'.join(lines)
            lines = content.split('\n')

        # Find constructor
        constructor_start = -1
        for i, line in enumerate(lines):
            stripped = line.strip()
            if re.match(r'constructor\s*\(', stripped):
                constructor_start = i
                break

        if constructor_start == -1:
            # Check for injectable without constructor
            if class_name:
                print(f"  WARNING: no constructor found in {filepath} (class {class_name})")
            else:
                print(f"  WARNING: no class or constructor found in {filepath}")
            return changed  # return whether we added import

        # Check if constructor has params
        has_params = ')' not in lines[constructor_start].strip()

        # Find the opening line and inspect params
        if ')' in lines[constructor_start]:
            # Single-line constructor, add param before the closing )
            old = lines[constructor_start]
            # Check if there are existing params
            if '()' in old:
                lines[constructor_start] = old.replace(
                    'constructor()',
                    'constructor(@Optional() private readonly opsAlert?: OpsAlertService)'
                )
            else:
                # Has existing params - add comma and new param
                lines[constructor_start] = old.replace(
                    ')', ', @Optional() private readonly opsAlert?: OpsAlertService)'
                )
            changed = True
        else:
            # Multi-line constructor - find the closing )
            const_end = -1
            for i in range(constructor_start, min(constructor_start + 20, len(lines))):
                if ')' in lines[i] and 'constructor' not in lines[i]:
                    const_end = i
                    break

            if const_end >= 0:
                # Add before closing paren
                old = lines[const_end]
                indent = ' ' * (len(old) - len(old.lstrip()))
                lines[const_end] = f'{indent}@Optional() private readonly opsAlert?: OpsAlertService,'
                # Need to add the closing ) back
                if old.strip() == ')':
                    lines[const_end] = f'{indent}@Optional() private readonly opsAlert?: OpsAlertService'
                    lines.insert(const_end + 1, f'{indent})')
                else:
                    lines[const_end] = f'{indent}@Optional() private readonly opsAlert?: OpsAlertService,'
                changed = True
            else:
                print(f"  WARNING: could not find constructor closing paren in {filepath}")
                return changed

    # --- 5. Instrument catch blocks ---
    if changed:
        content = '\n'.join(lines)
        lines = content.split('\n')

    # Find catch blocks and instrument them
    catch_indices = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if re.match(r'\}\s*catch\s*\(', stripped):
            catch_indices.append(i)

    for catch_idx in catch_indices:
        # Look ahead for the catch body to find where to insert
        # We want to add the alert right after the logger.error line, or at the end of the catch
        logger_found = False
        for j in range(catch_idx + 1, min(catch_idx + 15, len(lines))):
            line_content = lines[j]
            if 'logger.error' in line_content or 'logger.warn' in line_content:
                # Add after this line
                indent = ' ' * (len(line_content) - len(line_content.lstrip()))
                method_name = find_enclosing_function(lines, catch_idx)
                context = f'{class_name}.{method_name}' if class_name else method_name

                alert_line = f'{indent}void this.opsAlert?.alertOnCriticalError(error, \'{context}\');'

                # Check if alert is already there
                if 'alertOnCriticalError' not in lines[j+1] if j+1 < len(lines) else True:
                    if j + 1 < len(lines):
                        # Check next few lines for existing alert
                        has_alert = any('alertOnCriticalError' in lines[k] for k in range(j+1, min(j+5, len(lines))))
                        if not has_alert:
                            lines.insert(j + 1, alert_line)
                            # Adjust remaining catch indices
                            for k in range(len(catch_indices)):
                                if catch_indices[k] > j:
                                    catch_indices[k] += 1
                            changed = True
                    else:
                        lines.append(alert_line)
                        changed = True
                logger_found = True
                break

        if not logger_found:
            # No logger found - add at start of catch body, after the opening brace
            for j in range(catch_idx + 1, min(catch_idx + 10, len(lines))):
                if '{' in lines[j]:
                    indent = ' ' * (len(lines[j]) - len(lines[j].lstrip()) + 2)
                    method_name = find_enclosing_function(lines, catch_idx)
                    context = f'{class_name}.{method_name}' if class_name else method_name
                    alert_line = f'{indent}void this.opsAlert?.alertOnCriticalError(error, \'{context}\');'

                    has_alert = any('alertOnCriticalError' in lines[k] for k in range(j, min(j+5, len(lines))))
                    if not has_alert:
                        lines.insert(j + 1, alert_line)
                        for k in range(len(catch_indices)):
                            if catch_indices[k] > j:
                                catch_indices[k] += 1
                        changed = True
                    break

    # --- 6. Write back ---
    if changed:
        with open(filepath, 'w') as f:
            f.write('\n'.join(lines))
        return True

    return False


def main():
    # Get files from PULSE_HEALTH.json
    with open(f'{ROOT}/PULSE_HEALTH.json') as f:
        health = json.load(f)

    files = set()
    for b in health['breaks']:
        if b['type'] == 'OBSERVABILITY_NO_ALERTING':
            files.add(b['file'])

    remaining = sorted(files - ALREADY_DONE)

    # Only process files that exist and have catch blocks
    to_process = []
    for relpath in remaining:
        abspath = os.path.join(ROOT, relpath)
        if not os.path.exists(abspath):
            print(f"SKIP (missing): {relpath}")
            continue
        with open(abspath) as f:
            content = f.read()
        if 'catch' not in content:
            print(f"SKIP (no catch): {relpath}")
            continue
        if 'alertOnCriticalError' in content:
            print(f"SKIP (already done): {relpath}")
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
                print(f"OK: {relpath}")
            else:
                print(f"NO CHANGE: {relpath}")
        except Exception as e:
            errors.append((relpath, str(e)))
            print(f"ERROR: {relpath}: {e}")

    print(f"\n--- SUMMARY ---")
    print(f"Instrumented: {len(instrumented)}")
    print(f"Errors: {len(errors)}")

    for fpath in sorted(instrumented):
        print(f"  {fpath}")

    if errors:
        print("\nErrors:")
        for fpath, err in errors:
            print(f"  {fpath}: {err}")


if __name__ == '__main__':
    main()
