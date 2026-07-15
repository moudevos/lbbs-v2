"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Swal from "sweetalert2";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useEscapeKey } from "@/lib/hooks/use-escape-key";

type ModalSize = "sm" | "md" | "lg" | "xl";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  isDirty?: boolean;
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  confirmBeforeClose?: boolean;
  size?: ModalSize;
};

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  isDirty = false,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  confirmBeforeClose = true,
  size = "lg",
}: ModalProps) {
  async function requestClose() {
    if (confirmBeforeClose && isDirty) {
      const result = await Swal.fire({
        icon: "warning",
        title: "Hay cambios sin guardar",
        text: "¿Deseas cerrar sin guardar?",
        showCancelButton: true,
        confirmButtonText: "Cerrar sin guardar",
        cancelButtonText: "Seguir editando",
        confirmButtonColor: "#dc2626",
        background: "#ffffff",
        color: "#0f172a",
      });

      if (!result.isConfirmed) {
        return;
      }
    }

    onClose();
  }

  useEscapeKey(() => {
    if (open && closeOnEscape) {
      void requestClose();
    }
  }, open && closeOnEscape);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4">
      <div
        className="absolute inset-0"
        role="presentation"
        aria-hidden="true"
        onClick={() => {
          if (closeOnOutsideClick) {
            void requestClose();
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "relative z-10 w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl",
          sizeClasses[size],
        ].join(" ")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-slate-900">{title}</p>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
            onClick={() => {
              void requestClose();
            }}
            aria-label="Cerrar modal"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="border-t border-slate-200 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
