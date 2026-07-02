# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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
