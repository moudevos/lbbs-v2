"use client";

import {
  faBuilding,
  faChevronDown,
  faIdBadge,
  faRightFromBracket,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { AsyncButton } from "@/components/ui/AsyncButton";
import { createClient } from "@/lib/supabase/client";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";

type UserInfo = {
  email: string | null;
  fullName: string | null;
  role: string | null;
  roleLabel: string;
  branchName: string | null;
  branchId: string | null;
  avatarUrl: string | null;
  sessionStatusLabel: string;
};

function getInitials(value: string | null) {
  if (!value) {
    return "U";
  }

  const parts = value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "U";
  }

  return parts.map((item) => item[0]?.toUpperCase() ?? "").join("");
}

export function UserMenu() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<UserInfo>({
    email: null,
    fullName: null,
    role: null,
    roleLabel: "Sin rol asignado",
    branchName: null,
    branchId: null,
    avatarUrl: null,
    sessionStatusLabel: "Sesion activa",
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          console.error("[auth/sesion] No se pudo cargar el perfil de sesion", {
            message: payload.error,
            status: response.status,
          });
          return;
        }

        if (mounted) {
          setUser(payload.data);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        console.error("[auth/sesion] Error inesperado al cargar la sesion", { message });
      }
    }

    void loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEscapeKey(() => setIsOpen(false), isOpen);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("[auth/logout] No se pudo cerrar sesion", {
          message: error.message,
          status: error.status,
        });
        await Swal.fire({
          icon: "error",
          title: "No se pudo cerrar sesion",
          text: "Intenta nuevamente en unos segundos.",
          confirmButtonColor: "#0f766e",
          background: "#ffffff",
          color: "#0f172a",
        });
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      console.error("[auth/logout] Error inesperado al cerrar sesion", { message });
      await Swal.fire({
        icon: "error",
        title: "No se pudo cerrar sesion",
        text: "Intenta nuevamente en unos segundos.",
        confirmButtonColor: "#0f766e",
        background: "#ffffff",
        color: "#0f172a",
      });
    } finally {
      setIsSigningOut(false);
    }
  }

  const displayName = user.fullName ?? user.email ?? "Usuario";
  const initials = getInitials(displayName);
  const branchLabel =
    user.branchName ??
    (user.role === "reception" ? "Sede no asignada" : "Sin sede asignada");
  const showBranchAlert = !user.branchName && user.role === "reception";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm transition hover:border-amber-300"
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
          {initials}
        </div>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium text-stone-900">{displayName}</p>
          <p className="truncate text-xs text-stone-500">{user.sessionStatusLabel}</p>
        </div>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={[
            "ml-1 h-3 w-3 text-stone-400 transition-transform",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-40 mt-2 w-72 max-w-[90vw] rounded-2xl border border-stone-200 bg-white p-2 shadow-lg">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">{displayName}</p>
              <p className="truncate text-xs text-stone-500">{user.email ?? "Sin correo"}</p>
            </div>
          </div>

          <div className="my-1 border-t border-stone-100" />

          <div className="space-y-1 px-1 py-1">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-600">
              <FontAwesomeIcon
                icon={showBranchAlert ? faTriangleExclamation : faBuilding}
                className={[
                  "h-3.5 w-3.5",
                  showBranchAlert ? "text-amber-500" : "text-stone-400",
                ].join(" ")}
              />
              <span className="text-stone-500">Sede:</span>
              <span className="truncate font-medium text-stone-800">{branchLabel}</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-600">
              <FontAwesomeIcon icon={faIdBadge} className="h-3.5 w-3.5 text-stone-400" />
              <span className="text-stone-500">Rol:</span>
              <span className="truncate font-medium text-stone-800">{user.roleLabel}</span>
            </div>
          </div>

          <div className="my-1 border-t border-stone-100" />

          <AsyncButton
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            className="flex w-full justify-start rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-none hover:bg-red-50 disabled:opacity-60"
            isLoading={isSigningOut}
            loadingText="Saliendo..."
            icon={<FontAwesomeIcon icon={faRightFromBracket} />}
          >
            Cerrar sesion
          </AsyncButton>
        </div>
      ) : null}
    </div>
  );
}
