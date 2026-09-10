# 功能基线总表 — dsh-plugin-file-system → dsh-plugin-file-system-zc

> **本文是 P2–P5 的派发依据与「功能不遗失」的验收清单。** 三份分项基线的汇总，不含全文（全文见各分项文件）。
> 汇总日期：2026-09-11 · 迁移源冻结于 `3a3f89e`

## 1. 分项基线索引

| 分项 | 文件 | 规模 | 覆盖 |
|---|---|---|---|
| host 侧 | `docs/baseline/host.md` | — | 11 条路由全表、任务状态机 4 态/11 迁移点、四层能力对照、书库模型、副作用 9 类、18 项迁移风险 |
| client 侧 | `docs/baseline/client.md` | 261 行 | 槽位注册、UI 树与 28 个状态字段、18 项交互、持久化、72 个 i18n key 全清单、10 项不一致 |
| 契约与构建 | `docs/baseline/contracts.md` | — | package.json 逐字段、装载三件套、build.mjs 输出契约、测试基线 135 例、纯逻辑导出面 25+8+3、lint 配置 |

**功能点合计（可核对）**：路由 11 条 + 能力 4 个 + 状态机 11 迁移点 + 组件/钩子 9 个 + 状态字段 28 个 + 条件分支 15 条 + 交互 18 项 + i18n 72 键 + client 端点 8 个 + 内存缓存 5 组。

---

## 2. 必须逐字保留（红线 2 的验收清单）

**任何一个字符改变都会导致功能或行为契约漂移。**

### 2.1 身份与装载

| 项 | 值 | 出处 |
|---|---|---|
| 槽位 key / entry id / order | `conversation.view` / `'fs'` / `12` | `src/client/index.js:766-768` |
| 槽位 label | 惰性 `() => t('slotLabel')` | `src/client/index.js:769` |
| host 导出 | `name = 'fs'`；`inject = ['webServer','sandboxPolicy','sessions','agentLoop']` | `src/host/index.js:27-28` |
| client 导出 | `name = 'fs'`；`inject = ['slots']`；`apply` | `src/client/index.js:24-25,755` |
| 路由前缀 | `/api/fs`（prefix 语义：`=== p` 或 `startsWith(p + '/')`） | `src/host/index.js:470-478` |
| patch 行 | `- insert: - id: fs` + `name: <包名>` | `cordis.patch.yml:8-10` |
| client 产物包装 | `window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => {` | `scripts/build.mjs:55-62` |
| 测试钩子 | `ctx.__fsTest` **仅** `NODE_ENV === 'test'` 挂载 | `src/host/index.js:482-494` |

> **包名替换**：新插件包名为 `dsh-plugin-file-system-zc`，故 `cordis.patch.yml` 的 `name`、`build.mjs` 的 id、`__ModuleLoader__.load` 的 id、`exports` 全部改用新包名；**但槽位 id `fs`、order `12`、路由前缀 `/api/fs` 保持不变**（否则前端页签位置与既有调用方漂移）。

### 2.2 行为契约

- **11 条路由的入参校验、出参形状、错误码**（含 `{ok:false,error}` 形状、`/gen-status` 未命中仍是 HTTP 200、`GET /root|/tree` **无 `ok` 字段**）——逐条对照 `docs/baseline/host.md` §A。
- **任务状态机**：4 态（`pending`/`running`/`success`/`error`）、2 终态、11 个迁移点；去重键（gen 用 `kind+rel`、translate 用 `translate+rel`）；`reused:true` 语义。
- **超时四口径**：任务 10min（`withTimeout` 竞速 + sweep 兜底）、sweep 阈值 10min、任务记录 TTL 10min、前端轮询上限 5min（首轮延迟 800ms、之后 1500ms）。
- **上限五项**：body 10MB→413、read 2MB、源文 2MB、语种采样 8192B、任务容量 100、`/gen-status` 列表 20。
- **书库模型**：`projectKey` 可读编码（与 DSH `session-persistence-jsonl/src/format.ts` 逐字一致）、桶结构 4 层 + `index.json`、upsert 按 `源码路径` 整条替换、旧 `.book/` **只读回退**、写入恒只写新桶。
- **四层能力**：kind/prefix、产物命名与 docStem 实现、frontmatter 字段、骨架生成者、提示词模板与变量表、**工具面白名单**（L1 `['read','write']`、L2 `+glob,grep`、L3/translate `['read','write','edit']`）、收尾校验。
- **client 侧**：28 个状态字段语义、18 项交互（含「● 未保存」的出现/消失/不清除条件）、localStorage 键 `fs.ui.v1` 与 6 个落盘字段、5 组内存缓存与其失效条件。
- **i18n**：`ZH` **72 个键**的 key 与**文案值**逐字保留；host 侧 7 处直取 `ZH[key]` 亦保留。
- **`resolveIn` 越权语义**：越界抛 `statusCode 400`，`abs === root` 合法通过（**含其副作用，见 §4**）。
- **命名规则三处同步**：`computeDocStem`（`fs-utils.js:77-83`）与 `skills/file-doc/scripts/file-doc.mjs`、`skills/source-doc/scripts/source-annotate.mjs` 的 `computeName`。
- **相对路径推导层级不变**：`issues.js:21-24`、`prompt-loader.js:26-29`、`gen-executor.js:20-22` 均按「本文件所在目录」推导；`lib/` 与 `dsh/` 同为包根下一级 → 层级不变。**产物目录不得改成更深层级**（如 `dist/lib/`）。

---

## 3. 必须改变并同步的清单

| 项 | 现状 | 改为 |
|---|---|---|
| `main` / `exports["."]` / `exports["./client"]` | `./dsh/index.js` / `./dsh/client.js` | `./lib/host/index.js` / `./client/client.js` |
| `files` | `dsh` | `lib` + `client`（**`src` 必须保留**：生产态 `prompt-loader.js:26-29` 候选 2 读 `../src/host/abilities/<dir>/prompt.md`） |
| `scripts.build` | `node scripts/build.mjs`（esbuild） | tsc（host）+ tsdown（client） |
| `scripts.test:coverage` | `node --test --test-coverage-include=<3 文件> --test-coverage-lines=100 --test-coverage-functions=100` | vitest `--coverage` + `coverage.include` 收窄 + `thresholds` **lines/functions/branches 均 100** |
| `.oxlintrc.json` | `**/*.{js,mjs}`；注释「本项目无 TS 面，不引入 typescript 段」 | 加 `**/*.ts` 覆盖与 typescript 段 |
| `devDependencies` | 8 项（esbuild/oxlint/…） | 加 `typescript`、`@types/node`、`vitest`、`@vitest/coverage-v8`；esbuild 视构建方案保留或移除 |
| `types` / `typings` | 无 | 补（`profile.ts:358-360` 会读） |
| `real-composition` 测试 | `:26-28` 焊死 `./dsh/index.js` | 改为 `lib/`，并升级为**真过 Loader** 的组合测试 |
| 测试框架 | node:test（135 例，无 describe/suite） | vitest（`t.skip`→`it.skip`；`node:assert/strict` 可原样保留） |

---

## 4. 已知行为与缺陷登记（迁移期**不修**，逐字保留）

> 依据决策 D-8 / D-9 / D-10。**这些不是"待修 bug 清单"，而是"必须保持原样"的行为说明**，以免迁移者"顺手修好"造成行为漂移。
> 最终交付摘要中须显著列出，由用户决定是否另开账目。

| # | 项 | 位置 | 后果 |
|---|---|---|---|
| G-1 | **`POST /delete` 无 `path` 必填校验** | `src/host/index.js:258-262` + `fs-utils.js:148-157` | `path` 缺失时 `abs === root` 通过越权检查 → `rm(recursive, force)` **删掉整个工作区根**。`/write`、`/mkdir` 同样无校验。**暴露面限于直连 API（三条路由均无 client 调用）** |
| G-2 | `POST /gen-doc` 的 kind 白名单过宽（含 `translate`） | `registry.js:17` | `{kind:'translate', path:'<非 md>'}` 会被接受 |
| G-3 | 目录节点打开时重复请求同一 `/read` URL | `src/client/index.js:227-239` | 冗余请求 |
| G-4 | 切换文件/工作区**静默丢弃未保存编辑**（无确认） | `src/client/index.js:215-216,489` | 用户输入丢失 |
| G-5 | `refreshRoot` 失败在已有打开对象时不上屏 | `src/client/index.js:473,491,668` | 错误不可见 |
| G-6 | 拖拽中卸载 → `document` 监听残留 | `src/client/index.js:571-587` | 泄漏（jsdom 下会暴露，见 D-8 例外 b） |
| G-7 | `pollTask` 的 `setTimeout` 无 `clearTimeout` | `src/client/index.js:270,277` | 靠 `aliveRef` 短路（同 D-8 例外 b） |
| G-8 | sweep 无定时器，孤立 `running` 任务兜底可能永不触发 | `src/host/index.js:52-54,290,328` | 依赖 `withTimeout` 与前端 5min 上限收尾 |
| G-9 | 任务表为进程内 `Map`，重启即丢 | `src/host/index.js:37` | 前端收到 `task not found` |
| G-10 | 未消费 `conversation.view` owner props（`viewRequest`/`openView`/`completeViewRequest`） | `src/client/index.js:770` | 不参与 View 焦点协议 |
| G-11 | `AGENTS.md` §6 冒烟第 2 条「悬停可打开」在代码中无对应实现 | 文档与代码不符 | 迁移后应更新该文档表述，而非造一个实现 |

**可按 D-8 例外删除的死代码**（无任何引用，删除不改行为）：`cardDismissed`/`setCardDismissed`、`genStatus`、未消费的 `isMdFile`/`isBookFile`/`picker`、4 个无 JS 引用的 CSS 类（`.fs-card-actions`/`.fs-card-src`/`.fs-card-err`/`.fs-folder-gen`）、`docRelPath`（仅测试用）。

**可按 D-8 例外修正的泄漏**（须单独记账并在交付摘要列明）：G-6、G-7。

---

## 5. 迁移映射表（P2–P5 派发依据）

| 现文件 | 行数 | 目标 | 阶段 |
|---|---|---|---|
| `src/host/fs-utils.js` | 238 | `src/host/fs-utils.ts` | P2 |
| `src/host/book-store.js` | — | `src/host/book-store.ts` | P2 |
| `src/host/book-index.js` | — | `src/host/book-index.ts` | P2 |
| `src/host/issues.js` | — | `src/host/issues.ts` | P2 |
| `src/host/task-utils.js` | — | `src/host/task-utils.ts` | P2 |
| `src/host/prompt-loader.js` | — | `src/host/prompt-loader.ts` | P2 |
| `src/host/abilities/**` | 4 能力 | `src/host/abilities/**`（描述符/skeleton/doc-render 转 TS；`prompt.md` **原样保留**） | P2 |
| `src/host/gen-executor.js` / `translate-executor.js` | — | `.ts` | P3 |
| `src/host/index.js` | 494 | `src/host/index.ts` | P3 |
| `src/client/md-utils.js` | 83 | `src/client/md-utils.ts` | P4 |
| `src/client/index.js` | 771 | `src/client/index.tsx` | P4 |
| `src/shared/locale.js` | 100 | `src/shared/locale.ts` | P2 |
| `tests/*.js`（8 文件 135 例） | 2446 | `tests/*.spec.ts` | P5 |
| `skills/`（13 文件 1632 行） | — | **原样保留**（非 JS 产物，随包分发） | — |

**迁移原则**：只换语言与类型，**不拆分文件、不重命名导出、不调整内部结构**；文件行数应大致相当。任何结构性改动单独开账目。

---

## 6. 未决事项

| # | 事项 | 归属 |
|---|---|---|
| 1 | patch 行 id 是否沿用 `fs`（旧插件卸载后无冲突） | P1-B 决定 |
| 2 | client 是否改用 `.tsx` + JSX（主仓风格）还是保留 `React.createElement` | P4 决定 |
| 3 | 插件显示名与 README 品牌表述（`preset.yml` 的「文件系统」是否沿用） | P6 决定 |
