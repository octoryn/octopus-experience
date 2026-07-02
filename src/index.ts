/** Project Memory — organizational, causal memory for AI teams. */
export { ProjectMemory } from "./memory.js";
export type {
  NodeInput,
  EdgeInput,
  EvidenceInput,
  RememberInput,
  RememberResult,
  EdgeView,
} from "./memory.js";
export {
  computeEdgeState,
  confidence,
  isPrescriptive,
  isTrustedByDefault,
  isHistoryOnly,
  DEFAULT_HALF_LIFE_MS,
  DEFAULT_STALE_AFTER_MS,
} from "./lifecycle.js";
export { reconstructWhy, renderWhy } from "./why.js";
export type { WhyResult, WhyStep, WhyOptions } from "./why.js";
export { Distiller } from "./distill.js";
export type { Trace, DistillResult } from "./distill.js";
export { ask, renderAsk, digest, renderDigest } from "./query.js";
export type { AskResult, AskHit, Digest } from "./query.js";
export {
  PROTOCOL_VERSION,
  canonicalize,
  hashContent,
  generateActor,
  signBundle,
  verifyBundle,
} from "./protocol.js";
export type {
  Actor,
  BundlePayload,
  ProvenanceBundle,
  Keypair,
  VerifyResult,
} from "./protocol.js";
export * from "./types.js";
