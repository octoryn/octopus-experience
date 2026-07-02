# Inbound notice — Blackboard has rejected `feat/provenance-export`

**From:** octopus-blackboard (awareness substrate)
**To:** octopus-experience / Project Memory
**Date:** 2026-07-02
**Status:** FYI + review request. No action required of Blackboard.

---

## What happened

Blackboard reviewed a branch, `feat/provenance-export`, that made Blackboard a
**producer** of your `provenance/0` bundles. Blackboard has **rejected and deleted
that branch.** It will not be merged.

## Why Blackboard rejected it

The branch exported a **reasoning ontology** — `issue` / `decision` / `task` /
`evidence` nodes, `resolves` / `addresses` / `implements` / `supersedes` edges,
`supports` / `contradicts` stances, an `intent` field, and `source: "inferred"`
causal edges — instead of Blackboard's own **factual event stream**.

Concretely, the rejected code *manufactured* claims no agent ever recorded: it
synthesized `addresses` edges tagged `inferred`, and reclassified reviews into
`supports` / `contradicts` stances. That is Blackboard **interpreting** work.

This violates Blackboard's first principle:

> **Capture, don't interpret.**

Blackboard is an awareness substrate. It records facts (events, actors, times,
artifacts, hashes, signatures, order) and exposes them. It does not decide what
they *mean*. A capture layer that signs its own causal guesses has stopped being a
capture layer.

## The important implication for Project Memory

This is not only Blackboard's problem. Your `provenance/0` wire format is
**ontology-shaped**, and your own spec says so:

- `docs/protocol.md`: *"These mirror Project Memory's ingestion inputs."*
- `src/protocol.ts`: the payload is `nodes` / `edges` / `evidence` / `traces`,
  i.e. PM's node/edge/evidence graph vocabulary.

If the protocol asks producers to emit PM-shaped causal graphs, then **every
producer is pushed to interpret on PM's behalf** — a CI job, a code host, an issue
tracker, an agent, Blackboard. Each one ends up guessing at issues, decisions, and
causal edges it has no authority to assert. The interpretation leaks *out* of PM
and *into* every producer. That is backwards.

**Project Memory should not expect producers to emit PM-shaped causal graphs.**

## The boundary we're proposing

> **Protocols transport facts. Consumers derive meaning.**

A **producer-neutral** protocol should transport **facts only**:

- events
- actors
- timestamps
- artifacts
- references
- hashes
- signatures
- timeline / order

Project Memory should derive **meaning** itself, from those facts:

- issues
- decisions
- evidence
- hypotheses
- trusted edges
- stale / refuted states
- why-chains

Under this split, the same factual bundle feeds PM (which computes causal trust),
an audit system (which computes compliance), and an analytics system (which
computes metrics) — none of them coupled, and **no producer forced to think in
PM's ontology.** This is strictly stronger than the goal your own spec already
states ("a bundle carries evidence and proposals, never trust"): the cleaner line
is that a bundle carries **facts**, and *proposals/edges/stances are a consumer's
derivation*, not a producer's output.

## The ask

Please review, on the Experience side:

1. Is `provenance/0` **too ontology-shaped**? The node/edge/evidence/stance/intent
   graph (`docs/protocol.md`, `src/protocol.ts`, and the `NodeInput` / `EdgeInput`
   / `EvidenceInput` / `Trace` types in `src/memory.ts` / `src/distill.ts`) is a
   *causal-proposal* bundle, not a *factual-event* bundle.
2. Should it be **renamed / redesigned** as a **signed factual event bundle**
   (facts + attribution + order) rather than a **causal proposal bundle**? PM
   would then run its existing distill / lifecycle / why logic to *derive* nodes,
   edges, and trust from the facts — which is where that logic belongs anyway.

This keeps every repo independent through a stable protocol, but moves the
ontology to the only place that legitimately owns it: the consumer that reasons.

## Two hard constraints from Blackboard's side

- **Do not restore the deleted Blackboard branch.** (`feat/provenance-export` is
  gone by design; the review conclusion was REJECT.)
- **Do not make Blackboard emit issue / decision / evidence graphs.** If a factual
  event bundle is specified, Blackboard can revisit being a producer of *facts* —
  never of interpretations.

---

# 中文 — Blackboard 已拒绝 `feat/provenance-export`

**发件方:** octopus-blackboard(感知底座)
**收件方:** octopus-experience / Project Memory
**日期:** 2026-07-02
**性质:** 知会 + 评审请求。Blackboard 侧无需任何改动。

## 发生了什么

Blackboard 评审了一个分支 `feat/provenance-export`,该分支让 Blackboard 成为你们
`provenance/0` 包的**生产者**。Blackboard 已经**拒绝并删除**了这个分支,不会合并。

## 为什么拒绝

这个分支导出的是一套**推理本体(reasoning ontology)**——`issue` / `decision` /
`task` / `evidence` 节点,`resolves` / `addresses` / `implements` / `supersedes`
边,`supports` / `contradicts` 立场,`intent` 字段,以及标着 `source: "inferred"`
的因果边——而不是 Blackboard 自己的**事实事件流**。

具体来说,被拒代码**凭空造出**了没人记录过的断言:它合成了标为 `inferred` 的
`addresses` 边,还把 review 重新判定成 `supports` / `contradicts` 立场。这是
Blackboard 在**解释**工作。

这违反了 Blackboard 的第一原则:

> **只记录,不解释(Capture, don't interpret)。**

Blackboard 是感知底座:它记录事实(事件、actor、时间、产物、哈希、签名、顺序)并
暴露出来,但不判定它们**意味着什么**。一个会给自己的因果猜测签名的记录层,就已经
不再是记录层了。

## 对 Project Memory 的重要影响

这不只是 Blackboard 的问题。你们的 `provenance/0` 线格式是**本体导向的**,而且你们
的规范自己就承认了:

- `docs/protocol.md`:*"These mirror Project Memory's ingestion inputs."*
- `src/protocol.ts`:payload 是 `nodes` / `edges` / `evidence` / `traces`,即 PM 的
  节点/边/证据图词汇。

如果协议要求生产者输出 PM 形状的因果图,那么**每个生产者都被迫替 PM 做解释**——CI、
代码托管、issue 追踪、agent、Blackboard 都一样。每一个都会去猜它无权断言的 issue、
decision 和因果边。解释从 PM **漏了出去**,渗进每个生产者。这是反的。

**Project Memory 不应指望生产者输出 PM 形状的因果图。**

## 我们提出的边界

> **协议传输事实;消费者推导意义。**

一个**生产者中立**的协议应只传输**事实**:

- 事件 / actor / 时间戳 / 产物 / 引用 / 哈希 / 签名 / 时间线顺序

Project Memory 应自己从这些事实中**推导意义**:

- issues / decisions / evidence / 假设 / trusted 边 / stale·refuted 状态 / why 链

这样,同一份事实包可以同时喂给 PM(算因果信任)、审计系统(算合规)、分析系统(算
指标),彼此不耦合,**也没有任何生产者被迫用 PM 的本体去思考**。这比你们规范里已有
的目标("bundle 只携带证据与提案,不携带信任")更进一步:更干净的界线是——bundle
携带**事实**,而提案/边/立场是**消费者的推导**,不是生产者的输出。

## 请求

请 Experience 侧评审:

1. `provenance/0` 是否**过于本体导向**?现在的 节点/边/证据/立场/intent 图
   (`docs/protocol.md`、`src/protocol.ts`,以及 `src/memory.ts` / `src/distill.ts`
   里的 `NodeInput` / `EdgeInput` / `EvidenceInput` / `Trace` 类型)是一个**因果提案
   包**,不是**事实事件包**。
2. 是否应**改名 / 重新设计**为一个**签名的事实事件包**(事实 + 归属 + 顺序),而不是
   **因果提案包**?PM 随后用它已有的 distill / lifecycle / why 逻辑,从事实里**推导**
   出节点、边和信任——那些逻辑本来就该待在这里。

这样既让各仓库通过稳定协议保持独立,又把本体放回唯一合法拥有它的地方:那个做推理的
消费者。

## Blackboard 侧的两条硬约束

- **不要恢复已删除的 Blackboard 分支。**(`feat/provenance-export` 是按评审结论
  REJECT 有意删除的。)
- **不要让 Blackboard 输出 issue / decision / evidence 图。** 如果将来定义了一个
  事实事件包,Blackboard 可以重新考虑做**事实**的生产者——但绝不做解释的生产者。
