#!/usr/bin/env python3
"""
tests/eval/runner.py -- grades one pipeline RUN.json against
manifest/crc_baxter_manifest.json (see research/09_test_cases_crc_baxter.md
for the human-readable version of every test case this checks).

Two grading paths:
  - Everything except check_type == "llm_judge" is graded in pure code,
    deterministically, with no model call and no API key required.
  - check_type == "llm_judge" entries call judge.py, which uses the
    Anthropic API (requires ANTHROPIC_API_KEY). If the key isn't set, those
    checks are reported as SKIPPED, never silently passed.

Usage:
    python tests/eval/runner.py --run path/to/run_result.json
    python tests/eval/runner.py --run path/to/run_result.json --schema-only
    python tests/eval/runner.py --run path/to/run_result.json --skip-judge
    python tests/eval/runner.py --run path/to/run_result.json --json-report out.json

Exit code: 0 if every non-blocked, non-skipped test PASSes; 1 otherwise.
Blocked tests (status == "blocked" in the manifest -- waiting on stubbed
compute) never affect the exit code; they are reported in their own bucket
so the loop can watch that bucket shrink over time as stubs get replaced.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_MANIFEST = HERE / "manifest" / "crc_baxter_manifest.json"
DEFAULT_SCHEMA = HERE / "schema" / "run_result.schema.json"


def get_path(obj, dotted_path):
    """Walk a dotted path like 'a.b.c' through nested dicts.
    Returns (found: bool, value)."""
    cur = obj
    for part in dotted_path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return False, None
        cur = cur[part]
    return True, cur


class Result:
    def __init__(self, test_id, step, status, check_type, verdict, detail, severity=None):
        self.test_id = test_id
        self.step = step
        self.status = status  # "ready" | "blocked"
        self.check_type = check_type
        self.verdict = verdict  # "PASS" | "FAIL" | "ERROR" | "SKIPPED"
        self.detail = detail
        self.severity = severity

    def to_dict(self):
        return {
            "id": self.test_id, "step": self.step, "status": self.status,
            "check_type": self.check_type, "verdict": self.verdict,
            "detail": self.detail, "severity": self.severity,
        }


# ---------------------------------------------------------------------------
# Deterministic (non-LLM) check implementations
# ---------------------------------------------------------------------------

def check_exact_int(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    tol = t.get("tolerance", 0)
    ok = abs(val - t["expected"]) <= tol
    return ("PASS" if ok else "FAIL", f"got {val}, expected {t['expected']} (+-{tol})")


check_exact_float = check_exact_int  # identical logic, numeric tolerance either way


def check_range(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    ok = t["min"] <= val <= t["max"]
    return ("PASS" if ok else "FAIL", f"got {val}, expected in [{t['min']}, {t['max']}]")


def check_bool_equals(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    ok = bool(val) == bool(t["expected"])
    return ("PASS" if ok else "FAIL", f"got {val}, expected {t['expected']}")


def check_string_equals(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    ok = str(val) == str(t["expected"])
    return ("PASS" if ok else "FAIL", f"got {val!r}, expected {t['expected']!r}")


def check_dict_equals(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    ok = dict(val) == dict(t["expected"])
    return ("PASS" if ok else "FAIL", f"got {val}, expected {t['expected']}")


def check_exact_dict_int(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    tol = t.get("tolerance", 0)
    mismatches = []
    for k, expected_v in t["expected"].items():
        actual_v = val.get(k) if isinstance(val, dict) else None
        if actual_v is None or abs(actual_v - expected_v) > tol:
            mismatches.append(f"{k}: got {actual_v}, expected {expected_v} (+-{tol})")
    ok = not mismatches
    return ("PASS" if ok else "FAIL", "; ".join(mismatches) if mismatches else f"got {val}")


def check_structural(run, t):
    found, val = get_path(run, t["path"])
    if not found or val is None:
        return "FAIL", f"path '{t['path']}' not found or null in run output"
    required_keys = t.get("required_keys")
    if required_keys:
        missing = [k for k in required_keys if not isinstance(val, dict) or k not in val]
        if missing:
            return "FAIL", f"missing required keys: {missing}"
    return "PASS", f"present: {t['path']}"


def check_critical_not_equal(run, t):
    found, val = get_path(run, t["path"])
    if not found:
        return "FAIL", f"path '{t['path']}' not found in run output"
    tol = t.get("tolerance", 0)
    too_close = abs(val - t["forbidden"]) <= tol
    if too_close:
        return "FAIL", f"got {val}, within {tol} of forbidden value {t['forbidden']} (see description for why this is critical)"
    return "PASS", f"got {val}, safely away from forbidden value {t['forbidden']}"


def check_greater_than(run, t):
    found_a, val_a = get_path(run, t["path_a"])
    found_b, val_b = get_path(run, t["path_b"])
    if not found_a or not found_b:
        return "FAIL", f"path missing: a_found={found_a} b_found={found_b}"
    ok = val_a > val_b
    return ("PASS" if ok else "FAIL", f"{t['path_a']}={val_a} vs {t['path_b']}={val_b}")


def _genus_meets_condition(genus_entry, condition):
    if genus_entry is None:
        return False
    if "q_below" in condition:
        q = genus_entry.get("q")
        if q is None or not (q < condition["q_below"]):
            return False
    if "direction_equals" in condition:
        if genus_entry.get("direction") != condition["direction_equals"]:
            return False
    return True


def check_count_meeting_condition(run, t):
    genera_map_found, genera_map = get_path(run, t["path_template"].rsplit(".", 1)[0])
    per_genus_detail = []
    count = 0
    for genus in t["genera"]:
        path = t["path_template"].format(genus=genus)
        found, entry = get_path(run, path)
        met = _genus_meets_condition(entry if found else None, t["condition"])
        if met:
            count += 1
        per_genus_detail.append(f"{genus}={'met' if met else ('missing' if not found else 'not-met')}"
                                 f"({entry.get('q') if found and entry else 'n/a'})")
    detail = f"{count}/{len(t['genera'])} met condition [{', '.join(per_genus_detail)}]"
    if "min_count" in t and count < t["min_count"]:
        return "FAIL", detail + f" -- required >= {t['min_count']}"
    if "max_count" in t and count > t["max_count"]:
        return "FAIL", detail + f" -- required <= {t['max_count']}"
    return "PASS", detail


DETERMINISTIC_CHECKS = {
    "exact_int": check_exact_int,
    "exact_float": check_exact_float,
    "range": check_range,
    "bool_equals": check_bool_equals,
    "string_equals": check_string_equals,
    "dict_equals": check_dict_equals,
    "exact_dict_int": check_exact_dict_int,
    "structural": check_structural,
    "critical_not_equal": check_critical_not_equal,
    "greater_than": check_greater_than,
    "count_meeting_condition": check_count_meeting_condition,
}


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def validate_schema(run, schema_path):
    try:
        import jsonschema
    except ImportError:
        return None, "jsonschema not installed -- skipping schema validation (pip install jsonschema to enable)"
    schema = json.loads(Path(schema_path).read_text())
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(run), key=lambda e: e.path)
    if not errors:
        return True, "schema OK"
    msgs = [f"{'.'.join(str(p) for p in e.path) or '<root>'}: {e.message}" for e in errors[:20]]
    return False, "\n".join(msgs)


def run_llm_judge_check(run, t, judge_module):
    if t.get("text_path"):
        found, text = get_path(run, t["text_path"])
        if not found or not text:
            return "FAIL", f"path '{t['text_path']}' not found or empty"
    elif t.get("list_path"):
        found, text = get_path(run, t["list_path"])
        if not found or not text:
            return "FAIL", f"path '{t['list_path']}' not found or empty"
        text = json.dumps(text, indent=2)
    else:
        return "ERROR", "llm_judge test has neither text_path nor list_path"

    try:
        verdict = judge_module.grade(rubric=t["rubric"], content=text, test_id=t["id"])
    except judge_module.JudgeUnavailable as e:
        return "SKIPPED", str(e)
    except Exception as e:  # noqa: BLE001 -- surface any judge failure as a graded ERROR, not a crash
        return "ERROR", f"judge call failed: {e}"

    verdict_pass = verdict.get("pass")
    reasoning = verdict.get("reasoning", "")
    return ("PASS" if verdict_pass else "FAIL", reasoning)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True, help="path to a RUN.json to grade")
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--schema", default=str(DEFAULT_SCHEMA))
    ap.add_argument("--schema-only", action="store_true", help="only validate against the JSON schema, skip test grading")
    ap.add_argument("--skip-judge", action="store_true", help="skip all llm_judge checks (fast, deterministic-only pass)")
    ap.add_argument("--json-report", default=None, help="write a machine-readable report to this path")
    args = ap.parse_args()

    run = json.loads(Path(args.run).read_text())
    manifest = json.loads(Path(args.manifest).read_text())

    schema_ok, schema_detail = validate_schema(run, args.schema)
    print(f"[schema] {'OK' if schema_ok else ('SKIPPED' if schema_ok is None else 'FAIL')}")
    if schema_detail:
        print(f"  {schema_detail}")
    if args.schema_only:
        sys.exit(0 if schema_ok in (True, None) else 1)

    judge_module = None
    if not args.skip_judge:
        sys.path.insert(0, str(HERE))
        import judge as judge_module  # noqa: E402

    results = []
    for t in manifest["tests"]:
        ct = t["check_type"]
        if ct == "llm_judge":
            if args.skip_judge:
                results.append(Result(t["id"], t["step"], t["status"], ct, "SKIPPED",
                                       "skipped via --skip-judge", t.get("severity")))
                continue
            verdict, detail = run_llm_judge_check(run, t, judge_module)
        elif ct in DETERMINISTIC_CHECKS:
            try:
                verdict, detail = DETERMINISTIC_CHECKS[ct](run, t)
            except Exception as e:  # noqa: BLE001
                verdict, detail = "ERROR", f"checker raised: {e}"
        else:
            verdict, detail = "ERROR", f"unknown check_type '{ct}'"
        results.append(Result(t["id"], t["step"], t["status"], ct, verdict, detail, t.get("severity")))

    print_report(results)

    if args.json_report:
        Path(args.json_report).write_text(json.dumps([r.to_dict() for r in results], indent=2))
        print(f"\nMachine-readable report written to {args.json_report}")

    # Exit code: fail if any READY test did not PASS. Blocked tests and
    # judge-skipped tests never fail the build; they're surfaced, not hidden.
    hard_fail = any(r.verdict in ("FAIL", "ERROR") and r.status == "ready" for r in results)
    sys.exit(1 if hard_fail else 0)


def print_report(results):
    by_step = {}
    for r in results:
        by_step.setdefault(r.step, []).append(r)

    print("\n" + "=" * 78)
    print("GUT PILOT EVAL REPORT -- crc_baxter_golden")
    print("=" * 78)

    for step, rs in by_step.items():
        print(f"\n[{step}]")
        for r in rs:
            marker = {"PASS": "PASS", "FAIL": "FAIL", "ERROR": "ERR ", "SKIPPED": "SKIP"}[r.verdict]
            blocked_tag = " (blocked)" if r.status == "blocked" else ""
            severity_tag = " !!CRITICAL!!" if r.severity == "critical" and r.verdict == "FAIL" else ""
            print(f"  [{marker}] {r.test_id}{blocked_tag}{severity_tag}  {r.detail[:140]}")

    ready = [r for r in results if r.status == "ready"]
    blocked = [r for r in results if r.status == "blocked"]

    def tally(rs):
        return {v: sum(1 for r in rs if r.verdict == v) for v in ("PASS", "FAIL", "ERROR", "SKIPPED")}

    rt = tally(ready)
    bt = tally(blocked)
    print("\n" + "-" * 78)
    print(f"READY   ({len(ready)}): {rt['PASS']} pass, {rt['FAIL']} fail, {rt['ERROR']} error, {rt['SKIPPED']} skipped")
    print(f"BLOCKED ({len(blocked)}): {bt['PASS']} pass, {bt['FAIL']} fail, {bt['ERROR']} error, {bt['SKIPPED']} skipped  (does not affect exit code)")
    critical_fails = [r for r in results if r.severity == "critical" and r.verdict in ("FAIL", "ERROR")]
    if critical_fails:
        print(f"\n!! {len(critical_fails)} CRITICAL test(s) failed: {', '.join(r.test_id for r in critical_fails)}")
    print("-" * 78)


if __name__ == "__main__":
    main()
