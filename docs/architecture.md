# Architecture

Project Memory is a small pipeline with a strict middle, fed only through an open
protocol — never by reaching into another system's storage.

```
   any producer (CI, code host, agent, Blackboard, ...)
             │  emits a SIGNED bundle of FACTS — events/0 (docs/protocol.md)
             │  { kind, refs, body } — never issues/decisions/edges/trust
   ┌─────────▼──────────┐
   │  ingestBundle()     │   verify signature; reject non-events/0 outright
   │  src/protocol.ts    │
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │  Interpretation     │   facts → issues/decisions/evidence + inferred edges,
   │  src/distill.ts     │   at observed / hypothesis tier — never trusted.
   │  (PM ALONE)         │   ALL meaning is assigned here, nowhere else.
   └─────────┬──────────┘
   ┌─────────▼──────────┐
   │  The graph + the    │   nodes (issue/decision/task/evidence),
   │  constitution       │   edges, evidence links → SQLite ledger
   │  lifecycle.ts       │   trust recomputed on read
   └─────────┬──────────┘
             │  why() / ask() / digest()
        future decisions
```

**Decoupling is a hard rule — semantic, not just lexical.** Project Memory MUST
NOT depend on any other project's database, storage, code, *or ontology*. The only
integration surface is the [`events/0` protocol](protocol.md), which carries
**facts, never meaning**. Producers never emit PM's issues/decisions/edges/trust;
PM derives all of that itself. Blackboard is one possible producer among many;
Project Memory works, and makes complete sense, even if Blackboard does not exist.

## Modules

| module | role |
| ------ | ---- |
| `src/types.ts` | the closed domain model — node/edge/evidence, the evidence tiers |
| `src/lifecycle.ts` | **the constitution**: `computeEdgeState`, decay, confidence. Pure functions, no I/O |
| `src/db.ts` | SQLite persistence — a ledger of facts, never a cache of conclusions |
| `src/memory.ts` | `ProjectMemory` — the public API (`ingestBundle` / `ingestEvents` / `why` / `ask` / `digest` / `verify` / `remember`) |
| `src/why.ts` | causal-chain reconstruction (per-path traversal) + rendering |
| `src/distill.ts` | `interpretEvents` — facts → issues/decisions/evidence + inferred edges (the sole interpreter) |
| `src/protocol.ts` | the open `events/0` fact protocol — sign / verify / canonicalize |
| `src/query.ts` | `ask` (ranked recall) and `digest` (lessons brief) |
| `src/mcp.ts` / `src/cli.ts` | the MCP server and the human CLI |

## Two invariants everything rests on

1. **Trust is recomputed, never stored.** `computeEdgeState(edge, evidence, now)`
   is a pure function. The same edge is `trusted` today and `stale` next year
   with no writes in between — decay needs no cron. This also means the store can
   be a plain append-only ledger.

2. **Only evidence creates trust.** Writers — humans, agents, distillation,
   adapters — may *propose* edges. Promotion to `trusted` happens only when a
   defending artifact backs a stated intent. That is what separates this from a
   wiki, a RAG index, or conversation memory: it cannot be talked into believing
   something.

See [edge-lifecycle.md](edge-lifecycle.md) for the state machine itself.
