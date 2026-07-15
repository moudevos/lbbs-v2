import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordRecoveryForm } from "@/features/auth/password-recovery-form";

export default function PasswordRecoveryPage() { return <AuthCard title="Recuperar contraseña" description="Ingresa tu correo y te enviaremos un enlace seguro si tu cuenta está registrada."><PasswordRecoveryForm /></AuthCard>; }
