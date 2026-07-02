#!/usr/bin/env node
/**
 * Project Memory MCP server.
 *
 * Tools mirror the discipline: agents `remember` work (proposing edges) and add
 * `evidence`; the system decides trust. `why` reconstructs causality. Trust is
 * never asserted by the caller — only proposed and then defended.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ProjectMemory } from "./memory.js";

const nodeTypes = ["issue", "decision", "task", "evidence"] as const;
const relations = ["resolves", "addresses", "implements", "supersedes", "relates"] as const;
const sources = ["observed", "inferred", "claimed"] as const;
const stances = ["supports", "contradicts"] as const;
const evidenceKinds = [
  "commit", "diff", "test", "benchmark", "pr", "review", "message", "session", "attestation",
] as const;

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

export function buildServer(memory: ProjectMemory): McpServer {
  const server = new McpServer({ name: "octopus-experience", version: "0.3.0" });

  server.tool(
    "remember",
    "Record work as memory. Create issue/decision/task/evidence nodes and propose causal edges between them. Edges are NOT trusted on your say-so — they become trusted only once defending evidence (test/benchmark/review/attestation) backs the stated intent. Use `key` to cross-reference nodes/edges within one call.",
    {
      nodes: z
        .array(
          z.object({
            key: z.string().optional(),
            type: z.enum(nodeTypes),
            title: z.string(),
            body: z.string().optional(),
            evidenceKind: z.enum(evidenceKinds).optional(),
            ref: z.string().optional(),
          }),
        )
        .optional(),
      edges: z
        .array(
          z.object({
            key: z.string().optional(),
            from: z.string(),
            to: z.string(),
            relation: z.enum(relations),
            intent: z.string().optional(),
            source: z.enum(sources).optional(),
          }),
        )
        .optional(),
      evidence: z
        .array(
          z.object({
            evidence: z.string(),
            target: z.string(),
            targetType: z.enum(["edge", "node"]).optional(),
            stance: z.enum(stances).optional(),
          }),
        )
        .optional(),
      actor: z.string().optional(),
    },
    async (args) => {
      const r = memory.remember(args);
      const lines = [
        ...r.nodes.map((n) => `${n.id}  ${n.type}  "${n.title}"`),
        ...r.edges.map(
          (e) => `${e.id}  ${e.from} -${e.relation}-> ${e.to}  [${e.state}]`,
        ),
      ];
      return text(lines.join("\n") || "(nothing recorded)");
    },
  );

  server.tool(
    "why",
    "Reconstruct the causal chain behind a task/issue/decision: why does the code look this way today? Target is an id (e.g. TASK-3) or free text matched to the best node. Walks trusted evidence by default; set history=true to also see superseded and refuted edges.",
    {
      target: z.string(),
      history: z.boolean().optional(),
    },
    async ({ target, history }) => text(memory.explain(target, { history })),
  );

  server.tool(
    "search",
    "Find nodes by text. Retrieval, not explanation — use `why` to understand causality.",
    {
      query: z.string(),
      type: z.enum(nodeTypes).optional(),
    },
    async ({ query, type }) => {
      const hits = memory.search(query, type);
      return text(
        hits.map((n) => `${n.id}  ${n.type}  "${n.title}"`).join("\n") ||
          "(no matches)",
      );
    },
  );

  server.tool(
    "add_evidence",
    "Attach an existing evidence node to an edge (or node) as supporting or contradicting. This is how an edge earns — or loses — trust. Returns the edge's resulting state.",
    {
      evidence: z.string(),
      target: z.string(),
      targetType: z.enum(["edge", "node"]).optional(),
      stance: z.enum(stances).optional(),
      actor: z.string().optional(),
    },
    async (args) => {
      const state = memory.addEvidence(args);
      return text(state ? `${args.target} -> [${state}]` : "attached to node");
    },
  );

  server.tool(
    "attest",
    "Record a human vouch for an edge, attributed to `actor`. Over MCP this is an UNSIGNED attestation: it is logged as a claim but does NOT by itself promote the edge to trusted, because it isn't cryptographically attributable. A signed, trust-promoting attestation must arrive via a signed Provenance Bundle (ingest_bundle).",
    {
      edge: z.string(),
      actor: z.string(),
      note: z.string().optional(),
    },
    async ({ edge, actor, note }) =>
      text(`${edge} -> [${memory.attest(edge, actor, note)}]  (unsigned claim)`),
  );

  server.tool(
    "verify",
    "Re-confirm that a prescription still applies today. Resets the decay clock and revives a stale edge to trusted.",
    { edge: z.string() },
    async ({ edge }) => text(`${edge} -> [${memory.verify(edge)}]`),
  );

  server.tool(
    "observe",
    "Distill raw work traces (commits, tests, benchmarks, reviews) into memory automatically. Commits/PRs that reference known nodes create observed provenance edges; test/benchmark/review outcomes attach as supporting or contradicting evidence, promoting hypotheses to trusted or refuting them. Nothing is fabricated as trusted. This is how memory accrues without anyone writing it by hand.",
    {
      traces: z.array(
        z.object({
          kind: z.enum(evidenceKinds),
          ref: z.string().optional(),
          title: z.string(),
          actor: z.string().optional(),
          mentions: z.array(z.string()).optional(),
          outcome: z.enum(["pass", "fail"]).optional(),
          targetEdge: z.string().optional(),
        }),
      ),
    },
    async ({ traces }) => {
      const r = memory.distill(traces);
      const head =
        `nodes:${r.createdNodes} edges:${r.createdEdges} evidence:${r.attachedEvidence} ` +
        `transitions:${r.transitions.length}`;
      return text([head, ...r.log].join("\n"));
    },
  );

  server.tool(
    "ask",
    "Ranked recall across issues/decisions/tasks for a topic, each annotated with how much it is currently trusted. Retrieval with trust attached; use `why` for a full causal chain.",
    { query: z.string() },
    async ({ query }) => text(memory.askText(query)),
  );

  server.tool(
    "digest",
    "A lessons brief on a topic: what we currently trust, what has gone stale, what was superseded, and — uniquely — the dead ends we refuted so they are not retried.",
    { topic: z.string() },
    async ({ topic }) => text(memory.digestText(topic)),
  );

  server.tool(
    "ingest_bundle",
    "Ingest a signed Provenance Bundle — the open, cross-project protocol for feeding memory. Rejects bundles whose signature does not verify (pass requireSignature:false to accept an unsigned bundle, whose evidence then stays INERT for trust). Evidence is stamped with the issuer; nothing is trusted merely because it was ingested. This is how any external system (a CI job, a code host, another agent) contributes evidence without coupling to Project Memory's internals.",
    {
      bundle: z.object({
        protocol: z.string(),
        issuer: z.object({ id: z.string(), publicKey: z.string() }),
        issuedAt: z.number(),
        payload: z.record(z.string(), z.unknown()),
        signature: z.string().optional(),
      }),
      requireSignature: z.boolean().optional(),
    },
    async ({ bundle, requireSignature }) => {
      const r = memory.ingestBundle(bundle as never, { requireSignature });
      return text(
        `from ${r.issuer} verified:${r.verified}${r.reason ? ` (${r.reason})` : ""} — ` +
          `nodes:${r.remembered.nodes.length} edges:${r.remembered.edges.length} ` +
          `transitions:${r.distilled.transitions.length}`,
      );
    },
  );

  return server;
}

async function main(): Promise<void> {
  const memory = new ProjectMemory();
  const server = buildServer(memory);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run only when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
