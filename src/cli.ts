#!/usr/bin/env node
/** octomem — a thin human-facing CLI over Project Memory. */
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { ProjectMemory } from "./memory.js";
import { generateActor, type ProvenanceBundle } from "./protocol.js";

const program = new Command();
program
  .name("octomem")
  .description("Project Memory — ask why, not just what")
  .version("0.3.0");

program
  .command("why <target>")
  .description("reconstruct the causal chain behind a node (id or text)")
  .option("--history", "include superseded and refuted edges")
  .action((target: string, opts: { history?: boolean }) => {
    const m = new ProjectMemory();
    try {
      console.log(m.explain(target, { history: Boolean(opts.history) }));
    } finally {
      m.close();
    }
  });

program
  .command("search <query>")
  .description("find nodes by text")
  .option("-t, --type <type>", "issue | decision | task | evidence")
  .action((query: string, opts: { type?: string }) => {
    const m = new ProjectMemory();
    try {
      const hits = m.search(query, opts.type as never);
      if (hits.length === 0) console.log("(no matches)");
      for (const n of hits) console.log(`${n.id}\t${n.type}\t${n.title}`);
    } finally {
      m.close();
    }
  });

program
  .command("verify <edge>")
  .description("re-confirm a prescription still applies (revives stale -> trusted)")
  .action((edge: string) => {
    const m = new ProjectMemory();
    try {
      console.log(`${edge} -> [${m.verify(edge)}]`);
    } finally {
      m.close();
    }
  });

program
  .command("ask <query>")
  .description("ranked recall for a topic, annotated with current trust")
  .action((query: string) => {
    const m = new ProjectMemory();
    try {
      console.log(m.askText(query));
    } finally {
      m.close();
    }
  });

program
  .command("digest <topic>")
  .description("a lessons brief: trusted, aging, superseded, and refuted dead ends")
  .action((topic: string) => {
    const m = new ProjectMemory();
    try {
      console.log(m.digestText(topic));
    } finally {
      m.close();
    }
  });

program
  .command("keygen <id>")
  .description("generate an Ed25519 actor keypair (writes <id>.actor.json)")
  .action((id: string) => {
    const kp = generateActor(id);
    const file = `${id}.actor.json`;
    writeFileSync(file, JSON.stringify(kp, null, 2));
    console.log(`wrote ${file}  (keep the privateKey secret; share only the public actor)`);
  });

program
  .command("ingest-bundle <file>")
  .description("ingest a signed Provenance Bundle (the open cross-project protocol)")
  .option("--allow-unsigned", "accept an unverifiable bundle (its evidence stays inert for trust)")
  .action((file: string, opts: { allowUnsigned?: boolean }) => {
    const bundle = JSON.parse(readFileSync(file, "utf8")) as ProvenanceBundle;
    const m = new ProjectMemory();
    try {
      const r = m.ingestBundle(bundle, { requireSignature: !opts.allowUnsigned });
      console.log(
        `ingested from ${r.issuer} — verified:${r.verified}${r.reason ? ` (${r.reason})` : ""}`,
      );
      console.log(
        `  nodes:${r.remembered.nodes.length} edges:${r.remembered.edges.length} ` +
          `distilled(nodes:${r.distilled.createdNodes} edges:${r.distilled.createdEdges} transitions:${r.distilled.transitions.length})`,
      );
      for (const line of r.distilled.log) console.log(`  ${line}`);
    } finally {
      m.close();
    }
  });

program.parseAsync(process.argv);
