# P6 切换上线手册 — dsh-plugin-file-system → dsh-plugin-file-system-zc

> **文档性质**：可直接照着执行的切换手册（runbook）。
> **制定**：2026-09-11 · **产出方式**：只读调研（未执行任何改状态的命令，未修改本仓除本文件外的任何内容，未修改 `~/.dsh/profiles/**`）。
> **上游规格**：`docs/spec-p5-p6-tests-and-cutover.md` §P6、`PROGRESS.md` §1（T-60/T-61/T-62）、`AGENTS.md` §6。
> **命令标注约定**：
> - `[只读]` = 不修改任何文件/进程状态
> - `[改环境]` = 会修改 `~/.dsh/**` 或用户运行中的进程
> - `[需重启]` = 该改动只有重启 dsh web 后才生效
>
> **本手册所有 `dsh` 命令均来自主仓源码或本机 `--help` 输出，逐条出处见 §7。**

---

## 0. 前置门禁（**当前不满足，勿执行切换**）

> ⚠ **2026-09-11 实测结论：现在切换会丢失全部功能。**
> `-zc` 仓当下的构建产物仍是 **P1 骨架**，不是功能等价实现：
> - `lib/index.js` 共 **37 行**，只有 `export const name = 'fs'` + `/api/fs/__ping` 占位路由（其余 404）；
> - `client/client.js` 渲染的是占位文本「文件系统（占位）」，不是真实页签面板。
>
> 证据：`wc -l lib/index.js` → 37；`cat client/client.js` 第 36 行 `return "文件系统（占位）";`。
> **切换前必须确认 P3（host 路由）/ P4（client）/ P5（测试）已完成并销账。**

| # | 门禁 | 核验命令 | 通过标准 |
|---|---|---|---|
| G1 | `-zc` 四门禁全绿 | 在 `-zc` 仓：`npm run typecheck && npm run lint && npm test && npm run test:coverage` | 全部 exit 0；覆盖率 per-file 100%（含分支） |
| G2 | **产物已构建且入库外存在** | `ls -l lib/index.js client/client.js` | 两文件存在且**不是**占位实现（`lib/index.js` 行数应为数百行量级） |
| G3 | 产物 banner 契约 | `node scripts/verify-client-banner.mjs` | 输出 `client banner ok: client/client.js ...`；exit 0 |
| G4 | `dsh.bundle.patch` 声明存在 | `grep -n -A3 '"bundle"' package.json` | 含 `"patch": "./cordis.patch.yml"` |
| G5 | 功能基线逐条核对 | 对照 `docs/feature-baseline.md` §2「必须逐字保留」 | 无差异（有差异需先记账） |

**为什么 G2 是硬门禁**：`lib/` 与 `client/` 在 `-zc/.gitignore` 第 2、3 行（`lib/`、`/client/`），**不入库**（决策 D-7，实测 `git ls-files lib client` 输出为空）。而 `dsh plugin add` 转发给 pnpm，`link:` 协议只建软链、**不会触发被链包的 `prepare` 构建脚本**（pnpm 10 对 local link 依赖不跑 prepare）。所以「先 build 再 add」不可颠倒。

---

## 1. 现状勘查（全部为只读实测）

### 1.1 `~/.dsh/profiles/web/` 目录结构

命令 `[只读]`：

```bash
ls -la ~/.dsh/profiles/web/
```

实测输出（节选）：

```
-rw-rw-r-- 1 xuepeng xuepeng 6928 Sep 11 01:59 cordis.patch.yml
-rw-rw-r-- 1 xuepeng xuepeng  223 Sep 11 02:13 cordis.yml
drwxrwxr-x 9 xuepeng xuepeng 4096 Sep 10 13:52 node_modules
-rw-rw-r-- 1 xuepeng xuepeng 1408 Sep 10 01:05 package.json
-rw-rw-r-- 1 xuepeng xuepeng 3707 Sep 10 01:05 pnpm-lock.yaml
-rw-rw-r-- 1 xuepeng xuepeng  140 Aug 18 23:33 pnpm-workspace.yaml
drwxrwxr-x 3 xuepeng xuepeng 4096 Aug 29 02:09 .dsh-module-fallback
# 另有 12 个历史 *.bak-* 文件（人工改动前的副本，勿当作权威）
```

四个文件的角色：

| 文件 | 角色 | 出处 |
|---|---|---|
| `cordis.yml` | **空 entry 列表** `[]`，是「被 patch 的根」；内容注释明说 *"Edit cordis.patch.yml, not this file"* | 实测 `cat cordis.yml`；主仓 `apps/cli/src/profile-boot.ts:81-86` 的 `PROFILE_ROOT_CONFIG` 常量与之逐字相同 |
| `npm package.json` | profile 清单：`dependencies`（树外包） + `dsh.profile.bundles`（**有序的 bundle 层列表**） | 主仓 `packages/boot/app-boot/src/profile.ts:4-13` 模块头注释 |
| `cordis.patch.yml` | **用户层** patch，在**所有** bundle 层之后应用 | 同上；`packages/boot/app-boot/src/profile.ts:31` |
| `pnpm-workspace.yaml` | `packages: ['.']`、`nodeLinker: hoisted`、`autoInstallPeers: false` | 实测 `cat pnpm-workspace.yaml` |

### 1.2 旧插件是**怎么被装进来的**：`link:` 依赖 + `bundles` 数组，两处缺一不可

**证据 1 — profile `package.json` 第 9 行（dependencies）** `[只读]`：

```bash
grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json
```
实测：
```
9:    "dsh-plugin-file-system": "link:/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system",
29:        "dsh-plugin-file-system",
```
即：**不是**从 npm 安装、**不是**软链到别处的副本，而是把本仓工作目录**直接以 `link:` 协议引用**；同时在第 29 行把包名登记进 `dsh.profile.bundles`。

**证据 2 — 链接实际落盘位置（pnpm 物化）** `[只读]`：

```bash
ls -la ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system
readlink -f ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system
```
实测：
```
lrwxrwxrwx ... dsh-plugin-file-system -> ../../../../DSH/DSHworkPace/plugins/dsh-plugin-file-system
/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system
```
（该 `node_modules` 下 11 个自研插件全是同形态软链；`dsh-plugin-hub`、`dsh-dream-skin`、`yaml`、`zod` 是真实目录 —— 分别来自 npm 安装。）

**证据 3 — 该仓库声明了自己是 bundle**：旧插件 `package.json` 的 `dsh.bundle.patch` 指向 `./cordis.patch.yml`，该文件内容为 `- insert: [{ id: fs, name: dsh-plugin-file-system }]`。

**结论**：旧插件的装载 = **`dependencies` 里的 `link:` 依赖**（供模块解析）**+ `dsh.profile.bundles` 里的一行**（供层拼装）**+ 该包 `dsh.bundle.patch` 指向的 patch 文件**（提供 `id: fs` 这一行）。

### 1.3 装载链路：`dsh.bundle.patch` 起什么作用

主仓 `packages/boot/app-boot/src/profile.ts:8-13`（模块头）逐字：

> Bundles are npm packages whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the tree is composed by applying each bundle's patch list in `dsh.profile.bundles` order over an empty entry list, then the profile's own patches, then any launcher layers.

对应实现 `loadProfileDirectory()`（`packages/boot/app-boot/src/profile.ts:774-804`）：

1. 读 profile 的 `package.json`，取 `dsh.profile.bundles`（数组顺序 = 层顺序）；
2. 对每个包名，用 `resolveBundleDir()` 解析出包目录 —— **解析锚点顺序**：先 `dsh` 安装目录，再 `profileDir/package.json`（`profile.ts:751-762`）；解析失败直接**抛错**，错误文案含 `run 'dsh plugin --profile web install' if its dependency is not installed`；
3. 读该包 `package.json` 的 `dsh.bundle.patch`，拼出 `patchPath = join(packageDir, declared)`；**若包未声明 `dsh.bundle` → 抛错**（`profile.ts:793-795`，文案 `declares no dsh.bundle in its package.json`）；
4. 所有层扁平化后**一次** `applyEntryPatches`，再叠加 profile 用户层与 `--patch`（`apps/cli/src/profile-boot.ts:205-213` 的 `allPatches()`）。

**所以**：`dsh.bundle.patch` 就是把「一个 npm 包」变成「profile 里一层组合」的那根接口线。它决定了**包名 → 目录 → patch 文件 → 行**的四段映射。

**patch 语义**（`vendor/include/src/index.ts:56-106`）：`- insert: [...]` 无 `id` 时是**顶层追加**（`data.push(...insert)`）；有 `id` 时要求目标行是 `group`，否则 warn 并跳过。本插件用的正是无 `id` 的顶层追加形态。

### 1.4 「装进来」的两条路径（本手册的核心区分）

| | **路径 A：`dsh plugin add`**（推荐） | **路径 B：直接改 profile 组合文件** |
|---|---|---|
| 机制 | `dsh plugin --profile web add <path>` 把参数**原样转发给 pnpm**（`apps/cli/src/plugin.ts:120-163`，`spawnSync('pnpm', args, {cwd: profileDir})`），成功后调用 `reconcilePlugins()`（`plugin.ts:59-91`）**自动对齐 `dsh.profile.bundles`**：解析得到的新依赖若声明了 `dsh.bundle` → **追加到 bundles 末尾**；已从 dependencies 移除的包 → 从 bundles 剔除 | 手工编辑 `~/.dsh/profiles/web/package.json` 的 `dependencies` + `dsh.profile.bundles`，再手工解决模块解析 |
| 模块解析 | pnpm 自动在 `web/node_modules/` 建软链 | **必须补做**：手工建软链，或跑 `dsh plugin --profile web install`（转发 `pnpm install`，同样会 reconcile） |
| 风险 | 低（官方链路） | 中（漏建链接 → boot 期 `cannot resolve profile bundle` 硬失败） |
| 校验 | 事后 `--dump-config` 验层 | 同左 |

**`reconcilePlugins` 的两个细节**（务必知情）：
- 新条目是 **`plugins.push(...)` 追加到末尾**，不保留旧行的位置（`plugin.ts:67-69`）；
- 剔除只对「曾是 dependency」的条目生效，模板自带 bundle（`@deepseek-ai/dsh-base` 等）永不受影响（`plugin.ts:78-87`）。

**bundles 顺序是否要紧**：本插件各层 patch 都是 `insert` 追加、彼此不按 id 互相覆盖，故**追加到末尾不改变最终组合**（§2.5 有核对命令）。若要求层顺序严格保持原位，用路径 B 手工调整数组位置。

### 1.5 客户端装载链路（换了包名必须连带核实的部分）

客户端插件的**枚举来源就是组合后的 entry 列表**，不是静态清单：`packages/client/modules/src/index.ts:747-776` 对每一行 loader entry 解析其包 manifest，只有 `dsh.client.platform === 'web'` 才登记为客户端模块；`clientPath` 取 `exports["./client"]`（`index.ts:209-219`）。模块表的**键与 entry.id 都是包的 `name` 字段**（`index.ts:967` 附近 `this.table.set(packageName, { entry: graphRow(packageName, ...) })`），请求路径即 `/plugins/<包名>/client.js`。

banner 是**字节契约**：客户端产物首行必须是
```js
window.__ModuleLoader__.load({ id: "<package.json 的 name>", factory: (require) => {
```
（`-zc/scripts/normalize-client-banner.mjs:12-14` 与 `verify-client-banner.mjs:20` 的断言；生成期由 `npm run build` 的第三步保证。）

实测两者当前一致：
- 旧：`head -1 dsh/client.js` → `window.__ModuleLoader__.load({ id: "dsh-plugin-file-system", factory: (require) => {`
- 新：`head -1 client/client.js` → `window.__ModuleLoader__.load({ id: "dsh-plugin-file-system-zc", factory: (require) => {`

**客户端 boot 是 fail-loud 的**：`packages/client/web/src/boot.ts:137-157` 会遍历所有 entry，只要有一个 `fiber.state` 非 `active` 就抛出 `web boot: N entries did not activate`（含 `import failed` / `pending (waiting for service: ...)`）。因此**客户端加载失败 = 整个 GUI 起不来**，不会静默降级 —— 这反而是好的失败信号（看浏览器 console 与 `~/.dsh/logs/web.log`）。

### 1.6 对照参照：主仓的 `cordis` agent 预设（不照抄）

主仓 `packages/preset/agent-presets/presets/cordis/agent.cordis.yml` 与 `standard`/`ptc`/`minimal` 并列，是**部署随包分发**的预设（位于 `<checkout>/packages/preset/agent-presets/presets/`）。其技能挂载段（同文件 254-265 行）：

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"
- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
```

`-zc/agent.cordis.yml:19-26` 正是照此形态桥接（**同一目录双身份**：`cordis.patch.yml` = bundle 层，`agent.cordis.yml` = agent 预设层）。**注意**：agent 预设身份与 P6 的 profile bundle 身份是两条独立链路，切换 profile 不涉及预设名册；`~/.dsh/.agent-presets/` 当前只有 `lian-lian` / `liangshen` / `xin-ren-lei` 与两个 `robot.*`，不含本插件 —— 预设层由 DSH 的 preset 机制独立发现，**不是** P6 的验收项。

### 1.7 与既有规格的一致性核对

| 既有规格条目 | 本手册对应 | 一致性 |
|---|---|---|
| `spec-p5-p6 §P6-2` 的四步（记现状 → remove 旧 → add 新 → `--dump-config` 验层） | §2.1–§2.4 | **一致**，本手册补齐了备份方法与验层预期输出 |
| 该规格 `cp ~/.dsh/profiles/web/package.json /tmp/web-profile-backup.json` | §2.0 加固为**整目录备份** | **修正**：只备份 `package.json` 不足以回滚 `node_modules` 链接与 `pnpm-lock.yaml` |
| `PROGRESS.md` T-60「先备份 + `--dump-config` 验层」 | §2.0、§2.4 | 一致 |
| `PROGRESS.md` T-61「重启 + 人工冒烟 4 项（需用户在座）」 | §3、§4 | 一致 |
| `PROGRESS.md` §6 冒烟第 2 项「悬停可打开」 | §4 第 2 项按 `spec §P6-4` 的 G-11 修正 | **修正**（见 §4） |

---

## 2. 切换步骤

### 2.0 备份（**先做，且是全流程唯一的无条件动作**）

```bash
# [只读] 记录现状（留证据）
ls -la ~/.dsh/profiles/web/
grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json
readlink -f ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system
```

```bash
# [改环境] 整目录备份（含 node_modules 软链、lock、以及所有 .bak-*）
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/.dsh/backups
cp -a ~/.dsh/profiles/web ~/.dsh/backups/web-profile-before-zc-$TS
echo "$TS" > /tmp/p6-cutover-ts      # 记下时间戳，回滚时要用
```
- 备份落在 `~/.dsh/backups/web-profile-before-zc-<TS>/`（该父目录已存在，实测含历史 `cordis.patch.yml.bak.*`，属既有约定位置）。
- **不要**只备份 `package.json`：回滚还要 `pnpm-lock.yaml`、`node_modules/dsh-plugin-file-system` 软链、`.modules.yaml`。
- 校验备份可用：`ls -la ~/.dsh/backups/web-profile-before-zc-$TS/ | head`，应含 `node_modules` 与 `package.json`。

### 2.1 移除旧插件

```bash
# [改环境][需重启] 从 web profile 卸载旧插件
dsh plugin --profile web remove dsh-plugin-file-system
```
- pnpm 会改写 `package.json` 的 `dependencies` 并重排 `node_modules`；
- 随后 `reconcilePlugins()`（`plugin.ts:78-87`）把 `dsh-plugin-file-system` 从 `dsh.profile.bundles` 中**自动剔除**；
- **事后核验**（`[只读]`）：
  ```bash
  grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json
  ```
  预期：**无任何输出**（dependencies 与 bundles 两处都已消失）。若仍有残留 → 见 §6-R3。
- ⚠ **不要**在此处重启：此时 profile 里已无 fs 插件（中间态功能缺失），必须与 §2.2 连续完成后再重启。

### 2.2 装入新插件

```bash
# [改环境][需重启] 安装新插件（绝对路径；pnpm 会写成 link: 形态）
dsh plugin --profile web add /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc
```
- 前置：§0 的 G2（`lib/`、`client/` 已 build）必须已满足 —— `link:` 不会触发被链包的构建；
- pnpm 行为提示：`dsh plugin` 会把**相对路径**锚定到你的当前目录，绝对路径原样透传（`plugin.ts:104-112`）；本命令用绝对路径，不受此影响；
- 若失败且参数含 `git+`/`github:` 才会打印构建白名单提示（`plugin.ts:155-160`），本路径不涉及；
- 完成后 `reconcilePlugins()` 把 `dsh-plugin-file-system-zc` **追加**进 `dsh.profile.bundles`。

**事后核验**（`[只读]`）：
```bash
grep -n "dsh-plugin-file-system-zc" ~/.dsh/profiles/web/package.json
ls -la ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system-zc
readlink -f ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system-zc
```
预期：dependencies 一行（`link:/home/.../dsh-plugin-file-system-zc`）、bundles 一行、`node_modules` 下一条指向该目录的软链。**缺软链 = 后面 boot 必失败**（`resolveBundleDir` 抛 `cannot resolve profile bundle`）。

### 2.3 验层（`--dump-config`）

命令核实：`dsh --profile <name> --dump-config` 存在且语义为「compose 组合并打印后退出」，出处 = 本机 `dsh --help` 输出第 12 行（`--dump-config  print the composed profile tree and exit`）与 `apps/cli/src/args.ts:148`、`apps/cli/src/dump-config.ts:31-58`。

```bash
# [改环境]（见下方警告）[不启动] 打印生效组合
dsh --profile web --dump-config | grep -n -B1 -A1 -- '^- id: fs$'
```

**预期看到**（切换后）：
```
569:# == dsh-plugin-file-system-zc
570:- id: fs
571:  name: dsh-plugin-file-system-zc
```
（`# == <层标签>` 是 dump 的溯源注释：该行由哪个 bundle 层贡献、又被哪些层改过 —— `packages/boot/app-boot/src/index.ts:400-412` 注释段。）

**切换前的基线**（本手册实测所得，可用于对照）：dump 全文 593 行，旧插件的行位于第 **569–571** 行，内容为 `# == dsh-plugin-file-system` / `- id: fs` / `name: dsh-plugin-file-system`。

> ⚠ **`--dump-config` 不是 100% 只读**：它经由 `runDumpConfig → prepareProfile`，后者会 `writeFileSync(profile.dir/cordis.yml, PROFILE_ROOT_CONFIG)`（`apps/cli/src/profile-boot.ts:187-192`）。写入内容恒定为那段空 entry 列表，**幂等**，但会刷新 `cordis.yml` 的 mtime。可接受，仅需知情。

**看不到预期时怎么排查**（按列表顺序）：

| 现象 | 含义 | 处置 |
|---|---|---|
| grep 完全无输出 | 新行没进组合 | `grep -n dsh-plugin-file-system-zc ~/.dsh/profiles/web/package.json` — 若 bundles 里没有，说明 add 未成功或包未声明 `dsh.bundle` |
| 报 `cannot resolve profile bundle "dsh-plugin-file-system-zc"` | `node_modules` 里没有链接 | `dsh plugin --profile web install` 重建链接（`profile.ts:758-761` 的官方提示） |
| 报 `... declares no dsh.bundle in its package.json` | 包清单缺 `dsh.bundle.patch` | 检查 `-zc/package.json` 的 `dsh.bundle` 段（`profile.ts:793-795`） |
| 报 `profile manifest ... dsh.profile.patchReload must be "live" or "startup"` | profile 的 `patchReload` 字段被写坏 | 删掉该字段（缺省 `'live'`，`profile.ts:142`） |
| 出现 **两行** `- id: fs` | 新旧都在组合里 | 见 §6-R1，立即回滚 |
| `patch insert: entry ... not found` 警告 | patch 写成了带 `id` 的 insert 且目标不是 group | 本插件 patch 应为无 `id` 的顶层 `- insert:`（`vendor/include/src/index.ts:78-94`） |
| 整体报错 `does not exist; create it with ...` | profile 目录不存在 | 本机不会发生（web profile 已存在） |

### 2.4 用户层不会被波及（可选确认）

```bash
# [只读] 用户层（cordis.patch.yml）里没有 fs 相关行，切换不涉及它
grep -n "id: fs" ~/.dsh/profiles/web/cordis.patch.yml ; echo "exit=$?"
```
预期 `exit=1`（无匹配）。该文件里只有 `kb-search`、`system-prompt-zh`、`connection`、`webserver`、`system-prompt` 与一批 `dsh-plugin-hub` 托管的 `disabled: true` 行。

### 2.5 层顺序核对（可选）

```bash
# [只读] 看 bundles 顺序（新插件应出现在末尾，而非旧行的位置）
grep -n -A20 '"bundles"' ~/.dsh/profiles/web/package.json
```
如无特殊要求可不调整。理由：本插件 patch 只做顶层 insert，层顺序不影响最终行集合（§1.3、§1.4）。若必须保原位，用编辑器把 `dsh-plugin-file-system-zc` 那行移回原第 29 行位置（`dsh-session-preamble` 与 `dsh-self-update` 之间）——这是**纯顺序调整，仍需重启才生效**。

---

## 3. 重启（**时序警告：本轮最后一个动作**）

### 3.1 为什么必须是最后一个动作

重启脚本会 `kill -TERM` 掉正在运行的 dsh web 进程（`scripts/dsh-restart:225-247`）；而**承载当前对话的 host 进程就是它**。因此：
- **正在进行的对话轮次会被中断**（工具调用中途被杀、本轮回复不会正常收尾）；
- 会话与任务持久化在磁盘（`~/.dsh/sessions/**`、`~/.dsh/storages/**`），重启后 GUI 会话原样恢复，但**本轮的收尾动作不能再安排**；
- 恢复靠脚本自动投递的唤醒消息：端口就绪后，脚本用新进程 token URL 换 `dsh-auth-*` cookie，`POST /api/session/prompt`（`mode: queue`）向 `$DSH_SESSION_ID` 投递「DSH Web 已重启完毕（新 PID …，端口 3080 就绪）。请继续未完成的工作。」（`scripts/dsh-restart:120-183, 296-299`）；
- **本会话的活动 goal 会转为未激活**，恢复后需显式 `resume`（`docs/spec-p5-p6-tests-and-cutover.md:100`）。

### 3.2 实际行为（以脚本源码为准，勿凭记忆）

| 阶段 | 实测行为 | 出处 |
|---|---|---|
| 脱离 | 若自身不在 `dsh-restart-*` unit 内，先用 `systemd-run --user --unit=dsh-restart-<ts>-<pid> --collect` 重新拉起自己（并透传 `DSH_SESSION_ID`）；`setsid` 不足以脱离，因为 agent 会话的工具进程位于 `dsh-subprocess-<webPid>-*.scope`，web 一死即被连坐 | `scripts/dsh-restart:185-222` |
| 找进程 | 先 `~/.dsh/logs/web.pid` → 再按 3080 端口 → 再按 `pgrep -f "$DSH_BIN web"` | `:71-90` |
| 停止 | `kill -TERM`，最多等 **8s**（`STOP_GRACE`）；超时 `kill -KILL` 兜底并清 pid 文件 | `:224-247` |
| 启动 | `systemd-run --user --unit=dsh-web-<ts>-<pid> --collect --property=StandardOutput=append:<web.log> ... "$DSH_BIN" web --no-open`，**工作目录 = `/home/xuepeng/DSH/DSHworkPace`**；`systemd-run` 不可用时回退 `nohup` | `:251-285` |
| 就绪 | 轮询 `http://127.0.0.1:3080`，上限 **180s**（`START_TIMEOUT`） | `:292-311` |
| 唤醒 | token URL 从 `web.log` 的「启动偏移之后」增量读取，最多等 **60s**（`TOKEN_WAIT`），校验拿到 `dsh-auth-*` 才算成功；失败只记日志，不影响重启成败 | `:97-118, 120-183` |
| 选项 | `-b/--browser`、`--no-wait`（同时跳过唤醒）、`--notify-session <id>`、`--no-notify` | `:37-58` |

`~/.local/bin/dsh-restart` 是该脚本的软链（实测 `readlink` → `.../dsh-self-update/skills/restart-dsh/scripts/dsh-restart`）。

### 3.3 重启命令

```bash
# [改环境][本轮最后动作] 必须脱离当前受管 scope；显式传 DSH_SESSION_ID 才能唤醒本对话
systemd-run --user --unit=dsh-restart-$(date +%s) --collect \
  --setenv=DSH_SESSION_ID="$DSH_SESSION_ID" ~/.local/bin/dsh-restart
```
- 该命令**立即返回**，web 在数秒后真正重启；本轮的收尾语应告知用户「对话会短暂挂起，就绪后脚本会自动投递续接消息」；
- **禁止**：前台直跑 `~/.local/bin/dsh-restart`（会拖死本轮 turn）、`kill -9`、`pkill`、`systemctl` 操作（`SKILL.md` §注意事项）；
- 执行后**不得**再追加本轮的 bash 操作（哪怕后台化），避免与重启竞态。

### 3.4 恢复后第一轮的验证命令

```bash
# [只读] 新进程与端口
ps aux | grep "dsh web" | grep -v grep | head -2
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://127.0.0.1:3080/   # 401 = 就绪（需认证）
# [只读] 唤醒消息是否投递
grep -o "\[dsh-restart\] .*" ~/.dsh/logs/web.log | tail -3
# [只读] 插件是否真的进了启动清单（可选强证据）
grep -c "dsh-plugin-file-system-zc" ~/.dsh/logs/web.log
```

---

## 4. 人工冒烟清单（重启后，浏览器逐项过）

> 抄自 `PROGRESS.md` §6 与 `docs/spec-p5-p6-tests-and-cutover.md` §P6-4，逐项补「操作 / 通过标准 / 失败先查什么」。
> **必须由用户在座操作**（T-61）。

| # | 项 | 怎么操作 | 看到什么算通过 | 失败时先查什么 |
|---|---|---|---|---|
| 1 | 「文件」页签开/关切换 | 在对话页签行点「文件系统」页签，再点关闭；重复一次 | 页签出现/消失正常，不报错、不残留空白面板 | 页签根本没出现 → 看浏览器 console 是否有 `web boot: N entries did not activate`（`packages/client/web/src/boot.ts:137-157`）；再确认 `client/client.js` 的 banner id 是否等于 `dsh-plugin-file-system-zc` |
| 2 | 文件树展开/折叠；**书库文档节点带蓝点** | 展开左侧目录树若干层；找到书库文档节点确认蓝点标记 | 懒加载逐层展开正常、中文排序正常、文档节点有蓝点 | 树空白 → `/api/fs/tree` 404/500，看 host 侧 `/api/fs` 前缀是否注册成功（web.log）；蓝点缺失 → 书库索引 `$DSH_HOME/books/<projectKey>/index.json` 是否可读。**注**：`AGENTS.md` §6 原文写「悬停可打开」，但据 `spec §P6-4` 的 T-02 实测（G-11）**代码中无此实现**，**以实际行为为准**，不把「悬停可打开」当验收项 |
| 3 | 「源码」页签编辑保存 | 打开任一源码文件 → 改一个字符 → 观察标签 → 点保存 | 出现「● 未保存」提示；保存后提示消失且文件落盘（`git diff` 可见改动） | 提示不出现 → 前端状态位；保存 400/500 → 看 `/api/fs/write` 的响应体与 web.log（路径越权统一映射 400） |
| 4 | 「生成解读」L1/L2/L3 与「翻译」 | 对某目录点「生成解读」走 L1，对某文件走 L2/L3；对某 md 点「翻译」 | 按钮出现；任务进入轮询并**能收尾**（不无限等待，5 分钟上限）；产物可在书库读到 | 任务不收尾 → `/api/fs/gen-status` 轮询是否卡住；400 立即失败 → 生成入口预检（目标不存在时直接 400）；产物为空 → 看子会话是否以 `ptc` 预设正常起（`FS_GEN_PRESET` 可临时覆盖为 `standard`） |

**额外（非 4 项之内、但切换特有）**：确认页面上**只有一份**「文件系统」页签 —— 若出现两个同名页签，说明新旧插件同时被装载（§6-R1）。

---

## 5. 回滚

任一项冒烟不通，按优先级选一条。**旧插件仓库全程未被改动**，回滚无副作用（`spec §P6-5`）。

### 5.1 一键回滚（推荐，走备份）

```bash
# [改环境] 用整目录备份覆盖回去
TS=$(cat /tmp/p6-cutover-ts)
rm -rf ~/.dsh/profiles/web
cp -a ~/.dsh/backups/web-profile-before-zc-$TS ~/.dsh/profiles/web
# [只读] 确认旧行回来了
grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json
readlink -f ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system
```
随后按 §3.3 **重启**（`[改环境][本轮最后动作]`），再按 §4 复验旧插件。

### 5.2 命令回滚（不用备份）

```bash
# [改环境][需重启]
dsh plugin --profile web remove dsh-plugin-file-system-zc
dsh plugin --profile web add /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system
```
注意：这样会把旧包**追加到 bundles 末尾**（位置与原来不同），并且 `pnpm-lock.yaml` 与备份不完全一致；功能上等价（§1.4 理由）。

### 5.3 只回滚一层（诊断用，若怀疑是组合而非包）

```bash
# [只读] 只打印 bundle 层（跳过用户层与 --patch），可用于判断是不是用户层 patch 造成的
dsh --profile web --dump-default-config | grep -n -B1 -A1 -- '^- id: fs$'
```

### 5.4 回滚后确认

- `~/.dsh/logs/web.log` 里出现新的 `启动命令:` 行与 `已向会话 … 投递唤醒消息`；
- §4 第 1 项通过（页签回归）；
- 若仍异常，说明问题不在本次切换 —— 从 §6 的排查线索入手。

---

## 6. 风险登记

| # | 风险 | 成因 | 提前发现手段 |
|---|---|---|---|
| **R1** | **新旧插件同时在组合里**（两行 `id: fs`） | `dsh plugin add` 后忘记 remove 旧行；或手工编辑时只加不删。include 的 `insert` 是 `data.push(...insert)`（`vendor/include/src/index.ts:94`），**不查 id 唯一性** | 验层时数一遍：`dsh --profile web --dump-config \| grep -c -- '^- id: fs$'` 必须**恰为 1**。启动后表现为：host 侧两个插件都注册 `/api/fs` 前缀路由，client 侧两个插件都注册 `conversation.view` 槽 `id: fs` → 页签重复或注册报错 |
| **R2** | **两行指向同一个包** → 客户端直接硬失败 | 例如同时保留 `dsh-plugin-file-system` 与指向同一目录的 `file:` spec | client-modules 会抛 `client-modules: package <name> resolves from multiple active Loader sources: … remove one entry`（`packages/client/modules/src/index.ts:957`） |
| **R3** | **profile 里旧行没删干净**（只删了 dependencies，或只删了 bundles） | `reconcilePlugins` 依赖「曾是 dependency」才剔除（`apps/cli/src/plugin.ts:78-87`）；手工编辑更容易只改一处 | `grep -n "dsh-plugin-file-system" ~/.dsh/profiles/web/package.json` 必须**无输出**（注意 `-zc` 包名**包含**旧名做前缀，grep 要用 `dsh-plugin-file-system"` 带引号或 `grep -wn`） |
| **R4** | **客户端产物 banner 的 id 与包名不符** | banner id 是构建期从 `package.json.name` 读出的（`normalize-client-banner.mjs:13`），若 build 后再改包名就会错位 | 切换前跑 `node scripts/verify-client-banner.mjs`（G3）；切换后若页签不出现且 console 有模块加载错误，用 `head -c 120 client/client.js` 复核 |
| **R5** | **新包产物未构建**（`lib/`、`client/` 缺失/是骨架） | 产物不入库（D-7），`link:` 安装**不会**触发 `prepare` 构建 | §0 的 G2；`ls -l lib/index.js client/client.js` 且 `wc -l lib/index.js` 不应是 37 |
| **R6** | **新包没被链进 profile 的 node_modules** | 手工改 `package.json` 而未跑安装 | 验层时 `cannot resolve profile bundle "dsh-plugin-file-system-zc"`（`profile.ts:758-761`）；或 `ls -la ~/.dsh/profiles/web/node_modules/dsh-plugin-file-system-zc` |
| **R7** | **客户端 boot 全有全无**：新插件 client 起不来 → 整个 GUI 起不来 | `assertEntriesActive` 只要有 entry pending/failed 就抛错（`packages/client/web/src/boot.ts:137-157`） | 浏览器 console 的 `web boot: N entries did not activate`；`~/.dsh/logs/web.log` 尾部。**这是好消息**：失败是响亮的，不会静默 |
| **R8** | **`dsh.client` 声明差异**：旧插件声明了 `inject: ["@deepseek-ai/dsh-client-runtime","@deepseek-ai/dsh-client-ui-slots"]` 与 `immediately`，新插件只有 `platform` | 迁移时按 feature-baseline 逐字保留清单未覆盖该字段 | 若客户端插件等待服务而 pending，boot gate 会报 `pending (waiting for service: …)`。**待核实**（见 §8-Q2） |
| **R9** | **bundles 顺序变化**（新插件被追加到末尾） | `reconcilePlugins` 用 `plugins.push(...)` | `grep -n -A20 '"bundles"' package.json`；本插件各层 patch 互不按 id 覆盖，**判定为无实质影响**（§1.4） |
| **R10** | **误以为热重载能顶替重启** | profile 的 `patchReload` 缺省 `'live'`（`profile.ts:142`），用户层 `cordis.patch.yml` 确实热重载；但 **bundle 层列表是 boot 期拼装的**，改 `bundles`/`dependencies` 必须重启 | 改完不重启时页签不会变 —— 不要把它当故障；对照 §1.3 的装载链路 |
| **R11** | **验层命令被当成纯只读** | `--dump-config` 会重写 `cordis.yml`（内容幂等，mtime 变） | §2.3 的警告；若要求 mtime 也不变，改用 `--dump-default-config`（同样经 `prepareProfile`，**不能避免**）——唯一完全只读的办法是手工按 §1.3 复现组合 |

---

## 7. 命令出处索引

| 命令/事实 | 出处（文件:行号 或 命令输出） | 已核实 |
|---|---|---|
| `dsh --profile <name> --dump-config` | `dsh --help` 输出第 12 行；`apps/cli/src/args.ts:148`；`apps/cli/src/dump-config.ts:31-58` | ✅ |
| `dsh --dump-default-config`（跳过用户层） | `dsh --help` 输出第 13-14 行；`apps/cli/src/args.ts:151`；`dump-config.ts:42-55` | ✅ |
| `dsh plugin --profile <name> add/remove <pkg>` | `dsh --help` Examples 末行（`dsh plugin --profile tui add <package>`）；`apps/cli/src/args.ts:176-190`；`apps/cli/src/plugin.ts:120-163` | ✅ |
| `dsh plugin` 转发给 pnpm + 自动 reconcile `bundles` | `apps/cli/src/plugin.ts:1-11`（模块头）、`:59-91`、`:134-149` | ✅ |
| `link:` 依赖是当前装载形态 | `grep -n dsh-plugin-file-system ~/.dsh/profiles/web/package.json` → 第 9 行；`readlink -f` 输出 | ✅（实测） |
| `dsh.bundle.patch` 的拼装作用 | `packages/boot/app-boot/src/profile.ts:8-13`、`:774-804` | ✅ |
| bundle 解析锚点与失败文案 | `packages/boot/app-boot/src/profile.ts:751-762` | ✅ |
| patch `insert` 语义（无 id = 顶层追加） | `vendor/include/src/index.ts:78-106` | ✅ |
| `--dump-config` 会写 `cordis.yml` | `apps/cli/src/profile-boot.ts:187-192`（`prepareProfile` 的 `writeFileSync`） | ✅ |
| `patchReload` 缺省 `'live'` | `packages/boot/app-boot/src/profile.ts:142` | ✅ |
| 客户端插件枚举 = 组合后的 entry 列表 | `packages/client/modules/src/index.ts:747-776`、`:957`、`:967` | ✅ |
| 客户端 boot readiness gate（fail-loud） | `packages/client/web/src/boot.ts:137-157` | ✅ |
| banner 契约与校验脚本 | `-zc/scripts/normalize-client-banner.mjs:12-14`；`-zc/scripts/verify-client-banner.mjs:12-27` | ✅ |
| 产物不入库 | `-zc/.gitignore:2-3`；`git ls-files lib client` 输出为空 | ✅（实测） |
| 重启脚本行为（TERM/8s/KILL/systemd-run/180s/token 60s/唤醒） | `dsh-self-update/skills/restart-dsh/scripts/dsh-restart:28-35, 71-90, 92-95, 97-183, 185-222, 224-311` | ✅ |
| 重启必须脱离受管 scope | `restart-dsh/SKILL.md` §执行步骤 5 与 §注意事项 | ✅ |
| 四层冒烟项 | `PROGRESS.md` §6；`spec-p5-p6-tests-and-cutover.md` §P6-4 | ✅ |
| 当前 dump 组合的旧行位置（569-571 行） | 本手册调研期以 `loadProfileDirectory + renderConfigDump` **只读复现** `dump-config` 得到（未执行 `dsh` 命令） | ✅（实测） |
| 旧/新 banner 首行 | `head -1` 两份产物 | ✅（实测） |
| **pnpm 对本地目录默认写 `link:`** | 未在主仓源码中找到规定 —— 依据是现有 profile 第 9 行的既有形态推断 | ⚠ **推断**，执行后用 §2.2 的 grep 确认 |
| **`dsh client.inject` 在各处的确切语义** | 只确认了「被读取」（`modules/src/index.ts:757-776`）与「boot gate 用它判 pending」（`client/web/src/boot.ts:149`），未找到它的取值规范 | ⚠ **未核实**（§8-Q2） |

---

## 8. 未解问题 / 需决策

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| **Q1** | **切换时机**：`-zc` 当前是 P1 骨架（`lib/index.js` 37 行、client 是占位视图），P3/P4/P5 未完成 | 现在切换 = 功能全失 | 等 P5 销账 + §0 五条门禁全绿后再执行；本手册可作为 T-60 的执行稿 |
| **Q2** | 新插件 `dsh.client` 只有 `platform`，旧插件还声明了 `inject: [...两个包名]` 与 `immediately`。这两者在真实 web 壳里的确切语义未在源码中定位到规范 | 若新插件需要它们才能被等待就绪，可能出现 boot gate pending | P4 收尾时由实现方给出结论（或切到 `standard` 对照实测）；未定论前不要凭猜回填 |
| **Q3** | bundles 顺序是否要求保持原位（新插件被追加到末尾） | 判定为无实质影响（§1.4），但可读性/审计性下降 | 由主智能体决定：接受追加，或手工把行移回原位 |
| **Q4** | 备份保留策略：`~/.dsh/backups/` 下会再增一份整目录备份（含 node_modules） | 磁盘占用 | 建议保留至 P6 验收 7 天后清理；不要在同一次切换里覆盖同一备份 |
| **Q5** | 切换后旧插件仓库是否保留 | 回滚依赖它 | 建议至少在 P6 验收通过前保持原样、只读（D-3 已冻结迁移源 `3a3f89e`） |
| **Q6** | 是否需要同时验证 agent 预设身份（`agent.cordis.yml` 的「文件系统」预设） | 与 profile 切换是两条链路，不在 T-60/T-61 范围 | 若要验证，需另起任务；本手册不覆盖 |

---

## 附：一页速览（复制粘贴区）

```bash
# 0) 前置：-zc 门禁全绿 + 已 build（见 §0）
# 1) 备份
TS=$(date +%Y%m%d-%H%M%S); echo "$TS" > /tmp/p6-cutover-ts
cp -a ~/.dsh/profiles/web ~/.dsh/backups/web-profile-before-zc-$TS
# 2) 换插件
dsh plugin --profile web remove dsh-plugin-file-system
dsh plugin --profile web add /home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc
# 3) 验层（应恰有一行 - id: fs，且 name 为新包名）
dsh --profile web --dump-config | grep -n -B1 -A1 -- '^- id: fs$'
# 4) 重启（本轮最后动作，中断当前对话）
systemd-run --user --unit=dsh-restart-$(date +%s) --collect \
  --setenv=DSH_SESSION_ID="$DSH_SESSION_ID" ~/.local/bin/dsh-restart
# 5) 新轮次：先读 ~/.dsh/restart-state.json 接手，再跑 §4 四项冒烟
# 6) 回滚（任一项失败）
TS=$(cat /tmp/p6-cutover-ts); rm -rf ~/.dsh/profiles/web
cp -a ~/.dsh/backups/web-profile-before-zc-$TS ~/.dsh/profiles/web
#    然后再执行第 4 步重启
```
