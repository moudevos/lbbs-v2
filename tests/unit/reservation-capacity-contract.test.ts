import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getReservationVisualStatus } from "@/features/reservations/reservation-presentation";

const root = process.cwd();
const dashboard = (relative: string) => readFile(path.join(root, relative), "utf8");
const landingRoot = path.resolve(root, "../../lbbs_landing_v2");
const landing = (relative: string) => readFile(path.join(landingRoot, relative), "utf8");
const migration = "supabase/migrations/20261004014702_simplify_reservation_agenda.sql";
const rescheduleSlotsMigration = "supabase/migrations/20261004021859_reservation_slots_exclude_current.sql";

describe("agenda de reservas simplificada", () => {
  it("1. la reserva pública nueva se crea scheduled", async () => expect(await landing("app/api/public/reservations/route.ts")).toContain('p_status: "scheduled"'));
  it("2. la reserva de Dashboard nueva se crea scheduled", async () => expect(await dashboard("src/app/api/admin/reservations/route.ts")).toContain('const status: ReservationStatus = "scheduled"'));
  it("3. scheduled consume disponibilidad", async () => expect(await dashboard(migration)).toContain("'scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in'"));
  it("4. cancelled no consume disponibilidad", async () => expect(await dashboard(migration)).not.toContain("'cancelled', 'pending'"));
  it("5. reprogramar vuelve a guardar scheduled", async () => expect(await dashboard("src/features/reservations/reservations-panel.tsx")).toContain('status: "scheduled"'));
  it("6. reprogramar registra su trazabilidad", async () => { const sql = await dashboard(migration); expect(sql).toContain("rescheduled_at"); expect(sql).toContain("rescheduled_by"); });
  it("7. la validación excluye la propia reserva", async () => expect(await dashboard(migration)).toContain("reservation.id <> p_reservation_id"));
  it("8. un barbero específico no puede solaparse", async () => expect(await dashboard(migration)).toContain("El barbero seleccionado ya tiene una reserva en ese horario."));
  it("9. otro barbero puede usar el mismo horario si hay capacidad", async () => expect(await dashboard(migration)).toContain("if v_conflicts < v_capacity then"));
  it("10. la capacidad usa solo barberos activos de la sede", async () => { const sql = await dashboard(migration); expect(sql).toContain("employee.role = 'barber'"); expect(sql).toContain("employee.status = 'active'"); });
  it("11. la duración controla los solapamientos", async () => expect(await dashboard(migration)).toContain("make_interval(mins => v_duration)"));
  it("12. el recordatorio no cambia el estado", async () => { const sql = await dashboard(migration); const reminder = sql.slice(sql.indexOf("record_reservation_reminder"), sql.indexOf("cancel_reservation")); expect(reminder).not.toContain("status ="); });
  it("13. el recordatorio guarda auditoría", async () => { const sql = await dashboard(migration); expect(sql).toContain("last_reminder_at = now()"); expect(sql).toContain("reminder_count = reminder_count + 1"); });
  it("14. la anulación cambia a cancelled", async () => expect(await dashboard(migration)).toContain("status = 'cancelled'"));
  it("15. la anulación persiste motivo y actor", async () => { const sql = await dashboard(migration); expect(sql).toContain("cancellation_reason"); expect(sql).toContain("cancelled_by"); });
  it("16. scheduled puede seleccionarse desde POS", async () => expect(await dashboard("src/app/api/admin/pos/reservations/route.ts")).toContain('"scheduled"'));
  it("17. POS no exige checked_in para usar una reserva", async () => expect(await dashboard("src/features/pos/PosReservationsModal.tsx")).not.toContain("Marcar en tienda y usar"));
  it("18. una venta POS completada registra asistencia", async () => expect(await dashboard(migration)).toContain("mark_reservation_attendance_from_sale"));
  it("19. una reversa del mismo día sin otra venta válida no conserva asistencia", async () => { const sql = await dashboard(migration); expect(sql).toContain("new.status = 'cancelled'"); expect(sql).toContain("sale.status = 'completed'"); });
  it("20. una reserva futura se muestra Programada", () => expect(getReservationVisualStatus({ status: "scheduled", attendedAt: null, scheduledDate: "2030-01-01", scheduledTime: "10:00", now: new Date("2029-01-01T00:00:00Z") })).toBe("scheduled"));
  it("21. una reserva pasada sin venta se muestra No atendida", () => expect(getReservationVisualStatus({ status: "scheduled", attendedAt: null, scheduledDate: "2029-01-01", scheduledTime: "10:00", now: new Date("2030-01-01T00:00:00Z") })).toBe("unattended"));
  it("22. una reserva con venta se muestra Atendida", () => expect(getReservationVisualStatus({ status: "scheduled", attendedAt: "2030-01-01T12:00:00Z", scheduledDate: "2030-01-01", scheduledTime: "10:00" })).toBe("attended"));
  it("23. cancelled se muestra Anulada", () => expect(getReservationVisualStatus({ status: "cancelled", attendedAt: null, scheduledDate: "2030-01-01", scheduledTime: "10:00" })).toBe("cancelled"));
  it("24. completed legacy se interpreta como Atendida", () => expect(getReservationVisualStatus({ status: "completed", attendedAt: null, scheduledDate: null, scheduledTime: null })).toBe("attended"));
  it("25. no_show legacy se interpreta como No atendida", () => expect(getReservationVisualStatus({ status: "no_show", attendedAt: null, scheduledDate: null, scheduledTime: null })).toBe("unattended"));
  it("26. la escritura serializa concurrencia por sede y fecha", async () => expect(await dashboard(migration)).toContain("pg_advisory_xact_lock"));
  it("27. reprogramar excluye la reserva actual de los horarios disponibles", async () => {
    const sql = await dashboard(rescheduleSlotsMigration);
    expect(sql).toContain("p_exclude_reservation_id uuid default null");
    expect(sql).toContain("reservation.id <> p_exclude_reservation_id");
  });
  it("28. el formulario solo ofrece horarios consultados", async () => {
    const form = await dashboard("src/features/reservations/ReservationFormModal.tsx");
    expect(form).toContain("availableSlots.map");
    expect(form).toContain("Consultando horarios...");
  });
  it("29. POS usa la fecha operativa de la sesiÃ³n", async () => {
    const modal = await dashboard("src/features/pos/PosReservationsModal.tsx");
    expect(modal).toContain("businessDate");
    expect(modal).not.toContain("todayLima");
  });
  it("30. POS precarga el servicio mediante suggestedServiceId", async () => expect(await dashboard("src/features/pos/PosSessionWorkspace.tsx")).toContain("setSuggestedServiceId"));
  it("31. una venta completada no vuelve a figurar como reserva POS", async () => expect(await dashboard("src/app/api/admin/pos/reservations/route.ts")).toContain('row.linkedSale?.status !== "completed"'));
});
