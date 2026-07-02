# The `events/0` protocol

The only external way into Project Memory. A producer emits a **signed bundle of
factual events**; Project Memory derives everything else.

> **Protocols transport facts. Consumers derive meaning.**
> Independent repositories. Stable protocols. Replaceable implementations.

A producer captures *what happened*. It never sends issues, decisions, evidence
nodes, causal edges, `stance`, or trust — those are meaning, and meaning is the
consumer's. See [adr/0001-events-not-ontology.md](adr/0001-events-not-ontology.md)
for why this replaced the earlier graph bundle.

## Document shape

```jsonc
{
  "protocol": "events/0",
  "issuer":   { "id": "ci-bot", "publicKey": "<base64 DER SPKI Ed25519>" },
  "issuedAt": 1700000000000,
  "events": [
    {
      "kind": "risk",              // producer-native, opaque to the protocol
      "id": "R1",                  // producer's id for the thing (drives idempotency)
      "at": 1700000000000,
      "actor": "claude",
      "refs": { "risk": "R1" },    // opaque typed pointers (commit sha, task key, ...)
      "contentHash": "…",          // optional sha256 of the artifact
      "body": { "title": "OOM under burst" }   // opaque producer payload
    }
  ],
  "signature": "<base64 Ed25519 over canonicalize({protocol, issuer, issuedAt, events})>"
}
```

There is deliberately **no** field for a node type, an edge, a relation, a
stance, or a trust level. If a producer needs one of those to express itself, the
protocol is doing its job by refusing.

## What Project Memory does with the facts (not the producer)

Interpretation lives entirely in the consumer ([`src/distill.ts`](../src/distill.ts)).
PM maps a producer-native `kind` to its own concepts and infers edges, all at the
`observed` / `hypothesis` tier — never `trusted`:

- kinds like `risk`/`issue`/`bug` → an **issue** node
- kinds like `decision`/`adr` → a **decision** node (a referenced issue → an
  *inferred* `addresses` edge, carrying the decision's rationale as intent)
- kinds like `commit`/`task`/`pr` → a **task** node + `observed` provenance edges
- kinds like `test`/`benchmark`/`review` → **evidence**, with `outcome`
  pass/fail becoming supporting/contradicting evidence — which may then promote a
  hypothesis to `trusted`, or refute it
- anything else → captured as evidence for the record, never invented into a claim

The mapping is PM's, lives in PM, and grows without any producer changing.

## Signing

`signature = base64(Ed25519_sign(privateKey, canonicalize({protocol, issuer, issuedAt, events})))`,
where `canonicalize` is `JSON.stringify` with object keys sorted recursively. The
signed input is the **whole envelope, including the `protocol` tag**, so the tag
itself cannot be swapped. Reference implementation: [`src/protocol.ts`](../src/protocol.ts).

## Consumer obligations

- **Reject anything that isn't `events/0`.** A producer-supplied causal graph
  (the retired `provenance/0`) is refused outright.
- **Fail closed.** Reject a bundle whose signature does not verify, unless a
  caller explicitly opts into unsigned ingestion.
- **Unverified facts are inert.** If an unverifiable bundle is ingested anyway,
  its derived evidence is recorded but cannot promote or contradict any edge.
- **`verified` means *attributable*, not *authorized*.** A valid signature proves
  who signed and that nothing was tampered — not that they should be believed.
  Deciding which issuers to trust is a governance layer above this protocol.
- **Canonical inputs only.** Omit absent fields; do not set object keys to
  `undefined` (canonicalization drops them).

## Non-goals

No transport is mandated (file, MCP resource, stdout, HTTP). No key distribution
or trust registry — those are deployment/governance concerns, deliberately out of
scope.
