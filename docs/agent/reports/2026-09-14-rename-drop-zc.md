# 改名收尾：全仓旧目录名后缀文本替换 + 孤儿文档盘点

> 执行者：子代理 · 2026-09-14 · 仓库：`plugins/dsh-plugin-file-system`（改名完成态）
> 任务书七段依据：目录改名（旧目录名去后缀 → 现名 `dsh-plugin-file-system`）、旧仓已归档、书库桶已删。

## 0. 开工前验证（逐条实测，全部一致）

| 验证项 | 命令 | 实测 |
|---|---|---|
| 主代理改动面 | `git -C <新路径> status --porcelain` | 仅 `M package-lock.json` / `M package.json` 两行，无其它 |
| 新仓 HEAD | `git -C <新路径> log --oneline -1` | `a5d196f fix(host): 目录概览命名改含父目录层级…` ✓ |
| 旧仓 HEAD（归档前实测） | `git -C <旧仓> log --oneline -1` | `3a3f89e fix(host): 修 6 项缺陷并补回归门禁` ✓ 工作树干净 |
| 残留基线 | grep 旧目录名后缀（排除产物） | 替换前 **94 行命中 / 40 文件** |

## 1. 替换统计

- 方式：`grep -rl` 定位 → `sed -i` 全局子串替换（旧目录名 → 原名），排除 `lib/` `client/` `node_modules/` `coverage/` `.git/`
- **文件数：40**（含主代理已改的 package.json / package-lock.json 则 git diff 为 42 文件 / 116+116 行）
- **替换点数：94 处命中行**（git diff 净变 116 行），分布：`.md`×27、`.ts`×4、`.mjs`×6、`.yml`×5、`.tsx`×0、其它（LICENSE/README/PROGRESS/preset）若干
- 关键标识符同步（非注释，属命名一致性必需）：
  - `cordis.patch.yml:10` loader 条目 `name:` 旧目录名 → 原名（与 package.json name 对齐）
  - `tsdown.config.ts:16` `const id` 旧目录名 → 原名（产物 loader 注册 id）
  - `scripts/verify-client-banner.mjs:12` `EXPECTED_NAME` → 原名（**必改**：它断言 package.json name，主代理已改名，不改则 build 自检挂）
  - `preset.yml:2` / `agent.cordis.yml:1` 描述与注释同步
- 未碰（授权之外）：`package.json`/`package-lock.json`（主代理已改，只读验证）、`~/.dsh/profiles/web/package.json`（已验证 name + `link:` 路径均已改原名）、`lib/` `client/` `node_modules/` `coverage/`

### self-review diff

- **golden check**：`grep -rn` 旧目录名后缀（排除产物目录）＝ **0 命中** ✓
- **误伤检查**：重复后缀、重复前缀等畸形串均 0 命中 ✓
- 抽查 `cordis.patch.yml` / `tsdown.config.ts` / `verify-client-banner.mjs` diff：替换点全部语义正确

## 2. 例外裁决注记：历史快照一并替换

本仓惯例为「历史时态保留」（历史台账与 `docs/agent/reports/` 等处的历史记录原文不改字）。**本次用户明确裁决：全部替换含历史快照**，故当时的历史台账与 `docs/agent/reports/*` 等归档/报告中的旧目录名后缀一律改为原名。此注记在 `PROGRESS.md` 下次主代理记账时作为例外记录的依据。

## 3. 孤儿文档盘点（只盘点，未删任何文件）

### 方法

对 `docs/` 与仓库根下每个 `.md`，全仓 grep 其文件名，按「是否被三个入口（README.md / PROGRESS.md / docs/agent/README.md）或活跃文档点名引用」判定。三入口 = README（对外）、PROGRESS（当前态真源）、docs/agent/README（子代理入场索引）。

### 判定结果

**A. 被入口点名引用 → 非孤儿（有明确读者）**
- `docs/feature-baseline.md`（README + PROGRESS 多处点名）
- `docs/baseline/{host,client,contracts}.md`（README「相关文档」三件点名）
- `docs/spec-p1-skeleton.md`（README 点名）
- `docs/spec-p5-tests-detail.md`（PROGRESS 引，T-62 销账表）
- `docs/spec-ui-revamp.md`（PROGRESS + 8 篇报告引用，活跃）
- `docs/delivery-summary-2026-09-11.md`（PROGRESS T-62 表格点名为交付摘要）
- `docs/p6-cutover-runbook.md`（PROGRESS §4 引用为切换/回滚手册）
- `docs/archive/PROGRESS-full-2026-09-11.md`（PROGRESS 顶部注明为历史台账）
- `docs/agent/{README,brief-template,lessons}.md`（agent 文档体系内部互引 + PROGRESS）

**B. 孤儿候选（无活跃入口引用，仅历史/递归引用）→ 建议归档，待主代理裁决**

| 文档 | 引用链实测 | 判定依据 | 建议 |
|---|---|---|---|
| `docs/t14-stale-refs.md` | 全仓 0 处点名引用；仅被 archive 台账提及 | 迁移期陈旧引用扫描报告；T-14 已销账（`2d68c8f`），内容并入 archive 台账行 | 移入 archive 或保留为纯归档 |
| `docs/p1c-skills-migration.md` | 读者仅 t14-stale-refs（其本身零读者） | P1-C 技能迁移核查报告；T-13 已销账（`5917319f`），结果已入 archive 台账 | 同上 |
| `docs/p2a-tsconfig-d6.md` | 读者 t14 + spec-p4-client（均零活跃读者） | D-6 核验报告；D-6/D-12 已结案入 archive 台账 | 同上 |
| `docs/spec-p2-pure-logic.md` | 读者仅 t14 + archive | P2 执行规格，迁移已完成，无现行读者 | 归档（README 仅类型化通配 `spec-*.md`，未点名） |
| `docs/spec-p3-host-routes.md` | 读者仅 t14 + archive | P3 执行规格，已完成 | 归档 |
| `docs/spec-p4-client.md` | 读者为 P2A 核验的引用方（t14），实体零读者 | P4 client 执行规格，已完成 | 归档 |
| `docs/spec-p5-p6-tests-and-cutover.md` | 读者 p6-runbook / p5-matrix / t14 / spec-p5-detail（均迁移期） | P5/P6 执行规格与切换方案，已执行完毕 | 归档 |
| `docs/p5-migration-matrix.md` | 读者 folder-doc 报告（历史参考）+ delivery-summary | P5-A 对账矩阵，迁移已完成；folder-doc 引用仅为历史参照 | 归档 |

**C. 报告归档（docs/agent/reports/，按协议保留，不视为孤儿）**

按 `docs/agent/README`：报告是「逐字归档的一手证据」，lessons.md 是索引；「最近一份」机制之外被点名引用的报告：`menu-clipping`（lessons+PROGRESS）、`stage2`（lessons）、`stage3a`（lessons）、`stage3b`（lessons）、`collapse-split-edit-merge`（lessons）、`view-picker-to-right`（lessons+PROGRESS）、`split-freeze-target`（PROGRESS）、`folder-doc-stem-collision`（PROGRESS）。
**零引用报告 6 篇**（仅在「最近一份」机制外无任何点名）：`2026-09-11-ui-revamp-menu-clipping-followup`、`2026-09-11-ui-revamp-stage1`、`2026-09-12-hide-idle-divider-line`、`2026-09-12-probe-dom-sync-and-cansave`、`2026-09-12-split-divider-compact`、`2026-09-12-tooltip-side-and-term-unify` —— 属正常审计存档，按 agent README「报告逐字归档」协议保留，不删。

**D. 内容重复维度**：无与 `docs/archive/PROGRESS-full-2026-09-11.md` 内容重复的零散记录；B 类各文档与 archive 是「指针（报告落盘 X）」关系，非内容复制。`delivery-summary` 是摘要、archive 是全量台账，两者互补。

### 改名连带发现（不在替换范围内，如实上报）

改名后，文档中「旧仓相对路径」这组引用**语义失效**：改名前它指隔壁的旧仓目录，改名后本仓自身即为 `dsh-plugin-file-system`，该相对路径变成**自指**；且旧仓已归档。当时受影响：README.md 与 PROGRESS.md 及相关迁移期文档共 **29 处**。这些不含旧目录名后缀，按任务书「只改文本替换项」不在授权面；**需主代理裁决**。另 `issues/` 目录（T-14 迁入 21 文件）不在本盘点范围，未动。

## 4. golden check 与门禁结论

```bash
# golden check（排除 lib/ client/ node_modules/ coverage/ .git/）
grep -rn 旧目录名（带后缀）                → 0 命中 ✓
grep -rEn 误伤畸形串（重复后缀等）             → 0 命中 ✓

# 门禁（node scripts/verify-stage.mjs --allow '<42 个改动文件 + 本报告>'）
守卫      → PASS（43 项全在授权面内）
typecheck → PASS（tsc -b，exit 0）
lint      → PASS（oxlint，exit 0）
test      → PASS（vitest run 19 spec，exit 0）
coverage  → PASS（100×4 + 分母守卫 19/19）
```

门禁含 `src/host/**` 改动（`index.ts`/`book-store.ts`/`fs-utils.ts` 注释 + `tsdown.config.ts` 标识符），typecheck/test 全绿，未涉行为变更。`build` 未跑（授权否决）——运行中 `client/client.js` 仍是旧产物（旧 id），下次 `npm run build` 重建后自然更新。

## 5. 未做 / 未核实

- `npm run build` 未跑（授权否决）；新 id 的 client 产物待重建
- `issues/` 目录、`~/.dsh/profiles/web/` 未动（授权之外）；profile package.json 仅只读核验
- 未对「旧仓相对路径自指」29 处做任何修改（超出本次替换授权面）
- 未删除任何文档（孤儿盘点仅出报告）

## 6. 需主代理裁决

1. **B 类 8 篇孤儿候选文档**：移入 `docs/archive/`、标为归档、或保留原位（须在 release notes 注明）——建议统一移入 archive 保留审计链
2. **旧仓相对路径自指 29 处**：改指归档后的旧仓路径 vs 历史时态保留（与本次「全部替换」裁决不同，需单独裁决）
3. 零引用报告 6 篇：按协议保留（默认建议），如需清理另行裁决
4. `PROGRESS.md` 需主代理补记本单：替换统计 + 例外裁决注记 + 孤儿建议