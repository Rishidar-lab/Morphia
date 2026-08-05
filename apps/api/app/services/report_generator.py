"""Report rendering — turns a Report + linked Findings/Evidence into a document.

Templates loosely follow the field structure used by HackerOne/Bugcrowd
disclosure reports (Summary, Affected asset, Scope confirmation,
Prerequisites, Reproduction steps, Expected/Actual result, Impact,
Severity rationale, Remediation, Limitations).

Nothing is fabricated: any field that is empty/None is rendered as the
literal marker "[INFORMATION REQUIRED]" so gaps are obvious to a human
reviewer rather than silently omitted or guessed at.
"""

from __future__ import annotations

import html as html_lib
import json
from typing import Any

MISSING = "[INFORMATION REQUIRED]"


def _text(value: str | None) -> str:
    """Return `value` if it has real content, otherwise the missing-field marker."""
    if value is None:
        return MISSING
    stripped = value.strip()
    return stripped if stripped else MISSING


def _severity_label(finding: Any) -> str:
    severity = getattr(finding, "severity", None)
    if severity:
        return str(severity).upper()
    suggested = getattr(finding, "suggested_severity", None)
    if suggested:
        return f"{str(suggested).upper()} (unconfirmed — model-suggested)"
    return MISSING


class ReportGenerator:
    """Renders a Report ORM object (plus its linked findings/evidence) to markdown/html/json."""

    def generate_markdown(self, report: Any, findings: list[Any], evidence: list[Any]) -> str:
        lines: list[str] = []
        lines.append(f"# {_text(getattr(report, 'title', None))}")
        lines.append("")
        lines.append(f"**Status:** {_text(getattr(report, 'status', None))}")
        lines.append("")

        lines.append("## Summary")
        lines.append(_text(getattr(report, "summary", None)))
        lines.append("")

        lines.append("## Affected Asset")
        lines.append(_text(getattr(report, "affected_asset", None)))
        lines.append("")

        lines.append("## Scope Confirmation")
        lines.append(_text(getattr(report, "scope_confirmation", None)))
        lines.append("")

        lines.append("## Prerequisites")
        lines.append(_text(getattr(report, "prerequisites", None)))
        lines.append("")

        lines.append("## Reproduction Steps")
        lines.append(_text(getattr(report, "reproduction_steps", None)))
        lines.append("")

        lines.append("## Expected Result")
        lines.append(_text(getattr(report, "expected_result", None)))
        lines.append("")

        lines.append("## Actual Result")
        lines.append(_text(getattr(report, "actual_result", None)))
        lines.append("")

        lines.append("## Impact")
        lines.append(_text(getattr(report, "impact", None)))
        lines.append("")

        lines.append("## Severity Rationale")
        lines.append(_text(getattr(report, "severity_rationale", None)))
        cwe_id = getattr(report, "cwe_id", None)
        cvss_vector = getattr(report, "cvss_vector", None)
        lines.append(f"- **CWE:** {_text(cwe_id)}")
        lines.append(f"- **CVSS Vector:** {_text(cvss_vector)}")
        lines.append("")

        lines.append("## Remediation")
        lines.append(_text(getattr(report, "remediation", None)))
        lines.append("")

        lines.append("## Limitations")
        lines.append(_text(getattr(report, "limitations", None)))
        lines.append("")

        timeline = getattr(report, "disclosure_timeline", None)
        lines.append("## Disclosure Timeline")
        if timeline:
            for entry in timeline:
                if isinstance(entry, dict):
                    date_str = entry.get("date", MISSING)
                    event_str = entry.get("event", MISSING)
                    lines.append(f"- **{date_str}:** {event_str}")
                else:
                    lines.append(f"- {entry}")
        else:
            lines.append(MISSING)
        lines.append("")

        lines.append("## Linked Findings")
        if findings:
            for finding in findings:
                lines.append(f"### {_text(getattr(finding, 'title', None))}")
                lines.append(f"- **Severity:** {_severity_label(finding)}")
                lines.append(f"- **State:** {_text(getattr(finding, 'state', None))}")
                lines.append(f"- **Observation:** {_text(getattr(finding, 'observation', None))}")
                lines.append(f"- **Hypothesis:** {_text(getattr(finding, 'hypothesis', None))}")
                lines.append(
                    f"- **Verification Method:** {_text(getattr(finding, 'verification_method', None))}"
                )
                lines.append(f"- **Expected Result:** {_text(getattr(finding, 'expected_result', None))}")
                lines.append(f"- **Actual Result:** {_text(getattr(finding, 'actual_result', None))}")
                lines.append(f"- **Security Impact:** {_text(getattr(finding, 'security_impact', None))}")
                lines.append(f"- **Uncertainty:** {_text(getattr(finding, 'uncertainty', None))}")
                lines.append(f"- **Remediation:** {_text(getattr(finding, 'remediation', None))}")
                lines.append("")
        else:
            lines.append(MISSING)
            lines.append("")

        lines.append("## Supporting Evidence")
        if evidence:
            for item in evidence:
                lines.append(
                    f"- `{_text(getattr(item, 'original_filename', None))}` "
                    f"(sha256: `{_text(getattr(item, 'sha256_digest', None))}`, "
                    f"status: {_text(getattr(item, 'verification_status', None))})"
                )
        else:
            lines.append(MISSING)
        lines.append("")

        return "\n".join(lines)

    def generate_html(self, report: Any, findings: list[Any], evidence: list[Any]) -> str:
        """Render a print-ready standalone HTML document."""

        def esc(value: str) -> str:
            return html_lib.escape(value)

        title = esc(_text(getattr(report, "title", None)))
        status = esc(_text(getattr(report, "status", None)))

        def section(heading: str, body: str) -> str:
            return f'<section><h2>{esc(heading)}</h2><p>{esc(body)}</p></section>'

        sections_html = "".join(
            [
                section("Summary", _text(getattr(report, "summary", None))),
                section("Affected Asset", _text(getattr(report, "affected_asset", None))),
                section("Scope Confirmation", _text(getattr(report, "scope_confirmation", None))),
                section("Prerequisites", _text(getattr(report, "prerequisites", None))),
                section("Reproduction Steps", _text(getattr(report, "reproduction_steps", None))),
                section("Expected Result", _text(getattr(report, "expected_result", None))),
                section("Actual Result", _text(getattr(report, "actual_result", None))),
                section("Impact", _text(getattr(report, "impact", None))),
                section("Severity Rationale", _text(getattr(report, "severity_rationale", None))),
                section("Remediation", _text(getattr(report, "remediation", None))),
                section("Limitations", _text(getattr(report, "limitations", None))),
            ]
        )

        cwe_id = esc(_text(getattr(report, "cwe_id", None)))
        cvss_vector = esc(_text(getattr(report, "cvss_vector", None)))

        findings_html = ""
        if findings:
            rows = []
            for finding in findings:
                rows.append(
                    "<li>"
                    f"<strong>{esc(_text(getattr(finding, 'title', None)))}</strong> "
                    f"[{esc(_severity_label(finding))}] "
                    f"&mdash; {esc(_text(getattr(finding, 'observation', None)))}"
                    "</li>"
                )
            findings_html = f"<ul>{''.join(rows)}</ul>"
        else:
            findings_html = f"<p>{esc(MISSING)}</p>"

        evidence_html = ""
        if evidence:
            rows = []
            for item in evidence:
                rows.append(
                    "<li>"
                    f"<code>{esc(_text(getattr(item, 'original_filename', None)))}</code> "
                    f"(sha256: <code>{esc(_text(getattr(item, 'sha256_digest', None)))}</code>, "
                    f"status: {esc(_text(getattr(item, 'verification_status', None)))})"
                    "</li>"
                )
            evidence_html = f"<ul>{''.join(rows)}</ul>"
        else:
            evidence_html = f"<p>{esc(MISSING)}</p>"

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{ font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 2rem auto; color: #1a1a1a; line-height: 1.5; }}
  h1 {{ border-bottom: 2px solid #333; padding-bottom: 0.5rem; }}
  h2 {{ margin-top: 1.5rem; color: #333; }}
  .meta {{ color: #555; font-size: 0.9rem; }}
  code {{ background: #f4f4f4; padding: 0.1rem 0.3rem; }}
  @media print {{ body {{ margin: 0; }} }}
</style>
</head>
<body>
<h1>{title}</h1>
<p class="meta">Status: {status} &middot; CWE: {cwe_id} &middot; CVSS: {cvss_vector}</p>
{sections_html}
<section><h2>Linked Findings</h2>{findings_html}</section>
<section><h2>Supporting Evidence</h2>{evidence_html}</section>
</body>
</html>"""

    def generate_json(self, report: Any, findings: list[Any], evidence: list[Any]) -> dict:
        """Render a structured dict representation, suitable for json.dumps."""

        def field(value: str | None) -> str:
            return _text(value)

        return {
            "title": field(getattr(report, "title", None)),
            "status": field(getattr(report, "status", None)),
            "summary": field(getattr(report, "summary", None)),
            "affected_asset": field(getattr(report, "affected_asset", None)),
            "scope_confirmation": field(getattr(report, "scope_confirmation", None)),
            "prerequisites": field(getattr(report, "prerequisites", None)),
            "reproduction_steps": field(getattr(report, "reproduction_steps", None)),
            "expected_result": field(getattr(report, "expected_result", None)),
            "actual_result": field(getattr(report, "actual_result", None)),
            "impact": field(getattr(report, "impact", None)),
            "severity_rationale": field(getattr(report, "severity_rationale", None)),
            "cwe_id": field(getattr(report, "cwe_id", None)),
            "cvss_vector": field(getattr(report, "cvss_vector", None)),
            "remediation": field(getattr(report, "remediation", None)),
            "limitations": field(getattr(report, "limitations", None)),
            "disclosure_timeline": getattr(report, "disclosure_timeline", None) or [],
            "findings": [
                {
                    "id": getattr(finding, "id", None),
                    "title": field(getattr(finding, "title", None)),
                    "severity": _severity_label(finding),
                    "state": field(getattr(finding, "state", None)),
                    "observation": field(getattr(finding, "observation", None)),
                    "hypothesis": field(getattr(finding, "hypothesis", None)),
                    "verification_method": field(getattr(finding, "verification_method", None)),
                    "expected_result": field(getattr(finding, "expected_result", None)),
                    "actual_result": field(getattr(finding, "actual_result", None)),
                    "security_impact": field(getattr(finding, "security_impact", None)),
                    "uncertainty": field(getattr(finding, "uncertainty", None)),
                    "remediation": field(getattr(finding, "remediation", None)),
                }
                for finding in findings
            ],
            "evidence": [
                {
                    "id": getattr(item, "id", None),
                    "original_filename": field(getattr(item, "original_filename", None)),
                    "sha256_digest": field(getattr(item, "sha256_digest", None)),
                    "verification_status": field(getattr(item, "verification_status", None)),
                }
                for item in evidence
            ],
        }

    def as_json_string(self, report: Any, findings: list[Any], evidence: list[Any]) -> str:
        """Convenience helper: generate_json() serialized to a JSON string."""
        return json.dumps(self.generate_json(report, findings, evidence), indent=2, default=str)
