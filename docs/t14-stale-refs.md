# T-14 陈旧引用扫描报告 — skills / issues / docs / README

> 执行者：T-14 子智能体 · 2026-09-11 · 目标仓 `dsh-plugin-file-system-zc`
> 迁移源（只读，冻结）：`../dsh-plugin-file-system` @ `3a3f89e`
> 口径（用户拍板）：「文档我们可以复制和修改路径就好，技能之类的全部连接到新版本」——
> 文档照搬、路径改新仓；技能侧一切引用指向新版本。

---

## 0. 结论摘要

| 项 | 数 | 说明 |
|---|---|---|
| 扫描命中总数 | 107 | 范围：`skills/` `issues/` `docs/` `README.md`（5 类目标模式） |
| **本轮已改为新仓** | **24** | §2，全部为注释/文档文字，零逻辑改动 |
| 保留并说明理由 | 104 | §3，历史事实、迁移源清点基线、P6 切换操作规格等 |
| 已核对为误报 | 3（表内）+ 3 类（表外） | §4 |
| 范围外高优先级发现 | 1 | §5：`src/host/fs-utils.ts:1` 文件头仍写旧包名（本轮硬约束禁改 `src/`） |

**一句话**：`skills/` 侧 24 处陈旧引用已全部修正并自证为零逻辑改动；`issues/` 21 个文件逐字复制入库，其中 13 行命中经逐条核对**全部属历史事实**（当时的问题现象），按「不得改写历史条目事实内容」保留原样；`docs/` 89 行命中为迁移源清点基线与历史归档，保留。

---

## 1. 扫描方法与范围

### 1.1 目标模式（5 类）

| # | 类型 | 正则/判据 |
|---|---|---|
| 1 | 旧包名 `dsh-plugin-file-system`（不带 `-zc`） | `dsh-plugin-file-system($\|[^-])` |
| 2 | 旧构建产物路径 | `dsh/index\.js` |
| 3 | 旧仓才有的文档 | `book-store-(decisions\|spec)\.md`、`refactor-(spec\|summary)`、`GLOSSARY\.md`、`AGENTS\.md`、`architecture\.md`、`code-standard-audit` |
| 4 | 写死的用户绝对路径 | `/home/xuepeng` |
| 5 | （扫描中新发现）旧仓才有的 `.js` 源文件 | `src/host/fs-utils.js`（新仓为 `fs-utils.ts`） |

### 1.2 独立扫描，不依赖上一轮清单

本轮**未**只按下发清单执行：先对 `skills/` `issues/` `docs/` `README.md` 做上述 5 类全量正则扫描（107 条命中），再逐条判定。相比上一轮 `docs/p1c-skills-migration.md` 的 A/B/C 三类清单，本轮**新发现两类**：

- **第 5 类**：`src/host/fs-utils.js` 引用 7 处（4 个 `.mjs` 都写「命名规则三处同步 ① src/host/fs-utils.js computeDocStem」）——新仓该文件为 `src/host/fs-utils.ts`，已确认 `projectKey()`（`:16`）与 `computeDocStem()`（`:77`）均在其中，改名后指向准确。
- **C 类书库文档的第 4、5、6 处**：上一轮只列了 3 个 `.mjs` 第 5 行；实际 `skills/source-doc/scripts/source-annotate.mjs:12`、`skills/file-doc/SKILL.md:20`、`skills/folder-doc/SKILL.md:20` 也引用了 `docs/book-store-decisions.md`，共 6 处。

### 1.3 处置判据（三条）

1. **指向真实对象的引用**（宿主产物、台账目录、源码文件、文档）→ 陈旧即改。
2. **历史条目的事实内容**（当时的现象、当时的命令输出、当时的文件路径）→ **一律不改**，改了就是篡改证据。
3. **命名规则的演示样例**（「任意相对路径 → 生成文件名」的举例数据）→ 不算引用，见 §4。

---

## 2. 已改为新仓（24 处）

### 2.1 A 类 · 旧包名 · 台账路径（4 处）

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `skills/file-doc/SKILL.md:55` | 就按 `plugins/dsh-plugin-file-system/issues/_template.md` 记一条 | 旧包名 | 已改为 `plugins/dsh-plugin-file-system-zc/issues/_template.md` |
| `skills/folder-doc/SKILL.md:61` | 同上句式 | 旧包名 | 同上 |
| `skills/source-doc/SKILL.md:66` | 同上句式 | 旧包名 | 同上 |
| `skills/translate-doc/SKILL.md:55` | 同上句式 | 旧包名 | 同上 |

### 2.2 B 类 · 旧包名 + 旧产物 · `.mjs` 顶部契约注释（3 处）

| 文件:行号 | 原文 | 改后 |
|---|---|---|
| `skills/file-doc/scripts/file-doc.mjs:4` | `// 契约（来自宿主 dsh-plugin-file-system/dsh/index.js）：` | `// 契约（来自宿主 dsh-plugin-file-system-zc/lib/index.js）：` |
| `skills/folder-doc/scripts/folder-doc.mjs:4` | 同上 | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:4` | 同上 | 同上 |

### 2.3 C 类 · 旧仓才有的文档（6 处）

**选择理由**：旧 `docs/book-store-decisions.md`（决策背景）+ `docs/book-store-spec.md`（实现规格）在新仓不存在。新仓与之对应且内容确实覆盖书库集中模型的只有两处：`docs/feature-baseline.md` §2.2「行为契约」中「书库模型」条目（`feature-baseline.md:43`，讲 projectKey 编码、桶结构、upsert 语义、只读回退），以及 `docs/baseline/host.md` §D「书库模型」（`host.md:83-90`，逐条给出实现规格与出处行号）。故按「决策 → feature-baseline §2.2、规格 → baseline/host.md §D」映射；`.mjs` 两处都引，故都写；两个 SKILL.md 只讲桶名算法（对应 `host.md:86` 的 `projectKey` 全文），故只指向 §D。

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `skills/file-doc/scripts/file-doc.mjs:5` | 集中模型，见 `docs/book-store-decisions.md` 与 `docs/book-store-spec.md` | 旧仓文档 | 已改为 `见 docs/feature-baseline.md §2.2 与 docs/baseline/host.md §D` |
| `skills/folder-doc/scripts/folder-doc.mjs:5` | 同上 | 旧仓文档 | 同上 |
| `skills/source-doc/scripts/source-annotate.mjs:12` | 同上 | 旧仓文档 | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:5` | 同上 | 旧仓文档 | 同上 |
| `skills/file-doc/SKILL.md:20` | 无 `<项目名>-book` 中间层；见 `docs/book-store-decisions.md` | 旧仓文档 | 已改为 `见 docs/baseline/host.md §D` |
| `skills/folder-doc/SKILL.md:20` | 同上 | 旧仓文档 | 同上 |

### 2.4 D 类 · 写死的用户绝对路径 · 对拍示例（4 处）

| 文件:行号 | 原文 | 改后 |
|---|---|---|
| `skills/file-doc/scripts/file-doc.mjs:59` | `//   对拍：/home/xuepeng/DSH → --home-xuepeng-DSH--；/home/xuepeng/源码志 → --home-xuepeng-~6E90~7801~5FD7--` | `//   对拍：/home/<user>/DSH → --home-<user>-DSH--；/home/<user>/源码志 → --home-<user>-~6E90~7801~5FD7--` |
| `skills/folder-doc/scripts/folder-doc.mjs:43` | 同上 | 同上 |
| `skills/source-doc/scripts/source-annotate.mjs:66` | 同上 | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:64` | 同上 | 同上 |

改法说明：`/home/xuepeng/...` 不指向新仓任何文件，故按任务口径改为**不含写死绝对路径的等价表述**——`<user>` 为占位符，编码侧同步写 `--home-<user>-DSH--` 以保持「路径 → 桶名」的对应关系可读。**代价**：该示例不再是可实测的锚点；若主智能体认为需要保留实测锚点，可回退原文（属可选润色，非必需修正）。

### 2.5 E 类 · 旧仓才有的 `.js` 源文件引用（7 处）

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `skills/file-doc/scripts/file-doc.mjs:56` | `projectKey 与 DSH session format.ts projectKey 及 src/host/fs-utils.js 同步：` | 旧仓 .js | 已改为 `src/host/fs-utils.ts` |
| `skills/file-doc/scripts/file-doc.mjs:115` | `① src/host/fs-utils.js computeDocStem` | 旧仓 .js | 同上 |
| `skills/folder-doc/scripts/folder-doc.mjs:40` | 同 `:56` | 旧仓 .js | 同上 |
| `skills/source-doc/scripts/source-annotate.mjs:63` | 同 `:56` | 旧仓 .js | 同上 |
| `skills/source-doc/scripts/source-annotate.mjs:248` | 同 `:115` | 旧仓 .js | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:18` | 同 `:115` | 旧仓 .js | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:61` | 同 `:56` | 旧仓 .js | 同上 |

---

## 3. 保留并说明理由（104 处）

### 3.1 `issues/` —— 13 处命中，**全部保留**（历史事实）

`issues/` 由 `cp -a` 逐字复制自源仓（21 文件 / 929 行，权限位一致，`diff -r` 无差异）。复制后逐条核对全部命中行，**没有任何一处是形如 `plugins/dsh-plugin-file-system/…` 或 `dsh-plugin-file-system/dsh/index.js` 的「指向旧仓路径」式引用**：全部是当时的问题现象、当时的命令输出、当时的被注解文件路径。按「不得改写历史条目的事实内容」，**一处未改**。

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `issues/2026-08-30-05-build-no-indexjson.md:15` | `node scripts/source-annotate.mjs build 骨架.md … --book /home/xuepeng/program/yuanma/.book/yuanma-book` | 绝对路径 | 保留：当时执行的命令原文 |
| `issues/2026-08-30-05-build-no-indexjson.md:22` | `已生成: /home/xuepeng/program/yuanma/.book/yuanma-book/源码注解/opencode-opencode.md` | 绝对路径 | 保留：当时的命令输出 |
| `issues/2026-08-30-05-build-no-indexjson.md:23` | `[source-annotate] 找不到 index.json: /home/xuepeng/program/yuanma/.book/yuanma-book/index.json` | 绝对路径 | 保留：当时的报错原文 |
| `issues/2026-09-03-08-gen-content-path-overwrite.md:24` | `/home/xuepeng/DSH/DSHworkPace/.book/DSHworkPace-book/目录概览/dsh-plugin-file-system.md` | 绝对路径 + 含旧包名 | 保留：这是**被覆盖进文档的路径字符串本身**，即缺陷证据；文件名 `dsh-plugin-file-system.md` 是当时被注解目录名的派生，不是包引用 |
| `issues/2026-09-07-09-translate-doc-frontmatter-not-generated.md:23` | `与宿主 dsh/index.js 的 prompt …` | 旧产物 | 保留：当时旧包产物确为 `dsh/index.js`，改成 `lib/` 即篡改历史 |
| `issues/2026-09-08-10-folder-doc-content-whole-override.md:18` | `node scripts/folder-doc.mjs gen /home/xuepeng/DSH/DSHworkPace/plugins \` | 绝对路径 | 保留：当时执行的命令原文 |
| `issues/2026-09-08-10-folder-doc-content-whole-override.md:19` | `--root /home/xuepeng/DSH/DSHworkPace --key 'DSHworkPace/plugins'` | 绝对路径 | 保留：同上 |
| `issues/2026-09-09-12-translate-long-doc-reasoning-overflow.md:22` | `译文未写入目标文件: /home/xuepeng/.dsh/books/--home-xuepeng-DSH--/文章翻译/…` | 绝对路径 | 保留：当时的任务报错原文 |
| `issues/2026-09-09-12-translate-long-doc-reasoning-overflow.md:35` | `对比：同一模板处理中文源文档（GLOSSARY.md，19KB）…` | 旧仓文档名 | 保留：`GLOSSARY.md` 是**当时被翻译的源文档**（源仓的术语表），属实验对象而非引用 |
| `issues/2026-09-09-12-translate-long-doc-reasoning-overflow.md:47` | `中文源复验：GLOSSARY.md → 直接 error「源文档已是简体中文，无需翻译」` | 旧仓文档名 | 保留：同上 |
| `issues/2026-09-09-13-l3-skeleton-block-code-prefix.md:18` | `把注解写入骨架 /home/xuepeng/.dsh/books/session/skeleton-task-utils.js.txt` | 绝对路径 | 保留：当时的骨架落盘路径 |
| `issues/2026-09-09-14-l3-anno-old-string-context-mismatch.md:20` | `ToolCallError: old_string was not found in "/home/xuepeng/.dsh/books/session/…"` | 绝对路径 | 保留：当时的工具报错原文 |
| `issues/2026-09-09-19-l3-annotation-typo-self-fix.md:14` | `为 dsh-plugin-file-system/src/host/book-store.js 填充 L3 逐行注解` | 旧包名 | 保留：当时被注解的就是该仓该文件，是场景事实 |

> `issues/README.md` 与 `_template.md` 内**零命中**：索引表用的是仓内相对链接（`2026-08-30-01-build-src-optional.md`），复制到新仓后链接原样成立。

### 3.2 `docs/` —— 89 处命中，**全部保留**

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `docs/baseline/client.md:2` | `来源: ../dsh-plugin-file-system` | 迁移源 | 保留：清点基线的来源声明，指的就是源仓 |
| `docs/baseline/client.md:237` | `AGENTS.md §6 冒烟第 2 条称…` | 旧仓文档名 | 保留：被清点的对象（源仓 `AGENTS.md`） |
| `docs/baseline/host.md:3` | `\| 来源 \| ../dsh-plugin-file-system \|` | 迁移源 | 保留：同上 |
| `docs/baseline/host.md:10` | `# dsh-plugin-file-system host 侧功能清点基线` | 旧包名 | 保留：标题即「被清点仓」的名字 |
| `docs/baseline/contracts.md:3` | `\| 来源 \| ../dsh-plugin-file-system \|` | 迁移源 | 保留 |
| `docs/baseline/contracts.md:16` | `# dsh-plugin-file-system 基线清点报告` | 旧包名 | 保留 |
| `docs/baseline/contracts.md:18` | `仓库：/home/xuepeng/.../dsh-plugin-file-system，HEAD 3a3f89e` | 绝对路径 | 保留：清点对象的定位与冻结证据 |
| `docs/baseline/contracts.md:29` | `\| name \| :2 \| dsh-plugin-file-system \| 必须逐字保留…` | 旧包名 | 保留：逐字段清点结果 |
| `docs/baseline/contracts.md:33` | `\| main \| :6 \| ./dsh/index.js \| 必须改（例：./lib/index.js）…` | 旧产物 | 保留：**清点结论就是「必须改」**，已在新仓执行 |
| `docs/baseline/contracts.md:34` | `\| exports["."] \| :8 \| ./dsh/index.js \| 必须同步改…` | 旧产物 | 保留：同上 |
| `docs/baseline/contracts.md:52` | `files/exports 指向变化必须同步的清单：:6、:8、:9、:13；连带 real-composition.test.js:26-28 的三条断言` | 旧产物 | 保留：清点结论 |
| `docs/baseline/contracts.md:62` | `# client 端经 exports["./client"] 在 /plugins/dsh-plugin-file-system/client.js 被 web 壳加载；` | 旧包名 | 保留：源仓运行时路径实录 |
| `docs/baseline/contracts.md:67` | `10         name: dsh-plugin-file-system` | 旧包名 | 保留：源仓 cordis.patch.yml 逐字摘录 |
| `docs/baseline/contracts.md:100` | `description: … 由插件包 dsh-plugin-file-system 作为载体分发。` | 旧包名 | 保留：源仓字段逐字摘录 |
| `docs/baseline/contracts.md:129` | `\| :78-80 \| writeFileSync('dsh/index.js', hostCode) \|` | 旧产物 | 保留：源仓 build.mjs 实录 |
| `docs/baseline/contracts.md:138` | `\| host \| dsh/index.js（:79） \| esbuild ESM 文本 …` | 旧产物 | 保留：产物实测记录 |
| `docs/baseline/contracts.md:141` | `无 dsh/index.js.map … .gitignore 忽略 dsh/client.js 与 dsh/index.js …` | 旧产物 | 保留 |
| `docs/baseline/contracts.md:142` | `.oxlintrc.json:15-17 注释亦记「构建产物目录：dsh/client.js …」` | 旧产物 | 保留 |
| `docs/baseline/contracts.md:169` | `t.skip('dsh/index.js 构建产物不存在（未 build）…')` | 旧产物 | 保留：源仓测试原文 |
| `docs/baseline/contracts.md:188` | `…src/host/index.js 路由处理；…` | 旧仓 .js | 保留：源仓当时的路由实现文件（新仓为 `src/host/index.ts`，但此行描述的是**被清点仓**） |
| `docs/baseline/contracts.md:311` | `tests/real-composition.test.js:26-28 —— 把 ./dsh/index.js、./dsh/client.js 焊进断言，是必须同步修改的测试` | 旧产物 | 保留：清点结论 |
| `docs/baseline/contracts.md:316` | `AGENTS.md 的两条红线被本任务推翻…` | 旧仓文档名 | 保留：源仓台账 |
| `docs/baseline/contracts.md:321` | `- 包名 dsh-plugin-file-system（package.json:2；被 yml、build、测试三处引用）。` | 旧包名 | 保留 |
| `docs/baseline/contracts.md:322` | `- cordis.patch.yml:9-10 的 id: fs 与 name: dsh-plugin-file-system。` | 旧包名 | 保留 |
| `docs/baseline/contracts.md:344` | `- dsh/client.js 在运行时的实际加载路径…/plugins/dsh-plugin-file-system/client.js…` | 旧包名 | 保留 |
| `docs/baseline/contracts.md:350` | `1. package.json:2 name: "dsh-plugin-file-system"` | 旧包名 | 保留 |
| `docs/baseline/contracts.md:353` | `4. cordis.patch.yml:8-10 - insert: / id: fs / name: dsh-plugin-file-system` | 旧包名 | 保留 |
| `docs/baseline/contracts.md:386` | `\| 15 \| AGENTS.md §3 门禁命令、§4 目录职责（dsh/ → lib/）…` | 旧仓文档名 | 保留 |
| `docs/baseline/contracts.md:391` | `只读纪律确认：…dsh/client.js（44579 字节）与 dsh/index.js（82326 字节）mtime 保持…` | 旧产物 | 保留：源仓未污染的原始证据 |
| `docs/feature-baseline.md:1` | `# 功能基线总表 — dsh-plugin-file-system → dsh-plugin-file-system-zc` | 旧包名 | 保留：标题即「旧 → 新」映射 |
| `docs/feature-baseline.md:57` | `\| main / exports["."] … \| ./dsh/index.js / ./dsh/client.js \| ./lib/index.js …` | 旧产物 | 保留：改动前后对照表，旧值必须在 |
| `docs/feature-baseline.md:64` | `\| real-composition 测试 \| :26-28 焊死 ./dsh/index.js \| 改为 lib/…` | 旧产物 | 保留：迁移映射表 |
| `docs/feature-baseline.md:86` | `\| G-11 \| AGENTS.md §6 冒烟第 2 条…` | 旧仓文档名 | 保留：被清点对象 |
| `docs/p1c-skills-migration.md:3` | `- 迁移源（只读）：/home/xuepeng/.../dsh-plugin-file-system` | 绝对路径 | 保留：P1c 历史归档的输入声明 |
| `docs/p1c-skills-migration.md:4` | `- 目标仓：/home/xuepeng/.../dsh-plugin-file-system-zc` | 绝对路径 | 保留：同上（新仓路径） |
| `docs/p1c-skills-migration.md:15` | `$ cd /home/xuepeng/.../dsh-plugin-file-system && git status --short` | 绝对路径 | 保留：P1c 未污染证据的命令原文 |
| `docs/p1c-skills-migration.md:30` | `$ diff -r /home/xuepeng/.../dsh-plugin-file-system/skills \` | 绝对路径 | 保留：P1c 逐字一致证据的命令原文 |
| `docs/p1c-skills-migration.md:31` | `/home/xuepeng/.../dsh-plugin-file-system-zc/skills` | 绝对路径 | 保留：同上（新仓路径） |
| `docs/p1c-skills-migration.md:158` | `### 3.1 A 类：指向旧包名 dsh-plugin-file-system —— 共 7 条` | 旧包名 | 保留：历史归档的扫描结论（该 7 条本轮已全部执行，见 §2.1/§2.2） |
| `docs/p1c-skills-migration.md:162` | `\| A1 \| file-doc.mjs:4 \| // 契约（来自宿主 dsh-plugin-file-system/dsh/index.js）：…` | 旧包名 | 保留：归档清单条目 |
| `docs/p1c-skills-migration.md:163` | A2 同上 | 旧包名 | 保留 |
| `docs/p1c-skills-migration.md:164` | A3 同上 | 旧包名 | 保留 |
| `docs/p1c-skills-migration.md:165` | A4 `…plugins/dsh-plugin-file-system/issues/_template.md…` | 旧包名 | 保留 |
| `docs/p1c-skills-migration.md:166` | A5 同上句式 | 旧包名 | 保留 |
| `docs/p1c-skills-migration.md:167` | A6 同上句式 | 旧包名 | 保留 |
| `docs/p1c-skills-migration.md:168` | A7 同上句式 | 旧包名 | 保留 |
| `docs/p1c-skills-migration.md:171` | `- A1–A3 是 .mjs 头部注释…同时命中旧构建产物路径 dsh/index.js…` | 旧产物 | 保留：归档分析 |
| `docs/p1c-skills-migration.md:172` | `- A4–A7 是四个 SKILL.md 的「技能踩坑」章节中对问题台账目录的引用…新仓当前无 issues/ 目录…` | 旧包名 | 保留：归档分析（**该结论已过时**：本轮 T-14 已把 `issues/` 迁入新仓） |
| `docs/p1c-skills-migration.md:178` | `\| C1 \| file-doc.mjs:4 \| …旧包的 bundle 产物路径；新包产物为 lib/index.js \|` | 旧产物 | 保留：归档清单条目 |
| `docs/p1c-skills-migration.md:186` | `\| file-doc.mjs:14 \| //   例：dsh/index.js → dsh-index.md；… \| 文档命名规则的示例…` | 命名示例 | 保留：归档已判为命名示例（与本报告 §4.1 一致） |
| `docs/p1c-skills-migration.md:187` | `file-doc.mjs:113 \| 同上` | 命名示例 | 保留 |
| `docs/p1c-skills-migration.md:190` | `source-annotate.mjs:245 \| 同上` | 命名示例 | 保留 |
| `docs/p1c-skills-migration.md:198` | `\| B1 \| file-doc.mjs:59 \| //   对拍：/home/xuepeng/DSH → … \|` | 绝对路径 | 保留：归档清单条目（该 4 条本轮已执行，见 §2.4） |
| `docs/p1c-skills-migration.md:215` | `- 指向旧包名 dsh-plugin-file-system：7 条…` | 旧包名 | 保留：归档小结 |
| `docs/p1c-skills-migration.md:216` | `- 写死旧构建产物路径 dsh/index.js：3 条…` | 旧产物 | 保留 |
| `docs/p1c-skills-migration.md:217` | `- 源仓 / 用户绝对路径 /home/xuepeng/...：4 条…` | 绝对路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:4` | `> 台账出处：PROGRESS.md §2 决策 D-6（…按 packages/AGENTS.md:23…）` | 官方主仓路径 | 保留：DSH 主仓 checkout 内路径，非本仓 |
| `docs/p2a-tsconfig-d6.md:6` | `> 官方 checkout：/home/xuepeng/DSH/deepseekHARNESS/（下称「主仓」）` | 官方主仓路径 | 保留：官方 checkout 的真实位置声明 |
| `docs/p2a-tsconfig-d6.md:13` | `…本仓恰好落在主仓 packages/AGENTS.md:23 正文明文覆盖的…` | 官方主仓路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:19` | `### 1.1 packages/AGENTS.md:23（决定性条文，全文）` | 官方主仓路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:27` | `关键分句（packages/AGENTS.md:23）：` | 官方主仓路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:168` | `⇒ 属于 packages/AGENTS.md:23 前半句…` | 官方主仓路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:185` | `\| tsconfig.host.json \| … \| 命中 packages/AGENTS.md:23 前半句 \|` | 官方主仓路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:186` | `\| tsconfig.client.json \| … \| 命中 packages/AGENTS.md:23 前半句…` | 官方主仓路径 | 保留 |
| `docs/p2a-tsconfig-d6.md:208` | `sed -n '23p' /home/xuepeng/DSH/deepseekHARNESS/packages/AGENTS.md` | 官方主仓路径 | 保留：**取证命令**，改路径即无法复现 |
| `docs/p2a-tsconfig-d6.md:209` | `sed -n '58,74p' /home/xuepeng/DSH/deepseekHARNESS/docs/development.zh.md` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:210` | `cat /home/xuepeng/DSH/deepseekHARNESS/tsconfig.base.client.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:211` | `cat /home/xuepeng/DSH/deepseekHARNESS/packages/client/modules/tsconfig.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:214` | `cat …/packages/client/file-upload/tsconfig.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:215` | `cat …/packages/client/file-upload/tsconfig.host.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:216` | `cat …/packages/client/file-upload/tsconfig.client.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:217` | `grep -n 'file-upload' …/tsconfig.host.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:218` | `grep -n 'file-upload' …/tsconfig.client.json` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:221` | `sed -n '22,25p' …/packages/host/webserver/src/index.ts` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:222` | `grep -rln "declare module '@deepseek-ai/cordis'" …/packages/client …` | 官方主仓路径 | 保留：同上 |
| `docs/p2a-tsconfig-d6.md:231` | `1. **结构有官方依据**：packages/AGENTS.md:23 明文规定…` | 官方主仓路径 | 保留 |
| `docs/spec-p1-skeleton.md:18` | `\| … \| <checkout>/packages/AGENTS.md:23 \| 采用 leaf + solution-only root \|` | 官方主仓路径 | 保留：规格引用官方条文 |
| `docs/spec-p1-skeleton.md:25` | `\| 覆盖率门禁（主仓口径） \| <checkout>/AGENTS.md:68 \| …` | 官方主仓路径 | 保留 |
| `docs/spec-p1-skeleton.md:45` | `…则按 packages/AGENTS.md:23「ordinary two-entry…」` | 官方主仓路径 | 保留 |
| `docs/spec-p1-skeleton.md:51` | `…与主仓「源平面 vs 产物平面不混」（AGENTS.md:120）一致` | 官方主仓路径 | 保留 |
| `docs/spec-p2-pure-logic.md:23` | `5. **不引入 any**；确需时按主仓 AGENTS.md:143 写明理由。` | 官方主仓路径 | 保留 |
| `docs/spec-p3-host-routes.md:89` | `- 现插件的 real-composition.test.js 把 ./dsh/index.js 焊进断言…迁移后须改为 lib/。` | 旧产物 | 保留：迁移指令，旧值是被改造对象 |
| `docs/spec-p5-p6-tests-and-cutover.md:57` | `**禁止**用 /* v8 ignore */ …（主仓 AGENTS.md:143 …）` | 官方主仓路径 | 保留 |
| `docs/spec-p5-p6-tests-and-cutover.md:82` | `grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json` | 旧包名 | 保留：P6 切换规格——**要移除的就是旧插件**，此处必须写旧包名 |
| `docs/spec-p5-p6-tests-and-cutover.md:84` | `# 2) 移除旧插件（现为 link:/home/xuepeng/.../dsh-plugin-file-system）` | 绝对路径 | 保留：同上，注明旧插件当前挂载位置 |
| `docs/spec-p5-p6-tests-and-cutover.md:85` | `dsh plugin --profile web remove dsh-plugin-file-system` | 旧包名 | 保留：同上，待执行命令 |
| `docs/spec-p5-p6-tests-and-cutover.md:88` | `dsh plugin --profile web add /home/xuepeng/.../dsh-plugin-file-system-zc` | 绝对路径 | 保留：待执行命令，指向新仓（正当） |
| `docs/spec-p5-p6-tests-and-cutover.md:104` | `依现插件 AGENTS.md §6，四项：` | 旧仓文档名 | 保留：被对照对象 |
| `docs/spec-p5-p6-tests-and-cutover.md:107` | `2. 文件树展开/折叠；书库文档节点带蓝点（**注**：AGENTS.md 原文称"悬停可打开"…）` | 旧仓文档名 | 保留：同上 |

> `docs/` 中 `baseline/*.md` 三份与 `feature-baseline.md` 是 P0 阶段的**迁移源功能清点基线**：它们通篇在描述「旧仓是什么样」，旧包名与旧产物路径正是被清点的对象，**改动即销毁验收依据**。`p1c-skills-migration.md` 是 P1c 阶段的历史归档，其 A/B/C 类清单是本轮 §2 的输入之一（本轮已执行，其中 3 条命名示例条目按 §4.1 判为误报不改）。`p2a-tsconfig-d6.md` 与各 `spec-*.md` 里的 `/home/xuepeng/DSH/deepseekHARNESS/` 是**DSH 官方 checkout** 的绝对路径，与迁移源不是同一对象，改掉反而使取证命令无法复现。

### 3.3 `README.md` —— 2 处命中，**全部保留**

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `README.md:7` | `本仓是 dsh-plugin-file-system 的主仓模式重写版：…` | 旧包名 | 保留：这是「新仓是旧仓的重写版」的**对照指称**，不是引用旧仓的路径；改成 `-zc` 后句子自指、失去意义 |
| `README.md:149` | `- 迁移源（只读）：../dsh-plugin-file-system。` | 迁移源 | 保留：迁移期必须保留的来源指引 |

> `README.md` 由并行的 P1 子智能体于本轮期间新建（本子智能体未修改它）；扫描时新出现，一并纳入。

### 3.4 `skills/` 侧的相对台账引用 —— **保留**（不入上表计数）

| 文件:行号 | 原文片段 | 类型 | 处置 |
|---|---|---|---|
| `skills/session-review/SKILL.md:91` | 记录经验可写入插件 `issues/` 知识库 | 台账目录 | 保留：不含旧包名，是相对指称；`issues/` 已随本轮迁入新仓，指引成立 |
| `skills/folder-doc/scripts/folder-doc.mjs:168` | `// 见 issues/2026-09-03-08）。` | 台账条目 | 保留：仓内相对引用，`issues/2026-09-03-08-gen-content-path-overwrite.md` 已在新仓存在，链接成立 |

---

## 4. 已核对为误报（不计入陈旧引用）

### 4.1 表内 3 条 · 命名规则演示样例

`skills/` 侧扫描仅剩 3 条命中，全部是「相对路径 → 生成文件名」的**示例数据**，被处理对象是任意工作区路径，与旧仓无引用关系：

| 文件:行号 | 原文片段 | 判定理由 |
|---|---|---|
| `skills/file-doc/scripts/file-doc.mjs:14` | `//   例：dsh/index.js → dsh-index.md；src/client/index.js → src-client-index.md；顶层 README.md → <工作区名>-README.md。` | 示例中 `dsh/`、`src/client/` 均为**被处理文件的相对路径演示**；同句里 `src/client/index.js` 在新仓是 `.ts`，若视为引用则整句都错——显然它只是在演示命名规则 |
| `skills/file-doc/scripts/file-doc.mjs:113` | `// 如：dsh/index.js → dsh-index；…` | 同上 |
| `skills/source-doc/scripts/source-annotate.mjs:245` | `// 如 rel=ws/dsh/index.js → dsh-index；rel=ws/src/client/index.js → src-client-index。` | 同上 |

### 4.2 表外 3 类 · 未进扫描正则

| 形态 | 出现处示例 | 判定理由 |
|---|---|---|
| 命名规则示例 `dsh/README.md → dsh-README.md` | `skills/translate-doc/scripts/translate-doc.mjs:15`；另 `skills/file-doc/scripts/file-doc.mjs:14`、`skills/source-doc/scripts/source-annotate.mjs:246` 有 `README.md → <工作区名>-README` 同形 | 与 §4.1 同形，是规则演示而非引用 |
| `~/.dsh`（4 处）、`$DSH_HOME`（34 处，含重复出现） | `skills/*/SKILL.md`、`skills/*/scripts/*.mjs` | 这是**书库根的环境变量/默认值**，与迁移源无关；新仓行为契约逐字保留 |
| `packages/session/session-persistence-jsonl/src/format.ts`（4 处） | 4 个 `.mjs` 的 `projectKey` 注释 | DSH **官方主仓**内的路径（`projectKey()` 的真源），非本仓文件 |

> 附加说明：`issues/` 内的 `~/.dsh`（8 处）同样属绝对路径历史现象，已在 §3.1 按历史事实保留。

---

## 5. 范围外发现（本轮硬约束禁改 `src/`，需主智能体处置）

| 文件:行号 | 原文片段 | 类型 | 建议处置 |
|---|---|---|---|
| `src/host/fs-utils.ts:1` | `// dsh-plugin-file-system — Host 侧纯工具函数。` | **旧包名（真陈旧引用）** | 应改为 `// dsh-plugin-file-system-zc — Host 侧纯工具函数。`。T-14 硬约束 5 明令「不要动 `src/`」，故本轮未改；建议并入 P2 收敛或由主智能体指派单点修正 |
| `PROGRESS.md:5` | `> 迁移源（**只读，禁止改动**）：../dsh-plugin-file-system @ 3a3f89e（master，工作树干净）` | 迁移源 | 保留（正当引用；且 `PROGRESS.md` 不在本轮可动范围） |
| `PROGRESS.md:15` | `1. **不改动现插件任何文件** —— dsh-plugin-file-system 必须保持原样可运行。` | 旧包名 | 保留（迁移纪律条款中的指称对象） |
| `PROGRESS.md:43` | `① 迁移源 ../dsh-plugin-file-system 只读，冻结于 3a3f89e；…` | 迁移源 | 保留（同上） |

---

## 6. 自证证据

### 6.1 交付物 1：`issues/` 迁移

- **复制方式**：`cp -a <源>/issues <新仓>/issues`（保留权限位）。
- **文件数**：21（`README.md`、`_template.md` + 19 条历史记录）。
- **总行数**：929。
- **复制时的逐字一致性**：`diff -r <源>/issues <新仓>/issues` → **无任何差异**；权限位清单逐一比对 → **一致**。
- **随后的路径修正处数**：**0**。逐条核对 13 行命中，全部为历史事实（见 §3.1），按纪律未改一字。
- **`package.json` 的 `files`**：未加入 `issues`（与源插件一致）。
- **git 状态**：21 个文件均为 `??`（未跟踪、未被 `.gitignore` 忽略；`.gitignore` 仅含 `node_modules/`、`lib/`、`/client/`、`coverage/`、`*.tsbuildinfo`、`.DS_Store`）。

### 6.2 交付物 2：`skills/` 零逻辑改动

```
$ git diff --numstat -- skills
2+ 2- skills/file-doc/SKILL.md
5+ 5- skills/file-doc/scripts/file-doc.mjs
2+ 2- skills/folder-doc/SKILL.md
4+ 4- skills/folder-doc/scripts/folder-doc.mjs
1+ 1- skills/source-doc/SKILL.md
4+ 4- skills/source-doc/scripts/source-annotate.mjs
1+ 1- skills/translate-doc/SKILL.md
5+ 5- skills/translate-doc/scripts/translate-doc.mjs
```

- **共 24 增 24 删**，行数不变（无插删行）。
- **`.mjs` 改动行 100% 是注释行**：机械断言「`git diff -U0 -- skills` 中 `.mjs` 的每一个 `+`/`-` 行，`lstrip()` 后都以 `//` 开头」→ **非注释改动行 0 处**。
- **代码体逐字等价**：剥离整行 `//` 注释后逐字比较新旧版本 → 4 个 `.mjs` 全部 `IDENTICAL`。
- **语法可解析**：`node --check` 4 个 `.mjs` 全部通过。
- **`.md` 改动行**：4 个 `SKILL.md` 共 6 行，全部是正文中的路径引用句（§2.1 的 4 行、§2.3 的 2 行），无命令/参数/分支改动。

### 6.3 迁移源未污染（开工前 / 收尾各一次）

```
### 开工前 2026-09-11T03:34:02+08:00
$ git -C <源仓> rev-parse --short HEAD
3a3f89e
$ git -C <源仓> status --short
（空）

### 收尾
$ git -C <源仓> rev-parse --short HEAD
3a3f89e
$ git -C <源仓> status --short
（空）
```

两次 HEAD 同为 `3a3f89e`（冻结点），工作树两次均为空 —— **迁移源全程零写入**。

### 6.4 未执行的操作

按硬约束：未执行 `git add` / `git commit`；未运行 `npm test` / `npm run test:coverage` / `npm run build` / `npm run typecheck`；未改 `src/`、`tests/`、`tsconfig*.json`、`tsdown.config.ts`、`vitest.config.ts`、`package.json`、`package-lock.json`、`cordis.patch.yml`、`agent.cordis.yml`、`preset.yml`、`scripts/`、`PROGRESS.md`。
