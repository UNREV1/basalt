// Prepares desktop/app/ for Electron:
//   app/dist/        the built web app (npm run build in basalt/)
//   app/server.cjs   the Basalt server (server/relay.ts) bundled into one
//                    CommonJS file, so the packaged app needs no node_modules.
//   app/mcp.cjs      the MCP server for Claude Desktop / Claude Code
//                    (mcp/index.ts), run by Basalt itself as Node
//                    (ELECTRON_RUN_AS_NODE=1).

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
// Resolved from basalt/node_modules (run `npm install` in basalt/ first).
import { build } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Files some dependencies read from disk next to their own source at run
 * time, which a single-file bundle doesn't have: inline them.
 */
function inlineRuntimeFiles() {
  return {
    name: "basalt-inline-runtime-files",
    transform(code, id) {
      // jsdom (used by @blocknote/server-util) loads its default stylesheet…
      if (id.includes("jsdom/lib/jsdom/living/css/helpers/computed-style.js")) {
        const css = fs.readFileSync(path.resolve(path.dirname(id), "../../../browser/default-stylesheet.css"), "utf8");
        const next = code.replace(
          /fs\.readFileSync\(\s*path\.resolve\(__dirname, "\.\.\/\.\.\/\.\.\/browser\/default-stylesheet\.css"\),\s*\{ encoding: "utf-8" \}\s*\)/,
          JSON.stringify(css),
        );
        if (next === code) throw new Error("jsdom changed: default-stylesheet.css is no longer read the way build.mjs expects");
        return next;
      }
      // …and resolves a worker only used for synchronous XHR, which Basalt never does.
      if (id.includes("jsdom/lib/jsdom/living/xhr/XMLHttpRequest-impl.js")) {
        return code.replace('require.resolve("./xhr-sync-worker.js")', '""');
      }
      // JSON loaded through createRequire() (css-tree) is invisible to the bundler.
      if (code.includes("createRequire(") && /require\(['"][^'"]+\.json['"]\)/.test(code)) {
        const req = createRequire(id);
        return code.replace(/require\((['"])([^'"]+\.json)\1\)/g, (_, _q, spec) => `(${fs.readFileSync(req.resolve(spec), "utf8")})`);
      }
      return null;
    },
  };
}
const root = path.resolve(here, "..");
const out = path.join(here, "app");

const skipWeb = process.argv.includes("--skip-web");
if (!skipWeb) {
  console.log("• Building the web app…");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log("• Bundling the server…");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  publicDir: false,
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: path.join(root, "server", "relay.ts"),
    outDir: out,
    emptyOutDir: false,
    minify: false,
    target: "node20",
    rollupOptions: {
      // ws optionally uses these native add-ons when installed; it works without them.
      external: ["bufferutil", "utf-8-validate"],
      output: { format: "cjs", entryFileNames: "server.cjs" },
    },
  },
});

console.log("• Bundling the MCP server…");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  publicDir: false,
  plugins: [inlineRuntimeFiles()],
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: path.join(root, "mcp", "index.ts"),
    outDir: out,
    emptyOutDir: false,
    minify: false,
    target: "node20",
    rollupOptions: {
      external: ["bufferutil", "utf-8-validate", "canvas"],
      output: { format: "cjs", entryFileNames: "mcp.cjs", codeSplitting: false },
    },
  },
});

console.log("• Copying the web app…");
fs.cpSync(path.join(root, "dist"), path.join(out, "dist"), { recursive: true });

// Sanity checks: the server bundle exposes its factory, and the MCP bundle
// runs on its own (--help exits 0 without touching the network).
const mod = createRequire(import.meta.url)(path.join(out, "server.cjs"));
if (typeof mod.createBasaltServer !== "function") throw new Error("server.cjs is missing createBasaltServer");
execSync(`"${process.execPath}" "${path.join(out, "mcp.cjs")}" --help`, { stdio: "ignore", cwd: out });
console.log("✓ desktop/app is ready");
