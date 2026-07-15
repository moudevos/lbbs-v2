import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

type AsyncButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean; loadingText?: string; icon?: ReactNode };

export function AsyncButton({ isLoading = false, loadingText = "Procesando...", disabled, children, icon, ...props }: AsyncButtonProps) {
  return <Button {...props} disabled={disabled || isLoading} aria-busy={isLoading || undefined}><span className="inline-flex min-w-0 items-center justify-center gap-2">{isLoading ? <ButtonSpinner /> : icon}{isLoading ? loadingText : children}</span></Button>;
}
