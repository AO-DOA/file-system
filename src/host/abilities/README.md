# 能力目录（宿主生成/翻译能力）

## 本目录 = 能力目录

一个能力一个文件夹：该能力的**元数据（描述符）、提示词真源、确定性逻辑、校验钩子**都收在目录内；通用引擎（提示词加载、执行器、书库定位、台账）在 `src/host/` 下，不感知具体能力。

| 能力 | 目录 | kind | 提示词 | 骨架逻辑 |
|---|---|---|---|---|
| L1 目录概览 | `abilities/folder-doc/` | `folder` | `abilities/folder-doc/prompt.md` | `folder-doc/skeleton.ts`（`buildFolderSkeleton` / `folderPlaceholderLeft`） |
| L2 文件摘要 | `abilities/file-doc/` | `file` | `abilities/file-doc/prompt.md` | `file-doc/skeleton.ts`（`renderFileDocSkeleton` / `filePlaceholderLeft`） |
| L3 源码注解 | `abilities/source-doc/` | `src` | `abilities/source-doc/prompt.md` | `source-doc/skeleton.ts`（`buildUnits` / `renderSourceSkeleton` / `buildSourceSkeleton`）+ `source-doc/doc-render.ts`（`parseFilledSkeleton` / `langOf` / `annotationStats` / `checkHealth` / `renderAnnotatedDoc`） |
| 文章翻译 | `abilities/translate-doc/` | `translate` | `abilities/translate-doc/prompt.md` | —（模型分段写入，无骨架） |

`registry.ts` 汇总四个能力（`GEN_ABILITIES` / `TRANSLATE_ABILITY` / `ABILITIES` / `abilityOf`），路由与执行器按 `kind` 取描述符，不再散落 kind 分支。

各能力目录下的 `prompt.md` 是**后台生成与翻译任务提示词的唯一真源**。改提示词只改它，不需要改代码、不需要 `npm run build`、不需要重启 dsh web——宿主在**每次派发任务时**读盘并渲染（`src/host/prompt-loader.ts` 按 `ability.dir` + `ability.promptFile` 定位并读盘，`src/host/fs-utils.ts` 的 `renderPromptTemplate` 替换变量）。

## 文件与加载规则

| 文件 | 对应任务 | 状态 |
|---|---|---|
| `abilities/folder-doc/prompt.md` | L1 目录层（宿主内置） | **宿主内置**（2026-09-10 去技能化）：不调技能、无 skill/bash 工具面；骨架与目录树由宿主渲染后经 `${skeleton}` 注入 |
| `abilities/file-doc/prompt.md` | L2 文件层（宿主内置） | **宿主内置**（2026-09-10 去技能化）：不调技能、无 skill/bash 工具面（保留 glob/grep 查引用）；骨架由宿主渲染后经 `${skeleton}` 注入 |
| `abilities/source-doc/prompt.md` | L3 源码层（宿主内置） | **宿主内置**（2026-09-10 去技能化）：不调技能、无 skill/bash 工具面；骨架因体量大改为**落盘**到 `${cwd}`（提示词只给 `${skeletonPath}` 与行数），模型用 `read` 分段读、`edit` 分批填空，产物由宿主 `finalize` 构建 |
| `abilities/translate-doc/prompt.md` | 文章翻译（宿主内置翻译任务） | 已迁移（本层无 skill/bash 工具，模板内不调用技能脚本）；**保持 standard 形态，但改为「骨架 + 锚点分段 edit 追加」**——长文档一次写完会耗尽单步输出预算而空转 |

> PTC 形态 = 提示模型「用 run_code 组合操作、尽量合并工具调用」，与 `ptc` 预设配套；
> 改回 `standard` 预设时这些模板仍可运行（模型会按原生工具逐步执行），但不再有合并收益。
> **该表述对四层均已不适用**（2026-09-10）：L1/L2/L3 去技能化后所在层无 bash 工具，没有 run_code
> 可组合（工具面分别是 `read`/`write`、`read`/`write`/`glob`/`grep`、`read`/`write`/`edit`），
> 模板一律保持工具无关表述。
> 依据与实测数据见源仓 `docs/ptc-probe-2026-09-09.md`。

模板名 = 各能力目录下的 `prompt.md`（`abilities/folder-doc` / `abilities/file-doc` / `abilities/source-doc` / `abilities/translate-doc`）。**加载规则**：`src/host/prompt-loader.ts` 按 `ability.dir` + `ability.promptFile` 定位，两个候选路径覆盖两种加载形态——源码直载/测试 `<HERE>/abilities/<dir>`（`<HERE>` = 加载器所在目录，即 `src/host/`）与打包后 `<HERE>/../../src/host/abilities/<dir>`（产物 `lib/host/index.js` 需回退两级再进源码树 `src/host/`）；宿主**每次派发任务时读盘**，故改提示词免 build、免重启。**文件不存在即回退**到代码内联文本（`gen-executor.ts` 与 `translate-executor.ts` 的内联数组），因此删掉某个 `prompt.md` 不会让任务失败，只会退回旧表述。

## 占位符

- 语法**只允许 `${name}`**，由宿主读盘后按变量表替换为真实值。
- **禁止使用 `{{name}}`**：DSH 的 system prompt 会把 `{{…}}` 当作模板变量严格解析，未注册即 assembly 报错（历史故障见 `src/host/index.ts` 中 `{{model}}` 的注释）。宿主在派发前就把占位符替换干净，成品文本不会再经过变量解析。
- 未知占位符（变量表里没有的名字）**原样保留**，不抛错——便于在产物里直接看出模板笔误。

| 变量 | 含义 | 示例 |
|---|---|---|
| `${skill}` | 技能名（**已弃用**：四层均宿主内置、无模板引用；渲染变量保留仅为兼容旧模板） | `folder-doc` |
| `${target}` | 目标绝对路径（文件夹或文件） | `/…/dsh-plugin-file-system-zc/scripts` |
| `${bookDir}` | 书库根绝对路径 | `/home/xuepeng/.dsh/books/--home-xuepeng-…--` |
| `${projectRoot}` | 目标归属的项目根绝对路径 | `/…/plugins/dsh-plugin-file-system-zc` |
| `${targetKey}` | 源码路径键（工作区名 + `/` + 相对工作区根路径） | `dsh-plugin-file-system-zc/scripts` |
| `${docPath}` | 产物文档绝对路径 | `/…/目录概览/scripts.md` |
| `${docStem}` | 产物文档名（不含 `.md`；L2 由宿主 `computeDocStem()` 命名、L3 即技能脚本 `--name` 的值，L1 由宿主直接命名） | `scripts` |
| `${skeleton}` | 宿主渲染好的骨架全文（**仅 L1/L2 注入**）：L1 目录骨架（frontmatter「源码路径 / 层级: 目录 / 生成时间」+ 标题 + 路径 + 三处语义占位 + `## 目录树` 围栏，**每个节点后带 `# <作用>` 占位**，模型逐项替换为「是做什么的」一句话）；L2 文件骨架（frontmatter「源码路径 / 层级: 文件 / 生成时间」+ 标题 + 路径 + 四个章节标题 + 导出表头）。**L3 该变量为空**——骨架体量大，改为落盘（见下两行） | （整篇骨架文本） |
| `${skeletonPath}` | **L3 专用**：骨架落盘后的绝对路径（`${cwd}/skeleton-<taskId>.txt`，**按任务 ID 唯一，不按目标文件名**——`cwd` 是进程级共享目录，`basename` 不足以区分并发任务：`src/a.js` 与 `lib/a.js` 的 basename 同为 `a.js`，共用骨架会让先完成者的 `finalize` 删掉对方仍在用的骨架，后完成者 `verify` 报「骨架文件不存在」），模型 `read` / `edit` 的对象 | `/…/books/session/skeleton-fsgen-1a2b3c4d-….txt` |
| `${skeletonLines}` | **L3 专用**：骨架行数（提示词据此要求模型分段读；= `String(skeleton).split('\n').length`） | `312` |
| `${srcName}` | 目标文件名（`basename`，仅翻译层标题与验收用；L3 骨架已不按文件名命名） | `index.js` |
| `${cwd}` | 子 agent 统一工作目录（临时骨架落这里，不落书库/源码内） | `/…/books/session` |
| `${generatedAt}` | 生成时间戳 `YYYY-MM-DD HH:mm`（翻译层 frontmatter 用，模型照抄） | `2026-09-08 23:41` |
| `${layer}` | frontmatter 层级值 | `目录` / `文件` / `源码` / `文章翻译` |
| `${arr}` | index.json 数组名 | `目录层` |
| `${mode}` | 首次 / 更新（宿主按产物是否已存在**自动判定**） | `更新` |
| `${modeHint}` | 随模式变化的一句执行提示 | 见下 |
| `${skillsRoot}` | 技能根绝对路径 | `/…/dsh-plugin-file-system-zc/skills` |
| `${issueDir}` | 问题台账目录绝对路径（`<插件根>/issues`，子 agent 出问题时自己建档用） | `/…/dsh-plugin-file-system-zc/issues` |
| `${issueDate}` | 台账日期 `YYYY-MM-DD` | `2026-09-09` |
| `${issueNo}` | 台账下一个序号（宿主读目录算好，两位补零） | `12` |

`${modeHint}` 取值（按层不同）：

- L1/L2/L3 `首次`：从零读目标自身建立语义。
- L3 `更新`：更新前先读现有文档 `${docPath}` 作基线，保留其中仍然正确的措辞（必须在**填注解之前**完成——产物由宿主整篇重写，会把它冲掉）；只改与当前实际内容不符的部分。L3 骨架是宿主新渲染的填空题，不存在「把旧文档打回占位符」这一步。
- L1/L2 `更新`：更新前先读现有文档 `${docPath}` 作基线（必须在写产物之前完成——整篇覆盖会把它冲掉）；只改与当前实际内容不符的部分，保留仍正确的措辞。L1/L2 骨架由宿主渲染后作为 `${skeleton}` 注入，不写盘。
- 翻译 `首次`：从零翻译源文档。
- 翻译 `更新`：目标译文已存在，整体覆盖重译；先读现有译文沿用已定稿的术语译法，避免同一术语前后不一致。

## 注入位置

**只注入一处：user message**（任务指令）。渲染结果即子 agent 收到的任务提示词，四层一致。

2026-09-10 去重：此前同一份渲染结果还额外注入 system prompt 的 `fs-book-doc` 段（order 950）。system prompt 与 user message 是两条独立通道、**两处都计费**，而两者逐字相同；且任务文本含每次变化的绝对路径，注入 system 会破坏跨任务的前缀缓存。故 system 段不再注入任何任务文本（`applyGenScope` 只做工具面收敛）。依据源仓 `docs/token-review-2026-09-08.md` 待决项 A。

## 各技能脚本的 `--content` 语义（写模板前必看）

| 技能 | `--content` 语义 | frontmatter 归属 |
|---|---|---|
| folder-doc（L1，宿主内置） | 宿主不再调用脚本；骨架（frontmatter + 目录树）由宿主生成，模型整篇写回 | 宿主写骨架，模型保留原文 |
| file-doc（L2，宿主内置） | 宿主不再调用脚本；骨架由宿主生成，模型整篇写回 | 宿主写骨架，模型保留原文 |
| translate-doc | 只收正文，脚本前置拼接 frontmatter | 脚本写，模型禁止手写 |
| source-doc（L3，宿主内置） | 宿主不再调用脚本；骨架落盘 → 模型分批 `edit` 填空 → 宿主 `finalize` 解析骨架、按真实行号排版并落盘 | 宿主写产物 frontmatter |
| 宿主翻译任务（`abilities/translate-doc/prompt.md`） | 不用脚本：模型 read 源 → 翻译 → write 目标 | 模型按模板照抄三行（`生成时间` 由宿主给） |

因此：**四层都不走脚本**——L1/L2 骨架由宿主渲染、模型整篇写回；L3 骨架落盘、模型分批 `edit` 填空、宿主 `finalize` 构建产物（见上表「宿主内置」）。`skills/` 下四个技能与其脚本全部保留，仅供会话内人工调用，宿主不再依赖。

## L3 的两处特殊契约（`skeletonFile` / `hostBuild`）

| 字段 | 语义 | 谁消费 |
|---|---|---|
| `skeletonFile: true` | 骨架**不注入提示词**，由执行器写到 `join(cwd, 'skeleton-' + taskId + '.txt')`（按 taskId 唯一，见 `${skeletonPath}` 行）；提示词只给 `${skeletonPath}` / `${skeletonLines}` | `gen-executor.ts` 派发前 |
| `hostBuild: true` | 产物**由宿主写盘**（`finalize`）：跳过「产物 mtime/size 未变化」空转校验，改由能力 `verify` 看注解填充率 | `gen-executor.ts` 收尾 |

收尾顺序固定：`verify`（骨架存在 + 至少填了 1 条注解）→ `finalize`（解析 → 排版 → `checkHealth` 四项自检 → 写 DOC → 删骨架）→ `upsertBookIndex`。自检不通过时**不写 DOC、不删骨架**，半成品不落书库、现场留证据。

## 翻译层的两条硬约束（2026-09-09）

1. **语种前置校验**：翻译只服务「其他语种 → 中文」。宿主派发前读源文前 8KB，用 `isMostlyChinese()` 判定；已是简体中文直接置任务 `error`（「源文档已是简体中文，无需翻译」），不启动子会话——中文源翻成中文只是照抄，实测一次 41K tokens 零信息增量。
2. **分段落盘**：单步输出预算（`maxTokens` 8192）容不下长文档整篇译文；一次写完会让推理吃光预算、本轮没有工具调用（空转）。故模板要求「先 write 骨架 + 锚点 `<!-- FS_TRANSLATE_CURSOR -->`，再分批 edit 追加，最后删锚点」，对应工具面 `read/write/edit`（`GEN_SCOPE_TOOLS.translate`）。**分批粒度不写死，由子 agent 按自身输出预算自行判断**（各智能体上下文预算不同，硬编码行数要么浪费预算、要么逼出空转；唯一红线是单批译文不得逼近输出上限）。归因见 [issues/2026-09-09-12](../../../issues/2026-09-09-12-translate-long-doc-reasoning-overflow.md)。

## 问题台账由执行任务的子 agent 自己写

四层模板末尾都有【问题台账】段：本轮出现返工 / 报错 / 产出不符 / 路径失效 / 判断失误 / 可优化之处时，由子 agent **本人**写 `<插件根>/issues/${issueDate}-${issueNo}-<slug>.md`（目录与序号由宿主下发，它才知道现场发生了什么），格式对齐 `issues/_template.md`；顺利则一个台账文件都不写、只回一句「本次任务完美执行」。索引表 `issues/README.md` 由宿主收尾时自动补行（子 agent 工具面写整篇 README 风险高）。

## 新增/修改一层

1. 新建 `abilities/<name>/` 目录，写 `index.ts` 能力描述符：`kind` / `dir` / `sub` / `arr` / `layer` / `scope` / `promptFile` / `docStem`，按需加 `skeleton` / `precheck` / `verify` / `finalize`（以及 L3 用的 `skeletonFile` / `hostBuild`）。
2. 在 `abilities/registry.ts` 注册该能力（生成类进 `GEN_ABILITIES`，翻译类为 `TRANSLATE_ABILITY`；`ABILITIES` 自动汇总）。
3. 写该目录的 `prompt.md`：固定参数区写死宿主算好的绝对路径与键，步骤给出**可原样复制执行**的命令（L1 已无脚本命令，改为给出骨架原文与三处填充规则），末尾列「已知坑」。
4. 若该能力需要新变量，在 `prompt-loader.ts`（或描述符 `promptVars`）的渲染处补齐，并在本文件变量表登记。
5. 更新 `tests/gen-scope.spec.ts` 的装配断言（至少覆盖：模板已加载、关键参数、产物路径、`--key`/`--rel` 差异、system 段不被注入）。
6. 走完 AGENTS.md §3 的四门禁。
