import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { maskDocument, normalizeLookupDocument, validateCustomerDocument } from "@/lib/utils/document";

type CustomerRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  phone: string;
  phone_normalized: string;
  email: string | null;
  document_type: "DNI" | "CE" | "Pasaporte" | "RUC" | "Otro" | null;
  document_number: string | null;
  birthdate: string | null;
  source: "manual" | "reservation" | "sale" | "import";
  preferred_branch_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildExpiration(found: boolean) {
  const now = Date.now();
  const ttlDays = found ? 30 : 7;
  return new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

function formatCustomer(customer: CustomerRow) {
  return {
    id: customer.id,
    full_name: customer.full_name,
    first_name: customer.first_name,
    last_name: customer.last_name,
    business_name: customer.business_name,
    phone: customer.phone,
    phone_normalized: customer.phone_normalized,
    email: customer.email,
    document_type: customer.document_type,
    document_number: customer.document_number,
    birthdate: customer.birthdate,
    source: customer.source,
    preferred_branch_id: customer.preferred_branch_id,
    notes: customer.notes,
    is_active: customer.is_active,
    created_by: customer.created_by,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

function buildDniName(data: Record<string, unknown>) {
  const directName = trimOrNull(data.nombre_completo);
  if (directName) {
    return directName;
  }

  const parts = [
    trimOrNull(data.nombres),
    trimOrNull(data.apellido_paterno),
    trimOrNull(data.apellido_materno),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : null;
}

function buildRucName(data: Record<string, unknown>) {
  return (
    trimOrNull(data.nombre_o_razon_social) ??
    trimOrNull(data.razon_social) ??
    trimOrNull(data.nombre_completo)
  );
}

function mapLookupData(documentType: "DNI" | "RUC", data: Record<string, unknown>) {
  if (documentType === "DNI") {
    const firstName = trimOrNull(data.nombres);
    const lastName = [trimOrNull(data.apellido_paterno), trimOrNull(data.apellido_materno)]
      .filter(Boolean)
      .join(" ");
    const fullName = buildDniName(data);
    return {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName || null,
      business_name: null,
    };
  }

  const businessName = buildRucName(data);
  return {
    full_name: businessName,
    first_name: null,
    last_name: null,
    business_name: businessName,
  };
}

function mapLookupCacheData(
  documentType: "DNI" | "RUC",
  fullName: string | null,
  businessName: string | null,
) {
  if (documentType === "RUC") {
    return {
      full_name: businessName ?? fullName,
      first_name: "",
      last_name: "",
      business_name: businessName ?? fullName ?? "",
    };
  }

  if (!fullName) {
    return {
      full_name: "",
      first_name: "",
      last_name: "",
      business_name: null,
    };
  }

  return {
    full_name: fullName,
    first_name: fullName,
    last_name: "",
    business_name: "",
  };
}

async function writeLookupLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentType: "DNI" | "RUC",
  normalizedDocument: string,
  requestedBy: string | null,
  success: boolean,
  statusCode: number | null,
  message: string,
) {
  const { error } = await supabase.from("identity_lookup_logs").insert({
    document_type: documentType,
    normalized_document_masked: maskDocument(normalizedDocument),
    success,
    status_code: statusCode,
    message,
    requested_by: requestedBy,
  });

  if (error) {
    console.error("[lookup/log] Error al guardar log", {
      provider: "apiperu",
      documentType,
      maskedDocument: maskDocument(normalizedDocument),
      message: error.message,
      code: error.code,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireCustomerWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createClient();
  const payload = await request.json().catch(() => null);
  const documentType = trimOrNull(payload?.document_type) as "DNI" | "RUC" | null;
  const rawDocumentNumber = trimOrNull(payload?.document_number);

  if (documentType !== "DNI" && documentType !== "RUC") {
    return NextResponse.json(
      { error: "Este tipo de documento no permite autocompletado." },
      { status: 400 },
    );
  }

  const normalizedDocument = normalizeLookupDocument(documentType, rawDocumentNumber);
  const documentError = validateCustomerDocument(documentType, normalizedDocument);
  if (documentError) return NextResponse.json({ error: documentError }, { status: 400 });

  const maskedDocument = maskDocument(normalizedDocument);
  const { data: employeeId } = await supabase.rpc("current_employee_id");

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select(
      "id, full_name, first_name, last_name, business_name, phone, phone_normalized, email, document_type, document_number, birthdate, source, preferred_branch_id, notes, is_active, created_by, created_at, updated_at",
    )
    .eq("document_type", documentType)
    .eq("document_number", normalizedDocument)
    .maybeSingle();

  if (customerError) {
    console.error("[lookup/customer] Error al buscar cliente", {
      provider: "apiperu",
      documentType,
      maskedDocument,
      message: customerError.message,
      code: customerError.code,
    });
    return NextResponse.json(
      { error: "No se pudo validar el documento en la base de datos." },
      { status: 500 },
    );
  }

  if (customer) {
    await writeLookupLog(
      supabase,
      documentType,
      normalizedDocument,
      employeeId ?? null,
      true,
      200,
      "Resultado encontrado en customers.",
    );

    return NextResponse.json({
      source: "customer",
      found: true,
      customer: formatCustomer(customer as CustomerRow),
    });
  }

  const nowIso = new Date().toISOString();
  const { data: cached, error: cacheError } = await supabase
    .from("identity_lookup_cache")
    .select(
      "id, provider, document_type, document_number, normalized_document, full_name, business_name, raw_data, found, expires_at",
    )
    .eq("provider", "apiperu")
    .eq("document_type", documentType)
    .eq("normalized_document", normalizedDocument)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (cacheError) {
    console.error("[lookup/cache] Error al leer cache", {
      provider: "apiperu",
      documentType,
      maskedDocument,
      message: cacheError.message,
      code: cacheError.code,
    });
  }

  if (cached) {
    await writeLookupLog(
      supabase,
      documentType,
      normalizedDocument,
      employeeId ?? null,
      cached.found,
      200,
      "Resultado servido desde cache.",
    );

    return NextResponse.json({
      source: "cache",
      found: cached.found,
      data: cached.found
        ? {
            ...mapLookupCacheData(
              documentType,
              cached.full_name,
              cached.business_name,
            ),
            raw_data: cached.raw_data,
          }
        : null,
    });
  }

  const token = process.env.APIPERU_TOKEN;
  const baseUrl = process.env.APIPERU_BASE_URL ?? "https://apiperu.dev/api";

  if (!token) {
    console.error("[lookup/provider] Falta token configurado", {
      provider: "apiperu",
      documentType,
      maskedDocument,
    });
    return NextResponse.json(
      { error: "No se pudo consultar el documento en este momento. Puedes registrar el cliente manualmente." },
      { status: 500 },
    );
  }

  const endpoint = documentType === "DNI" ? "/dni" : "/ruc";
  const requestBody =
    documentType === "DNI" ? { dni: normalizedDocument } : { ruc: normalizedDocument };

  try {
    const providerResponse = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    const providerPayload = (await providerResponse.json().catch(() => null)) as
      | { success?: boolean; data?: Record<string, unknown>; message?: string }
      | null;

    const success = providerResponse.ok && providerPayload?.success === true && !!providerPayload.data;
    const mapped = success ? mapLookupData(documentType, providerPayload.data ?? {}) : null;
    const found = Boolean(mapped?.full_name || mapped?.business_name);
    const expiresAt = buildExpiration(found);

    const upsertPayload = {
      provider: "apiperu",
      document_type: documentType,
      document_number: normalizedDocument,
      normalized_document: normalizedDocument,
      full_name: mapped?.full_name ?? null,
      business_name: mapped?.business_name ?? null,
      raw_data: providerPayload?.data ?? {},
      found,
      expires_at: expiresAt,
    };

    const { error: upsertError } = await supabase
      .from("identity_lookup_cache")
      .upsert(upsertPayload, {
        onConflict: "provider,document_type,normalized_document",
      });

    if (upsertError) {
      console.error("[lookup/cache] Error al guardar cache", {
        provider: "apiperu",
        documentType,
        maskedDocument,
        message: upsertError.message,
        code: upsertError.code,
      });
    }

    await writeLookupLog(
      supabase,
      documentType,
      normalizedDocument,
      employeeId ?? null,
      found,
      providerResponse.status,
      found ? "Resultado obtenido desde proveedor." : "Sin resultados del proveedor.",
    );

    if (!providerResponse.ok) {
      console.error("[lookup/provider] Fallo consulta externa", {
        provider: "apiperu",
        documentType,
        maskedDocument,
        status: providerResponse.status,
      });
      return NextResponse.json(
        { error: "No se pudo consultar el documento en este momento. Puedes registrar el cliente manualmente." },
        { status: 502 },
      );
    }

    if (!found) {
      return NextResponse.json({
        source: "api",
        found: false,
        data: null,
      });
    }

    return NextResponse.json({
      source: "api",
      found: true,
      data: {
        full_name: mapped?.full_name ?? null,
        first_name: mapped?.first_name ?? null,
        last_name: mapped?.last_name ?? null,
        business_name: mapped?.business_name ?? null,
        raw_data: providerPayload?.data ?? {},
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("[lookup/provider] Error al consultar proveedor", {
      provider: "apiperu",
      documentType,
      maskedDocument,
      message,
    });

    await writeLookupLog(
      supabase,
      documentType,
      normalizedDocument,
      employeeId ?? null,
      false,
      500,
      "Fallo la consulta externa.",
    );

    return NextResponse.json(
      { error: "No se pudo consultar el documento en este momento. Puedes registrar el cliente manualmente." },
      { status: 502 },
    );
  }
}
