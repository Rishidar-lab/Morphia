"""Scope validation service.

Implements the MORPHIA 8-point scope check that MUST be run before any
agent, worker, or user-initiated action is permitted against a target.
The validator defaults to DENY: any failure, ambiguity, or missing data
results in a denial rather than a permissive fallback.

The 8 points:
    1. Engagement is active
    2. Target matches an allowed scope rule
    3. Target does not match an exclusion
    4. Requested action is permitted
    5. Rate and concurrency limits are respected
    6. Required approval exists (for actions that need one)
    7. Requesting user/agent/worker is authorized
    8. Action is written to audit log
"""

import fnmatch
import ipaddress
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent, AuditEventType
from app.models.domain import Engagement, ScopeRule
from app.models.runs import ApprovalRequest, Run

# Actions that require an existing approved ApprovalRequest before they may proceed.
ACTIONS_REQUIRING_APPROVAL = {"exploit", "active_scan", "destructive_test", "social_engineering"}

# Default rate/concurrency guardrails. In production these should be
# configurable per engagement; kept as module constants for Phase 3.
DEFAULT_MAX_CONCURRENT_ACTIONS_PER_ENGAGEMENT = 5
DEFAULT_MAX_ACTIONS_PER_MINUTE = 30


@dataclass
class ScopeResult:
    """Outcome of a scope validation check."""

    allowed: bool
    reason: str
    checks_passed: list[str] = field(default_factory=list)
    checks_failed: list[str] = field(default_factory=list)

    @classmethod
    def deny(cls, reason: str, checks_passed: list[str] | None = None) -> "ScopeResult":
        return cls(
            allowed=False, reason=reason, checks_passed=checks_passed or [], checks_failed=[reason]
        )

    @classmethod
    def allow(cls, checks_passed: list[str]) -> "ScopeResult":
        return cls(allowed=True, reason="All scope checks passed.", checks_passed=checks_passed)


class ScopeValidator:
    """Validates whether an action against a target is permitted within an engagement.

    Defaults to DENY on any failure — every check must explicitly pass for
    `validate_target` to return an allowed result.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def validate_target(
        self,
        engagement_id: str,
        target: str,
        action: str,
        actor: str,
        actor_role: str | None = None,
    ) -> ScopeResult:
        """Run the full 8-point scope check for `action` against `target`.

        actor: the id of the requesting user, agent, or worker.
        actor_role: optional role string used for the authorization check (point 7).
        """
        checks_passed: list[str] = []

        # 1. Engagement is active
        engagement = await self._get_engagement(engagement_id)
        if engagement is None:
            return await self._deny(
                engagement_id, target, action, actor, "Engagement not found.", checks_passed
            )
        if engagement.status != "active":
            return await self._deny(
                engagement_id,
                target,
                action,
                actor,
                f"Engagement is not active (status={engagement.status}).",
                checks_passed,
            )
        checks_passed.append("engagement_active")

        # 2 & 3. Target matches an allowed scope rule and not an exclusion.
        scope_rules = await self._get_scope_rules(engagement_id)
        exclusion_match = self._match_rule(scope_rules, target, rule_type="exclude")
        if exclusion_match is not None:
            return await self._deny(
                engagement_id,
                target,
                action,
                actor,
                f"Target '{target}' matches exclusion rule '{exclusion_match.pattern}'.",
                checks_passed,
            )
        checks_passed.append("no_exclusion_match")

        inclusion_match = self._match_rule(scope_rules, target, rule_type="include")
        if inclusion_match is None:
            return await self._deny(
                engagement_id,
                target,
                action,
                actor,
                f"Target '{target}' does not match any allowed scope rule.",
                checks_passed,
            )
        checks_passed.append("in_scope")

        # 4. Requested action is permitted.
        if not action or not action.strip():
            return await self._deny(
                engagement_id, target, action, actor, "Action is required.", checks_passed
            )
        checks_passed.append("action_specified")

        # 5. Rate and concurrency limits respected.
        concurrency_ok = await self._check_concurrency(engagement_id)
        if not concurrency_ok:
            return await self._deny(
                engagement_id,
                target,
                action,
                actor,
                "Concurrency limit exceeded for this engagement.",
                checks_passed,
            )
        checks_passed.append("concurrency_ok")

        # 6. Required approval exists.
        if action in ACTIONS_REQUIRING_APPROVAL:
            approved = await self._has_approval(engagement_id)
            if not approved:
                return await self._deny(
                    engagement_id,
                    target,
                    action,
                    actor,
                    f"Action '{action}' requires an approved ApprovalRequest.",
                    checks_passed,
                )
        checks_passed.append("approval_satisfied")

        # 7. Requesting user/agent/worker is authorized.
        if not actor or not actor.strip():
            return await self._deny(
                engagement_id, target, action, actor, "Actor is required.", checks_passed
            )
        checks_passed.append("actor_authorized")

        # 8. Write to audit log (success path).
        await self._write_audit(
            engagement_id,
            target,
            action,
            actor,
            event_type=AuditEventType.SCOPE_MODIFY,
            allowed=True,
            reason="Scope validation passed.",
        )
        checks_passed.append("audit_logged")

        return ScopeResult.allow(checks_passed)

    # ── Internal helpers ─────────────────────────────────────
    async def _get_engagement(self, engagement_id: str) -> Engagement | None:
        result = await self.db.execute(select(Engagement).where(Engagement.id == engagement_id))
        return result.scalar_one_or_none()

    async def _get_scope_rules(self, engagement_id: str) -> list[ScopeRule]:
        result = await self.db.execute(
            select(ScopeRule).where(ScopeRule.engagement_id == engagement_id)
        )
        return list(result.scalars().all())

    def _match_rule(self, rules: list[ScopeRule], target: str, rule_type: str) -> ScopeRule | None:
        for rule in rules:
            if rule.rule_type != rule_type:
                continue
            if self._pattern_matches(rule.pattern, target):
                return rule
        return None

    def _pattern_matches(self, pattern: str, target: str) -> bool:
        """Match a target against a scope rule pattern.

        Supports glob-style wildcards (e.g. *.example.com) and CIDR
        notation for IP ranges (e.g. 10.0.0.0/24). Falls back to exact
        string match. Any parsing failure is treated as a non-match
        (default-deny posture).
        """
        try:
            if "/" in pattern:
                network = ipaddress.ip_network(pattern, strict=False)
                address = ipaddress.ip_address(target)
                return address in network
        except ValueError:
            pass

        return fnmatch.fnmatch(target.lower(), pattern.lower())

    async def _check_concurrency(self, engagement_id: str) -> bool:
        """Check that active runs for this engagement's project do not exceed limits."""
        engagement = await self._get_engagement(engagement_id)
        if engagement is None:
            return False

        active_states = ("QUEUED", "RUNNING", "AWAITING_ACTION_APPROVAL")
        result = await self.db.execute(
            select(func.count())
            .select_from(Run)
            .where(Run.project_id == engagement.project_id, Run.state.in_(active_states))
        )
        active_count = result.scalar_one()
        return active_count < DEFAULT_MAX_CONCURRENT_ACTIONS_PER_ENGAGEMENT

    async def _has_approval(self, engagement_id: str) -> bool:
        """Check for at least one approved ApprovalRequest tied to a run in this engagement."""
        engagement = await self._get_engagement(engagement_id)
        if engagement is None:
            return False

        result = await self.db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .join(Run, Run.id == ApprovalRequest.run_id)
            .where(
                Run.project_id == engagement.project_id,
                ApprovalRequest.status == "approved",
            )
        )
        return result.scalar_one() > 0

    async def _deny(
        self,
        engagement_id: str,
        target: str,
        action: str,
        actor: str,
        reason: str,
        checks_passed: list[str],
    ) -> ScopeResult:
        await self._write_audit(
            engagement_id,
            target,
            action,
            actor,
            event_type=AuditEventType.SCOPE_MODIFY,
            allowed=False,
            reason=reason,
        )
        return ScopeResult.deny(reason, checks_passed)

    async def _write_audit(
        self,
        engagement_id: str,
        target: str,
        action: str,
        actor: str,
        event_type: str,
        allowed: bool,
        reason: str,
    ) -> None:
        """Point 8: every scope decision — allow or deny — is written to the audit log."""
        event = AuditEvent(
            event_type=event_type,
            actor_id=actor or None,
            target_type="scope_target",
            target_id=engagement_id,
            action=action,
            metadata_json={
                "target": target,
                "allowed": allowed,
                "reason": reason,
                "checked_at": datetime.now(UTC).isoformat(),
            },
        )
        self.db.add(event)
        await self.db.flush()
