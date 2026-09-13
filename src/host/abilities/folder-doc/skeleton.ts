// L1 目录概览 — 确定性骨架渲染（宿主内置，2026-09-10 去技能化）。
// 目录树与模板渲染全部由宿主内置实现，不依赖外部技能目录。
import { basename } from 'node:path'
import { readdir } from 'node:fs/promises'
import { ZH } from '../../../shared/locale.ts'

// 目录树排除名单：与 gen-tree.sh 的 ign 变量逐项一致（只作用于目录，不作用于文件）。
export const FOLDER_TREE_IGNORE: string[] = [
  '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', 'out',
  'target', '.next', '.cache', 'vendor', '.idea', '.vscode',
]

// 骨架里的语义占位标记（标题后一句话职责）。宿主收尾据此判定「产物仍是骨架」——
// 模型没填语义却把骨架原样写回时置任务 error，不把占位符当交付物。
export const FOLDER_DOC_PLACEHOLDER = '<一句话说明这个文件夹是干什么的>'

// 「## 目录树」里每个节点后带的作用占位（2026-09-09 人工）：树由宿主渲染结构，
// 每个条目后留 `# <作用>` 占位，模型逐项替换为「这个文件/子目录是做什么的」的一句话——
// 树即「结构 + 一句」；上方「子目录/文件」表格仍是逐项详细说明（两者并存，形态 A）。
export const FOLDER_TREE_ITEM_PLACEHOLDER = '# <作用>'

// 标题下「1-2 句总体角色说明」占位（2026-09-09 人工）：只讲这个目录整体在项目里扮演什么角色，
// 不逐项罗列子目录/文件（那些在目录树注释与「文件」表格里）——避免与「子目录：无」自相矛盾、三重重复。
export const FOLDER_DOC_ROLE_PLACEHOLDER = '<1-2 句总体角色说明：这个目录整体在项目里扮演什么角色；不要逐项罗列子目录/文件>'

// 目录树条目的入参形状：调用方把 Dirent 转成普通对象后传入，便于纯逻辑单测。
// 三项均可缺省、条目本身可为 null——源实现把无名项与脏输入一并跳过，测试按同一口径喂入。
export interface FolderTreeEntry {
  name?: string | null
  isDirectory?: boolean
  isFile?: boolean
}

// L1 骨架渲染入参：frontmatter 三行、标题、路径与整棵目录树都由宿主算好（模型只填语义占位）。
export interface FolderDocSkeletonInput {
  relPath: string
  name: string
  layer: string
  generatedAt: string
  tree: string
}

// 骨架构建入参：宿主执行器下发的目标参数（abs 为待渲染文件夹的绝对路径，docStem 为产物文档名）。
export interface FolderSkeletonTarget {
  abs: string
  targetKey: string
  docStem: string
  layer: string
  generatedAt: string
}

// 渲染第一层 ASCII 目录树：<目录名>/ + 每项 ├──/└──（子文件夹带尾 '/'，不递归展开）。
// entries 为 [{ name, isDirectory }]（由调用方把 Dirent 转成普通对象，便于纯逻辑单测）。
// 规则与 gen-tree.sh 对齐：隐藏项（'.' 开头）一律跳过；目录再排除 FOLDER_TREE_IGNORE；
// 排序为「目录在前、文件在后，各自按名升序」；空目录只输出一行 '<目录名>/'。
// TS 下条目类型含 null（源实现靠 name 判空先行跳过），故两处 directory/file 判定加必要类型断言；
// 断言是纯类型构造、运行时零残留，也不引入额外分支（走到该行时 entry 必非 null）。
export function renderFolderTree(dirName: string, entries?: readonly (FolderTreeEntry | null)[] | null): string {
  const dirs: string[] = []
  const files: string[] = []
  for (const entry of entries || []) {
    const name = String((entry && entry.name) || '')
    if (!name || name.startsWith('.')) continue
    if ((entry as FolderTreeEntry).isDirectory) {
      if (FOLDER_TREE_IGNORE.includes(name)) continue
      dirs.push(name)
    } else if ((entry as FolderTreeEntry).isFile) {
      files.push(name)
    }
  }
  dirs.sort()
  files.sort()
  const items = dirs.map(n => n + '/').concat(files)
  const lines = [dirName + '/']
  items.forEach((item, i) => {
    lines.push((i === items.length - 1 ? '└── ' : '├── ') + item + '  ' + FOLDER_TREE_ITEM_PLACEHOLDER)
  })
  return lines.join('\n')
}

// 渲染 L1 骨架：frontmatter 三行、标题、
// 路径、目录树围栏由宿主写死，三处语义占位留给模型替换（占位文本也是收尾校验的判据）。
export function renderFolderDocSkeleton({ relPath, name, layer, generatedAt, tree }: FolderDocSkeletonInput): string {
  return [
    '---',
    '源码路径: ' + relPath,
    '层级: ' + layer,
    '生成时间: ' + generatedAt,
    '---',
    '',
    '# ' + name,
    '',
    '**路径**：' + relPath,
    '',
    '> ' + FOLDER_DOC_PLACEHOLDER,
    '',
    FOLDER_DOC_ROLE_PLACEHOLDER,
    '',
    '## 子目录',
    '',
    '| 目录 | 作用 |',
    '|---|---|',
    '| <子目录名>/ | <一句话职责> |',
    '',
    '## 文件',
    '',
    '| 文件 | 作用 |',
    '|---|---|',
    '| <文件名> | <一句话职责> |',
    '',
    '## 目录树',
    '',
    '```',
    tree,
    '```',
    '',
  ].join('\n')
}

// 读取目标文件夹第一层并渲染骨架。目标不是可读目录时抛错（路由层已预检，这里是兜底）。
// 标题与目录树第一行用 basename(abs)（真实目录名）——注意 docStem 自 2026-09-13 起含父目录
// 层级（与文件层 computeDocStem 同视角），不能再拿 docStem 当目录名展示。
export async function buildFolderSkeleton({ abs, targetKey, layer, generatedAt }: FolderSkeletonTarget): Promise<string> {
  const entries = await readdir(abs, { withFileTypes: true }).catch(() => null)
  if (!entries) throw new Error(ZH.errUnreadableDir + abs)
  const dirName = basename(abs)
  return renderFolderDocSkeleton({
    relPath: targetKey,
    name: dirName,
    layer,
    generatedAt,
    tree: renderFolderTree(dirName, entries.map(e => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }))),
  })
}

// 收尾判定：产物仍是骨架（含任一语义占位）时返回占位串，否则空串。
export function folderPlaceholderLeft(body: string): string {
  // 目录树每项的 `# <作用>` 占位：模型逐项替换为说明，漏填任一项即视为未完成。
  if (body.includes(FOLDER_TREE_ITEM_PLACEHOLDER)) return FOLDER_TREE_ITEM_PLACEHOLDER
  if (body.includes(FOLDER_DOC_ROLE_PLACEHOLDER)) return FOLDER_DOC_ROLE_PLACEHOLDER
  return body.includes(FOLDER_DOC_PLACEHOLDER) ? FOLDER_DOC_PLACEHOLDER : ''
}
