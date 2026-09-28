// File-backed storage for encrypted room logs.
//
// Each room is two files in the data directory:
//   <room>.log   append-only records: [varuint seq][varuint len][bytes]
//   <room>.json  { verifier, createdAt }
// Compaction rewrites the log atomically (write temp file, then rename).

import fs from "node:fs";
import path from "node:path";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

export interface Blob {
  seq: number;
  data: Uint8Array;
}

export interface RoomMeta {
  verifier: string;
  createdAt: number;
}

export class FileStorage {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(room: string, ext: string) {
    if (!/^[a-f0-9]{16,64}$/.test(room)) throw new Error("bad room id");
    return path.join(this.dir, `${room}.${ext}`);
  }

  readMeta(room: string): RoomMeta | null {
    try {
      return JSON.parse(fs.readFileSync(this.file(room, "json"), "utf8"));
    } catch {
      return null;
    }
  }

  writeMeta(room: string, meta: RoomMeta) {
    fs.writeFileSync(this.file(room, "json"), JSON.stringify(meta));
  }

  readLog(room: string): Blob[] {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(this.file(room, "log"));
    } catch {
      return [];
    }
    const blobs: Blob[] = [];
    const d = decoding.createDecoder(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    try {
      while (decoding.hasContent(d)) {
        const seq = decoding.readVarUint(d);
        const data = decoding.readVarUint8Array(d);
        blobs.push({ seq, data: data.slice() });
      }
    } catch {
      // A torn final record (crash mid-append) is dropped; earlier ones are intact.
      console.warn(`[storage] truncated log for room ${room}, kept ${blobs.length} records`);
    }
    return blobs;
  }

  private encode(blobs: Blob[]): Uint8Array {
    const e = encoding.createEncoder();
    for (const b of blobs) {
      encoding.writeVarUint(e, b.seq);
      encoding.writeVarUint8Array(e, b.data);
    }
    return encoding.toUint8Array(e);
  }

  append(room: string, blob: Blob) {
    fs.appendFileSync(this.file(room, "log"), this.encode([blob]));
  }

  rewrite(room: string, blobs: Blob[]) {
    const target = this.file(room, "log");
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, this.encode(blobs));
    fs.renameSync(tmp, target);
  }

  roomCount(): number {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }
}
