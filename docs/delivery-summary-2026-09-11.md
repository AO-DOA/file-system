# 交付摘要 — dsh-plugin-file-system-zc（2026-09-11）

> 面向**接手者**：读这一份即可知道「交付了什么、哪里和原版不一样、哪里有已知问题、出问题怎么退回」。
> 本文只写**有出处的事实**；凡未独立核实的，正文中显式标注「（转述，未独立核实）」。
> 过程全量台账（337 行）见 [`docs/archive/PROGRESS-full-2026-09-11.md`](archive/PROGRESS-full-2026-09-11.md)；
> 当前态台账见 [`PROGRESS.md`](../PROGRESS.md)；功能基线见 [`docs/feature-baseline.md`](feature-baseline.md)。

## 1. 交付物是什么、迁自哪里、现在装在哪

| 项 | 值 | 出处 |
|---|---|---|
| 包名 | `dsh-plugin-file-system-zc`（非 scoped；决策 D-1） | `package.json:2`（实测） |
| 版本 | `0.1.0` | `package.json:3`（实测） |
| 仓库路径 | `/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc` | 实测 |
| 迁移源（**只读**） | `../dsh-plugin-file-system` @ `3a3f89e`，工作树干净 | `git -C ../dsh-plugin-file-system log --oneline -1` 实测 = `3a3f89e fix(host): 修 6 项缺陷并补回归门禁`；`git status --short` 输出 0 行（实测） |
| 本仓提交数 | 71 | `git log --oneline \| wc -l` 实测 |
| profile 装载 | `~/.dsh/profiles/web`：`dependencies["dsh-plugin-file-system-zc"] = "link:/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc"`，且 `dsh.profile.bundles` 数组第 10 项为 `dsh-plugin-file-system-zc` | 读 `~/.dsh/profiles/web/package.json` 实测（**两处缺一不可**，见 runbook §1.2） |
| 运行态 | dsh web 在跑，端口 3080 返回 HTTP 401（就绪需认证）；新插件已进 boot manifest、rev `ceedbcfa…` | 端口探测实测（401）；manifest/rev 为**转述**自 `docs/archive/PROGRESS-full-2026-09-11.md:328`（本次只读探测无法取得 manifest，见 §9 说明） |
| 分发形态 | DSH **打包插件**（`dsh.bundle.patch` → `cordis.patch.yml`）**兼** agent 预设（`agent.cordis.yml`）双身份 | `package.json:39-46`、`cordis.patch.yml`、`agent.cordis.yml`（实测） |
| 挂载行 | `- insert: - id: fs` + `name: dsh-plugin-file-system-zc` | `cordis.patch.yml:9-11`（实测） |
| 槽位 | `conversation.view` / id `fs` / order `12` / label `() => t('slotLabel')`（值 `'文件'`） | `feature-baseline.md:26-27`；`tests/real-composition.spec.ts` 8 例断言（实测通过） |

**迁移性质**：把纯 JS（node:test + esbuild）插件逐字迁移为 TypeScript(strict) + vitest/jsdom + tsdown。
**行为等价是红线**（决策 D-8），全项目**只有一处**有意的行为差异 —— §4 的 G-1。

## 2. 技术栈与质量门禁（实测）

### 2.1 技术栈

| 面 | 选型 | 出处 |
|---|---|---|
| 语言 | TypeScript strict（另开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noImplicitOverride` / `noFallthroughCasesInSwitch` / `noUnusedLocals` / `noUnusedParameters`） | `tsconfig.host.json:26-36`（实测） |
| host 编译 | `tsc -b tsconfig.host.json` → `lib/host/index.js` + `lib/types/host/*.d.ts` | `package.json:30`、`tsconfig.host.json:18-21`（实测） |
| client 打包 | `tsdown`（`.tsx` + JSX，`jsx: react-jsx`）→ `client/client.js` | `package.json:30`、`tsconfig.client.json:10`（实测） |
| 测试 | vitest（`environment: 'jsdom'`），spec 在包级 `tests/`（复数） | `vitest.config.ts:21-22`（实测） |
| lint | oxlint（`.oxlintrc.json`，80 rules） | `package.json:27`（实测） |
| solution 结构 | **三产品面 + 三个 tests leaf**，根 `tsconfig.json` 只做 solution（`files: []` + 5 条 references，**无 `extends`**） | `tsconfig.json`（实测） |

### 2.2 门禁实测（本次亲自跑，命令与原始输出摘要）

| 门禁 | 命令 | 实测结果 |
|---|---|---|
| test | `npm test` | **Test Files 19 passed (19) / Tests 553 passed (553)**，0 failed / 0 skipped，Duration 8.61s（vitest v4.1.11） |
| lint | `npm run lint` | **Found 0 warnings and 0 errors.** — 47 files / 80 rules / 3.8s |
| coverage（隔离跑） | `npx vitest run --coverage --coverage.reportsDirectory=/tmp/cov-d13-probe-1 --coverage.exclude='src/**/*.d.ts' --coverage.reporter=json-summary` | **All files 98.69 / 97.6 / 99.32 / 99.53**；**除 §7 例外的两个入口外，其余每个源文件四项全 100%** |
| coverage（默认门禁） | 同上但不覆盖 `exclude` | **All files 100 / 100 / 100 / 100**，exit 0（即 `test:coverage` 的默认口径） |
| typecheck | `npm run typecheck` | **转述**（未跑，见 §9）：`tsc -b tsconfig.json` exit 0 无输出 |
| build | `rm -rf lib client && npm run build` | **转述**（未跑）：成功，`client/client.js` 54,028 B、banner 校验通过 |

**19 个 spec 的用例分布**（本次 `npm test` 原始输出逐行摘录）：

| spec | 例 | spec | 例 |
|---|---|---|---|
| `client-view.spec.ts` | 119 | `book-index.spec.ts` | 7 |
| `p3-host-routes.spec.ts` | 80 | `abilities-registry.spec.ts` | 8 |
| `fs-utils.spec.ts` | 56 | `real-composition.spec.ts` | 8 |
| `abilities-source-doc.spec.ts` | 41 | `locale.spec.ts` | 9 |
| `abilities-folder-file.spec.ts` | 35 | `prompt-loader.spec.ts` | 10 |
| `md-utils.spec.ts` | 33 | `task-utils.spec.ts` | 13 |
| `book-store.spec.ts` | 27 | `translate-executor.spec.ts` | 17 |
| `gen-executor.spec.ts` | 27 | `issues.spec.ts` | 18 |
| `gen-scope.spec.ts` | 25 | `abilities-translate-doc.spec.ts` | 19 |
| `p5a-abilities-parity.spec.ts` | 1 | — | — |

**产物**（实测）：`lib/host/index.js` 32,625 B、`client/client.js` 54,028 B（gzip 15,231 B）。`lib/`、`client/` **不入库**（决策 D-7，`.gitignore` 含二者）。

**已知的操作陷阱**（照做会误判）：

- `tsc` 不清理 outDir：验收 build 前先 `rm -rf lib client`，否则旧 `lib/index.js` 之类陈旧产物会与新的并存（`PROGRESS.md:37`）。
- **并行跑 coverage 必须隔离 `reportsDirectory`**：多个 vitest 同写 `coverage/.tmp` 会让生成崩溃（实测 4 次崩 3 次，`PROGRESS.md:38`）。

## 3. 规模对照（源 → 迁移版）

| 文件 | 源 | zc | 说明 |
|---|---|---|---|
| `src/host/index.ts` | 494 行 | **715 行**（`grep -c ""` 实测；`wc -l` 计 716，差在末行换行） | 11 条路由 + 4 态任务状态机；增量主要为类型注解与 G-1 守卫 |
| `src/client/index.tsx` | 771 行（单文件，`createElement`） | **1188 行**（JSX） | 决策 D-11：`.tsx`；D-8 禁止拆分，故仍为单文件 |
| `gen-executor.ts` / `translate-executor.ts` | 232 / 132 行 | 379 / 244 行（转述） | 转述自 `docs/archive/PROGRESS-full-2026-09-11.md:312` |
| 源测试 | 8 文件 2446 行 **135 例**（node:test） | 19 spec **553 例**（vitest） | 见下 |

**源 135 例的逐条去向**（`docs/p5-migration-matrix.md` §1，135 = 81+1+47+5+1 自洽，实测该文件存在且 0 处待填）：
已被 zc 覆盖 81 / 本次补齐 1 / 移交 P5-B（集成面）47 / 其它缺口 5 / **不适用不应迁移 1**。
P5 **不是机械搬运** —— zc 的 553 例已比源更宽，机械搬运会与既有断言打架；那条「不适用」是源的包自引用用例（`real-composition.test.js:43`），依据主仓 `docs/testing.zh.md:45` 禁止裸导入解析到 `lib/` 陈旧产物，zc 已改用**真过 Loader** 的装配测试取代。

## 4. G-1：本次迁移**唯一有意的行为差异**（已加固）

### 4.1 缺陷是什么

源插件 `POST /api/fs/delete`、`/write`、`/mkdir` 三条写路由**无 `path` 必填校验**。`/delete` 后果最重：

- `resolveIn(root, 缺失值)` 把 `abs` 解析成**工作区根**；
- 越权检查写作 `abs !== root && !abs.startsWith(root + sep)` —— **`abs === root` 恰好通过**；
- 于是 `rm(abs, { recursive: true, force: true })` **递归删除整个工作区根**，且返回 200。

### 4.2 修复后的两道闸门

两道闸门都插在 `resolveIn` **之后**、`rm` **之前**（先判「有没有」，再判「是不是根」）：

| 情形 | 修复前 | 现在 |
|---|---|---|
| 缺 `path` / 非字符串 / 空串 | `rm(root)` **全损**，返回 200 | **400 `path required`**（三条写路由**都**加） |
| `path` 合法但解析回根（`'.'`、`'./'`、`'sub/..'`） | 同上（200，全损） | **400 `refusing to delete the workspace root`**（**仅 `/delete`**） |

实现落点：`src/host/index.ts:381`（`write`）、`:396`（`mkdir`）、`:408`（`delete`）的 `seg` 分支；构建产物中可见 `lib/host/index.js:283/296/309`（`path required`）与 `:318`（`refusing to delete the workspace root`）。

### 4.3 运行时前后对照（**本次独立实测**，非静态推理）

用同一份探针脚本，分别在「修复前源码」（`1e90c9a` 的 `src/host/index.ts`，经临时 git worktree 检出）与「当前 HEAD」各跑一次，走真实的 `ctx.__fsTest.handle` 路由链路、工作区根为 `mkdtemp` 临时目录：

| 探针 | 修复前（`1e90c9a`） | 当前 HEAD |
|---|---|---|
| `POST /delete` 缺 `path` | `{"status":200,"body":"{\"ok\":true}","rootAlive":false,"keepAlive":false}` | `{"status":400,"body":"{\"ok\":false,\"error\":\"path required\"}","rootAlive":true,"keepAlive":true}` |
| `POST /delete` `path:'.'` | `{"status":200,"body":"{\"ok\":true}","rootAlive":false,"keepAlive":false}` | `{"status":400,"body":"{\"ok\":false,\"error\":\"refusing to delete the workspace root\"}","rootAlive":true,"keepAlive":true}` |

`rootAlive=false` = 工作区根**真的被整根删除**（不只是返回码变化）。另实测反向对照：`delete 'sub'` → 200 且**根仍存活**（证明守卫只拦根自身），`mkdir '.'` → 200（见下条）。

### 4.4 为什么 `/mkdir` 与 `/write` **故意不加**第二道守卫

`mkdir root` 幂等、`write root` 报 EISDIR（500），**都不毁数据**；加了反而改变既有语义。实测：`POST /mkdir {path:'.'}` → **200 `{ok:true}`**，根完好。
缺 `path` 的必填校验三条路由都加 —— 那一层不涉及语义变化，只堵「拿不到目标」这一种畸形入参。

### 4.5 影响面与文案

- **页签界面行为零变化**：`/mkdir`、`/delete` 无任何前端调用；`/write` 仅一处（`save()`，其 `path: opened.path` 恒非空且有 `hasSource` 守卫）。改动只影响**直连这三条路由的脚本与集成**。
- 文案复用同文件既有英文技术串风格，**未新增 locale 键** —— `tests/locale.spec.ts` 硬断言 `ZH` 恰 72 键。

## 5. G-2 ~ G-12：逐字保留项（**刻意不修**，与原插件行为一致）

以下条目是**为行为等价而保留的已知缺陷/特性**，不是待修 bug 清单。**逐条未合并、未漏项**：

| # | 是什么 | 为什么保留 |
|---|---|---|
| G-2 | `POST /gen-doc` 的 kind 白名单过宽（含 `translate`）：`{kind:'translate', path:'<非 md>'}` 会被接受 | 逐字保留源行为（D-8/D-9） |
| G-3 | 目录节点打开时对同一 `/read` URL 重复发请求，产生冗余请求 | 同上；仅冗余、无功能后果 |
| G-4 | 切换文件/工作区**静默丢弃未保存编辑**（无确认） | 同上；加确认会改变交互语义 |
| G-5 | `refreshRoot` 失败在已有打开对象时不上屏 | 同上；错误可见性属行为变化 |
| G-6 | 拖拽中组件卸载 → `document` 上的 `mousemove`/`mouseup` 监听残留 | **实测保留未修**：`src/client/index.tsx:907-913` 的 `onUp()` 只在 `mouseup` 时移除，卸载路径不清理 |
| G-7 | `pollTask` 的 `setTimeout` 无 `clearTimeout`，靠 `aliveRef` 短路 | **实测保留未修**：`src/client/index.tsx:538-539` 注释明写「本实现对组件卸载可观察地等价，但**不新增清理**」；`:564`、`:571` 两处 `setTimeout` 无配对清理 |
| G-8 | sweep 无定时器，孤立 `running` 任务兜底可能永不触发 | 逐字保留；收尾依赖 `withTimeout`（10min）与前端 5min 上限 |
| G-9 | 任务表为进程内 `Map`，宿主重启即丢，前端随后收到 `task not found` | 逐字保留；改持久化属新功能 |
| G-10 | 未消费 `conversation.view` owner props（`viewRequest`/`openView`/`completeViewRequest`） | 逐字保留；源 `client/index.js:770` 亦然（只透传 `workspaces` 与 `picker`），不参与 View 焦点协议 |
| G-11 | 源仓 `AGENTS.md` §6 冒烟第 2 条「悬停可打开」在代码中无对应实现 | 属**源仓文档**层面问题；zc 仓无该节，不构成 zc 的用户可见差异（裁决：不修不并） |
| G-12 | `CodeBlock` 的 `copyLabel`/`copiedLabel` 在 primitives 里是**必填**，而源插件只传 `{code, lang}`（纯 JS 无类型检查故从未暴露）；zc **同样不传** | 逐字保留（补值会改变高亮区复制按钮的可见文案）。`src/client/index.tsx:276-289` 只在类型层窄化 —— 注意：**G-12 未登记在 `feature-baseline.md` §4 表内**（该表只到 G-11），其定义与依据见 `docs/archive/PROGRESS-full-2026-09-11.md:267` 与该行注释 |

**另有两类「D-8 例外」处置，需一并知晓**（`feature-baseline.md:88-90`）：

- **可按例外删除的死代码** —— 已实测删除：`cardDismissed` / `setCardDismissed` / `genStatus`（源 4/5/3 处 → zc 各仅剩 1 处**注释提及**）、`picker`（源 1 处 → zc **0 处**）、4 个无 JS 引用的 CSS 类（`.fs-card-actions` / `.fs-card-src` / `.fs-card-err` / `.fs-folder-gen`，现仅在 `src/client/index.tsx:1108` 的注释中被点名）。
  **注意一处口径差异**：`isMdFile` / `isBookFile` 在 `feature-baseline.md:88` 被列为「未消费的死代码」，但 zc 里它们是**活代码** —— `src/client/index.tsx:484-487` 用它们算出 `canTranslate`。该条清单在这一点上已过时。
- **可按例外修正的泄漏（G-6、G-7）** —— `feature-baseline.md:90` 的口径是「可修正，须单独记账并在交付摘要列明」，**但实际做法是保守的：未修**（见上表 G-6/G-7 行）。按 D-8 的「逐字保留」默认值执行，此处如实登记为**行为差异为零**。
- `docRelPath`（`src/host/fs-utils.ts:130`）**仅测试使用**（`tests/fs-utils.spec.ts:19/172/183`），源插件同样只有 1 处；属导出面逐字保留，未删。

## 6. 与主仓风格的**有意差异**（交付时需说明）

| 差异 | 原因 |
|---|---|
| host 产物是 `lib/host/index.js` 而非 `lib/index.js` | `tsconfig.host.json` 的 `rootDir` 上提到 `src`，以容纳跨面导入 `src/shared/locale.ts`——更窄的 `rootDir` 会直接报 TS6059 + TS6307，且 emit 出的入口其 `../shared/locale.js` 会解析到不存在的 `<pkg>/shared/locale.js`（源插件用 esbuild 打包成单文件故从未遇到） |
| solution 根 `tsconfig.json` 无 `extends` | 树外包没有 `tsconfig.base.json`；根只做 solution（`files: []`），`paths` 门面不需要 |
| 包名非 `@deepseek-ai/` scope | 该 scope 是 npm 组织 scope，**仅组织成员可发布**（决策 D-1）；主仓 `AGENTS.md:104` 的写法对本插件技术上不可行 |
| `dsh.client` 未写 `inject` | 实测「不写与旧插件行为完全等价」——旧插件声明的 `@deepseek-ai/dsh-client-runtime` / `dsh-client-ui-slots` 两个名字在客户端 graph 里**都不存在**（空转） |
| 构建产物**不入库** | 主仓「源平面 vs 产物平面不混」；与参照实现 `dsh-market`（提交 `client.js`）相反（决策 D-7） |
| `react` / `react-dom` 既是 `peerDependencies`（optional）**也是** `devDependencies` | 主仓 `docs/cookbook/adding-a-package.md:25`「Mirror every dsh peer dependency in devDependencies」；且 `@deepseek-ai/dsh-client-ui-primitives`、`cordis-plugin-include/loader`、`dsh-llm` 四个包**必须声明化**，否则每次 `npm install` 都被当 extraneous 清理，出现「本机全绿但异地 clone 必红」 |

## 7. D-13：覆盖率例外（用户裁决）

### 7.1 例外范围

`vitest.config.ts` 的 `coverage.exclude` 显式列入两个文件：

```ts
exclude: ['src/**/*.d.ts', 'src/host/index.ts', 'src/client/index.tsx']
```

**只有这两个**。`src/` 下**其余全部文件仍受 per-file 四项（statements / branches / functions / lines）100% 严格门禁**（`thresholds.perFile: true`，四项阈值均为 100，`vitest.config.ts:59-65`）。

### 7.2 实测覆盖率（本次亲自跑，取消例外测得）

| 文件 | Stmts | Branch | Funcs | Lines | 未覆盖语句 |
|---|---|---|---|---|---|
| `src/host/index.ts` | **97.07**（365/376） | **96.4**（268/278） | **97.56**（40/41） | **98.15**（320/326） | `186, 313, 320, 321, 335, 337, 338, 482, 483, 534, 535` |
| `src/client/index.tsx` | **97.96**（482/492） | **95.68**（443/463） | **99.16**（119/120） | **100**（370/370） | `594, 608, 625, 626, 633, 653, 668, 865, 889, 919` |
| 其余全部源文件（19 个，`src/**/*.{ts,tsx}` 共 21 个减去这 2 个） | 100 | 100 | 100 | 100 | — |

未覆盖位置**已逐条核对源码语义**（本次实测 + 读源码）：均属**从源插件原样移植的防御性双保险与竞态兜底** ——
`isBookDocRel === bookDocRelValid` 互为双保险（`313/320/321`）、`serveFile` 的 not-a-file 分支与 `stat` 失败回调只能落在 TOCTOU 窗口（`335-338`）、handle 预检已在**同一 root** 求值过 `resolveIn` 故 `bookTaskFor` 的 `delete + rethrow` 到不了（`482/483`、`534/535`）、四个描述符 scope 全在 `GEN_SCOPE_TOOLS` 故 `genScopeAllow()` 恒非空（`186`）；client 侧是 `save()` 的 `!hasSource`、`runTranslate()` 的 `trBusy` 守卫（调用点都在已蕴含其否定的条件之后）、`pollTask` 回调内对同一 `aliveRef` 的重复检查、以及 `props.tree || []` / `props && props.viewer || {}` 之类兜底（每个 pane 由唯一父组件渲染且必然传该 prop）。

### 7.3 裁决理由

三者**不可兼得**：

1. **D-8**（迁移遵循行为等价）→ 这些防御代码**不许删**；
2. **禁令**（不得用 `v8 ignore` / `istanbul ignore` / `any` 藏）→ **不许 ignore**；
3. **D-2**（per-file 100% 含分支，用户要求「真严格」）→ **要求覆盖**。

穷尽触发手段后仍不可达，故上报用户；用户 **2026-09-11 选 A：登记例外**（决策 D-13）。落地方式是把两个文件显式列入 `coverage.exclude`，并在**同一处注释**写明实测数值与逐条不可达出处（不藏在别处、不靠降低阈值蒙混）。可比先例：源仓对 `fs-utils.js` 分支 88.75% 的处置就是「不设门槛 —— 设 100% 就是当前达不到的假红」。

> ⚠ **注释与实测已有偏差（本次发现）**：`vitest.config.ts:37` 写 `src/host/index.ts` 的 `branch 95.83`，实测为 **96.4**；`:46` 写 `src/client/index.tsx` 的 `stmts 97.97`、`lines 97.42`，实测为 **97.96 / 100**。成因：该注释写于提交 `5f39369`，此后 `a268910` 之前的 G-1 修复与分支补测使数值变动，注释未同步。**口径以本文 §7.2 的实测为准**；注释修订属后续小改，不在本次交付范围（本次禁止修改既有文件）。
> 注释中引用的行号（`313/320/321` 等）在**当前源码下仍然对应正确**（本次逐行核对）。

**另有分母守卫**：`scripts/verify-coverage-scope.mjs`（挂在 `test:coverage` 末尾）比对「应进分母的文件集」与「实际进分母的文件集」，不一致即 exit 1。它的定位是**版本无关的口径守卫** —— 防止将来升级 vitest/vite、改 environment 或往 include 加 glob 时，源文件被静默排除出分母却仍显示绿。

## 8. 回滚

**权威步骤见 [`docs/p6-cutover-runbook.md`](p6-cutover-runbook.md) §5（582 行手册，含风险登记与命令出处索引）**。要点：

- **备份（已存在，实测 12M）**：`~/.dsh/backups/web-profile-before-zc-20260911-041620/` —— 整目录 `cp -a`，含 `package.json`、`node_modules` 软链、`pnpm-lock.yaml` 与全部 `.bak-*`。
  - **不要**只存 `package.json`：回滚还需要 lock、`node_modules/dsh-plugin-file-system` 软链与 `.modules.yaml`（runbook §2.0）。
- **一键回滚（推荐）**：
  ```bash
  rm -rf ~/.dsh/profiles/web
  cp -a ~/.dsh/backups/web-profile-before-zc-20260911-041620 ~/.dsh/profiles/web
  grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json   # 确认旧行回来了
  ```
  随后**重启 dsh web**，再按 runbook §4 复验旧插件。
- **命令回滚（不用备份）**：`dsh plugin --profile web remove dsh-plugin-file-system-zc` + `dsh plugin --profile web add /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`（runbook §5.2；缺点是把旧包**追加到 bundles 末尾**，位置与原来不同，功能等价）。
- **只回滚一层（诊断用）**：`dsh --profile web --dump-default-config | grep -n -B1 -A1 -- '^- id: fs$'`。
- **回滚无副作用的前提**：迁移源全程只读。本次实测复核 —— `../dsh-plugin-file-system` 仍在 `3a3f89e`、`git status --short` 0 项改动。

> 实际切换走的**不是** runbook §2.1/§2.2 的 `dsh plugin` 命令：当时 `dsh plugin` 因 pnpm store v10/v11 冲突失败（`ERR_PNPM_UNEXPECTED_STORE`），改走 runbook §1.5 已给出的等价路径（手工改 `dependencies` + `bundles` + 补软链）。该冲突已于 2026-09-11 修复（profile 的 `package.json` 补 `"packageManager": "pnpm@11.7.0"` 一行），**现在 `dsh plugin --profile web <pnpm 参数>` 可用**。

## 9. 已知遗留

1. **`translate-doc` / `session-review` 两个技能仍不可见** —— 切换前就不可见（`~/.agents/skills/` 里没有它们的软链），保持行为等价；**明确不做**。
   实测：`~/.agents/skills/` 下 `folder-doc`、`file-doc`、`source-doc` 三条软链均指向 `-zc/skills/*`；`translate-doc`、`session-review` 两条软链**悬空**（指向自身、目标不存在）。
   ⚠ 与台账的**措辞差异**：`PROGRESS.md:132` 说「`~/.agents/skills/` 里只有另外三条软链」（暗示不存在这两条）；实测该目录下**两条断链是存在的**（`translate-doc`、`session-review` 均指向 `~/.agents/skills/<同名>` 自身、目标不存在）——是否算「软链」取决于口径，但**效果等价：两者都不可见**。
2. **旧插件仓 `../dsh-plugin-file-system` 保留** —— 冻结于 `3a3f89e`、工作树干净，作回滚参照（实测复核通过）。
3. **host 错误通道字典化（#20）未做** —— 中文 25 + 英文 17 处技术串仍在代码里；本次 G-1 复用既有英文串，未启动该项（`PROGRESS.md:128`）。
4. **R3：两个 leaf 的 `compilerOptions` 手抄两份** —— 6 项严格设置重复维护，可提取 `tsconfig.base.json`（结构变更，本轮不做，`PROGRESS.md:126`）。
5. **人工冒烟与两项单测覆盖不到的专项，本次未复核** —— 见 §10。

## 10. 本文的证据边界（哪些是实测、哪些是转述）

| 类别 | 内容 |
|---|---|
| **本次亲自实测** | `npm test`（19 spec / 553 例）；`npm run lint`（0/0，47 files）；coverage 两轮（默认 100×4；取消例外后逐文件数值与未覆盖行号）；G-1 运行时前后对照（4 组探针，双向复现）；`git log`/commit 数/工作树干净/迁移源冻结；profile 两处指向；备份目录与 12M；端口 3080 = 401；包名/版本/main/exports/files/dsh 字段；`tsconfig.*` 与 `vitest.config.ts` 内容；源 135 例对账矩阵的 81/1/47/5/1 自洽性；G-2~G-12 的**源侧行号逐条开文件核对**；死代码删除情况；技能软链指向 |
| **照抄台账、未独立核实** | `npm run typecheck` exit 0 无输出；`npm run build` 成功与 banner 校验（未跑 —— 本任务禁止跑 build）；boot manifest 中 `-zc` 出现 5 次与 rev `ceedbcfa…`（活服务需认证，只读探测取不到 manifest）；`client/client.js` 在服务端实取 200/54126 B（该数字与本地构建 54,028 B 不同，属切换时点快照）；源 135 例=2446 行/8 文件；155 已迁移 / 10 不适用 / 6 有意保留（171 功能点）；11 条路由「三方一致」中的 `baseline/host.md` 侧（**本次机器化复核：源与 zc 的 `seg === '…'` 字面量各 11 条、逐条同名同序**）；`gen-executor.ts`/`translate-executor.ts` 的行数；`index.ts` 96.93/96.21/97.56/98.07 等历史覆盖率快照 |
| **本次发现的不一致** | ① `vitest.config.ts` 例外注释的 branch/stmts/lines 数值与实测不符（§7.3 已列）；② `feature-baseline.md:88` 的「可删死代码」清单把 `isMdFile`/`isBookFile` 列为未消费，实际是活代码（§5 已列）；③ `feature-baseline.md:90` 与本仓 `PROGRESS.md` 对 G-6/G-7 是「已修」还是「保留」表述不同，实测结论是**保留未修**（§5 已列）；④ `PROGRESS.md:132` 的技能软链措辞与实测不符（§9 已列） |

**未核实即未写**：本文不含任何未经上述核查的来源数据。
