import { spawn } from "node:child_process";
import path from "node:path";

console.log("[qa/runtime] build started");
const next = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const currentOptions = process.env.NODE_OPTIONS ?? "";
const child = spawn(process.execPath, [next, "build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `${currentOptions} --max-old-space-size=1536`.trim() },
  stdio: "inherit",
  windowsHide: true,
});
child.once("exit", (code) => {
  if (code === 0) console.log("[qa/runtime] build finished");
  process.exit(code ?? 1);
});
