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

function hasRepeatedDigits(value: string) {
  return value.length > 1 && /^([0-9])\1+$/.test(value);
}

function hasSequentialDigits(value: string) {
  if (value.length < 2) return false;
  const ascending = value.split("").every((digit, index, digits) => index === 0 || Number(digit) === Number(digits[index - 1]) + 1);
  const descending = value.split("").every((digit, index, digits) => index === 0 || Number(digit) === Number(digits[index - 1]) - 1);
  return ascending || descending;
}

function isValidPeruvianRuc(value: string) {
  if (!/^(10|15|17|20)\d{9}$/.test(value)) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;
  return checkDigit === Number(value[10]);
}

export function validateCustomerDocument(documentType: string | null | undefined, documentNumber: string | null | undefined) {
  const type = documentType?.trim() ?? "";
  const value = normalizeLookupDocument(type, documentNumber).toUpperCase();

  if (!type && !value) return null;
  if (!type) return "Selecciona el tipo de documento.";
  if (!value) return "Ingresa el numero de documento.";
  if (!["DNI", "CE", "Pasaporte", "RUC", "Otro"].includes(type)) return "El tipo de documento no es valido.";

  if (type === "DNI") {
    if (!/^\d{8}$/.test(value)) return "El DNI debe tener exactamente 8 digitos numericos.";
    if (hasRepeatedDigits(value) || hasSequentialDigits(value)) return "El DNI no puede ser un numero generico o consecutivo.";
    return null;
  }

  if (type === "RUC") {
    if (!/^\d{11}$/.test(value)) return "El RUC debe tener exactamente 11 digitos numericos.";
    if (!isValidPeruvianRuc(value)) return "El RUC no tiene un formato o digito de control valido.";
    return null;
  }

  if (type === "CE" || type === "Pasaporte") {
    if (!/^[A-Z0-9]{6,12}$/.test(value)) return `${type} debe tener entre 6 y 12 caracteres alfanumericos.`;
    if (hasRepeatedDigits(value)) return `${type} no puede ser un valor generico.`;
    return null;
  }

  if (type === "Otro" && !/^[A-Z0-9]{1,20}$/.test(value)) return "El documento debe tener entre 1 y 20 caracteres validos.";
  return null;
}

export function maskDocument(value: string) {
  if (value.length <= 4) {
    return `${value.slice(0, 1)}***`;
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
