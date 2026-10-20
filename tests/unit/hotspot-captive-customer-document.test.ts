import { readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

import { normalizeCaptiveDocument } from "@/lib/hotspot/captive";

const file = (name: string) => readFileSync(path.resolve(process.cwd(), name), "utf8");

describe("WiFi Clientes: documento y flujo cautivo", () => {
  it("valida DNI y CE sin conversiones numéricas ni perdida de ceros", () => {
    expect(normalizeCaptiveDocument("DNI", "01234567")).toEqual({ type: "DNI", number: "01234567" });
    expect(normalizeCaptiveDocument("CE", "ab123456")).toEqual({ type: "CE", number: "AB123456" });
    expect(normalizeCaptiveDocument("dni", "1234567")).toBeNull();
    expect(normalizeCaptiveDocument("CE", "AB#45678")).toBeNull();
    expect(normalizeCaptiveDocument("RUC", "20123456789")).toBeNull();
  });
  it("identifica por tipo y número, conserva compatibilidad con DNI antiguo", () => {
    const identify = file("src/app/api/hotspots/captive/identify/route.ts");
    const register = file("src/app/api/hotspots/captive/register/route.ts");
    expect(identify).toContain('body?.documentType ?? "DNI"');
    expect(identify).toContain("body?.documentNumber ?? body?.dni");
    expect(identify).toContain('.eq("document_type", document.type)');
    expect(identify).toContain('.eq("document_number", document.number)');
    expect(register).toContain('token.documentType ?? "DNI"');
    expect(register).toContain('token.documentNumber ?? token.dni');
    expect(register).toContain("document_type: document.type");
    expect(register).toContain("document_number: document.number");
  });
  it("ejecuta JavaScript de inicio aun cuando RouterOS inyecta CHAP con escapes octales", () => {
    const html = file("routeros/hotspot/portal/lbbs-cautive-clients/login.html");
    const inline = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
    // RouterOS representa CHAP-ID como un byte escapado en octal. En "use strict"
    // el parser aborta todo el script y el boton Comenzar no recibe su listener.
    const rendered = inline.replaceAll("$(chap-id)", "\\001").replaceAll("$(chap-challenge)", "\\250\\011");
    expect(() => new Script(rendered)).not.toThrow();
  });
  it("mantiene welcome, formulario DNI/CE, registro y progreso real de autorización", () => {
    const login = file("routeros/hotspot/portal/lbbs-cautive-clients/login.html");
    for (const id of ['id="welcome"', 'id="identifyStep"', 'id="registrationStep"', 'id="progressStep"', 'value="DNI"', 'value="CE"']) {
      expect(login).toContain(id);
    }
    for (const endpoint of ["/api/hotspots/captive/identify", "/api/hotspots/captive/register", "/api/hotspots/captive/status"]) {
      expect(login).toContain(endpoint);
    }
    expect(login).toContain('result.status === "activation_ready"');
    expect(login).toContain('$(link-login-only)');
    expect(login).toContain('$(chap-id)');
    expect(login).toContain("hexMD5(");
    expect(login).not.toContain("LBBS_ROUTER_TOKEN");
    expect(login).not.toContain("lbbs_rt_");
    expect(file("routeros/hotspot/portal/lbbs-cautive-clients/alogin.html")).toContain("$(link-status)");
    expect(file("routeros/hotspot/portal/lbbs-cautive-clients/rlogin.html")).toContain("$(link-login-only)");
  });
});
