# Project Memory（项目记忆）

**面向 AI 团队的组织级记忆。** 问的是*为什么*，而不只是*是什么*。

> Project Memory 不编造因果。它记录主张、证据，以及信任的生命周期。

> **[Octopus Core](https://github.com/octoryn) 的一部分 —— 受治理 AI 的开源基础设施栈。** 每个仓库只做一件事，沿 agent 生命周期组合：[Scout](https://github.com/octoryn/octopus-scout) · [Observe](https://github.com/octoryn/octopus-observe) · [Experience](https://github.com/octoryn/octopus-experience) · [Blackboard](https://github.com/octoryn/octopus-blackboard) · [Runtime](https://github.com/octoryn/octopus-runtime) · [Replay](https://github.com/octoryn/octopus-replay) —— [Inspect](https://github.com/octoryn/octopus-inspect) 横贯每一环做治理。整个技术栈都构建在同一个根原语之上：**[Evidence](https://github.com/octoryn/octopus-evidence)** —— 规范的、防篡改的原子，也是其余一切据以构建的根范畴。
>
> **本仓库 —— Experience · 理解：** 知识是挣来的，不是存下的。

今天，每一个 AI 会话都从零开始。对话记忆记住的是*一段聊天*，它不记得*这个仓库为什么长成今天这样*。Project Memory 就是缺失的那一层：多个 Agent、多个人、多个会话，跨越数月——让工作**不断累积，而不是每次重启**。

它是 [octopus-blackboard](https://github.com/octoryn/octopus-blackboard) 的姊妹项目：

```
工作发生
    │
    ▼
Blackboard        感知 —— “其他 Agent 在做什么？”     （证据捕获层）
    │  蒸馏
    ▼
Project Memory    学习 —— “我们为什么这样做？”         （因果信任层）
    │
    ▼
未来的决策
```

## 唯一的问题

不是“我们学到了什么？”，而是**“我们为什么这样做？”** 旗舰能力是 `why`——它**重建一条因果链**，而不是 `search`（后者只做检索）。

```
$ octomem why "Metal KV Cache"

why TASK-1  "Improve Metal KV Cache"
├─ implements → DECISION-1 "Pad conv weights to 64 bytes"  [· observed]
│     • commit EV-1 (supports) "a1b2c3 pad conv weights"
└─ resolves → ISSUE-1 "Metal compiler crashes on M1 Ultra"  [· observed]
   └─ addressed by → DECISION-3 "Pad conv weights to 128 bytes for M3"  [✓ trusted]
         • benchmark EV-4 (supports) "M3 stable at 128B"
```

## 纪律

整个产品就是一条规则：

> **每一条因果边都必须带有出处（provenance），否则它只能停留在 hypothesis。**

Agent 可以*提出*“某个 commit 解决了某个 issue”。但只有当**佐证性证据**（测试、基准、评审、或人工背书）支撑了所声明的意图时，系统才会把这条边升级为 **trusted**。没有证据，就没有可信的边——于是 `why` 是一份**可被辩护的因果记录**，而不是一台故事机。

信任有完整的生命周期：`claimed → hypothesis → trusted`，也会失去——`stale`（衰减/被质疑）、`superseded`（被更新的决策取代）、`refuted`（被证否，并作为*负知识*保留，防止 Agent 再次提出）。历史永不删除，只有信任会衰减。详见 [docs/edge-lifecycle.md](docs/edge-lifecycle.md)——这就是“宪法”。

三种稳定的节点类型——**Issue、Decision、Evidence**——外加 **Task** 作为只追加的出处锚点。“Knowledge” 刻意*不*存储，它是 `why` 查询的*结果*。没有知识图谱，没有需要学习的 ontology。

## 知识由工作沉淀，而非人工喂养

知识库一旦需要人去喂就会死。所以这里没有人写——**工作在写**。Agent 只负责*提出*，工作产生的原始轨迹负责*裁决*：

```
$ npm run pipeline    # 节选

agents propose two competing fixes (claims, unproven)
  cache fix : hypothesis   pool fix : hypothesis

work traces arrive — the system decides, not the authors
  EDGE-1: hypothesis -> trusted   (benchmark: p99 512ms -> 90ms)
  EDGE-2: hypothesis -> stale     (test: pool exhausted DB connections)

digest "latency"
  ## What we do (trusted)      • add a read-through cache
  ## Aging — re-verify         • raise the connection pool to 500
  ## Problems seen             • p99 latency spikes under load
```

一条通过的 benchmark 把一个方案升成 `trusted`，一条失败的 test 把另一个打回——**没有人写过“trusted”**。`digest` 随后把经验沉淀出来，包括我们*证否*过的死路，避免重走。

## 通过协议协作，而非实现

> **独立仓库。稳定协议。可替换实现。**

Project Memory 从不伸手去读另一个系统的存储或代码。唯一入口是一份签名的 **Provenance Bundle**(`provenance/0`,一种 JSON 线格式——见 [docs/protocol.md](docs/protocol.md))。任何生产者——CI、代码托管、Agent,或 [octopus-blackboard](https://github.com/octoryn/octopus-blackboard)——产出一个 bundle,Project Memory 验签后摄取。**假设 Blackboard 不存在,Project Memory 依然完全成立。**

bundle 承载**证据,而非信任**。签名让证据防篡改、可归属;信任仍由这里的宪法计算。特别地:一条人工 **attestation 只有在被密码学签名时才能"辩护"一条边**——未签名的背书只是任何人都能伪造的 claim。

```bash
node dist/cli.js keygen ci-bot            # -> ci-bot.actor.json (Ed25519)
node dist/cli.js ingest-bundle bundle.json   # rejects unsigned by default
node dist/cli.js digest "Metal"
```

完整流水线见 [docs/architecture.md](docs/architecture.md)。

## 安装与运行

```bash
npm install
npm run build

# 约 2 秒看完整个理念
npm run demo        # 信任生命周期
npm run pipeline    # 记忆由工作轨迹自动沉淀

# 面向人的 CLI
node dist/cli.js why "Metal KV Cache"
node dist/cli.js ask "cache"
node dist/cli.js digest "Metal"
node dist/cli.js keygen ci-bot
node dist/cli.js ingest-bundle bundle.json
```

### 作为 MCP 服务器

```jsonc
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["/绝对路径/octopus-experience/dist/mcp.js"],
      "env": { "OCTOMEM_DB": "/绝对路径/.octomem/memory.db" }
    }
  }
}
```

工具：

- `remember` —— 记录工作、提出因果边
- `observe` —— 把原始工作轨迹自动蒸馏进记忆
- `ingest_bundle` —— 摄取签名的 Provenance Bundle（开放的跨项目协议）
- `add_evidence` / `attest` —— 为边提供佐证或质疑
- `verify` —— 复活已 stale 的处方
- `why` —— 重建因果链
- `ask` —— 带信任标注的排序召回
- `digest` —— 某主题的经验简报（含被证否的死路）
- `search` —— 纯文本查找

## 状态

v0.3 —— 核心宪法（生命周期引擎、`why`）、蒸馏层、`ask` / `digest`、幂等摄取,以及开放的 **Provenance Bundle 协议**(Ed25519 签名、防篡改证据)。已测试（43 个用例）并经三轮对抗审核。路线图(都建立在协议**之上**、天然商业化):跨项目信任注册表与密钥轮换、分布式/联邦验证、企业治理与合规、托管多项目模式。

## 许可证

Apache-2.0 © Octoryn
