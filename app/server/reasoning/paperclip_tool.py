"""Evidence-layer access to the Paperclip biomedical corpus, shelled out to
the `paperclip` CLI (see .claude/skills/paperclip). This is the "Prompt"
mode referenced in docs/gates.md: until a gate's curated T-table lands, the
reviewer resolves citations live instead of hardcoding them, per
docs/scientific_analysis_specs.md's citation policy ("re-resolve it with
`paperclip lookup doi` ... before the agent surfaces a citation").

CLI vs MCP for Paperclip is still an open question (docs/gates.md); this
subprocess wrapper is the CLI-mode implementation and is the piece to
replace if the team moves to an MCP server instead.
"""

import re
import subprocess

from anthropic import beta_tool

_TIMEOUT_S = 45
_MAX_EXCERPT_LINES = 200
_PAPER_ID_RE = re.compile(r"^[A-Za-z0-9_]+$")
_TRAILER_RE = re.compile(r"^\[and \d+ more\]$")


def _run_paperclip(args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["paperclip", *args], capture_output=True, text=True, timeout=_TIMEOUT_S
        )
    except FileNotFoundError:
        return "ERROR: the paperclip CLI is not installed in this environment."
    except subprocess.TimeoutExpired:
        return "ERROR: paperclip command timed out."
    output = result.stdout.strip()
    if result.returncode != 0:
        return f"ERROR: paperclip exited {result.returncode}: {(result.stderr or output).strip()}"
    return output or "(no output)"


@beta_tool
def paperclip_lookup_doi(doi: str) -> str:
    """Look up a specific paper by DOI in the Paperclip biomedical corpus and
    return its metadata: title, authors, corpus document ID (e.g.
    "PMC10900887"), source, year, and a source URL. This does NOT return full
    text or any excerpt - use the returned document ID with
    paperclip_read_excerpt to read the paper's real text and pull a
    line-pinned quote.

    Args:
        doi: The DOI to look up, e.g. "10.1128/msphere.00354-23".
    """
    return _run_paperclip(["lookup", "doi", doi])


@beta_tool
def paperclip_search(query: str, source: str = "pmc") -> str:
    """Semantic and keyword search over the Paperclip biomedical corpus.

    Args:
        query: A natural-language or keyword search query.
        source: Which corpus to search. One of "pmc" (peer-reviewed PubMed
            Central papers - the default, and the right choice for published
            methodology/statistics literature), "biorxiv", "medrxiv", "arxiv"
            (preprints), or a comma-separated combination such as
            "pmc,biorxiv,medrxiv". Do not use "fda" or "trials" sources here -
            those are regulatory/clinical-trial corpora, not relevant to
            methodology citations.
    """
    return _run_paperclip(["search", query, "-s", source, "-n", "5"])


@beta_tool
def paperclip_read_excerpt(paper_id: str, start_line: int, num_lines: int = 40) -> str:
    """Read a line-numbered excerpt of a paper's real full text from the
    Paperclip corpus, to pull a real, quotable, line-pinned passage.

    Every returned line is prefixed "L<n>: ..." with its real line number in
    the source document - quote directly from these lines and cite the L<n>
    numbers; never invent or renumber a line number.

    Args:
        paper_id: The corpus document ID, e.g. "PMC10900887" - get this from
            paperclip_lookup_doi's result, NOT the DOI string itself.
        start_line: The 1-indexed line number to start reading from. Use 1 to
            read from the beginning (title/abstract).
        num_lines: How many lines to read starting at start_line (default 40,
            max 200). If the passage you need isn't in this window, call
            again with a larger start_line to page further into the paper.
    """
    if not _PAPER_ID_RE.match(paper_id):
        return "ERROR: invalid paper_id - expected a corpus document ID like 'PMC10900887'."
    if start_line < 1:
        return "ERROR: start_line must be >= 1."
    if not (1 <= num_lines <= _MAX_EXCERPT_LINES):
        return f"ERROR: num_lines must be between 1 and {_MAX_EXCERPT_LINES}."

    end_line = start_line + num_lines - 1
    path = f"/papers/{paper_id}/content.lines"
    raw = _run_paperclip(["head", f"-{end_line}", path])
    if raw.startswith("ERROR:"):
        return raw

    lines = raw.splitlines()
    if lines and _TRAILER_RE.match(lines[-1]):
        lines = lines[:-1]  # synthetic "[and N more]" summary, not file content

    excerpt = lines[start_line - 1 :]
    if not excerpt:
        return (
            f"ERROR: {paper_id} does not have {start_line} lines "
            "(or this paper_id/content.lines path does not exist)."
        )
    return "\n".join(excerpt)
