---
date: 2026-08-30
status: 已验证关闭
skill: source-doc
type: 脚本bug
severity: 中
recurrence: 1
related: "skills/source-doc/scripts/source-annotate.mjs（build 的 index 更新段）"
---

# 全新书库无 index.json 时 build 报错退出，需先手动初始化

## 场景（怎么触发）

首次为新项目书库生成首篇源码注解：`node scripts/source-annotate.mjs build 骨架.md --rel yuanma/opencode/nix/opencode.nix --pkg opencode --book /home/xuepeng/program/yuanma/.book/yuanma-book`（此时 `.book/yuanma-book` 及 `index.json` 均不存在）。

## 现象（看到了什么）

build 走到更新索引一步时报错退出：

```
已生成: /home/xuepeng/program/yuanma/.book/yuanma-book/源码注解/opencode-opencode.md
[source-annotate] 找不到 index.json: /home/xuepeng/program/yuanma/.book/yuanma-book/index.json
=== exit: 1 ===
```

即：**注解文档已生成，但索引未更新且进程非零退出**，需要重跑。

## 根因（为什么会这样）

build 在更新 `index.json「源码层」` 时执行 `if (!existsSync(indexFile)) err(\`找不到 index.json: ${indexFile}\`)`，硬性要求 `index.json` 预先存在。对全新书库（只有用户指定的书库根、目录尚未初始化）而言没有"从零创建"的路径，第一次使用必然命中该报错。

## 改法 / 临时绕过

先手工创建初始 `index.json`（结构对齐既有书库，目录层/文件层为空数组），再重跑同一 `build` 命令即可正常追加源码层条目并删除骨架：

```json
{
  "项目": "yuanma",
  "项目根": "yuanma",
  "目录层": [],
  "文件层": [],
  "源码层": []
}
```

## 复验（如何确认已解决）

已修复并复验通过：build 在 `index.json` 不存在时自动用 `{ 项目, 项目根, 目录层: [], 文件层: [], 源码层: [] }` 初始化（项目名取书库名去掉 `-book`），不再 `err`。实测对全新空书库（无 index.json）跑 build 一次成功、退出码 0，源码层出现该条，并打印「index.json 不存在，已自动初始化」。同时 SKILL.md 第零步第 7 点已改为"无需手工建 index.json"。
