# P5 执行细则 — 135 例 `node:test` → vitest 迁移

> 本文是 `docs/spec-p5-p6-tests-and-cutover.md` §P5 的**细化**（不改变其任何结论），面向 T-50 / T-51 的执行者，目标是「照着做即可」。
> 制定：2026-09-11 · 上游：`PROGRESS.md` §1（T-50/T-51）、§2（D-2 / D-8）、`docs/spec-p5-p6-tests-and-cutover.md`、`docs/baseline/contracts.md` §D、`vitest.config.ts`
> 迁移源冻结于 `3a3f89e`，全程只读。

---

## 0. 本文的证据等级约定

| 标记 | 含义 |
|---|---|
| **实测** | 本次预研用只读命令在当前磁盘上亲自跑出来的数字，命令写在 §1.1 |
| **源码核实** | 从 `node_modules` / 主仓 checkout 的**源码**里读到的确定事实，带 `文件:行号` |
| **静态推断** | 只读扫描源码分支后给出的判断，**未经覆盖率实测**（本任务禁止跑 `npm`），执行者须自行复验 |
| **未核实** | 本次没查到权威出处，**不得直接照抄**，执行者必须先验证 |

凡本文与 `docs/spec-p5-p6-tests-and-cutover.md` 冲突，以该规格为准，并把冲突回报主智能体。

---

## 1. 源测试清单（实测）

### 1.1 获取方式（本次实际执行的命令）

```sh
cd /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system
wc -l tests/*.test.js                                   # 行数
grep -cE "^(test|it)\(" tests/*.test.js                # 每文件顶层用例数
grep -nE "^\s*(test|it)\(" tests/*.test.js | wc -l     # 全部 test/it 行（含嵌套）
grep -cE "^describe\(" tests/*.test.js                 # describe 数
grep -nE "^\s*(await )?t\.test\(" tests/*.test.js | wc -l  # node:test subtest 数
git -C . rev-parse HEAD                                 # 3a3f89eaeda73dd355e230fc0eb049b717881e2c
```

### 1.2 合计（实测）

| 指标 | 实测值 | 命令 |
|---|---|---|
| 测试文件数 | **8** | `ls tests/*.test.js` |
| 总行数 | **2446** | `wc -l tests/*.test.js` |
| 用例数 | **135** | 顶层 `test(` 计数，8 文件逐文件相加 |
| `describe` 分组数 | **0** | `grep -cE "^describe\("` 每文件皆 0 |
| `node:test` subtest（`t.test`） | **0** | 同上 |
| `await test(...)` 形式 | **0** | 同上 |
| 顶层 `test()` 数 vs 全量 `test()/it()` 数 | 135 vs 135 | 两者相等 ⇒ **无嵌套用例**，全部扁平 |

> 与 `docs/spec-p5-p6-tests-and-cutover.md` §2 的转述表格（2446 行 / 135 例）**逐项吻合**，本节的数字独立复现了它。这与 `contracts.md` §D1 的 `tests 135 / pass 135 / fail 0 / suites 0` 也一致（`suites 0` 正是「无 `describe`」的佐证）。

### 1.3 逐文件清单

| 文件 | 行数 | 用例数 | 结构 | 依赖的辅助函数 / fixture | 依赖的被测模块 |
|---|---|---|---|---|---|
| `tests/abilities.test.js` | 337 | 27 | 扁平 `test()`，5 个 `// ---- 段` 注释分隔 | 无辅助函数；仅内联常量 `FILLED_SKELETON`（无） | `abilities/folder-doc/skeleton.js`、`abilities/file-doc/skeleton.js`、`abilities/translate-doc/index.js`、`abilities/source-doc/skeleton.js`、`abilities/source-doc/doc-render.js`、`abilities/registry.js`、`host/fs-utils.js` |
| `tests/client-md-utils.test.js` | 209 | 26 | 扁平 `test()`，逐函数分段注释 | 无 | `client/md-utils.js`、`shared/locale.js` |
| `tests/fs-utils.test.js` | 205 | 21 | 扁平 `test()` | 无；路径用 `join(tmpdir(), 'safe-root')` 等**纯字符串**（从不创建） | `host/fs-utils.js` |
| `tests/gen-scope.test.js` | 703 | 24 | 扁平 `test()`；含 5 个模块级辅助 | `createCtx(root, captured)` `:66`、`createReq` `:106`、`createRes` `:117`、`call` `:126`、`waitSettled` `:137`、`skeletonPathFrom` `:150`、`runSrcTask` `:316`、`docAbsFrom` `:536`、`runFolderTask` `:538`、`runFileTask` `:644`；常量 `FILLED_SKELETON` `:325` | `host/index.js`（`apply`）、`host/fs-utils.js`、`abilities/file-doc/skeleton.js` |
| `tests/host-routes.test.js` | 638 | 21 | 扁平 `test()` | `createCtx` `:21`、`createRes` `:31`、`createReq` `:42`、`call` `:58`、`waitTaskRegistered` `:66`、`waitTaskSettled` `:79` | `host/index.js`（`apply`）、`host/fs-utils.js` |
| `tests/issues.test.js` | 78 | 6 | 扁平 `test()`；**模块顶层 `await import()`** `:22` | `testIssuesDir` `:15`、`REPO_README` `:19`、`REPO_ISSUES_DIR` `:20` | `host/issues.js` |
| `tests/real-composition.test.js` | 155 | 8 | 扁平 `test()`；**唯一用到测试上下文 `t` 的文件**（`:43` 签名、`:50` `t.skip`） | `createCtxStub(root)` `:62` | `src/host/index.js`、`package.json`、`cordis.patch.yml`、`agent.cordis.yml`、`preset.yml` |
| `tests/task-timeout.test.js` | 121 | 2 | 扁平 `test()` | `createCtx` `:26`、`createRes` `:36`、`createReq` `:46`、`call` `:54`、`stalledTask` `:64` | `host/index.js`（`apply`）、`shared/locale.js` |
| **合计** | **2446** | **135** | | | |

### 1.4 全部 135 条用例标题（防漏迁清单）

用 `test('…')` 标题原样誊录，`文件:行号` 为该 `test(` 所在行。迁移时逐条打勾。

**`abilities.test.js`（27，`:21-336`）**
`:21` renderFolderTree：目录在前、文件在后，各自按名升序，末项用 └── ·
`:31` renderFolderTree：跳过隐藏项与排除目录，忽略非文件非目录项与空名 ·
`:49` renderFolderTree：单项时即末项（└──），目录带尾斜杠 ·
`:53` FOLDER_TREE_IGNORE：与 gen-tree.sh 的 ign 名单一致（目录名精确匹配） ·
`:60` renderFolderDocSkeleton：frontmatter 三行与目录树围栏由宿主写死，语义占位保留 ·
`:79` renderFileDocSkeleton：frontmatter 三行、标题、四章节标题与导出表头由宿主写死 ·
`:96` FILE_DOC_PLACEHOLDERS：只含骨架固定串，不会误命中正常正文里的泛型/JSX ·
`:106` isMostlyChinese：中文文档判为中文（翻译前应拒绝） ·
`:110` isMostlyChinese：英文文档判为非中文（应进入翻译流程） ·
`:114` isMostlyChinese：中英混排但中文占优判为中文 ·
`:118` isMostlyChinese：拉丁字母远超中文但中文占比≥20% 仍判为中文 ·
`:125` isMostlyChinese：无中文或空输入判为非中文 ·
`:133` ABILITIES/GEN_ABILITIES/TRANSLATE_ABILITY：键集合与翻译能力归类 ·
`:139` abilityOf：已知 kind 返回描述符，未知 kind 返回 undefined ·
`:147` 每个能力描述符：必备字段齐备且 dir 与目录名一致 ·
`:159` 骨架能力与钩子：folder/file/src 有 skeleton，src 有 verify/finalize，translate 有 precheck/verify ·
`:176` docStem：folder 取目录名，file 与 computeDocStem 同规则 ·
`:185` buildUnits：连续注释合并为块、空行与纯符号行跳过、行号与缩进保留 ·
`:204` renderSourceSkeleton：@摘要 段 + 每单元 @行/@块 与待填的「注解: 」空位 ·
`:219` parseFilledSkeleton：回填注解与摘要，多行块代码完整收集 ·
`:247` annotationStats：全空 / 部分 / 全填的 filled 与 ratio（宿主空转判据） ·
`:254` langOf：按扩展名给围栏语言，未知扩展名回落 javascript ·
`:262` renderAnnotatedDoc：短行短注解走行尾，长注解走行上方并继承缩进，行号不连续插空行 ·
`:290` renderAnnotatedDoc：摘要为空用占位；单元行号越界抛错 ·
`:310` checkHealth：四项异常各报一条，健康输入返回空数组 ·
`:323` buildSourceSkeleton：目标不可读时抛错（宿主兜底；路由层已预检目标存在） ·
`:327` renderAnnotatedDoc：未传 srcLines 时回落骨架内代码（兼容不传源码的调用）

**`client-md-utils.test.js`（26，`:18-207`）**
`:18` basename 取路径最后一段 · `:27` extOf 取小写扩展名 · `:38` extBadge 已知扩展名取短角标 ·
`:51` extBadge 未知扩展名取前 3 字符大写，无扩展名取空 · `:59` langFor 扩展名映射 shiki 语言 id ·
`:69` langFor 未知/空扩展名回退 text · `:76` isMd 识别 markdown 扩展名 · `:84` splitFrontmatter 标准 frontmatter 拆解 ·
`:90` splitFrontmatter 未闭合 --- 视为无 frontmatter，整文回 body · `:95` splitFrontmatter 空 frontmatter（紧邻闭合） ·
`:101` splitFrontmatter 无 frontmatter · `:107` splitFrontmatter 仅一行 ---（无闭合行）视为无 frontmatter ·
`:112` splitFrontmatter 首行前导空白可容错（trim 判定） · `:118` splitFrontmatter CRLF 行尾容错：闭合行识别，fm 保留 \r（原行为） ·
`:124` splitFrontmatter 空/未定义输入 · `:130` splitFrontmatter 闭合后无正文 · `:137` parseFmRows 标准键值行 ·
`:145` parseFmRows 非键值行保留原文且 key 为 null · `:153` parseFmRows 空行/纯空白行剔除 ·
`:161` parseFmRows 键值含中文/冒号/连字符/下划线 · `:169` parseFmRows 空/未定义输入返回空数组 ·
`:175` parseFmRows 键无值 · `:180` labLabelKey 模式映射字典 key · `:189` labLabelKey 与字典文案一一对应（translations 覆盖） ·
`:198` locale 字典：host 三键必须存在且文案不变 · `:204` locale t() 缺省 zh；缺键返回 key 并 warn

**`fs-utils.test.js`（21，`:27-204`）**
`:27` normRel 规范化相对路径 · `:35` relToSrcKey 生成源码路径键（根=工作区名） · `:44` wsName 取 root 目录名（relToSrcKey 的键前缀） ·
`:49` computeDocStem 复现 file-doc/source-doc 命名 · `:60` docRelPath 输出书库新格式 `<层名>/<stem>.md` · `:68` docRelBook 与 docRelPath 新格式一致 ·
`:73` projectKey 与 DSH format.ts 对拍（3 例） · `:79` projectKey 空串抛错 · `:83` projectKey 截断 slug 到 251 字符（超出段长模拟） ·
`:90` projectsRoot/newBookDir/legacyBookDir 位置计算 · `:105` bookDocRelValid 正反例（形状检查，穿越交由 host 双位置解析层） ·
`:125` docRelBookIn/bookBucketValid：带桶 docRel（跨工作区共享） · `:146` isMdPath 只识别 md/markdown · `:154` isBookPath 识别书库内文档（`.book/` 前缀） ·
`:163` resolveIn 允许 root 内路径 · `:169` resolveIn 拒绝 `../` 越权 · `:174` resolveIn 拒绝绝对路径越权 ·
`:179` resolveIn 拒绝前缀同名目录误放行（安全边界） · `:186` resolveIn 允许 root 自身 ·
`:191` nextIssueNo：取最大序号 +1 并两位补零 · `:201` nextIssueNo：无既有台账时从 01 起

> **注意**：这 21 条**已经迁移完毕**（P2-A 交付 `tests/fs-utils.spec.ts`，56 例，含扩充）。P5 只需核对而非重迁 —— 见 §6.1。

**`gen-scope.test.js`（24，`:33-702`）**
`:33` genScopeAllow：未提供可用集合时返回期望名单，提供时取交集 · `:45` renderPromptTemplate：只替换 `${name}`，未知占位符与 `{{...}}` 原样保留 ·
`:56` formatStamp：YYYY-MM-DD HH:mm（本地时区补零，与技能脚本同格式） ·
`:152` gen-doc：cwd 固定 books/session、无 subagent 标、工具面收敛、不注入 system 段 · `:194` gen-doc：产物已存在时自动进入「更新」模式，规范段要求先读旧文档 ·
`:216` gen-doc（folder/L1）：宿主渲染骨架经 `${skeleton}` 注入，含目录树子项与三处占位 · `:241` gen-doc（file/L2）：宿主渲染骨架注入，工具面保留检索但不含技能/shell ·
`:272` gen-doc（src/L3）：骨架落盘不注入、工具面 read/write/edit、无技能与脚本 · `:339` gen-doc（src/L3）：宿主收尾构建产物、写「源码层」索引、删除骨架 ·
`:374` gen-doc（src/L3）：子 agent 空转（骨架一条注解都没填）→ 置 error，不误报 success · `:390` gen-doc（src/L3）：注解占比过低（排版自检不过）→ 置 error，不写产物、不删骨架 ·
`:416` gen-doc（src/L3）：basename 相同的两个 rel 并发 → 各用各的骨架，互不删除（#2 回归） · `:453` translate：cwd 固定、无 subagent 标、工具面收敛，且提示词只走 user message ·
`:480` session 目录即使带「项目根」index.json 也不被 knownBookRoots 当作书库桶 · `:502` 子会话预设：默认 ptc（PTC 探测），FS_GEN_PRESET 可回退 standard ·
`:549` gen-doc：子 agent 空转（产物未生成）→ 置 error，不误报 success · `:561` gen-doc：子 agent 写出产物 → 置 success（校验不误伤正常完成） ·
`:573` gen-doc：更新模式下子 agent 未改动产物 → 置 error（旧文档原地不动也是空转） · `:592` gen-doc（L1）：成功后宿主写入 index.json「目录层」条目，其它数组与项目根保留 ·
`:612` gen-doc（L1）：产物仍是骨架（语义占位未填写）→ 置 error，不写索引 · `:628` gen-doc（L1）：产物被清空（0 字节）→ 置 error，不写索引 ·
`:655` gen-doc（L2）：成功后宿主写入 index.json「文件层」条目（命名沿用 computeDocStem） · `:674` gen-doc（L2）：产物仍是骨架（占位未填）→ 置 error，不写索引 ·
`:690` gen-doc（L2）：产物被清空（0 字节）→ 置 error，不写索引

**`host-routes.test.js`（21，`:89-637`）**
`:89` apply 暴露测试句柄，root 默认 sandbox workspace · `:97` tree 列出目录与文件 · `:116` #1 /tree 归属兜底：已知根注册表尚未跟上切根时，节点仍归属当前根（不抛 ReferenceError） ·
`:154` read 读取文件，write 写入后 read 回读一致 · `:176` write 越权路径被拒绝（不会写出 root） · `:188` gen-doc 返回 taskId 与 docRel，gen-status 可查到任务（错误来自无 agentLoop） ·
`:218` read 超过 2MB 上限被拒绝 · `:233` set-root 拒绝不存在的路径 · `:247` POST 非法 JSON body 返回 400 而非 500 · `:259` 重复生成同 kind+rel 复用进行中的 taskId ·
`:278` gen-doc 未知 kind 返回 400 · `:290` gen-doc 对 markdown 文件拒绝生成 L2/L3 · `:312` gen-doc（folder）目标不是目录时 400，不创建任务 ·
`:328` gen-doc（file/src）目标不是文件时 400，不创建任务 · `:344` translate 返回 taskId 与 docRel（文章翻译层），任务可达 gen-status ·
`:385` translate 拒绝非 md 文件与书库内文档 · `:416` gen-doc/translate 目标不存在时 400，且不创建任务 · `:436` translate 重复请求复用进行中的 taskId ·
`:468` read 书库白名单：`../../` 穿越、四层外与非法结构 rel 均被拒绝 · `:502` read/tree 双位置回退：旧库文档仍可见，新桶优先 · `:553` 跨工作区共享：子树定向最近已知项目根桶，读写同桶

**`issues.test.js`（6，`:24-77`）**
`:24` issuesDir：DSH_FS_ISSUES_DIR 显式指定时优先（台账隔离靠它） · `:28` issuesDir：未设覆盖变量时回落到插件根 issues（生产行为不变） ·
`:38` nextIssueNoFromDisk：空台账目录从 01 起（读的是隔离目录，不是插件根） ·
`:42` syncIssueIndex：未登记索引的台账文件补进隔离目录的 README，工作树 issues/ 不被改写 · `:70` nextIssueNoFromDisk：已有台账文件时顺延序号 ·
`:74` syncIssueIndex：索引已存在时不重复追加（幂等）

**`real-composition.test.js`（8，`:24-154`）**
`:24` package.json 声明 loader 契约：exports[.]/main 指向 dsh/index.js 产物 · `:33` host 模块真实形态（源码入口 src/host/index.js）：无 default、name=fs、inject 齐备、apply 可执行 ·
`:43` loader 解析路径（exports[.] 自引用）与源码入口契约一致（产物存在时核对） · `:93` apply 装配：webServer.register 收到 /api/fs 前缀路由，effect 清理可执行 ·
`:116` NODE_ENV !== test 时生产 ctx 不挂 __fsTest（条件化验证：生产不挂） · `:133` cordis.patch.yml 插件行：id=fs 且 name 与包名一致（与模块 name 相互印证） ·
`:142` agent.cordis.yml 技能桥接行存在（skill-filesystem / tool-skill / customSkillDirs→skills/） · `:150` preset.yml 元信息存在且身份与插件对应

**`task-timeout.test.js`（2，`:74-120`）**
`:74` sweepGenTasks 淘汰超时 running：置 error + 字典文案 + finishedAt 打点；未超时不动 ·
`:104` 超时任务经 gen-status 可见且 error 透传字典文案（前端轮询停止依据）

---

## 2. API 映射表（`node:test` → vitest）

### 2.1 导入与运行器

| # | `node:test` 用法（源仓 `文件:行号`） | vitest 目标写法 | 说明 / 陷阱 |
|---|---|---|---|
| A1 | `import { test } from 'node:test'`（8/8 文件；`abilities.test.js:5`、`client-md-utils.test.js:3`、`fs-utils.test.js:1`、`gen-scope.test.js:10`、`host-routes.test.js:5`、`issues.test.js:8`、`real-composition.test.js:16`、`task-timeout.test.js:13`） | `import { describe, expect, it } from 'vitest'`，用例改写为 `it(...)` | 全仓 8 文件均无 `describe`，**禁止为迁移而新增 `describe` 改动语义**；若要分组，须保证 `describe` 只做组织、不改变共享状态时机 |
| A2 | 扁平 `test('中文标题', fn)`（135/135） | `it('中文标题', fn)` | 目标仓 `tests/fs-utils.spec.ts:1-4`、`locale.spec.ts`、`real-composition.spec.ts` 已是该风格，**照抄这个先例** |
| A3 | `await test('…', async () => {…})` | — | **源仓 0 处**（实测），无需处理 |
| A4 | `node:test` subtest `t.test(...)` | — | **源仓 0 处**（实测），无需处理 |
| A5 | 测试上下文 `async (t) =>`（`real-composition.test.js:43`） | `it('…', async (ctx) => {…})` | vitest 的 `TestContext`。`ctx.skip()` 已在 vitest 4 类型里定义（源码核实：`node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:180` 与 `:398`） |
| A6 | `t.skip('原因')`（`real-composition.test.js:50`） | `ctx.skip()`（**动态跳过**，保留运行期判据）或 `it.skip(...)`（**静态跳过**） | **必须选动态 `ctx.skip()`**：该用例的跳过条件是运行期探测（构建产物存在与否），静态 `it.skip` 会把「永远不跑」写死。vitest 允许在用例体内调用 `ctx.skip()` 并标记为 skipped |

### 2.2 断言

源仓 `import assert from 'node:assert/strict'` 分布在全 8 文件。实测调用次数（读源码逐文件统计的静态数，见 §8 未核实 2）：`equal` 约 360、`match` 约 97、`deepEqual` 约 56、`ok` 约 38、`throws` 5、`doesNotMatch` 5、`rejects` 4、`notEqual` 4。

> **裁决**：`node:assert/strict` 在 vitest 下**技术上可原样保留**（vitest 跑在 Node 上），但**本仓不作为目标形态** —— 理由有两条硬依据：① 目标仓既有三个 spec（`fs-utils.spec.ts`、`locale.spec.ts`、`real-composition.spec.ts`）**全部**已用 `expect`，混用会造成同一仓两套断言风格；② `expect` 的失败信息带 diff，`assert` 不带。**故全部映射为 `expect`。**

| # | `assert` 用法（源仓样例） | vitest 目标写法 | 陷阱 |
|---|---|---|---|
| B1 | `assert.equal(a, b)`（`fs-utils.test.js:28`） | `expect(a).toBe(b)` | `toBe` 用 `Object.is`；对字符串/数字/布尔等价。**对对象/数组会失败** —— 那种情况源仓用的是 `deepEqual` |
| B2 | `assert.deepEqual(a, b)`（`fs-utils.test.js:107`、`abilities.test.js:196`、`fs-utils.spec.ts` 已用 `toEqual`） | `expect(a).toEqual(b)` | `toEqual` 递归宽松比较（忽略 `undefined` 属性）；`assert.deepEqual` 也是宽松的。若原意是严格结构，用 `toStrictEqual` —— **源仓语义是宽松**，故用 `toEqual` |
| B3 | `assert.notEqual(a, b)`（`host-routes.test.js:184`、`gen-scope.test.js:433`、`gen-scope.test.js:445`） | `expect(a).not.toBe(b)` | — |
| B4 | `assert.ok(x)` / `assert.ok(x, '消息')`（`abilities.test.js:66`、`host-routes.test.js:200`；带消息：`abilities.test.js:93`、`issues.test.js:61`） | `expect(x).toBeTruthy()`；带消息 → `expect(x, '消息').toBeTruthy()` | vitest 的消息参数是 `expect(actual, message)`，第 2 参即 message |
| B5 | `assert.equal(f(x), false)` 形式的布尔断言（`abilities.test.js:101`、`client-md-utils.test.js:79`） | `expect(f(x)).toBe(false)` | **不要**改写成 `toBeFalsy()`：源仓断言的是**严格 `false`**，改弱即为放宽断言（`dsh-ci-test-reliability/SKILL.md:104-113` 明令禁止） |
| B6 | `assert.match(str, /re/)`（`abilities.test.js:65`、`gen-scope.test.js:179`） | `expect(str).toMatch(/re/)` | — |
| B7 | `assert.doesNotMatch(str, /re/)`（`gen-scope.test.js:189`、`:268`、`:307`） | `expect(str).not.toMatch(/re/)` | — |
| B8 | `assert.throws(fn, /re/)`（`fs-utils.test.js:80`、`:171`、`:176`、`:183`；`abilities.test.js:300`） | `expect(fn).toThrow(/re/)` | 传**函数**而非调用结果 |
| B9 | `assert.throws` 后**读错误对象属性**（P2-A 先例 `tests/fs-utils.spec.ts:38-46` 的 `caughtError`） | 用 try/catch 收下错误：`expect((err as {statusCode?: number}).statusCode).toBe(400)` | vitest 的 `toThrow` 只给消息，**拿不到自定义属性**。`resolveIn` 的 `err.statusCode = 400`（`src/host/fs-utils.js:153`）只能这样观察 —— P2-A 已给出可直接照抄的范式 |
| B10 | `await assert.rejects(promise, /re/)`（`abilities.test.js:324`、`gen-scope.test.js:371`、`:387`、`:412`） | `await expect(promise).rejects.toThrow(/re/)` | `assert.rejects` 接受 promise **或**返回 promise 的函数；vitest 的 `rejects` 需要 promise 值。源仓 4 处都是「值」形式，安全 |
| B11 | `assert.ok(a \|\| b)` 之类复合（`gen-scope.test.js:499`） | 拆成 `expect(...)` 两条，或保留布尔表达式 + `toBe(true)` | 改写成两个更细的断言**不算放宽**；但不得删条件 |

### 2.3 钩子（`before` / `after` / `beforeEach` / `afterEach`）

| # | `node:test` | vitest | 源仓现状 |
|---|---|---|---|
| C1 | `before` / `after` / `beforeEach` / `afterEach` | **同名，`import { before, after, beforeEach, afterEach } from 'vitest'`** | **源仓 0 处**（实测 `grep -nE "after\(|before\("` 只命中 `readFile`/`describe` 等词，无钩子导入）。故本节为「新增能力」而非「映射」 |
| C2 | 无对应物（源仓靠模块顶层 `await mkdtemp` + 顶层 `process.env` 赋值） | `beforeAll` / 顶层 await | vitest **支持** spec 顶层 await（等价于 `beforeAll`）—— 目标仓 `real-composition.spec.ts` 已用 `afterEach` 清理 fiber（`:46-49`）作为先例 |

> **建议**（不强制，但能直接降低 §4 风险）：把源仓的「模块顶层 `mkdtemp` + 顶层 `process.env` 赋值」改为 `beforeAll` + `afterAll`，把临时目录改动收进 `afterAll` 还原。这样即使用例失败也能还原全局状态，符合 `dsh-ci-test-reliability/SKILL.md:45-55`「register restoration immediately」。

### 2.4 模拟（`t.mock` / `mock.method`）

| # | `node:test` | vitest | 源仓现状 |
|---|---|---|---|
| D1 | `t.mock.fn()` / `t.mock.method(obj, 'm')` | `vi.fn()` / `vi.spyOn(obj, 'm')` | **源仓 0 处**（`grep -nE "mock\." tests/*.test.js` 无命中）。源仓一律用**手写替身**（`createCtx` 的 `webServer: { register() {} }`、`fakeAgentLoop`） |
| D2 | `mock.method` 的自动还原 | `vi.spyOn` + `afterEach(() => vi.restoreAllMocks())` | P2-A 已给出范式：`tests/fs-utils.spec.ts:40-43` |
| D3 | 模块级 mock（`node:test` 无直接对应） | `vi.mock('…')` + `vi.hoisted` | **源仓 0 处**。目标仓 `real-composition.spec.ts:63-72` 走的是「只替换模块解析一道缝」的真 Loader 路线，**比 `vi.mock` 更强**，P5 应沿用 |
| D4 | 环境变量改写 | `vi.stubEnv(k, v)` + `vi.unstubAllEnvs()` | **未核实**（本仓未见先例）。P2-A 的 `fs-utils.spec.ts:42` 已调用 `vi.unstubAllEnvs()`，说明该 API 在本版本存在但**尚无 spec 实际使用** —— 执行者若采用，须先跑一次确认 |

### 2.5 覆盖率与命令行

| # | 源仓（`package.json:24`） | 目标仓 | 说明 |
|---|---|---|---|
| E1 | `NODE_ENV=test node --test` | `vitest run` | vitest 自身会把 `NODE_ENV` 置为 `test`（**未核实**具体时机）。源仓 `process.env.NODE_ENV ??= 'test'` 的兜底**建议保留**（`??=` 幂等，零成本） |
| E2 | `--experimental-test-coverage` | `vitest run --coverage` + `vitest.config.ts` 的 `coverage` 块 | 目标仓已配好 |
| E3 | `--test-coverage-include=src/host/fs-utils.js`（3 个白名单） | `coverage.include: ['src/**/*.ts']`（**已扩大，不是白名单**） | **这是一处实质差异**：源仓只统计 3 个纯逻辑文件；目标仓统计 `src/**` 下**除两个入口外的一切**。T-51 的范围因此远大于源仓的已知缺口 —— 见 §5 |
| E4 | `--test-coverage-lines=100 --test-coverage-functions=100` | `thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 }` | 目标仓已配（`vitest.config.ts`）。**源仓无 branches 阈值**（`contracts.md` §D4 已核）—— 这是 D-2 新增的严格项 |
| E5 | 无 `--test-concurrency` / `--test-timeout` | `test.pool`（默认 `forks`）、`test.isolate`（默认 `true`）、`test.fileParallelism`（默认 `true`） | 三个默认值**已从本仓 `node_modules` 源码核实**：`node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:2842`（pool）、`:2817`（isolate）、`:2853`（fileParallelism）、`:2805`（environment 默认 `'node'`） |
| E6 | 无（node:test 无 per-file 环境概念） | 文件顶部 `// @vitest-environment node` | **已从源码核实**：`node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:100` 的 `detectCodeBlock()` 用 `/@(?:vitest\|jest)-environment\s+([\w-]+)\b/` 解析该 docblock，默认回落到 `project.config.environment`。**本仓 `vitest.config.ts` 全局设了 `environment: 'jsdom'`**，故 host 侧 spec 若不加 pragma 就会跑在 jsdom 下 —— 见 §4.4 |

### 2.6 待核实小节

以下项本文**没有**找到权威出处，执行者必须在 P5 动手前用一次实测确认，**不得照抄本文的任何猜测**：

| # | 待核实问题 | 建议的核实方法 | 影响 |
|---|---|---|---|
| V1 | `vi.stubEnv` / `vi.unstubAllEnvs` 在 vitest 4.1.11 的确切语义（是否影响 `process.env` 本体、是否自动按用例还原） | 写一个 8 行的一次性 spec：`stubEnv` 后读 `process.env`，跑 `vitest run` 看值 | 决定 §4.2 的 `process.env` 隔离写法 |
| V2 | `coverage.include: ['src/**/*.ts']` 下**未被任何 spec 导入**的文件是否报 0% 并触发 `perFile` 失败 | `PROGRESS.md` T-10 已记「measured: one uncovered file exits 1」——**这是本仓实测证据，可直接引用**；若要复核，临时新增一个未被导入的 `src/x.ts` 跑 `test:coverage` | 决定 T-51 是否必须为「零引用文件」补测试 |
| V3 | `process.env` 的修改在 `pool: 'forks'` + `isolate: true` 下是否**跨 spec 文件**可见 | 两个 spec：A 改 `process.env.DSH_HOME`，B 在用例里读并断言 | 决定 §4.2 是否必须逐文件还原 env |
| V4 | jsdom 环境下 host 侧 spec 里 `setImmediate` / `process` / `node:fs` 是否可用 | 在 jsdom 默认环境下跑一个用 `setImmediate` 的最小 spec | 决定 §4.4 是「必须加 pragma」还是「建议加 pragma」 |
| V5 | vitest 4 是否在 spec 执行前把 `process.env.NODE_ENV` 设为 `'test'` | 在一个 spec 顶部 `expect(process.env.NODE_ENV).toBe('test')` | 决定源仓 `NODE_ENV ??= 'test'` 兜底是否仍必要 |
| V6 | oxlint 的 `typescript/no-unsafe-member-access` 等规则是否会因 spec 访问 `ctx.__fsTest`（当前无类型声明）而报错 | P3 落地 `src/host/index.ts` 后跑 `npm run lint` | 决定 spec 是否需要为测试句柄补类型断言 |

---

## 3. 时序与时序辅助（P5 硬要求）

### 3.1 背景机制（为什么必须等信号）

宿主的路由在**把任务放进 Map 之后**用 `setImmediate` 起真实后台任务，并**立即**回 200：

- `src/host/index.js:294` `genTasks.set(taskId, { … })` → `src/host/index.js:308` `setImmediate(() => { runGenDoc(rel, kind, taskId).catch(…) })`
- `src/host/index.js:331` `genTasks.set(taskId, { … })` → `src/host/index.js:347` `setImmediate(() => { runTranslate(rel, taskId).catch(…) })`

因此测试可观察到的「任务刚建好」与「任务已跑完」之间存在**一段由事件循环调度决定的窗口**。源仓在 2026-09-11 已把固定 `sleep(50)` 全部替换为「等可观测信号」（`AGENTS.md` §1「测试可靠性」、§2 缺陷 C），实测 12 并发 × 3 轮 = 36 次 0 失败。

**P5 铁律**：迁移后这 5 个辅助函数的**等待对象与超时用途必须逐字保持**。禁止退化为 `setTimeout(r, N)`、`vi.advanceTimersByTime` 或任何固定睡眠 —— 依据 `docs/testing.zh.md:21` 与 `.agents/skills/dsh-ci-test-reliability/SKILL.md:77`（原文见 §9）。

### 3.2 逐一定位与语义

| # | 辅助函数 | 定义位置 | 等的是什么信号 | 超时上限的用途 | 调用点 |
|---|---|---|---|---|---|
| T1 | `waitSettled(handle, taskId)` | `tests/gen-scope.test.js:137-148`（常量 `SETTLE_TIMEOUT_MS = 10_000` 在 `:136`） | 轮询**真路由** `GET /api/fs/gen-status?id=<taskId>`（`:140`），直到返回的 `task.status` **离开 `pending`/`running`**（`:142`） | 仅防挂死（`:143-145` 抛 `任务未在 10000ms 内收尾`）；**不是**同步手段 | **13 处**：`:162, 208, 228, 252, 283, 321, 435, 436, 463, 511, 523, 546, 652` |
| T2 | `waitTaskRegistered(genTasks, rel)` | `tests/host-routes.test.js:66-75`（deadline 在 `:67`、超时抛错 `:72`；步进 2ms `:73`） | 轮询宿主 `genTasks` Map，等到出现 `t.rel === rel` 且 `status ∈ {pending, running}` 的**占位记录**，并**返回该记录** | 仅防挂死 | **1 处**：`host-routes.test.js:459`（`translate 重复请求复用进行中的 taskId`） |
| T3 | `waitTaskSettled(genTasks, taskId)` | `tests/host-routes.test.js:79-87`（deadline `:80`、超时抛错 `:84`；步进 2ms `:85`） | **直接读内存 Map**（不走 HTTP），轮询到 `task.status !== 'pending' && !== 'running'` | 仅防挂死 | **2 处**：`host-routes.test.js:203, 371` |
| T4 | `skeletonPathFrom(rec)` | `tests/gen-scope.test.js:150` | **不是等待**，是提取器：`/SKELETON = (\S+)/.exec(rec.followup.content[0].text)[1]` —— 从**该会话自己的** followup 文本里取骨架绝对路径 | 无 | `:290, 318, 371, 413, 428, 443, 444` |
| T5 | `docAbsFrom(captured)` | `tests/gen-scope.test.js:536` | 同上，提取 `产物文档 DOC = <abs>` | 无 | `:540, 646` |

**T2/T3/T4 的语义细节（容易迁丢）**：

1. **T2/T3 读的是 `genTasks` Map 本体，不是 HTTP**。`genTasks` 从 `ctx.__fsTest` 取得（`src/host/index.js:483-491` 的测试句柄）。迁移后若改成走 HTTP 轮询，语义就变了（多一层请求时序）—— **不允许**。
2. **T2 的存在理由写在源码注释里**（`host-routes.test.js:456-458`）：去重读的是 `genTasks` 占位记录，而占位之前还有若干 `await`（读 body、预检 `stat`、能力 `precheck`），所以「两个请求同时发起」**不保证**后者看到前者。断言必须挂在可观测的占位信号上。任何「等一小会儿再发第二次请求」的改法都是回归。
3. **T1 走的是真路由**，因此它同时验证了 `/api/fs/gen-status` 的形状（`out.json.task`）—— 这层断言不能省。
4. **T4 必须按会话取，不能读共享的 `captured`**。源码 `gen-scope.test.js:72-74` 明确写了理由：「并发用例里 captured 的字段会被后一个会话覆盖，断言必须按会话（rec）取」。`captured.calls` 数组（`:422`）正是为此存在。
5. **步进 2ms 是有意的**：宿主任务在 `setImmediate` 后通常几个 tick 内完成，2ms 的轮询等待时间远小于任何固定 `sleep(50)`，且不依赖负载。

### 3.3 迁移后必须保持的语义（逐条验收）

| # | 必须保持 | 反例（会被判为回归） |
|---|---|---|
| S1 | `waitSettled` 的判据是「`status` 离开 `pending`/`running`」这个**状态迁移** | 改成「等 200ms 再断言」 |
| S2 | 超时只用于**防挂死**，且超时抛出的错误消息含 taskId 或 task JSON | 把超时当成「到点就算完成」 |
| S3 | `waitTaskRegistered` 返回**占位记录**供后续比对 | 只等不返回，或返回 boolean |
| S4 | `skeletonPathFrom` 从**当次会话**的 followup 取路径 | 硬编 `skeleton-a.js.txt`（#2 缺陷已证明 basename 不唯一，见 `gen-scope.test.js:301-302` 与 `:416`） |
| S5 | `waitSettled` 走真 `gen-status` 路由 | 直接读 `genTasks`（会丢掉路由形状断言） |
| S6 | 这些辅助函数**不依赖 fake timers** | 在 spec 里开 `vi.useFakeTimers()` 却不 `advanceTimers`，导致轮询永不推进 |
| S7 | 超时常量仍是 **10 秒**（`SETTLE_TIMEOUT_MS = 10_000`） | 为防止偶发失败而调大到 60s（`SKILL.md:104-113` 把「无理由调大超时」列为 flake 掩盖） |

> **为什么不能靠加大超时**：`.agents/skills/dsh-ci-test-reliability/SKILL.md:104-113` 原文把「increasing a timeout without identifying the awaited state」「adding a sleep before cleanup or assertion」「adding retries」「making all files serial」并列为**必须拒绝的 flake 掩盖手法**；`:107-110` 前一句是「Do not present these as root-cause fixes for deterministic local tests:」。

---

## 4. 隔离与副作用（多 worker 下的加强项）

### 4.1 源仓现有的隔离手段（实测清单）

| # | 手段 | 位置（源仓） | 迁到 vitest 后是否够 |
|---|---|---|---|
| I1 | `process.env.DSH_HOME = <mkdtemp>` 顶层赋值 | `gen-scope.test.js:25-26`、`host-routes.test.js:15-16`、`task-timeout.test.js:23-24` | **够，但建议改 `beforeAll`+`afterAll` 还原**（§4.2） |
| I2 | `process.env.DSH_FS_ISSUES_DIR = <临时目录>` 顶层赋值 | `gen-scope.test.js:29`、`host-routes.test.js:19`、`issues.test.js:16` | 同上。这是缺陷 D 的修复（防改写受版本控制的 `issues/README.md`） |
| I3 | `process.env.DSH_HOME` 局部保存 / `try…finally` 还原 | `fs-utils.test.js:91-102` | **够**，这是全仓最规范的一处，其他文件应照它改 |
| I4 | `process.env.NODE_ENV ??= 'test'` | `gen-scope.test.js:8`、`host-routes.test.js:3`、`issues.test.js:6`、`real-composition.test.js:14`、`task-timeout.test.js:11` | **幂等，可保留**（V5 待核实必要性） |
| I5 | `process.env.NODE_ENV = 'production'` 临时改 + `finally` 还原 | `real-composition.test.js:117-127` | **够**（同进程内是该文件唯一改这处的地方） |
| I6 | `process.env.FS_GEN_PRESET = 'standard'` + `finally delete` | `gen-scope.test.js:519-527` | **够，但同一文件内其它用例若并发会串** —— 见 §4.3 风险 R2 |
| I7 | `mkdtemp` 每用例独立临时根 | `gen-scope.test.js:153/195/217/242/273/340/375/391/417/454/481/503/550/562/574/593/613/629/656/675/691`、`host-routes.test.js:117` | **够**。这是 `SKILL.md:36` 要求的正确做法 |
| I8 | `DSH_FS_ISSUES_DIR` 反证：断言工作树 `issues/README.md` 的**内容与 mtime** 都未变 | `issues.test.js:54-67` | **够，且是本仓最好的自证范式** —— 迁移时**逐字保留**（含 mtime 断言） |
| I9 | 纯字符串路径不落地 | `fs-utils.test.js:36/45/61/92/96/164/170/175/181/182/187` | **够**。`SKILL.md:39` 明确「Literal paths and URLs used only as parser inputs or expected values are not acquired resources」 |

### 4.2 必须加强的项

| # | 加强项 | 现状 | 建议做法 | 依据 |
|---|---|---|---|---|
| M1 | **可预测路径命名** | `host-routes.test.js` 有 **20 处** `join(tmpdir(), 'fs-route-xxx-' + Date.now())`（`:90, 98, 155, 177, 189, 219, 234, 248, 260, 279, 291, 313, 329, 345, 386, 417, 437, 469, 503, 555`）；`task-timeout.test.js:75, 105`；`real-composition.test.js:94, 120` 同形 | **全部改为 `await mkdtemp(join(tmpdir(), 'fs-route-xxx-'))`**。理由：`Date.now()` 只有毫秒精度，vitest `fileParallelism: true` 下两个不同 spec 文件在同一毫秒里可能取到同一路径；`SKILL.md:27` 明写「Process isolation does not isolate … predictable filesystem paths」，`:36` 要求「use `mkdtemp`; do not acquire predictable shared paths」 | `SKILL.md:27, 36` |
| M2 | **临时目录不清理** | 源仓无任何 `after`/`afterAll` 删除临时目录 | 每个 spec 加 `afterAll` 用 `rm(dir, { recursive: true, force: true })`。**注意**：这不是正确性要求，是避免长跑 CI 上 `/tmp` 累积；`SKILL.md:84-88` 要求「Dispose to quiescence」 | `SKILL.md:84-88` |
| M3 | **env 还原注册时机** | 源仓在模块顶层直接赋值，无还原（`I1`/`I2`） | 改为 `beforeAll` 赋值 + `afterAll` 还原（先记 `const prev = process.env.X`，还原时区分 `undefined` 与有值 —— 照抄 `fs-utils.test.js:100-101` 的写法） | `SKILL.md:45-55`（「capture whether the original value was absent or present; restore that exact state; register restoration immediately」） |
| M4 | **`process.env` 修改前先记录原值是否存在** | `fs-utils.test.js:100-101` 已做对；`gen-scope.test.js:527` 用 `delete` 直接删（未区分「原本不存在」与「原本有值」） | 统一成「保存 → 还原」；`delete` 只在确认原值确实不存在时使用 | 同上 |
| M5 | **jsdom 默认环境** | `vitest.config.ts` 全局 `environment: 'jsdom'`，但 host 侧 spec 是纯 Node 代码 | 每个 host 侧 spec 顶部加 `// @vitest-environment node`（该 docblock 已源码核实支持，见 §2.5 E6）；client 组件测试保持 jsdom | 源码核实 `cli-api.CnMVyzaz.js:100`；`SKILL.md:65`（平台语义差异） |
| M6 | **模块级缓存跨用例残留** | `src/host/book-store.js` 的 `rootsCache`（TTL 5s）、`docCache`（TTL 1.5s）；`src/host/prompt-loader.js:22` 的 `dirCache`（Map，**无 TTL**） | 这些缓存在**同一 spec 文件内的多个用例间共享**（同一模块实例）。若某用例改了 `DSH_HOME`/`DSH_FS_ISSUES_DIR` 再断言缓存行为，必须用**独立的 `apply(ctx)`**（每次新建 ctx）而非依赖模块被重载 —— 源仓已经这么做（每个用例都 `apply(ctx)` 新建） | 静态推断 + 源码阅读 |
| M7 | **port 分配** | 目标仓 `tests/fixtures/loader-stubs.ts:58` 已用 `server.listen(0, '127.0.0.1', …)` 读内核分配的端口 | **保持**；若 P5 新增需要监听端口的用例，**禁止**「先扫空闲端口再 bind」 | `SKILL.md:34-36` |

### 4.3 跨文件污染源清单

| # | 污染源 | 为什么会跨文件 | 现状（vitest 默认下） | 处置 |
|---|---|---|---|---|
| P1 | `process.env.DSH_HOME` | 进程级环境变量 | `pool: 'forks'` + `isolate: true`（**源码核实** `reporters.d.DtoKVV2s.d.ts:2842` / `:2817`）下每个 spec 文件独立进程，理论上不跨文件 | **仍须实测确认（V3）**；即便隔离成立，也要按 M3 还原，不依赖 runner 实现细节 |
| P2 | `process.env.DSH_FS_ISSUES_DIR` | 同上 | 同上 | 同上 |
| P3 | `process.env.NODE_ENV` | vitest 自身与插件都读它 | `real-composition.test.js:119` 会临时置 `production` | 该用例若与同文件其它用例并行会串 —— vitest 同文件内**默认串行**（`SKILL.md:29` 提醒 sequential 无法保护跨进程资源，但**同文件内串行是默认**），风险可控 |
| P4 | `process.env.FS_GEN_PRESET` | 同 P1 | `gen-scope.test.js:519` 置 `standard` 后到 `:527` 删除 | **风险最高的一处**：它是「插件读 env 决定预设」的开关，若该 spec 文件内两处用例并行（`it.concurrent`）会互串。源仓全部用例串行，故当前安全；**迁移时禁止把用例改成 `it.concurrent`** |
| P5 | 模块级可变状态（`rootsCache`/`docCache`/`dirCache`） | 同一 spec 文件内的所有用例共享同一模块实例 | 源仓通过「每用例新建 ctx」规避了业务状态，但 `dirCache` **没有任何失效入口** | 迁移时不得新增「同文件内先跑 A 建立缓存、再让 B 断言缓存」的耦合用例；若必须，用 `vi.resetModules()` + 动态 `import()`（**未核实**：`vi.resetModules` 对 vite-node 模块图的确切效果） |
| P6 | 全局临时目录命名 | 不同 spec 文件可能取到同名路径 | 见 M1 | 见 M1 |
| P7 | 计时器 | `src/host/task-utils.js:36` 的 `timer.unref()`；`withTimeout` 的竞速计时器 | 进程退出前不会被计时器拖住（已 `unref`），跨文件无影响 | 无需改动；**但禁止**在 spec 里开 fake timers 修轮询 |
| P8 | 监听端口 | 目标仓 loader stub | `listen(0)` | 保持 |
| P9 | `process.cwd()` | 目标仓 `real-composition.spec.ts:30` 用 `process.cwd()` 推 fixture 目录 | vitest 的 `process.cwd()` 是**项目根**（已由该 spec 注释确认）；源仓用 `import.meta.url` | 源仓 8 文件都在用 `new URL('../package.json', import.meta.url)` / `fileURLToPath(new URL(…))`（`real-composition.test.js:25, 134, 143, 151`；`issues.test.js:19-20`）。**迁移后 `import.meta.url` 在 vitest 里解析到的是源文件路径而非非 file URL**（`real-composition.spec.ts:28-30` 的注释说「Vitest resolves `import.meta.url` to a non-file URL」）—— **未核实**该说法是否对 `fileURLToPath` 同样成立；执行者必须实测，若失败则改用 `process.cwd()`（已有先例） |

### 4.4 jsdom 对 host 侧 spec 的影响（必须处理）

`vitest.config.ts` 里 `environment: 'jsdom'` 是**全局**默认。源仓的 host 测试全部是纯 Node 代码（`node:fs`、`node:path`、`EventEmitter`、`setImmediate`）。给出两条并行措施：

1. **文件级 pragma**：在每个 host 侧 spec 第一行加 `// @vitest-environment node`（支持性已源码核实，§2.5 E6）。
2. **若 pragma 不便**（例如同一文件里 host 与 client 混测）：在 `vitest.config.ts` 用 `test.environmentMatchGlobs` —— **未核实**该选项在 vitest 4 是否仍存在（本仓 `grep -rn "environmentMatch" vitest/dist` **无命中**，疑似已移除）。**故不要采用第 2 条**，一律用文件级 pragma。

### 4.5 隔离自证（迁移后必须做）

`SKILL.md:120-127` 要求「global mutation needs restoration evidence」。对本仓，P5 至少要有：

1. `issues.spec.ts` 复现 `issues.test.js:54-67` 的**双证据**：工作树 `issues/README.md` 内容 + mtime 均未变。
2. 新增一条「env 还原自证」：在某 spec 里改 `DSH_HOME` 后 `afterAll` 还原，并在别的 spec 断言读到的 `DSH_HOME` 不是前者设的值（若 V3 实测证明隔离成立，则这条改为断言「同文件内跨用例已还原」）。
3. 并发证据：**连跑 3 轮 `npm test` 全绿**（`docs/spec-p5-p6-tests-and-cutover.md` §6.3 已要求），并额外做 12 并发 × 3 轮（对齐源仓缺陷 C 的回归口径）。

---

## 5. 覆盖率补齐策略（T-51）

### 5.1 口径（口径来源：`vitest.config.ts` + D-2）

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: ['src/host/index.ts', 'src/client/index.ts', 'src/**/*.d.ts'],
  thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
}
```

**四项 100%、per-file**。这与源仓口径有两处实质差异，必须先认清：

| 差异 | 源仓 | 目标仓 |
|---|---|---|
| 统计范围 | 3 个纯逻辑文件白名单 | `src/**` 除两个入口外**全部** |
| 分支阈值 | **无** | **100%** |

> **范围警告**：T-33 要求「P3 落地后把 `src/host/index.ts` 移出 `coverage.exclude`」，此刻它的 494 行路由与状态机就进入 100% 门槛。**P5 执行者必须先向主智能体确认 T-33 是否已执行**，以确定 T-51 是否包含它 —— 见 §8 未解问题 1。

### 5.2 已知 / 可预判的未覆盖点（逐条给「用真实用例覆盖」的思路）

以下为**静态推断**（只读扫描源码分支），执行者须先跑一次 `npm run test:coverage` 拿到真实缺口表，再按本表补齐。

| # | 未覆盖点（源仓 `文件:行号`） | 为什么难 | 用真实用例覆盖的思路 |
|---|---|---|---|
| U1 | `src/host/fs-utils.js:149` `process.platform === 'win32' ? '\\' : '/'` 的 win32 支 | POSIX 上永不执行 | **已解决**：P2-A 在 `tests/fs-utils.spec.ts:319-326` 用 `vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')` 覆盖，并配 `afterEach(() => vi.restoreAllMocks())`（`:40-43`）。**照抄这个范式** |
| U2 | `src/host/book-store.js:103`（`bestRootFor` 的 `sep`）与 `:163`（`cachedBookView` 的 `sep`）的两处 win32 支 | 同上 | 同 U1 的 `vi.spyOn(process, 'platform', 'get')`。**注意**：`bestRootFor` 在 `:103` 之后才被用于 `abs.startsWith(p + sep)` 判定，win32 用例必须构造 `C:\...` 形式的字符串路径（**纯字符串，不落地**），并断言「父根 + `\` 前缀命中、父根 + `/` 前缀不误命中」 |
| U3 | `src/host/fs-utils.js:8` `process.env.DSH_HOME \|\| join(homedir(), '.dsh')` 的 `homedir()` 支 | 测试总设 `DSH_HOME` | 显式用例：`delete process.env.DSH_HOME`（保存并在 `finally` 还原）→ `expect(booksRoot()).toBe(join(homedir(), '.dsh', 'books'))`。**P2-A 已覆盖**（`tests/fs-utils.spec.ts:71`） |
| U4 | `src/host/task-utils.js:36` `if (typeof timer.unref === 'function')` 的 **false 支** | Node 计时器恒有 `unref` | **这是最典型的「用真实用例覆盖」难题**。可行路径：把 `setTimeout` 替身注入 —— 用 `vi.spyOn(globalThis, 'setTimeout').mockReturnValue({ unref: undefined } as unknown as NodeJS.Timeout)`，断言 `withTimeout` 仍能 resolve/reject。**这不算凑数**：它验证的正是「计时器不可 unref 时不崩溃」这一防御分支 |
| U5 | `src/host/task-utils.js:16-17` `FS_GEN_PRESET` 的 `typeof override === 'string' && override.length > 0` 复合条件 | 需要三种输入 | 三组用例：未设（→ `'ptc'`）、设空串（→ `'ptc'`）、设 `'standard'`（→ `'standard'`）。**注意**空串支是 `length > 0` 的唯一触发点 |
| U6 | `src/host/issues.js:22` `if (dir) … else return ''` 的 `!dir` 支 | 需要「两个候选目录都不存在」 | 用 `vi.spyOn(fs, 'existsSync').mockReturnValue(false)`（或 `vi.spyOn` 针对 `node:fs` 的命名导出）把两个候选都判为不存在，断言 `issuesDir() === ''` 且 `nextIssueNoFromDisk() === '01'` |
| U7 | `src/host/issues.js:35` `.catch(() => [])`（`readdir` 失败） | 需要目录不可读 | `vi.spyOn(fsp, 'readdir').mockRejectedValue(new Error('EACCES'))` → 断言 `nextIssueNoFromDisk()` 回退 `'01'`，且**不抛** |
| U8 | `src/host/issues.js:44` `readFile(readmeAbs).catch(() => null)` 的 `null` 支 | 需要 README 不存在 | 临时目录里不放 `README.md` 直接调 `syncIssueIndex()` → 断言**不抛、不创建文件**（这是「索引补齐遇缺 README 时静默跳过」的真实行为） |
| U9 | `src/host/issues.js:52` `.catch(() => '')`（单个台账文件读失败） | 需要「目录里列得出、但读不出」 | 建一个文件名合法（`^\d{4}-\d{2}-\d{2}-\d+-.+\.md$`）但内容不可读的条目：`vi.spyOn(fsp, 'readFile')` 对该路径 `mockRejectedValue` → 断言 README 里仍补出了一行**带默认值**的索引（`skill: translate-doc`、`status: 问题提交`、`recurrence: 1`），这正是 `pick()` 兜底值被使用的那条路径 |
| U10 | `src/host/issues.js:48-50` 的 `pick(re, dflt)` 中「正则不命中 → 用 dflt」与「命中但捕获为空 → 用 dflt」（`m && m[1] ? … : dflt`） | 需要构造缺字段的台账 | 两个用例：① 台账文件只有 `# 标题`（缺 `skill:`/`type:`/`status:`/`recurrence:`）→ 断言四个默认值都出现在索引行；② 台账含 `skill:`（值空）→ 断言也走默认值 |
| U11 | `src/host/prompt-loader.js:31` `.catch(() => null)` 与 `:32` `st && st.isDirectory()` 的 **false 支**（候选存在但不是目录） | 需要构造「存在但非目录」 | 用 `vi.spyOn(fsp, 'stat').mockResolvedValue({ isDirectory: () => false } as Stats)` → 断言 `loadAbilityPrompt` 返回 `null`（而不是抛错） |
| U12 | `src/host/prompt-loader.js:41` `if (!ability \|\| !ability.dir) return null` 的**两个**子支 | 需要 `null` 与 `{}` 两种入参 | 两条用例：`loadAbilityPrompt(null)`、`loadAbilityPrompt({})` → 都断言 `null` |
| U13 | `src/host/prompt-loader.js:47-49` `if (err.code !== 'ENOENT') console.warn(...)` 的**两个**分支 | 需要两种读失败 | ① `mockRejectedValue(Object.assign(new Error('x'), { code: 'ENOENT' }))` → 断言返回 `null` 且 **warn 未被调用**（`vi.spyOn(console, 'warn')`）；② `code: 'EACCES'` → 断言返回 `null` 且 warn **被调用一次**。同时断言 `loadAbilityPrompt` **不抛**（这是「提示词不可用不应让整次生成任务失败」的契约） |
| U14 | `src/host/index.js:43-53` `sweepGenTasks` 的 **TTL 删除支**（`t.finishedAt && now - t.finishedAt > GEN_TASK_TTL`，`:44-47`） | 需要「完成超过 10 分钟」的任务 | 经 `ctx.__fsTest.genTasks` 塞一条 `{ finishedAt: Date.now() - 10*60*1000 - 1000 }` 的记录，调 `sweepGenTasks()`，断言**该记录被删除**（源仓 `task-timeout.test.js:74` 只覆盖了 running 超时支与「未超时不动」支，**没覆盖这条**） |
| U15 | `src/host/index.js:53-60` `GEN_TASK_CAP = 100` 的**超容量删除支** | 需要塞 > 100 条已完成任务 | `genTasks` 里塞 101 条带 `finishedAt` 的记录，调 `sweepGenTasks()`，断言 `size === 100` 且**删的是 `finishedAt` 最小的那条**（`[...values()].sort((a,b) => a.finishedAt - b.finishedAt)` 的语义） |
| U16 | `src/host/index.js:482` `process.env.NODE_ENV === 'test' && ctx && typeof ctx === 'object'` 的 `ctx` **非对象**支 | 需要传非法 ctx | 源仓 `real-composition.test.js:116` 已覆盖 `NODE_ENV !== 'test'` 支；`ctx` 非对象支需新增：`apply(null)` 或 `apply('x')` 断言**不抛**（**注意**：这可能与 P3 的防御设计冲突，须先确认 `apply` 对非法入参的既定行为） |
| U17 | `src/host/gen-executor.js`（6 处 `catch`）与 `src/host/translate-executor.js`（5 处 `catch`） | 需要触发子 agent 失败路径 | 源仓 `gen-scope.test.js` 已覆盖：无 `agentLoop`（→ error）、`whenIdle` 空转（→ error）、骨架未填（→ error）、注解率过低（→ error）、产物为空/仍是骨架（→ error）。**静态推断**仍缺：`dispose` 抛错（走 `onDisposeFailure` 只 warn）、`whenIdle` 超时（走 `withTimeout` 的 `ETASK_TIMEOUT`）。两者都可直接构造（`dispose: async () => { throw new Error('boom') }`；`whenIdle()` 返回永不 settle 的 promise 时**必须给 `withTimeout` 注入小时长的 ms**，否则用例要真等 10 分钟 —— **建议**改用可注入的 `ms` 参数或直接单测 `withTimeout`） |
| U18 | `src/client/index.js`（20 处 `catch`，771 行） | P4 尚未落地 | P4 会拆成多个 `.tsx` 文件；**除 `src/client/index.ts` 外的每个新文件**都在 100% 门槛内。归 P4/P5 交界，见 §8 未解问题 1 |

### 5.2.1 「逻辑都覆盖了、分支却不满」——先怀疑 `??` 的右侧 block（P4-A 实测，2026-09-11）

> **来源**：主智能体转述的 P4-A（`md-utils` 迁移）实测结论。这是**工具口径**问题，**不是逻辑缺陷**。

**现象**：初版按直觉写 `lines[i] ?? ''` / `m[1] ?? ''`，实测**分支覆盖只有 93.18%**，未覆盖行 **84、102**。

**根因**：`v8-to-istanbul` 把空值合并运算符 `??` 的**右侧操作数**当作一个**独立 block**；当右侧在该路径下不可达时，它被判为未覆盖。而逻辑或 `||` 的**恒假左操作数不判未覆盖**（因为它在主流路径上总被执行）。亦即：**同一段语义，写成 `??` 还是 `||`，v8 的分支口径不同。**

**参考改法（运行时等价）**：

- 先取局部变量再判定：
  ```ts
  const line = lines[i]
  if (line === undefined || line.trim() === '---') { /* … */ }
  ```
- 正则捕获组处用类型断言取非空：`m[1] as string`。该断言**既不是 `any` 也不是 `!`**，理由是「捕获组在匹配成功的分支上必然存在」+ `noUncheckedIndexedAccess` 会把它推成 `string | undefined`。**若断言，必须在代码注释里写明这个理由**（否则与「无理由的 `as`」无法区分）。

**落进 P5 的动作**：

1. 拿到 `test:coverage` 缺口表后，若某文件「行覆盖 100%、分支不满」，**第一件事是检查该文件里的 `??`**，尤其是「右侧是字面常量」的写法。
2. 改写必须**运行时等价** —— 改完要能通过原有的全部断言；`??` 与 `||` **不等价**（`??` 只对 `null`/`undefined` 回退，`||` 对一切假值回退），**禁止**为了覆盖率把 `??` 无脑换成 `||`。正确方向是「先取局部变量 + 显式 `undefined` 判定」，如上。
3. 三文件历史对照：迁移源 `fs-utils` 的**分支覆盖仅 88.75%**（`contracts.md` §D4 实测），迁移后**真补到 100%** —— 靠的是 `tests/fs-utils.spec.ts:319` 的 win32 真实用例等手段，**不是靠任何豁免指令**。这说明本仓的 100% 分支目标是可达的，`??` 口径问题也应按同一思路解决（真写用例或做等价改写），**绝不**用 `v8 ignore` / `istanbul ignore` / `c8 ignore` / 删逻辑绕过。

### 5.3 明令禁止的回避手段

以下手段**一律禁止**，出现即视为 T-51 未完成（依据：`docs/spec-p5-p6-tests-and-cutover.md` §5、`PROGRESS.md` D-2、`docs/testing.zh.md:13`）：

| 禁止项 | 为什么禁止 |
|---|---|
| `/* v8 ignore */` / `/* v8 ignore next */` / `/* c8 ignore */` | 直接抹掉未覆盖标记 —— 掩盖而非补齐 |
| `/* istanbul ignore */`（任何形态） | 同上 |
| **删除逻辑**以求覆盖 | `docs/testing.zh.md:13` 原文：「未覆盖的行往往是门禁正确标记出的死代码（**应删除**），而非需要补写的测试」—— 这句只授权删除**真死代码**，即「无任何引用的导出/分支」，**不授权**为了达标而删除可达的防御分支（`D-8` 已把「无任何引用的死代码」限定为 T-02 实测清单：`cardDismissed`/`setCardDismissed`、`genStatus`、未消费的 `isMdFile`/`isBookFile`/`picker`、4 个无 JS 引用的 CSS 类） |
| **往 `coverage.exclude` 加白名单** | 这是「换一个地方的 ignore」。两个入口的排除是 P1-A 已定的特例（`vitest.config.ts` 注释：wiring stub，无自有逻辑），**不得扩大** |
| **放宽 `thresholds`**（把 100 改成 99，或关掉 `branches`） | 与 D-2 直接冲突 |
| **放宽 tsconfig 严格度 / 引入 `any`** | 主仓 `AGENTS.md:143` 的纪律；且会掩盖类型层面的真问题 |
| **把用例标 `it.skip` / `it.todo` / `describe.skip`** 以绕过失败 | 与「135 例全部迁移且全绿」的验收冲突（例外：`real-composition` 的构建产物探测，那里**必须**用动态 `ctx.skip()` 且**必须保留原因文本**） |
| **弱化断言**（`toBe(false)` → `toBeFalsy()`、`toThrow(/具体/)` → `toThrow()`、`toEqual` → `toBeDefined`） | `SKILL.md:104-113` |
| **加大超时 / 加重试 / 全量串行** 以修偶发失败 | `SKILL.md:104-113` |
| **在断言前加 `sleep`** | `SKILL.md:77`、`SKILL.md:110` |

### 5.4 T-51 的执行顺序建议

1. 先跑 `npm run test:coverage` 拿**真实缺口表**（按文件 + 按行）。
2. **对每个「行覆盖 100%、分支不满」的文件，先做 `??` 排查**（§5.2.1）：检查是否有 `x ?? <字面常量>` 形态的右侧 block 被判未覆盖；这属于工具口径，改法是「先取局部变量 + 显式 `undefined` 判定」的**运行时等价**改写。
3. 把剩余缺口分成三类：**（a）P5 范围内的源测试已覆盖但目标文件缺**（多半已由 P2/P4 的 spec 解决）；**（b）本表 U1–U18 类型的真分支**（用真实用例补）；**（c）真死代码**（报主智能体裁决是否删，不自行删）。
4. 只对 (b) 写用例；(c) 走裁决；**绝不**对任何一项用 ignore 或放宽阈值。

---

## 6. 落地顺序建议

### 6.1 已经迁完的部分（**不要重迁**）

| 源文件 | 状态 | 目标 |
|---|---|---|
| `fs-utils.test.js`（21 例） | **已完成**（P2-A） | `tests/fs-utils.spec.ts`（412 行 / 56 例，含 win32 分支覆盖 `:319`） |
| `client-md-utils.test.js` 的 **locale 部分**（`:198`、`:204` 两例） | **已完成**（P2-A） | `tests/locale.spec.ts`（154 行 / 9 例，含 72 键全量比对） |
| `real-composition.test.js` 的**真 Loader 形态**（约 3 例的语义） | **已完成且更强**（P1-B） | `tests/real-composition.spec.ts`（178 行 / 3 例，真过 Loader） |

> **估算**：135 例中已有约 **23 例**（21 + 2）以更强的形式落地。**剩余待迁约 112 例**（real-composition 的 8 例中被 zc 版 3 例覆盖了一部分，故是「约」）。

### 6.2 分批（按依赖，不按文件顺序）

| 批次 | 内容 | 前置依赖 | 能否现在开工 |
|---|---|---|---|
| **W1 — 零依赖，随时可做** | `tests/issues.spec.ts`（6 例，源自 `issues.test.js`） | `src/host/issues.ts`（P2-B） | 依赖 P2-B 落地；**不依赖 P3/P4** |
| **W1** | `tests/abilities.spec.ts`（27 例，源自 `abilities.test.js`） | 四能力 `skeleton.ts`/`doc-render.ts` + `registry.ts`（P2-D） | 依赖 P2-D；**不依赖 P3/P4** |
| **W1** | `tests/task-utils.spec.ts`（源仓无对应文件，**新增**：`TASK_TIMEOUT_MS`、`withTimeout`、`genAgentPreset`、`errTaskTimeout`、`onDisposeFailure`） | `src/host/task-utils.ts`（P2-C） | **不依赖 P3/P4**；是 U4/U5/U17 的主要落点 |
| **W2 — 等 P3** | `tests/host-routes.spec.ts`（21 例，源自 `host-routes.test.js`） | P3-A 路由 + P3-B 状态机 | **必须等 P3**（需要 11 条 `/api/fs/*` 与 `ctx.__fsTest` 句柄） |
| **W2** | `tests/task-timeout.spec.ts`（2 例，源自 `task-timeout.test.js`） | P3-B 的 `sweepGenTasks` + `__fsTest` | **必须等 P3** |
| **W2** | `tests/gen-scope.spec.ts`（24 例，源自 `gen-scope.test.js`） | P3-A/B/C（`gen-executor`、`translate-executor`、提示词加载） | **必须等 P3 全绿**；其中 3 例（`:33/:45/:56` 的纯逻辑）其实可在 W1 先做 |
| **W3 — 等 P4** | `tests/md-utils.spec.ts`（24 例，源自 `client-md-utils.test.js` 的非 locale 部分） | `src/client/md-utils.ts`（P4-A） | **必须等 P4-A** |
| **W3** | client 组件/交互 spec（**源仓没有**，属新增） | P4-B~E | 必须等 P4 |
| **W4 — 收口** | `tests/real-composition.spec.ts` **补齐 5 例**（见 §6.3） | P3+P4 全落地 | 最后 |
| **W5 — T-51** | 全量 `test:coverage` 缺口补齐（§5） | 以上全部 | 最后 |

### 6.3 `real-composition` 的合并细则（**最容易做错的一处**）

zc 已有的 `tests/real-composition.spec.ts`（178 行）与源仓 `tests/real-composition.test.js`（155 行）**不是替换关系**，必须逐例裁决：

| 源用例（`real-composition.test.js`） | zc 现状 | 处置 |
|---|---|---|
| `:24` package.json loader 契约（`main` / `exports['.']` / `exports['./client']` / `dsh.bundle.patch`） | zc 版 `:171-176` 只断言了 `name` 与 `dsh.bundle.patch` | **补**：断言 `exports['.'] === './lib/index.js'`、`exports['./client'] === './client/client.js'`（值须与 `package.json` 实况一致，**不要照抄源仓的 `./dsh/index.js`**） |
| `:33` host 模块真实形态：`default === undefined`、`name === 'fs'`、`inject` 数组、`apply` 可执行 | zc 版通过 Loader entry tree 间接覆盖了 `name`/`id` | **补 `default` 与 `inject` 的显式断言**。依据 `docs/testing.zh.md:41`：「需要添加显式的 `expect('default' in mod).toBe(false)` 加 `unwrapExports` 往返断言」（原文见 §9） |
| `:43` loader 自引用（`await import('dsh-plugin-file-system')`）+ `t.skip` | **不应迁移** | **删除**。理由有硬依据：① 包名已改为 `dsh-plugin-file-system-zc`；② `docs/testing.zh.md:47` 原文要求「**绝不会**经由包的 `exports` 解析到构建后的 `lib/`，因为其中的陈旧产物会加载第二份模块单例」——zc 的 `exports['.']` 指向 `lib/index.js`，正是该条禁止的形态；③ zc 版已用真 Loader 取代 |
| `:93` apply 装配：`webServer.register` 收到 `/api/fs` 前缀 + effect 清理可执行 | zc 版 `:135` 断言 `['prefix /api/fs']`；`afterEach` 的 `fiber.dispose()`（`:46-49`）覆盖可逆性 | **已覆盖，不重写**；若要更贴近源仓，可补一条「dispose 后路由表为空」的显式断言 |
| `:116` `NODE_ENV !== 'test'` 时不挂 `__fsTest` | **zc 版缺失** | **必须补**。注意 P3 落地后 `__fsTest` 的挂载条件若变化，须以源码为准 |
| `:133` `cordis.patch.yml` 插件行 `id: fs` + `name: <包名>` | zc 版 `:162-169` 覆盖 | **已覆盖** |
| `:142` `agent.cordis.yml` 技能桥接行（`skill-filesystem` / `tool-skill` / `customSkillDirs` / `skills/`） | **zc 版缺失** | **补**（T-13 已把 `skills/` 迁入 zc，文件存在，可直接断言） |
| `:150` `preset.yml` 元信息（`name: 文件系统` / `description:` / `order: \d+`） | **zc 版缺失** | **补** |

> **lint 陷阱**：`.oxlintrc.json:160` 启用 `sonarjs/no-duplicate-test-title`（`files` 覆盖 `tests/**/*.ts`，见 `:152-155`）。合并时若标题与 zc 版既有 `it` 重名，**lint 会报错**。迁移时给每条用例起唯一标题。

---

## 7. 风险 Top 3（并发污染与 flaky 隐患）

### R1 — `process.env` 顶层赋值 + vitest worker 语义未经实测（最高）

`gen-scope.test.js:25-26, 29`、`host-routes.test.js:15-16, 19`、`task-timeout.test.js:23-24` 都在**模块顶层**改 `DSH_HOME` / `DSH_FS_ISSUES_DIR`，且**从不还原**。源仓 `node --test` 是每文件一进程、跑完即退，污染无后果。vitest 下：

- 若 `isolate: true`（**源码核实**为默认）成立，每个 spec 文件在独立进程中，污染不跨文件；
- 但 vitest 的 worker **可能被复用于多个文件**（取决于 pool 实现与 `maxWorkers`），一旦复用且 `isolate` 被后续调整，`DSH_HOME` 会带着**上一个文件的临时目录**进入下一个文件 —— 而那个目录可能已被删，导致 `booksRoot()` 指向幽灵路径。

**最坏情形**：`FS_GEN_PRESET`（`gen-scope.test.js:519-527`）被污染后，**其它文件的生成任务会静默换预设**，而断言只写在自己的 spec 里 —— 表现为「偶发失败且换一个 worker 数就消失」。

**处置**：按 M3/M4 全部改成 `beforeAll` 赋值 + `afterAll` 还原；并把 V3 作为 P5 的**第一个动作**实测。

### R2 — 可预测临时路径（20+ 处 `Date.now()` 命名）

`host-routes.test.js` 的 20 处 `join(tmpdir(), 'fs-route-xxx-' + Date.now())`（行号见 §4.2 M1）在 `fileParallelism: true` 下有**同毫秒碰撞**可能；两个 spec 文件若同时进到同一毫秒、且前缀恰好相同的用例（同文件内的用例是串行的，冲突只可能跨文件，而前缀目前每个文件不同 —— **故当前实际碰撞概率低，但这是运气而非设计**）。更隐蔽的是：这些路径**从不创建就使用**（如 `host-routes.test.js:90` 的 `apply(ctx)` 只需一个字符串 root），所以碰撞时表现不是「写坏文件」而是「两个 ctx 指向同一 root」，断言可能因**共享的临时目录内容**而假通过。

**处置**：全部改 `mkdtemp`（M1）。这是 `SKILL.md:27, 36` 的硬要求，不是优化。

### R3 — 时序辅助函数的「语义漂移」与 jsdom 环境叠加

两条独立的漂移路径叠加在同一个 spec 上：

1. **辅助函数漂移**：`waitSettled`（走真 HTTP）与 `waitTaskSettled`（读内存 Map）是两个**不同**的等待对象，迁移时极易合并成一个「等等看」的 `sleep`。合并后并发下必然漏判，而**单跑时往往通过** —— 正是 `docs/testing.zh.md:21` 定义的「该 spec 的缺陷」。
2. **jsdom 环境**：`vitest.config.ts` 全局 `environment: 'jsdom'`，若 host 侧 spec 忘了加 `// @vitest-environment node`，`setImmediate`、`process`、原生模块的行为可能与纯 Node 有差异，**且差异只在特定用例上暴露**（V4 待核实）。

**处置**：① 按时序函数逐条写验收断言（§3.3 S1–S7），并在 code review 时**逐字比对源与目标的循环体**；② 每个 host spec 首行加 pragma（M5）；③ 12 并发 × 3 轮压测（§4.5 第 3 条）。

---

## 8. 未核实项与未解问题

| # | 问题 | 为什么没结论 | 需要谁定 |
|---|---|---|---|
| 1 | **T-51 的确切文件范围**：T-33（P3 后把 `src/host/index.ts` 移出 `coverage.exclude`）是否已执行？若已执行，那 494 行路由/状态机也在 100% 门槛内，T-51 的工作量会翻倍。同理，P4 拆出的多个 client 文件（除入口外）也在门槛内 | 本文写作时 `vitest.config.ts` 仍排除两个入口，`src/host/index.ts` 仍是桩 | **主智能体裁决**，并写回本文件 |
| 2 | `assert.*` 各类调用的**精确计数**（`equal` 360 / `match` 97 等） | 本文引用的是 `contracts.md` §D2 的既有统计，本次预研用 grep 粗查与之一致，但**未逐文件精确重算** | P5 执行者可忽略（不影响迁移） |
| 3 | V1–V6（见 §2.6） | 属于「必须实测才知道」的运行期事实 | P5 执行者动手前逐条实测 |
| 4 | `real-composition.test.js` 的 8 例中，究竟哪几例已被 zc 版覆盖 | 本文按语义比对给出裁决表（§6.3），但「覆盖」是语义判断而非机械计数 | P5 执行者按 §6.3 逐条打勾 |
| 5 | `src/client/index.js`（771 行 / 20 catch）的 100% 覆盖可行性 | P4 尚未落地，文件结构未知 | P4 完成后重估 |
| 6 | `vi.resetModules()` 对本仓模块图（vite-node）的确切效果 | 无先例、未实测 | 若 M6 的缓存问题真出现，再处理 |
| 7 | `import.meta.url` 在 vitest 下的确切值（`real-composition.spec.ts:28-30` 的注释称其为 non-file URL） | 未实测；若成立，源仓 `fileURLToPath(new URL(…, import.meta.url))` 的写法（`issues.test.js:19-20`、`real-composition.test.js:25/134/143/151`）迁移后会**抛错** | P5 执行者实测；失败则改用 `process.cwd()`（`real-composition.spec.ts:30` 已有先例） |

---

## 9. 主仓规范原文摘引（逐条与本文的对应）

全部摘自 `/home/xuepeng/DSH/deepseekHARNESS/`。

### 9.1 `docs/testing.zh.md:21`（**并发可靠性的核心论断**）

> fork 出的 worker 会同时运行多个 spec 文件，coverage gate 会拆成并发的 partition，与同一个 job 中的其它 gate 并排运行，而自托管 runner 共用同一台宿主机和同一个卷。被隔离的只有进程：端口、可预测路径、外部命名空间和继承而来的子进程都不隔离。为每个占用的资源负责到它的 teardown，并把「只有单独运行时才通过」的 spec 读作该 spec 的缺陷，而不是 runner 不稳定。

**对应**：§3（时序硬要求）、§4.2 M1（可预测路径）、§4.3 P6、§7 R1/R2。

### 9.2 `docs/testing.zh.md:9`（单元测试的优先覆盖面）

> **单元测试**（`pnpm run test`）：vitest 运行包和示例各自的 `tests/**` 目录下的测试……优先覆盖边界情况、错误路径、事件顺序、并发竞态，以及针对约定回归的永久测试……

**对应**：§5.2（边界/错误路径的补法）、§6.2 W1（把纯逻辑先迁）。

### 9.3 `docs/testing.zh.md:13`（覆盖率门禁的口径）

> **覆盖率门禁**（`pnpm run test:coverage`）：门禁级运行，对 `packages/*/*/src` 按文件 100% 覆盖。未覆盖的行往往是门禁正确标记出的死代码（应删除），而非需要补写的测试。行覆盖率是必要条件，但永远不是充分条件：它证明行被执行过，不证明功能按交付预期工作。

**对应**：§5.1（per-file 100%）、§5.3（禁止 ignore，以及「删逻辑」的授权边界）。

### 9.4 `docs/testing.zh.md:39` 与 `:41`（真实入口路径 / 回归守卫）

> `:39` 产品可见的插件必须有一个非单元的真实组合测试。手动构建的 `ctx.plugin(...)` 套件不够：通过 Loader 和 app/process 启动仅用于测试的 `cordis.yml`，只 mock 外部服务或非确定性输入，断言模型可见的请求/日志、持久状态或用户可见输出。不要把 opt-in 选项混入交付默认值。

> `:41` 一个守卫只有在回归能让它失败时才有效。对于没有 `inject` 的插件（bundle/组合插件），Loader 冒烟测试在默认导出替换必需的具名导出时仍然绿着——需要添加显式的 `expect('default' in mod).toBe(false)` 加 `unwrapExports` 往返断言，并证明它有效：引入回归、观察变红、回退。

**对应**：§6.3（zc 版 real-composition 已是真 Loader，正是 `:39` 要求的形态；`:41` 直接给出 `default` 断言的写法）。

### 9.5 `docs/testing.zh.md:47`（测试解析：仅限源码）

> - 每个 vitest 配置都将 vite-tsconfig-paths 指向 `tsconfig.base.json`；工作区包的裸导入解析到 `src`，绝不会经由包的 `exports` 解析到构建后的 `lib/`，因为其中的陈旧产物会加载第二份模块单例。

**对应**：§6.3 第 3 行（**删除**源仓的包自引用用例 `real-composition.test.js:43-58` 的硬依据）。

### 9.6 `.agents/skills/dsh-ci-test-reliability/SKILL.md:77` 与 `:81`（同步纪律）

> `:77` A fixed sleep is not evidence that setup completed or cleanup settled.
> `:81` Use a timeout only to bound a wait, never as the condition that makes the assertion correct.

**对应**：§3.1（P5 铁律）、§3.3 S1/S2/S6。

### 9.7 `SKILL.md:104-113`（拒绝 flake 掩盖）

> `:104` Do not present these as root-cause fixes for deterministic local tests:
> `:106` - increasing a timeout without identifying the awaited state;
> `:107` - adding retries;
> `:108` - making all files serial;
> `:109` - swallowing an error or unhandled rejection;
> `:110` - weakening an assertion;
> `:111` - normalizing away unstable behavior;
> `:112` - adding a sleep before cleanup or assertion.

**对应**：§3.3 S7、§5.3（禁止清单）、§7（三条风险的处置都不得走这七条）。

### 9.8 `SKILL.md:27`、`:36`、`:45-55`、`:84-88`（资源与全局状态）

> `:27` Process isolation does not isolate host ports, predictable filesystem paths, external services, databases, sockets, or inherited child processes. For every acquired resource, identify its owner, atomic allocation mechanism, observable readiness signal, registered cleanup, and quiescent completion signal.
> `:29` Do not serialize an entire suite merely because one fixture lacks isolation. Narrow the exclusive scope or change the resource allocation first. A sequential Vitest block cannot protect a host resource from another file, process, job, or runner.
> `:36` - Create private per-test temporary roots with `mkdtemp`; do not acquire predictable shared paths.
> `:45` Treat `process.env`, `cwd`, fake timers, locale and timezone, module mocks, registries, console hooks, `globalThis`, and global `fetch` interception as exclusive mutable resources.
> `:51` - register restoration immediately;
> `:84` ### Dispose to quiescence
> `:88` Calling `abort()`, `close()`, or `kill()` without awaiting the owned completion signal is incomplete teardown.

**对应**：§4.1–§4.3 全部、§7 R1/R2。

---

## 10. 一页速查（P5 执行者开工前逐条确认）

- [ ] 已实测 V1–V6（§2.6），结论写回本文件
- [ ] 已向主智能体确认 T-51 的文件范围（§8 问题 1）
- [ ] 每个 host 侧 spec 首行加了 `// @vitest-environment node`（§4.2 M5）
- [ ] 所有 `Date.now()` 命名的临时路径已改 `mkdtemp`（§4.2 M1）
- [ ] 所有 `process.env` 改动已改为 `beforeAll` 赋值 + `afterAll` 还原（§4.2 M3/M4）
- [ ] `waitSettled` / `waitTaskRegistered` / `waitTaskSettled` 的**循环体与判据**已与源仓逐字比对（§3.2/§3.3）
- [ ] `skeletonPathFrom` / `docAbsFrom` 仍按**当次会话**的 followup 取值（§3.3 S4）
- [ ] `real-composition` 按 §6.3 裁决表逐条打勾，**未迁移包自引用那一条**，且无重复 `it` 标题（lint `sonarjs/no-duplicate-test-title`）
- [ ] 覆盖率缺口只用**真实用例**补，无 `v8 ignore` / `istanbul ignore` / `c8 ignore` / 删逻辑 / 加白名单 / 放宽阈值（§5.3）
- [ ] 「行满、分支不满」的文件已先排查 `??` 右侧 block 口径（§5.2.1），改写为运行时等价形式而非改语义
- [ ] 12 并发 × 3 轮 `npm test` 全绿（§4.5）
