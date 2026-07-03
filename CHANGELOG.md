# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.6.0] — 2026-07-03

### Added

- **Defensible-reasoning eval** (`octopus-experience/eval`) — a causal-provenance
  evaluation that measures what recall benchmarks (LongMemEval, etc.) cannot:
  given facts + evidence, does the system promote the right causal edges to
  `trusted`, mark refuted dead-ends, decay stale ones, and — crucially — NOT
  re-walk a refuted dead-end (negative knowledge)? Ships a declarative `Scenario`
  format with `runEval` / `runScenario` / `renderEvalReport`, 4 reference
  scenarios (`REFERENCE_SCENARIOS`), and `docs/EVAL.md`. Exported from the new
  `octopus-experience/eval` entry point.

## [0.5.1]

### Added / changed

- **CI + Release GitHub Actions** (`.github/workflows/`): CI runs typecheck /
  build / test on push and PR; Release publishes to npm with provenance when a
  `v*` tag is pushed (uses the `NPM_TOKEN` repo secret).
- **Contact details**: maintainer Ran Tao <ran@octopusos.ai>; security reports to
  <security@octopusos.ai> (or GitHub private advisories); conduct to
  <conduct@octopusos.ai>. `package.json` author updated.
- Fixed a stale line in `SECURITY.md` that referenced the removed Blackboard
  bridge; it now describes `events/0` bundle verification.

## [0.5.0]

### Changed

- **License changed from AGPL-3.0-or-later to Apache-2.0.** More permissive; no
  copyleft or network-use obligations. `LICENSE`, `package.json`, and both READMEs
  updated. No code or behavior changes.

## [0.4.1]

### Docs / packaging

- Corrected `docs/inbound/2026-07-02-…`: it wrongly claimed Blackboard had
  "rejected and deleted" the export branch. Rewritten as an accurate resolved
  decision record — the review showed `provenance/0`-as-ingestion leaked PM's
  ontology into producers; PM accepted it and moved to `events/0` in v0.4;
  Blackboard's independent v0.2.0 tag and its fate are Blackboard's decision.
- Excluded `docs/inbound/` (internal memos) from the published npm tarball;
  added `README.zh-CN.md` and `CHANGELOG.md` to it for parity.

## [0.4.0]

The release that makes the protocol carry **facts, not meaning**. Reverses the
`provenance/0` graph bundle after an independent review ("capture, don't
interpret"). See [ADR 0001](docs/adr/0001-events-not-ontology.md).

### Changed (breaking)

- **New ingestion protocol `events/0`** — the only external entry point. Producers
  send signed *factual events* `{ kind, id?, at?, actor?, refs?, contentHash?,
  body? }`. No node types, edges, relations, `stance`, or trust on the wire.
- **`provenance/0` graph bundle retired** and rejected on sight — `ingestBundle`
  throws on any non-`events/0` protocol. No compatibility path kept (deletion over
  compatibility).
- **Interpretation moved entirely into Project Memory** (`interpretEvents` in
  `src/distill.ts`): facts → issues/decisions/evidence + inferred edges at the
  `observed`/`hypothesis` tier. Producers never infer.
- The signing envelope now covers the **whole** bundle including `protocol`.
- API: `ingestBundle(EventBundle)`, `ingestEvents(FactualEvent[])` (local, unsigned);
  removed the graph-bundle `nodes/edges/evidence` payload, `Distiller`, and `Trace`.

### Unchanged

- The constitution (trust computed not stored; facts persist; prescriptions decay;
  no evidence, no trusted edge), `why`/`ask`/`digest`, the internal
  issue/decision/evidence model (internal only, never on the wire), and the crypto.

## [0.3.0]

The release that makes cooperation a **protocol**, not a coupling.

### Added

- **Provenance Bundle protocol** (`provenance/0`, `src/protocol.ts`,
  `docs/protocol.md`): a signed JSON wire format for feeding memory from any
  external system. Ed25519 via Node `crypto` — no third-party dependency.
  `signBundle` / `verifyBundle` / `canonicalize` / `hashContent` / `generateActor`.
- **`ingestBundle`** (MCP `ingest_bundle`, CLI `ingest-bundle`, `keygen`): verify a
  bundle's signature, stamp its evidence with the issuer and a `verified` flag,
  then apply proposals and distil traces. `--require-signature` rejects
  unverifiable bundles.
- **Verifiable evidence**: evidence nodes carry `signer`, `verified`, and a
  `contentHash`; `why` shows "✓ signed by …".

### Changed

- **A human attestation now defends an edge only if it is cryptographically
  signed.** An unsigned vouch is recorded as a claim but cannot promote an edge to
  trusted — anyone could forge it.
- **Removed the Blackboard SQLite adapter.** Reading another project's database
  coupled the repositories through implementation. Blackboard (like any producer)
  now feeds Project Memory by *emitting* a signed Provenance Bundle. Project Memory
  depends on the protocol, never on Blackboard.

### Security

- **Fail closed.** `ingestBundle` (and the CLI / MCP entry points) reject a bundle
  whose signature does not verify, unless a caller explicitly opts into unsigned
  ingestion.
- **Unverified evidence is inert.** Evidence that arrives in an unverifiable
  bundle is recorded for audit but can neither promote an edge to `trusted` nor
  contradict one into `stale`/`refuted`. Locally produced evidence keeps its
  implicit local trust. (Note: a valid signature proves *attribution*, not
  *authorization* — deciding which issuers to believe is a governance layer above
  this protocol.)

### Principle

> Independent repositories. Stable protocols. Replaceable implementations.
> Projects compose through protocols, never through implementations.

## [0.2.0]

The release that makes memory a **by-product of work**.

### Added

- **Distillation** (`src/distill.ts`, MCP `observe`): turn raw work traces
  (commits, tests, benchmarks, reviews) into proposed nodes and edges. Test and
  benchmark outcomes attach as supporting/contradicting evidence, automatically
  promoting a hypothesis to `trusted` or refuting it. Nothing is ever fabricated
  as trusted; unresolved references are logged and skipped, never invented.
- **Blackboard bridge** (`src/adapters/blackboard.ts`, CLI `ingest-blackboard`):
  distill an `octopus-blackboard` database directly — risks become issues, tasks
  become tasks, decisions become decisions, and an `addresses` edge is *inferred*
  from the task a decision and a risk share; reviews become defending or
  contradicting evidence.
- **`ask`** — ranked recall across the graph, each hit annotated with its current
  trust state.
- **`digest`** — a lessons brief on a topic: what we trust, what has gone stale,
  what was superseded, and the dead ends we refuted. This is "Knowledge"
  materialised as the result of a query rather than stored as a type.
- **Idempotent ingestion**: nodes carry a stable `externalKey`; edges are unique
  per `(from, to, relation)`; evidence links dedupe. Re-running distillation or a
  Blackboard ingest only adds what is new.

### Changed

- `verify()` on a factual (non-prescriptive) edge is now a no-op — facts are
  immutable and are never re-stamped.

## [0.1.0]

Initial release — the core.

### Added

- Edge lifecycle engine (the constitution): `claimed` / `observed` /
  `hypothesis` / `trusted` / `stale` / `superseded` / `refuted`, with trust
  recomputed on read so confidence decays with no background job. Prescriptions
  decay; facts never do.
- `why` causal-chain reconstruction with a history mode.
- MCP server (`remember`, `why`, `search`, `add_evidence`, `attest`, `verify`)
  and a human CLI.
- SQLite ledger; three node types (issue/decision/evidence) plus task provenance.
- `docs/edge-lifecycle.md` — the constitution.
