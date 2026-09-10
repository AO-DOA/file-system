---
date: 2026-08-30
status: 已验证关闭
skill: source-doc
type: 环境路径
severity: 中
recurrence: 1
related: "skills/source-doc/scripts/source-annotate.mjs（layout 子命令）"
---

# layout 命令传入 `.`（当前目录）时把项目名解析成 `.`，导致书库根错成 `.book/.-book`

> 用 `node ... layout <目标目录>` 时，用户常见的传法就是当前目录 `.`——此时会推导出错误的书库根。

## 场景（怎么触发）

`cd <插件目录> && node skills/source-doc/scripts/source-annotate.mjs layout .`

## 现象（看到了什么）

```
项目名: .
书库根: .book/.-book
源码注解目录: .book/.-book/源码注解
```

项目名被解析成 `.`（而非目录真名），书库根随之错误。

## 根因（为什么会这样）

`layout` 里用 `target.split(/[\\/]/).pop()` 取路径最后一段。当 `target='.'` 时最后一段就是 `.`，`path.basename('.')` 语义也返回 `.`。没有对 `.`/`..` 做 `path.resolve` 归一化后再取 basename。

## 改法 / 临时绕过

1. **即时绕过**：传 `--out` 显式覆盖书库根，或先 `cd` 到目标目录再用 `$(basename $(pwd))` 作为目标。
2. **根治**：`layout` 开头对 `target` 做 `path.resolve` 归一化（`new URL`/`realpath`），再取 `basename`，这样 `.` 会解析成真实目录名，`.` 也会得到父目录名。

## 复验（如何确认已解决）

`layout .` 应输出真实项目名与正确书库根（如当前目录名而非 `.`）。

---
# 状态机说明
- 当前 `分析中`：根因已定位，需改脚本后置 `已解决` 并复验。
