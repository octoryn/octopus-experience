/**
 * The Provenance Bundle protocol (provenance/0) — the ONLY sanctioned way another
 * system feeds Project Memory. It is a wire format, not a shared library: any
 * producer (a Blackboard export, a GitHub Action, a CI job, another agent) emits
 * a signed JSON bundle conforming to docs/protocol.md, and Project Memory ingests
 * it without knowing anything about the producer's storage or code.
 *
 * Crucial stance: a bundle carries *evidence and proposals*, never *trust*. Trust
 * is computed by each consumer from the evidence. Signatures make the evidence
 * tamper-evident and attributable; they do not make it "true".
 *
 * Signing uses Ed25519 from node:crypto — no third-party crypto dependency.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import type { EdgeInput, EvidenceInput, NodeInput } from "./memory.js";
import type { Trace } from "./distill.js";

export const PROTOCOL_VERSION = "provenance/0" as const;

/** A producer, identified by an Ed25519 public key rather than a free string. */
export interface Actor {
  id: string;
  /** base64 of the DER/SPKI-encoded Ed25519 public key */
  publicKey: string;
}

/** What a bundle proposes: structured nodes/edges/evidence, plus outcome traces. */
export interface BundlePayload {
  nodes?: NodeInput[];
  edges?: EdgeInput[];
  evidence?: EvidenceInput[];
  traces?: Trace[];
}

export interface ProvenanceBundle {
  protocol: typeof PROTOCOL_VERSION;
  issuer: Actor;
  issuedAt: number;
  payload: BundlePayload;
  /** base64 Ed25519 signature over canonicalize({issuer, issuedAt, payload}) */
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

/** sha256 hex of the canonical form — a stable content id for evidence/dedup. */
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

function signingBytes(issuer: Actor, issuedAt: number, payload: BundlePayload): Buffer {
  return Buffer.from(canonicalize({ issuer, issuedAt, payload }));
}

export function signBundle(
  payload: BundlePayload,
  keypair: Keypair,
  issuedAt: number,
): ProvenanceBundle {
  const signature = cryptoSign(
    null,
    signingBytes(keypair.actor, issuedAt, payload),
    createPrivateKey(keypair.privateKey),
  ).toString("base64");
  return { protocol: PROTOCOL_VERSION, issuer: keypair.actor, issuedAt, payload, signature };
}

export function verifyBundle(bundle: ProvenanceBundle): VerifyResult {
  const issuer = bundle.issuer;
  if (bundle.protocol !== PROTOCOL_VERSION) {
    return { valid: false, issuer, reason: `unknown protocol ${bundle.protocol}` };
  }
  if (!bundle.signature) return { valid: false, issuer, reason: "unsigned" };
  try {
    const pub = createPublicKey({
      key: Buffer.from(issuer.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const valid = cryptoVerify(
      null,
      signingBytes(issuer, bundle.issuedAt, bundle.payload),
      pub,
      Buffer.from(bundle.signature, "base64"),
    );
    return { valid, issuer, reason: valid ? undefined : "signature mismatch" };
  } catch (err) {
    return { valid: false, issuer, reason: `bad key or signature: ${(err as Error).message}` };
  }
}
