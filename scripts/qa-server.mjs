import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const workspace = process.cwd();
const qaDirectory = path.join(workspace, ".qa");
const statePath = path.join(qaDirectory, "server.json");
const port = Number(process.env.QA_PORT ?? "3100");

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`El puerto ${port} ya esta ocupado.`));
    });
    socket.once("error", () => resolve());
    socket.setTimeout(1_000, () => {
      socket.destroy();
      resolve();
    });
  });
}

await assertPortAvailable();
mkdirSync(qaDirectory, { recursive: true });
console.log("[qa/runtime] server started");
const child = spawn(
  process.execPath,
  [path.join(workspace, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", String(port)],
  { cwd: workspace, env: process.env, stdio: "inherit", windowsHide: true },
);
writeFileSync(statePath, JSON.stringify({ pid: child.pid, port, workspace }, null, 2));

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log("[qa/runtime] server stopped");
  if (child.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  rmSync(statePath, { force: true });
  process.exit(exitCode);
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
child.once("exit", (code) => stop(code ?? 1));
