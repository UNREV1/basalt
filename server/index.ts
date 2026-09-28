// Basalt relay server (command line): serves the built web app and relays
// end-to-end encrypted Yjs updates between devices. It stores only ciphertext.
//
//   PORT / BASALT_PORT   port to listen on (default 8787)
//   BASALT_DATA          data directory (default ./data)
//   BASALT_MAX_ROOM_MB   per-room storage cap (default 200)
//   BASALT_COMPACT_AT    ask clients to compact after this many blobs (default 300)

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBasaltServer } from "./relay.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? process.env.BASALT_PORT ?? 8787);
const dataDir = path.resolve(process.env.BASALT_DATA ?? path.join(here, "..", "data"));

const relay = createBasaltServer({
  dataDir,
  distDir: path.resolve(here, "..", "dist"),
  maxRoomBytes: Number(process.env.BASALT_MAX_ROOM_MB ?? 200) * 1024 * 1024,
  compactAt: Number(process.env.BASALT_COMPACT_AT ?? 300),
  // Claude on this computer runs the MCP server from this same checkout.
  mcp: {
    command: process.execPath,
    args: [path.resolve(here, "..", "mcp", "index.ts")],
    cacheDir: path.join(os.homedir(), ".basalt", "claude-cache"),
  },
});

relay.listen(port).then((p) => {
  console.log(`Basalt relay listening on http://localhost:${p} (data: ${dataDir})`);
});
