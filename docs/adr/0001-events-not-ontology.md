# ADR 0001 — Ingest facts (`events/0`), not a producer-supplied ontology

- Status: accepted
- Date: 2026-07-02
- Supersedes: the `provenance/0` graph bundle as an ingestion protocol

## Context

v0.3 shipped `provenance/0`: producers sent Project Memory a signed bundle whose
payload was a graph of `nodes` (`type: issue|decision|evidence`), `edges`
(`relation: addresses|resolves|implements`), and `evidence` with a `stance`.
A reference exporter even *inferred* causal edges inside the producer.

An independent review (from the Blackboard maintainer's perspective) made the
decisive argument: **"capture, don't interpret."** A producer captures reality; it
should not infer causality, invent ontology, or emit an Issue/Decision/Evidence
graph. `provenance/0` had Project Memory's ontology leaking onto the wire, and
pushed interpretation — PM's core job — into producers.

The test that settled it: *if a producer never adopts PM's concepts, is PM still
correct?* Under `provenance/0`, no — PM required producers to speak its ontology.
That means PM was not independent. Independence is semantic, not just "no shared
code": agreeing on canonical bytes while the payload is PM-shaped is still
coupling, hidden inside the ontology.

## Decision

**Protocols transport facts. Consumers derive meaning.**

- The only external ingestion wire format is **`events/0`**: a signed bundle of
  factual events. An event is `{ kind, id?, at?, actor?, refs?, contentHash?,
  body? }` — a producer-native `kind`, opaque references, and an opaque body.
- Producers MUST NOT emit issues, decisions, evidence nodes, causal edges,
  `addresses`/`resolves`/`implements`, `stance`, or trust state.
- **Project Memory alone** derives issues, decisions, evidence nodes, hypotheses,
  trusted/stale/refuted edges, and `why` chains — in `src/distill.ts`.
- The `provenance/0` graph bundle is **retired** as an ingestion protocol and is
  **rejected** on sight (`ingestBundle` throws on any non-`events/0` protocol).
  No read-only compatibility path was kept — deletion over compatibility.
- The signing envelope (Ed25519, canonical JSON) is reused and now covers the
  **whole** envelope, including the `protocol` tag.

## Consequences

- Project Memory works with *any* factual event producer, and makes complete
  sense with no specific producer in existence.
- Blackboard needs no changes: it already emits signed audit facts; PM consumes
  facts. Neither repository is upstream or downstream of the other.
- The interpretation that briefly lived in a producer's exporter now lives where
  it belongs — in PM's distiller, at the `observed`/`hypothesis` tier, promoted to
  `trusted` only by the constitution.
- The constitution is unchanged: trust is computed not stored; facts persist;
  prescriptions decay; no evidence, no trusted edge.

## What did not change

The lifecycle engine, `why`/`ask`/`digest`, the internal Issue/Decision/Evidence
model (internal — never on the wire), and the crypto primitives.
