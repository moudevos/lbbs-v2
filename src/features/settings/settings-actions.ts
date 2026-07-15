import type {
  SettingFormValue,
  SettingMovementType,
  SettingRecord,
  SettingsSectionConfig,
  SettingsSectionKey,
} from "@/features/settings/settings-types";

const endpointMap = new Map(
  [
    ["service_categories", "/api/admin/service-categories"],
    ["product_categories", "/api/admin/product-categories"],
    ["payment_methods", "/api/admin/payment-methods"],
    ["product_units", "/api/admin/product-units"],
    ["courtesy_reasons", "/api/admin/courtesy-reasons"],
    ["stock_adjustment_reasons", "/api/admin/stock-adjustment-reasons"],
  ] satisfies [SettingsSectionKey, string][],
);

const movementTypeLabels: Record<SettingMovementType, string> = {
  purchase: "Compra",
  sale: "Venta",
  courtesy: "Cortesia",
  adjustment: "Ajuste",
  waste: "Merma",
  transfer_in: "Transferencia entrada",
  transfer_out: "Transferencia salida",
};

export function getEndpoint(section: SettingsSectionKey) {
  const endpoint = endpointMap.get(section);

  if (!endpoint) {
    throw new Error("Seccion de configuracion no soportada.");
  }

  return endpoint;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeCode(value: string) {
  return normalizeSlug(value).replace(/-/g, "_");
}

export function buildSuggestedIdentity(config: SettingsSectionConfig, value: string) {
  return config.identityKey === "slug" ? normalizeSlug(value) : normalizeCode(value);
}

export function createEmptySettingForm(): SettingFormValue {
  return {
    name: "",
    identity: "",
    description: "",
    sort_order: "0",
    is_active: true,
    movement_type: "",
    payment_kind: "other_digital",
  };
}

export function toSettingFormValue(
  config: SettingsSectionConfig,
  item?: SettingRecord | null,
): SettingFormValue {
  if (!item) {
    return createEmptySettingForm();
  }

  const identity = config.identityKey === "slug" ? item.slug ?? "" : item.code ?? "";

  return {
    name: item.name,
    identity,
    description: item.description ?? "",
    sort_order: String(item.sort_order ?? 0),
    is_active: item.is_active,
    movement_type: item.movement_type ?? "",
    payment_kind: item.payment_kind ?? "other_digital",
  };
}

export async function fetchSettings(section: SettingsSectionKey) {
  const response = await fetch(getEndpoint(section), {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "No se pudieron cargar las configuraciones.");
  }

  return (payload.data ?? []) as SettingRecord[];
}

export async function saveSetting(
  config: SettingsSectionConfig,
  value: SettingFormValue,
  editingId?: string | null,
) {
  const payload = {
    name: value.name.trim(),
    [config.identityKey]: buildSuggestedIdentity(config, value.identity || value.name),
    description: value.description.trim() || null,
    sort_order: value.sort_order.trim() || "0",
    is_active: value.is_active,
    movement_type: config.supportsMovementType ? value.movement_type || null : undefined,
    payment_kind: config.key === "payment_methods" ? value.payment_kind : undefined,
  };

  const endpoint = editingId ? `${config.endpoint}/${editingId}` : config.endpoint;
  const response = await fetch(endpoint, {
    method: editingId ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo guardar la configuracion.");
  }

  return result.data as SettingRecord;
}

export async function toggleSetting(
  config: SettingsSectionConfig,
  item: SettingRecord,
  isActive: boolean,
) {
  const payload = {
    name: item.name,
    [config.identityKey]:
      config.identityKey === "slug" ? item.slug ?? "" : item.code ?? "",
    description: item.description,
    sort_order: item.sort_order,
    is_active: isActive,
    movement_type: config.supportsMovementType ? item.movement_type ?? null : undefined,
    payment_kind: config.key === "payment_methods" ? item.payment_kind ?? "other_digital" : undefined,
  };

  const response = await fetch(`${config.endpoint}/${item.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo actualizar el estado.");
  }

  return result.data as SettingRecord;
}

export function getMovementTypeLabel(value: SettingMovementType | null | undefined) {
  if (!value) {
    return "General";
  }

  return movementTypeLabels[value] ?? value;
}

export function validateDuplicate(
  config: SettingsSectionConfig,
  items: SettingRecord[],
  value: SettingFormValue,
  editingId?: string | null,
) {
  const normalizedIdentity = buildSuggestedIdentity(config, value.identity || value.name);
  const nameNormalized = value.name.trim().toLowerCase();

  const duplicateIdentity = items.some((item) => {
    if (item.id === editingId) {
      return false;
    }

    const currentIdentity = config.identityKey === "slug" ? item.slug ?? "" : item.code ?? "";
    return currentIdentity.toLowerCase() === normalizedIdentity.toLowerCase();
  });

  if (duplicateIdentity) {
    return `Ya existe un registro con ese ${config.identityLabel.toLowerCase()}.`;
  }

  const duplicateName = items.some((item) => {
    if (item.id === editingId) {
      return false;
    }

    return item.name.trim().toLowerCase() === nameNormalized;
  });

  if (duplicateName) {
    return "Ya existe un registro con ese nombre.";
  }

  return null;
}
