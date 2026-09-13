# 功能基线总表 — dsh-plugin-file-system

> **本文是功能不遗失的验收清单。**
> 汇总日期：2026-09-11

## 1. 功能点合计（可核对）

路由 11 条 + 能力 4 个 + 状态机 11 迁移点 + 组件/钩子 9 个 + 状态字段 28 个 + 条件分支 15 条 + 交互 18 项 + i18n 72 键 + client 端点 8 个 + 内存缓存 5 组。

---

## 2. 必须逐字保留（红线 2 的验收清单）

**任何一个字符改变都会导致功能或行为契约漂移。**

### 2.1 身份与装载

| 项 | 值 |
|---|---|
| 槽位 key / entry id / order | `conversation.view` / `'fs'` / `12` |
| 槽位 label | 惰性 `() => t('slotLabel')` |
| host 导出 | `name = 'fs'`；`inject = ['webServer','sandboxPolicy','sessions','agentLoop']` |
| client 导出 | `name = 'fs'`；`inject = ['slots']`；`apply` |
| 路由前缀 | `/api/fs`（prefix 语义：`=== p` 或 `startsWith(p + '/')`） |
| patch 行 | `- insert: - id: fs` + `name: <包名>` |
| client 产物包装 | `window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => {` |
| 测试钩子 | `ctx.__fsTest` **仅** `NODE_ENV === 'test'` 挂载 |

> **包名**：`cordis.patch.yml` 的 `name`、构建产物的注册 id、`exports` 全部用包名 `dsh-plugin-file-system`；**槽位 id `fs`、order `12`、路由前缀 `/api/fs` 保持不变**（否则前端页签位置与既有调用方漂移）。

### 2.2 行为契约

- **11 条路由的入参校验、出参形状、错误码**（含 `{ok:false,error}` 形状、`/gen-status` 未命中仍是 HTTP 200、`GET /root|/tree` **无 `ok` 字段**）。
- **任务状态机**：4 态（`pending`/`running`/`success`/`error`）、2 终态、11 个迁移点；去重键（gen 用 `kind+rel`、translate 用 `translate+rel`）；`reused:true` 语义。
- **超时四口径**：任务 10min（`withTimeout` 竞速 + sweep 兜底）、sweep 阈值 10min、任务记录 TTL 10min、前端轮询上限 5min（首轮延迟 800ms、之后 1500ms）。
- **上限五项**：body 10MB→413、read 2MB、源文 2MB、语种采样 8192B、任务容量 100、`/gen-status` 列表 20。
- **书库模型**：`projectKey` 可读编码（与 DSH `session-persistence-jsonl/src/format.ts` 逐字一致）、桶结构 4 层 + `index.json`、upsert 按 `源码路径` 整条替换、旧 `.book/` **只读回退**、写入恒只写新桶。
- **四层能力**：kind/prefix、产物命名与 docStem 实现、frontmatter 字段、骨架生成者、提示词模板与变量表、**工具面白名单**（L1 `['read','write']`、L2 `+glob,grep`、L3/translate `['read','write','edit']`）、收尾校验。
- **client 侧**：28 个状态字段语义、18 项交互（含「● 未保存」的出现/消失/不清除条件）、localStorage 键 `fs.ui.v1` 与 6 个落盘字段、5 组内存缓存与其失效条件。
- **i18n**：`ZH` **72 个键**的 key 与**文案值**逐字保留；host 侧 7 处直取 `ZH[key]` 亦保留。
- **`resolveIn` 越权语义**：越界抛 `statusCode 400`，`abs === root` 合法通过（**含其副作用，见 §4**）。
- **命名规则**：文档命名（docStem）由 `computeDocStem`（`src/host/fs-utils.ts`）计算。
- **相对路径推导层级不变**：`issues.ts`、`prompt-loader.ts`、`gen-executor.ts` 均按「本文件所在目录」推导；产物目录与包根同为一层 → 层级不变。**产物目录不得改成更深层级**（如 `dist/lib/`）。

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
| G-1 | ~~`POST /delete` 无 `path` 必填校验~~ → **迁移版已修复（本次迁移唯一有意的行为差异）** | 源 `src/host/index.js:258-262` + `fs-utils.js:148-157`；迁移版 `src/host/index.ts` 的 `/delete` 分支 | **源行为**：`path` 缺失时 `abs === root` 通过越权检查 → `rm(recursive, force)` **删掉整个工作区根**；`/write`、`/mkdir` 同样无校验。**迁移版加两道闸门**：① 缺 `path` / 非字符串 / 空串 → 400 `path required`（三条写路由都加）；② `abs === root`（`'.'`、`'./'`、`'sub/..'`）→ 400 `refusing to delete the workspace root`（**仅 `/delete`**，`/mkdir` 与 `/write` 不加，因为 `mkdir root` 幂等、`write root` 报 EISDIR，不毁数据）。闸门插在 `resolveIn` **之后**、`rm` **之前**。**运行时前后对照已证实**（同一探针：修复前 `delete '.'` → 200 且 root 与其中文件全消失；修复后 → 400 且 root 完好）。用户 2026-09-11 明确要求修复 |
| G-2 | `POST /gen-doc` 的 kind 白名单过宽（含 `translate`） | `registry.js:17` | `{kind:'translate', path:'<非 md>'}` 会被接受 |
| G-3 | 目录节点打开时重复请求同一 `/read` URL | `src/client/index.js:227-239` | 冗余请求 |
| G-4 | 切换文件/工作区**静默丢弃未保存编辑**（无确认） | `src/client/index.js:215-216,489` | 用户输入丢失 |
| G-5 | `refreshRoot` 失败在已有打开对象时不上屏 | `src/client/index.js:473,491,668` | 错误不可见 |
| G-6 | 拖拽中卸载 → `document` 监听残留 | `src/client/index.js:571-587` | 泄漏（jsdom 下会暴露，见 D-8 例外 b） |
| G-7 | `pollTask` 的 `setTimeout` 无 `clearTimeout` | `src/client/index.js:270,277` | 靠 `aliveRef` 短路（同 D-8 例外 b） |
| G-8 | sweep 无定时器，孤立 `running` 任务兜底可能永不触发 | `src/host/index.js:52-54,290,328` | 依赖 `withTimeout` 与前端 5min 上限收尾 |
| G-9 | 任务表为进程内 `Map`，重启即丢 | `src/host/index.js:37` | 前端收到 `task not found` |
| G-10 | 未消费 `conversation.view` owner props（`viewRequest`/`openView`/`completeViewRequest`） | `src/client/index.js:770` | 不参与 View 焦点协议 |
| G-11 | 「悬停可打开」在代码中无对应实现（蓝点与树节点实为点击打开） | 文档与代码不符 | 更新文档表述，而非造一个实现 |
| G-12 | `CodeBlock` 的 `copyLabel`/`copiedLabel` 自上游 0.1.5 起为必填，而源只传 `{code, lang}`（纯 JS 无类型检查故从未暴露） | 源 `src/client/index.js:110`；迁移版 `src/client/index.tsx:276-289`（`CodeBlockCall` 类型窄化） | 按 D-8/D-9 逐字保留：**不补** `t('mdCopy')`（补值会改变高亮区复制按钮的可见文案，属行为变化），仅在类型层窄化到源实现真正传递的两个字段，运行时调用与源一致 |

**可按 D-8 例外删除的死代码**（无任何引用，删除不改行为）：`cardDismissed`/`setCardDismissed`、`genStatus`、`picker`、4 个无 JS 引用的 CSS 类（`.fs-card-actions`/`.fs-card-src`/`.fs-card-err`/`.fs-folder-gen`）、`docRelPath`（仅测试用）。

> **订正（2026-09-11 复核实测）**：`isMdFile`/`isBookFile` **不属此列，勿删** —— 二者是 `canTranslate` 的输入（迁移版 `src/client/index.tsx:487`），而 `canTranslate` 决定翻译页签是否入列（`:491`）、是否读翻译文档（`:527`）、是否发起翻译（`:625`）、翻译按钮是否渲染（`:1043`）。原清单把它们误列为「未消费」，照删即砍掉翻译入口。

**可经 D-8 例外 b 修正、但本次迁移决定不修的泄漏**（须单独记账并在交付摘要列明）：G-6、G-7。迁移版与源逐字一致地保留二者——`src/client/index.tsx:538-539` 注释明写「**不新增清理**」（`pollTask` 无 `clearTimeout`、拖拽 `document` 监听无 cleanup），仅靠 `aliveRef` 短路达到可观察等价。

---

## 5. 未决事项

| # | 事项 | 归属 |
|---|---|---|
| 1 | patch 行 id 是否沿用 `fs` | P1-B 决定 |
| 2 | client 是否改用 `.tsx` + JSX（主仓风格）还是保留 `React.createElement` | P4 决定 |
