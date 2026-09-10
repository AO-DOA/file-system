# P4 执行规格 — client 迁移

> 派发依据。执行者按此实施，主智能体按 §5 验收。
> 制定：2026-09-11 · 上游基线：`docs/baseline/client.md`（**171 功能点，逐条对照的依据**）、`docs/feature-baseline.md`
> **前置**：P1 骨架完成（含 `tsconfig.client.json` 的 jsx 配置与 tsdown 客户端构建）。

---

## 1. 目标

把 client 侧迁移为 TypeScript：`src/client/index.js`（771 行：槽位注册 + UI 树 + `useOpenedViewer`）与 `src/client/md-utils.js`（83 行纯逻辑）。

---

## 2. 决策 D-11：client 采用 `.tsx` + JSX

**裁决**：`src/client/index.tsx` 使用 JSX（`react-jsx` runtime），**替换**现有的 `React.createElement(...)` 写法。

**理由**：用户要求"严格按照主仓规范重构"；主仓 client 代码与参照实现 `dsh-market` 均为 `.tsx` + `jsx: react-jsx`。JSX 是等价语法糖，类型检查可约束等价性。

**风险控制（强制执行）**：
- JSX 改写必须**逐段对照**原 `React.createElement` 的实参顺序（type、props、children），**不得改变 props 的传递内容与顺序**；
- `react/jsx-runtime` 必须进入 tsdown 的 **externals**（走 loader 模块表），否则运行时 `require` 失败；
- 每个改写段落由 `docs/baseline/client.md` §B/§C 的功能点逐条对照验收。

---

## 3. 铁律

1. **槽位契约逐字保留**（红线 2 核心）：
   ```
   slots.inject('conversation.view', () => slots.register({
     name: 'conversation.view',
     id: 'fs',
     order: 12,
     label: () => t('slotLabel'),
   }, props => <FsView .../>))
   ```
   —— `id: 'fs'` 与 `order: 12` 改动即破坏既有用户界面布局。
2. **171 个功能点逐个保留**（`baseline/client.md`）：28 个状态字段、15 条条件渲染分支、18 项交互、5 组内存缓存、localStorage 键 `fs.ui.v1` 与 6 个落盘字段。
3. **i18n 72 个 key 与文案值逐字不变**；client 中**不得新增硬编码文案**（现有唯一硬编码是 `slots service missing` 的诊断 throw 与 `md-utils` 的 `EXT_BADGES` 角标，按 D-8 原样保留）。
4. **`「● 未保存」语义不得改变**：出现（任何 `changeEdit`）、消失（保存成功或 `opened.path` 变化）、**不清除**（切页签/折叠/拖宽）三种情形逐条对照 `baseline/client.md` §C-9。
5. **G-3~G-7、G-10 保留**（`feature-baseline.md` §4）：目录重复请求、静默丢弃未保存、失败不上屏、未消费 owner props。**例外**：G-6（拖拽监听无 cleanup）与 G-7（`setTimeout` 无 `clearTimeout`）属 D-8 例外 b，**可修正但必须单独记账**并在交付摘要列明行为差异。
6. **死代码按 D-8 例外 a 删除**：`cardDismissed`/`setCardDismissed`、`genStatus`、未消费的 `isMdFile`/`isBookFile`/`picker`、4 个无引用的 CSS 类。删除须在报告中列出清单。
7. **不动迁移源**；**不 git commit**。

---

## 4. 派发单元

### P4-A `md-utils`（纯逻辑，无 DOM）

`src/client/md-utils.ts`，8 个导出（`basename` / `extOf` / `extBadge` / `isMd` / `langFor` / `splitFrontmatter` / `parseFmRows` / `labLabelKey`）。**file 级 行/函数/分支 100%**，可直接用 vitest 单测（无需 jsdom）。

### P4-B 槽位与 UI 骨架

`apply()` 的槽位注册、样式 effect（`<style data-plugin="fs">` + disposer）、`FsView` 顶层结构（顶栏 / 主体 / 编辑器区三分）。此单元交付时，页签应能在 jsdom 下渲染出空态。

### P4-C 树与查看器

`FsTree`（懒加载展开、折叠不删缓存、文档蓝点两种行为）、`FsPane`（12 条条件渲染分支）、`renderFrontmatter` / `renderMd` / `viewBody` / `placeholderCard`。

### P4-D 打开状态与生成/翻译

`useOpenedViewer`（14 个状态 + ref + 派生量）、打开时的读取扇出（最多 4 个并发 `/read`）、生成菜单与 `runGen`、翻译 `runTranslate`、`pollTask` 轮询（首轮 800ms、之后 1500ms、5min 上限）、`onTrDone` 局部刷新。

### P4-E 持久化与工作区

`localStorage` 读写（`fs.ui.v1`）、启动恢复链路（set-root → root → tree → expanded → opened → 并发回填 cache）、工作区切换菜单与 `workspaces.list.subscribe`、拖宽（180–420 clamp）。

---

## 5. 验收标准

1. 五条命令全绿（`typecheck` / `lint` / `test` / `test:coverage` / `build`）
2. **`md-utils.ts` file 级 行/函数/分支 100%**；其余 client 文件同样要求 file 级 100%（jsdom 环境）
3. **171 功能点对照表**：报告须逐区（A–F）给出"已迁移/不适用/有意保留"三态结论
4. jsdom 测试覆盖：空态渲染、树展开与懒加载、文件打开、Markdown 渲染分支、编辑态与「● 未保存」三种情形、页签切换、localStorage 恢复
5. 并发连跑 3 轮无失败
6. 台账销账 + commit

---

## 6. 风险

- **771 行单文件**：D-8 禁止拆分，改写量集中在 P4-C/D。建议按单元小步提交给主智能体验收，而非一次交付全部。
- **`pollTask` 无 `clearTimeout`**：jsdom 下卸载后残余定时器会污染其他测试；若修正（D-8 例外 b），必须在报告单列。
- **`EXT_BADGES`** 是产品可见文本却硬编码在纯逻辑层（`baseline/client.md` §E 指出），迁移时**保持原样**，并在最终交付摘要中作为"可选改进项"提出。
- 官方 `conversation.view` 的 owner props（`viewRequest`/`openView`/`completeViewRequest`）本插件不消费（G-10），迁移后仍不消费，**不得顺手接入**。
