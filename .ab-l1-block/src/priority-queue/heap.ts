import type { PriorityQueueItem, PriorityQueueOptions } from './types.js'

type HeapNode<T> = PriorityQueueItem<T> & { _id: number }

function lessThan<T>(a: HeapNode<T>, b: HeapNode<T>): boolean {
  if (a.priority !== b.priority) return a.priority < b.priority
  return a._id < b._id
}

export class PriorityQueue<T> {
  #heap: HeapNode<T>[] = []
  #maxSize: number
  #nextId = 0

  constructor(options?: PriorityQueueOptions) {
    this.#maxSize = options?.maxSize ?? Infinity
  }

  enqueue(value: T, priority: number): void {
    if (this.#heap.length >= this.#maxSize) {
      throw new Error('PriorityQueue is full')
    }

    const node: HeapNode<T> = { priority, value, _id: this.#nextId++ }
    this.#heap.push(node)
    this.#bubbleUp(this.#heap.length - 1)
  }

  dequeue(): T | undefined {
    if (this.#heap.length === 0) return undefined

    const root = this.#heap[0]
    const last = this.#heap.pop()!

    if (this.#heap.length > 0) {
      this.#heap[0] = last
      this.#bubbleDown(0)
    }

    return root.value
  }

  peek(): T | undefined {
    return this.#heap.length > 0 ? this.#heap[0].value : undefined
  }

  size(): number {
    return this.#heap.length
  }

  isEmpty(): boolean {
    return this.#heap.length === 0
  }

  clear(): void {
    this.#heap = []
  }

  toArray(): PriorityQueueItem<T>[] {
    return this.#heap.map(({ priority, value }) => ({ priority, value }))
  }

  #bubbleUp(index: number): void {
    const node = this.#heap[index]

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = this.#heap[parentIndex]

      if (!lessThan(node, parent)) break

      this.#heap[index] = parent
      index = parentIndex
    }

    this.#heap[index] = node
  }

  #bubbleDown(index: number): void {
    const length = this.#heap.length
    const node = this.#heap[index]

    while (true) {
      let child = 2 * index + 1

      if (child >= length) break

      if (child + 1 < length && lessThan(this.#heap[child + 1], this.#heap[child])) {
        child = child + 1
      }

      if (!lessThan(this.#heap[child], node)) break

      this.#heap[index] = this.#heap[child]
      index = child
    }

    this.#heap[index] = node
  }
}
