"""Loads the team's own curated markdown from research/*.md as grounding
context for the reasoning layer.

research/ holds one file per pipeline step, numbered in step order (01
Upload, 02 Design, 03 Raw QC, ...). Each file declares which gate_ids it
covers in a `gate_ids: [...]` YAML header (e.g. research/02_study_design.md
covers G1-G4); a gate only gets a research note once a step file exists
that lists it - not every gate has one written yet.

The point: before any gate hands a prompt to Claude, it should read through
our own written material for that exact decision first, so Claude reasons
from our curated domain knowledge, not just its training data or a
hand-paraphrased summary that can drift out of sync with the source. Read
fresh from disk on every call (not cached at import) so edits take effect
on the next request with no server restart.
"""

import re
from pathlib import Path

# app/server/reasoning/knowledge_base.py -> app/server/reasoning -> app/server
# -> app -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_RESEARCH_DIR = _REPO_ROOT / "research"

_GATE_IDS_RE = re.compile(r"^gate_ids:\s*\[(.*?)\]", re.MULTILINE)
_PAGE_KEY_RE = re.compile(r"^page_key:\s*([^\s]+)", re.MULTILINE)


def load_research_notes(gate_id: str) -> list[str]:
    """Return every research/*.md step doc whose `gate_ids` header lists
    this gate, e.g. research/02_study_design.md's `gate_ids: [G1, G2, G3,
    G4]` matches gate_id="G4".

    Returns:
        A list of full file contents (usually 0 or 1 entries - a gate
        typically belongs to one pipeline step). Empty if research/ is
        missing or no step file covers this gate yet, which is expected:
        research/ only goes through Step 3 (raw QC / G5) so far.
    """
    if not _RESEARCH_DIR.exists():
        return []
    notes = []
    for path in sorted(_RESEARCH_DIR.glob("*.md")):
        text = path.read_text()
        match = _GATE_IDS_RE.search(text)
        if not match:
            continue
        ids = [g.strip() for g in match.group(1).split(",") if g.strip()]
        if gate_id in ids:
            notes.append(text)
    return notes


def load_research_page(page_key: str) -> str | None:
    """Load the complete research instruction document for a workflow page.

    Final synthesis is a page-level task rather than a decision gate, so its
    instruction file deliberately has no ``gate_ids``. This companion lookup
    keeps that document in the same authoritative, read-fresh path as the gate
    notes instead of duplicating its scientific contract in application code.
    """
    if not _RESEARCH_DIR.exists():
        return None
    for path in sorted(_RESEARCH_DIR.glob("*.md")):
        text = path.read_text()
        match = _PAGE_KEY_RE.search(text)
        if match and match.group(1).strip() == page_key:
            return text
    return None
