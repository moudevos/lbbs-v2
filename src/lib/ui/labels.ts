export const roleLabels = {
  owner: "Administrador principal",
  admin: "Administrador",
  reception: "Recepción",
  barber: "Barbero",
  viewer: "Visualizador",
} as const;

export const statusLabels = {
  active: "Activo",
  inactive: "Inactivo",
  blocked: "Bloqueado",
} as const;

export const serviceStatusLabels = statusLabels;

export const documentTypeLabels = {
  dni: "DNI",
  ce: "CE",
  pasaporte: "Pasaporte",
  ruc: "RUC",
  otro: "Otro",
} as const;

export const customerDocumentTypeLabels = {
  DNI: "DNI",
  CE: "CE",
  Pasaporte: "Pasaporte",
  RUC: "RUC",
  Otro: "Otro",
} as const;

export const customerGenderLabels = {
  male: "Masculino",
  female: "Femenino",
  other: "Otro",
  unspecified: "No especificado",
} as const;

export const customerSourceLabels = {
  manual: "Manual",
  reservation: "Reserva",
  sale: "Venta",
  import: "Importacion",
} as const;

export const accessLabels = {
  enabled: "Con acceso",
  disabled: "Sin acceso",
} as const;

export const priceModeLabels = {
  base: "Usa precio base",
  custom: "Precio personalizado",
} as const;

export const roleOptions = [
  { value: "owner", label: roleLabels.owner },
  { value: "admin", label: roleLabels.admin },
  { value: "reception", label: roleLabels.reception },
  { value: "barber", label: roleLabels.barber },
  { value: "viewer", label: roleLabels.viewer },
] as const;

export const employeeStatusOptions = [
  { value: "active", label: statusLabels.active },
  { value: "inactive", label: statusLabels.inactive },
  { value: "blocked", label: statusLabels.blocked },
] as const;

export const documentTypeOptions = [
  { value: "dni", label: documentTypeLabels.dni },
  { value: "ce", label: documentTypeLabels.ce },
  { value: "pasaporte", label: documentTypeLabels.pasaporte },
  { value: "ruc", label: documentTypeLabels.ruc },
  { value: "otro", label: documentTypeLabels.otro },
] as const;

export const customerDocumentTypeOptions = [
  { value: "DNI", label: customerDocumentTypeLabels.DNI },
  { value: "CE", label: customerDocumentTypeLabels.CE },
  { value: "Pasaporte", label: customerDocumentTypeLabels.Pasaporte },
  { value: "RUC", label: customerDocumentTypeLabels.RUC },
  { value: "Otro", label: customerDocumentTypeLabels.Otro },
] as const;

export const customerGenderOptions = [
  { value: "male", label: customerGenderLabels.male },
  { value: "female", label: customerGenderLabels.female },
  { value: "other", label: customerGenderLabels.other },
  { value: "unspecified", label: customerGenderLabels.unspecified },
] as const;

export const customerSourceOptions = [
  { value: "manual", label: customerSourceLabels.manual },
  { value: "reservation", label: customerSourceLabels.reservation },
  { value: "sale", label: customerSourceLabels.sale },
  { value: "import", label: customerSourceLabels.import },
] as const;

export const reservationStatusLabels = {
  pending: "Pendiente",
  contacted: "Contactado",
  confirmed: "Confirmada",
  rescheduled: "Reprogramada",
  checked_in: "En tienda",
  completed: "Atendida",
  cancelled: "Cancelada",
  no_show: "No asistio",
} as const;

export const reservationSourceLabels = {
  manual: "Manual",
  public_form: "Formulario web",
  whatsapp: "WhatsApp",
  phone: "Telefono",
} as const;

export const reservationChannelLabels = {
  reception: "Recepcion",
  website: "Pagina web",
  whatsapp: "WhatsApp",
  phone: "Telefono",
} as const;

export const reservationStatusOptions = [
  { value: "pending", label: reservationStatusLabels.pending },
  { value: "contacted", label: reservationStatusLabels.contacted },
  { value: "confirmed", label: reservationStatusLabels.confirmed },
  { value: "rescheduled", label: reservationStatusLabels.rescheduled },
  { value: "checked_in", label: reservationStatusLabels.checked_in },
  { value: "completed", label: reservationStatusLabels.completed },
  { value: "cancelled", label: reservationStatusLabels.cancelled },
  { value: "no_show", label: reservationStatusLabels.no_show },
] as const;

export const reservationSourceOptions = [
  { value: "manual", label: reservationSourceLabels.manual },
  { value: "public_form", label: reservationSourceLabels.public_form },
  { value: "whatsapp", label: reservationSourceLabels.whatsapp },
  { value: "phone", label: reservationSourceLabels.phone },
] as const;

export const reservationChannelOptions = [
  { value: "reception", label: reservationChannelLabels.reception },
  { value: "website", label: reservationChannelLabels.website },
  { value: "whatsapp", label: reservationChannelLabels.whatsapp },
  { value: "phone", label: reservationChannelLabels.phone },
] as const;

export const productUnitLabels = {
  unidad: "Unidad",
  paquete: "Paquete",
  botella: "Botella",
  porcion: "Porcion",
  otro: "Otro",
} as const;

export const productMovementTypeLabels = {
  purchase: "Compra",
  sale: "Venta",
  courtesy: "Cortesia",
  adjustment: "Ajuste",
  waste: "Merma",
  transfer_in: "Transferencia entrada",
  transfer_out: "Transferencia salida",
} as const;

export const productUnitOptions = [
  { value: "unidad", label: productUnitLabels.unidad },
  { value: "paquete", label: productUnitLabels.paquete },
  { value: "botella", label: productUnitLabels.botella },
  { value: "porcion", label: productUnitLabels.porcion },
  { value: "otro", label: productUnitLabels.otro },
] as const;

export const productMovementTypeOptions = [
  { value: "purchase", label: productMovementTypeLabels.purchase },
  { value: "sale", label: productMovementTypeLabels.sale },
  { value: "courtesy", label: productMovementTypeLabels.courtesy },
  { value: "adjustment", label: productMovementTypeLabels.adjustment },
  { value: "waste", label: productMovementTypeLabels.waste },
  { value: "transfer_in", label: productMovementTypeLabels.transfer_in },
  { value: "transfer_out", label: productMovementTypeLabels.transfer_out },
] as const;
