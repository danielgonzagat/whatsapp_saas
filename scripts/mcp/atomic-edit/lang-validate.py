#!/usr/bin/env python3
"""
Universal syntax validator for the atomic-edit MCP server.

Usage: python3 lang-validate.py <file> <language>

Supported languages (via tree-sitter):
  python, java, c, cpp, go, rust, javascript, typescript, tsx

Output: JSON on stdout
  {"ok": true, "errors": 0}
  {"ok": false, "errors": N, "firstError": "message at line:col"}

If tree-sitter grammar is not available, returns:
  {"ok": true, "errors": -1, "skipped": true, "reason": "grammar not available"}

This allows the caller to fall back to structural balance gracefully.
"""

import json
import sys
import os
from pathlib import Path

# ── tree-sitter imports (all optional — graceful degradation) ──
_GRAMMARS: dict[str, object] = {}

def _load_grammars():
    """Load available tree-sitter grammars. Lazy — only loads what's needed."""
    global _GRAMMARS
    if _GRAMMARS:
        return

    # Map language tags to (module_name, attribute_name)
    _registry = {
        'python':     ('tree_sitter_python', 'language'),
        'java':       ('tree_sitter_java', 'language'),
        'c':          ('tree_sitter_c', 'language'),
        'cpp':        ('tree_sitter_cpp', 'language'),
        'go':         ('tree_sitter_go', 'language'),
        'rust':       ('tree_sitter_rust', 'language'),
        'javascript': ('tree_sitter_javascript', 'language'),
        'typescript': ('tree_sitter_javascript', 'language'),
        'tsx':        ('tree_sitter_javascript', 'language'),
    }

    for lang, (mod_name, attr_name) in _registry.items():
        try:
            mod = __import__(mod_name, fromlist=[attr_name])
            lang_fn = getattr(mod, attr_name)
            if callable(lang_fn):
                lang_obj = lang_fn()
            else:
                lang_obj = lang_fn
            _GRAMMARS[lang] = lang_obj
        except Exception:
            pass


def validate_file(filepath: str, language: str) -> dict:
    """
    Validate a source file using tree-sitter.
    Returns {"ok": bool, "errors": int, "firstError": str | None}
    """
    _load_grammars()

    grammar = _GRAMMARS.get(language)
    if grammar is None:
        return {"ok": True, "errors": -1, "skipped": True,
                "reason": f"grammar not available for {language}"}

    try:
        import tree_sitter
    except ImportError:
        return {"ok": True, "errors": -1, "skipped": True,
                "reason": "tree-sitter not installed"}

    # Read the file
    try:
        with open(filepath, 'rb') as f:
            source_bytes = f.read()
    except Exception as e:
        return {"ok": False, "errors": 1,
                "firstError": f"cannot read file: {e}"}

    # Parse
    parser = tree_sitter.Parser()
    parser.language = tree_sitter.Language(grammar)

    tree = parser.parse(source_bytes)
    root = tree.root_node

    # Check for ERROR nodes and missing children
    errors = []

    def collect_errors(node, depth=0):
        if depth > 500:  # safety limit
            return
        if node.type == 'ERROR':
            # Skip zero-width ERROR nodes at EOF (common tree-sitter artifact)
            if node.start_byte < len(source_bytes):
                errors.append(node)
        if node.is_missing:
            errors.append(node)
        for child in node.children:
            collect_errors(child, depth + 1)

    collect_errors(root)

    # Also check root-level error flag (catches cases where ERROR nodes
    # aren't in the traversal but the tree is marked as having errors)
    if not errors and root.has_error:
        # Find any descendant that's an error
        def find_error_descendant(node, depth=0):
            if depth > 500: return None
            if node.type == 'ERROR' and node.start_byte < len(source_bytes):
                return node
            for child in node.children:
                r = find_error_descendant(child, depth + 1)
                if r: return r
            return None
        err = find_error_descendant(root)
        if err:
            errors.append(err)

    if not errors:
        return {"ok": True, "errors": 0}

    # Report first error with position
    first = errors[0]
    # Count lines up to the error position
    text_before = source_bytes[:first.start_byte].decode('utf-8', errors='replace')
    line = text_before.count('\n') + 1
    last_nl = text_before.rfind('\n')
    col = (first.start_byte - (last_nl + 1)) + 1 if last_nl >= 0 else first.start_byte + 1

    # Get the error context (surrounding text)
    error_text = source_bytes[first.start_byte:first.end_byte].decode('utf-8', errors='replace')
    ctx = error_text[:60].replace('\n', '\\n')

    # Check for "missing" children — gives more informative messages
    missing = []
    if first.child_count == 0 and first.parent:
        # Check if parent is missing something
        pass

    return {
        "ok": False,
        "errors": len(errors),
        "firstError": f"parse error at {line}:{col}: unexpected '{ctx}'"
    }


def main():
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "errors": 1,
                         "firstError": "usage: lang-validate.py <file> <language>"}))
        sys.exit(1)

    filepath = sys.argv[1]
    language = sys.argv[2].lower()

    if not os.path.exists(filepath):
        print(json.dumps({"ok": False, "errors": 1,
                         "firstError": f"file not found: {filepath}"}))
        sys.exit(1)

    result = validate_file(filepath, language)
    print(json.dumps(result))
    sys.exit(0 if result.get('ok') else 1)


if __name__ == '__main__':
    main()
