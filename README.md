# dsh-plugin-file-system-zc — 文件系统（DSH 打包插件）

DSH 打包插件（bundle）：为 DSH web 装载「文件」页签（插件名 `dsh-plugin-file-system-zc`）——浏览工作区文件、查看与编辑文件，
并为项目生成与阅读**四层书库文档**（目录概览 / 文件摘要 / 源码注解 / 文章翻译）；
全部文档集中存放于 `$DSH_HOME/books/`，跨工作区共享。

本仓是 `dsh-plugin-file-system` 的主仓模式重写版：行为契约保持一致，工程栈改为
TypeScript（strict）+ vitest/jsdom + tsdown，覆盖率按 per-file 100% 要求。重写尚未完成，
当前只落地了骨架与装载，真实路由、四层能力与页签界面在后续阶段交付（见「实现进度」）。

**已知高危行为**：`POST /api/fs/delete` 缺 `path` 参数可递归删除整个工作区根，详见「安全提示」。

## 目录

- [安装](#安装)
- [功能](#功能)
- [快速使用](#快速使用)
- [约定](#约定)
- [安全提示](#安全提示)
- [已知行为](#已知行为)
- [模型可见面](#模型可见面)
- [实现进度](#实现进度)
- [开发](#开发)
- [相关文档](#相关文档)

## 安装

profile 是安装单位，本插件声明 `dsh.bundle.patch`（`cordis.patch.yml`），由 profile 引用后插入 cordis 行。

1. profile 的 `package.json` 依赖加 `"dsh-plugin-file-system-zc": "link:<本插件目录>"`；
2. 同一个 `package.json` 的 `dsh.profile.bundles` 加 `dsh-plugin-file-system-zc`；
3. 重启 dsh web。

插件自身的 `cordis.patch.yml` 已插入 cordis 行（`- insert: - id: fs` + `name: dsh-plugin-file-system-zc`），
profile 的 `cordis.patch.yml` **不要**再 insert fs。已挂载本插件的 profile 可跳过本节。

## 功能

| 能力 | 说明 |
|---|---|
| 文件树浏览 | 左侧树浏览当前工作区，目录展开/折叠（懒加载，目录优先 + 中文排序） |
| 文档角标 | 命中书库文档的树节点带**蓝色圆点**，悬停可直接打开对应文档 |
| 文件查看 | 右侧查看文件：Markdown 走 DSH 原生 MarkdownText（附 frontmatter 字段卡），主流代码语言走 CodeBlock（shiki 高亮），其余等宽兜底 |
| 编辑保存 | 「源码」页签可编辑（textarea）并保存到宿主磁盘；有未保存修改时显示「● 未保存」 |
| 工作区切换 | 左上角「选择工作区」下拉列出 DSH 工作区并切换读写根（`POST /api/fs/set-root`）；根/树宽/展开/打开项经 localStorage 跨刷新恢复 |
| 四层书库文档 | 右上「生成解读」下拉生成**目录概览（L1）/ 文件摘要（L2）/ 源码注解（L3）**；生成后自动切换对应阅读页签，树节点出现蓝点；已生成则按钮变「重新生成」（覆盖） |
| 文章翻译 | 项目内 Markdown 文件 → 中文译文落到「文章翻译」层（第 4 层）：**忠实原文**（不增删内容、不改义），特殊名词首次出现保留原文并就地 `原文（中文解释）`，代码块/路径/URL 保留原文；已有译文时按钮显示「重新翻译」（覆盖） |
| 书库集中存储 | 全部文档存 `$DSH_HOME/books/<projectKey(项目根绝对路径)>/`（桶内四层 + `index.json`）；旧 `.book/` 布局已全量迁移清空（2026-09-09），双位置回退保留为兼容，写入恒只写新桶 |
| 跨工作区共享 | 读写都定向「包含目标的**最近已知项目根**」的桶（单一事实源）：在插件目录根下生成的解读，切到父级工作区（如 `DSHworkPace`）浏览同一目录依然显示；docRel 带桶段 `@<桶名>/<层名>/<stem>.md`，`/read` 按桶段定位 |
| 生成任务后台化 | 生成/翻译为**后台子 agent 任务**，前端经 `gen-status` 每 1.5s 轮询；子 agent 超时 10 分钟自动置 error，前端轮询上限 5 分钟，绝不无限等待 |

## 快速使用

1. 对话页签栏点「文件」（槽位 id `fs`，order 12）。
2. 左上角下拉选择工作区；默认当前会话工作区。
3. 点文件或目录即查看；带蓝点的节点可打开对应书库文档。
4. 点「生成解读」下拉生成 L1/L2/L3；选中项目内 md 文件点「翻译」。
5. 「源码」页签点「编辑」→ 修改 → 「保存」。

## 约定

- **书库位置**：`$DSH_HOME/books/<projectKey(项目根绝对路径)>/`，桶内四层
  `目录概览/文件摘要/源码注解/文章翻译/` + `index.json`；迁移前旧库只读回退，写入恒只写新桶。
- **跨工作区共享**：读写定向「包含目标的最深已知项目根」桶（已知根 = 各桶 `index.json` 的「项目根」注册；
  打开过的工作区根自动幂等注册）；docRel 带 `@<桶名>/` 前缀，前端不透明透传，`/read` 按桶定位。
- **md 不生成 L2/L3**（md 本身即文档）；书库内文档不参与翻译——翻译对象限定为项目文件内的 md/markdown 文档。
- **翻译要求**：符合原文——不增删内容、不改义；特殊名词（专有名词/技术术语/产品名/API/命令/包名）
  首次出现保留原文并就地写 `原文（中文解释）`（如 `CRLF（回车换行）`），再次出现直接用原文；
  代码块、行内代码、路径、URL 保留原文不翻译。
- **随包技能**：插件同时兼作 agent 预设，随包分发 `folder-doc`（L1）/ `file-doc`（L2）/
  `source-doc`（L3）/ `translate-doc`（文章翻译）/ `session-review`（复盘评分）五个技能，
  经 `agent.cordis.yml` 的 `customSkillDirs` 挂载，可在任意会话中复用。

## 安全提示

**`POST /api/fs/delete` 在缺少 `path` 参数时，会把工作区根解析为删除目标并执行递归强制删除（`rm -rf` 语义）。**
`path` 缺失时越权检查因「根等于根」而通过，删除动作没有二次确认。同一路由表下
`POST /api/fs/write`、`POST /api/fs/mkdir` 同样没有必填参数校验。

- 这是从上一版逐字保留的既有行为，迁移目标是与上一版行为等价，**本轮不修**。
- 暴露面限于直连 API：这三条路由没有任何前端调用，页签界面不会触发它们。
- 因此不要对这三条路由直接发请求（尤其不要省略 `path`）；脚本与集成若调用它们，必须自行保证 `path` 存在且在工作区内。

## 已知行为

以下条目同样从上一版逐字保留，属行为等价的组成部分，按迁移决策本轮不修；逐条出处见
[`docs/feature-baseline.md`](docs/feature-baseline.md) §4「已知行为与缺陷登记」（编号 G-1~G-11，G-1 见上节）。

- **`gen-doc` 的 kind 白名单过宽**（G-2）：`{kind:'translate', path:'<非 md>'}` 会被接受。
- **目录重复请求**（G-3）：打开目录节点时对同一 `/read` URL 重复发请求，产生冗余请求。
- **静默丢弃未保存编辑**（G-4）：切换文件或工作区时不提示确认，未保存的编辑直接丢失。
- **`refreshRoot` 失败不上屏**（G-5）：已有打开对象时，刷新工作区根的错误不会显示，错误不可见。
- **拖拽监听残留**（G-6）：拖拽过程中组件卸载，`document` 上的监听不会被移除。
- **轮询定时器不清理**（G-7）：`pollTask` 的 `setTimeout` 没有 `clearTimeout`，靠存活标记短路。
- **sweep 无定时器**（G-8）：孤立的 `running` 任务兜底可能永不触发，收尾依赖任务超时与前端 5 分钟上限。
- **任务表是进程内 Map**（G-9）：宿主重启即丢，前端随后收到 `task not found`。
- **未消费 View 焦点协议**（G-10）：`conversation.view` 的 owner props（`viewRequest`/`openView`/`completeViewRequest`）未被使用。

其中 G-6、G-7 属资源泄漏，按迁移决策的例外**允许**在 jsdom 测试暴露时修正，但必须单独记账并在交付摘要中列明行为差异；其余条目保持原样。

## 模型可见面

- **随包技能**：五个技能经 `agent.cordis.yml` 的 `customSkillDirs` 注册进该预设层的技能表，
  在启用本预设的会话中对模型可见（`skills/` 已随仓分发，`package.json` 的 `files` 含 `skills`）。
- **生成/翻译子会话**：宿主把 `src/host/abilities/<能力>/prompt.md` 的文本逐字注入子 agent 的
  user message，并按层限定模型可用工具。这部分来自上一版，在本仓随 P2/P3 落地，当前尚未生效。

## 实现进度

本仓按阶段推进，逐阶段以四门禁（typecheck / lint / test / coverage / build）验收。当前状态：

| 阶段 | 状态 |
|---|---|
| P0 功能基线清点与汇总 | 完成 |
| P1 骨架与装载（工程基础、三件套与占位挂载、`skills/` 迁移） | 完成 |
| P1 陈旧引用修正 | 进行中 |
| P2 host 纯逻辑（`fs-utils` / `locale` / 书库层 / 任务与提示词 / 能力目录） | 进行中 |
| P3 host 路由与状态机（11 条 `/api/fs/*`、任务状态机、执行器） | 待办 |
| P4 client（`.tsx` 组件、树与查看器、生成与翻译、持久化） | 待办 |
| P5 测试迁移（vitest，per-file 100%） | 待办 |
| P6 切换上线（profile 切换、人工冒烟） | 待办 |

**因此以下能力在当前代码中尚不可用**：`/api/fs` 只有占位路由（`/api/fs/__ping` 应答 200，
其余路径返回 404）；页签渲染的是占位视图。上表「功能」「快速使用」两节描述的是迁移完成后的目标形态，
不是当前可用的行为。进度权威是 [`PROGRESS.md`](PROGRESS.md)。

## 开发

```bash
npm run typecheck      # tsc -b tsconfig.json（strict）
npm run lint           # oxlint . --config .oxlintrc.json
npm test               # vitest run（jsdom 环境）
npm run test:coverage  # vitest run --coverage（per-file 语句/分支/函数/行 100%）
npm run build          # tsc -b tsconfig.host.json && tsdown + client banner 归一化与校验
```

- 手写源码一律在 `src/`：host 入口 `src/host/index.ts`、client `src/client/index.ts`、
  共享文案字典 `src/shared/locale.ts`。
- 构建产物为 `lib/index.js`（host）与 `client/client.js`（client），两者都在 `.gitignore` 中，
  不手写、不提交；**改 host 或 client 后需重跑 `npm run build` 并重启 dsh web 才生效**。

## 相关文档

- [`PROGRESS.md`](PROGRESS.md)：迁移进度与决策记录的唯一权威。
- [`docs/feature-baseline.md`](docs/feature-baseline.md)：功能基线、逐字保留清单、已知行为登记（G-1~G-11）。
- [`docs/baseline/host.md`](docs/baseline/host.md)、[`docs/baseline/client.md`](docs/baseline/client.md)、
  [`docs/baseline/contracts.md`](docs/baseline/contracts.md)：host 路由与状态机、client 功能点与 i18n、契约与构建基线。
- [`docs/spec-p1-skeleton.md`](docs/spec-p1-skeleton.md) 等 `docs/spec-*.md`：各阶段执行规格与验收标准。
- 迁移源（只读）：`../dsh-plugin-file-system`。
