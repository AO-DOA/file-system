---
date: 2026-09-08
status: 已解决
skill: session-finder
type: 脚本bug
severity: 中
recurrence: 1
related: ""
---

# 只认 `session.jsonl.zstd`，v2 格式会话被误报「日志未找到」

## 场景（怎么触发）

按会话标题反查日志：

```bash
node ~/.dsh/skills/session-finder/scripts/find-session.mjs "为 plugins 文件夹生成目录说明"
```

命中两个同名会话，其中一个（`fs-0990c5ed-e123-44d8-ace8-214c49fa2f9f`，标题后改为《效率检测对话1》）输出：

```
日志 : (未找到日志文件——可能已清空或不在 DSH_HOME)
```

## 现象（看到了什么）

该会话日志实际存在，只是文件名不同：

```bash
$ ls ~/.dsh/sessions/--home-xuepeng-DSH-DSHworkPace--/fs-0990c5ed-e123-44d8-ace8-214c49fa2f9f/
session.lock  session.v2.jsonl.zstd        # 112 KB，v2 格式
$ ls ~/.dsh/sessions/--home-xuepeng-DSH-DSHworkPace--/fs-8fb04335-4304-4aba-ad4b-7c66570d3322/
session.jsonl.zstd                          # 100 KB，v1 格式
```

后果：模型据此认为该会话「已清空」，转而读取了另一个同名旧会话（2026-08-30 那次），复盘对象错位——用户当场指出「感觉不对」。

## 根因（为什么会这样）

脚本按固定文件名 `session.jsonl.zstd` 拼接并 `existsSync` 判断；DSH 新版会话落盘为 `session.v2.jsonl.zstd`，脚本未覆盖该命名，于是把「文件名变了」误报成「日志不存在」。技能正文的「手动反查三步」也只写了 `session.jsonl.zstd`。

## 改法 / 临时绕过

临时（本次已用）：手动列目录取真实文件名，再 `zstd -dc <真实路径>` 读取。

```bash
ls -la ~/.dsh/sessions/--<cwd编码>--/<会话id>/
zstd -dc ~/.dsh/sessions/--<cwd编码>--/<会话id>/session.v2.jsonl.zstd | node -e "…"
```

永久修复（2026-09-08 已实施）：

- `scripts/find-session.mjs` 的 `locateLog()` 改为在会话目录内按 `^session(\..+)?\.jsonl\.zstd$` 探测，v1/v2 通吃；
- `SKILL.md` 的「一句话结论」「输出字段」「手动反查」「磁盘两层结构」「易错点」统一改为 `session*.jsonl.zstd`，并补「标题会变」一条。

## 复验（如何确认已解决）

实测（2026-09-08）：

```bash
node ~/.dsh/skills/session-finder/scripts/find-session.mjs "效率检测"
# 日志 : .../fs-0990c5ed-.../session.v2.jsonl.zstd      ← v2 不再误报「未找到」
node ~/.dsh/skills/session-finder/scripts/find-session.mjs "为 plugins 文件夹生成目录说明"
# 日志 : .../fs-8fb04335-.../session.jsonl.zstd         ← v1 回归正常
node --check ~/.dsh/skills/session-finder/scripts/find-session.mjs   # 语法 OK
```
