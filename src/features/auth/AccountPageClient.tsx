"use client";

import { useEffect, useState } from "react";
import { faKey, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Swal from "sweetalert2";

import { AsyncButton } from "@/components/ui/AsyncButton";
import { PasswordUpdateForm } from "@/features/auth/password-update-form";
import { createClient } from "@/lib/supabase/client";

type Account = {
  email: string | null;
  fullName: string | null;
  roleLabel: string;
  branchName: string | null;
  passwordChangedAt: string | null;
};

export function AccountPageClient() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState(false);
  const [isClosingOthers, setIsClosingOthers] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/auth/me", { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json();

          if (!response.ok) {
            throw new Error("No se pudo cargar la información de la cuenta.");
          }

          setAccount(payload.data);
        })
        .catch(() => setError(true));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function closeOtherSessions() {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Cerrar otras sesiones",
      text: "Los demás dispositivos deberán iniciar sesión nuevamente.",
      showCancelButton: true,
      confirmButtonText: "Cerrar otras sesiones",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0f766e",
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    setIsClosingOthers(true);

    try {
      const { error: signOutError } = await createClient().auth.signOut({
        scope: "others",
      });

      if (signOutError) {
        throw new Error("No se pudieron cerrar las otras sesiones.");
      }

      const response = await fetch("/api/auth/password/close-other-sessions", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error || "No se pudo registrar la acción de seguridad.",
        );
      }

      await Swal.fire({
        icon: "success",
        title: "Sesiones cerradas",
        text: "Las otras sesiones activas fueron cerradas.",
        confirmButtonColor: "#0f766e",
      });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "No se pudieron cerrar las otras sesiones.";

      console.error("[auth/account] Error al cerrar otras sesiones", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo completar la acción",
        text: message,
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setIsClosingOthers(false);
    }
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        No se pudo cargar la información de tu cuenta. Intenta nuevamente.
      </section>
    );
  }

  if (!account) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Cargando cuenta...
      </section>
    );
  }

  const passwordDate = account.passwordChangedAt
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(account.passwordChangedAt))
    : "Sin registro";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <FontAwesomeIcon icon={faUserShield} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Mi cuenta</p>
            <p className="text-sm text-slate-600">
              Información y seguridad de tu acceso.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Nombre</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {account.fullName ?? "Sin registro"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Correo</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {account.email ?? "Sin registro"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Rol</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {account.roleLabel}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Sede</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {account.branchName ?? "Sin sede asignada"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Último cambio de contraseña</dt>
            <dd className="mt-1 font-medium text-slate-900">{passwordDate}</dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <AsyncButton
            type="button"
            className="bg-slate-100 text-slate-700 hover:bg-slate-200"
            isLoading={isClosingOthers}
            loadingText="Cerrando sesiones..."
            onClick={() => void closeOtherSessions()}
          >
            Cerrar sesión en otros dispositivos
          </AsyncButton>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <FontAwesomeIcon icon={faKey} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Cambiar contraseña
            </p>
            <p className="text-sm text-slate-600">
              Confirma tu contraseña actual para continuar.
            </p>
          </div>
        </div>
        <PasswordUpdateForm mode="change" />
      </section>
    </div>
  );
}
