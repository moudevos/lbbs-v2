"use client";

import { faEye, faEyeSlash, faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";

type PasswordFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

export function PasswordField({ label, id, error, className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return <div className="space-y-2"><label htmlFor={inputId} className="text-sm font-medium text-slate-700">{label}</label><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400"><FontAwesomeIcon icon={faLock} className="h-4 w-4" /></span><Input {...props} id={inputId} type={visible ? "text" : "password"} className={`pl-10 pr-10 ${className ?? ""}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined} /> <button type="button" onClick={() => setVisible((value) => !value)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}><FontAwesomeIcon icon={visible ? faEyeSlash : faEye} className="h-4 w-4" /></button></div>{error ? <p id={`${inputId}-error`} className="text-xs text-rose-600">{error}</p> : null}</div>;
}
