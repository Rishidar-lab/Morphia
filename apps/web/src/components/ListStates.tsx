import type { ReactNode } from "react";

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-[6px] animate-pulse" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 rounded-[6px]" style={{ background: "var(--bg-panel)", border: "1px dashed var(--border-default)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{title}</p>
      {description && <p className="mono text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: "var(--text-faint)" }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[6px] p-5 text-center" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)" }}>
      <p className="text-sm" style={{ color: "var(--deny)" }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 mono text-xs px-3 py-1.5 rounded-[6px]"
          style={{ border: "1px solid var(--deny-border)", color: "var(--deny)" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
