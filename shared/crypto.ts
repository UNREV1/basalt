// End-to-end encryption for workspaces.
//
// A workspace is identified by a random 256-bit key that lives only in share
// links and on member devices. Everything the relay needs is derived from it
// one-way, so the server can route and authorise without being able to read.

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";

const te = new TextEncoder();
const NONCE_LEN = 24;

export function generateKey(): string {
  return toBase64Url(randomBytes(32));
}

export function keyBytes(key: string): Uint8Array {
  const bytes = fromBase64Url(key);
  if (bytes.length !== 32) throw new Error("Invalid workspace key");
  return bytes;
}

export function isValidKey(key: string): boolean {
  try {
    keyBytes(key);
    return true;
  } catch {
    return false;
  }
}

function derive(label: string, key: Uint8Array): Uint8Array {
  const l = te.encode(label);
  const buf = new Uint8Array(l.length + key.length);
  buf.set(l, 0);
  buf.set(key, l.length);
  return sha256(buf);
}

/** Public room id the relay routes on. */
export function roomIdForKey(key: string): string {
  return toHex(derive("basalt/room/v1", keyBytes(key))).slice(0, 40);
}

/** Proof of key knowledge sent on join; the server stores only sha256(auth). */
export function authForKey(key: string): string {
  return toHex(derive("basalt/auth/v1", keyBytes(key)));
}

export function verifierForAuth(auth: string): string {
  return toHex(sha256(te.encode(auth)));
}

export function encrypt(key: Uint8Array, plain: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_LEN);
  const sealed = xchacha20poly1305(key, nonce).encrypt(plain);
  const out = new Uint8Array(NONCE_LEN + sealed.length);
  out.set(nonce, 0);
  out.set(sealed, NONCE_LEN);
  return out;
}

export function decrypt(key: Uint8Array, box: Uint8Array): Uint8Array {
  const nonce = box.subarray(0, NONCE_LEN);
  return xchacha20poly1305(key, nonce).decrypt(box.subarray(NONCE_LEN));
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(len = 12): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = randomBytes(len);
  let id = "";
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}
