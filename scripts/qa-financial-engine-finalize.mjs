import fs from "node:fs";

const reportPath = ".qa/phase-1a-1b-final.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
report.localValidation = {
  typecheck: { state: "PASS", command: "npm run typecheck", exitCode: 0 },
  lint: { state: "PASS", command: "npm run lint", exitCode: 0 },
  unitTests: { state: "FAIL", command: "npm test", tests: 167, passed: 162, failed: 5, failingFiles: ["accounting-period-integrity", "courtesy-validation", "customer-identity-phase1", "employee-debts-contract", "settlement-production-discount-and-admin-sales-scope"] },
  build: { state: "PASS", command: "npm run build", exitCode: 0, evidence: "Next build compiled, typecheck finished, static generation completed, and Playwright started the production build successfully." },
  playwright: { state: "PASS", command: "npx playwright test tests/e2e/employee-debts.spec.ts --project=chromium", tests: 1, passed: 1 },
};
report.mutationQa = report.mutationQa ?? { state: "NOT_RUN" };
report.notes = [...(report.notes ?? []), "Mutation fixture debts were reverted through waive_employee_debt; QA employees were inactivated. No real records, migrations, commits, or pushes were modified."];
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[QA FINALIZE] report=${reportPath}; unit=${report.localValidation.unitTests.passed}/${report.localValidation.unitTests.tests}; playwright=${report.localValidation.playwright.passed}/${report.localValidation.playwright.tests}`);
