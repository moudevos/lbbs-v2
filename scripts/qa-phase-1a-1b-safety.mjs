import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// This script is invoked directly by Node, so mirror Next.js environment
// loading before reading any project configuration.
loadEnvConfig(process.cwd());

const mutationConsent = process.env.QA_ALLOW_MUTATIONS === "true";
const environment = process.env.QA_ENVIRONMENT;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const expectedProjectRef = process.env.QA_SAFE_SUPABASE_PROJECT_REF;

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

const safeEnvironment = ["development", "test", "staging"].includes(environment ?? "");
const configuredProjectRef = supabaseUrl ? projectRef(supabaseUrl) : null;
const safeProject = Boolean(expectedProjectRef && configuredProjectRef && expectedProjectRef === configuredProjectRef);
function isLocalBaseUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

const localhost = isLocalBaseUrl(baseUrl);
const projectStatus = !configuredProjectRef
  ? "NO DISPONIBLE"
  : safeProject
    ? "OK"
    : "NO COINCIDE";

if (!mutationConsent || !safeEnvironment || !safeProject || !localhost) {
  console.error("QA mutable bloqueada:");
  console.error(`- QA_ALLOW_MUTATIONS: ${mutationConsent ? "OK" : "NO HABILITADO"}`);
  console.error(`- QA_ENVIRONMENT: ${safeEnvironment ? "OK" : "NO PERMITIDO"}`);
  console.error(`- Supabase project ref: ${projectStatus}`);
  console.error(`- Base URL local: ${localhost ? "OK" : "NO VÁLIDA"}`);
  process.exit(1);
}

console.log("QA mutable habilitada para entorno y proyecto Supabase explícitamente aprobados.");
