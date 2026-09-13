# 文档面清理：清除迁移史 / 旧仓 / 归档插件 / 技能桥接引用

> 执行者：子代理 · 2026-09-15 · 仓库：`plugins/dsh-plugin-file-system`（改名后「全新版本干净仓库」收口）
> 任务：按用户裁决把「迁移史 / 旧仓 / 归档插件 / 迁移源 / 技能桥接」类信息从文档面清除；旧目录名后缀（`-zc`）字样一律替换为现名。
> 授权面：仅删除/改写任务书列出的文档 + 创建本报告。**未改 PROGRESS.md、未改任何代码、未跑 npm / build / git commit / 重启。**

---

## 1. 删除的文件（11 项）

| 路径 | 类型 |
|---|---|
| `docs/p6-cutover-runbook.md` | 文件 |
| `docs/delivery-summary-2026-09-11.md` | 文件 |
| `docs/archive/`（含 `PROGRESS-full-2026-09-11.md`） | **整目录** |
| `docs/t14-stale-refs.md` | 文件 |
| `docs/p1c-skills-migration.md` | 文件 |
| `docs/p2a-tsconfig-d6.md` | 文件 |
| `docs/spec-p2-pure-logic.md` | 文件 |
| `docs/spec-p3-host-routes.md` | 文件 |
| `docs/spec-p4-client.md` | 文件 |
| `docs/spec-p5-p6-tests-and-cutover.md` | 文件 |
| `docs/p5-migration-matrix.md` | 文件 |

命令：`rm -rf docs/archive && rm -f <其余 10 个文件>`。未用 `git rm --cached`，未 commit。

删除后 `docs/` 保留树：

```
docs/agent/{brief-template.md, lessons.md, README.md}
docs/agent/reports/*.md（18 篇，含本报告）
docs/baseline/{client.md, contracts.md, host.md}
docs/feature-baseline.md
docs/spec-p1-skeleton.md
docs/spec-p5-tests-detail.md
docs/spec-ui-revamp.md
```

---

## 2. 保留文档的逐文件改动

### 2.1 `README.md`

| 位置 | 改动 |
|---|---|
| 「约定」章节 | **删除**「随包技能」整条（3 行：五个技能 / `agent.cordis.yml` 的 `customSkillDirs` 挂载） |
| 已知行为 G-11 | 去掉源仓对照：改为「蓝点与树节点实为**点击**打开（`onOpen` 挂在节点行与蓝点的 `onClick` 上），文档原写的『悬停可直接打开』与实际不符——按既定决策订正文档表述为『点击』」 |
| 「模型可见面」 | **删除**「随包技能」条目（技能经 `agent.cordis.yml` 注册、`skills/` 随仓分发）；只保留「生成/翻译子会话」 |
| 「实现进度」P1 行 | 「P1 骨架与装载（工程基础、三件套与占位挂载、`skills/` 迁移）」→ 去掉「`skills/` 迁移」 |
| 「相关文档」 | 通配句「`docs/spec-p1-skeleton.md` 等 `docs/spec-*.md`」→ 点名现存的三个 spec 文件；**删除**整行「迁移源（只读）：`../dsh-plugin-file-system`」 |

改动后 README 中 `-zc`、`skills/`、`agent.cordis.yml`、`preset.yml`、`技能`、`迁移源` 全部 0 命中。

### 2.2 `docs/feature-baseline.md`

| 位置 | 改动 |
|---|---|
| 标题 | 「功能基线总表 — dsh-plugin-file-system → dsh-plugin-file-system」→「功能基线总表 — dsh-plugin-file-system」（去掉箭头对照） |
| 第 2 行 | 去掉「本文是 P2–P5 的派发依据」中的派发语；第 4 行删除「· 迁移源冻结于 `3a3f89e`」 |
| §2.1 身份与装载 | **删除整列「出处」**（8 行全部是旧仓 `.js` 路径与行号）；「包名替换」注记改写为不带对照的「包名」说明，保留「槽位 id `fs`、order `12`、路由前缀 `/api/fs` 不变」这一仍有约束力的契约 |
| §2.2 行为契约 | 「命名规则三处同步」（含 `skills/*.mjs` 的 `computeName`）→ 改写为「命名规则：文档命名（docStem）由 `computeDocStem`（`src/host/fs-utils.ts`）计算」；「相对路径推导层级」由旧仓 `issues.js/prompt-loader.js/gen-executor.js` + 行号 → `issues.ts`/`prompt-loader.ts`/`gen-executor.ts`（去行号），保留「产物目录不得改成更深层级」的约束 |
| §4 G-11 | 去掉 `AGENTS.md` 旧仓文档对照，改为「『悬停可打开』在代码中无对应实现（蓝点与树节点实为点击打开）」 |
| §5 迁移映射表 | **整节删除**（含「旧仓 → 本仓」映射表、「迁移原则」段） |
| §6 → §5 | 原「未决事项」改号为 §5；第 1 项去掉「（旧插件卸载后无冲突）」括注 |

保留未动的有效基线：§1 分项索引、§2.1 表值与包名契约、§2.2 全部行为契约（路由 / 状态机 / 超时 / 上限 / 书库模型 / 四层能力 / client / i18n / 越权语义）、§3「必须改变并同步的清单」、§4 已知行为登记全表（G-1~G-12）。

### 2.3 `docs/baseline/{host,client,contracts}.md`

三份只清**头部声明栏**（任务授权口径为「引用措辞」），取证正文未动：

- `host.md`：删 `来源 ../dsh-plugin-file-system`、`迁移源 revision 3a3f89e`、`口径 行号以 3a3f89e 工作树为准`；范围句中的「未读写 `-zc` 迁移目标仓」删除，保留「未跑 build」。
- `client.md`：frontmatter 删 `来源`、`迁移源 revision`、`报告口径`。
- `contracts.md`：表头栏删 `来源`、`迁移源 revision`、`口径`。

### 2.4 `docs/spec-p1-skeleton.md`

- §3.3 包契约 `files:` 行删去 `agent.cordis.yml, preset.yml`。
- §4 P1-A「禁止」句删去「改迁移源」，保留「提交 `lib/`、`client/` 产物」。
- §4 P1-B 产出清单**删除**「`agent.cordis.yml`、`preset.yml`（按迁移源 T-03 基线搬，路径引用改新包）」整条。

### 2.5 `docs/spec-p5-tests-detail.md`

- 全文 `源仓` → `原实现`（47 处）；`zc 版/已有/现状/的` → `本仓版/已有/现状/的`（13 处）；「源测试清单」→「原测试清单」。
- 头部：删「`docs/spec-p5-p6-tests-and-cutover.md` §P5 的细化」中的文件名（→「P5 执行规格的细化」）、上游清单里的同一文件名、「迁移源冻结于 `3a3f89e`，全程只读」整行。
- 删「凡本文与 `docs/spec-p5-p6-tests-and-cutover.md` 冲突…」整句；§1.1 命令块删 `git -C . rev-parse HEAD  # 3a3f89e…`；§1.2 引文去文件名；§4.3、§5.3 依据去文件名；§5.2「迁移源 `fs-utils`」→「原实现 `fs-utils`」。
- **技能测试引用清理**：§1.3 `real-composition.test.js` 清单删「`:142` `agent.cordis.yml` 技能桥接行存在（`skill-filesystem` / `tool-skill` / `customSkillDirs→skills/`）」；§6.3 裁决表删「`:142` 技能桥接行 / 补」整行。
- 未动：工具面白名单等当前功能契约（如「工具面保留检索但不含技能/shell」），以及 `preset.yml` 元信息断言行（见 §5 遗留 3）。

### 2.6 `docs/agent/README.md`、`docs/agent/lessons.md`

实测**无需改动**：两文件对 `-zc`、`迁移源`、`旧仓`、`旧插件`、`归档的插件`、`技能`、`cordis` 均 0 命中（`lessons.md` 中的「归档」均指「报告归档」，与插件归档无关）。

### 2.7 `docs/agent/reports/2026-09-14-rename-drop-zc.md`

| 位置 | 改动 |
|---|---|
| 标题 | 「全仓 `-zc` 文本替换」→「全仓旧目录名后缀文本替换」 |
| 任务书依据行 | 「旧目录名带 `-zc` 后缀 → 现名」「旧冻结仓移入 `plugins/归档的插件/dsh-plugin-file-system`」→「旧目录名去后缀 → 现名」「旧仓已归档」 |
| 开工前验证表 | 「归档旧仓 HEAD」行 → 「旧仓 HEAD（归档前实测）」，命令改为 `git -C <旧仓>`；「grep 旧目录名 `-zc` 后缀」→「grep 旧目录名后缀」 |
| 原有注意事项 | **删除**整行「归档路径实测为 `plugins/归档的插件/…`」 |
| §2 例外裁决注记 | 去掉 `docs/archive/`、`docs/t14-stale-refs.md` 等已删路径，保留「历史快照一并替换」这一历史事实 |
| §3 改名连带发现段 | 「迁移源 `../dsh-plugin-file-system`」→「旧仓相对路径」；「旧冻结仓实际已移入 `归档的插件/`」→「旧仓已归档」；受影响清单不再逐条列出已删文档的路径与行号 |
| §4 golden check 代码块 | 「`-zc` 后缀」「`-zczc` 等」→「带后缀」「重复后缀等」 |
| §5 未做 | 「迁移源自指」→「旧仓相对路径自指」；「超出 `-zc` 替换授权面」→「超出本次替换授权面」 |
| §6 需裁决 2 | 去掉具体归档路径，改为「改指归档后的旧仓路径」 |

历史事实（94 处命中 / 40 文件、40 文件替换、门禁 PASS）全部原样保留。

---

## 3. grep 验证（实际输出）

### 3.1 禁词扫描（`README.md` + `docs/`）

命令：

```sh
grep -rn -e "迁移源" -e "源仓" -e "旧仓" -e "旧插件" -e "归档的插件" -e "归档插件" README.md docs/
```

实际输出（仅剩 5 处，全部是 `2026-09-14` 报告的**改写后合规表述**，任务书示例即为「旧仓已归档」）：

```
docs/agent/reports/2026-09-14-rename-drop-zc.md:4:> 任务书七段依据：目录改名（旧目录名去后缀 → 现名 `dsh-plugin-file-system`）、旧仓已归档、书库桶已删。
docs/agent/reports/2026-09-14-rename-drop-zc.md:12:| 旧仓 HEAD（归档前实测） | `git -C <旧仓> log --oneline -1` | `3a3f89e fix(host): 修 6 项缺陷并补回归门禁` ✓ 工作树干净 |
docs/agent/reports/2026-09-14-rename-drop-zc.md:78:改名后，文档中「旧仓相对路径」这组引用**语义失效**：…且旧仓已归档。…
docs/agent/reports/2026-09-14-rename-drop-zc.md:101:- 未对「旧仓相对路径自指」29 处做任何修改（超出本次替换授权面）
docs/agent/reports/2026-09-14-rename-drop-zc.md:107:2. **旧仓相对路径自指 29 处**：改指归档后的旧仓路径 vs 历史时态保留（…）
```

`迁移源`、`源仓`、`旧插件`、`归档的插件` **0 命中**。

### 3.2 `-zc` 扫描

```sh
grep -rn -- "-zc" README.md docs/
```

→ **0 命中**（空输出）✓

### 3.3 归档路径扫描

```sh
grep -rn "归档的插件\|归档路径\|plugins/归档" README.md docs/
```

→ **0 命中**（空输出）✓

---

## 4. 破链检查（对被删文档的引用）

检查面：全仓 `*.md`（README / PROGRESS / docs / src / tests / tools）对被删 10 个文件名与 `docs/archive` 的引用。

- **Markdown 真链接形式**（`](…p6-cutover… )` 等）：

```sh
grep -rn "](.\{0,40\}\(p6-cutover\|delivery-summary\|t14-stale\|p1c-skills\|p2a-tsconfig\|spec-p2\|spec-p3\|spec-p4\|spec-p5-p6\|p5-migration\|archive\)" README.md PROGRESS.md docs/
```

→ **0 命中**（exit 1）✓ 零破链。

- **三个活入口（README.md / PROGRESS.md / docs/agent/README.md）**：均已无对已删文档的点名引用。`PROGRESS.md`（主代理并行修改中）实测已不含 `p6-cutover-runbook` / `delivery-summary` / `t14-stale` / `p5-migration-matrix` / `spec-p2-pure-logic`；README「相关文档」已改为点名现存三份 spec；`docs/agent/README.md` 无相关引用。
- **反引号（非链接）引用**：仅剩两处历史报告内的文件名指称，不构成渲染破链，但指向的文件已不存在：

```
docs/agent/reports/2026-09-14-rename-drop-zc.md:51-67,106  （§3 孤儿盘点表，历史盘点快照）
docs/agent/reports/2026-09-13-folder-doc-stem-collision.md:57  （「未核实」条目引 docs/p5-migration-matrix.md）
```

详见 §5 遗留 1、2。

---

## 5. 遗留问题（超出本次授权面，需主代理裁决）

1. **`docs/agent/reports/2026-09-13-folder-doc-stem-collision.md:57`** 引用已删除的 `docs/p5-migration-matrix.md`（反引号文字引用，非链接）。该文件不在本次改写清单内，我未动。若要求零残留引用，需授权单点改写该行。
2. **`2026-09-14-rename-drop-zc.md` §3 孤儿盘点表**仍逐条列出 8 篇现已删除的文档名，并建议「移入 `docs/archive/`」（该目录已删）。任务要求「历史事实可保留」，故我按最小改动保留；如需加一行「后续裁决：已删除」注记，请指示。
3. **`preset.yml` 相关引用未清**：`docs/spec-p5-tests-detail.md` 仍保留 `:150 preset.yml 元信息` 断言行；`docs/feature-baseline.md` §5 第 3 项仍含 `preset.yml`。任务书称该文件已删，但**实测 `preset.yml` 与 `agent.cordis.yml` 仍在磁盘上**（`ls` 实测存在、git 状态为 `M`），`skills/` 五个目录也仍在。故我未扩面清理，以免文档与实况相反。
4. **README 中仍有多处「上一版 / 重写版」旧插件对照**（不在任务清单点名范围，我未改）：第 7 行「本仓是 `dsh-plugin-file-system` 的主仓模式重写版」（改名后为自指）、第 11 行与第 73 行「相对上一版唯一的有意差异」、第 75 行表头「上一版行为」、第 86 行「与上一版行为等价」、第 90 行「从上一版逐字保留」、第 105 行「与源逐字保留 / 本次迁移决定不修」、第 154 行「迁移进度与决策记录」。这些是「旧插件对照」语义，但与「文档仍描述当前功能」交织（安全加固叙事），需单独裁决改写口径。
5. **`feature-baseline.md` §3「必须改变并同步的清单」与 §4 G-1/G-2~G-12 的「位置」列**仍是旧仓 `.js` 路径与行号（如 `src/host/index.js:258-262`、`registry.js:17`），以及 §4 的「源行为 / 迁移版」「迁移决策」「D-8 例外」措辞。任务只点名 §2.1/§2.2/§5，我未动这些取证列；若要彻底去迁移史，需授权（会牺牲部分取证可追溯性）。
6. **`docs/baseline/*.md` 正文**通篇以旧仓 `.js` 文件行号取证（host.md 141 行的「代码位置」列等），只清了头部声明栏。彻底清理等于重做三份基线，需裁决。
7. **被删文档的连带损失**：`docs/archive/PROGRESS-full-2026-09-11.md`（337 行全量台账）、`delivery-summary-2026-09-11.md` 与 `p6-cutover-runbook.md` 为迁移史的**唯一全量记录**，删除后不可在本仓内复原（除非从 git 历史取回）。除 `2026-09-14-rename-drop-zc.md` 的历史盘点表外，本仓已无它们的替代索引。

---

## 6. 未做（授权否决项）

- 未改 `PROGRESS.md`（主代理自行修改；实测其中对本批文档的引用已被清理）
- 未改任何代码或配置：`src/`、`tests/`、`package.json`、`cordis.patch.yml`、`skills/`、`issues/`、`agent.cordis.yml`、`preset.yml`
- 未跑 `npm` / 构建 / `git commit` / `git rm --cached` / 重启
- 未创建除本报告外的任何文件
