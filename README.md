# dsh-plugin-file-system — 文件系统（DSH 打包插件）

DSH 打包插件（bundle）：为 DSH web 装载「文件」页签（插件名 `dsh-plugin-file-system`）——浏览工作区文件、查看与编辑文件，
并为项目生成与阅读**四层书库文档**（目录概览 / 文件摘要 / 源码注解 / 文章翻译）；
全部文档集中存放于 `$DSH_HOME/books/`，跨工作区共享。

本插件以 TypeScript（strict）+ vitest/jsdom + tsdown 实现，覆盖率按 per-file 100% 要求。
真实路由、四层能力与页签界面均已交付并上线运行（见「实现进度」）。

**安全加固**：`POST /api/fs/delete` 两条通往「递归删除整个工作区根」的路径均已封死，详见「安全提示」。

## 目录

- [仓库](#仓库)
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

## 仓库

代码托管于 GitHub。

| 项 | 值 |
|---|---|
| 地址 | `git@github.com:AO-DOA/file-system.git` |
| 账号 | `AO-DOA` |
| 默认分支 | `main` |
| 认证 | SSH（ed25519 专用密钥，非 HTTPS/PAT） |

```bash
git clone git@github.com:AO-DOA/file-system.git
```

本机认证配置：密钥 `~/.ssh/id_ed25519_github`，`~/.ssh/config` 已将 `github.com` 固定指向该密钥并启用 `IdentitiesOnly yes`（与本机 gitee 用的 `id_ed25519` 互不干扰）。

## 安装

profile 是安装单位，本插件声明 `dsh.bundle.patch`（`cordis.patch.yml`），由 profile 引用后插入 cordis 行。

1. profile 的 `package.json` 依赖加 `"dsh-plugin-file-system": "link:<本插件目录>"`；
2. 同一个 `package.json` 的 `dsh.profile.bundles` 加 `dsh-plugin-file-system`；
3. 重启 dsh web。

插件自身的 `cordis.patch.yml` 已插入 cordis 行（`- insert: - id: fs` + `name: dsh-plugin-file-system`），
profile 的 `cordis.patch.yml` **不要**再 insert fs。已挂载本插件的 profile 可跳过本节。

## 功能

| 能力 | 说明 |
|---|---|
| 文件树浏览 | 左侧树浏览当前工作区，目录展开/折叠（懒加载，目录优先 + 中文排序） |
| 文档角标 | 命中书库文档的树节点带**蓝色圆点**，点击可直接打开对应文档 |
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

## 安全提示

**已加固**：`POST /api/fs/delete` 曾存在两条通往「递归删除整个工作区根」的路径，现已各加一道闸门。

| 情形 | 加固前行为 | 现在 |
|---|---|---|
| 缺少 `path`（或非字符串 / 空串） | `abs === root` 从越权检查里通过 → `rm(root, {recursive, force})`，**整个工作区根连同内容被删**，返回 200 | 400 `path required` |
| `path` 合法但解析回工作区根（`'.'`、`'./'`、`'sub/..'`） | 同上（200，全损） | 400 `refusing to delete the workspace root` |

两道闸门分别插在 `resolveIn` **之后**、`rm` **之前**——先判「有没有」，再判「是不是根」。修复经**运行时前后对照**证实：同一探针在修复前后各跑一次，修复前 `delete '.'` 返回 200 且 root 与其中的文件全部消失；修复后返回 400 且 root 完好。

`POST /api/fs/write`、`POST /api/fs/mkdir` 同时补了 `path` 必填校验（缺失 → 400 `path required`）。这两条**不**加「拒绝根自身」的守卫——`mkdir root` 幂等、`write root` 报 EISDIR，都不会毁数据，加了反而改变既有语义。

**影响面**：`/mkdir`、`/delete` 没有任何前端调用；`/write` 有一处（源码保存），其 `path` 恒非空 ⇒ **页签界面行为零变化**。改动只影响直接向这三条路由发请求的脚本与集成。

> 这是本项目**唯一**有意的行为差异。决策与运行时证据见 [`PROGRESS.md`](PROGRESS.md) 的 G-1 登记。

## 已知行为

以下条目为已知缺陷登记，本轮不修（编号 G-1~G-12，G-1 见上节）。

- **`gen-doc` 的 kind 白名单过宽**（G-2）：`{kind:'translate', path:'<非 md>'}` 会被接受。
- **目录重复请求**（G-3）：打开目录节点时对同一 `/read` URL 重复发请求，产生冗余请求。
- **静默丢弃未保存编辑**（G-4）：切换文件或工作区时不提示确认，未保存的编辑直接丢失。
- **`refreshRoot` 失败不上屏**（G-5）：已有打开对象时，刷新工作区根的错误不会显示，错误不可见。
- **拖拽监听残留**（G-6）：拖拽过程中组件卸载，`document` 上的监听不会被移除。
- **轮询定时器不清理**（G-7）：`pollTask` 的 `setTimeout` 没有 `clearTimeout`，靠存活标记短路。
- **sweep 无定时器**（G-8）：孤立的 `running` 任务兜底可能永不触发，收尾依赖任务超时与前端 5 分钟上限。
- **任务表是进程内 Map**（G-9）：宿主重启即丢，前端随后收到 `task not found`。
- **未消费 View 焦点协议**（G-10）：`conversation.view` 的 owner props（`viewRequest`/`openView`/`completeViewRequest`）未被使用。
- **「悬停可打开」无对应实现**（G-11）：蓝点与树节点实为**点击**打开（`onOpen` 挂在节点行与蓝点的 `onClick` 上），文档原写的「悬停可直接打开」与实际不符——按既定决策订正文档表述为「点击」，而非为它造一个实现。
- **`CodeBlock` 的 `copyLabel`/`copiedLabel` 未传**（G-12）：这两字段自上游 primitives 0.1.5 起为必填，而原实现只传 `{code, lang}`（纯 JS 无类型检查，故从未暴露）；逐字保留——**不补** `t('mdCopy')`（补值会改变高亮区复制按钮的可见文案，属行为变化），仅在类型层窄化到原实现真正传递的两个字段，运行时调用与之一致。

其中 G-6、G-7 属资源泄漏：按例外 b，它们是「可经例外修正、但**本轮决定不修**」的泄漏，逐字保留——`pollTask` 无 `clearTimeout`、拖拽 `document` 监听无 cleanup，仅靠 `aliveRef` 短路达到可观察等价（`src/client/index.tsx:538-539` 注释明写「不新增清理」）。其余条目保持原样。

## 模型可见面

- **生成/翻译子会话**：宿主把 `src/host/abilities/<能力>/prompt.md` 的文本逐字注入子 agent 的
  user message，并按层限定模型可用工具。

## 实现进度

本仓按阶段推进，逐阶段以五项门禁（typecheck / lint / test / coverage / build）验收。当前状态：

| 阶段 | 状态 |
|---|---|
| P0 功能基线清点与汇总 | 完成 |
| P1 骨架与装载（工程基础、三件套与占位挂载） | 完成 |
| P1 陈旧引用修正 | 完成 |
| P2 host 纯逻辑（`fs-utils` / `locale` / 书库层 / 任务与提示词 / 能力目录） | 完成 |
| P3 host 路由与状态机（11 条 `/api/fs/*`、任务状态机、执行器） | 完成 |
| P4 client（`.tsx` 组件、树与查看器、生成与翻译、持久化） | 完成 |
| P5 测试迁移（vitest，per-file 100%） | 完成 |
| P6 切换上线（profile 切换、人工冒烟） | 完成 |

当前代码已交付上述全部能力：`/api/fs` 的 11 条路由与页签界面均为实装，P1 阶段的 `__ping` 占位路由与占位视图已不在代码中。进度权威是 [`PROGRESS.md`](PROGRESS.md)。

## 开发

```bash
npm run typecheck      # tsc -b tsconfig.json（strict）
npm run lint           # oxlint . --config .oxlintrc.json
npm test               # vitest run（jsdom 环境）
npm run test:coverage  # vitest run --coverage（per-file 语句/分支/函数/行 100%；两个入口文件 src/host/index.ts、src/client/index.tsx 列入 coverage.exclude，不在门槛内）+ 覆盖率分母守卫
npm run build          # tsc -b tsconfig.host.json && tsdown + client banner 归一化与校验
```

- 手写源码一律在 `src/`：host 入口 `src/host/index.ts`、client `src/client/index.tsx`、
  共享文案字典 `src/shared/locale.ts`。
- 构建产物为 `lib/host/index.js`（host）与 `client/client.js`（client），两者都在 `.gitignore` 中，
  不手写、不提交。
- **改动如何生效：两半不同，别再一起说**（2026-09-12 实测订正；旧说法「改 host 或 client 后都要
  `build` + 重启」已作废，订正记录见 `PROGRESS.md`「改动的生效条件」一节）：
  - **client**（`src/client/**` → `client/client.js`）：产物是被 HTTP 分发的**静态资源**，本机 profile 挂着
    HMR bundle watch。`npm run build` 一落盘，watch 按 stat（mtime/size）变化重哈希并调
    `clientModules.rebuilt(id)`，host **内存里的 bundle 与 rev 立即更新**
    ⇒ **`npm run build` + 刷新页面即可，不需要重启**（重启多余，还会中断用户对话）。
  - **host**（`src/host/**` → `lib/host/index.js`）：产物是 Node 进程 `require` 进内存的**模块**
    ⇒ **`npm run build` + 必须重启 dsh web**。

## 相关文档

- [`PROGRESS.md`](PROGRESS.md)：项目台账与决策记录的唯一权威。
- [`docs/agent/README.md`](docs/agent/README.md)：子智能体协作体系（三层存储约定、入场阅读顺序、历史报告索引）。
