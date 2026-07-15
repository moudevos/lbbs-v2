import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function StatusMessage() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700">
      <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 text-emerald-600" />
      <div>
        <p className="font-semibold text-slate-900">Sistema listo</p>
        <p className="mt-1 text-slate-600">
          Sprint 0 preparado para continuar con el siguiente modulo.
        </p>
      </div>
    </div>
  );
}
