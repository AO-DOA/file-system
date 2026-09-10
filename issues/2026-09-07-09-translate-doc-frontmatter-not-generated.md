---
date: 2026-09-07
status: 已验证关闭
skill: translate-doc
type: 脚本bug
severity: 中
recurrence: 1
related: ""
---

# translate-doc 声称脚本兜 frontmatter，但 gen --content 原样落盘，照做产物缺 frontmatter 头

## 场景（怎么触发）

首次使用 translate-doc 技能翻译单篇 md：
`node scripts/translate-doc.mjs gen <源文件绝对路径> --book <书库根> --key <源码路径键> --content <译文正文>`
（本会话 skill 工具加载报 `skill "translate-doc" is unknown or no longer available`，技能未注册进会话目录，改从文件系统直接读 `skills/translate-doc/SKILL.md` 拿到规范。）

## 现象（看到了什么）

1. SKILL.md 第三步写明「脚本自动完成：frontmatter（源码路径/层级: 文章翻译）……**模型不要手写 frontmatter**」。
2. 但 translate-doc.mjs 的 gen 分支对 `--content` 只是 `writeFileSync(join(outDir, outFile), override)` 原样落盘，**没有任何 frontmatter 拼接/生成逻辑**；唯一带 frontmatter 的模板分支是 file-doc.mjs 的无 `--content` 路径（`skills/file-doc/scripts/file-doc.mjs` `TPL` 模板），translate-doc 连模板分支都没有。
3. 若按 SKILL.md「不手写 frontmatter」执行，产物会是纯正文、缺 `源码路径`/`层级: 文章翻译` 头，与宿主 dsh/index.js 的 prompt（「frontmatter 包含『源码路径: <key>』与『层级: 文章翻译』」）及现有产物（目录概览/packages.md 带 frontmatter）不一致。

## 根因（为什么会这样）

技能头注释与脚本实现漂移：SKILL.md 与脚本职责声明写「脚本兜确定性（frontmatter/命名/索引）」，但 `--content` 分支只负责内容覆盖，frontmatter 从未实现——口头约定 ≠ 代码行为。命名与 index.json upsert 是实现了的，唯独 frontmatter 没实现。

## 改法 / 临时绕过

本轮由模型在 `--content` 正文**顶部手写 frontmatter 头**（`源码路径`/`层级: 文章翻译`），落盘后产物与现有产物格式一致、index.json 正常 upsert。

## 修复（2026-09-08）

`translate-doc.mjs` 的 gen 分支改为：`--content` 只收译文正文，脚本前置拼 frontmatter（源码路径/层级: 文章翻译/生成时间）并剥掉正文里可能自带的旧头（`stripFrontmatter`），与 file-doc 同规则。SKILL.md 同步改为「脚本会前置拼接并剥掉正文里自带的旧头」。file-doc 的 `--content` 分支一并修复（同样前置拼接 + 剥旧头）。

## 复验（如何确认已解决）

2026-09-08 实测：空书库执行 `node scripts/translate-doc.mjs gen README.md --book <新桶> --key 'x/README.md' --content '译文正文'`（content 不含 frontmatter）→ 产物文件头为：

    ---
    源码路径: x/README.md
    层级: 文章翻译
    生成时间: 2026-09-08 22:13
    ---
    译文正文

frontmatter 已由脚本生成，且「生成时间」为本次翻译时刻——问题关闭。
