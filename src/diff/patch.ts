import { DiffSegment, Patch, PatchHunk, ApplyResult } from './types'
import { myersDiff } from './myers'

export function createPatch(
  a: string[],
  b: string[],
  sourceFile = 'a',
  targetFile = 'b',
): Patch {
  const segments = myersDiff(a, b)
  const hunks: PatchHunk[] = []
  let ctx = 0
  let hunk: PatchHunk | null = null

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.op === 'equal') {
      for (let j = 0; j < seg.lines.length; j++) {
        if (hunk) {
          hunk.content.push(` ${seg.lines[j]}`)
          ctx++
          if (ctx >= 3) {
            hunks.push(hunk)
            hunk = null
            ctx = 0
          }
        }
      }
      if (!hunk) ctx = 0
    } else {
      if (!hunk) {
        hunk = makeHunk(segments, i)
        ctx = 0
      }
      if (seg.op === 'delete') {
        for (const line of seg.lines) {
          hunk.content.push(`-${line}`)
        }
        hunk.countA += seg.lines.length
      } else {
        for (const line of seg.lines) {
          hunk.content.push(`+${line}`)
        }
        hunk.countB += seg.lines.length
      }
    }
  }

  if (hunk) hunks.push(hunk)

  return { sourceFile, targetFile, hunks }
}

function makeHunk(
  segments: DiffSegment[],
  idx: number,
): PatchHunk {
  const hunk: PatchHunk = {
    startA: 0,
    countA: 0,
    startB: 0,
    countB: 0,
    content: [],
  }

  let lineA = 0
  let lineB = 0

  for (let i = 0; i < idx; i++) {
    const s = segments[i]
    if (s.op === 'equal' || s.op === 'delete') lineA += s.lines.length
    if (s.op === 'equal' || s.op === 'insert') lineB += s.lines.length
  }

  let ctxLines = 0
  for (let i = idx - 1; i >= 0 && ctxLines < 3; i--) {
    const s = segments[i]
    if (s.op !== 'equal') break
    for (let j = s.lines.length - 1; j >= 0 && ctxLines < 3; j--) {
      hunk.content.unshift(` ${s.lines[j]}`)
      ctxLines++
      lineA--
      lineB--
    }
  }

  hunk.startA = lineA
  hunk.startB = lineB

  return hunk
}

export function applyPatch(lines: string[], patch: Patch): ApplyResult {
  return applyPatchInternal(lines, patch, false)
}

export function applyPatchReverse(lines: string[], patch: Patch): ApplyResult {
  return applyPatchInternal(lines, patch, true)
}

function applyPatchInternal(
  lines: string[],
  patch: Patch,
  reverse: boolean,
): ApplyResult {
  const result = [...lines]

  for (const hunk of patch.hunks) {
    const start = reverse ? hunk.startB : hunk.startA
    let pos = start

    for (const line of hunk.content) {
      const kind = line[0]
      const text = line.slice(1)
      const action = reverse ? reverseOpChar(kind) : kind

      switch (action) {
        case ' ': {
          if (pos >= result.length || result[pos] !== text) {
            return { success: false, error: `context mismatch at line ${pos}: expected "${text}", got "${result[pos]}"` }
          }
          pos++
          break
        }
        case '-': {
          if (pos >= result.length || result[pos] !== text) {
            return { success: false, error: `delete mismatch at line ${pos}: expected "${text}", got "${result[pos]}"` }
          }
          result.splice(pos, 1)
          break
        }
        case '+': {
          result.splice(pos, 0, text)
          pos++
          break
        }
      }
    }
  }

  return { success: true, result }
}

function reverseOpChar(op: string): string {
  if (op === '+') return '-'
  if (op === '-') return '+'
  return ' '
}
