import type { Locator, Page } from "@playwright/test";

type QaScenario = {
  scenario: string;
  role: string;
  branch: string;
  step: string;
};

function isVisualMode() {
  return process.env.QA_VISUAL === "true";
}

export async function installVisualCursor(page: Page) {
  if (!isVisualMode()) {
    return;
  }

  await page.addInitScript(() => {
    const install = () => {
      if (document.querySelector("[data-qa-visual-cursor]")) {
        return;
      }

      const cursor = document.createElement("div");
      cursor.dataset.qaVisualCursor = "true";
      Object.assign(cursor.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: "18px",
        height: "18px",
        border: "2px solid #ef4444",
        borderRadius: "9999px",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: "2147483647",
        transition: "width 120ms ease, height 120ms ease, opacity 120ms ease",
      });
      document.documentElement.appendChild(cursor);

      document.addEventListener("mousemove", (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      });
      document.addEventListener("mousedown", () => {
        cursor.style.width = "32px";
        cursor.style.height = "32px";
      });
      document.addEventListener("mouseup", () => {
        cursor.style.width = "18px";
        cursor.style.height = "18px";
      });
    };

    window.addEventListener("DOMContentLoaded", install, { once: true });
    if (document.readyState !== "loading") {
      install();
    }
  });
}

export async function highlightLocator(locator: Locator) {
  if (!isVisualMode()) {
    return;
  }

  await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const previousOutline = target.style.outline;
    const previousOffset = target.style.outlineOffset;

    target.style.outline = "3px solid #ef4444";
    target.style.outlineOffset = "3px";

    window.setTimeout(() => {
      target.style.outline = previousOutline;
      target.style.outlineOffset = previousOffset;
    }, 1000);
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
}

export async function visualPause(page: Page, milliseconds = 1000) {
  if (isVisualMode()) {
    await page.waitForTimeout(milliseconds);
  }
}

export async function showQaScenarioBanner(page: Page, data: QaScenario) {
  if (!isVisualMode()) {
    return;
  }

  await page.evaluate((scenario) => {
    const existing = document.querySelector("[data-qa-scenario-banner]");
    const banner = (existing ?? document.createElement("aside")) as HTMLElement;
    banner.dataset.qaScenarioBanner = "true";
    Object.assign(banner.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: "2147483646",
      width: "300px",
      border: "1px solid #bfdbfe",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.96)",
      boxShadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
      color: "#0f172a",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      lineHeight: "1.45",
      padding: "12px",
      pointerEvents: "none",
    });
    banner.textContent = `Sprint 9 · Iteracion 6\nEscenario: ${scenario.scenario}\nRol: ${scenario.role}\nSede: ${scenario.branch}\nPaso: ${scenario.step}`;
    if (!existing) {
      document.documentElement.appendChild(banner);
    }
  }, data);
}

export async function removeQaScenarioBanner(page: Page) {
  if (!isVisualMode()) {
    return;
  }

  await page.evaluate(() => {
    document.querySelector("[data-qa-scenario-banner]")?.remove();
  });
}
