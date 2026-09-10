// 文章翻译 — 能力描述符。
// 定位：只服务「其他语种 → 中文」；源文已是简体中文时前置拒绝，不启动子会话（中文翻中文只是
// 照抄，实测一次 41K tokens 零信息增量）。译文由模型分段写入，宿主收尾校验落盘与更新。
import { readFile, stat } from 'node:fs/promises'
import { computeDocStem, READ_LIMIT } from '../../fs-utils.ts'

// 判定文本是否以简体中文为主。判据：CJK 统一表意文字数与拉丁字母数比较——中文占优即视为
// 中文；中文字符占比达到 20% 也视为中文，防「中文文档里代码块/英文术语极多」被拉丁字母
// 反超而误判。无中文字符直接判否。
export function isMostlyChinese(text: string | null | undefined): boolean {
  const s = String(text == null ? '' : text)
  let cjk = 0
  let latin = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    if (c >= 0x4e00 && c <= 0x9fff) cjk++
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++
  }
  if (cjk === 0) return false
  if (cjk >= latin) return true
  return cjk / (cjk + latin) >= 0.2
}

export default {
  kind: 'translate',
  dir: 'translate-doc',
  sub: '文章翻译',
  arr: '文章翻译',
  layer: '文章翻译',
  hostIndex: true,
  scope: 'translate',
  promptFile: 'prompt.md',
  docStem: (target: { key: string }) => computeDocStem(target.key),
  // 派发前校验：源文存在且为文件、不超读上限、不是简体中文。
  async precheck({ abs, rel }: { abs: string; rel: string }): Promise<void> {
    const st = await stat(abs).catch(() => null)
    if (!st || st.isDirectory()) throw new Error('源文档不存在: ' + abs)
    if (st.size > READ_LIMIT) throw new Error('源文档过大（> ' + String(READ_LIMIT) + ' 字节）')
    const head = await readFile(abs, 'utf8').then(t => t.slice(0, 8192)).catch(() => null)
    if (head && isMostlyChinese(head)) throw new Error('源文档已是简体中文，无需翻译: ' + rel)
  },
  // 收尾校验：译文确实落盘；更新模式下还要确认内容真的变了（防空转误报 success）。
  async verify({ docAbs, prevStat }: { docAbs: string; prevStat: { mtimeMs: number; size: number } | null | undefined }): Promise<void> {
    const st = await stat(docAbs).catch(() => null)
    if (!st || st.isDirectory()) throw new Error('译文未写入目标文件: ' + docAbs)
    if (prevStat && st.mtimeMs === prevStat.mtimeMs && st.size === prevStat.size) {
      throw new Error('子 agent 已结束但译文未更新: ' + docAbs)
    }
  },
}
