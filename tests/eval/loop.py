#!/usr/bin/env python3
"""
tests/eval/loop.py -- the iteration driver. Runs runner.py against one
RUN.json, archives the graded result with a timestamp, and diffs it against
the previous run so you can see exactly which test IDs flipped between two
iterations of the agent/pipeline. This is the piece that turns "a test
suite" into "a loop for iterative improvement": run it after every change,
watch the diff, keep going until it's quiet.

Two ways to feed it a run:
  1. Point at an already-produced RUN.json:
       python tests/eval/loop.py --run path/to/output.json --label "after prompt tweak v3"
  2. Give it a command that PRODUCES a RUN.json at a path you tell it to write to
     (useful once the pipeline has a CLI entrypoint):
       python tests/eval/loop.py --cmd "python app/server/run_pipeline.py --dataset crc_baxter --out {out}" \\
           --label "after prompt tweak v3"
     "{out}" in --cmd is substituted with a temp path this script controls.

Every invocation appends one line to tests/eval/reports/history.jsonl and
writes a full report to tests/eval/reports/<timestamp>__<label>/. Nothing
here decides pass/fail on its own -- it delegates to runner.py and just adds
the "did this get better or worse than last time" layer on top.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPORTS_DIR = HERE / "reports"
HISTORY_FILE = REPORTS_DIR / "history.jsonl"


def slugify(label):
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:40] or "run"


def produce_run_json(cmd_template, workdir):
    out_path = workdir / "run_result.json"
    cmd = cmd_template.format(out=str(out_path))
    print(f"[loop] executing: {cmd}")
    proc = subprocess.run(cmd, shell=True, cwd=str(Path(__file__).resolve().parents[2]))
    if proc.returncode != 0:
        print(f"[loop] pipeline command exited {proc.returncode}", file=sys.stderr)
        sys.exit(2)
    if not out_path.exists():
        print(f"[loop] pipeline command did not produce {out_path}", file=sys.stderr)
        sys.exit(2)
    return out_path


def load_previous_report():
    if not HISTORY_FILE.exists():
        return None
    lines = [ln for ln in HISTORY_FILE.read_text().splitlines() if ln.strip()]
    if not lines:
        return None
    last = json.loads(lines[-1])
    report_path = Path(last["report_json"])
    if not report_path.exists():
        return None
    return {r["id"]: r["verdict"] for r in json.loads(report_path.read_text())}


def diff_against_previous(current_results, previous_verdicts):
    if previous_verdicts is None:
        print("[loop] no previous run recorded -- this is the baseline.")
        return
    improved, regressed, unchanged_fail, not_graded = [], [], [], []
    for r in current_results:
        prev = previous_verdicts.get(r["id"])
        if prev is None:
            continue
        if prev == "SKIPPED" or r["verdict"] == "SKIPPED":
            not_graded.append(r["id"])
        elif prev != "PASS" and r["verdict"] == "PASS":
            improved.append(r["id"])
        elif prev == "PASS" and r["verdict"] != "PASS":
            regressed.append(r["id"])
        elif prev != "PASS" and r["verdict"] != "PASS":
            unchanged_fail.append(r["id"])
    print("\n" + "=" * 78)
    print("DELTA VS PREVIOUS RUN")
    print("=" * 78)
    print(f"  Newly passing : {improved or 'none'}")
    print(f"  Newly failing : {regressed or 'none'}  {'!! REGRESSION' if regressed else ''}")
    print(f"  Still failing : {unchanged_fail or 'none'}")
    print(f"  Not graded (skipped in either run) : {not_graded or 'none'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--run", help="path to an already-produced RUN.json")
    src.add_argument("--cmd", help="shell command that produces a RUN.json; use {out} as the output path placeholder")
    ap.add_argument("--label", default="iteration", help="short label for this run, e.g. 'after prompt tweak v3'")
    ap.add_argument("--manifest", default=str(HERE / "manifest" / "crc_baxter_manifest.json"))
    ap.add_argument("--skip-judge", action="store_true")
    args = ap.parse_args()

    REPORTS_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = REPORTS_DIR / f"{timestamp}__{slugify(args.label)}"
    run_dir.mkdir(parents=True, exist_ok=True)

    if args.cmd:
        with tempfile.TemporaryDirectory() as td:
            produced = produce_run_json(args.cmd, Path(td))
            run_json_path = run_dir / "run_result.json"
            run_json_path.write_text(produced.read_text())
    else:
        run_json_path = run_dir / "run_result.json"
        run_json_path.write_text(Path(args.run).read_text())

    report_json_path = run_dir / "report.json"
    runner_cmd = [
        sys.executable, str(HERE / "runner.py"),
        "--run", str(run_json_path),
        "--manifest", args.manifest,
        "--json-report", str(report_json_path),
    ]
    if args.skip_judge:
        runner_cmd.append("--skip-judge")

    previous_verdicts = load_previous_report()

    proc = subprocess.run(runner_cmd)
    results = json.loads(report_json_path.read_text()) if report_json_path.exists() else []

    diff_against_previous(results, previous_verdicts)

    ready = [r for r in results if r["status"] == "ready"]
    pass_count = sum(1 for r in ready if r["verdict"] == "PASS")
    with HISTORY_FILE.open("a") as f:
        f.write(json.dumps({
            "timestamp": timestamp,
            "label": args.label,
            "run_json": str(run_json_path),
            "report_json": str(report_json_path),
            "ready_pass": pass_count,
            "ready_total": len(ready),
            "exit_code": proc.returncode,
        }) + "\n")

    print(f"\n[loop] archived to {run_dir}")
    print(f"[loop] history: {HISTORY_FILE}")
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
