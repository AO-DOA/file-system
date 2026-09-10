# D-6 专项核验 — 三 leaf + solution-only root 的官方依据与必要性

> 核验日期：2026-09-11 · 核验者：P2-A 基础层子智能体
> 台账出处：`PROGRESS.md` §2 决策 **D-6**（「待实测 host/client 是否触发 cordis `Context` 声明合并冲突——若无冲突，按 `packages/AGENTS.md:23`『ordinary two-entry Client plugins do not split』退回两文件结构」）
> 只读声明：本核验**未改动任何 tsconfig 结构**，仅读取主仓文档与配置、本仓现有配置。所有命令为只读 `cat` / `grep`。
> 官方 checkout：`/home/xuepeng/DSH/deepseekHARNESS/`（下称「主仓」）

---

## 0. 一句话结论

**必须分离（保留现状：`tsconfig.host.json` / `tsconfig.client.json` / `tsconfig.tests.json` 三 leaf + 只含 references 的 `tsconfig.json`）。**
它不是「例外」——本插件恰好落在主仓 `packages/AGENTS.md:23` 正文明文覆盖的「具有不同 Host 与 Client 编译面的包」这一情形；退回单一 program 不会产生类型错误（有主仓并集先例），但会**同时放宽两侧可见性**（host 看得到 DOM、client 看得到 node 全局），使门禁失去约束力，并为 P3/P4 引入真实服务包类型后的 `Context` 声明合并冲突留下隐患。

---

## 1. 官方原文摘引（逐条，含路径与行号）

### 1.1 `packages/AGENTS.md:23`（决定性条文，全文）

原文（单行，逐字）：

```
- **Package tsconfig:** extends `tsconfig.base.json` (Client: `tsconfig.base.client.json`), sets `rootDir: src` and `outDir: lib/types`, references workspace dependencies, references `runtime-diagnostics/invariants` only when the package publishes `./invariant`, and registers in one aggregate. Packages with distinct Host and Client compiler faces use `tsconfig.host.json` and `tsconfig.client.json` leaves plus a solution-only root; ordinary two-entry Client plugins do not split ([layout](../docs/development.md#typescript-project-layout)).
```

关键分句（`packages/AGENTS.md:23`）：

- **正面条件**：`Packages with distinct Host and Client compiler faces use tsconfig.host.json and tsconfig.client.json leaves plus a solution-only root`
  → 「具有不同 Host 与 Client 编译面的包」使用「host/client 两个 leaf + solution-only root」。**本仓结构与该句逐字同构**（本仓另多一个 `tsconfig.tests.json` leaf，见 §4）。
- **反面条件**：`ordinary two-entry Client plugins do not split`
  → 「普通的双入口 Client 插件不拆分」。该句的判据在 `docs/development.zh.md:72` 给出（见 §1.3），**本插件不满足该判据**（论证见 §3.2）。

### 1.2 `docs/development.zh.md:58`（两 aggregate 隔离与「普通包只登记一个」）

原文（单行，逐字）：

```
仓库使用相互隔离的 Host 与 Client aggregate。普通包只登记进其中一个 aggregate；Host 包进入 `tsconfig.host.json`，Client 包进入 `tsconfig.client.json`；`host/webserver`、`compaction/compaction` 与 `typert/registry` 三个包被两个 aggregate 同时引用，作为共享 leaf，让两侧对同一份源码做类型检查。
```

### 1.3 `docs/development.zh.md:62`（solution 根的定义 —— 与本仓逐字同构）

原文（单行，逐字）：

```
| `tsconfig.json` | solution 根：`extends` base、`files: []`、引用两个 aggregate。它是 tsserver 发现入口，也是显式执行整张 Project Reference 图时的入口；经继承的 `paths` 充当 tsx 运行 `scripts/` 时的解析配置。 | 否 |
```

→ 官方 solution 根的三要素：`files: []`、只含 references、**不构成 program**。本仓 `tsconfig.json` 正是 `"files": []` + 三条 `references`（仅缺 `extends`，因树外包无 base——见 §5-R2）。

### 1.4 `docs/development.zh.md:68`（**唯一被点名的真冲突机制**）

原文（单行，逐字）：

```
Host 与 Client 保持两个 aggregate program，是因为两侧在相同键下以不同服务对 cordis `Context` 接口做声明合并；单一 program 同时看到两份合并会报冲突。这种冲突只存在于 `ts.Program` 内部——模块解析永远不会触发它——所以 solution 可以同时引用两个 aggregate，一个 paths 门面也可以横跨两侧。由此推出三条纪律：
```

→ 冲突的**充分条件**是：两侧在**相同键**下以**不同服务**对 `Context` 做 module augmentation，且二者进了同一个 `ts.Program`。

### 1.5 `docs/development.zh.md:70-71`（纪律三条中的两条）

原文（两行，逐字）：

```
- `tsconfig.base.json` 永不添加 `include` 或 `files`：它们会泄漏进每个 extends 它的包项目，并收窄门面的全匹配范围。
- 构造全仓 `ts.Program` 的脚本显式以 `tsconfig.host.json` 或 `tsconfig.client.json` 为种子——根 solution 永不作为种子，因为把两个 aggregate 展平进一个 program 会撞上 `Context` 合并冲突。
```

→ 被禁止的是「把两个面**展平进一个 program**」，不是「用 solution 当 `tsc -b` 入口」。`tsc -b` 是 build mode：它按引用图为每个 leaf 各建一个独立 program，不展平。本仓 `typecheck: tsc -b tsconfig.json` 因此不违反 `:71`。

### 1.6 `docs/development.zh.md:72`（「不构成拆分理由」的语境 —— 对「退回单一」最有利的一句）

原文（单行，逐字）：

```
- 新包只登记进一个 aggregate；只有上述拆分包同时携带两个 leaf 配置，共享 leaf 因两侧需要对同一份源码做类型检查而登记进两个 aggregate。包同时具有 Node loader 入口和 browser 入口并不构成拆分理由；普通 Client 插件的两份运行时产物都在 Client 构建阶段生成。
```

→ 该句的判据是**构建阶段归属**：「普通 Client 插件的**两份运行时产物都在 Client 构建阶段生成**」。本插件的 host 产物由 `tsc -b tsconfig.host.json` 生成、client 产物由 tsdown 生成，**不在同一构建阶段**（`package.json` 的 `build` = `tsc -b tsconfig.host.json && tsdown && …`），故不落入该句所指的「普通 Client 插件」。

### 1.7 `docs/development.zh.md:66`（client 面编译器设置的官方立场）

原文（单行，逐字）：

```
| `tsconfig.base.client.json` | 浏览器编译设置（`jsx`、DOM lib、`types: []`），由 Client aggregate 和每个 `packages/client/*` 包 extends。 | 否 |
```

对应主仓实际文件 `tsconfig.base.client.json:4-5` 的注释原文：

```
// Client-side compiler shape shared by tsconfig.client.json and every
// packages/client/* package: browser library API, React JSX, no ambient
// node types (packages that need them override locally).
```

→ **官方立场：client 面默认不引入 node 环境类型**（需要者本地覆盖）。本仓 `tsconfig.client.json` 的 `types: []` 与之一致。§3.3 会说明：合并单 program 必然破坏这一立场。

### 1.8 `docs/development.zh.md:74`（拆分包清单与自动发现口径）

原文（单行，逐字；中间以 `…` 省略两段包说明）：

```
拆分 Host/Client tsconfig 的包有六个：`api/remotes`、`api/gateway`、`api/session-controller`、`api/workspace-controller`、`client/connection` 与 `session-query/session-log-export`。… workspace `constraints` 门禁遍历可达的 Project Reference 图，并按各引用 project 自身的 compiler face 检查：只有单一配置的目标可由任一 face 引用，拆分配置的目标则必须引用匹配的 leaf，不得引用 solution 根或另一侧 leaf；该门禁按「两个 leaf 配置同时存在」自动发现拆分包，所以新拆分的包会自动纳入管辖。
```

→ 判定的机器口径是**「两个 leaf 配置同时存在」**（而非文档列举的名字）。本仓两个 leaf 同时存在 ⇒ 按主仓口径就是「拆分包」。

---

## 2. 本仓实际编译面差异（实测，逐项）

| 维度 | `tsconfig.host.json` | `tsconfig.client.json` | 单 program 能否共存 |
|---|---|---|---|
| `lib` | `["ES2024"]` | `["ES2024","DOM","DOM.Iterable"]` | **能**（并集合法，主仓 `packages/client/modules/tsconfig.json:6` 即并集先例），但并集意味着 host 面也能看见 DOM |
| `types` | `["node"]` | `[]` | **能**，但并集意味着 client 面也能看见 node 全局（违反 `tsconfig.base.client.json:5` 的 `no ambient node types`） |
| `jsx` | 未设 | `react-jsx` | **能**（对纯 `.ts` 无影响） |
| `rootDir` / 产物 | `src/host` → `lib/` | `src/client` + `noEmit` | 互不干扰 |
| `Context` augmentation | 现为局部 `interface`（未 augmentation） | 现为局部 `interface`（未 augmentation） | **当前能**；P3/P4 换用真实服务包类型后转为风险（§3.1） |

主仓同类先例（同为「普通 Client 插件」却保留双 leaf）：

- `packages/client/file-upload/tsconfig.json` = `files: []` + 引用 `tsconfig.host.json` 与 `tsconfig.client.json` —— **与本仓 `tsconfig.json` 同构**；
- `packages/client/file-upload/tsconfig.host.json` extends `tsconfig.base.json`（Node 面，`files` 列 `src/index.ts` 等）；
- `packages/client/file-upload/tsconfig.client.json` extends `tsconfig.base.client.json`（浏览器面，`jsx` + DOM）；
- 引用关系实证：`tsconfig.host.json:163` 引用 `./packages/client/file-upload/tsconfig.host.json`，`tsconfig.client.json:62` 引用 `./packages/client/file-upload/tsconfig.client.json` —— 即两个 leaf 分别进入两个 aggregate。

→ 「ordinary two-entry Client plugins do not split」并不排除**包内双 leaf**；它排除的是把「仅因有两个入口」的包拆成两个 aggregate 成员。真正判据是两侧源码是否面向不同编译面。

---

## 3. 冲突机制逐项判定

### 3.1 cordis `Context` 声明合并（唯一硬冲突源）：**当前不触发，P3/P4 后有现实风险**

- 机制原文见 §1.4（`docs/development.zh.md:68`）。
- 主仓实证（host 侧）：`packages/host/webserver/src/index.ts:22-25`

  ```ts
  declare module '@deepseek-ai/cordis' {
    interface Context {
      webServer: WebServer
    }
  ```

- 主仓实证（client 侧）：`grep -rln "declare module '@deepseek-ai/cordis'" packages/client --include=*.ts` 命中 **24 个文件**（`packages/client/ui-conversation/src/client/index.ts`、`packages/client/ui-layout/src/client/index.ts`、`packages/client/modules/src/index.ts`、`packages/client/file-upload/src/client/index.ts` 等）。
- 本仓现状：`src/host/index.ts:24-30` 与 `src/client/index.ts:24-29` **刻意以局部 `interface WebServerSurface` / `SlotsSurface` 代替 module augmentation**，两处注释原文：

  > `Declared locally instead of augmenting 'Context': P3 imports the real '@deepseek-ai/dsh-webserver' types, and two declarations of the same 'Context' key with different shapes are a merge error.`

  → **本仓当前不会触发** `Context` 合并冲突（这正是 D-6 待实测的那一问的答案）；但该规避是**过渡姿态**，注释本身已写明 P3 将改用真实服务包类型。届时 host 面带入 `webserver` 的 augmentation、client 面带入 `@deepseek-ai/dsh-client-ui-slots` 及其消费方的 augmentation，一旦落在同一 `Context` 键上，单 program 立即复现 `:68` 描述的冲突。

### 3.2 「普通双入口 Client 插件不拆分」是否适用于本插件：**不适用**

判据（`docs/development.zh.md:72`）是「两份运行时产物都在 Client 构建阶段生成」。本插件的构建链路（`package.json` 的 `build`）：

```
tsc -b tsconfig.host.json && tsdown && node scripts/normalize-client-banner.mjs && node scripts/verify-client-banner.mjs
```

→ host 产物 `lib/index.js` 由 **Host 面 tsc** 生成；client 产物 `client/client.js` 由 **tsdown** 生成。两者不在同一构建阶段，与 `:72` 末句描述的对象**不同构**。同时两侧源码与运行环境相异：

- host 半边：Node 服务实现，注入 `['webServer','sandboxPolicy','sessions','agentLoop']`（`src/host/index.ts:12,15`，与 `feature-baseline.md` §2.1 逐字一致）；
- client 半边：浏览器 React 槽位实现，注入 `['slots']`（`src/client/index.ts:11,14`），P4 起为 `.tsx`（决策 D-11）。

⇒ 属于 `packages/AGENTS.md:23` 前半句「distinct Host and Client compiler faces」，即**明文允许（并要求）leaf + solution-only root**。

### 3.3 退回单一 program 的代价：**能编译，但门禁失去约束力**

- 单 program 唯一可行的并集是 `lib: ["ES2024","DOM","DOM.Iterable"]` + `types: ["node"]` + `jsx: react-jsx`。
- 该并集**不是类型错误**——主仓先例 `packages/client/modules/tsconfig.json:6-7` 正是 `"lib": ["ES2024","DOM","DOM.Iterable"]` + `"types": ["node"]` 的单 program。
- 但后果是双向放宽：
  - host 面可见 `document` / `window` 等 DOM 全局（`tsconfig.host.json` 刻意不开 DOM 的收紧失效）；
  - client 面可见 `process` / `Buffer` 等 node 全局——而浏览器运行时并无 `process`。这直接违反官方 client 面立场（`tsconfig.base.client.json:5`：`no ambient node types (packages that need them override locally)`），并使「client 误用 node API」不再被类型检查拦截。
- 与决策 **D-2**（per-file 100% 含分支的「真严格」取向）冲突：为省一个 leaf 而把两侧可见性放宽，等于用门禁强度换文件数量。

---

## 4. 本仓三 leaf（多出的 `tsconfig.tests.json`）是否有依据

| leaf | 本仓内容 | 依据 |
|---|---|---|
| `tsconfig.host.json` | `types:["node"]`、`lib:["ES2024"]`、`rootDir: src/host`、emit 到 `lib/`、composite | 命中 `packages/AGENTS.md:23` 前半句 |
| `tsconfig.client.json` | `types:[]`、lib 含 DOM/DOM.Iterable、`jsx: react-jsx`、`noEmit`、composite | 命中 `packages/AGENTS.md:23` 前半句；与 `tsconfig.base.client.json:4-5` 的官方姿态一致 |
| `tsconfig.tests.json` | extends host leaf、`noEmit`、`rootDir: "."`、`include: ["tests","src"]` | 主仓把 tests 放进 aggregate program 内（`docs/development.zh.md:63`「Host aggregate：Host 包、示例、**测试**、脚本和 website」）。树外包没有 aggregate，用第三个 leaf 承载 tests 面是**机制的等价映射**，有依据。 |
| `tsconfig.json`（root） | `files: []` + 三条 references，无自己的 program | 与 `docs/development.zh.md:62` 对 solution 根的定义逐字同构（仅缺 `extends`，见 §5-R2） |

`tsc -b tsconfig.json` 作为 `typecheck` 入口：不违反 `docs/development.zh.md:71`（该条禁止的是「把两个面展平进**一个** program」，`tsc -b` 为每个 leaf 各建独立 program）。

---

## 5. 附带发现的风险登记（**不改结构，留主智能体决策**）

| # | 风险 | 证据 | 影响 | 建议（不改，仅登记） |
|---|---|---|---|---|
| **R1** | `tsconfig.tests.json` 继承 host leaf ⇒ 继承 `lib:["ES2024"]`、`types:["node"]`，**无 DOM、无 `jsx`**；而它 `include: ["tests","src"]`，会把 `src/client/**` 一并纳入**同一个 program** | `tsconfig.tests.json` 全文；`tsconfig.client.json` 的 `jsx: "react-jsx"` 只在 client leaf 生效 | **P4 一旦落地 `.tsx`（决策 D-11）或组件测试用 DOM/React，`npm run typecheck` 会因缺 `jsx`/DOM lib 直接报错**。当前能通过只因 `src/client/index.ts` 仍是纯 TS 桩 | 三个可选方向，任一都需主智能体决策（会影响 P4）：① tests leaf 增开 `jsx` + DOM lib；② tests 拆成 host/client 两个 tests leaf；③ 组件测试用 `@vitest-environment jsdom` + 仅在 client leaf 内检查。**本核验不改动任何 tsconfig。** |
| **R2** | 本仓 solution 根没有 `extends`（主仓 `tsconfig.json:62` 要求 `extends` base） | `docs/development.zh.md:62` vs 本仓 `tsconfig.json` | 无功能性影响：树外包没有 `tsconfig.base.json`，`paths` 映射不需要。属与主仓布局的**有意差异**，非缺陷 | 交付摘要登记即可；若未来加 base，注意 `:70`（base 永不添加 `include`/`files`） |
| **R3** | 两个 leaf 的 compilerOptions 目前是手抄两份（未共享 base） | `tsconfig.host.json` / `tsconfig.client.json` 逐行比对 | 严格项（`noUncheckedIndexedAccess` 等 6 项 + `strict`）重复维护，新增严格项容易漏一侧 | 可提取 `tsconfig.base.json` 供三者 extends；同样属结构变更，留主智能体决策 |

---

## 6. 核验方法与可复现命令

```sh
# 官方依据
sed -n '23p' /home/xuepeng/DSH/deepseekHARNESS/packages/AGENTS.md
sed -n '58,74p' /home/xuepeng/DSH/deepseekHARNESS/docs/development.zh.md
cat /home/xuepeng/DSH/deepseekHARNESS/tsconfig.base.client.json
cat /home/xuepeng/DSH/deepseekHARNESS/packages/client/modules/tsconfig.json

# 同类先例（普通 Client 插件却双 leaf）
cat /home/xuepeng/DSH/deepseekHARNESS/packages/client/file-upload/tsconfig.json
cat /home/xuepeng/DSH/deepseekHARNESS/packages/client/file-upload/tsconfig.host.json
cat /home/xuepeng/DSH/deepseekHARNESS/packages/client/file-upload/tsconfig.client.json
grep -n 'file-upload' /home/xuepeng/DSH/deepseekHARNESS/tsconfig.host.json        # :163 host leaf 进 host aggregate
grep -n 'file-upload' /home/xuepeng/DSH/deepseekHARNESS/tsconfig.client.json      # :62  client leaf 进 client aggregate

# Context augmentation 实证
sed -n '22,25p' /home/xuepeng/DSH/deepseekHARNESS/packages/host/webserver/src/index.ts
grep -rln "declare module '@deepseek-ai/cordis'" /home/xuepeng/DSH/deepseekHARNESS/packages/client --include=*.ts | grep -v /lib/
```

**未运行任何 `tsc`**（无需：结论不依赖新增实测；主仓已有的并集先例 `client/modules` 已足以判定「lib/types 并集不报错」这一关键事实）。

---

## 7. 结论

1. **结构有官方依据**：`packages/AGENTS.md:23` 明文规定「distinct Host and Client compiler faces ⇒ `tsconfig.host.json` + `tsconfig.client.json` leaves + solution-only root」；`docs/development.zh.md:62` 对 solution 根的定义与本仓 `tsconfig.json` 逐字同构；`packages/client/file-upload` 提供了「普通 Client 插件同样双 leaf」的直接先例。
2. **不属于必要例外**：本插件两侧是真正的不同编译面（Node 服务面 vs 浏览器 React 面），且两份运行时产物不在同一构建阶段，正是 `:72` 末句所排除的对象之外。
3. **不可退回单一 program**：能编译（有并集先例），但会放宽两侧可见性、违反 `tsconfig.base.client.json:5` 的官方立场、并给 P3/P4 的 `Context` 声明合并冲突留隐患。
4. **本核验未改动任何 tsconfig 结构**（含 `tsconfig.tests.json`）；§5 的 R1/R3 两项结构性问题已如实登记，交主智能体决策。
