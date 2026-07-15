"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";

type RewardsTutorialModalProps = {
  open: boolean;
  onClose: () => void;
};

const tutorialSections = [
  {
    title: "Como funcionan las reglas",
    items: [
      "Las reglas definen cuando un cliente gana un beneficio.",
      "Pueden medir atenciones, ventas, compras con productos o monto acumulado.",
      "Si la regla esta activa, el sistema evalua la venta cerrada automaticamente.",
    ],
  },
  {
    title: "Como funcionan los premios",
    items: [
      "El premio es el beneficio que el cliente puede canjear despues.",
      "Puede ser un servicio gratis, un vale por monto o un descuento en productos.",
      "El reward se aplica como descuento, no como metodo de pago.",
    ],
  },
  {
    title: "Como migrar tarjetas fisicas",
    items: [
      "Puedes abrir la migracion desde el boton general o desde el perfil del cliente.",
      "Ingresa la cantidad de stickers o atenciones acumuladas.",
      "Agrega una nota obligatoria para dejar trazabilidad.",
    ],
  },
  {
    title: "Como consultar un cliente",
    items: [
      "Usa Ver perfil cliente para buscar por nombre, celular o documento.",
      "El perfil muestra acumulados, rewards disponibles, canjes e historial reciente.",
      "Desde ese perfil puedes recalcular rewards o abrir la migracion con el cliente precargado.",
    ],
  },
  {
    title: "Como se acumulan atenciones",
    items: [
      "Una atencion se genera desde una venta cerrada con al menos un servicio.",
      "Ventas solo de productos no cuentan como atencion.",
      "Cliente varios no acumula rewards.",
    ],
  },
  {
    title: "Como se canjea un reward en POS",
    items: [
      "El cliente debe estar identificado en la venta.",
      "Solo se aplica un reward por venta.",
      "El reward disponible aparece como descuento antes del cierre.",
    ],
  },
  {
    title: "Reglas importantes",
    items: [
      "Si se anula una venta, se revierte el reward generado.",
      "Una reserva no acumula rewards; solo cuenta la venta cerrada.",
      "La recepcion consulta y migra tarjetas; owner y admin configuran reglas y premios.",
    ],
  },
];

export function RewardsTutorialModal({ open, onClose }: RewardsTutorialModalProps) {
  return (
    <Modal
      open={open}
      title="Tutoriales"
      description="Guia rapida de operacion para rewards."
      onClose={onClose}
      confirmBeforeClose={false}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {tutorialSections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-sm font-semibold text-slate-900">{section.title}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 size-1.5 rounded-full bg-sky-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
