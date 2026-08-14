"use client";

import {
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { AsyncButton } from "@/components/ui/AsyncButton";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    let hasAuthenticationError = false;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        hasAuthenticationError = true;
        console.error("[auth/login] Error de autenticacion", {
          message: error.message,
          status: error.status,
        });
      }

      if (!error) {
        const profileResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const profilePayload = await profileResponse.json().catch(() => null);
        router.replace(profilePayload?.data?.mustChangePassword ? "/cambiar-contrasena-obligatoria" : "/control");
        router.refresh();
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      hasAuthenticationError = true;
      console.error("[auth/login] Error inesperado al iniciar sesion", {
        message,
      });
    } finally {
      setIsLoading(false);
    }

    if (hasAuthenticationError) {
      await Swal.fire({
        icon: "error",
        title: "No se pudo iniciar sesion",
        text: "Revisa tus datos e inténtalo nuevamente.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Firma visual: franja tipo poste de barbería */}
      <div
        aria-hidden
        className="h-1.5 w-full"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, #dc2626 0px, #dc2626 10px, #ffffff 10px, #ffffff 20px, #1d4ed8 20px, #1d4ed8 30px)",
        }}
      />

      <form method="post" onSubmit={handleSubmit} className="space-y-5 p-6">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
            </span>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@lbbs.pe"
              required
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
            </span>
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              required
              className="pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition hover:text-slate-600"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              tabIndex={-1}
            >
              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="peer sr-only"
              />
              <span className="h-4 w-4 rounded border border-slate-300 bg-white transition peer-checked:border-amber-500 peer-checked:bg-amber-500" />
              <svg
                aria-hidden
                viewBox="0 0 12 10"
                className="pointer-events-none absolute h-2.5 w-2.5 scale-0 text-white transition peer-checked:scale-100"
                style={{ transform: rememberMe ? "scale(1)" : "scale(0)" }}
              >
                <path
                  d="M1 5l3 3 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Recuérdame
          </label>


          <Link href="/recuperar-contrasena" className="text-sm font-medium text-sky-700 transition hover:text-sky-800 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <AsyncButton
          type="submit"
          className="w-full"
          isLoading={isLoading}
          loadingText="Ingresando..."
          icon={<FontAwesomeIcon icon={faLock} />}
        >
          Ingresar
        </AsyncButton>
      </form>
    </div>
  );
}
