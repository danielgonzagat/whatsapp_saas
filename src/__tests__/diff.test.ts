/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { myersDiff, createPatch, applyPatch, applyPatchReverse } from '../diff'

describe('myersDiff', () => {
  it('returns empty for identical arrays', () => {
    const r = myersDiff([], [])
    expect(r).toEqual([])
  })

  it('returns all equal for identical content', () => {
    const r = myersDiff(['a', 'b'], ['a', 'b'])
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ op: 'equal', lines: ['a', 'b'] })
  })

  it('detects insert at end', () => {
    const r = myersDiff(['a'], ['a', 'b'])
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ op: 'equal', lines: ['a'] })
    expect(r[1]).toEqual({ op: 'insert', lines: ['b'] })
  })

  it('detects delete at end', () => {
    const r = myersDiff(['a', 'b'], ['a'])
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ op: 'equal', lines: ['a'] })
    expect(r[1]).toEqual({ op: 'delete', lines: ['b'] })
  })

  it('detects replace', () => {
    const r = myersDiff(['a', 'b', 'c'], ['a', 'x', 'c'])
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ op: 'equal', lines: ['a'] })
    expect(r[1]).toEqual({ op: 'delete', lines: ['b'] })
    expect(r[2]).toEqual({ op: 'insert', lines: ['x'] })
  })

  it('detects full replace', () => {
    const r = myersDiff(['a'], ['b'])
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ op: 'delete', lines: ['a'] })
    expect(r[1]).toEqual({ op: 'insert', lines: ['b'] })
  })

  it('handles multi-line inserts', () => {
    const r = myersDiff(['a'], ['a', 'b', 'c', 'd'])
    const insert = r.find((s) => s.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert!.lines).toEqual(['b', 'c', 'd'])
  })

  it('handles multi-line deletes', () => {
    const r = myersDiff(['a', 'b', 'c', 'd'], ['a'])
    const del = r.find((s) => s.op === 'delete')
    expect(del).toBeDefined()
    expect(del!.lines).toEqual(['b', 'c', 'd'])
  })
})

describe('createPatch', () => {
  it('creates empty hunks for identical arrays', () => {
    const p = createPatch(['a'], ['a'])
    expect(p.hunks).toHaveLength(0)
  })

  it('creates a patch with hunk headers', () => {
    const p = createPatch(['a', 'b'], ['a', 'c'])
    expect(p.sourceFile).toBe('a')
    expect(p.targetFile).toBe('b')
    expect(p.hunks.length).toBeGreaterThan(0)
  })
})

describe('applyPatch', () => {
  it('applies insert patch', () => {
    const a = ['line1']
    const b = ['line1', 'line2']
    const p = createPatch(a, b)
    const r = applyPatch(a, p)
    expect(r.success).toBe(true)
    expect(r.result).toEqual(b)
  })

  it('applies delete patch', () => {
    const a = ['line1', 'line2']
    const b = ['line1']
    const p = createPatch(a, b)
    const r = applyPatch(a, p)
    expect(r.success).toBe(true)
    expect(r.result).toEqual(b)
  })

  it('applies replace patch', () => {
    const a = ['a', 'b', 'c']
    const b = ['a', 'x', 'c']
    const p = createPatch(a, b)
    const r = applyPatch(a, p)
    expect(r.success).toBe(true)
    expect(r.result).toEqual(b)
  })
})

describe('applyPatchReverse', () => {
  it('reverses an insert to a delete', () => {
    const a = ['line1']
    const b = ['line1', 'line2']
    const p = createPatch(a, b)
    const r = applyPatchReverse(b, p)
    expect(r.success).toBe(true)
    expect(r.result).toEqual(a)
  })

  it('reverses a delete to an insert', () => {
    const a = ['line1', 'line2']
    const b = ['line1']
    const p = createPatch(a, b)
    const r = applyPatchReverse(b, p)
    expect(r.success).toBe(true)
    expect(r.result).toEqual(a)
  })
})
