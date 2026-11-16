#!/usr/bin/env python3
"""subset the bundled CJK face down to what the app can actually render.

the upstream Fusion Pixel zh_hans build ships 38,213 code points (19,546 han) at
936 KB. the app never needs all of them, but it needs more than the UI strings:
episode names, folder names, file paths and Scene Scout queries are user text, so
a UI-only subset turns a chinese file name into tofu boxes.

the default target is therefore GB/T 2312 (6,763 han) plus every han the shipped
locales use, which covers everyday chinese text at a quarter of the size.

usage:
  python scripts/build-cjk-font.py <source.woff2|ttf> [--coverage gb2312|gbk|ui-only]
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.subset import Options, Subsetter
except ImportError:
    sys.exit("fontTools is required: pip install 'fonttools[woff]' brotli")

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "src" / "i18n" / "locales"
OUT = ROOT / "src" / "assets" / "fonts" / "fusion-pixel-12px-proportional-zh_hans.ttf.woff2"

# latin, the cjk punctuation block and the fullwidth forms always ship
BASE = (
    [range(0x20, 0x7F), range(0x3000, 0x3040), range(0xFF00, 0xFFF0)]
)


def locale_chars() -> set[str]:
    """every character the shipped translations use, so no UI string can go missing"""
    found: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        elif isinstance(node, str):
            found.update(node)

    if LOCALES.is_dir():
        for path in sorted(LOCALES.glob("*/*.json")):
            walk(json.loads(path.read_text(encoding="utf-8")))
    return found


def encodable(codec: str) -> set[str]:
    """every han the given legacy chinese encoding can represent"""
    out = set()
    for cp in range(0x4E00, 0xA000):
        char = chr(cp)
        try:
            char.encode(codec)
        except (UnicodeEncodeError, LookupError):
            continue
        out.add(char)
    return out


COVERAGE = {
    "ui-only": lambda: set(),
    "gb2312": lambda: encodable("gb2312"),
    "gbk": lambda: encodable("gbk"),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="the upstream Fusion Pixel file")
    parser.add_argument("--coverage", choices=sorted(COVERAGE), default="gb2312")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    if not args.source.is_file():
        return f"source font not found: {args.source}"

    chars = set(COVERAGE[args.coverage]()) | locale_chars()
    unicodes = {ord(c) for c in chars}
    for block in BASE:
        unicodes.update(block)

    font = TTFont(args.source)
    covered = set(font.getBestCmap())
    unicodes &= covered

    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.notdef_outline = True
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(args.out)

    before = args.source.stat().st_size / 1024
    after = args.out.stat().st_size / 1024
    print(f"{args.coverage}: {len(unicodes)} code points, {after:.1f} KB (was {before:.1f} KB)")
    print(f"wrote {args.out.relative_to(ROOT.parent) if args.out.is_relative_to(ROOT.parent) else args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
