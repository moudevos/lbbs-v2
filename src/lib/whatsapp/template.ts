export function renderWhatsAppTemplate(templateBody: string, variables: Record<string, string>) {
  return templateBody.replace(/{{(cliente|fecha|hora|sede|direccion|barbero|servicio|telefono_sede|servicios)}}/g, (_match, key) => variables[key] ?? "");
}

export function buildWhatsAppUrl(phone: string, renderedMessage: string) {
  const digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const normalized = /^9\d{8}$/.test(digits) ? `51${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(renderedMessage)}`;
}
