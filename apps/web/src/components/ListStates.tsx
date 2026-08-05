import type { ReactNode } from "react";

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 bg-gray-900/50 border border-gray-800 rounded-lg animate-pulse"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-gray-800 rounded-lg">
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {description && (
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-5 text-center">
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
