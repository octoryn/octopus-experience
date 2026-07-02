/**
 * The `events/0` protocol — the ONLY external way into Project Memory.
 *
 * A producer (a CI job, a code host, an agent, a coordination substrate) emits a
 * signed bundle of FACTUAL EVENTS: things that happened, with an actor, a time,
 * a producer-native `kind`, opaque references, and an opaque body. That is all.
 *
 * Producers MUST NOT emit Project Memory's ontology — no issues, decisions,
 * evidence nodes, causal edges (`addresses`/`resolves`/`implements`), evidence
 * `stance`, or trust state. Those are MEANING, and meaning is derived by the
 * consumer. Project Memory alone turns events into that graph (see distill.ts).
 *
 * This reverses the earlier `provenance/0` bundle, which leaked PM's ontology
 * onto the wire and even performed causal inference in the producer. See
 * docs/adr/0001-events-not-ontology.md.
 *
 * Signing uses Ed25519 (node:crypto, no third-party dep) and covers the WHOLE
 * envelope including `protocol` — so the protocol tag itself cannot be swapped.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

export const PROTOCOL_VERSION = "events/0" as const;

/** A producer, identified by an Ed25519 public key rather than a free string. */
export interface Actor {
  id: string;
  /** base64 of the DER/SPKI-encoded Ed25519 public key */
  publicKey: string;
}

/**
 * One thing that happened. Everything here is a FACT. `kind` is the producer's
 * own vocabulary and is opaque to the protocol; `refs` are opaque pointers to
 * artifacts/entities (a commit sha, a task key, a URL); `body` is an opaque
 * producer payload the protocol never interprets. There is deliberately no
 * field for a node type, an edge, a relation, a stance, or a trust level.
 */
export interface FactualEvent {
  kind: string;
  /** producer-native id for the thing this event is about (drives idempotency) */
  id?: string;
  at?: number;
  actor?: string;
  /** opaque typed pointers, e.g. { risk: "R1", commit: "9f2a" } */
  refs?: Record<string, string>;
  /** sha256 of the referenced artifact/content, if the producer has one */
  contentHash?: string;
  /** opaque producer payload (title, rationale, outcome, severity, ...) */
  body?: Record<string, unknown>;
}

export interface EventBundle {
  protocol: typeof PROTOCOL_VERSION;
  issuer: Actor;
  issuedAt: number;
  events: FactualEvent[];
  /** base64 Ed25519 over canonicalize({protocol, issuer, issuedAt, events}) */
  signature?: string;
}

export interface Keypair {
  actor: Actor;
  /** PKCS8 PEM — keep private */
  privateKey: string;
}

export interface VerifyResult {
  valid: boolean;
  issuer: Actor;
  reason?: string;
}

/** Deterministic JSON: object keys sorted recursively, so signatures are stable. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** sha256 hex of the canonical form — a stable content id. */
export function hashContent(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function generateActor(id: string): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    actor: { id, publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64") },
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

/** The exact bytes signed/verified — the FULL envelope, protocol tag included. */
function signingBytes(bundle: Omit<EventBundle, "signature">): Buffer {
  return Buffer.from(
    canonicalize({
      protocol: bundle.protocol,
      issuer: bundle.issuer,
      issuedAt: bundle.issuedAt,
      events: bundle.events,
    }),
  );
}

export function signBundle(
  events: FactualEvent[],
  keypair: Keypair,
  issuedAt: number,
): EventBundle {
  const unsigned: Omit<EventBundle, "signature"> = {
    protocol: PROTOCOL_VERSION,
    issuer: keypair.actor,
    issuedAt,
    events,
  };
  const signature = cryptoSign(null, signingBytes(unsigned), createPrivateKey(keypair.privateKey)).toString("base64");
  return { ...unsigned, signature };
}

export function verifyBundle(bundle: EventBundle): VerifyResult {
  const issuer = bundle.issuer;
  if (bundle.protocol !== PROTOCOL_VERSION) {
    return { valid: false, issuer, reason: `unsupported protocol "${bundle.protocol}" (expected ${PROTOCOL_VERSION})` };
  }
  if (!bundle.signature) return { valid: false, issuer, reason: "unsigned" };
  try {
    const pub = createPublicKey({ key: Buffer.from(issuer.publicKey, "base64"), format: "der", type: "spki" });
    const valid = cryptoVerify(null, signingBytes(bundle), pub, Buffer.from(bundle.signature, "base64"));
    return { valid, issuer, reason: valid ? undefined : "signature mismatch" };
  } catch (err) {
    return { valid: false, issuer, reason: `bad key or signature: ${(err as Error).message}` };
  }
}
