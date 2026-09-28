// Runs the relay server and the Vite dev server together.
import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["--watch", "server/index.ts"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", ...process.argv.slice(2)], { stdio: "inherit" }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => code && stop());
