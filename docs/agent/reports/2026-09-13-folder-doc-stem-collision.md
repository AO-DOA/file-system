# 目录概览（folder 层 L1）文档命名撞车修复 — 2026-09-13

## 任务书前提订正（先订正再干活）

1. **「撞车脚本输出」的对齐**：任务书给的例子「`native/system/packages` → stem 形如 `deepseekHARNESS-native-system-packages`」与 `computeDocStem` 实际输出**不符**。`computeDocStem` 的 `relParents = parts.slice(1, -1)` **不含工作区名前缀段**（顶层才用工作区名兜底）。实测：
   - `deepseekHARNESS/native/system/packages`（经历 `relToSrcKey` → `computeDocStem`）→ **`native-system-packages`**
   - `deepseekHARNESS/packages` → **`deepseekHARNESS-packages`**（顶层，工作区名兜底）
   两者不同 → 撞车消除。任务书自己也注明「具体结果以 `computeDocStem` 实际输入输出为准，先跑通再写死例子」，故按实测值落账。
2. **授权面遗漏两个测试文件**：任务书③只列了 `tests/abilities-folder-file.spec.ts`、`tests/fs-utils.spec.ts`、`tests/book-store.spec.ts`、`tests/gen-executor.spec.ts`，但 `tests/gen-scope.spec.ts` 与 `tests/p3-host-routes.spec.ts` 各含 **folder「目录概览」stem 断言**（`/tree` 目录节点 docRel、gen-doc 任务 docRel、骨架目录树首行、索引「目录层」条目）——不改则 test 门禁必挂，与任务书「金丝雀：所有关于目录概览 stem=目录名的断言都改掉」直接冲突。按任务书⑥「发现任务书有错先订正」，本次将这两个文件纳入改动面（PROGRESS.md 已登记）。

## 根因与修复

**根因**：folder 层（目录概览）命名只取文件夹名 `basename(abs)`，与文件层 `computeDocStem`（含完整父目录层级）不对称。任何两个 basename 相同的目录（如 `native/system/packages` vs 根下 `packages`）落在同一 docAbs → 互相覆盖。

**修复**：目录层 stem 改为与文件层同视角——新增纯函数 `folderDocStem(relP, root) = computeDocStem(relToSrcKey(relP, root))`，并把三处消费点收敛到同一个函数：

## 新旧 stem 对照表（实测，归属根 = `/home/xuepeng/DSH/deepseekHARNESS`，桶 `--home-xuepeng-DSH-deepseekHARNESS--`）

| 目录（abs） | 旧 stem（basename） | 新 stem（folderDocStem） | 新 docAbs |
|---|---|---|---|
| `.../deepseekHARNESS/native/system/packages` | `packages` | `native-system-packages` | `.../目录概览/native-system-packages.md` |
| `.../deepseekHARNESS/packages` | `packages` | `deepseekHARNESS-packages` | `.../目录概览/deepseekHARNESS-packages.md` |
| `.../deepseekHARNESS/apps/packages`（对照） | `packages` | `apps-packages` | `.../目录概览/apps-packages.md` |
| `.../deepseekHARNESS/packages/apps`（对照） | `apps` | `packages-apps` | `.../目录概览/packages-apps.md` |
| `.../DSHworkPace/packages`（跨根对照） | `packages` | `DSHworkPace-packages` | `.../--home-xuepeng-DSH-DSHworkPace--/目录概览/DSHworkPace-packages.md` |

`native/system/packages → native-system-packages`：`relToSrcKey` 先产出 `deepseekHARNESS/native/system/packages`，`computeDocStem` 去掉工作区名前缀、父目录层级用 `-` 连接 → `native-system-packages`。顶层目录（无父级）用工作区名兜底 → `deepseekHARNESS-packages`。5 个用例 5 个不同落点，**不撞车**。

## 联动点清单（命名规则一处改、处处同步）

| # | 位置 | 改动 |
|---|---|---|
| 1 | `src/host/fs-utils.ts`（新增） | `folderDocStem(relP, root)`：目录层 stem 唯一真源，注释写明与文件层 `computeDocStem` 同视角、避免同名目录撞车；`computeDocStem` 本身未动（文件层历史命名依赖它） |
| 2 | `src/host/index.ts` `/tree` 目录分支（约 597-607） | 目录节点 stem 从 `e.name`（basename）改为 `folderDocStem(relHome, home.projectRoot)`（relHome 与文件分支同口径：`normRel(nodeAbs.slice(home.projectRoot.length)) || '.'`），hasDoc/docRel 同源 |
| 3 | `src/host/abilities/folder-doc/index.ts` `docStem` | 从 `basename(target.abs)` 改为 `folderDocStem(target.relP, target.bookRoot.projectRoot)`——与 `/tree` **共用同一函数**（硬约束 2 的证据） |
| 4 | `src/host/abilities/folder-doc/skeleton.ts` `buildFolderSkeleton` | 骨架 `name`（标题）与 `renderFolderTree` 第一行改用 `basename(abs)`（真实目录名），不再用带层级的 docStem 顶替（硬约束 3） |
| 5 | `tests/abilities-folder-file.spec.ts`、`tests/fs-utils.spec.ts` | docStem 断言改为新视角 + 撞车回归用例；skeleton 断言钉「标题=真实目录名、不含层级 stem」；fs-utils 新增 `folderDocStem` 单测 |
| 6 | `tests/gen-executor.spec.ts`、`tests/gen-scope.spec.ts`、`tests/p3-host-routes.spec.ts` | 所有 folder stem 相关断言按新命名更新（TARGETS.folder.stem `src`→`proj-src`、索引与 docRel 断言、预置产物文件名、跨根 child 桶 stem 等） |

**为什么 `/tree` 与生成不再漂移**：三处（`/tree` 目录分支、`genDocRelFor`→能力 `docStem`、执行器落盘 `docStem`）现在都经由 `folderDocStem`（或能力从 BookTarget 取 `relP`/`bookRoot` 调用同一函数）。`gen-executor.ts` 的 `ability.docStem(target)` 收到的是完整 BookTarget（`relP`、`bookRoot` 就位），与 `/tree` 对同一目录算出的 stem 恒一致。

## 实测数据

- 撞车回归脚本 `/tmp/book-collision-check.mjs`（引用 `lib/host/fs-utils.js` 编译产物的 `folderDocStem`，修复后重新编译 host 产物）：**「不撞车（5 个目录，5 个不同落点）」**，exit 0。修复前基线输出「⚠ 撞车：2 个目录共用一个文档文件」。
- 四道门禁：
  - `tsc -b tsconfig.json` — PASS（exit 0）
  - `oxlint . --config .oxlintrc.json` — PASS（0 warnings, 0 errors）
  - `vitest run` — **606/606 通过**（19 files）
  - coverage — **All files 100%**（含新增 `folderDocStem` 与改动分支；`src/host/index.ts` 在既定覆盖率分母豁免清单内，其目录分支由 p3-host-routes 覆盖）
- build 未跑（不在授权内；主代理做）。`lib/host` 已用 `tsc -b tsconfig.host.json` 重新编译（仅 host face、不碰 client），以便撞车脚本引用新产物。

## 未做 / 未核实 / 遗留

1. **旧文档孤儿化（必须告知用户）**：按旧规则已生成的目录概览——典型就是 deepseekHARNESS 桶里现存那本 `目录概览/packages.md`（frontmatter「源码路径: deepseekHARNESS/native/system/packages」，是 native/system 包最后生成占位）——**不再被任何目录匹配**：`/tree` 圆点消失，文件成为书库孤儿。这次**不做迁移脚本**（主代理倾向与任务书一致）：旧文档语义本就不全（一本 `packages.md` 讲不清是哪个 packages），留在书库里不碍事；**用户可操作提示**：在 UI 里对 `native/system/packages` 与根下 `packages` 分别点「重新生成」目录概览，新文档会以 `native-system-packages.md` / `deepseekHARNESS-packages.md` 落盘并重新点亮圆点。
2. **`skills/folder-doc` 未改（不在授权面，按任务书停下报告）**：`skills/folder-doc/scripts/folder-doc.mjs` 的 `--name` 默认值（`folder-doc.mjs:160`）与 `gen-tree.sh` 仍按 basename 命名。宿主已去技能化（`hostIndex: true`，确定性逻辑全在宿主侧），技能仅供会话内人工调用——人工用技能生成的目录概览会落 basename 文件名，与宿主 `/tree` 判定（folderDocStem 视角）对不上（成孤儿）。宿主流程不受影响。**建议主代理决定**：下轮是否把技能 `--name` 默认值也切到 folderDocStem 视角。
3. **理论边界（与文件层同源，非本单引入）**：`computeDocStem` 用 `-` 扁平化层级，理论上 `a-b/c` 与 `a/b-c` 等病态目录名同 stem——这是文件层三层沿用已久的既有属性，目录层与其对称后继承同一边界；真实目录名碰撞概率极低，任务书核心关切（同名目录跨层级）已消除。未采取进一步消歧（会动 `computeDocStem`，被禁止）。
4. 未核实：`docs/p5-migration-matrix.md` 与 `docs/spec-p5-tests-detail.md` 中「folder 取 basename」的迁移对照行号（历史迁移记录，描述迁移时点快照，未改动；如需订正请主代理指示）。
5. 旧「目录概览」本身的 `index.json`「目录层」条目仍指向旧文件名——孤儿化清理不做（同 1）。

## 需主代理裁决的点

- 是否把 `skills/folder-doc` 的 `--name` 默认值也改为 folderDocStem 视角（本单按授权面未动）。
- 授权面订正确认：`tests/gen-scope.spec.ts`、`tests/p3-host-routes.spec.ts` 纳入本次改动面（否则 test 门禁必挂）。
- 旧文档（孤儿 `packages.md`）是否维持「不做迁移」口径（与任务书一致，建议不迁）。