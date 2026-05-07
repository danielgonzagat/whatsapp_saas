#!/usr/bin/env python3
"""Fix context strings where method name finder matched logger calls."""
import os, re

ROOT = '/Users/danielpenin/whatsapp_saas/backend/src'

SKIP_KEYWORDS = frozenset({
    'if', 'while', 'for', 'switch', 'catch', 'try', 'new', 'throw',
    'return', 'break', 'continue', 'get', 'set', 'await', 'import',
    'export', 'default', 'class', 'interface', 'type', 'enum',
    'constructor', 'require', 'module', 'extends', 'implements',
    'as', 'of', 'in', 'typeof', 'instanceof', 'delete',
})


def is_method_call(stripped: str, match_start: int) -> bool:
    """Check if the matched name is preceded by a dot (method call)."""
    before = stripped[:match_start].rstrip()
    return before.endswith('.')


def is_method_declaration(stripped: str, match_start: int) -> bool:
    """Check if this looks like a method/function declaration."""
    before = stripped[:match_start].strip()
    # Function declarations at file/class level
    # async name(  |  private async name(  |  public name(  |  name(
    if not before:
        return True
    # Check for common declaration prefixes
    prefix_match = re.match(
        r'^(async|static|private|public|protected|readonly|export\s+(default\s+)?)(\s+(async|static))?$',
        before
    )
    return prefix_match is not None


def find_enclosing_method(lines: list, catch_idx: int) -> str:
    """Find enclosing function/method. Skip function calls and decorators."""
    for i in range(catch_idx, -1, -1):
        stripped = lines[i].strip()

        # Skip decorators, comments
        if stripped.startswith('@') or stripped.startswith('//') or stripped.startswith('/'):
            continue
        if not stripped:
            continue

        # Match: [modifiers] [async] name(
        m = re.search(r'(?:private\s+|public\s+|protected\s+|static\s+|readonly\s+|export\s+)*(?:async\s+)?(\w+)\s*\(', stripped)
        if not m:
            continue

        name = m.group(1)
        if name.lower() in SKIP_KEYWORDS:
            continue

        match_start = m.start(1)

        # Skip method calls (preceded by dot)
        if is_method_call(stripped, match_start):
            continue

        # Must look like a declaration
        if not is_method_declaration(stripped, match_start):
            continue

        return name

    return 'unknown'


def fix_file(filepath: str) -> bool:
    with open(filepath) as f:
        content = f.read()

    lines = content.split('\n')
    changed = False

    alert_pattern = re.compile(r"(void\s+this\.[a-zA-Z]+)\?\.alertOnCriticalError\((\w+),\s*'(\w+)\.(\w+)'\)")

    new_lines = list(lines)
    for i, line in enumerate(new_lines):
        m = alert_pattern.search(line)
        if not m:
            continue

        prefix = m.group(1)
        err_var = m.group(2)
        cls = m.group(3)
        meth = m.group(4)

        # Only fix if method name is a logger-like name
        if meth.lower() not in ('log', 'error', 'warn', 'info', 'debug', 'verbose', 'trim', 'injectable', 'unknown'):
            continue

        real_method = find_enclosing_method(lines, i)

        old = f"{prefix}?.alertOnCriticalError({err_var}, '{cls}.{meth}')"
        new = f"{prefix}?.alertOnCriticalError({err_var}, '{cls}.{real_method}')"

        new_lines[i] = new_lines[i].replace(old, new)
        changed = True

    if changed:
        with open(filepath, 'w') as f:
            f.write('\n'.join(new_lines))
        return True
    return False


def main():
    bad = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        for f in filenames:
            if not f.endswith('.ts'):
                continue
            path = os.path.join(dirpath, f)
            try:
                content = open(path).read()
            except:
                continue
            if 'alertOnCriticalError' not in content:
                continue
            for m in re.finditer(r"alertOnCriticalError\(\w+,\s*'(\w+)\.(\w+)'\)", content):
                _, meth = m.group(1), m.group(2)
                if meth.lower() in ('log', 'error', 'warn', 'info', 'debug', 'verbose', 'trim', 'injectable', 'unknown'):
                    bad.append(path)
                    break

    fixed = 0
    for path in sorted(set(bad)):
        try:
            if fix_file(path):
                fixed += 1
                print(f"FIXED: {path.replace(ROOT + '/', '')}")
            else:
                print(f"SKIP: {path.replace(ROOT + '/', '')}")
        except Exception as e:
            print(f"ERROR: {path}: {e}")

    print(f"\nFixed: {fixed}")

if __name__ == '__main__':
    main()
