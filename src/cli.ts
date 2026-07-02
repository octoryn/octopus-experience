#!/usr/bin/env node
/** octomem — a thin human-facing CLI over Project Memory. */
import { Command } from "commander";
import { ProjectMemory } from "./memory.js";
import { ingestBlackboard } from "./adapters/blackboard.js";

const program = new Command();
program
  .name("octomem")
  .description("Project Memory — ask why, not just what")
  .version("0.2.0");

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
  .command("ingest-blackboard <path>")
  .description("distill an octopus-blackboard SQLite database into causal memory")
  .action((path: string) => {
    const m = new ProjectMemory();
    try {
      const r = ingestBlackboard(m, path);
      console.log(
        `ingested — issues:${r.issues} tasks:${r.tasks} decisions:${r.decisions} edges:${r.edges} evidence:${r.evidence}`,
      );
      for (const line of r.log) console.log(`  ${line}`);
    } finally {
      m.close();
    }
  });

program.parseAsync(process.argv);
