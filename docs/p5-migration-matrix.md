# P5-A 迁移对账矩阵 — 源 135 例 vs zc 现有测试

> 制定：2026-09-11 · 执行者：P5-A 子智能体（逐条对账 + 非集成类缺口补齐）
> 迁移源：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`（只读，冻结于 `3a3f89e`）
> 目标仓：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc`
> 上游：`docs/spec-p5-tests-detail.md`（§1.4 的 135 条清单、§6.1/§6.3 的裁决表）、`docs/spec-p5-p6-tests-and-cutover.md`

## 0. 本文要回答的问题

P5 不是「把 135 例机械搬过来」——源 135 例是一套 `node:test` 扁平用例，而 zc 已有一套**比源更宽**的 vitest 套件。
机械搬运会与既有用例大量重复，且两套断言口径不同时会互相打架。

所以本文逐条回答：**源这 135 例各自验证的行为，在 zc 中是否都有等价或更强的验证？没有的，补齐；不该迁的，说明依据。**

结论四态：

| 结论 | 含义 |
|---|---|
| `已被 zc 覆盖` | 该源用例验证的行为，在 zc 有等价或更强的断言（给出 `文件:行号`） |
| `本次补齐` | zc 缺该行为的断言，已由本次新增 spec 补上（给出新用例） |
| `移交 P5-B` | 属 `src/host/index.ts`（真 HTTP 路由 / 任务状态机 / `__fsTest`）集成面，该源文件正被并行迁移，不属 P5-A 范围 |
| `不适用/不应迁移` | 行为在 zc 已消失，或迁移本身违反主仓规范（给依据） |

> **文件范围**：P5-A 只补**非集成类**缺口（`fs-utils` / `client-md-utils` / `abilities` / `issues` / `locale` / `task-utils`）。
> `gen-scope.test.js`（24 例）与 `host-routes.test.js`（21 例）走 `src/host/index.js` 的 `apply`（真 HTTP 路由 + 任务状态机 + 子 agent 编排），
> 且 `src/host/index.ts` 此刻正由另一位子智能体并行迁移，**不属 P5-A**，逐条列在 §4/§5 并标 `移交 P5-B`。

## 1. 结论分布

| 结论 | 条数 | 分布 |
|---|---|---|
| 已被 zc 覆盖 | **81** | abilities 26 + client-md-utils 26 + fs-utils 21 + issues 6 + real-composition 2 |
| 本次补齐 | **1** | abilities `:262`（见 §8） |
| 移交 P5-B | **47** | gen-scope 24 + host-routes 21 + task-timeout 2 |
| 其它缺口（承接方为在制品，P5-A 按任务书不得触碰该文件） | **5** | real-composition `:24` `:33` `:116` `:142` `:150` |
| 不适用/不应迁移 | **1** | real-composition `:43` |
| **合计** | **135** | 81 + 1 + 47 + 5 + 1 = 135 ✓ |

**一句话结论**：源 135 例所验证的行为，**81 例在 zc 已有等价或更强的断言**，**1 例由本次补测锁定**，
**47 例属 `src/host/index.ts` 集成面、移交 P5-B**，**5 例是 real-composition 面的静态断言缺口**
（承载文件正被另一位改写，按任务书「不要碰」交该承接方补），**1 例按主仓规范判为不应迁移**。

### 1.1 本次的实测证据（非静态推断）

在 zc 仓跑（只跑非集成类 spec，未触碰 `src/host/index.ts` 相关面）：

```
npx vitest run tests/{fs-utils,md-utils,locale,issues,task-utils,book-index,book-store}.spec.ts \
  tests/abilities-{folder-file,registry,source-doc,translate-doc}.spec.ts \
  --coverage --coverage.reportsDirectory=/tmp/p5a-cov --coverage.thresholds.100=false
→ Test Files 11 passed (11) / Tests 266 passed (266) / exit 0
```

覆盖率（v8，per-file）：

| 文件 | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `src/client/md-utils.ts` | 100 | 100 | 100 | 100 |
| `src/host/fs-utils.ts` | 100 | 100 | 100 | 100 |
| `src/shared/locale.ts` | 100 | 100 | 100 | 100 |
| `src/host/issues.ts` | 100 | 100 | 100 | 100 |
| `src/host/task-utils.ts` | 100 | 100 | 100 | 100 |
| `src/host/book-index.ts` / `book-store.ts` | 100 | 100 | 100 | 100 |
| `src/host/abilities/**`（registry + 四能力 index/skeleton/doc-render，共 11 文件） | 100 | 100 | 100 | 100 |

即：**P5-A 范围内的每个 src 文件都已达 file 级四项 100%**（`src/host/index.ts`、`gen-executor.ts`、`translate-executor.ts`、`prompt-loader.ts`、`client/index.tsx` 不在本次命令的 spec 集合内，故未在此行统计——它们分别由 P5-B 与 P4 的 spec 覆盖）。

## 2. 源与 zc 的文件对应

| 源文件（例数） | zc 对应 spec | 说明 |
|---|---|---|
| `abilities.test.js`（27） | `tests/abilities-folder-file.spec.ts`、`abilities-registry.spec.ts`、`abilities-source-doc.spec.ts`、`abilities-translate-doc.spec.ts` | 能力目录化后按能力拆成 4 个 spec |
| `client-md-utils.test.js`（26） | `tests/md-utils.spec.ts`（24）+ `tests/locale.spec.ts`（2） | locale 两例已单列 |
| `fs-utils.test.js`（21） | `tests/fs-utils.spec.ts` | P2-A 已迁并扩到 56 例 |
| `gen-scope.test.js`（24） | `tests/gen-executor.spec.ts`（部分） | 集成面，移交 P5-B |
| `host-routes.test.js`（21） | 尚无 `tests/host-routes.spec.ts` | 集成面，移交 P5-B |
| `issues.test.js`（6） | `tests/issues.spec.ts` | P2-B 已迁并扩到 20 例 |
| `real-composition.test.js`（8） | `tests/real-composition.spec.ts` | 该 spec 正由另一位改写（P5 收口），本文只给裁决 |
| `task-timeout.test.js`（2） | `tests/task-utils.spec.ts`（部分） | 集成面，移交 P5-B |

### 2.1 zc 的「更强形式」举例

- `tests/fs-utils.spec.ts` 在源的 21 例之外多覆盖 win32 分隔符分支、`~` 转义、`Infinity` 序号、`resolveIn` 的空参数分支。
- `tests/locale.spec.ts` 以「全量 72 键逐字比对」取代源的两条抽样断言。
- `tests/issues.spec.ts` 把 `syncIssueIndex` 的四条早退路径 + 五字段两条取值路径全部锁死，并在 `afterEach` 断言工作树 `issues/README.md` 内容与 mtime 未变（源只在一条用例里断言）。

## 3. 非集成类逐条对账

### 3.1 `abilities.test.js`（27 条）

| 源 | 用例标题 | 验证的行为 | 结论 | zc 证据 |
|---|---|---|---|---|
| `abilities.test.js:21` | renderFolderTree：目录在前、文件在后，各自按名升序，末项用 └── | 目录树排序与树形符号 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:81（断言 :88-94，与源同输入同输出逐字） |
| `abilities.test.js:31` | renderFolderTree：跳过隐藏项与排除目录，忽略非文件非目录项与空名 | 脏条目/隐藏项/排除目录过滤 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:56（null/undefined/空数组）、:62（null 条目、空名、既非文件也非目录）、:71（隐藏项与排除名单只作用于目录） |
| `abilities.test.js:49` | renderFolderTree：单项时即末项（└──），目录带尾斜杠 | 单项目录树 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:97 |
| `abilities.test.js:53` | FOLDER_TREE_IGNORE：与 gen-tree.sh 的 ign 名单一致（目录名精确匹配） | 排除名单逐项 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:101（toEqual 全量 + 三处占位串，更强） |
| `abilities.test.js:60` | renderFolderDocSkeleton：frontmatter 三行与目录树围栏由宿主写死，语义占位保留 | L1 骨架结构 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:113（toBe 全文逐字，比源的 match/includes 子集更强） |
| `abilities.test.js:79` | renderFileDocSkeleton：frontmatter 三行、标题、四章节标题与导出表头由宿主写死 | L2 骨架结构 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:317（toBe 全文逐字，更强） |
| `abilities.test.js:96` | FILE_DOC_PLACEHOLDERS：只含骨架固定串，不会误命中正常正文里的泛型/JSX | 占位串集合与误命中防线 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:375（toEqual 逐字两条）+ :381（泛型/JSX 不误命中）；「长度为 2」与 `^<.*>$` 形状由逐字集合隐含，更强 |
| `abilities.test.js:106` | isMostlyChinese：中文文档判为中文（翻译前应拒绝） | 中文判定正例 | 已被 zc 覆盖 | abilities-translate-doc.spec.ts:67 |
| `abilities.test.js:110` | isMostlyChinese：英文文档判为非中文（应进入翻译流程） | 无中文直接判否 | 已被 zc 覆盖 | abilities-translate-doc.spec.ts:60；:74-78 另锁定比例口径 |
| `abilities.test.js:114` | isMostlyChinese：中英混排但中文占优判为中文 | 混排正例 | 已被 zc 覆盖 | abilities-translate-doc.spec.ts:67（'中a'/'中文A'） |
| `abilities.test.js:118` | isMostlyChinese：拉丁字母远超中文但中文占比≥20% 仍判为中文 | 20% 阈值边界 | 已被 zc 覆盖 | abilities-translate-doc.spec.ts:74（更强：恰好 20% 判中文、低于 20% 判否，比源的 25% 例子更贴边界） |
| `abilities.test.js:125` | isMostlyChinese：无中文或空输入判为非中文 | 空/无中文兜底 | 已被 zc 覆盖 | abilities-translate-doc.spec.ts:54（null/undefined/''）+ :60（无中文字符） |
| `abilities.test.js:133` | ABILITIES/GEN_ABILITIES/TRANSLATE_ABILITY：键集合与翻译能力归类 | 注册表键集合与翻译归类 | 已被 zc 覆盖 | abilities-registry.spec.ts:15、:22、:26（更强：:17-19/:28-31 另断言值即描述符本体） |
| `abilities.test.js:139` | abilityOf：已知 kind 返回描述符，未知 kind 返回 undefined | 按 kind 取描述符 | 已被 zc 覆盖 | abilities-registry.spec.ts:36、:43（更强：多测 ''/'FOLDER'/constructor） |
| `abilities.test.js:147` | 每个能力描述符：必备字段齐备且 dir 与目录名一致 | 四描述符字段齐备性与 dir 对应 | 已被 zc 覆盖 | abilities-registry.spec.ts:55（kind/scope）、:63（dir/sub/arr/layer/promptFile 逐值，更强）；docStem 为函数见 abilities-folder-file.spec.ts:248、:395 与 abilities-translate-doc.spec.ts:34 |
| `abilities.test.js:159` | 骨架能力与钩子：folder/file/src 有 skeleton，src 有 verify/finalize，translate 有 precheck/verify | 钩子存在性与 src 的 L3 契约 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:370（keys 含 skeleton/verify/finalize 且 skeletonFile/hostBuild/hostIndex/scope 逐值）、abilities-folder-file.spec.ts:249、:396、abilities-translate-doc.spec.ts:34；均强于源的 typeof 判定 |
| `abilities.test.js:176` | docStem：folder 取目录名，file 与 computeDocStem 同规则 | 三能力 docStem 取值 | 已被 zc 覆盖 | abilities-folder-file.spec.ts:253（folder 取 basename）、:400（file 锁 'src-a'）、abilities-source-doc.spec.ts:387（src 锁 'src-a'） |
| `abilities.test.js:185` | buildUnits：连续注释合并为块、空行与纯符号行跳过、行号与缩进保留 | 单元划分规则 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:32（连续 // 合并为 block，code 含 '  // 第二行' 证明原行与缩进保留）、:39（空行 flush、纯符号行跳过、行号取真实行号）、:48（结尾 flush） |
| `abilities.test.js:204` | renderSourceSkeleton：@摘要 段 + 每单元 @行/@块 与待填的「注解: 」空位 | 骨架文本结构 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:57（@块 [N-M] / @行 [N] 逐字含 '注解: '）+ :69（空 units 全文 toBe 逐字，替代源的「空位计数 3」写法，更强） |
| `abilities.test.js:219` | parseFilledSkeleton：回填注解与摘要，多行块代码完整收集 | 解析器容错与回填 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:105（摘要区夹带说明行 → 取值）、:119（摘要区遇 @行/@块 退出 + block 回填）、:128（代码行累积与末尾 flushCode，多行 code 收集） |
| `abilities.test.js:247` | annotationStats：全空 / 部分 / 全填的 filled 与 ratio（宿主空转判据） | 空转判据统计口径 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:170（空输入 total 0/ratio 0）、:176（note 空与假值不计入 filled、ratio=0.25、全填 ratio=1） |
| `abilities.test.js:254` | langOf：按扩展名给围栏语言，未知扩展名回落 javascript | 围栏语言映射与回落 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:156（映射 ts/py + 大写归一）、:164（未知扩展名与无扩展名回落 javascript）；源对 .js/.mjs 的两条断言与「回落」同值、对映射表是否含 js 探测力为零 |
| `abilities.test.js:262` | renderAnnotatedDoc：短行短注解走行尾，长注解走行上方并继承缩进，行号不连续插空行 | 三处排版规则的产物文本 | 本次补齐 | 缺「行上方注解行继承其代码行的前导缩进」：zc 两条「改走行上方」用例（abilities-source-doc.spec.ts:246、:259）的源码行均无前导空白，`doc-render.ts:198` 的 indent 恒为空串 → 已补 `tests/p5a-abilities-parity.spec.ts:20` |
| `abilities.test.js:290` | renderAnnotatedDoc：摘要为空用占位；单元行号越界抛错 | 摘要占位与越界校验 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:325（:339 断言占位文案）、:358（start<1 / end<start / end>行数 三种越界分别抛错，强于源的单例） |
| `abilities.test.js:310` | checkHealth：四项异常各报一条，健康输入返回空数组 | 四项自检 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:184（健康）、:188（占比 <50%）、:199（缩进不一致）、:208（连续空行）、:193（无标记，且多一条「正文为空」，更强） |
| `abilities.test.js:323` | buildSourceSkeleton：目标不可读时抛错（宿主兜底；路由层已预检目标存在） | 宿主兜底抛错 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:98（逐字消息 '目标不是可读文件: ' + abs，源只 match 子串，更强） |
| `abilities.test.js:327` | renderAnnotatedDoc：未传 srcLines 时回落骨架内代码（兼容不传源码的调用） | 不传源码的兼容回落 | 已被 zc 覆盖 | abilities-source-doc.spec.ts:325（:337 'foo()  // [1] 甲' 断言回落取骨架 code） |

### 3.2 `client-md-utils.test.js`（26 条）

| 源 | 用例标题 | 验证的行为 | 结论 | zc 证据 |
|---|---|---|---|---|
| `client-md-utils.test.js:18` | basename 取路径最后一段 | 取末段 + 尾斜杠回退原串 + 空值返回空串 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:21-25,27-29,31-35` |
| `client-md-utils.test.js:27` | extOf 取小写扩展名 | 小写归一、多点取末、隐藏文件与空值返回空串 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:39-54`（`.gitignore`→:47、`a.tar.gz`→:42、null/undefined→:52-53） |
| `client-md-utils.test.js:38` | extBadge 已知扩展名取短角标 | 10 个已知扩展名的角标字典 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:58-69`（逐字同 10 例） |
| `client-md-utils.test.js:51` | extBadge 未知扩展名取前 3 字符大写，无扩展名取空 | 未知取前 3 大写、`a`/`.gitignore` 为空 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:76-80,82-88` |
| `client-md-utils.test.js:59` | langFor 扩展名映射 shiki 语言 id | 7 条扩展名→shiki id | 已被 zc 覆盖 | `tests/md-utils.spec.ts:92-100` |
| `client-md-utils.test.js:69` | langFor 未知/空扩展名回退 text | md/unknown/空 回退 text | 已被 zc 覆盖 | `tests/md-utils.spec.ts:102-106` |
| `client-md-utils.test.js:76` | isMd 识别 markdown 扩展名 | md/markdown 真，txt/js 假 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:110-119` |
| `client-md-utils.test.js:84` | splitFrontmatter 标准 frontmatter 拆解 | 拆出 fm 与 body | 已被 zc 覆盖 | `tests/md-utils.spec.ts:123-127` |
| `client-md-utils.test.js:90` | splitFrontmatter 未闭合 --- 视为无 frontmatter，整文回 body | fm=null、body=原文 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:135-138` |
| `client-md-utils.test.js:95` | splitFrontmatter 空 frontmatter（紧邻闭合） | fm='' 且 body 正确 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:140-144` |
| `client-md-utils.test.js:101` | splitFrontmatter 无 frontmatter | fm=null、body 原样 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:146-150` |
| `client-md-utils.test.js:107` | splitFrontmatter 仅一行 ---（无闭合行）视为无 frontmatter | 单行 `---` 不算 frontmatter | 已被 zc 覆盖 | `tests/md-utils.spec.ts:152-155` |
| `client-md-utils.test.js:112` | splitFrontmatter 首行前导空白可容错（trim 判定） | 前导空白仍识别 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:157-161` |
| `client-md-utils.test.js:118` | splitFrontmatter CRLF 行尾容错：闭合行识别，fm 保留 \\r（原行为） | CRLF 闭合识别且 fm 保留 `\r` | 已被 zc 覆盖 | `tests/md-utils.spec.ts:163-167` |
| `client-md-utils.test.js:124` | splitFrontmatter 空/未定义输入 | ''/null/undefined → {fm:null,body:''} | 已被 zc 覆盖 | `tests/md-utils.spec.ts:175-179` |
| `client-md-utils.test.js:130` | splitFrontmatter 闭合后无正文 | 闭合后 body='' | 已被 zc 覆盖 | `tests/md-utils.spec.ts:169-173` |
| `client-md-utils.test.js:137` | parseFmRows 标准键值行 | {key,value} 序列 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:183-188` |
| `client-md-utils.test.js:145` | parseFmRows 非键值行保留原文且 key 为 null | key=null、value=原文 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:190-195` |
| `client-md-utils.test.js:153` | parseFmRows 空行/纯空白行剔除 | 空白行被剔除 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:197-202` |
| `client-md-utils.test.js:161` | parseFmRows 键值含中文/冒号/连字符/下划线 | 中文键归原文行、`my-key_1` 合法、值含冒号 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:204-209` |
| `client-md-utils.test.js:169` | parseFmRows 空/未定义输入返回空数组 | ''/null/undefined → [] | 已被 zc 覆盖 | `tests/md-utils.spec.ts:215-219` |
| `client-md-utils.test.js:175` | parseFmRows 键无值 | `'a:'` → [{key:'a',value:''}] | 已被 zc 覆盖 | `tests/md-utils.spec.ts:211-213` |
| `client-md-utils.test.js:180` | labLabelKey 模式映射字典 key | doc 按 isDir 分、annot/tr/source、默认 labSrc | 已被 zc 覆盖 | `tests/md-utils.spec.ts:223-230`（默认分支 :229） |
| `client-md-utils.test.js:189` | labLabelKey 与字典文案一一对应（translations 覆盖） | 5 个 key 在 ZH 取到固定文案 | 已被 zc 覆盖 | `tests/md-utils.spec.ts:238-244` |
| `client-md-utils.test.js:198` | locale 字典：host 三键必须存在且文案不变 | errGenMd/errTranslateOnlyMd/errBookNoTranslate 逐字 | 已被 zc 覆盖 | `tests/locale.spec.ts:107-111`（另 `:101-105` 全量 72 键 toEqual 更强） |
| `client-md-utils.test.js:204` | locale t() 缺省 zh；缺键返回 key 并 warn | 缺省取 zh、缺键返回 key、LANG.zh===ZH | 已被 zc 覆盖 | `tests/locale.spec.ts:121-125,137-141,115-117` |

### 3.3 `fs-utils.test.js`（21 条）

| 源 | 用例标题 | 验证的行为 | 结论 | zc 证据 |
|---|---|---|---|---|
| `fs-utils.test.js:27` | normRel 规范化相对路径 | 去 ./ 与首尾 /、`.` 保留、空值 '' | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:125-132`（更强：补 undefined） |
| `fs-utils.test.js:35` | relToSrcKey 生成源码路径键（根=工作区名） | 根/空→工作区名，子路径加前缀 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:139-146`（更强：补 `demo-workspace`、`./src/index.js`） |
| `fs-utils.test.js:44` | wsName 取 root 目录名（relToSrcKey 的键前缀） | 末段目录名，含尾斜杠 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:134-137` |
| `fs-utils.test.js:49` | computeDocStem 复现 file-doc/source-doc 命名 | 顶层带工作区名、多层带父目录、扩展名不区分大小写、无扩展名 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:150-158`（4 例逐一对应；另 `:160-169` 更宽） |
| `fs-utils.test.js:60` | docRelPath 输出书库新格式 <层名>/<stem>.md | 四层名 4 例 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:183-188`（文章翻译例由 `:186` 的 docRelPath===docRelBook 承接，docRelBook 在 `:175`） |
| `fs-utils.test.js:68` | docRelBook 与 docRelPath 新格式一致 | 两例同格式 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:173-176` + `:186` |
| `fs-utils.test.js:73` | projectKey 与 DSH format.ts 对拍（3 例） | 三例逐字（含中文转 ~XXXX） | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:90-94` |
| `fs-utils.test.js:79` | projectKey 空串抛错 | 抛 cannot encode an empty project path | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:117-121`（更强：补 null/undefined） |
| `fs-utils.test.js:83` | projectKey 截断 slug 到 251 字符（超出段长模拟） | 截到 251、总长 255 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:111-115` |
| `fs-utils.test.js:90` | projectsRoot/newBookDir/legacyBookDir 位置计算 | DSH_HOME/books、`<home>/books/<key>`、`<root>/.book/<name>-book` | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:66-69,76-81,83-86`（env 改 vi.stubEnv+unstubAllEnvs，语义等价） |
| `fs-utils.test.js:105` | bookDocRelValid 正反例（形状检查，穿越交由 host 双位置解析层） | 四层名+.md/.markdown 放行；坏层/坏扩展名/`.book/`/空串拒绝；isBookDocRel 同语义；BOOK_REL_LAYERS | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:52-62,215-228,252-256`（更强：补 null/undefined） |
| `fs-utils.test.js:125` | docRelBookIn/bookBucketValid：带桶 docRel（跨工作区共享） | `@<bucket>/<层>/<stem>.md`；`@..`/`../../`/空桶/坏层/坏扩展名拒绝；桶名字符集 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:178-181,191-211,230-244`（更强：补 `a b`、`bucket/…`、null/undefined） |
| `fs-utils.test.js:146` | isMdPath 只识别 md/markdown | md/MD/markdown 真，js/空串假 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:260-271`（更强：补 null、`.md`） |
| `fs-utils.test.js:154` | isBookPath 识别书库内文档（.book/ 前缀） | `.book/...`、`.book`、`./.book/x.md` 真；普通路径/空串假 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:273-284`（更强：补 `.bookx`） |
| `fs-utils.test.js:163` | resolveIn 允许 root 内路径 | 返回 root 内绝对路径 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:288-291`（更强：toBe 精确路径） |
| `fs-utils.test.js:169` | resolveIn 拒绝 ../ 越权 | 抛 path escapes workspace root | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:301-306`（更强：message 逐字 + statusCode 400） |
| `fs-utils.test.js:174` | resolveIn 拒绝绝对路径越权 | 越权抛错 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:308-311` |
| `fs-utils.test.js:179` | resolveIn 拒绝前缀同名目录误放行（安全边界） | `safe-root-evil` 不算 root 内 | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:313-317` |
| `fs-utils.test.js:186` | resolveIn 允许 root 自身 | `resolveIn(root,'.')===root` | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:293-299`（更强：补缺省/null/''） |
| `fs-utils.test.js:191` | nextIssueNo：取最大序号 +1 并两位补零 | 同一 names 数组 → '12' | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:388-396`（同一输入集逐字） |
| `fs-utils.test.js:201` | nextIssueNo：无既有台账时从 01 起 | []/README+_template/undefined → '01' | 已被 zc 覆盖 | `tests/fs-utils.spec.ts:398-403`（更强：补 null） |

### 3.4 `issues.test.js`（6 条）

| 源 | 用例标题 | 验证的行为 | 结论 | zc 证据 |
|---|---|---|---|---|
| `issues.test.js:24` | issuesDir：DSH_FS_ISSUES_DIR 显式指定时优先（台账隔离靠它） | 覆盖变量存在时台账目录取覆盖值 | 已被 zc 覆盖 | `tests/issues.spec.ts:60`（同标题同断言） |
| `issues.test.js:28` | issuesDir：未设覆盖变量时回落到插件根 issues（生产行为不变） | 未设覆盖时回落到插件根 issues | 已被 zc 覆盖 | `tests/issues.spec.ts:70`（另有 `:75` 空串分支） |
| `issues.test.js:38` | nextIssueNoFromDisk：空台账目录从 01 起（读的是隔离目录，不是插件根） | 空隔离目录取号 01，反向证明读的是隔离目录 | 已被 zc 覆盖 | `tests/issues.spec.ts:93` |
| `issues.test.js:42` | syncIssueIndex：未登记索引的台账文件补进隔离目录的 README，工作树 issues/ 不被改写 | 补索引行（五字段）并保证受版本控制 README 内容与 mtime 不变 | 已被 zc 覆盖 | `tests/issues.spec.ts:148`（索引行 + 链接）+ `:51-57`（afterEach 断言 REPO `issues/README.md` 内容与 mtime 未变） |
| `issues.test.js:70` | nextIssueNoFromDisk：已有台账文件时顺延序号 | 目录已有台账文件时序号顺延 | 已被 zc 覆盖 | `tests/issues.spec.ts:98` |
| `issues.test.js:74` | syncIssueIndex：索引已存在时不重复追加（幂等） | 二次调用 README 逐字不变 | 已被 zc 覆盖 | `tests/issues.spec.ts:206` |

## 4. `gen-scope.test.js`（24 条）— 移交 P5-B

该文件全部走 `src/host/index.js` 的 `apply`（真 HTTP 路由 + 任务状态机 + 子 agent 编排）与 `src/host/*-executor.js`，
其中与 `src/host/index.ts` 直接相关的部分**正由另一位子智能体并行迁移**，不属 P5-A 范围。
下表逐条列出，结论统一为 `移交 P5-B`；`标题级承接点` 列是本次只读观察到的 zc 承接处（**仅参考，不是结论**，P5-B 须自行核证到 `文件:行号`）。

> 本次对账快照时，P5-B 的 `tests/gen-scope.spec.ts` 已存在于仓库（正在推进）；下表行号若与最终版不符，以 P5-B 交付为准。

| 源 | 用例标题 | 结论 | 标题级承接点（参考） |
|---|---|---|---|
| `gen-scope.test.js:33` | genScopeAllow：未提供可用集合时返回期望名单，提供时取交集 | 移交 P5-B | `tests/fs-utils.spec.ts:329-341`（纯逻辑，已迁） |
| `gen-scope.test.js:45` | renderPromptTemplate：只替换 ${name}，未知占位符与 {{...}} 原样保留 | 移交 P5-B | `tests/fs-utils.spec.ts:349-371`（纯逻辑，已迁） |
| `gen-scope.test.js:56` | formatStamp：YYYY-MM-DD HH:mm（本地时区补零，与技能脚本同格式） | 移交 P5-B | `tests/fs-utils.spec.ts:377-382`（纯逻辑，已迁） |
| `gen-scope.test.js:152` | gen-doc：cwd 固定 books/session、无 subagent 标、工具面收敛、不注入 system 段 | 移交 P5-B | `tests/gen-executor.spec.ts:307`（派发变量表逐项下发 / 只注入 user message） |
| `gen-scope.test.js:194` | gen-doc：产物已存在时自动进入「更新」模式，规范段要求先读旧文档 | 移交 P5-B | `tests/gen-executor.spec.ts:364`（更新模式 mode=更新 + modeHint） |
| `gen-scope.test.js:216` | gen-doc（folder/L1）：宿主渲染骨架经 ${skeleton} 注入，含目录树子项与三处占位 | 移交 P5-B | `tests/gen-executor.spec.ts:307`、`:389`（骨架注入与 L1 纪律文本） |
| `gen-scope.test.js:241` | gen-doc（file/L2）：宿主渲染骨架注入，工具面保留检索但不含技能/shell | 移交 P5-B | `tests/gen-executor.spec.ts:307`、`:389`（L2 骨架注入与检索工具面） |
| `gen-scope.test.js:272` | gen-doc（src/L3）：骨架落盘不注入、工具面 read/write/edit、无技能与脚本 | 移交 P5-B | `tests/gen-executor.spec.ts:425`（骨架落盘 `skeleton-<taskId>.txt`） |
| `gen-scope.test.js:339` | gen-doc（src/L3）：宿主收尾构建产物、写「源码层」索引、删除骨架 | 移交 P5-B | `tests/gen-executor.spec.ts:425`（finalize 写 DOC + 删骨架） |
| `gen-scope.test.js:374` | gen-doc（src/L3）：子 agent 空转（骨架一条注解都没填）→ 置 error，不误报 success | 移交 P5-B | `tests/gen-executor.spec.ts:490`（产物未生成/空转 → error） |
| `gen-scope.test.js:390` | gen-doc（src/L3）：注解占比过低（排版自检不过）→ 置 error，不写产物、不删骨架 | 移交 P5-B | `tests/abilities-source-doc.spec.ts:438`（健康自检不过 → 抛错不写 DOC 不删骨架）、`tests/gen-executor.spec.ts:537` |
| `gen-scope.test.js:416` | gen-doc（src/L3）：basename 相同的两个 rel 并发 → 各用各的骨架，互不删除（#2 回归） | 移交 P5-B | `tests/gen-executor.spec.ts:454`（并发两任务骨架按 taskId 唯一） |
| `gen-scope.test.js:453` | translate：cwd 固定、无 subagent 标、工具面收敛，且提示词只走 user message | 移交 P5-B | `tests/gen-executor.spec.ts:307`（translate 派发同表） |
| `gen-scope.test.js:480` | session 目录即使带「项目根」index.json 也不被 knownBookRoots 当作书库桶 | 移交 P5-B | `tests/book-store.spec.ts:193`（扫桶跳过 `books/session`） |
| `gen-scope.test.js:502` | 子会话预设：默认 ptc（PTC 探测），FS_GEN_PRESET 可回退 standard | 移交 P5-B | `tests/task-utils.spec.ts:25-35`（默认 ptc / 覆盖值） |
| `gen-scope.test.js:549` | gen-doc：子 agent 空转（产物未生成）→ 置 error，不误报 success | 移交 P5-B | `tests/gen-executor.spec.ts:490` |
| `gen-scope.test.js:561` | gen-doc：子 agent 写出产物 → 置 success（校验不误伤正常完成） | 移交 P5-B | `tests/gen-executor.spec.ts:307` |
| `gen-scope.test.js:573` | gen-doc：更新模式下子 agent 未改动产物 → 置 error（旧文档原地不动也是空转） | 移交 P5-B | `tests/gen-executor.spec.ts:506`（更新模式一字未改 → error） |
| `gen-scope.test.js:592` | gen-doc（L1）：成功后宿主写入 index.json「目录层」条目，其它数组与项目根保留 | 移交 P5-B | `tests/gen-executor.spec.ts:307`（收尾写索引并失效缓存） |
| `gen-scope.test.js:612` | gen-doc（L1）：产物仍是骨架（语义占位未填写）→ 置 error，不写索引 | 移交 P5-B | `tests/abilities-folder-file.spec.ts:287`（L1 占位残留 → verify 抛错） |
| `gen-scope.test.js:628` | gen-doc（L1）：产物被清空（0 字节）→ 置 error，不写索引 | 移交 P5-B | `tests/abilities-folder-file.spec.ts:274,280`（产物不存在/只有空白 → 抛「产物为空」） |
| `gen-scope.test.js:655` | gen-doc（L2）：成功后宿主写入 index.json「文件层」条目（命名沿用 computeDocStem） | 移交 P5-B | `tests/gen-executor.spec.ts:307` |
| `gen-scope.test.js:674` | gen-doc（L2）：产物仍是骨架（占位未填）→ 置 error，不写索引 | 移交 P5-B | `tests/abilities-folder-file.spec.ts:435`（L2 占位残留 → verify 抛错） |
| `gen-scope.test.js:690` | gen-doc（L2）：产物被清空（0 字节）→ 置 error，不写索引 | 移交 P5-B | `tests/abilities-folder-file.spec.ts:422,428`（L2 产物不存在/空白 → 抛「产物为空」） |

## 5. `host-routes.test.js`（21 条）— 移交 P5-B

zc 目前尚无 `tests/host-routes.spec.ts`；`src/host/index.ts` 的 `/api/fs/*` 路由表与 `__fsTest` 句柄正在并行迁移，
逐条覆盖由 P5-B 负责。本表逐条列出，结论统一为 `移交 P5-B`。

> 本次对账快照时，P5-B 的 `tests/p3-host-routes.spec.ts` 已存在于仓库（1975 行，覆盖源 `host-routes.test.js` 21 例 + `task-timeout.test.js` 2 例，并按 `docs/baseline/host.md` 补齐源未覆盖的分支）。
> 因此本表与 §7 的 23 条**已有落点**，具体逐条结论以该 spec 为准；本表保留为防漏清单。

| 源 | 用例标题 | 结论 |
|---|---|---|
| `host-routes.test.js:89` | apply 暴露测试句柄，root 默认 sandbox workspace | 移交 P5-B |
| `host-routes.test.js:97` | tree 列出目录与文件 | 移交 P5-B |
| `host-routes.test.js:116` | #1 /tree 归属兜底：已知根注册表尚未跟上切根时，节点仍归属当前根（不抛 ReferenceError） | 移交 P5-B |
| `host-routes.test.js:154` | read 读取文件，write 写入后 read 回读一致 | 移交 P5-B |
| `host-routes.test.js:176` | write 越权路径被拒绝（不会写出 root） | 移交 P5-B |
| `host-routes.test.js:188` | gen-doc 返回 taskId 与 docRel，gen-status 可查到任务（错误来自无 agentLoop） | 移交 P5-B |
| `host-routes.test.js:218` | read 超过 2MB 上限被拒绝 | 移交 P5-B |
| `host-routes.test.js:233` | set-root 拒绝不存在的路径 | 移交 P5-B |
| `host-routes.test.js:247` | POST 非法 JSON body 返回 400 而非 500 | 移交 P5-B |
| `host-routes.test.js:259` | 重复生成同 kind+rel 复用进行中的 taskId | 移交 P5-B |
| `host-routes.test.js:278` | gen-doc 未知 kind 返回 400 | 移交 P5-B |
| `host-routes.test.js:290` | gen-doc 对 markdown 文件拒绝生成 L2/L3 | 移交 P5-B |
| `host-routes.test.js:312` | gen-doc（folder）目标不是目录时 400，不创建任务 | 移交 P5-B |
| `host-routes.test.js:328` | gen-doc（file/src）目标不是文件时 400，不创建任务 | 移交 P5-B |
| `host-routes.test.js:344` | translate 返回 taskId 与 docRel（文章翻译层），任务可达 gen-status | 移交 P5-B |
| `host-routes.test.js:385` | translate 拒绝非 md 文件与书库内文档 | 移交 P5-B |
| `host-routes.test.js:416` | gen-doc/translate 目标不存在时 400，且不创建任务 | 移交 P5-B |
| `host-routes.test.js:436` | translate 重复请求复用进行中的 taskId | 移交 P5-B |
| `host-routes.test.js:468` | read 书库白名单：../../ 穿越、四层外与非法结构 rel 均被拒绝 | 移交 P5-B |
| `host-routes.test.js:502` | read/tree 双位置回退：旧库文档仍可见，新桶优先 | 移交 P5-B |
| `host-routes.test.js:553` | 跨工作区共享：子树定向最近已知项目根桶，读写同桶 | 移交 P5-B |

## 6. `real-composition.test.js`（8 条）— 裁决表（承接方：`tests/real-composition.spec.ts` 在制品）

该 spec 正由另一位子智能体改写（P5 收口），P5-A **不碰该文件**。下表是本次对 `docs/spec-p5-tests-detail.md` §6.3 裁决口径的**落实与核实**（行号为本次快照：该文件当前 200 行 / 3 个 `it`，收口后需复算）：

| 源 | 用例标题 | 结论 | 依据（含 zc 实况） |
|---|---|---|---|
| `real-composition.test.js:24` | package.json 声明 loader 契约：exports[.]/main 指向 dsh/index.js 产物 | 缺口（承接方：在制品） | `tests/real-composition.spec.ts:193-198` 只断言 `name` 与 `dsh.bundle.patch`；缺 `main` / `exports['.']` / `exports['./client']`。zc 实况值为 `package.json:8,10,11`（`lib/host/index.js` / `./lib/host/index.js` / `./client/client.js`），**不可照抄源仓的 `./dsh/*`** |
| `real-composition.test.js:33` | host 模块真实形态（源码入口 src/host/index.js）：无 default、name=fs、inject 齐备、apply 可执行 | 缺口（承接方：在制品） | `tests/real-composition.spec.ts:140-141` 只经 Loader entry tree 覆盖 `name` 与行 id；缺 `'default' in mod === false` 与 `inject` 断言。依据主仓 **`docs/testing.zh.md:40`**（本次核实：预研写的 `:41` 有 +1 偏移），zc 侧为 `src/host/index.ts:25,26,138` |
| `real-composition.test.js:43` | loader 解析路径（exports[.] 自引用）与源码入口契约一致（产物存在时核对） | **不适用/不应迁移** | 包自引用（`await import('dsh-plugin-file-system')` + `t.skip`）会经包的 `exports` 解析到构建产物；主仓 **`docs/testing.zh.md:45`** 明令禁止「工作区包的裸导入解析到 `src`…绝不会经由包的 `exports` 解析到构建后的 `lib/`，因为其中的陈旧产物会加载第二份模块单例」（本次核实：预研写 `:47` 有 +2 偏移）；且 zc 包名已改为 `dsh-plugin-file-system-zc`，zc 版已用真 Loader 装配取代（`tests/real-composition.spec.ts:134-141`） |
| `real-composition.test.js:93` | apply 装配：webServer.register 收到 /api/fs 前缀路由，effect 清理可执行 | 已被 zc 覆盖 | `tests/real-composition.spec.ts:142`（`['prefix /api/fs']`）；可逆性由 `:53-56` 的 `afterEach` `fiber.dispose()` 承担（未显式断言 dispose 后路由表清空，沿用预研「已覆盖、不重写」口径） |
| `real-composition.test.js:116` | NODE_ENV !== test 时生产 ctx 不挂 __fsTest（条件化验证：生产不挂） | 缺口（承接方：在制品；依赖 P5-B 稳定） | zc `tests/**` 中 grep `__fsTest` 零命中；挂载条件在 `src/host/index.ts:672-678`（正由 P5-B 迁移），须待其稳定后补 |
| `real-composition.test.js:133` | cordis.patch.yml 插件行：id=fs 且 name 与包名一致（与模块 name 相互印证） | 已被 zc 覆盖 | `tests/real-composition.spec.ts:184-191`（`- insert:` / `- id: fs` / `name: dsh-plugin-file-system-zc`） |
| `real-composition.test.js:142` | agent.cordis.yml 技能桥接行存在（skill-filesystem / tool-skill / customSkillDirs→skills/） | 缺口（承接方：在制品） | zc `tests/**` 中 grep `agent.cordis.yml` 零命中；文件与内容齐备：`agent.cordis.yml:22,23,25,26` |
| `real-composition.test.js:150` | preset.yml 元信息存在且身份与插件对应 | 缺口（承接方：在制品） | zc `tests/**` 中 grep `preset.yml` 零命中；文件齐备：`preset.yml:1,2,3`（`name: 文件系统` / `description:` / `order: 5`） |

> 这 5 条缺口**只读静态文件**（`package.json` / `agent.cordis.yml` / `preset.yml`）与 `src/host/index.ts` 的导出面，
> 不依赖 P5-B 的迁移进度（`:116` 除外）；P5-A 按任务书「不要碰 `tests/real-composition.spec.ts`」未补，属**已知遗留**。

## 7. `task-timeout.test.js`（2 条）— 拆分判定

源的这两条都走 `apply` + `__fsTest` 的 `genTasks` + 真 `/api/fs/gen-status` 路由，属集成面；
其中「超时预算 10 分钟」这一语义已被 zc 的 `tests/task-utils.spec.ts` 以单元形式锁死，淘汰与透传部分移交 P5-B。

| 源 | 用例标题 | 验证的行为 | 结论 | 依据 |
|---|---|---|---|---|
| `task-timeout.test.js:74` | sweepGenTasks 淘汰超时 running：置 error + 字典文案 + finishedAt 打点；未超时不动 | 超时预算 10 分钟；`sweepGenTasks()` 把超期 `running` 置 `error` + 字典文案 + `finishedAt` 打点，未超时不动 | 超时预算 `已被 zc 覆盖`；淘汰逻辑 `移交 P5-B` | 预算：`tests/task-utils.spec.ts` 断言 `TASK_TIMEOUT_MS === 10 * 60 * 1000`；淘汰逻辑在 `src/host/index.ts`（并行迁移中） |
| `task-timeout.test.js:104` | 超时任务经 gen-status 可见且 error 透传字典文案（前端轮询停止依据） | 超时任务经 `/api/fs/gen-status` 可见且 `error` 透传字典文案（前端轮询停止依据） | `移交 P5-B` | 走 `apply` + `__fsTest` + 真 HTTP 路由，属集成面 |

## 8. 缺口补齐（交付物 2）

对账在非集成类范围内**只找到 1 条真缺口**——其余 75 条（abilities 26 + client-md-utils 26 + fs-utils 21 + issues 6，其中 md-utils/fs-utils/issues 三块由 P2-A/P2-B 迁移时就已扩写）在 zc 已有等价或更强的断言，**按硬性要求 1 未重复造测试**。

### 8.1 缺口内容（源 `abilities.test.js:262`）

源用例验证渲染排版的**三条规则**：① 短行 + 短注解 → 行尾注解；② 长注解 → 行上方注解**并继承代码行前导缩进**；③ 行号不连续 → 插空行。

zc 已锁定 ① 与 ③，但 ② 的「继承缩进」没有：

- `tests/abilities-source-doc.spec.ts:215` 用 `toBe` 逐字锁定行尾排版（单条单元，无缩进）；
- `tests/abilities-source-doc.spec.ts:246`（代码行超 78 字符）、`:259`（注解超 30 个字符）两条「改走行上方」用例传入的 `code` 都是 `''`、`srcLines` 也都不带前导空白，于是 `src/host/abilities/source-doc/doc-render.ts:198` 的
  `const indent = ((r.code || '').match(/^[\t ]*/) as RegExpMatchArray)[0]` 恒取空串 —— 「缩进继承」这条规则在 zc 中**执行过、但没有任何断言锁定**。

> 这正是「行覆盖率 100% 不等于行为已锁定」的实例（主仓 `docs/testing.zh.md:10`：「行覆盖率是必要条件，但永远不是充分条件」）。覆盖率门禁不会发现它，只有逐条对账会发现。

### 8.2 新增文件与用例

| 文件 | 用例数 | 对账的源用例 | 实测 |
|---|---|---|---|
| `tests/p5a-abilities-parity.spec.ts` | 1 | `abilities.test.js:262` | `npx vitest run tests/p5a-abilities-parity.spec.ts` → **Test Files 1 passed (1) / Tests 1 passed (1)**；`npx oxlint` → **0 warnings 0 errors** |

新用例标题：`（源 abilities.test.js:262）长注解走行上方时，注解行继承其代码行的前导缩进`（标题唯一，未与既有 `it` 重名）。
用例用**源用例原样的输入**（4 空格缩进的代码行 + 39 字长注解），断言注解行 `    // [2] …` 的 4 空格缩进，并顺带锁定同输入下的行尾排版与「行号不连续插空行」，使三条排版规则在同一输入下完整闭环；同时断言 `problems` 为空（`checkHealth` 的缩进自检据此判定）。

## 9. 隔离与时序纪律（本次新增测试的自我约束）

本次共新增 **1 个 spec 文件 / 1 个用例**，逐项对照任务书的硬性要求：

| 要求 | 本次情形 |
|---|---|
| 环境变量改动 `beforeAll`/`afterAll` 成对还原 | **不适用**：该用例是纯函数渲染（`renderAnnotatedDoc`），不读 `process.env`、不触盘，未引入任何环境变量改动 |
| 临时目录用 `mkdtemp`（禁 `join(tmpdir(), '…-' + Date.now())`） | **不适用**：该用例无文件系统访问，未创建任何临时目录 |
| 等可观测信号、严禁退化固定 `sleep` | **不适用**：该用例是同步纯函数，无等待 |
| 禁 `/* v8 ignore */` / `/* istanbul ignore */` / `c8 ignore` | 已核：新文件零 ignore 注释（`grep` 复核） |
| 禁 `!` 非空断言、`restrict-plus-operands`、`no-base-to-string` | 已核：`npx oxlint tests/p5a-abilities-parity.spec.ts` → 0 warnings 0 errors |
| 不复制 zc 已有等价测试 | 已核：新文件只放 1 条确证缺口；`sonarjs/no-duplicate-test-title` 未报警 |

**源仓的污染源未被带入本次新增**（对照 `docs/spec-p5-tests-detail.md` §4.3）：

- 源 5 处模块顶层 `process.env` 改写（`gen-scope.test.js:25-26,29`、`host-routes.test.js:15-16,19`、`task-timeout.test.js:23-24`）——本次新增零处；
- 源 20+ 处 `join(tmpdir(), '…-' + Date.now())` 可预测路径 —— 本次新增零处；
- 源 `issues.test.js:22` 的模块顶层 `await import()`（`fileURLToPath(import.meta.url)` 在 vitest 下对 spec 会抛错）—— 本次新增零处。

**顺带核实（只读观察，非本次改动）**：zc 既有非集成类 spec 的隔离手段已成体系 ——
`mkdtemp` 用于 7 个非集成 spec，`vi.stubEnv` 用于 `fs-utils.spec.ts`(3) / `issues.spec.ts`(18) / `task-utils.spec.ts`(3) / `book-store.spec.ts`(1)；
源仓遗留的可预测路径与顶层 env 污染**没有进入非集成类 spec**。

## 10. 未达标项 / 存疑项（不谎报绿）

1. **real-composition 面 5 条缺口未补（已知遗留）**：`real-composition.test.js:24` `:33` `:116` `:142` `:150`。
   其中 4 条只需读静态文件（`package.json` / `agent.cordis.yml` / `preset.yml`），**不依赖 P5-B 进度**；`:116` 依赖 `src/host/index.ts` 稳定。
   根因是任务书把 `tests/real-composition.spec.ts` 列入「不要碰」（另一位在改），P5-A 若补就会与在制品重复。**请主智能体裁决由谁补**。
2. **47 条 `移交 P5-B` 只是范围划分，不是"已覆盖"**：本次对账时 zc 仓库已出现 `tests/gen-scope.spec.ts`、`tests/p3-host-routes.spec.ts`、`tests/prompt-loader.spec.ts`（P5-B 在制品），
   §4 的「标题级承接点」是**只读观察**，未经 P5-B 核证到 `assert` 级别；§4/§5 的最终结论以 P5-B 的交付为准。
3. **未跑全量门禁**：按任务书的门禁命令限制，本次只跑了 11 个非集成类 spec（266 例）与 1 个新 spec；
   `npm test`（全量）、`npm run test:coverage`、`npm run build`、`npm run typecheck` 均未执行，五门禁由主智能体统一验收。
   本文 §1.1 的覆盖率数字覆盖 P5-A 范围（非集成类），**不代表整仓 per-file 100%**（`src/host/index.ts` / `client/index.tsx` 等由 P5-B 与 P4 的 spec 承担）。
4. **对账证据等级**：三条二级子智能体的「已被覆盖」判定是**逐条读源断言 + 在 zc 定位等价断言**的静态比对（它们受命令限制未运行既有 spec）；
   本智能体另跑了 266 例实测作为交叉验证（全绿），并对 `md-utils` / `fs-utils` / `locale` / `issues` 的抽样证据行号做了人工复核（抽中项全部吻合）。
   未能逐条执行「删除 zc 断言看测试是否变红」的变异验证 —— 这是方法学上的天花板，如实标注。
5. **预研文档行号偏移（已更正）**：`docs/spec-p5-tests-detail.md` §6.3/§9.4/§9.5 引用主仓 `docs/testing.zh.md` 时写 `:41`（"default" 断言）与 `:47`（测试解析仅限源码），
   实测正确行号是 **`:40`** 与 **`:45`**（本文件已按实际行号引用）。P5-B 与后续文档若照抄预研，需一并更正。
6. **存疑（不影响结论，留待核实）**：
   - 源 `fs-utils.test.js:60` 的 `docRelPath(root,'文章翻译','ws-README')` 在 zc 无同参直调，由 `docRelBook` 用例 + `docRelPath === docRelBook` 的显式断言等价承接，判为覆盖而非缺口；
   - 源 `abilities.test.js:185` 的「line 单元缩进保留」在 zc 由同一函数的 block 侧断言（`code` 含前导空格）覆盖，未逐字单列 line 分支，未按缺口处理；
   - 源 `abilities.test.js:254` 对 `langOf('ws/src/a.js')` / `langOf('ws/a.mjs')` 的两条断言与「未知扩展名回落 javascript」同值，对映射表内容探测力为零，判为等价覆盖。
