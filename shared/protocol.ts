// Wire protocol between Basalt clients and the relay server.
//
// The relay never sees plaintext: every document update and awareness
// (presence) message is encrypted client-side with the workspace key. The
// server only stores opaque, sequenced blobs per room and fans them out.

import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

export const MSG = {
  /** C→S: join a room. room, auth, since */
  JOIN: 0,
  /** S→C: one stored (encrypted) update. seq, data */
  BLOB: 1,
  /** S→C: end of history replay. lastSeq, blobCount */
  SYNCED: 2,
  /** C→S: new encrypted update to store + fan out. ref, data */
  UPDATE: 3,
  /** S→C: an UPDATE was stored. ref, seq */
  ACK: 4,
  /** both: encrypted awareness (presence) update, relayed but never stored. data */
  AWARENESS: 5,
  /** C→S: replace blobs with seq <= upTo by a single encrypted snapshot. upTo, data */
  COMPACT: 6,
  /** S→C: fatal error for this connection. message */
  ERROR: 7,
  /** S→C: another peer joined; re-announce your presence. */
  HELLO: 8,
  /** S→C: the room log is long; please send a COMPACT. */
  COMPACT_REQUEST: 9,
  /** C→S keepalive */
  PING: 10,
  /** S→C keepalive reply */
  PONG: 11,
} as const;

export type Message =
  | { type: typeof MSG.JOIN; room: string; auth: string; since: number }
  | { type: typeof MSG.BLOB; seq: number; data: Uint8Array }
  | { type: typeof MSG.SYNCED; lastSeq: number; blobCount: number }
  | { type: typeof MSG.UPDATE; ref: number; data: Uint8Array }
  | { type: typeof MSG.ACK; ref: number; seq: number }
  | { type: typeof MSG.AWARENESS; data: Uint8Array }
  | { type: typeof MSG.COMPACT; upTo: number; data: Uint8Array }
  | { type: typeof MSG.ERROR; message: string }
  | { type: typeof MSG.HELLO }
  | { type: typeof MSG.COMPACT_REQUEST }
  | { type: typeof MSG.PING }
  | { type: typeof MSG.PONG };

export function encodeMessage(msg: Message): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, msg.type);
  switch (msg.type) {
    case MSG.JOIN:
      encoding.writeVarString(e, msg.room);
      encoding.writeVarString(e, msg.auth);
      encoding.writeVarUint(e, msg.since);
      break;
    case MSG.BLOB:
      encoding.writeVarUint(e, msg.seq);
      encoding.writeVarUint8Array(e, msg.data);
      break;
    case MSG.SYNCED:
      encoding.writeVarUint(e, msg.lastSeq);
      encoding.writeVarUint(e, msg.blobCount);
      break;
    case MSG.UPDATE:
      encoding.writeVarUint(e, msg.ref);
      encoding.writeVarUint8Array(e, msg.data);
      break;
    case MSG.ACK:
      encoding.writeVarUint(e, msg.ref);
      encoding.writeVarUint(e, msg.seq);
      break;
    case MSG.AWARENESS:
      encoding.writeVarUint8Array(e, msg.data);
      break;
    case MSG.COMPACT:
      encoding.writeVarUint(e, msg.upTo);
      encoding.writeVarUint8Array(e, msg.data);
      break;
    case MSG.ERROR:
      encoding.writeVarString(e, msg.message);
      break;
    case MSG.HELLO:
    case MSG.COMPACT_REQUEST:
    case MSG.PING:
    case MSG.PONG:
      break;
  }
  return encoding.toUint8Array(e);
}

export function decodeMessage(buf: Uint8Array): Message {
  const d = decoding.createDecoder(buf);
  const type = decoding.readVarUint(d);
  switch (type) {
    case MSG.JOIN:
      return {
        type,
        room: decoding.readVarString(d),
        auth: decoding.readVarString(d),
        since: decoding.readVarUint(d),
      };
    case MSG.BLOB:
      return { type, seq: decoding.readVarUint(d), data: decoding.readVarUint8Array(d) };
    case MSG.SYNCED:
      return { type, lastSeq: decoding.readVarUint(d), blobCount: decoding.readVarUint(d) };
    case MSG.UPDATE:
      return { type, ref: decoding.readVarUint(d), data: decoding.readVarUint8Array(d) };
    case MSG.ACK:
      return { type, ref: decoding.readVarUint(d), seq: decoding.readVarUint(d) };
    case MSG.AWARENESS:
      return { type, data: decoding.readVarUint8Array(d) };
    case MSG.COMPACT:
      return { type, upTo: decoding.readVarUint(d), data: decoding.readVarUint8Array(d) };
    case MSG.ERROR:
      return { type, message: decoding.readVarString(d) };
    case MSG.HELLO:
    case MSG.COMPACT_REQUEST:
    case MSG.PING:
    case MSG.PONG:
      return { type };
    default:
      throw new Error(`Unknown message type ${type}`);
  }
}
