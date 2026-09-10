# P1-C 技能目录迁移核查报告

- 迁移源（只读）：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`
- 目标仓：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc`
- 执行范围：复制 `skills/`（13 文件 / 5 技能）、`package.json` 的 `files` 数组补 `"skills"`、本核查报告
- 明文约束：全程未运行 `npm test` / `test:coverage` / `typecheck` / `lint` / `build`，未执行 `git add` / `git commit`

---

## 0. 源仓「未污染」证据

复制动作执行**之前**，在源仓根目录执行 `git status --short`：

```
$ cd /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system && git status --short
（空输出，exit code 0）
$ echo $?
0
```

输出为空，即源仓工作树干净、无未提交改动；本次迁移对源仓为纯只读操作（`cp -a` 源 → 目标，未在源侧写入）。

---

## 1. 交付物一：skills/ 逐字复制

### 1.1 `diff -r` 实测（必须为空）

```
$ diff -r /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system/skills \
           /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc/skills
（无任何输出）
DIFF: 无差异（exit 0）
```

`diff -r` 无输出且 exit code 0 = 两边目录树结构、文件集合、文件内容逐字节一致。

### 1.2 文件清单（两边各 13 个，相对路径完全一致）

```
skills/file-doc/SKILL.md
skills/file-doc/scripts/file-doc.mjs
skills/file-doc/templates/file.md
skills/folder-doc/SKILL.md
skills/folder-doc/scripts/folder-doc.mjs
skills/folder-doc/scripts/gen-tree.sh
skills/folder-doc/templates/folder.md
skills/session-review/SKILL.md
skills/session-review/scripts/parse-session.mjs
skills/source-doc/SKILL.md
skills/source-doc/scripts/source-annotate.mjs
skills/translate-doc/SKILL.md
skills/translate-doc/scripts/translate-doc.mjs
```

### 1.3 sha256 对照表（13 行，逐行比对一致）

| # | 文件（相对 `skills/`） | sha256（源 = 目标） | 结论 |
|---|---|---|---|
| 1 | `file-doc/SKILL.md` | `2214083da6ed3100a3c7501e2b3a8b83922c04c490320f24f2a4c79e720d83a2` | 一致 |
| 2 | `file-doc/scripts/file-doc.mjs` | `486deb6ccc80db0203828caf105720766af9f94bd596d0abf1e502c426df8ba7` | 一致 |
| 3 | `file-doc/templates/file.md` | `c0075d5f84b1d505a078833c95a9b8ec8b061d1f320bccd8f64b8ebe0652861d` | 一致 |
| 4 | `folder-doc/SKILL.md` | `a60b58f07e2816cc91b8973d93694cbe82f81b7e203b0d620048b0d61632e713` | 一致 |
| 5 | `folder-doc/scripts/folder-doc.mjs` | `3ec76b4380a65c1a43605cf629701a01ebbf9c413292f5f21119c0e3d7594860` | 一致 |
| 6 | `folder-doc/scripts/gen-tree.sh` | `0c721aa2011014ea2dc18eac2b8c54e80b26244a5903de9053701aeed3c7a593` | 一致 |
| 7 | `folder-doc/templates/folder.md` | `4b182c5b25d7bc9a729fc0c4f71ff552fa21333c34465f8026fd7c81b95e5858` | 一致 |
| 8 | `session-review/SKILL.md` | `97927e7f3f5d73c85db71d42477c211cd0139de768c8b2368048f2221045314e` | 一致 |
| 9 | `session-review/scripts/parse-session.mjs` | `2141645757e9af3a44f20af51bb6202173670e8b1feaebed6c3a153d973ce58f` | 一致 |
| 10 | `source-doc/SKILL.md` | `813219f3f0f62f37616438b2a1cf2f8f5c71f10928063a4d2fe44c32b92b393b` | 一致 |
| 11 | `source-doc/scripts/source-annotate.mjs` | `43dbd15ee7f663fb23229f1cad6e437909b8c4255e8b85c57c7012cb42a582c3` | 一致 |
| 12 | `translate-doc/SKILL.md` | `8897cb8437cc602f022f3d3186c0cc04bbeebbcc49f60508131a2f0730db560a` | 一致 |
| 13 | `translate-doc/scripts/translate-doc.mjs` | `8ee8b0a666744cd9ef97696f1f7ae1b7ae2016818d89ecd938a3c4129f732210` | 一致 |

（两边 `find . -type f | sort | xargs sha256sum` 各 13 行，路径集合与摘要值一一对应。）

### 1.4 可执行位与权限位证明

目标仓 `ls -lR skills`（原始输出，节选可执行位相关行）：

```
skills/folder-doc/scripts:
-rw------- 1 xuepeng xuepeng 9381 Sep 11 01:48 folder-doc.mjs
-rwx--x--x 1 xuepeng xuepeng 1182 Aug 30 05:16 gen-tree.sh

skills/session-review/scripts:
-rw------- 1 xuepeng xuepeng 6729 Sep 11 01:48 parse-session.mjs

skills/source-doc/scripts:
-rw------- 1 xuepeng xuepeng 25470 Sep  8 22:13 source-annotate.mjs

skills/translate-doc/scripts:
-rw------- 1 xuepeng xuepeng 9293 Sep 11 01:48 translate-doc.mjs
```

八进制权限位逐文件对照（`stat -c '%a'`，源 vs 目标）：

| 文件（相对 `skills/`） | 源 | 目标 | 结论 |
|---|---|---|---|
| `file-doc/SKILL.md` | 664 | 664 | 一致 |
| `file-doc/scripts/file-doc.mjs` | 600 | 600 | 一致 |
| `file-doc/templates/file.md` | 600 | 600 | 一致 |
| `folder-doc/SKILL.md` | 664 | 664 | 一致 |
| `folder-doc/scripts/folder-doc.mjs` | 600 | 600 | 一致 |
| `folder-doc/scripts/gen-tree.sh` | **711** | **711** | 一致（可执行位保留） |
| `folder-doc/templates/folder.md` | 600 | 600 | 一致 |
| `session-review/SKILL.md` | 600 | 600 | 一致 |
| `session-review/scripts/parse-session.mjs` | 600 | 600 | 一致 |
| `source-doc/SKILL.md` | 664 | 664 | 一致 |
| `source-doc/scripts/source-annotate.mjs` | 600 | 600 | 一致 |
| `translate-doc/SKILL.md` | 600 | 600 | 一致 |
| `translate-doc/scripts/translate-doc.mjs` | 600 | 600 | 一致 |

目录权限 `drwxrwxr-x`（775）亦一致。复制使用 `cp -a`（archive：保留权限位、时间戳），故 13/13 一致。

> 说明：源侧 `.mjs` 文件的权限位本身是 `600`（不可执行），`gen-tree.sh` 是 `711`（可执行）。「保留可执行位」即原样保真 —— 不做任何 chmod 归一化。

---

## 2. 交付物二：package.json 的 files 数组

改动前：

```json
"files": ["lib", "client", "src", "cordis.patch.yml", "agent.cordis.yml", "preset.yml", "README.md", "LICENSE"]
```

改动后：

```json
"files": ["lib", "client", "src", "skills", "cordis.patch.yml", "agent.cordis.yml", "preset.yml", "README.md", "LICENSE"]
```

`git diff -- package.json` 实测（仅此一处，无其它字段变动）：

```diff
diff --git a/package.json b/package.json
index a6a9bf4..af07e1e 100644
--- a/package.json
+++ b/package.json
@@ -15,6 +15,7 @@
     "lib",
     "client",
     "src",
+    "skills",
     "cordis.patch.yml",
     "agent.cordis.yml",
     "preset.yml",
```

位置校验：源插件 `files` 为 `["dsh","src","skills","cordis.patch.yml","agent.cordis.yml","preset.yml","README.md"]`，`"skills"` 紧跟 `"src"`；目标仓同样让 `"skills"` 紧跟 `"src"`（目标多出 `"lib"`、`"client"`、`"LICENSE"`，源多出 `"dsh"`，均为两仓各自的既有差异，未改动）。

---

## 3. 交付物三：引用扫描结论

对 13 个文件全文扫描（`grep -rn`），逐条列出**指向旧包名 / 源仓绝对路径 / 写死 `dsh/` 构建产物路径**的引用。**按要求只报告、未修改任何一行。**

### 3.1 A 类：指向旧包名 `dsh-plugin-file-system` —— 共 7 条

| # | 位置 | 原文 |
|---|---|---|
| A1 | `skills/file-doc/scripts/file-doc.mjs:4` | `// 契约（来自宿主 dsh-plugin-file-system/dsh/index.js）：` |
| A2 | `skills/folder-doc/scripts/folder-doc.mjs:4` | `// 契约（来自宿主 dsh-plugin-file-system/dsh/index.js）：` |
| A3 | `skills/translate-doc/scripts/translate-doc.mjs:4` | `// 契约（来自宿主 dsh-plugin-file-system/dsh/index.js）：` |
| A4 | `skills/file-doc/SKILL.md:55` | `…就按 \`plugins/dsh-plugin-file-system/issues/_template.md\` 记一条到 \`issues/<date>-<序号>-<slug>.md\` 并更新 \`issues/README.md\` 索引表。` |
| A5 | `skills/folder-doc/SKILL.md:61` | 同上句式（行内 `plugins/dsh-plugin-file-system/issues/_template.md`） |
| A6 | `skills/source-doc/SKILL.md:66` | 同上句式（行内 `plugins/dsh-plugin-file-system/issues/_template.md`） |
| A7 | `skills/translate-doc/SKILL.md:55` | 同上句式（行内 `plugins/dsh-plugin-file-system/issues/_template.md`） |

性质判定：
- A1–A3 是 `.mjs` 头部**注释**，说明脚本与宿主产物的契约来源；同时命中旧构建产物路径 `dsh/index.js`（见 3.2）。**不参与运行时逻辑**，但注释描述与新仓现状（TS 源码在 `src/`、构建产物 `lib/index.js`）已脱节。
- A4–A7 是四个 `SKILL.md` 的「技能踩坑」章节中对**问题台账目录**的引用（`plugins/dsh-plugin-file-system/issues/`）。`session-review/SKILL.md` 无此类引用。这是功能性指引文本：技能被调用时，模型会按此路径去写台账。新仓当前**无 `issues/` 目录**，故该指引在新仓指向不存在的路径。

### 3.2 C 类：写死 `dsh/` 构建产物路径 —— 实质命中 3 条

| # | 位置 | 原文 | 性质 |
|---|---|---|---|
| C1 | `skills/file-doc/scripts/file-doc.mjs:4` | `// 契约（来自宿主 dsh-plugin-file-system/dsh/index.js）：` | 旧包的 bundle 产物路径；新包产物为 `lib/index.js` |
| C2 | `skills/folder-doc/scripts/folder-doc.mjs:4` | 同上 | 同上 |
| C3 | `skills/translate-doc/scripts/translate-doc.mjs:4` | 同上 | 同上 |

以下 `dsh/` 出现**不属于**「写死构建产物路径」，属误报，列出以免误判：

| 位置 | 原文片段 | 实际语义 |
|---|---|---|
| `skills/file-doc/scripts/file-doc.mjs:14` | `//   例：dsh/index.js → dsh-index.md；…` | 文档命名规则的**示例**（把工作区目录 `dsh/` 当作普通被处理文件） |
| `skills/file-doc/scripts/file-doc.mjs:113` | `// 如：dsh/index.js → dsh-index；…` | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:15` | `//   例：dsh/README.md → dsh-README.md；…` | 同上 |
| `skills/translate-doc/scripts/translate-doc.mjs:117` | `// 如：dsh/README.md → dsh-README；…` | 同上 |
| `skills/source-doc/scripts/source-annotate.mjs:245` | `// 如 rel=ws/dsh/index.js → dsh-index；…` | 同上 |
| `skills/file-doc/scripts/file-doc.mjs:83` / `:85`、`folder-doc.mjs:67` / `:69`、`source-annotate.mjs:90` / `:92`、`translate-doc.mjs:88` / `:90` | `$DSH_HOME/books`、`~/.dsh/books`、`join(homedir(), '.dsh')` | DSH 环境目录缺省值（`~/.dsh`），与构建产物无关 |
| `skills/session-review/scripts/parse-session.mjs:25` | `const HOME = process.env.DSH_HOME \|\| join(homedir(), '.dsh')` | 同上 |

### 3.3 B 类：源仓 / 用户绝对路径 —— 共 4 条（全部为注释中的示例）

| # | 位置 | 原文 |
|---|---|---|
| B1 | `skills/file-doc/scripts/file-doc.mjs:59` | `//   对拍：/home/xuepeng/DSH → --home-xuepeng-DSH--；/home/xuepeng/源码志 → --home-xuepeng-~6E90~7801~5FD7--` |
| B2 | `skills/folder-doc/scripts/folder-doc.mjs:43` | 同上 |
| B3 | `skills/source-doc/scripts/source-annotate.mjs:66` | 同上 |
| B4 | `skills/translate-doc/scripts/translate-doc.mjs:64` | 同上 |

另有两处出现工作区名 `DSHworkPace`（非绝对路径、非旧包名，属示例）：

| 位置 | 原文片段 |
|---|---|
| `skills/source-doc/SKILL.md:47` | `…如 \`DSHworkPace/plugins/.../src/index.js\`…`（`--rel` 参数的取值示例） |
| `skills/source-doc/scripts/source-annotate.mjs:30` | `// 说明：--rel 是写入 frontmatter「源码路径」与 index.json 的值（工作区名/相对路径，如 DSHworkPace/plugins/x/src/y.js）；` |

性质判定：B1–B4 均为脚本内部**注释中的对拍示例**，脚本本体接受任意 `--root` / `--rel` 参数，无写死路径依赖，**不影响运行**。仅为示例文字沿用了作者本机路径。

### 3.4 扫描结论摘要

- **有引用，未修改（按要求只报告）。**
- 指向旧包名 `dsh-plugin-file-system`：**7 条**（3 条 `.mjs` 顶部契约注释 + 4 条 `SKILL.md` 的 issues 台账路径指引）。
- 写死旧构建产物路径 `dsh/index.js`：**3 条**（与上面前 3 条重合）。
- 源仓 / 用户绝对路径 `/home/xuepeng/...`：**4 条**（全为注释中的命名对拍示例）。
- 是否影响**运行**：13 个文件中无任何一处把这些路径用作运行时加载路径或写死的文件读写目标；A4–A7 是给模型的**文字指引**，若新仓不建 `issues/` 目录，技能踩坑指引会指向不存在的路径（属行为/文档层面偏差，非代码错误）。是否需要改成新包名与新仓结构，由主智能体决策。

---

## 4. 本次改动清单（目标仓）

```
新增：skills/                                  （13 文件，逐字复制，cp -a）
修改：package.json                             （files 数组 +1 行 "skills"，无其它改动）
新增：docs/p1c-skills-migration.md             （本报告）
```

未触碰：`src/`、`tests/`、`tsconfig*.json`、`tsdown.config.ts`、`vitest.config.ts`、`agent.cordis.yml`、`cordis.patch.yml`、`preset.yml`。

> 备注：执行时刻 `git status --short` 另显示 `M package-lock.json`、`M src/client/index.ts`、`M src/host/index.ts`，以及未跟踪的 `agent.cordis.yml` / `cordis.patch.yml` / `preset.yml` / `tests/` —— 这些**不是本次任务的改动**，系主智能体并行作业所致。本次任务只产生了 `package.json` 的一行修改与 `skills/` 的新增。
