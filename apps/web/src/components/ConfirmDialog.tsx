import { useEffect, useRef, type ReactNode } from "react";

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
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => { e.preventDefault(); onCancel(); };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/60 bg-transparent p-0 m-auto rounded-[8px]"
      onClick={(e) => { if (e.target === dialogRef.current) onCancel(); }}
    >
      <div className="w-[90vw] max-w-md rounded-[8px] p-5 shadow-2xl" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {description && <div className="mono text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{description}</div>}
        {children && <div className="mt-4">{children}</div>}
        {error && <div className="mt-3 mono text-xs px-3 py-2 rounded-[6px]" style={{ background: "var(--deny-bg)", border: "1px solid var(--deny-border)", color: "var(--deny)" }}>{error}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} disabled={loading} className="mono text-xs px-3.5 py-1.5 rounded-[6px] disabled:opacity-50" style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)", background: "var(--bg-inset)" }}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={loading} className="mono text-xs px-3.5 py-1.5 rounded-[6px] font-medium disabled:opacity-50" style={{ background: variant === "danger" ? "var(--deny)" : "var(--text-primary)", color: "white" }}>{loading ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
