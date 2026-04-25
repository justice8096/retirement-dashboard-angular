#!/usr/bin/env python3
"""Extract inline template + styles from an Angular component .ts file.

Usage: python extract-inline-template.py <path-to-component.ts>

Side effects:
  - Writes <path>/<basename>.component.html (and .scss if styles found)
  - Rewrites the .ts to use templateUrl/styleUrls instead of inline blocks

Idempotent: refuses to overwrite an existing .html / .scss file.
Backtick-aware: assumes templates / styles do not contain literal backticks
(true for HTML and SCSS).
"""

import re
import sys
from pathlib import Path


def find_balanced_backtick(src: str, start: int) -> int:
    """Given index of the opening backtick of a template literal, return the
    index of its closing backtick (assuming no nested backticks inside)."""
    i = start + 1
    while i < len(src):
        if src[i] == '\\':
            i += 2
            continue
        if src[i] == '`':
            return i
        i += 1
    raise ValueError("unterminated template literal")


def extract_template(src: str) -> tuple[str | None, str]:
    """Return (template_content, new_src_with_templateUrl)."""
    m = re.search(r'^(\s*)template:\s*`', src, re.MULTILINE)
    if not m:
        return None, src
    open_tick = m.end() - 1
    close_tick = find_balanced_backtick(src, open_tick)
    content = src[open_tick + 1 : close_tick]
    # Strip a single leading newline (template strings typically start `\n`)
    if content.startswith('\n'):
        content = content[1:]
    # Right-strip trailing whitespace lines but keep one final newline
    content = content.rstrip() + '\n'
    indent = m.group(1)
    # Consume an immediate trailing comma so we don't double up with the one
    # we add. Whitespace is preserved (it belongs to the next decorator entry).
    end_idx = close_tick + 1
    if end_idx < len(src) and src[end_idx] == ',':
        end_idx += 1
    new_src = (
        src[: m.start()]
        + f'{indent}templateUrl: \'./__HTMLNAME__\','
        + src[end_idx:]
    )
    return content, new_src


def extract_styles(src: str) -> tuple[str | None, str]:
    """Return (styles_content, new_src_with_styleUrls). Handles styles: [`...`]."""
    m = re.search(r'^(\s*)styles:\s*\[\s*`', src, re.MULTILINE)
    if not m:
        # Also try styles: [` on the same line as previous block (no leading whitespace)
        m = re.search(r'styles:\s*\[\s*`', src)
        if not m:
            return None, src
        indent = '  '
    else:
        indent = m.group(1)
    open_tick = m.end() - 1
    close_tick = find_balanced_backtick(src, open_tick)
    content = src[open_tick + 1 : close_tick]
    if content.startswith('\n'):
        content = content[1:]
    content = content.rstrip() + '\n'
    # Block ends with backtick then `]` (possibly with whitespace), then an
    # optional immediate comma — consume it so we don't get `,,`.
    after = src[close_tick + 1 :]
    am = re.match(r'\s*\]', after)
    if not am:
        raise ValueError("expected ] after styles array")
    end_idx = close_tick + 1 + am.end()
    if end_idx < len(src) and src[end_idx] == ',':
        end_idx += 1
    new_src = (
        src[: m.start()]
        + f'{indent}styleUrls: [\'./__SCSSNAME__\'],'
        + src[end_idx:]
    )
    return content, new_src


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: extract-inline-template.py <component.ts>", file=sys.stderr)
        return 2
    ts_path = Path(sys.argv[1])
    if not ts_path.exists():
        print(f"not found: {ts_path}", file=sys.stderr)
        return 1
    base = ts_path.name.removesuffix('.ts')  # foo.component
    html_name = base + '.html'
    scss_name = base + '.scss'
    html_path = ts_path.parent / html_name
    scss_path = ts_path.parent / scss_name

    src = ts_path.read_text(encoding='utf-8')
    template, src = extract_template(src)
    styles, src = extract_styles(src)

    if template is None and styles is None:
        print(f"no inline template or styles found in {ts_path}")
        return 0

    # Preflight ALL destinations before writing anything — refusing midway
    # would leave the .ts still-inline but one of html/scss already created,
    # and a rerun would then collide on the freshly-written file.
    if template is not None and html_path.exists():
        print(f"refusing to overwrite existing {html_path}", file=sys.stderr)
        return 1
    if styles is not None and scss_path.exists():
        print(f"refusing to overwrite existing {scss_path}", file=sys.stderr)
        return 1

    if template is not None:
        html_path.write_text(template, encoding='utf-8')
        src = src.replace('__HTMLNAME__', html_name)
        print(f"wrote {html_path} ({len(template.splitlines())} lines)")

    if styles is not None:
        scss_path.write_text(styles, encoding='utf-8')
        src = src.replace('__SCSSNAME__', scss_name)
        print(f"wrote {scss_path} ({len(styles.splitlines())} lines)")

    ts_path.write_text(src, encoding='utf-8')
    print(f"updated {ts_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
