#!/usr/bin/env node
/** octomem — a thin human-facing CLI over Project Memory. */
import { Command } from "commander";
import { ProjectMemory } from "./memory.js";

const program = new Command();
program
  .name("octomem")
  .description("Project Memory — ask why, not just what")
  .version("0.1.0");

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

program.parseAsync(process.argv);
