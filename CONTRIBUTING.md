# Contributing

Thanks for your interest in Project Memory. It is small on purpose — one
question (*"why do we do things this way?"*) and one discipline (*every causal
edge carries provenance, or it stays a hypothesis*). Contributions that keep it
small and sharp are the most welcome.

## Getting started

```bash
npm install
npm run build
npm test          # vitest
npm run demo      # the lifecycle, end to end
npm run pipeline  # memory accruing from work traces
```

Requires Node ≥ 22.

## Ground rules

- **The constitution is load-bearing.** Changes to the edge state machine
  (`src/lifecycle.ts`) must keep [`docs/edge-lifecycle.md`](docs/edge-lifecycle.md)
  true, and must come with tests. If you change a transition, change the doc.
- **Never fabricate trust.** Distillation and adapters may only *propose* edges
  at the `observed` / `inferred` / `hypothesis` tier. Trust is earned by evidence,
  not asserted by a writer. A rule that can't ground a link must skip it and say
  so — noise is worse than nothing.
- **Facts are immutable.** Never delete or rewrite history; only trust decays.
- **Keep the ontology closed.** Three node types plus task. If you feel the urge
  to add a fourth, open an issue first — the odds are it's a query result, not a
  type.

## Before opening a PR

- `npm run typecheck` is clean.
- `npm test` passes, and new behaviour has a test.
- New public API is exported from `src/index.ts` and mentioned in the README if
  user-facing.

## Reporting bugs

Open an issue with a minimal repro — ideally a failing test in the style of
`tests/lifecycle.test.ts`. Security issues: see [SECURITY.md](SECURITY.md).
