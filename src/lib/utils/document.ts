export function normalizeDocumentNumber(value: string) {
  return value.replace(/[\s().-]/g, "");
}

export function normalizeLookupDocument(
  documentType: string | null | undefined,
  documentNumber: string | null | undefined,
) {
  const rawValue = documentNumber ?? "";

  if (documentType === "DNI" || documentType === "RUC") {
    return rawValue.replace(/\D/g, "");
  }

  return normalizeDocumentNumber(rawValue).trim();
}

export function maskDocument(value: string) {
  if (value.length <= 4) {
    return `${value.slice(0, 1)}***`;
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
