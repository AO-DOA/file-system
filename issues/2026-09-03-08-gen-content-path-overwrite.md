---
date: 2026-09-03
status: 已验证关闭
skill: folder-doc
type: 脚本bug
severity: 高
recurrence: 1
related: ""
---

# gen --content 传入文件路径时把路径字符串写进文档，覆盖掉整篇正文

## 场景（怎么触发）

生成目录概览时，模型已先用 write 写好带语义的完整 md，再按技能说明跑脚本并传 `--content <已写好的 md 文件路径>`：

`node scripts/folder-doc.mjs gen <目标文件夹> --book <书库根> --key '<源码路径键>' --content <书库根>/目录概览/<名>.md`

## 现象（看到了什么）

目标 md 全文被替换成一行——就是 `--content` 后面那个路径字符串本身：

```
/home/xuepeng/DSH/DSHworkPace/.book/DSHworkPace-book/目录概览/dsh-plugin-file-system.md
```

frontmatter、正文、目录树全部丢失，需返工重写文档。

## 根因（为什么会这样）

`folder-doc.mjs` 第 82-83 行：`--content` 的值被当作**正文内容字符串**直接 `writeFileSync(..., override)`，脚本不读文件、不识别"这是路径"。而技能正文写的是「用 `--content` 传入覆盖模板骨架」，"传入"二字有歧义，模型自然理解为传入文件路径，实际契约是传入内容本身。

## 改法 / 临时绕过

本次绕过：索引已由脚本 upsert 成功，不再重跑脚本，直接用 write 把完整正文重新写回 md。

正改方向（二选一）：
1. 脚本侧：`--content` 值若以 `.md` 结尾且是存在的文件路径，则 `readFileSync` 读其内容（兼容两种用法）；
2. 技能侧：SKILL.md 把措辞改为「`--content` 接收**正文字符串本身**，不是文件路径；已落盘正文时不要传 `--content`，先 `gen` 生成骨架再让模型 edit 填语义」。

## 复验（如何确认已解决）

任选其一验证：传文件路径后文档内容保持为 md 正文而非路径字符串；或不传 `--content` 走「gen 骨架 → 模型填语义」流程产出完整文档且索引正确。

## 修复落地（2026-09-03，采用方向 1 脚本侧兼容）

`folder-doc.mjs` gen 段：`--content` 值若以 `.md` 结尾且是存在的文件路径，则 `readFileSync` 读其内容后覆盖写入；否则按正文字符串原文写入（旧契约不破坏）。

## 复验结果（2026-09-03 实际跑证，全部通过）

- ✓ 传已落盘 md 文件路径 → 文档内容 = 该文件完整正文（frontmatter/正文保留），不再是路径字符串；`index.json` 目录层 upsert 正常。
- ✓ 传普通正文字符串 → 按原文写入，旧用法回归无损。
- ✓ `node --check` 通过。
