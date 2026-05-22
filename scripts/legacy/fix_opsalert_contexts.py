#!/usr/bin/env python3
"""Fix bad alertOnCriticalError context strings (Injectable/unknown)."""
import os, re

ROOT = '/Users/danielpenin/whatsapp_saas/backend/src'
SKIP_KEYWORDS = {'if', 'while', 'for', 'switch', 'catch', 'try', 'new', 'throw',
                  'return', 'break', 'continue', 'constructor', 'get', 'set'}

def find_enclosing_function(lines, catch_line_idx):
    """Find the enclosing function/method name for a catch block."""
    brace_depth = 0
    for i in range(catch_line_idx, -1, -1):
        line = lines[i]
        stripped = line.strip()

        # Track braces going UPWARD (closing braces increase depth, opening decrease)
        brace_depth += stripped.count('}') - stripped.count('{')

        # Skip decorators
        if stripped.startswith('@'):
            continue

        # Only match at depth 0 (class-level) or depth 1 (method-level)
        # Method pattern: async name(, name(, private async name(, etc
        m = re.search(r'(?:private|public|protected|static|readonly)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?:\{|:)', stripped)
        if m:
            name = m.group(1)
            if name.lower() not in SKIP_KEYWORDS and not name.startswith('Injectable'):
                return name

        # Arrow function pattern: const name = async ( | const name = (
        m = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(', stripped)
        if m:
            name = m.group(1)
            if name.lower() not in SKIP_KEYWORDS:
                return name

        # Class method pattern (at class body level): name(
        m = re.search(r'^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[{:]?\s*$', line)
        if m:
            name = m.group(1)
            if name.lower() not in SKIP_KEYWORDS and not name.startswith('Injectable'):
                return name

    return 'unknown'

def fix_file(filepath):
    with open(filepath) as f:
        content = f.read()

    lines = content.split('\n')
    changed = False

    # Find bad patterns: 'ClassName.Injectable' or 'ClassName.unknown'
    bad_pattern = re.compile(r"(void\s+this\.opsAlert\?\.alertOnCriticalError\(error,\s*)'(\w+)\.(Injectable|unknown)'")

    new_lines = []
    for i, line in enumerate(lines):
        m = bad_pattern.search(line)
        if m:
            # Find the real enclosing function
            method_name = find_enclosing_function(lines, i)
            class_name = m.group(2)
            prefix = m.group(1)
            old_context = f"'{class_name}.{m.group(3)}'"
            new_context = f"'{class_name}.{method_name}'"
            line = line.replace(old_context, new_context)
            changed = True
        new_lines.append(line)

    if changed:
        with open(filepath, 'w') as f:
            f.write('\n'.join(new_lines))
        return True
    return False

def main():
    files = [
        'backend/src/meta/meta-sdk.service.ts',
        'backend/src/common/storage/storage-drivers.service.ts',
        'backend/src/kloel/kloel-conversation-store.ts',
        'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        'backend/src/kloel/kloel-tool-executor-whatsapp.service.ts',
        'backend/src/kloel/llm-budget.service.ts',
        'backend/src/admin/destructive/destructive-intent.service.ts',
        'backend/src/ai-brain/agent-assist.helpers.ts',
        'backend/src/admin/audit/admin-audit.service.ts',
    ]

    for f in files:
        path = os.path.join(ROOT, '..')  # root already includes src
        relpath = f if f.startswith('backend/') else f'backend/src/{f}'
        abspath = os.path.join(ROOT, '..', f.replace('backend/src/', '')) if f.startswith('backend/') else os.path.join(ROOT, f)

        # Fix the path
        if os.path.exists(abspath):
            pass
        elif os.path.exists(os.path.join('/Users/danielpenin/whatsapp_saas', f)):
            abspath = os.path.join('/Users/danielpenin/whatsapp_saas', f)
        else:
            print(f"SKIP (not found): {f}")
            continue

        try:
            if fix_file(abspath):
                print(f"FIXED: {f}")
            else:
                print(f"OK (no fix needed): {f}")
        except Exception as e:
            print(f"ERROR: {f}: {e}")

if __name__ == '__main__':
    main()
