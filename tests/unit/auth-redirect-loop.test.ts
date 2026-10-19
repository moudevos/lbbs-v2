import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");
const loginPage = readFileSync(
  resolve(process.cwd(), "src/app/(auth)/login/page.tsx"),
  "utf8",
);

describe("auth redirect loop guard", () => {
  it("does not redirect an authenticated Supabase session from /login without an LBBS role", () => {
    expect(proxy).toContain('await supabase.rpc("current_user_role")');
    expect(proxy).toContain("if (role) {");
    expect(proxy).toContain("return redirectToControl(request, response);");
    expect(proxy).toContain("return response;");
  });

  it("applies the same LBBS-role gate in the server login page", () => {
    expect(loginPage).toContain('await supabase.rpc("current_user_role")');
    expect(loginPage).toContain("if (!roleError && role)");
    expect(loginPage).toContain('redirect(');
    expect(loginPage).toContain('"/control"');
  });

  it("keeps control protected for users without a valid authenticated session", () => {
    expect(proxy).toContain('pathname.startsWith("/control") && !userData.user');
    expect(proxy).toContain("return redirectToLogin(request, response);");
  });
});
