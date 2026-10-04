import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPosCashMovement } from "@/features/pos/pos-actions";
import { getPosCashFlowPreview, getPosCashMovementCategoryCode } from "@/features/pos/pos-cash-flow";

describe("POS cash flow phase A", () => {
  it("computes income against the active session expected cash", () => {
    expect(getPosCashFlowPreview(100, "income", 20)).toMatchObject({ afterCash: 120, insufficientCash: false });
  });

  it("computes an expense against the active session expected cash", () => {
    expect(getPosCashFlowPreview(100, "expense", 30)).toMatchObject({ afterCash: 70, insufficientCash: false });
  });

  it("blocks an expense greater than the physical expected cash", () => {
    expect(getPosCashFlowPreview(100, "expense", 120)).toMatchObject({ afterCash: 0, insufficientCash: true });
  });

  it("resolves the POS income category", () => {
    expect(getPosCashMovementCategoryCode("income")).toBe("operational_income");
  });

  it("resolves physical POS outflow as cash withdrawal, never operational expense", () => {
    expect(getPosCashMovementCategoryCode("expense")).toBe("cash_withdrawal");
    expect(getPosCashMovementCategoryCode("expense")).not.toBe("operational_expense");
  });

  it("sends expense with the cash withdrawal category", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ categories: [{ id: "withdrawal-category", code: "cash_withdrawal" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "movement-id" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createPosCashMovement({
      posSessionId: "session-id",
      branchId: "branch-id",
      movementType: "expense",
      amount: 100,
      description: "Retiro físico",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      pos_session_id: "session-id",
      category_id: "withdrawal-category",
      movement_type: "expense",
      amount: 100,
    });
  });

  it("keeps movement creation blocked without an active POS session", () => {
    const actions = readFileSync(resolve(process.cwd(), "src/features/pos/pos-actions.ts"), "utf8");
    expect(actions).toContain('if (!input.posSessionId) throw new Error("No hay una sesión POS abierta para registrar el movimiento.")');
  });

  it("refreshes the POS bootstrap after a successful movement", () => {
    const workspace = readFileSync(resolve(process.cwd(), "src/features/pos/PosSessionWorkspace.tsx"), "utf8");
    expect(workspace).toContain("await createPosCashMovement({");
    expect(workspace).toContain("await loadBootstrap(selectedBranchId)");
    expect(workspace).toContain("currentSession.expected_cash_amount");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
