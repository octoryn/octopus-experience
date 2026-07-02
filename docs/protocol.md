# Provenance Bundle Protocol (`provenance/0`)

This is a **wire format**, not a library. Any system that wants to contribute to a
Project Memory graph — a CI job, a code host, an issue tracker, an agent, or
[octopus-blackboard](https://github.com/octoryn/octopus-blackboard) — emits a
signed JSON **bundle** conforming to this document. Producers and consumers share
*this spec*, never code.

> **Independent repositories. Stable protocols. Replaceable implementations.**
> Projects compose through protocols, never through implementations.

## The one rule

A bundle carries **evidence and proposals — never trust.** Trust is computed by
each consumer from the evidence, under its own policy. Signatures make evidence
tamper-evident and *attributable*; they do not make it *true*. Project Memory
computes causal trust; an audit system computes compliance; an analytics system
computes metrics — all from the same bundle, none coupled to the others.

## Document shape

```jsonc
{
  "protocol": "provenance/0",
  "issuer": {
    "id": "ci-bot",                 // stable actor handle
    "publicKey": "<base64 DER SPKI Ed25519 public key>"
  },
  "issuedAt": 1700000000000,        // epoch ms
  "payload": {
    // structured proposals (all optional):
    "nodes":    [ /* NodeInput  */ ],
    "edges":    [ /* EdgeInput  */ ],
    "evidence": [ /* EvidenceInput */ ],
    // and/or outcome traces the consumer can distil:
    "traces":   [ /* Trace */ ]
  },
  "signature": "<base64 Ed25519 signature>"
}
```

### Nodes / edges / evidence / traces

These mirror Project Memory's ingestion inputs, but they are generic and carry no
trust:

- **node**: `{ key?, type: "issue"|"decision"|"task"|"evidence", title, body?, externalKey?, evidenceKind?, ref? }`
- **edge**: `{ from, to, relation: "resolves"|"addresses"|"implements"|"supersedes"|"relates", intent?, source? }`
- **evidence link**: `{ evidence, target, targetType?, stance?: "supports"|"contradicts" }`
- **trace** (outcome signal): `{ kind, ref?, title, mentions?, outcome?: "pass"|"fail", targetEdge? }`

`externalKey` is the producer's stable id for a node (e.g. `gh:issue:12`,
`bb:decision:5`). It makes ingestion **idempotent**: re-sending a bundle updates
nothing.

## Signing

1. Build `payload`.
2. Compute the signing input: `canonicalize({ issuer, issuedAt, payload })`, where
   `canonicalize` is `JSON.stringify` with **object keys sorted recursively**.
3. `signature = base64( Ed25519_sign(privateKey, signingInput) )`.

Verification recomputes the signing input and checks the signature against
`issuer.publicKey`. Any change to issuer, timestamp, or payload invalidates it —
so does claiming a different `publicKey`.

Reference implementation: [`src/protocol.ts`](../src/protocol.ts) (Node `crypto`,
no third-party dependency).

## Consumer obligations

- **Fail closed.** Reject a bundle whose signature does not verify by default.
  Project Memory's `ingestBundle` requires a valid signature unless the caller
  explicitly opts into unsigned ingestion.
- **Unverified evidence is inert.** If an unsigned/unverifiable bundle *is*
  ingested, its evidence is recorded (for audit) but MUST NOT affect trust —
  it can neither defend an edge into `trusted` nor contradict one into
  `stale`/`refuted`. Project Memory stamps such evidence `verified: false` and
  the lifecycle engine ignores it. (Locally produced evidence — never wrapped in
  a bundle — has no `verified` flag and is trusted implicitly; that is a local
  trust domain, not wire input.)
- **`verified` means *attributable*, not *authorized*.** A valid signature only
  proves the bundle was signed by the key it carries and wasn't tampered with. It
  does NOT mean the issuer is trustworthy — anyone can self-sign. Deciding *which
  issuers to believe* (key registries, rotation, quorum, org policy) is out of
  scope for this protocol and belongs to a governance/trust layer built on top.
- **Never elevate trust from the wire.** A bundle cannot declare an edge
  `trusted`. It can only supply evidence; the consumer's own rules decide.
- **Idempotency via `externalKey`.** Consumers dedupe on it.
- **Canonical inputs only.** Do not include object keys whose value is
  `undefined` — `canonicalize` drops them, so `{a: undefined}` and `{}` hash and
  sign identically. Omit absent fields rather than setting them `undefined`.

## Versioning

The `protocol` field is `provenance/<major>`. A consumer MUST reject a major it
does not understand. New optional fields are minor, backward-compatible additions.

## Non-goals

No transport is mandated (a file, an MCP resource, stdout, HTTP all work). No key
distribution or trust-registry is specified here — deciding *which* issuers to
trust is a deployment/governance concern, deliberately left to the consumer and to
commercial layers built on top.
