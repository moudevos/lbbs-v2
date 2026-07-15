import type { SaleDocumentPayload } from "@/lib/sales/sale-document-types";

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function printSaleTicket(payload: SaleDocumentPayload) {
  const ticket = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
  if (!ticket) return;
  const items = payload.items.map((item) => `<div class="line"><span>${escapeHtml(item.quantity)} x ${escapeHtml(item.description)}</span><strong>S/ ${Number(item.net_amount).toFixed(2)}</strong></div>`).join("");
  const payments = payload.payments.map((payment) => `<div class="line"><span>${escapeHtml(payment.method_name)}</span><span>S/ ${Number(payment.applied_amount).toFixed(2)}</span></div>`).join("");
  ticket.document.write(`<!doctype html><html><head><title>Ticket ${escapeHtml(payload.sale.number)}</title><style>@page{size:80mm auto;margin:0}html,body{width:80mm;margin:0;padding:0;background:#fff;font:11px Arial;color:#111}.ticket-print-root{box-sizing:border-box;width:80mm;margin:0;padding:3mm 4mm}.ticket-content{width:72mm;margin:0 auto}.center{text-align:center}.line{display:flex;justify-content:space-between;gap:3mm;margin:1.5mm 0}.section{border-top:1px dashed #555;padding-top:2mm;margin-top:2mm}.total{font-size:15px;font-weight:700}.cancelled{border:2px solid #b91c1c;color:#b91c1c;padding:2mm;text-align:center;font-weight:700}</style></head><body><main class="ticket-print-root"><div class="ticket-content"><header class="center"><strong style="font-size:15px">${escapeHtml(payload.issuer.business_name)}</strong><div>${escapeHtml(payload.branch.name)}</div><div>Ticket ${escapeHtml(payload.sale.number)}</div></header>${payload.sale.status === "cancelled" ? `<p class="cancelled">VENTA ANULADA<br>${escapeHtml(payload.sale.cancellation?.reason)}</p>` : ""}<section class="section"><div>Cliente: ${escapeHtml(payload.customer.name)}</div><div>Cajero: ${escapeHtml(payload.employees.cashier.name)}</div></section><section class="section">${items}</section><section class="section"><div class="line total"><span>Total</span><span>S/ ${Number(payload.totals.payable_amount).toFixed(2)}</span></div>${payments}${payload.totals.change_amount > 0 ? `<div class="line"><strong>Vuelto</strong><strong>S/ ${Number(payload.totals.change_amount).toFixed(2)}</strong></div>` : ""}</section><footer class="section center">Ticket operativo interno. No es comprobante fiscal.</footer></div></main><script>window.onload=()=>{window.focus();window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
  ticket.document.close();
}
