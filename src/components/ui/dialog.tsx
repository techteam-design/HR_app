"use client";

import { useEffect, useRef } from "react";

import { CloseIcon } from "./icons";

// Modal dialog built on the native <dialog> element (focus trapping, Escape
// to close and the backdrop come from the browser).
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-border bg-surface p-0 text-plum-900 shadow-float backdrop:bg-plum-900/40"
    >
      {open && (
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id="dialog-title" className="font-display text-section-title font-medium">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-lilac-50 focus-visible:outline-2 focus-visible:outline-plum-700"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
