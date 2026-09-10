# P3 执行规格 — host 路由、任务状态机与执行器迁移

> 派发依据。执行者按此实施，主智能体按 §5 验收。
> 制定：2026-09-11 · 上游基线：`docs/baseline/host.md`（**逐条对照的依据**）、`docs/feature-baseline.md`
> **前置**：P2 完成（`fs-utils`、`book-store`、`book-index`、`issues`、`task-utils`、`prompt-loader`、abilities 已是 TS 且四门禁绿）。

---

## 1. 目标

把 host 入口与执行链路迁移为 TypeScript：`src/host/index.js`（494 行，11 条路由 + 任务状态机 + 能力分派 + 执行器装配）、`gen-executor.js`、`translate-executor.js`。

**这是整个迁移中风险最高的一段**：它承载 `/api/fs/*` 的对外契约（红线 2「功能不变铁律」的核心）。

---

## 2. 铁律（本阶段尤其严格）

1. **路由契约逐字保留**：11 条路由的入参校验、出参形状、错误码与触发条件，逐条对照 `docs/baseline/host.md` §A 的路由全表。特别注意三个反直觉处：
   - `GET /root`、`GET /tree` 的响应**没有 `ok` 字段**；
   - `GET /gen-status` 未命中时返回 **HTTP 200** + `{ok:false,error:'task not found',task:null}`；
   - 越权统一 400 `path escapes workspace root`（由 `fs-utils.resolveIn` 的 `statusCode` 映射）。
2. **状态机逐字保留**：4 态（`pending`/`running`/`success`/`error`）、2 终态、**11 个迁移点**（`baseline/host.md` §B）。含 `setImmediate` 启动、占位 pending → 补 `docRel`、`sweepGenTasks` 兜底。
3. **超时四口径不变**：任务 10min（`withTimeout` 竞速 + sweep）、sweep 阈值 10min、任务记录 TTL 10min、前端轮询 5min。计时器保持 `unref`。
4. **上限五项不变**：body 10MB→413（含 `req.destroy()`）、read 2MB、任务容量 100、`/gen-status` 列表 20。
5. **副作用面不变**：`baseline/host.md` §E 列出的 9 类写盘位置与 `GET /tree` 的隐式建桶副作用**必须保留**（包括它的"读接口也有写副作用"这一既有行为）。
6. **G-1~G-11 保留**（`feature-baseline.md` §4）：尤其 **G-1 `/delete` 无 path 校验可删根**、G-2 `gen-doc` 的 kind 白名单含 `translate`。**不得顺手补校验**——那会改变行为契约。
7. **`__fsTest` 仍只在 `NODE_ENV === 'test'` 挂载**。
8. **不动迁移源**；**不 git commit**（主智能体验收后统一提交）。

---

## 3. 派发单元

### P3-A 路由层

| 内容 | 依据 | 要点 |
|---|---|---|
| `/api/fs` prefix 路由注册 + `seg` 解析 | `host.md` §A | 宿主 prefix 语义为 `=== p` 或 `startsWith(p + '/')` |
| POST 分支 6 条（set-root / write / mkdir / delete / gen-doc / translate） | `host.md` §A | 先读 body（10MB 上限）→ 校验 → 分派 |
| GET 分支 5 条（root / session / gen-status / tree / read） | `host.md` §A | 各自出参形状严格一致 |
| 统一 JSON 输出、无 CORS/缓存头、未捕获异常 → `err.statusCode \|\| 500` | `host.md` §A | |

### P3-B 任务状态机

| 内容 | 要点 |
|---|---|
| `genTasks: Map` 进程内表 + TTL/容量淘汰 | 重启即丢（G-9） |
| 去重键：gen 用 `kind+rel`、translate 用 `translate+rel`；命中 pending/running 复用返回 `reused:true` | 键用**原始未规范化 rel**（`'src'` 与 `'./src'` 不去重）——既有行为，保留 |
| `sweepGenTasks()` 兜底 | 无定时器，只在新增任务/测试钩子时触发（既有行为） |
| 占位 → 补 `docRel` → `setImmediate` 启动 | 顺序与失败路径逐步对齐 |

### P3-C 执行器

| 内容 | 要点 |
|---|---|
| `gen-executor` / `translate-executor` | 子 agent 编排：`createAgent` → `running` → `followup(仅 user message)` → `whenIdle()+withTimeout` → `syncIssueIndex` → 空转校验 → `verify→finalize→upsertBookIndex` → `success` → `dispose` → `invalidateDocCache` |
| 子会话配置 | `sessionId: 'fs-'+randomUUID`、`meta.cwd = <books>/session`、`agentPreset` 由 `genAgentPreset()`（`FS_GEN_PRESET` 默认 `ptc`）、**不打 `meta.origin='subagent'`** |
| 动态 import | `await import('@deepseek-ai/dsh-llm')` **必须保持动态** |
| 模型路由 | `agents.currentInitiator()` → 回退 `agentDefaultModel.currentSelection()` |

---

## 4. 与 P3 同期解决的既有待办

现插件台账的 **待办 #20「host 错误通道字典化」**（42 处上屏错误消息收进 locale）在本次迁移中一并处理：

- 迁移时**不要**再新增硬编码错误串；已存在的按 `feature-baseline.md` 的 i18n 约束处理
- 7 处 host 直取 `ZH[key]`（`task-utils`、`index.js` 各处）必须保留为字典键
- **注意**：这是"迁移"而非"改文案"，zh 文案值逐字不变

---

## 5. 验收标准

1. `npm run typecheck` / `lint` / `test` / `test:coverage` / `build` 全绿
2. **路由契约比对**：逐条对照 `docs/baseline/host.md` §A，出参形状与错误码一致（建议写脚本或用测试覆盖）
3. **状态机迁移点比对**：11 个迁移点均有测试覆盖
4. 覆盖率：**本阶段新增文件** file 级 行/函数/分支 100%
5. 并发稳定性：连跑 3 轮无失败（既有测试已用 `waitSettled`/`waitTaskRegistered` 等等待可观测信号的辅助函数，迁移后必须保留其语义）
6. 台账销账 + commit

---

## 6. 风险

- `index.js` 是本仓唯一同时承担"路由 + 状态机 + 分派 + 装配"的文件；迁移时**不得借机拆分**（D-8 行为等价），拆分会放大回归面。
- `baseline/host.md` §F 列出的 18 项迁移风险逐条检查，尤其：`import.meta.url`（TS→CJS 会失效）、动态 import、中文字符串键散落 4 处、`scope` 与 `kind` 逐值相同。
- 现插件的 `real-composition.test.js` 把 `./dsh/index.js` 焊进断言（`contracts.md` §G），迁移后须改为 `lib/`。
