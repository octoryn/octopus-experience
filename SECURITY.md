# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Email the maintainers (see the repository owner on GitHub) with:

- a description of the issue and its impact,
- steps to reproduce, and
- any suggested remediation.

We aim to acknowledge reports within a few days and to fix confirmed issues
promptly. Please give us reasonable time to release a fix before public
disclosure.

## Scope and data handling

Project Memory is **local-first**: it stores a SQLite database on the machine
that runs it (default `.octomem/memory.db`, or `OCTOMEM_DB`). It makes no network
calls of its own. When run as an MCP server it exposes the tools described in the
README over stdio to the connecting client only.

Be aware that:

- Node titles, bodies, intents, and evidence refs are stored verbatim. Do not put
  secrets (tokens, keys) into memory records or evidence refs.
- The Blackboard bridge opens a Blackboard database **read-only**; it never writes
  to the source board.
- Memory is an auditable ledger: records are not deleted, only superseded or
  refuted. Treat the store as retained history when handling sensitive content.
