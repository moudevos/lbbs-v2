import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { buildSettlementDocumentSummary } from "@/features/settlements/settlement-document-summary";

type Row = Record<string, unknown>;
type Props = { detail: Row; services: Row[]; bonuses: Row[]; deductions: Row[] };
const amount = (value: number | unknown) => `S/ ${Number(value ?? 0).toFixed(2)}`;
const relation = (value: unknown, key: string) => { const item = Array.isArray(value) ? value[0] : value; return item && typeof item === "object" ? String((item as Row)[key] ?? "") : ""; };
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, color: "#0f172a", fontFamily: "Helvetica" }, title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 3 }, subtitle: { color: "#475569", marginBottom: 16 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 5 }, field: { width: "48%", paddingVertical: 2 }, label: { color: "#64748b" }, strong: { fontFamily: "Helvetica-Bold" }, section: { marginTop: 14 }, heading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 }, box: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4, padding: 9 }, summaryField: { width: "25%", paddingRight: 6 }, twoColumns: { flexDirection: "row", gap: 10 }, column: { width: "50%", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4, padding: 9 }, row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }, muted: { color: "#64748b" }, final: { borderWidth: 2, borderColor: "#0f172a", borderRadius: 4, padding: 10 }, footer: { position: "absolute", left: 40, right: 40, bottom: 28, fontSize: 8, color: "#64748b", textAlign: "center" },
});

function Lines({ title, lines, expense = false }: { title: string; lines: ReturnType<typeof buildSettlementDocumentSummary>["incomes"]; expense?: boolean }) {
  return <View style={styles.column}><Text style={styles.heading}>{title}</Text>{lines.length ? lines.map((line) => <View key={`${line.label}-${line.detail ?? ""}`} style={styles.row}><Text>{line.label}{line.detail ? ` (${line.detail})` : ""}</Text><Text style={styles.strong}>{expense ? "-" : ""}{amount(line.amount)}</Text></View>) : <Text style={styles.muted}>Sin conceptos aplicados.</Text>}</View>;
}

export function EmployeeSettlementPdf({ detail, services, bonuses: _bonuses, deductions }: Props) {
  const paid = detail.status === "paid";
  const summary = buildSettlementDocumentSummary(detail, services, deductions);
  const title = paid ? "Comprobante de pago de liquidación" : "Liquidación operativa de empleado";
  return <Document title={`${title} ${String(detail.settlement_number ?? "")}`} author="La Bajadita Barber Studio"><Page size="A4" style={styles.page}>
    <Text style={styles.title}>La Bajadita Barber Studio</Text><Text style={styles.subtitle}>{title} - No es documento tributario</Text>
    <View style={styles.grid}><View style={styles.field}><Text><Text style={styles.label}>Número: </Text><Text style={styles.strong}>{String(detail.settlement_number ?? "")}</Text></Text></View><View style={styles.field}><Text><Text style={styles.label}>Estado: </Text>{paid ? "Pagada" : String(detail.status ?? "")}</Text></View><View style={styles.field}><Text><Text style={styles.label}>Empleado: </Text>{relation(detail.employee, "full_name")}</Text></View><View style={styles.field}><Text><Text style={styles.label}>Sede: </Text>{relation(detail.branch, "name")}</Text></View><View style={styles.field}><Text><Text style={styles.label}>Periodo: </Text>{relation(detail.period, "start_date")} al {relation(detail.period, "end_date")}</Text></View></View>
    <View style={styles.section}><Text style={styles.heading}>Resumen de servicios</Text><View style={[styles.box, styles.grid]}><View style={styles.summaryField}><Text style={styles.label}>Total de servicios</Text><Text style={styles.strong}>{summary.serviceCount}</Text></View><View style={styles.summaryField}><Text style={styles.label}>Total bruto</Text><Text style={styles.strong}>{amount(summary.servicesGross)}</Text></View><View style={styles.summaryField}><Text style={styles.label}>Descuento por producción</Text><Text style={styles.strong}>-{amount(summary.productionDiscount)}</Text></View><View style={styles.summaryField}><Text style={styles.label}>Base</Text><Text style={styles.strong}>{amount(summary.productionBase)}</Text></View></View></View>
    <View style={styles.section}><View style={styles.twoColumns}><Lines title="Ingresos" lines={summary.incomes} /><Lines title="Egresos" lines={summary.expenses} expense /></View></View>
    <View style={[styles.section, styles.final]}><View style={styles.row}><Text>Total ingresos</Text><Text>{amount(summary.totalIncome)}</Text></View><View style={styles.row}><Text>Total egresos</Text><Text>-{amount(summary.totalExpenses)}</Text></View><View style={[styles.row, { marginTop: 5 }]}><Text style={styles.strong}>Neto final a pagar</Text><Text style={styles.strong}>{amount(detail.net_pay_amount)}</Text></View></View>
    <View style={styles.section}><Text style={styles.heading}>{paid ? "Datos del pago" : "Estado de aprobación"}</Text><Text>Método: {relation(detail.payment_method, "name") || "Pendiente"}</Text>{paid ? <Text>Fecha de pago: {String(detail.paid_at ?? "")}</Text> : null}<Text>Confirmó: {relation(detail.reviewed, "full_name") || "Pendiente"} - Aprobó: {relation(detail.approved, "full_name") || "Pendiente"} - Pago: {relation(detail.paid, "full_name") || "Pendiente"}</Text></View>
    <Text style={styles.footer}>Documento generado el {new Date().toLocaleString("es-PE")}</Text>
  </Page></Document>;
}
