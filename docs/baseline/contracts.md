| 项 | 值 |
|---|---|
| 来源 | `../dsh-plugin-file-system` |
| 迁移源 revision | `3a3f89e` |
| 清点日期 | 2026-09-11 |
| 清点者 | 子C（契约与构建基线） |
| 状态 | 已验收 |
| 口径 | 行号以 3a3f89e 工作树为准；lint/test/coverage 为 2026-09-11 实测 |

---

问题类型：**事实类**（有唯一可验证答案）。推理方式：逐文件读取 + 交叉验证 + 每条结论绑定 `文件路径:行号`；实测三个只读命令（`npm run lint` / `npm test` / `npm run test:coverage`）取基线数值。全程未写任何文件——收尾核验 `git status` 为空，`dsh/` 产物 mtime 仍为 09-11 01:53（未跑 build）。

---

# dsh-plugin-file-system 基线清点报告

仓库：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`，HEAD `3a3f89e`，node v24.16.0。
实测门禁：`npm run lint` → 0 warnings / 0 errors（31 files / 25 rules）；`npm test` → tests 135 / pass 135 / fail 0 / suites 0 / 893ms；`npm run test:coverage` → 退出 0。

---

## A. package.json 契约

文件 `package.json`，共 71 行。

| 字段 | 行号 | 现状 | 迁移影响 |
|---|---|---|---|
| `name` | :2 | `dsh-plugin-file-system` | **必须逐字保留**。被 `cordis.patch.yml:10`、`scripts/build.mjs:57`（`pkg.name` 作为 client 注册 id）、`tests/real-composition.test.js:137` 引用；AGENTS.md §5 记为人工确认项 |
| `version` | :3 | `0.1.0` | 保留；主仓 `packages/boot/app-boot/src/profile.ts:364-366` 要求已安装包 version 非空 |
| `description` | :4 | 中文功能描述 | 保留（用户可见） |
| `type` | :5 | `module` | 保留（host 产物是 ESM，`build.mjs:71`） |
| `main` | :6 | `./dsh/index.js` | **必须改**（例：`./lib/index.js`）。loader 契约面，被 `tests/real-composition.test.js:26` 断言 |
| `exports["."]` | :8 | `./dsh/index.js` | **必须同步改**。这是包自引用/代理导出的解析目标（`packages/boot/app-boot/src/profile.ts:382-394` 逐子路径解析 exports） |
| `exports["./client"]` | :9 | `./dsh/client.js` | **必须同步改**。web 壳用它定位浏览器半边：`packages/client/modules/src/index.ts:209-219` 解析 `exports["./client"]`，`:767` 在声明了 `dsh.client` 却无该导出时抛错 |
| `exports["./package.json"]` | :10 | `./package.json` | 逐字保留（`profile.ts:385` 显式把它排除出代理导出） |
| `files` | :12-20 | `dsh`(:13)、`src`(:14)、`skills`(:15)、`cordis.patch.yml`(:16)、`agent.cordis.yml`(:17)、`preset.yml`(:18)、`README.md`(:19) | `dsh` → `lib`；其余**逐字保留**。关键：`src`(:14) 不能删——生产态 `src/host/prompt-loader.js:26-29` 的候选 2 是 `resolve(HERE, '../src/host/abilities', dirName)`，提示词 `prompt.md` 不是 JS 模块、不进 bundle，只能从源码树读盘 |
| `scripts.build` | :22 | `node scripts/build.mjs` | 若改 tsc/tsdown 需改此命令 |
| `scripts.test` | :23 | `NODE_ENV=test node --test` | vitest 化后整条改；`NODE_ENV=test` 是宿主 `__fsTest` 句柄的开关（`src/host/index.js:482`） |
| `scripts.test:coverage` | :24 | 见 D 节 | **必须整条重写** |
| `scripts.lint` | :25 | `oxlint . --config .oxlintrc.json` | 命令可留，配置需加 TS 匹配 |
| `keywords`/`license` | :27-33 | 4 项 / MIT | 保留 |
| `dsh.bundle.patch` | :35-37 | `./cordis.patch.yml` | **必须逐字保留**。`profile.ts:792-797` 读该字段并把插件目录加入层；缺字段即 fail loud；形状被 `packages/bundle/base/tests/base.spec.ts:23` 同类断言固化 |
| `dsh.client.platform` | :39 | `web` | 保留；`packages/client/modules/src/index.ts:192-194` 要求必须是 string |
| `dsh.client.inject` | :40-43 | `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots` | 保留；语义是「信息性」而非强制（`packages/client/ui-workspace/src/client/index.ts:58`：「dsh.client.inject edges are informational」），`modules/src/index.ts:195` 只做 string[] 校验 |
| `devDependencies` | :46-57 | 8 项：cordis 4.0.2、dsh-attachment/dsh-brand/dsh-invariants/dsh-llm/dsh-timeout、@stylistic/eslint-plugin ^5.10.0、esbuild 0.25.12、eslint-plugin-sonarjs ^4.1.0、oxlint 1.76.0 | TS 化需加 `typescript`、`@types/node`、`vitest`、`@vitest/coverage-v8`；`esbuild` 视是否保留 `build.mjs` 而定 |
| `peerDependencies` | :58-67 | 8 项：cordis、dsh-client-runtime、dsh-client-ui-slots、dsh-client-ui-primitives、dsh-llm、dsh-client-web-react、react、react-dom（均 `*` / 范围） | 保留；host 侧 `@deepseek-ai/dsh-llm` 是 external（`build.mjs:74`），client 侧 react 等由 web 壳冻结模块表提供 |
| `engines` | :68-70 | `node >=22.19` | 保留 |

**缺口**：`package.json` 无 `types` / `typings` 字段，而 `profile.ts:358-360` 会读这两个字段；TS 化后应补（或走 exports 的 types 条件）。

**`files`/`exports` 指向变化必须同步的清单**：`:6`、`:8`、`:9`、`:13`；连带 `tests/real-composition.test.js:26-28` 的三条断言（把 `./dsh/index.js` 与 `./dsh/client.js` 焊死）。

---

## B. 装载三件套

### B1. `cordis.patch.yml`（10 行）

```
1-6  # 注释：bundle patch 层语义——挂载后 host 端注册为 loader 条目（读磁盘 + webServer /api/fs/* 路由）；
     # client 端经 exports["./client"] 在 /plugins/dsh-plugin-file-system/client.js 被 web 壳加载；
     # 在对话页签行 conversation.view 渲染「文件系统」页签。
7    # `insert` 是必需的：loader patch 以 id 定位配置覆盖，新增行必须用 insert 列表。
8    - insert:
9        - id: fs
10         name: dsh-plugin-file-system
```

语义：这是**打包插件（bundle）的 patch 层文件**。`profile.ts:789-798` 对 `dsh.profile.bundles` 中每个包读 `dsh.bundle.patch` → `join(packageDir, declared)` → `loadOverlayPatches`；`:799-802` 再把 profile 自身 `cordis.patch.yml` 作为用户层叠加。`insert:` 的语义在 `:7` 注释中写明（以 id 定位覆盖，新增必须 insert）。
迁移时的路径引用：**无**（只有 id 与包名）→ 逐字保留。

### B2. `agent.cordis.yml`（26 行）

```
1-5   # 标题与「插件包 + agent preset 双身份」说明
6-10  # ── 为什么如此桥接 ──：插件包（cordis bundle）与技能发现（skill-filesystem）是两套独立机制，
      # 插件不会自动扫描包内 skills/；官方做法是把技能放进预设目录的 skills/，再用 customSkillDirs 显式挂载。
      # 参考：packages/preset/agent-presets/presets/cordis/agent.cordis.yml:261-265
11-13 # baseUrl 指向本预设自身目录，new URL('skills/', baseUrl) 相对解析，技能根随安装位置迁移，不写死绝对路径。
14-18 # ── 与 bundle 身份的关系 ──：cordis.patch.yml 与 agent.cordis.yml 互不冲突，同一目录可承载两种身份；
      # 技能经下面两行注册进【本预设层】的 host skill registry，无需 realm。
19    - id: skill-filesystem
20      name: '@deepseek-ai/dsh-skill-filesystem'
21      config:
22        customSkillDirs:
23          - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"
24    （空行）
25    - id: tool-skill
26      name: '@deepseek-ai/dsh-tool-skill'
```

语义：本文件使该目录同时是一个 **agent preset（agent 预设组合）**——`packages/preset/agent-presets/src/discovery.ts:37` 定义 `COMPOSITION_FILE = 'agent.cordis.yml'`，`:305-308` 用它判定目录是否为预设槽位；`:292-316` 的 `scanRoot` 逐目录读取。`customSkillDirs` 是 `@deepseek-ai/dsh-skill-filesystem` 的配置项（`packages/skill/skill-filesystem/src/index.ts:59`、`:81` 默认 `[]`、`:165` 逐个 `resolve(root)`、`:250` 追加为 `source: 'custom'` 技能根）。`!!js` 是 loader 的 YAML 方言（`discovery.ts:30` 用 `entryListSchema` 校验，`:236` 用它解析——即健康判定与 loader 接受度一致）。
迁移时的路径引用：`new URL('skills/', baseUrl)` 不含硬编码绝对路径；只要 `skills/` 与 `agent.cordis.yml` 仍在包根同级，**逐字保留**（TS 化不动 `skills/`）。

### B3. `preset.yml`（3 行）

```
1  name: 文件系统
2  description: 文件系统（file-system）Agent 预设：随包携带并复用文件系统三个生成技能 folder-doc / file-doc / source-doc（目录层 / 文件层 / 源码层），由插件包 dsh-plugin-file-system 作为载体分发。
3  order: 5
```

语义：预设**展示元信息**（`packages/preset/agent-presets/src/metadata.ts:25` `METADATA_FILE = 'preset.yml'`）；`discovery.ts:309-315` 读它，「不可读也不致命，回退显示 id」，`:319-322` 按 `order` 排序。
迁移时的路径引用：无 → 逐字保留。

### 实测补充（重要，标「未确认」）

未发现把本插件目录纳入 agent preset root 的配置：`~/.dsh/.agent-presets/` 下只有 `lian-lian`、`liangshen`、`xin-ren-lei` 等 5 项；`~/.dsh/profiles/web/cordis.patch.yml` 无 `agent-presets` / `roots` 配置；web-app bundle 的 `agent-presets` 行只设 `default: standard`（`packages/bundle/web-app/cordis.patch.yml:481-484`），roots 由 `config.roots` + shipped + user 组成（`packages/preset/agent-presets/src/index.ts:178-182`）。因此**该 preset 身份当前是否被 roster 发现：未确认**。
另一条观察：本会话可用技能列表含 `file-doc` / `folder-doc` / `source-doc`，**不含** `translate-doc` / `session-review`；这三个技能的来源**未确认**（本插件 `skills/` 是唯一存在的副本，但未找到挂载它的 root）。此项建议父 agent 单独取证，不要按「agent.cordis.yml 已生效」推进迁移。

---

## C. 构建链路

### C1. `scripts/build.mjs`（80 行）做了什么

| 行 | 内容 |
|---|---|
| :16-18 | `import { build } from 'esbuild'`、`createRequire`、`mkdirSync/writeFileSync` |
| :20-21 | `const require = createRequire(import.meta.url)`；`const pkg = require('../package.json')` |
| :23 | `mkdirSync('dsh', { recursive: true })` —— **依赖 cwd = 包根** |
| :25-35 | `PLATFORM_MODULES` 9 项（client external 表）：react、react/jsx-runtime、react-dom、react-dom/client、cordis、dsh-client-ui-slots、dsh-client-ui-primitives、dsh-client-web-react、dsh-client-runtime/client |
| :37 | `production = process.env.NODE_ENV ?? 'production'` |
| :39-53 | **client** build：entry `src/client/index.js`、`bundle:true`、`write:false`、`format:'cjs'`、`platform:'browser'`、`target:'es2022'`、`external: PLATFORM_MODULES`、define 三处（`process.env.NODE_ENV`、`import.meta.env.MODE`、`import.meta.env`） |
| :55-62 | 组装包装串：`window.__ModuleLoader__.load({ id: <pkg.name>, factory: (require) => { var module = { exports: {} }; var exports = module.exports; … return module.exports; } })` |
| :64-65 | `writeFileSync('dsh/client.js', wrapped)` |
| :67-76 | **host** build：entry `src/host/index.js`、`bundle:true`、`format:'esm'`、`platform:'node'`、`target:'es2022'`、`external:['@deepseek-ai/dsh-llm']` |
| :78-80 | `writeFileSync('dsh/index.js', hostCode)` |

是否含客户端注入：**是**——client 产物被包进 `__ModuleLoader__.load` 交接协议（:56-62）。
是否有 post 处理：**除该包装外无**。无 minify、无 sourcemap、无 banner、无文件拷贝（`prompt.md` 不在产物里）。

### C2. 输出契约

| 产物 | 文件名 | 格式 | 是否 ESM | 是否 bundle |
|---|---|---|---|---|
| host | `dsh/index.js`（:79） | esbuild ESM 文本 | 是（实测首行 `import { promises as fsp7 } from "node:fs"`） | 是（本地模块全内联；`node:*` 保留；`@deepseek-ai/dsh-llm` external） |
| client | `dsh/client.js`（:64） | CJS 代码字符串包在 `__ModuleLoader__.load({ id, factory })` 内 | 否（factory 内是 CJS） | 是（9 个平台模块 external，`require(...)` 由壳的冻结模块表解析） |

无 `dsh/index.js.map` / `dsh/client.js.map`（未生成）。`.gitignore` 忽略 `dsh/client.js` 与 `dsh/index.js`（`.gitignore:2-3`），`git ls-files dsh/` 为空——产物不入库。
`.oxlintrc.json:15-17` 注释亦记「构建产物目录：dsh/client.js 为 esbuild 产物；dsh/index.js 宿主入口 U3 迁移后亦为产物」。

---

## D. 测试基线

### D1. 八个测试文件：测什么 + 用例数

| 文件 | 行数 | 用例数 | 一句话 |
|---|---|---|---|
| `tests/abilities.test.js` | 337 | 27 | 能力目录化后的确定性逻辑与注册表契约：L1 目录树/骨架渲染、L2 骨架、translate 中文判定、L3 单元划分/骨架/回填/排版/四项自检、`ABILITIES`/`GEN_ABILITIES`/`abilityOf`/`docStem` |
| `tests/client-md-utils.test.js` | 209 | 26 | client 纯逻辑（basename/extOf/extBadge/langFor/isMd/splitFrontmatter/parseFmRows/labLabelKey）+ locale 字典与 `t()` 契约 |
| `tests/fs-utils.test.js` | 205 | 21 | host 纯逻辑：normRel/relToSrcKey/wsName/computeDocStem/docRelPath/projectKey（与 DSH format.ts 对拍）/书库目录位置/bookDocRelValid/docRelBookIn/resolveIn 越权/nextIssueNo |
| `tests/gen-scope.test.js` | 703 | 24 | 后台生成/翻译子 agent 作用域契约：cwd 固定 `books/session`、无 subagent 标、工具面收敛、提示词只注入 user message、L3 骨架落盘与 finalize、空转/注解率判据、index.json upsert、basename 并发回归 |
| `tests/host-routes.test.js` | 638 | 21 | `/api/fs/*` 路由：tree/read/write/set-root/gen-doc/gen-status/translate 的形状、400/404 语义、书库白名单、双位置回退、跨工作区共享 |
| `tests/issues.test.js` | 78 | 6 | 问题台账目录解析（`DSH_FS_ISSUES_DIR` 覆盖）、序号顺延、索引补齐幂等且不改写工作树 `issues/README.md` |
| `tests/real-composition.test.js` | 155 | 8 | host 模块真实形态装配（name/inject/apply、`webServer.register` 前缀路由、effect 可逆、生产不挂 `__fsTest`）+ `package.json`/三个 yml 的静态声明核对 |
| `tests/task-timeout.test.js` | 121 | 2 | `sweepGenTasks` 淘汰超时 running 任务（置 error + 字典文案 + finishedAt），并经 gen-status 验证前端可见 |

合计 2446 行、135 例（实测 `tests 135 / pass 135 / fail 0 / suites 0`，耗时 893ms）。

### D2. 用到的 node:test 特性（迁移必须找对应物）

| 特性 | 使用处 |
|---|---|
| `import { test } from 'node:test'` | 8/8：abilities:5、client-md-utils:3、fs-utils:1、gen-scope:10、host-routes:5、issues:8、real-composition:16、task-timeout:13 |
| `import assert from 'node:assert/strict'` | 8/8（分布：`equal` 360、`match` 97、`deepEqual` 56、`ok` 38、`throws` 5、`doesNotMatch` 5、`rejects` 4、`notEqual` 4） |
| 测试上下文对象 `t` | 仅 2 处：`real-composition.test.js:43`（`async (t) =>` 签名）、`:50`（`t.skip('dsh/index.js 构建产物不存在（未 build）…')`） |
| **未使用** | `describe` / `it` / `suite`、`mock`（`node:test` mock）、`t.after` / `t.before` / `t.plan` / `t.diagnostic` / `t.todo`、`beforeEach` / `afterEach` / `before` / `after`、`concurrency` 选项、参数化/table 测试 |

补充：无 `describe` 分组 → 实测 `suites 0`；用例全部是顶层 `test('中文标题', …)`。
进程级环境在**模块顶层 await** 中设置（迁移到 vitest 需注意 worker 隔离时序）：
- `gen-scope.test.js:25-29`：`await mkdtemp` → `process.env.DSH_HOME` → `process.env.DSH_FS_ISSUES_DIR`
- `host-routes.test.js:15-19`：同上
- `process.env.NODE_ENV ??= 'test'`：`gen-scope:8`、`host-routes:3`、`real-composition:14`（直接 `node --test` 时兜底，保证 `src/host/index.js:482` 的 `__fsTest` 挂载）
- `real-composition.test.js:116-129` 临时改 `NODE_ENV=production` 再在 `finally` 还原（与同进程其它用例有潜在竞态，vitest 每文件独立 worker 反而更稳）

### D3. 时序/并发处理手法

| 辅助函数 | 定义位置 | 做什么 | 用法 |
|---|---|---|---|
| `waitSettled(handle, taskId)` | `tests/gen-scope.test.js:137-148`（超时常量 `SETTLE_TIMEOUT_MS = 10_000` 在 `:136`） | 轮询 `GET /api/fs/gen-status?id=` 直到任务离开 `pending`/`running`；每 2ms 一次（`:146`），上限只用于防挂死 | 13 处：`:162, 208, 228, 252, 283, 321, 435, 436, 463, 511, 523, 546, 652` |
| `waitTaskRegistered(genTasks, rel)` | `tests/host-routes.test.js:66-75`（deadline 10s：`:67,:72`；步进 2ms：`:73`） | 轮询宿主 `genTasks` Map，等到出现该 `rel` 的 pending/running 占位（去重测试用） | `:459` |
| `waitTaskSettled(genTasks, taskId)` | `tests/host-routes.test.js:79-87`（deadline 10s：`:80,:84`；步进 2ms：`:85`） | 直接读 `genTasks` Map 轮询到离开 pending/running | `:203, 371` |
| `skeletonPathFrom(rec)` | `tests/gen-scope.test.js:150` | 从提示词里 `/SKELETON = (\S+)/` 提取骨架绝对路径——L3 骨架按 taskId 命名，测试不硬编文件名 | `:339-420` 段内使用 |

背景机制：宿主用 `setImmediate` 起后台任务并立即返回 200（任务仍 pending）——`src/host/index.js` 路由处理；测试侧的请求桩同样异步触发（`gen-scope.test.js:110-113`、`host-routes.test.js:48-54`）。这正是 AGENTS.md 记载的「固定 sleep 在并发下漏判」修复点，迁移时必须保留「等可观测信号」语义，不能退回 `sleep`。

### D4. `test:coverage` 当前门槛与白名单

`package.json:24` 原文参数：
- `NODE_ENV=test`
- `node --test --experimental-test-coverage`
- 白名单（3 个 `--test-coverage-include`）：`src/host/fs-utils.js`、`src/client/md-utils.js`、`src/shared/locale.js`
- 阈值：`--test-coverage-lines=100`、`--test-coverage-functions=100`
- **无 branches 阈值**（`--test-coverage-branches` 未出现）
- 无 `--test-concurrency` / `--test-timeout`

实测覆盖率（本次运行）：

| 文件 | line % | branch % | funcs % |
|---|---|---|---|
| `src/host/fs-utils.js` | 100.00 | 88.75 | 100.00 |
| `src/client/md-utils.js` | 100.00 | 100.00 | 100.00 |
| `src/shared/locale.js` | 100.00 | 100.00 | 100.00 |
| all files | 100.00 | 92.97 | 100.00 |

---

## E. 纯逻辑导出面（迁移后需 per-file 100% 覆盖）

### E1. `src/host/fs-utils.js`（238 行，25 个导出）

| 行 | 签名 | 一句话职责 |
|---|---|---|
| :7 | `booksRoot(): string` | 书库根 `$DSH_HOME/books`；`DSH_HOME` 缺省 `join(homedir(), '.dsh')` |
| :16 | `projectKey(p: string): string` | 项目根绝对路径 → 可读桶名（与 `session-persistence-jsonl/src/format.ts` 的 projectKey 逐字一致：安全字符保留、分隔符折 `-`、其余转 `~XXXX`、首尾包 `--`、slug 截 251）；空串抛 `cannot encode an empty project path` |
| :41 | `newBookDir(projectRoot): string` | 新桶目录 = `booksRoot()/projectKey(projectRoot)` |
| :47 | `legacyBookDir(projectRoot): string` | 旧库目录 `<项目根>/.book/<basename>-book/`（只读回退，不再创建） |
| :52 | `normRel(p): string` | 规范化相对路径：去 `./`、去首尾 `/` |
| :57 | `wsName(root): string` | 工作区目录名（`basename(root)`） |
| :62 | `relToSrcKey(nodePath, root): string` | 相对节点路径 → 文档「源码路径」键（工作区名 + `/` + 相对路径；根即工作区名） |
| :77 | `computeDocStem(rel): string` | L2/L3 文档 stem（父目录路径用 `-` 连，顶层用工作区名前缀）。**命名规则三处实现**之一，`:73-76` 明写须与 `skills/file-doc/scripts/file-doc.mjs`、`skills/source-doc/scripts/source-annotate.mjs` 同步 |
| :87 | `docRelBook(sub, stem): string` | 逻辑文档路径 `<层名>/<stem>.md` |
| :94 | `docRelBookIn(bucket, sub, stem): string` | 带桶逻辑文档路径 `@<桶名>/<层名>/<stem>.md`（跨工作区共享，客户端不透明透传） |
| :100 | `bookBucketValid(bucket): boolean` | 桶名形状校验（`[A-Za-z0-9._~-]+`，禁 `..`） |
| :106 | `BOOK_REL_LAYERS: string[]` | 四层名常量 `['目录概览','文件摘要','源码注解','文章翻译']` |
| :111 | `bookDocRelValid(rel): boolean` | 书库逻辑 rel 形状校验（两层式或带桶三层式，须 `.md`/`.markdown` 结尾） |
| :124 | `isBookDocRel(rel): boolean` | 同 :111 语义（`/read` 白名单判据），独立导出供路由层命名 |
| :129 | `docRelPath(root, sub, stem): string` | 兼容签名，`root` 被忽略，恒返回 `docRelBook(sub, stem)` |
| :134 | `isMdPath(p): boolean` | 扩展名 md/markdown 判定 |
| :141 | `isBookPath(p): boolean` | 是否 `.book/` 前缀（旧库兼容期语义，翻译白名单用） |
| :148 | `resolveIn(root, pathArg): string` | 路径必须落在 `root` 内（前缀带分隔符边界），越权抛 `path escapes workspace root` 且 `err.statusCode = 400` |
| :160 | `READ_LIMIT: number` | 单次读取上限 `2 * 1024 * 1024`（路由与翻译任务共用真源） |
| :167 | `GEN_CWD_SEG = 'session'` | 后台生成/翻译子会话统一工作目录段名（`booksRoot()/session`） |
| :179 | `GEN_SCOPE_TOOLS: Record<string, string[]>` | 各形态工具白名单：`src:['read','write','edit']`、`folder:['read','write']`、`file:['read','write','glob','grep']`、`translate:['read','write','edit']` |
| :190 | `genScopeAllow(kind, available?): string[]` | 期望白名单；`available` 提供时取交集，未提供时直给期望名单 |
| :206 | `renderPromptTemplate(tpl, vars): string` | 只替换 `${name}`（`[A-Za-z0-9_]+`）；`{{...}}` 与未知/null 占位符**原样保留**，不抛错 |
| :216 | `formatStamp(d?): string` | 时间戳 `YYYY-MM-DD HH:mm`（本地时区补零），须与技能脚本同格式 |
| :228 | `nextIssueNo(fileNames): string` | 台账序号：取 `<date>-<序号>-<slug>.md` 最大序号 +1，两位补零 |

### E2. `src/client/md-utils.js`（83 行，8 个导出）

| 行 | 签名 | 一句话职责 |
|---|---|---|
| :7 | `basename(p): string` | 取路径最后一段；空尾段回退原串 |
| :15 | `extOf(name): string` | 小写扩展名；无 `.` 或 `.` 在首字符（隐藏文件）返回 `''` |
| :24 | `extBadge(name): string` | 扩展名 → 文件树角标短文本；未知取前 3 字符大写，无扩展名返回 `''` |
| :42 | `isMd(ext): boolean` | 是否 Markdown（输入应为 `extOf` 结果） |
| :45 | `langFor(ext): string` | 扩展名 → shiki 语言 id；未命中回落 `'text'` |
| :52 | `splitFrontmatter(text): { fm: string \| null, body: string }` | 拆 frontmatter：首行 trim 后 `---` 开界、下一 trim 为 `---` 的行闭合；未闭合视为无 frontmatter |
| :68 | `parseFmRows(fm): Array<{ key: string \| null, value: string }>` | fm 文本 → 行数组；非键行 `key:null`；纯空白行剔除 |
| :78 | `labLabelKey(mode, isDir): string` | 查看模式 → 页签 label 的字典 key（`labDocDir`/`labDocFile`/`labAnnot`/`labTr`/`labSrc`） |

模块内非导出常量（TS 化后将成为类型契约的一部分）：`EXT_BADGES` :23、`LANG_MAP` :30-38、`MD_EXTS` :39。

### E3. `src/shared/locale.js`（100 行，3 个导出）

| 行 | 签名 | 一句话职责 |
|---|---|---|
| :5 | `ZH` | 中文文案字典，**实测 72 键**（槽位/查看模式/状态/a11y/按钮/生成菜单/占位卡/忙碌/host 错误串/HTTP 兜底） |
| :92 | `LANG: { zh: typeof ZH }` | 语言注册表（当前仅 zh；多语言扩展点） |
| :95 | `t(key, lang?): string` | 取当前语言文案；缺省 zh；缺键 `console.warn('[locale] missing key: ' + key)` 并返回 key 本身 |

注意 `:2` 注释：host 侧**直取 `ZH[key]`**（不调 `t()`），已用键为 `errGenMd` / `errTranslateOnlyMd` / `errBookNoTranslate`（`:80-82`）；`t()` 是 client 面。

---

## F. skills/ 与 lint 配置

### F1. `skills/` 13 个文件

| 技能 | 文件 | 行数 |
|---|---|---|
| `file-doc`（文件摘要 L2） | `SKILL.md` / `scripts/file-doc.mjs` / `templates/file.md` | 64 / 186 / 40 |
| `folder-doc`（目录概览 L1） | `SKILL.md` / `scripts/folder-doc.mjs` / `scripts/gen-tree.sh` / `templates/folder.md` | 71 / 178 / 29 / 31 |
| `session-review`（执行质量复盘评分 L0） | `SKILL.md` / `scripts/parse-session.mjs` | 91 / 151 |
| `source-doc`（源码逐行注解 L3） | `SKILL.md` / `scripts/source-annotate.mjs` | 73 / 482 |
| `translate-doc`（文章翻译） | `SKILL.md` / `scripts/translate-doc.mjs` | 61 / 175 |

合计 13 文件 / 1632 行（`skills/*/SKILL.md` 均带 YAML frontmatter：`name` / `description` / `whenToUse` / `metadata`）。

**如何被挂载分发**：声明在 `agent.cordis.yml:19-26` —— `skill-filesystem` 行 + `config.customSkillDirs: [!!js … new URL('skills/', baseUrl)]`，再配 `tool-skill` 提供技能目录与加载工具；`customSkillDirs` 的消费见 `packages/skill/skill-filesystem/src/index.ts:59/81/165/250`（追加为 `source:'custom'` 技能根，`:165` 逐个 `resolve`）。
另：`src/host/gen-executor.js:20-22` 计算 `SKILLS_ROOT`（源码态 `src/host/../../skills`，产物态 `dsh/../skills`），仅在 `:157` 作为提示词变量 `skillsRoot` 下发给子 agent——**不是技能注册**，是文案变量。
当前部署的实际生效情况见 B 节末「未确认」段。

### F2. `.oxlintrc.json`（112 行）启用了什么

| 项 | 行 | 值 |
|---|---|---|
| `plugins` | :3 | `[]`（不启用 oxlint 原生插件集） |
| `categories.correctness` | :5 | **`"off"`** —— 关闭 oxlint 原生 correctness 类别（默认是开启），实际生效的只有下面显式列出的规则 |
| `options.reportUnusedDisableDirectives` | :8 | `"warn"` |
| `env.builtin` | :11 | `true` |
| `ignorePatterns` | :13-18 | `**/node_modules/**`、`dsh/**`（构建产物）、`docs/**`（文档）、`skills/**`（随包技能，脚本规范独立） |
| override 1 | :19-91 | `files: ["**/*.{js,mjs}"]`（:23-25）；25 条规则 = 8 条 JS 通用（`no-var`、`prefer-const`、`prefer-rest-params`、`prefer-spread`、`no-array-constructor`、`no-unused-expressions`、`no-unused-vars`（带 `^_` 忽略三态）、`no-useless-constructor`）+ 9 条 `@stylistic/*`（indent 2、semi never、quotes single avoidEscape、comma-dangle always-multiline、eol-last always、no-trailing-spaces、object-curly-spacing always、arrow-parens as-needed + requireForBlockBody、max-len 140 且忽略 URL/字符串/模板串）；`jsPlugins: ["@stylistic/eslint-plugin"]`（:88-90） |
| override 2 | :92-110 | `files: ["**/*.{js,mjs}"]`；8 条 sonarjs 规则：`duplicates-in-character-class`、`no-all-duplicated-branches`、`no-duplicate-in-composite`、`no-duplicate-test-title`、`no-identical-conditions`、`no-identical-expressions`、`no-identical-functions`、`no-duplicated-branches`；`jsPlugins: ["eslint-plugin-sonarjs"]`（:107-109）。`:93` 注释说明 oxlint 无 sonarjs 原生规则，故经 jsPlugins 加载 |

关键提示：`:22` 注释「本项目无 TS 面，不引入 typescript 段」与 `:24` 的 `**/*.{js,mjs}` 在 TS 化后**必须改**（否则 `.ts` 文件不被检查，lint 会静默放过全部新代码）。

---

## G. 迁移风险与不可对齐项

### G1. 会被迫改变

1. **`main` / `exports["."]` / `exports["./client"]` / `files[0]`**（`package.json:6,8,9,13`）—— `dsh/` → `lib/`。这三处是 loader 与 web 壳的解析入口，改一处漏一处即装载失败。
2. **`scripts/build.mjs` 的三处 `'dsh'` 字面量**（`:23` mkdir、`:64` client、`:79` host）与包装串里的 `pkg.name` 来源。若改产物目录，`mkdirSync` 与两个 `writeFileSync` 必须同改。
3. **`test:coverage` 整条**（`package.json:24`）—— `--experimental-test-coverage` / `--test-coverage-include` / `--test-coverage-lines` / `--test-coverage-functions` 是 node:test 专有；vitest 需换成 `--coverage` + 配置里的 `coverage.include`（三个文件白名单）+ `thresholds`（lines/functions 100）。vitest 默认统计全量，必须显式收窄，否则门槛语义漂移。
4. **`tests/real-composition.test.js:26-28`** —— 把 `./dsh/index.js`、`./dsh/client.js` 焊进断言，是**必须同步修改的测试**（不是「保留」项）。
5. **node:test → vitest 的 API 差异**：`test` → `it`/`test`；`t.skip(...)`（`real-composition.test.js:50`）→ `it.skip`/动态 skip；`describe` 未使用故无分组改写；`node:assert/strict` 可**原样保留**（vitest 不禁止 import node 断言），但迁移后断言失败报告格式变化。
6. **`.oxlintrc.json:22` 注释与 `:24`/`:95` 的 `files` 匹配**需加 `ts`；同时应引入 typescript 段或换用 typescript-eslint。
7. **`devDependencies`** 需加 `typescript`、`@types/node`、`vitest`、`@vitest/coverage-v8`。
8. **`package.json` 缺 `types`/`typings`**（`profile.ts:358-360` 会读）—— TS 化后应补。
9. **AGENTS.md 的两条红线被本任务推翻**：§5「保持纯 JS，不引入 TypeScript」「测试栈保持 node:test（2026-09-09 人工决定）」——迁移即推翻，需同步改台账，否则后续 agent 会按旧红线回退。
10. **若改走主仓 tsdown 构建**：client external 需改由 `dsh.client.external` 声明（`packages/client/tsdown.client.ts:406-416` 的 `clientExternals` 读 `manifest.dsh?.client`），且主仓会产出并要求 `client.js.map`（`packages/client/modules/src/index.ts:304-310` 可选读取；缺失不致命）。

### G2. 必须逐字保留（行为契约）

- 包名 `dsh-plugin-file-system`（`package.json:2`；被 yml、build、测试三处引用）。
- `cordis.patch.yml:9-10` 的 `id: fs` 与 `name: dsh-plugin-file-system`。
- host 模块导出面：`name = 'fs'`、`inject = ['webServer','sandboxPolicy','sessions','agentLoop']`、`apply`（`src/host/index.js:27-28`；被 `real-composition.test.js:38-39` 与 host 装配精确断言）。
- client 模块导出面：`name = 'fs'`、`inject = ['slots']`、`apply`（`src/client/index.js:24-25`、`:758`）。
- `conversation.view` 槽：`id: 'fs'`、`order: 12`、`label: () => t('slotLabel')`（`src/client/index.js:761-768`）。
- `/api/fs` 前缀路由注册形状 `{ kind:'prefix', path:'/api/fs', handler }`（`src/host/index.js:470-478`；被 `real-composition.test.js:102-104` 断言）。
- `__fsTest` 仅 `NODE_ENV === 'test'` 挂载，且键集 `handle/genTasks/sweepGenTasks/getRoot/setRoot/genCwdAbs/knownBookRoots`（`src/host/index.js:482-494`）。
- `ZH` 全部 72 键与文案逐字不变（`src/shared/locale.js:5-90`）；缺键 warn + 回退 key 的行为（`:97-99`）。
- `dsh.bundle.patch = "./cordis.patch.yml"`（`package.json:35-37`）。
- `__ModuleLoader__.load({ id: <包名>, factory })` 包装格式与 `id` 语义（`build.mjs:56-62`；URL 由 id 合成见 `packages/client/modules/src/index.ts:293`）。
- `agent.cordis.yml` 的 `customSkillDirs` → `new URL('skills/', baseUrl)` 相对解析（不写死绝对路径）。
- 命名规则三处同步：`fs-utils.js:77` / `skills/file-doc/scripts/file-doc.mjs` / `skills/source-doc/scripts/source-annotate.mjs`（`fs-utils.js:73-76` 显式警告）。
- 全部 `/api/fs/*` 路由形状、错误文案与状态码（`host-routes.test.js` 21 例 + `abilities.test.js` 断言文案）。
- 骨架文件按 `taskId` 唯一（`gen-executor.js`；回归用例 `gen-scope.test.js:416`）。

### G3. 部分「意外有利」的结论（须仍逐条复核）

`src/host/issues.js:21-24`（`resolve(HERE,'../../issues')` 源码态 / `resolve(HERE,'../issues')` 产物态）、`src/host/prompt-loader.js:26-29`（`join(HERE,'abilities',dir)` / `resolve(HERE,'../src/host/abilities',dir)`）、`src/host/gen-executor.js:20-22`（`SKILLS_ROOT` 两态推导）都已按「本文件所在目录」推导，而 `lib/` 与 `dsh/` **同为包根下一级** → 只要产物目录仍是一级子目录，这三处相对层级不变、无需改动。**但**：一旦改成更深目录（如 `dist/lib/index.js`）全部失效，且 `prompt-loader.js:28` 的 `../src/host/abilities` 要求打包后源码树 `src/host/abilities/<dir>/prompt.md` 仍在包内（`files` 必须保留承载它的目录）。

### G4. 明确「未确认」

- 本插件 `agent.cordis.yml` / `preset.yml` 作为 agent preset 在**当前部署**是否被 roster 发现：未确认（未找到指向该目录或 `plugins/` 的 preset root）。
- 本会话可用技能中 `file-doc` / `folder-doc` / `source-doc` 的挂载来源：未确认。
- `dsh/client.js` 在运行时的实际加载路径与 rev 版本号：未实测（仅按主仓 `client/modules/src/index.ts:293` 与 `build.mjs:57` 推断为 `/plugins/dsh-plugin-file-system/client.js`，且该文件由 profile 的 node_modules 符号链接（`~/.dsh/profiles/web/node_modules/dsh-plugin-file-system -> …/plugins/dsh-plugin-file-system`）解析）。

---

## 必须逐字保留的清单（行为契约类）

1. `package.json:2` `name: "dsh-plugin-file-system"`
2. `package.json:35-37` `dsh.bundle.patch: "./cordis.patch.yml"`
3. `package.json:39,40-43` `dsh.client.platform: "web"` 与 `inject` 两项
4. `cordis.patch.yml:8-10` `- insert:` / `id: fs` / `name: dsh-plugin-file-system`
5. `agent.cordis.yml:19-26` 两行插件声明与 `customSkillDirs` 的 `new URL('skills/', baseUrl)` 写法
6. `preset.yml:1-3`（name / description / order）
7. `src/host/index.js:27-28` `name='fs'`、`inject=['webServer','sandboxPolicy','sessions','agentLoop']`
8. `src/host/index.js:470-478` `/api/fs` 前缀路由形状
9. `src/host/index.js:482-494` `__fsTest` 的挂载条件与键集
10. `src/client/index.js:24-25` `name='fs'`、`inject=['slots']`
11. `src/client/index.js:761-768` 槽 `conversation.view` / `id:'fs'` / `order:12`
12. `src/shared/locale.js:5-90` 72 个键与文案；`:97-99` `t()` 缺键 warn + 回退 key
13. `scripts/build.mjs:56-62` 的 `__ModuleLoader__.load` 包装格式与 `id = pkg.name`
14. `scripts/build.mjs:25-35` 的 `PLATFORM_MODULES`（client external 表）与 `:74` host external `@deepseek-ai/dsh-llm`
15. 三个纯逻辑文件导出面的**签名与行为**（E 节 25 + 8 + 3 项），含 `resolveIn` 的 400 语义、`renderPromptTemplate` 的原样保留语义、`projectKey` 的编码算法
16. `computeDocStem` 三处实现同步约束（`fs-utils.js:73-76`）
17. `agent.cordis.yml` 引用的技能目录 `skills/` 的 13 个文件路径与 `SKILL.md` frontmatter（`name` 是技能调用名）

## 必须改变并同步的清单（路径与工具链类）

| # | 位置 | 改什么 | 联动点 |
|---|---|---|---|
| 1 | `package.json:6` | `main` → `./lib/index.js` | `tests/real-composition.test.js:26` |
| 2 | `package.json:8` | `exports["."]` → `./lib/index.js` | `profile.ts:382-394` 代理导出；`real-composition.test.js:27` |
| 3 | `package.json:9` | `exports["./client"]` → `./lib/client.js` | `client/modules/src/index.ts:209-219,767`；`real-composition.test.js:28` |
| 4 | `package.json:13` | `files` 的 `dsh` → `lib` | 发包内容 |
| 5 | `package.json:14` | `files` 的 `src` —— **保留**，但需确认承载 `prompt.md` 的目录仍随包 | `prompt-loader.js:28` |
| 6 | `package.json:22` | `build` 命令（若换 tsc/tsdown） | `scripts/build.mjs` |
| 7 | `package.json:23` | `test` → vitest | 测试运行器 |
| 8 | `package.json:24` | `test:coverage` 整条重写 | 三个 include 白名单 + lines/functions 100 阈值 |
| 9 | `package.json:46-57` | 增 typescript / @types/node / vitest / @vitest/coverage-v8 | 工具链 |
| 10 | `package.json`（新增） | 补 `types` 或 exports types 条件 | `profile.ts:358-360` |
| 11 | `scripts/build.mjs:23,64,79` | `'dsh'` → `'lib'` | 产物路径 |
| 12 | `.oxlintrc.json:22,24,95` | 注释与 `files` 匹配加 `ts`（并引入 typescript 规则段） | lint 覆盖面 |
| 13 | `tests/*.js`（8 个） | `node:test` → vitest；`t.skip` → `it.skip`；`node:assert/strict` 可留 | `real-composition.test.js:43,50` |
| 14 | `tests/real-composition.test.js:26-28` | 断言中的 `./dsh/*` → 新产物路径 | 同上 |
| 15 | `AGENTS.md` §3 门禁命令、§4 目录职责（`dsh/` → `lib/`）、§5 两条红线 | 同步改，否则后续 agent 按旧红线回退 | 台账 |
| 16 | `src/host/gen-executor.js:20-22`、`prompt-loader.js:26-29`、`issues.js:21-24` | **仅当产物目录深度改变时**才需同步；同为包根一级子目录则不动 | 相对路径推导 |

---

**只读纪律确认**：本次全程未修改、未格式化、未暂存任何文件；未运行 `npm run build`；`git status --short` 输出为空；`dsh/client.js`（44579 字节）与 `dsh/index.js`（82326 字节）mtime 保持 2026-09-11 01:53:12 未变。目标迁移仓库 `dsh-plugin-file-system-zc` 未读写。
