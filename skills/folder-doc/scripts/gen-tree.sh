#!/usr/bin/env bash
# gen-tree.sh <目录>  —— 输出目标目录第一层子项的 ASCII 树骨架（子文件夹不展开）
# 用法: ./gen-tree.sh /path/to/hooks  → 打印标准第一层树，AI 在行尾补 " -- 一句话简介"
set -u
dir="${1:?用法: gen-tree.sh <目录>}"
[ -d "$dir" ] || { echo "错误: 不是目录 $dir" >&2; exit 1; }

cd "$dir" || exit 1
name=$(basename "$dir")

# 第一层：目录在前、文件在后；忽略隐藏目录与常见排除目录
ign='.git|node_modules|__pycache__|.venv|venv|dist|build|out|target|.next|.cache|vendor|.idea|.vscode'
dirs=$(find . -mindepth 1 -maxdepth 1 -type d -not -path './.*' 2>/dev/null \
        | grep -Ev "/(${ign})$" | sort)
files=$(find . -mindepth 1 -maxdepth 1 -type f -not -path './.*' 2>/dev/null | sort)

# 数组收集：目录项带 /，文件项不带（逐项换行输出，避免挤成一行）
items=()
for d in $dirs; do items+=("${d#./}/"); done
for f in $files; do items+=("${f#./}"); done

n=${#items[@]}
echo "$name/"
i=0
for item in "${items[@]}"; do
  i=$((i+1))
  if [ "$i" -eq "$n" ]; then branch="└──"; else branch="├──"; fi
  printf '%s %s\n' "$branch" "$item"
done
