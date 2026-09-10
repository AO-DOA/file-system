// L2 文件摘要 — 能力描述符（宿主内置，2026-09-10 去技能化）。
// 确定性工作（frontmatter / 命名 / 骨架结构 / index.json「文件层」）由宿主完成；
// 模型读目标文件 + 检索引用关系后写五段正文。技能 skills/file-doc 保留，仅供会话内人工调用。
import { basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { computeDocStem } from '../../fs-utils.ts'
import { renderFileDocSkeleton, filePlaceholderLeft } from './skeleton.ts'
import { ZH } from '../../../shared/locale.ts'

// docStem 入参：宿主下发的目标描述，本能力只用到源码路径键（文档名 = computeDocStem(key)）。
interface FileDocStemTarget {
  key: string
}

// skeleton 入参：宿主执行器下发的目标参数（title 取 abs 的文件名）。
interface FileSkeletonInput {
  targetKey: string
  abs: string
  layer: string
  generatedAt: string
}

// verify 入参：产物文档绝对路径（执行器收尾时下发）。
interface FileDocVerifyInput {
  docAbs: string
}

export default {
  kind: 'file',
  dir: 'file-doc',
  sub: '文件摘要',
  arr: '文件层',
  layer: '文件',
  hostIndex: true,
  scope: 'file',
  promptFile: 'prompt.md',
  // 文档名 = computeDocStem（与 file-doc.mjs 的 computeName 同规则，三处同步约定见 fs-utils.js）。
  docStem: (target: FileDocStemTarget) => computeDocStem(target.key),
  skeleton: ({ targetKey, abs, layer, generatedAt }: FileSkeletonInput) => renderFileDocSkeleton({
    relPath: targetKey,
    title: basename(abs),
    layer,
    generatedAt,
  }),
  async verify({ docAbs }: FileDocVerifyInput): Promise<void> {
    const body = await readFile(docAbs, 'utf8').catch(() => '')
    // #15 加固（2026-09-10）：产物健康校验——防子 agent 用试探性/错误的 write 把 DOC
    // 清空成 0 字节却仍判 success。占位残留校验对空产物会漏过（空串不含占位符）。
    if (!body.trim()) throw new Error(ZH.errGenEmptyArtifact + docAbs)
    if (filePlaceholderLeft(body)) {
      throw new Error(ZH.errGenSkeletonLeft + docAbs)
    }
  },
}
