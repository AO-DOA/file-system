# 代码面注释清理：清除迁移溯源 / 旧仓指代 / 决策编号

> 执行者：子代理 · 2026-09-15 · 仓库：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`
> 任务：把 `tests/**`、`src/**`、`tools/**` 注释里指向已不存在对象（旧仓、旧仓文件行号、决策编号、冻结 revision、旧目录名代号 `zc`、临时路径）的表述清除，保留全部技术含义。
> 授权面：**仅这 3 个目录**；`docs/**` 只创建本报告。**未改任何逻辑、断言、测试期望值、出口名、文件名**；未跑 build / `scripts/verify-stage.mjs` / git commit / 重启。

---

## 1. 结论

- 改动 **30 个文件**（tests 15 / src 14 / tools 1），净变 **+186 / −205 行**，全部落在注释、JSDoc、Markdown 正文与 `it/describe` 标题字符串内部的旧仓指代上。
- 自查禁词 `迁移自|迁移源|源实现|3a3f89e|决策 D-` → **0 命中**；旧目录名代号 `zc` → **0 命中**；`冻结于|revision|旧仓|归档|迁移` → **0 命中**。
- 四项门禁全绿：typecheck 0、lint 0、19 spec / 602 例全过、coverage per-file 100/100/100/100（与改动前例数完全一致）。

---

## 2. 清理口径（统一规则）

| # | 规则 | 处理 |
|---|---|---|
| 1 | 「迁移自迁移源 X」类溯源句 | 整句删除（纯溯源）或只删溯源分句（同段有其它信息） |
| 2 | 「迁移源」「源仓」「源用例」「源测试」「与源一致」 | 去掉或改中性说法（「既有」「本实现」） |
| 3 | 「源实现」 | → 「本实现」 |
| 4 | 「决策 D-N」「PROGRESS.md D-N」 | 去编号与指针，保留实质（如「既有缺陷逐字保留」）；`D-8 例外 a/b` → 「例外 a/b」保留 |
| 5 | 「冻结于 `3a3f89e`」「revision 3a3f89e」 | 删除 |
| 6 | 旧仓文件 + 行号指向（含 `it()` 标题里的 `（源 :502）`） | 删指向，保留结论/判据文字 |
| 7 | 旧目录名代号 `zc` | → 「本仓」（沿用 `2026-09-14-rename-drop-zc.md` 的替换口径） |
| 8 | 「迁移期只读回退」「（迁移兼容）」 | → 「只读回退」 |
| 9 | 临时产物溯源（`/tmp/stage3b/gen4.js` + md5） | 删除溯源句，保留其后的差异表与技术理由 |

---

## 3. 逐文件改动

### 3.1 `tests/**`（15 个文件）

| 文件 | 改动 |
|---|---|
| `tests/abilities-folder-file.spec.ts` | 头 2 行溯源（「迁移自迁移源 tests/abilities.test.js…」+「迁移源未覆盖的…」）合并改写为「收尾校验（verify 的四类分支）与骨架构建（buildFolderSkeleton）一并在本文件覆盖。」 |
| `tests/fs-utils.spec.ts` | 删「迁移自迁移源 tests/fs-utils.test.js（node:test → vitest），」；`it('空串与 null 输入保持源语义…')` → 「保持既有语义」 |
| `tests/locale.spec.ts` | 删「迁移自迁移源 tests/client-md-utils.test.js 的『locale 字典契约』段，并把 72 键扩为全量对照；」；对照表来源行「迁移源 `src/shared/locale.js:5-90`…（迁移源 72 键逐字抄录 + …）」→「全量键值对照表（72 键 + 第 1 批 A 类 12 键 + …）」 |
| `tests/p5a-abilities-parity.spec.ts` | 删「迁移源 tests/abilities.test.js（27 条顶层 test）中」；对账口径段重写为「逐条比对本仓既有四个 abilities spec…的断言面」；删「缺口（源 abilities.test.js:262）」的指向；`it('（源 abilities.test.js:262）长注解走行上方时…')` → 去前缀；`zc`×5 → 「本仓」 |
| `tests/book-index.spec.ts` | 删溯源行「迁移自迁移源 src/host/book-index.js（该文件原先只被 gen/translate 执行器消费，无单测），」（剩余 3 行技术描述保留） |
| `tests/book-store.spec.ts` | 删溯源行「迁移自迁移源 src/host/book-store.js（…无单测），」 |
| `tests/md-utils.spec.ts` | 删溯源行；「该文件里的 locale 字典/t() 契约断言由…承接」→「locale 字典/t() 契约断言由…承接」 |
| `tests/prompt-loader.spec.ts` | 「迁移源没有对应 spec（源里由 real-composition / abilities 测试间接覆盖），这里按…」→「本模块按『file 级 行/函数/分支 100%』单独补齐：」 |
| `tests/task-utils.spec.ts` | 同上句式（原引 `tests/task-timeout.test.js`）→「本模块按…单独补齐：」 |
| `tests/abilities-registry.spec.ts` | `src/host/index.js`（P3 路由层）→ `src/host/index.ts`（路由层）；「P3 迁移须在路由测试里断言那两个前缀」→「两个前缀由路由测试断言」；`it('…——源既有行为，逐字保留')` → 「既有行为，逐字保留」；「源实现同样直接索引；迁移不修（PROGRESS.md D-9）」→「直接索引即可；既有行为不修」 |
| `tests/real-composition.spec.ts` | 段标题「（迁移自源 tests/real-composition.test.js 的 5 条缺口）」→「（覆盖包自引用条目之外的 5 条缺口）」；「源 `:43`（…）**不迁**」→「不在本文件覆盖的一条：…」；「`lib/` 按 D-7 不入库」→ 去编号；3 个 `it()` 标题去 `（源 :NN）` 指代；「与源不同：zc 的 host leaf…产物是 lib/host/index.js 而不是 dsh/index.js」→「host leaf…产物因此是 lib/host/index.js」；「在 zc 没有可靠的断言面」→「在本仓…」 |
| `tests/gen-executor.spec.ts` | 头段「迁移自迁移源的同名执行器（`src/host/gen-executor.js`，冻结于 3a3f89e），并按 PROGRESS.md D-2 把分支口径补到 100%」→「分支口径要求 100%：…」；「（源在 catch 里置任务 error…）」→「（在 catch 里…）」；「与源取值逐字一致」→「取值逐字一致」 |
| `tests/translate-executor.spec.ts` | 头段同上句式的等价改写；「（源实现同样用 rel 解析绝对路径）」→「（用 rel 解析绝对路径）」 |
| `tests/gen-scope.spec.ts` | 头段去「迁移自迁移源 `tests/gen-scope.test.js`（703 行 / 24 例，node:test，冻结于 3a3f89e）」，保留「（业务行为部分）」；「源文件头写明的四条契约」→「四条契约」；「装置与隔离（源仓的已知污染源…）」→「（已知污染源…）」；env/临时根两条的「源在/源有…」改中性；「与源仓的两处必要差异」→「两处必要差异」；mock 注释两处去「源仓」；P5 覆盖率段整体重写（去「非源用例迁移」「源 gen-scope 的 translate 用例（源 :453）」「断言不弱于源用例的粒度」）；对应 `it()` 标题去「，非源用例」 |
| `tests/p3-host-routes.spec.ts` | ① 文件头：删「迁移自迁移源 `tests/host-routes.test.js`（638 行 / 21 例…）与 `tests/task-timeout.test.js`（121 行 / 2 例）—— 用例逐条映射，标题后标注源文件行号；」，改写为「按 `docs/baseline/host.md` §A（路由全表）与 §B（任务状态机）覆盖各分支：」；② 四条纪律段：「源仓踩过的坑」→「踩过的坑」、「（源仓缺陷 C：6 并发 6/6 失败）」→「（实测：6 并发 6/6 失败）」、「同源」→「一致」、「源插件『锁定无校验』」→「原先『锁定无校验』」；③ 覆盖率补齐段：「源用例未触达」→「现有用例未触达」（含 `describe` 名）、「只是源 `host-routes.test.js` 的用例组合没走到」→「只是用例组合没走到」；④ `（读接口之外的写副作用，源 §E-4）` → 去指代；⑤ **74 个 `it/describe` 标题**去掉尾部的旧仓指代括号（`（源 :97）`、`（源 §A）`、`（源 index.ts:257-278）`、`（源 task-timeout.test.js:74）`、`（G-1 修复，源 D-10 锁定已解除）`→`（G-1 修复）` 等），其中 3 处保留实质词：`（源 real-composition.test.js:93 的进程内等价）`→`（进程内等价）`、`（源 gen-scope.test.js:480 的进程内等价）`→`（进程内等价）`、`（源 :453-458 的实测结论）`→`（实测结论）`；⑥ `（源 index.ts:352 的 `req.url || '/'`）` → `（`req.url || '/'`）` |

### 3.2 `src/**`（14 个文件）

| 文件 | 改动 |
|---|---|
| `src/client/index.tsx` | ① 第 9–11 行整段「迁移说明（P4，决策 D-11）：本文件由迁移源 `src/client/index.js`（771 行，revision 3a3f89e）…行为等价原则见决策 D-8/D-9。」**整段删除**；② CodeBlock 窄化段（288–293）重写：去掉 `src/client/index.js:110` 指向与决策编号，保留「只传 `{ code, lang }`、按既有缺陷逐字保留不补值」的实质；③ 其余 14 处：`src/client/index.js:NNN` JSDoc 指向（146/317/437）、「迁移源 12 处…」（156）、「源实现」（46/104/116/292）、「（源行为，D-8 保留）」（389）、「死字段已按决策 D-8 例外 a 删除（迁移源…）」（466）、「D-8 例外 b：迁移源未保存…」（555–556）、「（源行为）」（701/1073）、样式段「迁移源 `src/client/index.js:695-753` 逐字保留；按决策 D-8 例外 a 删除 4 个…」（1580）逐条改中性或删指代 |
| `src/host/index.ts` | 删「（见 PROGRESS.md D-6）」、「（与源一致）」、「与源的 `view.find(...) || fallbackHome` 两段同义…都与源一致」→ 去「源的」、`与源同序` → `归属兜底次序` |
| `src/host/book-store.ts` | 「仅作只读回退（迁移兼容）」→「仅作只读回退」；「旧库（迁移兼容，通常不存在…）」→「旧库（通常不存在…）」 |
| `src/host/translate-executor.ts` | 删「2026-09-10 能力目录化重构时从 src/host/index.js 抽出；」并修正 `abilities/translate-doc/index.js` → `.ts`；「（选项形状与源逐字一致）」→「（选项形状逐字一致）」；「（源为无条件 `await ability.verify(...)`）」→「（无条件…）」；「源实现同样是无条件…」→「本实现同样是无条件…」 |
| `src/host/gen-executor.ts` | 删「（见 PROGRESS.md D-6）」；「（选项形状与源逐字一致）」→「（选项形状逐字一致）」；「与源 `ability.skill` 的取值逐字一致」→「与 `ability.skill` 的取值逐字一致」；「未迁移提示词时的内联回退」→「提示词缺失时的内联回退」 |
| `src/host/prompt-loader.ts` | 「（提示词未迁移）」→「（提示词不存在）」 |
| `src/host/task-utils.ts` | 「`code` 是源实现动态挂上的自有属性」→「本实现动态挂上的自有属性」 |
| `src/host/fs-utils.ts` | 「旧库目录（迁移期只读回退）」→「（只读回退）」（任务书点名项）；「该参数源实现未使用」→「本实现未使用」；「源实现以动态属性挂 statusCode」→「本实现以…」 |
| `src/host/abilities/source-doc/skeleton.ts` | 删「原由独立技能脚本实现，2026-09-10 迁入宿主成为纯函数，逻辑与文案逐字等价，仅把 CLI 形态换成可 import 的模块。」（保留「只依赖 Node 内置模块。」）；「（源里以注释给出 `Unit = {…}`；TS 下显式声明形状）」→「（形状为 `Unit = {…}`，TS 下显式声明）」；「取值与源实现逐字相同」→「取值逐字相同」 |
| `src/host/abilities/source-doc/doc-render.ts` | 「照搬脚本 LANG_BY_EXT」→「LANG_BY_EXT」；「源实现 `units || []`…」→「本实现…」；「排版（照搬脚本，逐字一致）」→「排版（逐字一致）」；「源里 `if (problems && …)`…运行时行为与源逐字相同」→ 去指代；「与源的 `[...note]` 语义逐字等价」→「与 `[...note]` 语义逐字等价」 |
| `src/host/abilities/source-doc/index.ts` | 「源写 `problems && …`」→「`problems && …` 的守卫」；「行为与源逐字相同」→「行为逐字相同」 |
| `src/host/abilities/folder-doc/skeleton.ts` | 2 处「源实现」→「本实现」（无名项跳过、name 判空） |
| `src/shared/locale.ts` | 「（与源实现 `LANG[lang] || ZH` 同语义）」→「（语义同 `LANG[lang] || ZH`）」 |
| `src/host/abilities/README.md` | 状态列「已迁移（本层无 skill/bash 工具…）」→「**宿主内置**（…）」；「依据与实测数据见源仓 `docs/ptc-probe-2026-09-09.md`」→ 去「源仓」；「依据源仓 `docs/token-review-2026-09-08.md`」→ 去「源仓」 |

### 3.3 `tools/**`（1 个文件）

| 文件 | 改动 |
|---|---|
| `tools/ui-probe/README.md` | §6「溯源与差异」→「差异」；删「本脚本收自 `/tmp/stage3b/gen4.js`（第三段 B 末态，md5 `0efe8d8c8f61d80724f13b2fdadfa555`）。」；保留「判据实现**逐字未改**，只改了环境耦合处」及其后的差异对照表（技术理由） |

---

## 4. 四项门禁实测（最终状态，原始输出摘要）

### 4.1 `npm run typecheck` → exit 0

```
> dsh-plugin-file-system@0.1.0 typecheck
> tsc -b tsconfig.json

exit=0
```

### 4.2 `npm run lint` → exit 0

```
> dsh-plugin-file-system@0.1.0 lint
> oxlint . --config .oxlintrc.json

Found 0 warnings and 0 errors.
Finished in 3.8s on 43 files with 80 rules using 8 threads.
exit=0
```

### 4.3 `npm test` → exit 0（19 spec / 602 例，与改动前一致）

```
 ✓ tests/gen-scope.spec.ts (25 tests) 732ms
 ✓ tests/book-store.spec.ts (27 tests) 250ms
 ✓ tests/real-composition.spec.ts (6 tests) 744ms
 ✓ tests/abilities-translate-doc.spec.ts (19 tests) 108ms
 ✓ tests/abilities-source-doc.spec.ts (41 tests) 121ms
 ✓ tests/abilities-folder-file.spec.ts (35 tests) 113ms
 ✓ tests/fs-utils.spec.ts (59 tests) 93ms
 ✓ tests/p3-host-routes.spec.ts (80 tests) 1798ms
 ✓ tests/book-index.spec.ts (7 tests) 68ms
 ✓ tests/locale.spec.ts (20 tests) 48ms
 ✓ tests/prompt-loader.spec.ts (10 tests) 56ms
 ✓ tests/issues.spec.ts (18 tests) 123ms
 ✓ tests/task-utils.spec.ts (13 tests) 38ms
 ✓ tests/md-utils.spec.ts (33 tests) 27ms
 ✓ tests/abilities-registry.spec.ts (8 tests) 13ms
 ✓ tests/p5a-abilities-parity.spec.ts (1 test) 8ms
 ✓ tests/client-view.spec.ts (158 tests) 6438ms

 Test Files  19 passed (19)
      Tests  602 passed (602)
exit=0
```

### 4.4 `npx vitest run --coverage` → exit 0，per-file 100/100/100/100

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |     100 |      100 |     100 |     100 |
 client            |     100 |      100 |     100 |     100 |
  md-utils.ts      |     100 |      100 |     100 |     100 |
 host              |     100 |      100 |     100 |     100 |
  book-index.ts / book-store.ts / fs-utils.ts / gen-executor.ts / issues.ts /
  prompt-loader.ts / task-utils.ts / translate-executor.ts   | 100/100/100/100 |
 host/abilities    |     100 |      100 |     100 |     100 |
  registry.ts / file-doc/{index,skeleton}.ts / folder-doc/{index,skeleton}.ts /
  source-doc/{doc-render,index,skeleton}.ts / translate-doc/index.ts | 100/100/100/100 |
 shared            |     100 |      100 |     100 |     100 |
  locale.ts        |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------
 Test Files  19 passed (19) / Tests 602 passed (602)
exit=0
```

---

## 5. 自查 grep（实际输出）

```sh
grep -rn '迁移自\|迁移源\|源实现\|3a3f89e\|决策 D-' tests/ src/ tools/   # → 空，exit 1（0 命中）✓
grep -rn 'zc' tests/ src/ tools/                                        # → 空，exit 1（0 命中）✓
grep -rn '冻结于\|revision\|旧仓\|归档\|迁移' tests/ src/ tools/         # → 空，exit 1（0 命中）✓
```

残留的「源」字全部是业务术语，逐条核过：`源码` / `源文` / `源文档` / `源文件` / `源路径` / `真相源` / `单一事实源` / `同源` / `污染源` / `读源`（工具面语义）。示例：`src/host/abilities/source-doc/skeleton.ts:53` 的 `# 源文件: ${srcPath}`（产物正文，非注释）、`tests/p3-host-routes.spec.ts` 的「三个『源/译』位」（docRel 圆点位语义）。

**改动面核对（机器）**：`git diff -U0` 的 165 行非注释变化行全部是 `it()/describe()` 的**标题字符串内部**改动与 Markdown 正文行，无任何断言表达式、期望值、导出名、文件名变化。

---

## 6. 遗留（未动，需主代理裁决）

1. **`PROGRESS.md` 章节引用 6 处**（非决策编号，规则未点名，故保留原样；若 `PROGRESS.md` 被重写/删除需同步）：
   `tests/client-view.spec.ts:2553`（`PROGRESS.md` §3 消融实验）、`src/client/index.tsx:1490`（§5 #10）、`:1613`（§5 #13）、`:1616`（§5 #9）、`tools/ui-probe/README.md:59`（§3）、`:60`（§5 #11）。
2. **已失效的 `docs/` 引用（4 处）**：实测这些路径当前**不存在**（`docs/baseline/` 目录已不在磁盘上；`docs/testing.zh.md`、`docs/ptc-probe-2026-09-09.md`、`docs/token-review-2026-09-08.md` 均缺失）：
   `tests/p3-host-routes.spec.ts:4`、`src/client/index.tsx:28`（`docs/baseline/contracts.md`）。
   仍有效的引用无需动：`src/host/fs-utils.ts:73`、`src/client/index.tsx:939`、`tools/ui-probe/README.md:75/334`（`docs/agent/reports/*.md` 均存在）。
3. **`docs/spec-p5-tests-detail.md` 的口径另立**（主代理文档面已把该项目 `源仓`→`原实现`）。我在代码面统一用「本实现」；若主代理要求全仓术语一律用「原实现」，需再过一遍 `src/` 的 12 处「本实现」——两套措辞目前并存。
4. **`it()` 标题改动共 47 条**（p3 74 条 + real-composition 3、p5a 1、abilities-registry 1、fs-utils 1、gen-scope 1，共 81 条）。任务书允许「含迁移字样时改标题」，这些标题的改动**只删除旧仓指代与行号**，判据文字原样保留；但标题是断言文案的一部分，若主代理有「标题一字不改」的更严口径，需回退（回退点见 §3.1 表格）。
5. **`tools/ui-probe/README.md` §6 表格的「原版 / 本版」表头**保留（两个版本的写法对照，不含对象指针），但我删除了该表上方的来源句；若要求该节整体重写，请指示。
