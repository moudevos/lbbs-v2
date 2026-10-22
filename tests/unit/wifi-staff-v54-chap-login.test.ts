import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const html=readFileSync(path.join(process.cwd(),"routeros/hotspot/portal/lbbs-cautive-staff/login.html"),"utf8");
describe("LBBS Staff 54: one request, native CHAP",()=>{
  it("does not refetch router login after successful API authorization",()=>{
    expect(html).toContain("fetch(API+\"/api/hotspots/staff/authorize\"");
    expect(html).toContain("hexMD5(chapRenderId + account.password + chapRenderChallenge)");
    expect(html).toContain("document.sendin.submit()");
    expect(html).not.toContain("refreshChallenge()");
    expect(html).not.toContain("fetch(url+");
    expect(html).not.toContain("decodeChapBytes");
  });
  it("keeps router-supplied MAC/IP, 6-digit PIN and 2 device trust",()=>{
    expect(html).toContain('var CLIENT_MAC="$(mac)"');
    expect(html).toContain('var CLIENT_IP="$(ip)"');
    expect(html).toContain('mac:CLIENT_MAC');
    expect(html).toContain('ip:CLIENT_IP');
    expect(html).toContain('^\\d{6}$');
    expect(html).toContain("dos primeros equipos");
    expect(html).toContain("No se pudo contactar la API Staff por HTTPS");
  });
});