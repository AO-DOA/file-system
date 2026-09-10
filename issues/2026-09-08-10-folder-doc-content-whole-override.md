---
date: 2026-09-08
status: 已验证关闭
skill: folder-doc
type: 流程不畅
severity: 低
recurrence: 2
related: ""
---

# `--content` 实为整篇覆盖，与 SKILL.md「覆盖模板骨架」的表述不一致

## 场景（怎么触发）

按 SKILL.md 第三步生成 `DSHworkPace/plugins` 目录概览：

```bash
node scripts/folder-doc.mjs gen /home/xuepeng/DSH/DSHworkPace/plugins \
  --root /home/xuepeng/DSH/DSHworkPace --key 'DSHworkPace/plugins'
```

SKILL.md 第三步的表述是：「跑 `gen` … 脚本渲染 frontmatter（源码路径=键/层级=目录）+ 目录树，写入文档，并 upsert index.json；**若已按模板写好带语义的正文，用 `--content` 传入覆盖模板骨架**」。

## 现象（看到了什么）

脚本实现（`scripts/folder-doc.mjs:158-162`）是整篇替换，不是「只覆盖正文段」：

```js
let override = argOf('--content')
if (override != null && /\.md$/i.test(override) && existsSync(override) && statSync(override).isFile()) {
  override = readFileSync(override, 'utf8')
}
writeFileSync(join(outDir, `${name}.md`), override != null ? override : md, 'utf8')
```

- 传 `--content` → **frontmatter、目录树、正文全部由传入内容决定**（脚本不再渲染任何一部分）。
- 不传 `--content` 重跑 → 又用模板骨架（`<一句话说明这个文件夹是干什么的>`、`<子目录名>/` 等占位符）覆盖已写好的语义正文。

结果：要同时保住「脚本渲染的 frontmatter + 目录树」与「模型写的语义正文」，只能走三步——
`gen` 生成骨架 → 覆盖写全文（原样保留脚本已渲染部分）→ `gen --content <该文档路径>` 回灌 upsert。

## 根因（为什么会这样）

SKILL.md 把 `--content` 描述成「覆盖模板骨架（正文）」，实现是「整篇文档替换」，两者对「frontmatter 由谁负责」的约定不一致。模型照字面理解会以为 frontmatter 仍由脚本渲染，实际必须自己保留——与 [2026-09-07-09](2026-09-07-09-translate-doc-frontmatter-not-generated.md)（脚本声称兜 frontmatter、实际原样落盘）属同一类「技能正文与脚本行为不一致」。

## 改法 / 临时绕过

本次临时绕过（已用）：

1. `gen` 不带 `--content` → 拿到脚本渲染的 frontmatter + 目录树骨架；
2. `write` 覆盖整篇文档，原样保留第 1 步的 frontmatter 与目录树，只填语义（标题下说明、子目录表、文件表）；
3. `gen --content <文档路径>` 回灌，触发 index.json「目录层」upsert（内容与目标一致，无副作用）。

## 复验（如何确认已解决）

已选**文档侧**方案（2026-09-10）：

- SKILL.md 第三步第 2 点已改为明写「`--content` 为整篇文档替换（frontmatter/目录树/正文全部由传入内容决定，脚本不再渲染任何一部分）；仅当已自含完整 frontmatter 与目录树时才传它」。
- 依据：脚本 `skills/folder-doc/scripts/folder-doc.mjs:167-171` 实为 `writeFileSync(docPath, override != null ? override : md, 'utf8')` ——传 `--content` 时整篇替换，frontmatter/目录树不再由脚本渲染（与旧「覆盖模板骨架」表述不符，二者对「frontmatter 由谁负责」约定不一致，属技能正文与脚本行为不一致）。
- 取文档侧而非脚本侧（新增 `--body <path>` 只替换正文段）的原因：L1 目录概览已去技能化（宿主内置 `src/host/abilities/folder-doc/skeleton.js` 确定性实现，不经由本脚本），本技能仅供会话内人工调用；为一条人工路径加 `--body` 逻辑与测试不划算。
