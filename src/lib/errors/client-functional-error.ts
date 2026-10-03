export type ClientFunctionalError = { code?: string; error?: string };

export async function readFunctionalError(response: Response): Promise<ClientFunctionalError> {
  const body = await response.json().catch(() => ({})) as ClientFunctionalError;
  if (response.ok) return body;
  return { code: body.code, error: body.error ?? "No se pudo actualizar la liquidación." };
}
