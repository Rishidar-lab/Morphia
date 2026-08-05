import { useEffect, useRef, type ReactNode } from "react";
import { clsx } from "clsx";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/**
 * Reusable confirmation dialog built on the native <dialog> element for
 * built-in accessibility (focus trapping, Escape-to-close, top-layer
 * rendering). Use for any destructive or state-changing action: run
 * cancellation, approval/rejection, scope rule deletion, etc.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  error = null,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };

    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/60 bg-transparent p-0 m-auto rounded-lg"
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
    >
      <div className="w-[90vw] max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-2xl p-5">
        <h2 className="text-base font-semibold text-gray-100 mb-2">{title}</h2>
        {description && (
          <div className="text-sm text-gray-400 mb-4">{description}</div>
        )}

        {children}

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-3.5 py-1.5 text-sm rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              "px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed",
              variant === "danger"
                ? "bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white"
                : "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white",
            )}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
