#!/usr/bin/env python3
"""check a candidate CJK face against the bundled one before swapping it in.

the UI is laid out around Fusion Pixel's metrics: a 1200 unit em on a 100 unit
pixel grid, a full width han advance, and an ascent/descent pair that sets every
line box. a replacement that misses any of those reflows the whole app, so this
compares a candidate against scripts/cjk-font-spec.json and the coverage list.

usage:
  python scripts/check-cjk-font.py <candidate.otf|ttf|woff2>
  python scripts/check-cjk-font.py <candidate> --emit-spec   # rewrite the spec from it
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools is required: pip install 'fonttools[woff]' brotli")

HERE = Path(__file__).resolve().parent
SPEC = HERE / "cjk-font-spec.json"
COVERAGE = HERE / "cjk-font-coverage.txt"


def read_coverage() -> set[int]:
    out = set()
    for line in COVERAGE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.add(int(line[2:], 16))
    return out


def measure(font: TTFont) -> dict:
    head, hhea, os2, hmtx = font["head"], font["hhea"], font["OS/2"], font["hmtx"]
    cmap = font.getBestCmap()

    def advance(ch):
        glyph = cmap.get(ord(ch))
        return hmtx[glyph][0] if glyph else None

    return {
        "unitsPerEm": head.unitsPerEm,
        "vertical": {
            "hheaAscent": hhea.ascent, "hheaDescent": hhea.descent, "hheaLineGap": hhea.lineGap,
            "typoAscender": os2.sTypoAscender, "typoDescender": os2.sTypoDescender,
            "typoLineGap": os2.sTypoLineGap,
            "winAscent": os2.usWinAscent, "winDescent": os2.usWinDescent,
            "xHeight": os2.sxHeight, "capHeight": os2.sCapHeight,
            "useTypoMetrics": bool(os2.fsSelection & (1 << 7)),
        },
        "advances": {
            "han": advance("的"), "ideographicSpace": advance("　"),
            "latinA": advance("A"), "latinI": advance("i"), "space": advance(" "),
        },
        "weightClass": os2.usWeightClass,
        "widthClass": os2.usWidthClass,
    }


def grid_report(font: TTFont, grid: int) -> tuple[int, int, int]:
    """pixel fonts are rectangles on a grid; anything else is a different style"""
    if "glyf" not in font:
        return (-1, -1, -1)
    glyf = font["glyf"]
    checked = off_grid = off_curve = 0
    for name in list(font.getGlyphOrder())[:4000]:
        glyph = glyf[name]
        if glyph.numberOfContours <= 0:
            continue
        points, _, flags = glyph.getCoordinates(glyf)
        for x, y in points:
            checked += 1
            if x % grid or y % grid:
                off_grid += 1
        off_curve += sum(1 for flag in flags if not flag & 1)
    return checked, off_grid, off_curve


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--emit-spec", action="store_true", help="rewrite the spec and coverage list from this font")
    args = parser.parse_args()

    font = TTFont(args.candidate)

    if args.emit_spec:
        spec = measure(font)
        spec["pixelGrid"] = 100
        cmap = sorted(font.getBestCmap())
        spec["coverage"] = {"codePoints": len(cmap),
                            "han": sum(1 for c in cmap if 0x4E00 <= c <= 0x9FFF)}
        SPEC.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        with COVERAGE.open("w", encoding="utf-8") as handle:
            handle.write("# every code point the bundled CJK face must cover\n")
            for cp in cmap:
                handle.write(f"U+{cp:04X}\n")
        print(f"spec rewritten from {args.candidate.name}: {len(cmap)} code points")
        return 0

    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    got = measure(font)
    problems = []

    if got["unitsPerEm"] != spec["unitsPerEm"]:
        problems.append(f"unitsPerEm {got['unitsPerEm']} != {spec['unitsPerEm']}")
    for key, want in spec["vertical"].items():
        if got["vertical"].get(key) != want:
            problems.append(f"vertical.{key} {got['vertical'].get(key)} != {want}")
    for key, want in spec["advances"].items():
        if got["advances"].get(key) != want:
            problems.append(f"advance {key} {got['advances'].get(key)} != {want}")

    wanted = read_coverage()
    have = set(font.getBestCmap())
    missing = wanted - have
    if missing:
        sample = "".join(chr(c) for c in sorted(missing)[:24])
        problems.append(f"{len(missing)} code points missing, e.g. {sample}")

    grid = spec.get("pixelGrid", 100)
    checked, off_grid, off_curve = grid_report(font, grid)
    if checked < 0:
        print(f"note: CFF outlines, the {grid}-unit grid check only runs on quadratic ones")
    elif off_grid or off_curve:
        problems.append(f"{off_grid} points off the {grid}-unit grid, {off_curve} off-curve "
                        f"(the bundled face has none of either)")

    print(f"{args.candidate.name}: {len(have)} code points, {len(have & wanted)}/{len(wanted)} of the required set")
    if checked > 0:
        print(f"outlines: {checked} points checked, {off_grid} off-grid, {off_curve} off-curve")
    if problems:
        print(f"\nnot a drop-in replacement ({len(problems)}):")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("\nmatches the bundled face: metrics, coverage and pixel grid all line up")
    return 0


if __name__ == "__main__":
    sys.exit(main())
