"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type ToastKind = "ok" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };
type ConfirmOptions = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

export const useToast = () => useContext(ToastContext);
export const useConfirm = () => useContext(ConfirmContext);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, message, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const close = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
                t.kind === "error" ? "bg-danger text-white" : t.kind === "ok" ? "bg-accent text-white" : "bg-ink text-white"
              }`}
            >
              <Icon name={t.kind === "error" ? "alert" : t.kind === "ok" ? "check" : "eye"} className="mt-0.5 size-4 shrink-0" />
              <span>{t.message}</span>
            </div>
          ))}
        </div>

        {confirmState && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/60 p-4 sm:items-center" onClick={() => close(false)}>
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-title" className="text-lg font-bold text-ink">
                {confirmState.title}
              </h2>
              {confirmState.message && <p className="mt-2 text-sm text-ink-soft">{confirmState.message}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                  Cancel
                </button>
                <button type="button" autoFocus className={`btn ${confirmState.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)}>
                  {confirmState.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
