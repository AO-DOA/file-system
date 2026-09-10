# P5 / P6 执行规格 — 测试迁移与切换上线

> 制定：2026-09-11 · 上游：`docs/baseline/contracts.md` §D（测试基线）、`docs/feature-baseline.md`

---

# P5 测试迁移（135 例）

## 1. 目标

把 8 个 node:test 文件（2446 行 / **135 例**）迁移为 vitest，并把覆盖率补齐到 **file 级 行/函数/分支 100%**。

## 2. 现状（`contracts.md` §D 实测）

| 文件 | 行 | 例 | 覆盖内容 |
|---|---|---|---|
| `abilities.test.js` | 337 | 27 | 四能力确定性逻辑 + 注册表契约 |
| `client-md-utils.test.js` | 209 | 26 | client 纯逻辑 + locale 字典契约 |
| `fs-utils.test.js` | 205 | 21 | host 纯逻辑（含越权、projectKey） |
| `gen-scope.test.js` | 703 | 24 | 后台生成/翻译子 agent 作用域契约 |
| `host-routes.test.js` | 638 | 21 | 路由形状/错误码/双位置回退 |
| `issues.test.js` | 78 | 6 | 台账目录隔离 |
| `real-composition.test.js` | 155 | 8 | host 真实形态装配 |
| `task-timeout.test.js` | 121 | 2 | 超时清扫 |

## 3. API 映射（必须逐条对照）

| node:test | vitest | 注意 |
|---|---|---|
| `import { test } from 'node:test'` | `import { test, describe, it } from 'vitest'` | 现无 `describe` 分组，迁移后可保持扁平 |
| `import assert from 'node:assert/strict'` | **可原样保留** | vitest 兼容 node:assert |
| 回调参数 `t` 的 `t.skip` | `it.skip` / `test.skip` | 现仅 `real-composition.test.js:43,50` 使用 |
| 顶层 `await mkdtemp(...)` + 进程级 `process.env` 赋值 | 需确认 vitest worker 隔离与环境变量时序 | node:test 是单文件进程模型；vitest 默认 `pool: 'forks'`，需显式验证 |
| `--test-coverage-include` 三文件白名单 + lines/functions=100 | vitest `coverage.include` + `thresholds{lines,functions,branches:100}` | **注意 vitest 默认统计全量，必须显式收窄** |

## 4. 时序辅助函数必须保留语义

现测试用「等可观测完成信号」而非固定 sleep（这是 2026-09-11 修 flaky 的成果）：

- `waitSettled(handle, taskId)`（`gen-scope.test.js:137-148`，轮询 `/api/fs/gen-status` 每 2ms，13 处调用）
- `waitTaskRegistered(genTasks, rel)`（`host-routes.test.js:66-75`）
- `waitTaskSettled(genTasks, taskId)`（`host-routes.test.js:79-87`）
- `skeletonPathFrom`（`gen-scope.test.js:150`）

**迁移后必须逐字保留其语义**（等真实信号、超时仅防挂死）。依据 `docs/testing.zh.md`：「只有单独运行时才通过」即该 spec 的缺陷。

## 5. 覆盖率补齐（本阶段重点）

现仓库实测：`fs-utils` 行 100 / **分支 88.75** / 函数 100；另两文件分支 100。迁移后**三文件均须分支 100%**，需为未覆盖分支补用例——已知候选：

- Win32 分隔符分支（`fs-utils` 的 `process.platform === 'win32'`、`book-store` 的 `path.sep`）
- `docRelPath`（现仅测试使用）
- `renderPromptTemplate` 的未知名/空值路径（原样保留不抛错）
- `genScopeAllow` 的 `available` 交集分支（生产未启用）
- `resolveIn` 的越界与非字符串入参分支

**禁止**用 `/* v8 ignore */` 或改逻辑来凑阈值（主仓 `AGENTS.md:143` 的 JSDoc/覆盖纪律同理）。

## 6. 验收

1. **135 例全部迁移且全绿**，用例名与断言语义逐条对应（报告给映射表）
2. `npm run test:coverage` 全量 file 级 行/函数/**分支** 100%
3. 并发连跑 3 轮无失败
4. 台账销账 + commit

---

# P6 切换上线

## 1. 前置（缺一不可）

1. 新插件四门禁全绿（typecheck / lint / test / coverage / build）
2. **功能一致性验证**：以 `docs/feature-baseline.md` §2「必须逐字保留」为清单逐条核对
3. 冒烟项目已备（见 §4）
4. `~/.dsh/profiles/web/package.json` 现状已备份

## 2. 切换步骤

```sh
# 1) 记录现状
cp ~/.dsh/profiles/web/package.json /tmp/web-profile-backup.json
grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json

# 2) 移除旧插件（现为 link:/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system）
dsh plugin --profile web remove dsh-plugin-file-system

# 3) 安装新插件
dsh plugin --profile web add /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc

# 4) 先验层，不启动
dsh --profile web --dump-config | grep -A3 "dsh-plugin-file-system-zc"
```

**验收点**：`--dump-config` 输出须含新插件的层，且行 id 与 `cordis.patch.yml` 一致。

## 3. 重启（`restart-dsh` 技能）

> **⚠ 重启会杀掉承载当前会话的 host 进程，当前对话轮次被中断。**
> `dsh-restart` **必须是该轮最后一个动作**；恢复后在新轮次验证与汇报。
> 会话与任务持久化在磁盘，重启后 GUI 会话原样恢复，但**本会话的活动 goal 会转为未激活**——需要在恢复后显式 `resume`。

## 4. 人工冒烟（重启后，浏览器逐项过）

依现插件 `AGENTS.md` §6，四项：

1. 「文件」页签开/关切换
2. 文件树展开/折叠；书库文档节点带蓝点（**注**：`AGENTS.md` 原文称"悬停可打开"，但 T-02 实测代码中**无此实现**（G-11），以实际行为为准，并同步修正该文档表述）
3. 「源码」页签编辑 → 出现「● 未保存」→ 保存落盘
4. 「生成解读」L1/L2/L3 与「翻译」：按钮出现、任务轮询收尾（不无限等待）、产物可读取

## 5. 回滚预案

任一项不通 → 恢复 `/tmp/web-profile-backup.json` → 重启 → 复验旧插件。**旧插件仓库全程未被改动**，回滚无副作用。

## 6. 收口

1. 更新 `PROGRESS.md`：P6 全部销账 + 变更日志
2. 写交付摘要 `docs/delivery-summary.md`，**必须显著包含**：
   - **已知高危 G-1**（`/delete` 无 path 校验可删根）及其暴露面说明
   - G-1~G-11 已知行为清单
   - 与主仓风格的**有意差异**（产物不入库 vs `dsh-market` 提交 `client.js`；`EXT_BADGES` 硬编码）
   - 覆盖率口径（per-file 100% 含分支）与实测数据
3. 台账与摘要 commit
