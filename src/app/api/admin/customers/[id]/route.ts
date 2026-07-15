import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { normalizeLookupDocument } from "@/lib/utils/document";
import { normalizePhone } from "@/lib/utils/phone";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type CustomerBranch = {
  name: string | null;
} | null;

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
  preferred_branch?: CustomerBranch[] | CustomerBranch;
};

function formatCustomer(customer: CustomerRow) {
  const preferredBranch = Array.isArray(customer.preferred_branch)
    ? customer.preferred_branch[0] ?? null
    : customer.preferred_branch ?? null;

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
    preferred_branch_name: preferredBranch?.name ?? null,
    notes: customer.notes,
    is_active: customer.is_active,
    created_by: customer.created_by,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

function buildFullName(
  documentType: string | null,
  firstName: string | null,
  lastName: string | null,
  businessName: string | null,
) {
  if (documentType === "RUC") {
    return businessName;
  }

  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCustomerWriteSession();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const supabase = await createClient();
  const payload = await request.json().catch(() => null);
  const documentType = trimOrNull(payload?.document_type);
  const firstName = trimOrNull(payload?.first_name);
  const lastName = trimOrNull(payload?.last_name);
  const businessName = trimOrNull(payload?.business_name);
  const fullName = buildFullName(documentType, firstName, lastName, businessName);
  const phone = trimOrNull(payload?.phone);

  if (!fullName || !phone) {
    return NextResponse.json(
      { error: "Debes completar nombre o razon social y telefono." },
      { status: 400 },
    );
  }

  const phoneNormalized = normalizePhone(phone);
  if (phoneNormalized.length < 9) {
    return NextResponse.json(
      { error: "El telefono debe tener al menos 9 digitos validos." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .update({
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      business_name: businessName,
      phone,
      phone_normalized: phoneNormalized,
      email: trimOrNull(payload?.email),
      document_type: documentType,
      document_number: normalizeLookupDocument(
        documentType,
        trimOrNull(payload?.document_number),
      ) || null,
      birthdate: trimOrNull(payload?.birthdate),
      source: payload?.source ?? "manual",
      preferred_branch_id: null,
      notes: trimOrNull(payload?.notes),
      is_active: payload?.is_active !== false,
    })
    .eq("id", id)
    .select(
      "id, full_name, first_name, last_name, business_name, phone, phone_normalized, email, document_type, document_number, birthdate, source, preferred_branch_id, notes, is_active, created_by, created_at, updated_at, preferred_branch:branches(name)",
    )
    .single();

  if (error) {
    console.error("[customers/put] Error al actualizar cliente", {
      message: error.message,
      code: error.code,
      customerId: id,
      phoneNormalized,
    });
    return NextResponse.json(
      { error: error.message || "No se pudo actualizar el cliente." },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: formatCustomer(data as CustomerRow) });
}
