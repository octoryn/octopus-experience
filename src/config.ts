/** Resolve where the memory store lives. */
import { resolve } from "node:path";

export interface StoreConfig {
  /** absolute path to the sqlite file, or ":memory:" for an ephemeral store */
  dbPath: string;
}

export function resolveConfig(
  override?: Partial<StoreConfig>,
): StoreConfig {
  if (override?.dbPath) return { dbPath: override.dbPath };
  const env = process.env.OCTOMEM_DB;
  if (env === ":memory:") return { dbPath: ":memory:" };
  if (env) return { dbPath: resolve(env) };
  return { dbPath: resolve(process.cwd(), ".octomem", "memory.db") };
}
