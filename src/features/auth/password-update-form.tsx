"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { AsyncButton } from "@/components/ui/AsyncButton";
import { PasswordField } from "@/components/ui/PasswordField";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { createClient } from "@/lib/supabase/client";

type Mode = "change" | "recovery" | "forced";

export function PasswordUpdateForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const policy = useMemo(
    () => validatePasswordPolicy(newPassword),
    [newPassword],
  );
  const requiresCurrentPassword = mode !== "recovery";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== newPassword.trim()) {
      await Swal.fire({
        icon: "warning",
        title: "Revisa la contraseña",
        text: "No uses espacios al inicio o final.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (!policy.valid) {
      await Swal.fire({
        icon: "warning",
        title: "Contraseña no válida",
        text: "Completa todos los requisitos de seguridad.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (newPassword !== confirmation) {
      await Swal.fire({
        icon: "warning",
        title: "Las contraseñas no coinciden",
        text: "Revisa la confirmación de la nueva contraseña.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    if (requiresCurrentPassword && newPassword === currentPassword) {
      await Swal.fire({
        icon: "warning",
        title: "Elige una contraseña diferente",
        text: "La nueva contraseña debe ser distinta a la actual.",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/auth/password/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo finalizar la actualización.");
      }

      if (mode === "forced") {
        await Swal.fire({
          icon: "success",
          title: "Contraseña actualizada",
          text: "Tu acceso ya está habilitado.",
          confirmButtonColor: "#0f766e",
        });
        router.replace("/control");
        router.refresh();
        return;
      }

      const supabase = createClient();
      await supabase.auth.signOut({ scope: "global" });
      await Swal.fire({
        icon: "success",
        title: "Contraseña actualizada",
        text: "Inicia sesión nuevamente.",
        confirmButtonColor: "#0f766e",
      });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña.";

      console.error("[auth/password] Error al actualizar contraseña", {
        message,
        mode,
      });
      await Swal.fire({
        icon: "error",
        title: "No se pudo actualizar la contraseña",
        text: message,
        confirmButtonColor: "#0f766e",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        {mode === "recovery"
          ? "Crea una nueva contraseña para recuperar tu acceso."
          : mode === "forced"
            ? "Debes cambiar la contraseña temporal antes de continuar."
            : "Confirma tu contraseña actual antes de crear una nueva."}
      </p>

      {requiresCurrentPassword ? (
        <PasswordField
          label={
            mode === "forced"
              ? "Contraseña temporal actual"
              : "Contraseña actual"
          }
          name="current-password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          autoFocus
        />
      ) : null}

      <PasswordField
        label="Nueva contraseña"
        name="new-password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
        autoFocus={!requiresCurrentPassword}
      />
      <PasswordRequirements password={newPassword} />
      <PasswordField
        label="Confirmar nueva contraseña"
        name="confirm-password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
      />
      <AsyncButton
        type="submit"
        className="w-full"
        isLoading={isSaving}
        loadingText="Actualizando..."
      >
        {mode === "recovery" ? "Restablecer contraseña" : "Actualizar contraseña"}
      </AsyncButton>
    </form>
  );
}
