# The Edge Lifecycle (the constitution)

Project Memory has exactly one hard rule:

> **Every causal edge carries provenance, or it stays a hypothesis.**

Agents may *propose* a causal edge. The system *proves or downgrades* it from
evidence. `why` walks trusted edges by default and never invents causality.

## Two axes of an edge

An edge like *"DECISION-1 addresses ISSUE-1"* has two independent parts:

- **mechanism** — what actually happened (a diff made a test pass, a benchmark
  moved). Provable from artifacts.
- **intent** — *why* someone did it. Recoverable only from a `Claimed`
  statement, never provable from artifacts alone.

A **trusted** edge needs both, aligned: a stated intent *and* defending
mechanism evidence.

## Write sources

| source     | meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `observed` | the system captured it directly (commit, diff, test, message) |
| `inferred` | distillation induced it from observed traces                  |
| `claimed`  | an agent asserted intent ("I did X because Y")                 |

## Evidence tiers

- **Defending** (`test`, `benchmark`, `review`, `attestation`) — *demonstrates*
  the mechanism or a human vouches. Can promote an edge to `trusted`.
- **Aligning** (`commit`, `diff`, `pr`, `message`, `session`) — circumstantial.
  Can only raise an edge to `hypothesis` / `observed`.

## States

```
   Claimed ─────────────┐
  (intent only)          │ aligning trace
                         ▼
   Observed ───────▶  Hypothesis
 (mechanism, no intent) (intent + aligning, unproven)
        │               │            │
        │ defends       │ defends    │ contradicts (no support)
        ▼               ▼            ▼
        ┌─────────────────┐      ┌──────────┐
        │     Trusted      │      │ Refuted  │  ← negative knowledge
        │ intent+mechanism │      │  proven  │    (blocks repeat proposals)
        │  provenance      │      │  false   │
        └───┬─────────┬────┘      └──────────┘
   decay /  │         │ superseded by a newer decision
   contra   │         └───────────────┐
            ▼                          ▼
       ┌────────┐                ┌────────────┐
       │ Stale  │───replaced────▶│ Superseded │
       │ true   │                │  history   │
       │ then;  │                │  preserved │
       │ unsure │◀──re-verify────┤            │
       │  now   │────────────────▶  Trusted   │  (revival)
       └────────┘
```

| state        | rule                                                  | in default `why`?      |
| ------------ | ----------------------------------------------------- | ---------------------- |
| `claimed`    | intent only, no evidence                              | shown, not walked      |
| `observed`   | mechanism evidence, no stated intent                  | walked                 |
| `hypothesis` | intent + aligning trace, not yet defended             | shown, not walked      |
| `trusted`    | intent + defending mechanism, provenance-backed       | walked                 |
| `stale`      | was trusted; contradicted, or decayed unverified      | shown with ⚠           |
| `superseded` | explicitly replaced by a newer decision               | history mode only      |
| `refuted`    | contradicting evidence, no defense — proven false     | history mode only      |

Priority when several rules apply: `superseded` > `refuted`/`stale` (a live
contradiction) > `trusted` > `observed`/`hypothesis` > `claimed`.

## Decay applies to prescriptions, not records

- **Facts** — `resolves`, `implements`, `supersedes` edges, and all
  issue/task/evidence nodes — have confidence ≡ 1 forever. History is never
  wrong.
- **Prescriptions** — `addresses` edges (a decision's "this is the right
  answer") — decay by half every ~18 months since last verification, and drop to
  `stale` after ~12 unverified months. Re-verifying resets the clock.

This is the precise form of *"history isn't wrong; only whether it still applies
today."*

## Two deaths, not one

- **erosion** → `stale`: nobody re-verified; confidence decayed.
- **override** → `superseded`: a newer trusted decision explicitly replaced it.

`why` narrates them differently. Both preserve the record.

## Why no background job

Trust is **never stored** — `computeEdgeState` recomputes it from evidence and
`now` on every read. The same edge is `trusted` today and `stale` a year from
now with zero writes in between. See [`src/lifecycle.ts`](../src/lifecycle.ts).
