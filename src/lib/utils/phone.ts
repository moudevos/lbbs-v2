export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
