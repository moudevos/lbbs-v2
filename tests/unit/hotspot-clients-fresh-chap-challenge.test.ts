import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(path.join(process.cwd(), "routeros/hotspot/portal/lbbs-cautive-clients/login.html"), "utf8");
const jsStart = html.lastIndexOf("<script>");
const inlineJs = html.slice(jsStart + "<script>".length, html.indexOf("</script>", jsStart));

describe("LBBS Clientes CHAP: fresh login challenge", () => {
  it("keeps valid JavaScript after RouterOS CHAP template expansion", () => {
    expect(() => new Function(inlineJs)).not.toThrow();
    const slash = String.fromCharCode(92);
    const expanded = inlineJs
      .replaceAll("$(chap-id)", slash + "001")
      .replaceAll("$(chap-challenge)", [134, 222, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
        .map((n) => slash + n.toString(8).padStart(3, "0")).join(""));
    expect(() => new Function(expanded)).not.toThrow();
  });

  it("parses a renewed challenge from RouterOS login response as exact binary octets", () => {
    const fn = inlineJs.match(/  function decodeChapBytes\(value\) \{[\s\S]*?\n  \}/);
    expect(fn).not.toBeNull();
    const decode = new Function(fn![0] + "; return decodeChapBytes;")() as (value: string) => string;
    const slash = String.fromCharCode(92);
    const chapId = slash + "001";
    const challenge = [134, 222, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
      .map((n) => slash + n.toString(8).padStart(3, "0")).join("");
    const rendered = 'var chapRenderId = "' + chapId + '"; var chapRenderChallenge = "' + challenge + '";';
    const idMatch = rendered.match(/var chapRenderId = "([^"]*)";/);
    const challengeMatch = rendered.match(/var chapRenderChallenge = "([^"]*)";/);
    expect(decode(idMatch![1]).charCodeAt(0)).toBe(1);
    expect(decode(challengeMatch![1]).length).toBe(16);
    expect(decode(challengeMatch![1]).charCodeAt(0)).toBe(92);
  });

  it("refreshes only after activation ready without caching credentials", () => {
    expect(inlineJs).toContain('if (result.status === "activation_ready")');
    expect(inlineJs).toContain("freshChap().then(function (chap)");
    expect(inlineJs).toContain('cache: "no-store"');
    expect(inlineJs).toContain('form.elements.password.value = hexMD5(chap.id + code.value + chap.challenge)');
    expect(inlineJs).not.toContain('form.elements.password.value = hexMD5("$(chap-id)"');
    expect(inlineJs).not.toContain("sessionStorage.setItem");
    expect(inlineJs).not.toContain("localStorage.setItem");
  });
});
