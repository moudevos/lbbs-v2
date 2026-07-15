"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { AsyncButton } from "@/components/ui/AsyncButton";
import { Input } from "@/components/ui/input";

export function PasswordRecoveryForm() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    try {
      await fetch("/api/auth/password/recovery-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[auth/recovery] No se pudo solicitar recuperación", { message });
    } finally { setIsSending(false); setSent(true); }
  }
  return <div className="space-y-5">{sent ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Si el correo está registrado, recibirá un enlace para restablecer tu contraseña.</div> : <form onSubmit={handleSubmit} className="space-y-4"><label className="block space-y-2 text-sm font-medium text-slate-700">Correo<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@ejemplo.com" required autoFocus /></label><AsyncButton type="submit" className="w-full" isLoading={isSending} loadingText="Enviando...">Enviar enlace</AsyncButton></form>}<Link href="/login" className="block text-center text-sm font-medium text-sky-700 hover:underline">Volver al login</Link></div>;
}
