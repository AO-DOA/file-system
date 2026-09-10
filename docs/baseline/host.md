| 项 | 值 |
|---|---|
| 来源 | `../dsh-plugin-file-system` |
| 迁移源 revision | `3a3f89e` |
| 清点日期 | 2026-09-11 |
| 清点者 | 子A（host 基线） |
| 状态 | 已验收 |
| 口径 | 行号以 `3a3f89e` 工作树为准 |

# dsh-plugin-file-system host 侧功能清点基线

范围：`src/host/index.js`（494 行）+ 8 个引擎模块 + `abilities/` 四能力 + 三个 yml。行号对应当前工作树（`git status` 干净）。未读写 `-zc` 迁移目标仓；未跑 build。

## A. 路由全表

**公共前置（所有路由）**
- 注册：prefix 路由 `/api/fs`（`src/host/index.js:469-478`）；`seg = pathname.slice(7).replace(/^\/+/,'')`（`index.js:473-475`）。宿主 prefix 匹配语义为 `pathname===p || pathname.startsWith(p+'/')`（DSH `packages/host/webserver/src/index.ts:318-327`），故 `/api/fsx` 不匹配。
- POST 一律先读 body：上限 10MB（`index.js:103`），超限 → 413 `{ok:false,error:'body too large'}` 并 `req.destroy()`（`index.js:113-118`）；空 body → `payload={}`；非法 JSON → 400 `invalid json body`（`index.js:233-236`）。**不校验 Content-Type**。
- 越权统一 400 `path escapes workspace root`（`fs-utils.js:148-157` 抛 statusCode 400，`index.js:461-465` 映射）。
- 未匹配 → 404 `unknown route: <seg>`（POST 分支 `index.js:350`；GET 分支 `index.js:460`）。
- 统一 JSON 输出、无 CORS/缓存头（`index.js:96-100`）；未捕获异常 → `err.statusCode || 500`（`index.js:461-465`）。

| 方法+路径 | 入参（校验/上限） | 出参形状 | 错误码与触发条件 | 代码位置 |
|---|---|---|---|---|
| POST /api/fs/set-root | `{path?}`；path 给定时必须存在且 `isDirectory()` | 200 `{ok:true,root}` | 400 `not a directory: <path>`；500（mkdir 失败） | `index.js:237-246` |
| POST /api/fs/write | `{path,content?}`；**无 path 必填校验**；content 默认 `''` | 200 `{ok:true}` | 400 越权；500 其它 fs 错误（path 缺失/指向目录 → EISDIR，文案未实测） | `index.js:247-252` |
| POST /api/fs/mkdir | `{path}`；**无校验** | 200 `{ok:true}` | 400 越权；500 | `index.js:253-257` |
| POST /api/fs/delete | `{path}`；**无校验**；`rm(recursive:true,force:true)` 不存在也 200 | 200 `{ok:true}` | 400 越权；500 | `index.js:258-262`（高危：path 缺失时 `abs===root`，递归删除整个工作区根） |
| POST /api/fs/gen-doc | `{kind,path}`；path 默认 `'.'`；`kind` 必须命中 ABILITIES（**含 `translate`**，`registry.js:17`）；`kind!=='folder' && isMdPath` → 400；目标 stat 必须存在；folder 必须目录；非 folder 必须文件 | 200 `{ok:true,started:true,taskId}`；复用加 `reused:true` | 400 `unknown gen kind: <kind>` / `errGenMd` / `errTargetMissing` / `errTargetNotDir` / `errTargetNotFile`；500 docRel 补算失败（`index.js:302-307`） | `index.js:263-310` |
| POST /api/fs/translate | `{path}` 必填；须 `.md/.markdown`；不得 `.book/` 下；目标必须存在 | 200 `{ok:true,started:true,taskId,docRel}` | 400 `path required` / `errTranslateOnlyMd` / `errBookNoTranslate` / `errTargetMissing` | `index.js:311-349` |
| POST 其它 | 仍先读 body | — | 404 `unknown route: <seg>` | `index.js:350` |
| GET /api/fs/root | 无 | 200 `{root}`（**无 ok 字段**） | — | `index.js:354` |
| GET /api/fs/session | `?id=`（可选） | 200 `{sessionId,cwd,root}`（无 ok） | — | `index.js:355-364` |
| GET /api/fs/gen-status | `?id=`（可选） | 有 id：200 `{ok:true,task}`；未命中：**HTTP 200** `{ok:false,error:'task not found',task:null}`；无 id：200 `{ok:true,tasks:[…≤20]}` | — | `index.js:365-374` |
| GET /api/fs/tree | `?path=`（默认 `'.'`） | 200 `{path,list[]}`（无 ok） | 400 越权；500 `readdir` 失败（ENOENT 未兜底） | `index.js:375-425` |
| GET /api/fs/read | `?path=` 必填 | 200 `{content,ext,size}` | 400 `path required` / `invalid book doc rel: <rel>` / `not a file` / `file too large: <n> bytes (limit 2097152)`；404 `not a file: <rel>`（书库形状未命中） | `index.js:426-459` |
| GET 其它 | — | — | 404 | `index.js:460` |

补充形状契约：
- `tree.list` 目录节点 `{name,type:'directory',path,hasDoc,hasDocSrc:false,hasDocTr:false,docRel,docSrcRel:'',docTrRel:''}`（`index.js:397-403`）；文件节点 `{name,type:'file',path,hasDoc,hasDocSrc,hasDocTr,docRel,docSrcRel,docTrRel}`（`index.js:412-418`）；排序「目录优先 + `localeCompare('zh-CN')`」（`index.js:420-423`）。
- `task` 形状 `{id,kind,rel,docRel,status,error,startedAt,finishedAt}`（`index.js:294-301`、`331-338`）。
- 文档存在性只按「命名规则 + 文件名集合」推导，**不校验扩展名/内容**（`index.js:394-417` + `book-store.js:132-148`）。
- 无 client 调用的路由（已 grep 证实）：`POST /mkdir`、`POST /delete`、`GET /session`；`mkdir/delete/session/root` 在 `tests/` 中无直接用例。

## B. 任务状态机

状态取值：`pending` → `running` → `success` | `error`（无 cancelled；终态 2 个）。全部存于进程内 `genTasks: Map`（`index.js:37`），重启即丢。

| 迁移 | 触发 | 位置 |
|---|---|---|
| → pending | gen-doc 占位（同步 set，随后异步补 docRel） | `index.js:294-301` |
| → pending | translate 占位 | `index.js:331-338` |
| → running | `createAgent` 成功后 | `gen-executor.js:175`、`translate-executor.js:85` |
| → success | verify/finalize/upsert 全通过 | `gen-executor.js:218`、`translate-executor.js:120` |
| → error | 执行器内 catch（超时、校验失败） | `gen-executor.js:222-226`、`translate-executor.js:124-127` |
| → error | `setImmediate` 的 `.catch`（覆盖 createAgent 之前的抛错：agentLoop 缺失、bookTargetFor 失败、abilityOf 失败） | `index.js:308`、`index.js:347` |
| → error | sweep 兜底：`running && now-startedAt > 10min` → `errTaskTimeout()` | `index.js:52-54` |

完整时序：POST → 前置校验（`index.js:266-283` / `313-321`）→ 去重（`285-289` / `323-327`）→ `sweepGenTasks()`（`290` / `328`）→ 占位 pending → `docRel` 补算（`303` / `341`，失败删占位并抛）→ `setImmediate(runGenDoc|runTranslate)`（`308` / `347`）→ 200 返回 taskId → 执行器：`bookTargetFor` → `ensureBookDirAt` → `ensureGenCwd` → `prevStat` → `generatedAt` → 骨架（L3 落盘）→ 模板渲染 → `createAgent` → running → `followup(user message)` → `whenIdle()+withTimeout` → `syncIssueIndex` → 空转校验 → verify/finalize/upsert → success → `dispose()` → finally `invalidateDocCache()`。前端 `pollTask` 每 1.5s（首轮延迟 800ms）查 `/gen-status`（`src/client/index.js:254-278`），success 后用 `task.docRel` 经 `/read` 取回正文（`client/index.js:302`、`client/index.js:350`）。

超时口径：任务超时 `TASK_TIMEOUT_MS=10min`（`task-utils.js:7`），双保险 = `withTimeout(whenIdle)` 竞速（`gen-executor.js:186`、`translate-executor.js:111`）+ sweep 兜底（`index.js:52-54`）；计时器 `unref`（`task-utils.js:36`）。前端轮询上限 `POLL_LIMIT_MS=5min`（`client/index.js:61`、`259-262`）。任务记录 TTL 10min、容量上限 100（`index.js:43-44`、`48-61`）；`/gen-status` 列表上限 20（`index.js:372`）。`handle.dispose()` 语义为 stop/drain + 注销（DSH `packages/core/agent/src/index.ts:180-181`），失败仅 warn（`task-utils.js:43-45`）。

并发/去重：gen 用 `kind+rel`、translate 用 `kind==='translate' && rel`，命中 pending/running 即复用并返回 `reused:true`（`index.js:285-289`、`323-327`）。去重键用**原始未规范化 rel**（`'src'` 与 `'./src'` 不去重）；gen 与 translate 因 kind 取值不同而**互不去重**；`/gen-doc{kind:'translate'}` 与 `/translate` 会**共用**去重键（同 kind）。

## C. 四层能力

| 项 | L1 folder-doc | L2 file-doc | L3 source-doc | translate-doc |
|---|---|---|---|---|
| kind / taskId 前缀 | `folder` / `fsgen-` | `file` / `fsgen-` | `src` / `fsgen-` | `translate` / `fstr-` |
| 描述符 | `abilities/folder-doc/index.js:8-30` | `file-doc/index.js:9-35` | `source-doc/index.js:13-55` | `translate-doc/index.js:24-50` |
| sub / arr / layer | 目录概览 / 目录层 / 目录 | 文件摘要 / 文件层 / 文件 | 源码注解 / 源码层 / 源码 | 文章翻译 / 文章翻译 / 文章翻译 |
| 产物命名 | `<桶>/目录概览/<basename(目标目录)>.md` | `<桶>/文件摘要/<stem>.md` | `<桶>/源码注解/<stem>.md` | `<桶>/文章翻译/<stem>.md` |
| docStem | `basename(target.abs)`（`folder-doc/index.js:18`） | `computeDocStem(target.key)`（`file-doc/index.js:19`） | `computeDocStem(target.key)`（`source-doc/index.js:25`） | `computeDocStem(target.key)`（`translate-doc/index.js:33`） |
| frontmatter | 源码路径/层级/生成时间，宿主骨架写死（`folder-doc/skeleton.js:55-60`） | 同上（`file-doc/skeleton.js:14-19`） | 宿主 `finalize` 构建（`doc-render.js:181-185`） | 模型照抄宿主模板（`translate-doc/prompt.md:22-30`） |
| 骨架由谁生成 | 宿主 `buildFolderSkeleton` + `renderFolderTree`（`folder-doc/skeleton.js:29-102`） | 宿主 `renderFileDocSkeleton`（`file-doc/skeleton.js:13-49`） | 宿主 `buildSourceSkeleton`（`source-doc/skeleton.js:13-76`），**落盘** `$DSH_HOME/books/session/skeleton-<taskId>.txt`（`gen-executor.js:121-124`） | 无骨架文件；模型先 write 骨架 + 锚点 `<!-- FS_TRANSLATE_CURSOR -->`（`translate-doc/prompt.md:22-41`） |
| 提示词模板 | `abilities/folder-doc/prompt.md`（88 行） | `file-doc/prompt.md`（83 行） | `source-doc/prompt.md`（102 行） | `translate-doc/prompt.md`（87 行） |
| 模板实际变量 | target,targetKey,docPath,layer,mode,modeHint,skeleton,issueDir,issueDate,issueNo | 同 L1 | target,targetKey,docPath,cwd,mode,modeHint,skeletonPath,skeletonLines,issueDir,issueDate,issueNo（无 layer/skeleton） | target,targetKey,docPath,srcName,layer,arr,mode,modeHint,generatedAt,issueDir,issueDate,issueNo |
| 工具面白名单 | `read,write` | `read,write,glob,grep` | `read,write,edit` | `read,write,edit`（`fs-utils.js:179-184`） |
| 收尾校验 | 空产物 / 占位残留（`# <作用>`、角色占位、一句话占位）（`folder-doc/index.js:21-29`、`skeleton.js:105-110`） | 空产物 / 两条占位（`file-doc/index.js:26-34`、`skeleton.js:52-54`） | 骨架不存在 / 无单元 / 填充数 0（`source-doc/index.js:31-38`）；`finalize` 再走 `checkHealth` 四项（`doc-render.js:80-123`），失败不写 DOC、不删骨架（`source-doc/index.js:41-54`） | 译文落盘 + 更新模式下 mtime/size 必须变化（`translate-doc/index.js:43-49`）；**不校验锚点残留** |

宿主注入变量全集：生成侧 `gen-executor.js:129-163`（skill,target,bookDir,projectRoot,targetKey,docPath,docStem,srcName,cwd,generatedAt,skeleton,skeletonPath,skeletonLines,layer,arr,mode,modeHint,skillsRoot,issueDir,issueDate,issueNo）；翻译侧 `translate-executor.js:57-74`（子集）。模板渲染真源 `fs-utils.js:199-211`（只认 `${name}`，缺失原样保留）。工具面收敛 `index.js:68-78`，`genScopeAllow` 的 `available` 交集分支生产未启用（`fs-utils.js:190-195`）。索引统一 `upsertBookIndex(bookRoot, arr, {源码路径:key, 文档:sub/stem.md})`（`gen-executor.js:209-217`、`translate-executor.js:119`）。

## D. 书库模型

- 书库根 `booksRoot() = $DSH_HOME/books`，缺省 `~/.dsh/books`（`fs-utils.js:7-9`）。
- `projectKey(p)`：与 DSH `packages/session/session-persistence-jsonl/src/format.ts` 逐字一致的**可读编码**（非哈希）（`fs-utils.js:16-37`）：`[A-Za-z0-9._-]` 原样；`/ \ :` 连续段折一个 `-`；其余字符（含 `~`）转 `~XXXX`（UTF-16 code unit、大写、4 位补零）；去首部 `-`（空则 `root`）；slug 截断 251 字符；首尾包 `--…--`；空串抛错。桶目录 = `booksRoot()/projectKey(projectRoot)`（`fs-utils.js:41-43`）。
- 桶内结构：4 层子目录 + `index.json`，**无** `<项目名>-book` 中间层（`book-store.js:35-54`）。旧库 `<项目根>/.book/<basename(项目根)>-book/` 只读回退、不再创建（`fs-utils.js:47-49`）。
- `index.json` 结构 `{项目, 项目根, 目录层:[], 文件层:[], 源码层:[], 文章翻译:[]}`，条目 `{源码路径, 文档}`。upsert 语义：按 `源码路径` 查找，命中**整条替换**，未命中 push；其它数组原样保留；`mkdir -p` + 全量 `JSON.stringify(idx,null,2)+'\n'` 回写（`book-index.js:11-23`）。`ensureBookDirAt` 为**合并式补字段**（只补缺失字段，有改动才写盘并 `invalidateRootsCache()`）（`book-store.js:35-54`）。
- 旧位置只读回退判定：`/read` 带桶形状 → 候选 `[booksRoot()/<桶>/<层>/<leaf>]`，若 `knownBookRoots` 按桶名查到「项目根」再追加 `legacyBookDir(该根)`（`index.js:438-441`）；无桶形状 → 候选 `[freshBookDir, oldBookDir]` 取首个存在文件（`index.js:442-448`、`208-214`）。视图与兜底条目对每个根都合并 `[新桶, 旧库]` 的 stem 集合（`book-store.js:164-187`）。**写入恒只写新桶**。
- 跨工作区定向：`knownBookRoots()` = 各桶 `index.json` 的「项目根」+ 当前根隐式并入，TTL 5s，显式跳过 `books/session`（`book-store.js:68-100`）；`bestRootFor(abs, roots)` 取路径最长者（`book-store.js:101-112`）；`bookTargetFor(rel)` 产出 `{abs, bookRoot, relP, key}`（`book-store.js:116-123`）。`/tree` 视图缓存 TTL 1.5s、带 root 键（`book-store.js:155-174`）。

## E. 副作用与环境依赖

写盘位置：
1. `POST /write`：`mkdir -p` + `writeFile`（`index.js:249-250`）
2. `POST /mkdir`：`mkdir -p`（`index.js:255`）
3. `POST /delete`：`rm -rf`（`index.js:260`）
4. `POST /set-root` → `ensureBookDir()`：建桶 + 4 层 + 补 `index.json`（`index.js:244` → `book-store.js:56-58`）
5. **`GET /tree` 也有写副作用**：`cachedBookView()` → `ensureBookDir()`（`index.js:379` → `book-store.js:161`）
6. 生成任务：`ensureBookDirAt`（`gen-executor.js:96`）→ `ensureGenCwd` 建 `<books>/session`（`101`）→ 写骨架文件（`124`）→ L3 `finalize` 写 DOC 并 `rm` 骨架（`source-doc/index.js:51-53`）→ `upsertBookIndex`（`gen-executor.js:216`）
7. 翻译任务：`ensureBookDirAt`（`translate-executor.js:41`）、`ensureGenCwd`（`49`）、`upsertBookIndex`（`119`）
8. 问题台账：`syncIssueIndex()` read-modify-write `issues/README.md`（`issues.js:38-63`；调用点 `gen-executor.js:189`、`translate-executor.js:113`）
9. 子 agent 自身写盘，cwd = `$DSH_HOME/books/session`（`gen-executor.js:166`、`translate-executor.js:77`）

子 agent 会话创建：`agentLoop.createAgent(ctx, {sessionId:'fs-'+randomUUID, meta:{cwd, agentPreset}, agentOptions, setup})`（`gen-executor.js:90/164-174`、`translate-executor.js:45/75-84`，字段与 DSH `packages/core/agent/src/index.ts:62-129` 一致）；setup 内 `agentPresets.mount` + `applyGenScope`；`followup(createUserMessage)` 只注入 user message（`gen-executor.js:184`、`translate-executor.js:109`）；**不打 `meta.origin='subagent'`**（`gen-executor.js:98-100` 注释）。模型路由 `agents.currentInitiator()` → 回退 `agentDefaultModel.currentSelection()`（`index.js:142-163`）。动态 `await import('@deepseek-ai/dsh-llm')`（`gen-executor.js:89`、`translate-executor.js:44`）。

环境变量：`DSH_HOME`（`fs-utils.js:8`）、`FS_GEN_PRESET`（`task-utils.js:16-17`，默认 `ptc`）、`DSH_FS_ISSUES_DIR`（`issues.js:19-20`）、`NODE_ENV==='test'` 暴露 `ctx.__fsTest`（`index.js:482-493`）。其它进程级依赖：`process.cwd()` 作为 root 兜底（`index.js:33`）、`os.homedir()`（`fs-utils.js:8`）、`process.platform==='win32'` 分隔符分支 3 处（`fs-utils.js:149`、`book-store.js:103`、`book-store.js:163`）、`Buffer`（`index.js:111`、`121`）、`setImmediate`（`index.js:308`、`347`）、`timer.unref`（`task-utils.js:36`）、`import.meta.url`（`prompt-loader.js:19`、`issues.js:9`、`gen-executor.js:19`）。

宿主服务：`inject: ['webServer','sandboxPolicy','sessions','agentLoop']`（`index.js:24`）；`ctx.get` 读 `agents`、`agentDefaultModel`、`agentLoop`、`agentPresets`（`index.js:144`、`154`；`gen-executor.js:82`、`169`）。warn 通道 5 处：`index.js:76`、`task-utils.js:44`、`prompt-loader.js:48`、`gen-executor.js:190`、`translate-executor.js:114`。

配置层：`cordis.patch.yml:8-10`（insert `id: fs`）；`agent.cordis.yml:24-32`（`skill-filesystem.customSkillDirs` 用 `baseUrl` 相对解析 + `tool-skill`）；`preset.yml:1-4`（name 文件系统 / order 5）。

## F. 迁移风险点

1. **`import.meta.url` 三处**（`prompt-loader.js:19`、`issues.js:9`、`gen-executor.js:19`）：TS 若编译到 CJS 直接失效；提示词与台账路径全靠它 + 双候选目录探测（源码直载 vs `dsh/` 打包）。
2. **动态 import 必须保持动态**：`await import('@deepseek-ai/dsh-llm')`（`gen-executor.js:89`、`translate-executor.js:44`）。
3. **`POST /delete` 无 path 校验 → 可递归删掉整个工作区根**（`index.js:258-262`）；`/write`、`/mkdir` 同样无 path 必填校验。迁移时若「顺手补校验」会改变既有行为契约，需显式决策。
4. **`gen-doc` 的 kind 白名单过宽**：`abilityOf` 含 `translate`（`registry.js:17`），`POST /gen-doc {kind:'translate', path:'a.js'}` 按代码路径会被接受（跳过 `precheck`、写「文章翻译」层、与 `/translate` 共用去重键）。未端到端实测。
5. **去重时序**：去重检查→占位之间无 await（`index.js:285-301`、`323-338`），但**前置 await**（`275`/`319` 的 stat）使「同时发起」不保证复用——测试注释已明说（`tests/host-routes.test.js:453-456`）。去重键未规范化 rel。
6. **sweep 无定时器**：只在新增任务或测试句柄调用时触发（`index.js:290`、`328`、`486`），孤立 running 任务的兜底超时可能永不执行，只能靠 `withTimeout` 或前端 5min 上限收尾。
7. **内存态任务表**：`genTasks` 重启即丢，前端会收到 `task not found`（`index.js:37`、`370`）。
8. **两个缓存 TTL 不同步**（roots 5s vs view 1.5s）→ `/tree` 归属兜底分支（`index.js:382-392`），该分支正是历史缺陷（`projectRootPath` 未解构）所在。
9. **中文字符串键散落**：层名清单 4 处独立声明（`fs-utils.js:106`、`book-store.js:29`、`book-index.js:7`、`index.js:396-417` 的 `home.sets['…']`）；`docStemSetsIn` 返回键必须与字面量逐字一致（`book-store.js:143-147`）。
10. **`scope` 与 `kind` 当前逐值相同**（folder/file/src/translate），`applyGenScope(agentCtx, ability.scope)`（`index.js:172`）实际用 scope 值查 `GEN_SCOPE_TOOLS`；改名即破坏工具面收敛，而函数形参却叫 `kind`（`index.js:68`、`71`）。
11. **命名规则三处同步**：`computeDocStem`（`fs-utils.js:77-83`）与 `skills/file-doc/scripts/file-doc.mjs`、`skills/source-doc/scripts/source-annotate.mjs` 的 `computeName`，注释显式要求同步（`fs-utils.js:73-76`）。
12. **`renderPromptTemplate` 只认 `${name}`**，不处理 `{{name}}`，未知名/空值原样保留不抛错（`fs-utils.js:199-211`）。
13. **死/半死导出**：`docRelPath` 仅测试使用；`layerStemSetIn`、`docStemSetsIn`、`invalidateRootsCache` 在 `book-store.js:189-204` 返回对象中导出但 `index.js:82-86` 未解构；`genScopeAllow` 的 `available` 分支生产未启用。
14. **缩进/命名怪癖**：`index.js:94-95` 双空行；`t2` 形参（`index.js:128`、`131`）；`arr` 与 `sub` 除翻译层外不同名；`docRelBookIn` 拼 `'@'+bucket+'/'+sub+'/'+stem+'.md'`（`fs-utils.js:94-96`）；`/tree` 与 gen 必须同根视角（`index.js:406-407` 对 `book-store.js:121-122`）。
15. **`/read` 名字冲突**：项目内若存在名为「目录概览」「文章翻译」等的目录，其下 `.md` 会被 `isBookDocRel` 抢先按书库形状解析（`fs-utils.js:111-126`、`index.js:434-451`）。
16. **L3 骨架名用 taskId** 是并发互踩修复（`gen-executor.js:117-124`），改回 basename 会复现「骨架文件不存在」。
17. **收尾顺序固定**：`verify → finalize → upsertBookIndex`（`gen-executor.js:209-217`），任一步失败不得留半成品索引；L3 `checkHealth` 不过则不写 DOC、不删骨架。
18. 未确认项：`POST /write` 打向目录时的具体 500 文案；413 分支无测试覆盖；`translate-doc` 锚点残留无宿主校验（仅在模板 `prompt.md:41` 要求）。

## 功能点计数

- 路由 **11 条具名**（POST 6：set-root/write/mkdir/delete/gen-doc/translate；GET 5：root/session/gen-status/tree/read）+ **2 个 unknown 兜底 404 分支**；其中 3 条无 client 调用、4 条无测试用例。
- 能力 **4 个**（folder/file/src/translate）；提示词模板 4；能力确定性模块 4（3×`skeleton.js` + `doc-render.js`）；注册表 1（`registry.js`）。
- 状态机 **4 态**、**2 终态**、**11 个状态迁移点**（pending 2、running 2、success 2、error 5）。
- 引擎模块 **9 个**（index / fs-utils / book-store / book-index / issues / task-utils / prompt-loader / gen-executor / translate-executor）。
- 书库层 4、`index.json` 数组 4、去重键 2 类；上限 6 项（body 10MB、read 2MB、源文 2MB、语种采样 8192B、任务容量 100、任务列表 20）；超时口径 4 项（任务 10min、sweep 10min、记录 TTL 10min、轮询 5min）。
- 错误码 4 类（400/404/413/500）；环境变量 4；写盘位置 9 类；宿主服务依赖 4（inject）+ 4（ctx.get）；warn 通道 5。
