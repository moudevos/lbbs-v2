"use client";

import { validatePasswordPolicy } from "@/lib/auth/password-policy";

export function PasswordRequirements({ password }: { password: string }) {
  const result = validatePasswordPolicy(password);
  return <div className="space-y-1 text-xs text-slate-500" aria-live="polite"><p className="font-medium text-slate-600">La contraseña debe incluir:</p><div className="grid gap-1 sm:grid-cols-2">{result.requirements.map((item) => <span key={item.key} className={item.valid ? "text-emerald-700" : "text-slate-500"}>{item.valid ? "✓" : "○"} {item.label}</span>)}</div></div>;
}
