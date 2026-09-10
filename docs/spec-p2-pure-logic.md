# P2 执行规格 — host 纯逻辑迁移

> 派发依据。执行者按此实施，主智能体按 §4 验收。
> 制定：2026-09-11 · 上游基线：`docs/feature-baseline.md`、`docs/baseline/host.md`、`docs/baseline/contracts.md`
> **前置**：P1-A（工程基础）已完成且四门禁可跑。

---

## 1. 目标

把 host 侧**无副作用或副作用可隔离**的模块迁移为 TypeScript，并让**每个文件**达到行/函数/分支覆盖率 100%。

**不含**：`src/host/index.js`（路由与状态机 → P3）、`gen-executor`/`translate-executor`（→ P3）。

---

## 2. 铁律

1. **行为等价**（`feature-baseline.md` D-8）：只换语言与类型，**不拆分文件、不重命名导出、不调整内部结构、不顺手改 bug**。迁移后每个文件的行数应与源文件大致相当。
2. **导出面逐字保留**：导出名、参数顺序、默认值、返回形状一字不改。导出清单见 `docs/baseline/contracts.md` §E。
3. **契约逐字保留**：`feature-baseline.md` §2「必须逐字保留」中的每一条都适用于本阶段可见的部分（尤其 `projectKey` 可读编码、`computeDocStem`、`resolveIn` 越权语义、`renderPromptTemplate` 只认 `${name}`）。
4. **相对路径推导层级不变**：`src/host/*.ts` 与源同层级；`issues.js`、`prompt-loader.js` 的「本文件所在目录」推导必须继续成立（`lib/` 与 `dsh/` 同为包根下一级）。
5. **不引入 `any`**；确需时按主仓 `AGENTS.md:143` 写明理由。
6. **不改动迁移源任何文件**；**不 git commit**（主智能体验收后统一提交）。

---

## 3. 派发单元

### P2-A 基础层（最先，其余单元依赖它）

| 模块 | 源 | 目标 | 导出数 | 关键契约 |
|---|---|---|---|---|
| `fs-utils` | `src/host/fs-utils.js`（238 行） | `src/host/fs-utils.ts` | 25 | `projectKey` 可读编码（与 DSH `format.ts` 逐字一致）、`resolveIn` 越权抛 `statusCode 400` 且 `abs === root` 合法、`computeDocStem`、`renderPromptTemplate` 只处理 `${name}`、`GEN_SCOPE_TOOLS`、`READ_LIMIT` |
| `locale` | `src/shared/locale.js`（100 行） | `src/shared/locale.ts` | 3 | `ZH` **72 键**、`LANG`、`t(key, lang?)` 缺键 warn 并返回 key |

**验收**：`fs-utils.ts`、`locale.ts` 各自 file 级 行/函数/分支 **100%**。

### P2-B 书库层（依赖 P2-A）

| 模块 | 目标 | 关键契约 |
|---|---|---|
| `book-store` | `src/host/book-store.ts` | 桶定位、`ensureBookDirAt` 合并式补字段、`knownBookRoots` TTL 5s 且跳过 `books/session`、视图缓存 TTL 1.5s、`bestRootFor` 取最长路径、旧 `.book/` 只读回退 |
| `book-index` | `src/host/book-index.ts` | `index.json` upsert：按 `源码路径` 命中则**整条替换**、未命中 push、其它数组原样保留 |
| `issues` | `src/host/issues.ts` | `DSH_FS_ISSUES_DIR` 覆盖、`syncIssueIndex()` 读改写、`nextIssueNo` |

### P2-C 任务与提示词（依赖 P2-A）

| 模块 | 目标 | 关键契约 |
|---|---|---|
| `task-utils` | `src/host/task-utils.ts` | `TASK_TIMEOUT_MS = 10min`、`withTimeout` 竞速、计时器 `unref`、`FS_GEN_PRESET` 默认 `ptc`、`dispose` 失败仅 warn |
| `prompt-loader` | `src/host/prompt-loader.ts` | 按能力描述符 `dir`/`promptFile` 定位 `prompt.md`；**双候选目录探测**（源码直载 vs `lib/`）；`import.meta.url` 必须保持 ESM 语义 |

### P2-D 能力目录（依赖 P2-A）

| 模块 | 目标 | 说明 |
|---|---|---|
| 四能力描述符 | `src/host/abilities/{folder-doc,file-doc,source-doc,translate-doc}/index.ts` | 描述符字段逐字保留（`kind`/`dir`/`sub`/`arr`/`layer`/`scope`/`promptFile`/`docStem` + 可选钩子） |
| 确定性逻辑 | 同目录 `skeleton.ts`（L1/L2/L3）与 `doc-render.ts`（L3） | 骨架渲染、占位校验、`checkHealth` 四项自检逐字保留 |
| `registry` | `src/host/abilities/registry.ts` | `GEN_ABILITIES`/`TRANSLATE_ABILITY`/`ABILITIES`/`abilityOf` 导出名与前缀（`fsgen-`/`fstr-`）逐字保留 |
| `prompt.md` × 4 | **原样保留，不转 TS** | 非 JS 资源，随包分发；`${...}` 变量表不变 |

---

## 4. 验收标准（每单元）

1. `npm run typecheck` 通过（strict，无未说明的 `any`）
2. `npm run lint` 0 错 0 警告
3. `npm test` 全绿，且**并发连跑 3 轮无失败**（依据 `docs/testing.zh.md`）
4. `npm run test:coverage` 对**本单元新增文件** file 级 行/函数/分支 **100%**
5. `npm run build` 成功
6. **导出面 diff**：与源文件导出清单逐条比对，数量与签名一致（可脚本比对 `contracts.md` §E）
7. 台账已由主智能体销账并 commit

---

## 5. 风险提示

- **`fs-utils` 分支覆盖 88.75%（源仓库实测）**：迁移后要补到 100%，需要为 Win32 分隔符分支、`docRelPath` 等边缘路径补用例。**不得**通过 `/* v8 ignore */` 或改逻辑来回避。
- **中文字符串键散落 4 处**（`fs-utils`、`book-store`、`book-index`、`index.js` 的 `home.sets['…']`）：TS 化易改错，**逐字核对**。
- **`scope` 与 `kind` 逐值相同**（folder/file/src/translate），改名即破坏工具面收敛。
- **`docStem` 命名三处同步**（`fs-utils` + 两个技能的 `.mjs`）：本次**不改**技能脚本（它们原样保留），因此 `computeDocStem` 实现必须逐字保留。
