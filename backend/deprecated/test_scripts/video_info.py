"""Dump exhaustive video information via ffprobe, with an optional diff mode.

Examples
--------
# Single file, full ffprobe JSON:
python video_info.py "C:\\path\\one.mkv"

# Compare two files side-by-side; print only the keys that differ:
python video_info.py "C:\\good.mkv" "C:\\bad.mkv" --diff

# Compare and also print full per-file JSON above the diff:
python video_info.py good.mkv bad.mkv --diff --full

Notes
-----
- Uses the ffprobe bundled at ``backend/bin/ffprobe[.exe]`` when available,
  otherwise falls back to whatever ``ffprobe`` is on PATH.
- Pulls -show_format, -show_streams, -show_chapters, -show_programs,
  -show_error and side data (so you see HDR, MasterDisplay metadata, etc.).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from typing import Any


def find_ffprobe() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    # backend/deprecated/test_scripts/ -> backend/bin
    backend_bin = os.path.normpath(os.path.join(here, "..", "..", "bin"))
    candidates = []
    if sys.platform == "win32":
        candidates.append(os.path.join(backend_bin, "ffprobe.exe"))
    candidates.append(os.path.join(backend_bin, "ffprobe"))

    for path in candidates:
        if os.path.isfile(path):
            return path

    found = shutil.which("ffprobe")
    if found:
        return found

    print("ERROR: could not locate ffprobe. Put it on PATH or at backend/bin/.",
          file=sys.stderr)
    sys.exit(2)


def run_ffprobe(ffprobe: str, video_path: str) -> dict[str, Any]:
    if not os.path.isfile(video_path):
        return {"_error": f"file not found: {video_path}"}

    creationflags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW

    args = [
        ffprobe,
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-show_chapters",
        "-show_programs",
        "-show_error",
        "-show_private_data",
        "-show_data_hash", "CRC32",
        "-of", "json",
        video_path,
    ]

    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            creationflags=creationflags,
        )
    except FileNotFoundError as e:
        return {"_error": f"ffprobe not runnable: {e}"}

    if result.returncode != 0:
        return {
            "_error": f"ffprobe exited {result.returncode}",
            "_stderr": result.stderr.strip(),
        }

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        return {
            "_error": f"json parse failed: {e}",
            "_stdout": result.stdout[:2000],
        }


# ---------- diff helpers --------------------------------------------------


def flatten(obj: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten nested dicts/lists to {"a.b[0].c": value, ...}."""
    out: dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(flatten(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(obj, list):
        # Index streams/programs/chapters by codec_type+index when possible
        # so adding/removing an audio track doesn't shift everything.
        for i, v in enumerate(obj):
            key = None
            if isinstance(v, dict):
                ct = v.get("codec_type")
                idx = v.get("index")
                if ct is not None and idx is not None:
                    key = f"{ct}#{idx}"
                elif idx is not None:
                    key = f"idx{idx}"
            tag = f"[{key}]" if key else f"[{i}]"
            out.update(flatten(v, f"{prefix}{tag}"))
    else:
        out[prefix] = obj
    return out


def diff_reports(a: dict[str, Any], b: dict[str, Any]) -> list[tuple[str, Any, Any]]:
    fa = flatten(a)
    fb = flatten(b)
    keys = sorted(set(fa) | set(fb))
    rows: list[tuple[str, Any, Any]] = []
    for k in keys:
        va = fa.get(k, "<missing>")
        vb = fb.get(k, "<missing>")
        if va != vb:
            rows.append((k, va, vb))
    return rows


# ---------- output --------------------------------------------------------


def print_full(label: str, report: dict[str, Any], out) -> None:
    print(f"\n===== {label} =====", file=out)
    print(json.dumps(report, indent=2, ensure_ascii=False), file=out)


def print_diff(label_a: str, label_b: str, rows: list[tuple[str, Any, Any]], out) -> None:
    print(f"\n===== DIFF: {label_a}  vs  {label_b} =====", file=out)
    if not rows:
        print("(no differences)", file=out)
        return

    key_w = max(len(k) for k, _, _ in rows)
    key_w = min(key_w, 70)
    print(f"{'KEY'.ljust(key_w)}  | A | B", file=out)
    print("-" * (key_w + 2) + "+---+---", file=out)
    for k, va, vb in rows:
        ka = k if len(k) <= key_w else "..." + k[-(key_w - 3):]
        print(f"{ka.ljust(key_w)}  | {va!r}", file=out)
        print(f"{' '.ljust(key_w)}  | {vb!r}", file=out)
        print("-" * (key_w + 2) + "+---+---", file=out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", help="One or two video file paths")
    parser.add_argument("--diff", action="store_true",
                        help="When two paths given, show only differing fields")
    parser.add_argument("--full", action="store_true",
                        help="Also print full per-file JSON")
    parser.add_argument("--ffprobe", help="Override ffprobe path")
    parser.add_argument("-o", "--output", help="Write the report to this file instead of stdout")
    args = parser.parse_args()

    if len(args.paths) > 2:
        print("ERROR: pass at most two paths", file=sys.stderr)
        return 2

    ffprobe = args.ffprobe or find_ffprobe()
    print(f"# using ffprobe: {ffprobe}", file=sys.stderr)

    reports = [(p, run_ffprobe(ffprobe, p)) for p in args.paths]

    if args.output:
        out_file = open(args.output, "w", encoding="utf-8")
    else:
        out_file = sys.stdout

    try:
        if len(reports) == 1 or args.full or not args.diff:
            for path, report in reports:
                print_full(path, report, out_file)

        if len(reports) == 2 and args.diff:
            (label_a, ra), (label_b, rb) = reports
            rows = diff_reports(ra, rb)
            print_diff(label_a, label_b, rows, out_file)
    finally:
        if out_file is not sys.stdout:
            out_file.close()
            print(f"# wrote: {args.output}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
