import { useState } from "react";
import type { ScopeRule, Engagement } from "@/lib/types";

interface PolicyDecision {
  target: string;
  allowed: boolean;
  reason: string;
  matchedRule?: ScopeRule;
  engagement?: Engagement;
}

export function AuthorizationBoundary({
  engagement,
  rules,
  decision,
  onEvaluate,
}: {
  engagement?: Engagement | null;
  rules: ScopeRule[];
  decision?: PolicyDecision | null;
  onEvaluate?: (target: string) => PolicyDecision;
}) {
  const [input, setInput] = useState(decision?.target ?? "");
  const [localDecision, setLocalDecision] = useState<PolicyDecision | null>(decision ?? null);

  const activeDecision = decision ?? localDecision;

  const handleEvaluate = () => {
    if (!input.trim()) return;
    if (onEvaluate) {
      const d = onEvaluate(input.trim());
      setLocalDecision(d);
      return;
    }
    // Local fallback: match against rules
    const target = input.trim();
    const excludes = rules.filter((r) => r.rule_type === "exclude");
    const includes = rules.filter((r) => r.rule_type === "include");
    const matchedExclude = excludes.find((r) => target.includes(r.pattern.replace("*.", "")) || target === r.pattern);
    if (matchedExclude) {
      setLocalDecision({
        target,
        allowed: false,
        reason: `Explicit exclusion matched: "${matchedExclude.pattern}"`,
        matchedRule: matchedExclude,
        engagement: engagement ?? undefined,
      });
      return;
    }
    const matchedInclude = includes.find((r) => target.includes(r.pattern.replace("*.", "")) || target === r.pattern || r.pattern === target);
    if (matchedInclude) {
      setLocalDecision({
        target,
        allowed: true,
        reason: `Matched allow rule "${matchedInclude.pattern}"`,
        matchedRule: matchedInclude,
        engagement: engagement ?? undefined,
      });
      return;
    }
    setLocalDecision({
      target,
      allowed: false,
      reason: "No matching allow rule — default deny",
      engagement: engagement ?? undefined,
    });
  };

  const allowed = rules.filter((r) => r.rule_type === "include");
  const denied = rules.filter((r) => r.rule_type === "exclude");

  return (
    <div className="space-y-4">
      {/* Policy evaluator */}
      <div className="rounded-[6px] p-4" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
        <p className="text-[11px] tracking-[0.1em] font-semibold" style={{ color: "var(--text-faint)" }}>
          POLICY EVALUATOR — TRY A TARGET
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEvaluate()}
            placeholder="demo-target or production.example.com"
            className="flex-1 mono text-sm rounded-[6px] px-3 py-2 focus:outline-none"
            style={{ background: "var(--bg-inset)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <button
            onClick={handleEvaluate}
            className="px-4 py-2 text-xs font-medium rounded-[6px] whitespace-nowrap"
            style={{ background: "var(--text-primary)", color: "var(--bg-0)" }}
          >
            Evaluate
          </button>
        </div>
        <p className="mono text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
          Checks engagement scope table · default-deny · independent worker revalidation
        </p>
      </div>

      {/* Decision card */}
      {activeDecision && (
        <div
          className="rounded-[6px] overflow-hidden"
          style={{
            border: `1px solid ${activeDecision.allowed ? "var(--pass-border)" : "var(--deny-border)"}`,
            background: activeDecision.allowed ? "var(--pass-bg)" : "var(--deny-bg)",
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="h-7 w-7 rounded-[6px] flex items-center justify-center text-sm font-bold"
                style={{
                  background: activeDecision.allowed ? "var(--pass)" : "var(--deny)",
                  color: "white",
                }}
              >
                {activeDecision.allowed ? "✓" : "✕"}
              </span>
              <div>
                <p className="text-xs font-bold tracking-[0.08em]" style={{ color: activeDecision.allowed ? "var(--pass)" : "var(--deny)" }}>
                  POLICY DECISION — {activeDecision.allowed ? "ALLOW" : "DENY"}
                </p>
                <p className="mono text-xs mt-0.5" style={{ color: "var(--text-primary)" }}>
                  Target: “{activeDecision.target}”
                </p>
              </div>
            </div>
            <span className="mono text-[11px] px-2 py-1 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              {activeDecision.allowed ? "EXECUTION PERMITTED" : "EXECUTION PREVENTED"}
            </span>
          </div>

          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-[6px] p-3 space-y-1.5" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
              <p className="mono text-[11px] tracking-wide" style={{ color: "var(--text-faint)" }}>EVALUATION</p>
              <p style={{ color: "var(--text-secondary)" }}>{activeDecision.reason}</p>
              {activeDecision.matchedRule && (
                <p className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Matched rule: <span style={{ color: "var(--text-primary)" }}>{activeDecision.matchedRule.pattern}</span> · {activeDecision.matchedRule.rule_type} · {activeDecision.matchedRule.target_type}
                </p>
              )}
              {activeDecision.engagement && (
                <p className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Authorization basis: <span style={{ color: "var(--text-secondary)" }}>{activeDecision.engagement.authorization_basis || activeDecision.engagement.program_name}</span>
                </p>
              )}
            </div>
            <div className="rounded-[6px] p-3 space-y-1.5" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}>
              <p className="mono text-[11px] tracking-wide" style={{ color: "var(--text-faint)" }}>ENFORCEMENT LAYERS</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-muted)" }}>API scope validation</span>
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: activeDecision.allowed ? "var(--pass-bg)" : "var(--deny-bg)", border: `1px solid ${activeDecision.allowed ? "var(--pass-border)" : "var(--deny-border)"}`, color: activeDecision.allowed ? "var(--pass)" : "var(--deny)" }}>
                    {activeDecision.allowed ? "PASS" : "BLOCKED"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-muted)" }}>Worker revalidation</span>
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: activeDecision.allowed ? "var(--pass-bg)" : "var(--deny-bg)", border: `1px solid ${activeDecision.allowed ? "var(--pass-border)" : "var(--deny-border)"}`, color: activeDecision.allowed ? "var(--pass)" : "var(--deny)" }}>
                    {activeDecision.allowed ? "PASS" : "BLOCKED"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-muted)" }}>Execution</span>
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: activeDecision.allowed ? "var(--pass-bg)" : "var(--deny-bg)", border: `1px solid ${activeDecision.allowed ? "var(--pass-border)" : "var(--deny-border)"}`, color: activeDecision.allowed ? "var(--pass)" : "var(--deny)" }}>
                    {activeDecision.allowed ? "PERMITTED" : "PREVENTED"}
                  </span>
                </div>
              </div>
              <p className="mono text-[10px] leading-tight" style={{ color: "var(--text-faint)" }}>
                Dual validation · independent checks · reason recorded · audit event emitted
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scope rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--pass)" }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>AUTHORIZED — {allowed.length}</span>
            <span className="mono text-[11px] ml-auto" style={{ color: "var(--text-faint)" }}>{engagement?.program_name ?? "engagement scope"}</span>
          </div>
          {allowed.length === 0 ? (
            <p className="mono text-xs p-4" style={{ color: "var(--text-faint)" }}>No allow rules</p>
          ) : (
            <div>
              {allowed.map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <span className="mono text-xs font-medium" style={{ color: "var(--text-primary)" }}>{r.pattern}</span>
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{r.target_type}</span>
                  {r.is_wildcard && <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>wildcard</span>}
                  <span className="ml-auto mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--pass-bg)", border: "1px solid var(--pass-border)", color: "var(--pass)" }}>ALLOW</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[6px] overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--deny)" }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>EXCLUDED / DENIED — {denied.length}</span>
            <span className="mono text-[11px] ml-auto" style={{ color: "var(--text-faint)" }}>explicit exclusions</span>
          </div>
          {denied.length === 0 ? (
            <p className="mono text-xs p-4" style={{ color: "var(--text-faint)" }}>No exclusions</p>
          ) : (
            <div>
              {denied.map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <span className="mono text-xs font-medium" style={{ color: "var(--text-primary)" }}>{r.pattern}</span>
                  <span className="mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{r.target_type}</span>
                  <span className="ml-auto mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>DENY</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {engagement && (
        <p className="mono text-[11px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Engagement: <span style={{ color: "var(--text-secondary)" }}>{engagement.program_name}</span> · Authorization: <span style={{ color: "var(--text-secondary)" }}>{engagement.authorization_basis || "—"}</span> · Status: <span style={{ color: engagement.status === "active" ? "var(--pass)" : "var(--text-muted)" }}>{engagement.status}</span>
        </p>
      )}
    </div>
  );
}
