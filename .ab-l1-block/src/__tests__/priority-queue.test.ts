import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PriorityQueue } from '../priority-queue/index.js'
import type { PriorityQueueItem } from '../priority-queue/types.js'

describe('PriorityQueue', () => {
  describe('basic operations', () => {
    it('starts empty', () => {
      const pq = new PriorityQueue<string>()
      assert.strictEqual(pq.size(), 0)
      assert.strictEqual(pq.isEmpty(), true)
      assert.strictEqual(pq.peek(), undefined)
      assert.strictEqual(pq.dequeue(), undefined)
    })

    it('enqueue and size', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('a', 1)
      assert.strictEqual(pq.size(), 1)
      assert.strictEqual(pq.isEmpty(), false)
      pq.enqueue('b', 2)
      assert.strictEqual(pq.size(), 2)
    })

    it('peek returns highest priority without removing', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('b', 2)
      pq.enqueue('a', 1)
      assert.strictEqual(pq.peek(), 'a')
      assert.strictEqual(pq.size(), 2)
    })

    it('dequeue returns in priority order (min-heap)', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('c', 3)
      pq.enqueue('a', 1)
      pq.enqueue('b', 2)
      assert.strictEqual(pq.dequeue(), 'a')
      assert.strictEqual(pq.dequeue(), 'b')
      assert.strictEqual(pq.dequeue(), 'c')
      assert.strictEqual(pq.dequeue(), undefined)
    })

    it('clear empties the queue', () => {
      const pq = new PriorityQueue<number>()
      pq.enqueue(1, 1)
      pq.enqueue(2, 2)
      pq.enqueue(3, 3)
      pq.clear()
      assert.strictEqual(pq.size(), 0)
      assert.strictEqual(pq.isEmpty(), true)
      assert.strictEqual(pq.peek(), undefined)
    })

    it('toArray returns items (heap order, not sorted)', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('b', 2)
      pq.enqueue('a', 1)
      pq.enqueue('c', 3)
      const arr = pq.toArray()
      assert.strictEqual(arr.length, 3)
      assert.strictEqual(arr[0].value, 'a')
    })
  })

  describe('min-heap ordering', () => {
    it('lower priority number = higher priority, dequeued first', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('low-prio', 100)
      pq.enqueue('high-prio', 0)
      pq.enqueue('mid-prio', 50)
      assert.strictEqual(pq.dequeue(), 'high-prio')
      assert.strictEqual(pq.dequeue(), 'mid-prio')
      assert.strictEqual(pq.dequeue(), 'low-prio')
    })

    it('same priority preserves insert order (FIFO for equal priority)', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('first', 1)
      pq.enqueue('second', 1)
      pq.enqueue('third', 1)
      assert.strictEqual(pq.dequeue(), 'first')
      assert.strictEqual(pq.dequeue(), 'second')
      assert.strictEqual(pq.dequeue(), 'third')
    })

    it('handles many items (1000)', () => {
      const pq = new PriorityQueue<number>()
      for (let i = 999; i >= 0; i--) {
        pq.enqueue(i, i)
      }
      assert.strictEqual(pq.size(), 1000)
      for (let i = 0; i < 1000; i++) {
        assert.strictEqual(pq.dequeue(), i)
      }
      assert.strictEqual(pq.size(), 0)
    })

    it('handles negative priorities', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('zero', 0)
      pq.enqueue('minus-ten', -10)
      pq.enqueue('minus-five', -5)
      assert.strictEqual(pq.dequeue(), 'minus-ten')
      assert.strictEqual(pq.dequeue(), 'minus-five')
      assert.strictEqual(pq.dequeue(), 'zero')
    })

    it('handles float priorities', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('a', 1.5)
      pq.enqueue('b', 1.1)
      pq.enqueue('c', 2.0)
      pq.enqueue('d', 1.1)
      assert.strictEqual(pq.dequeue(), 'b')
      assert.strictEqual(pq.dequeue(), 'd')
      assert.strictEqual(pq.dequeue(), 'a')
      assert.strictEqual(pq.dequeue(), 'c')
    })

    it('handles mixed priorities with interleaved enqueue and dequeue', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('a', 5)
      pq.enqueue('b', 3)
      assert.strictEqual(pq.dequeue(), 'b')
      pq.enqueue('c', 1)
      pq.enqueue('d', 4)
      assert.strictEqual(pq.dequeue(), 'c')
      assert.strictEqual(pq.dequeue(), 'd')
      assert.strictEqual(pq.dequeue(), 'a')
    })
  })

  describe('maxSize enforcement', () => {
    it('allows enqueue up to maxSize', () => {
      const pq = new PriorityQueue<number>({ maxSize: 3 })
      pq.enqueue(1, 1)
      pq.enqueue(2, 2)
      pq.enqueue(3, 3)
      assert.strictEqual(pq.size(), 3)
    })

    it('throws when exceeding maxSize', () => {
      const pq = new PriorityQueue<number>({ maxSize: 2 })
      pq.enqueue(1, 1)
      pq.enqueue(2, 2)
      assert.throws(
        () => pq.enqueue(3, 3),
        { message: 'PriorityQueue is full' },
      )
    })

    it('maxSize can be safely reached again after dequeue', () => {
      const pq = new PriorityQueue<number>({ maxSize: 2 })
      pq.enqueue(1, 1)
      pq.enqueue(2, 2)
      pq.dequeue()
      pq.enqueue(3, 3)
      assert.strictEqual(pq.size(), 2)
    })

    it('no maxSize limit when not specified', () => {
      const pq = new PriorityQueue<number>()
      for (let i = 0; i < 1000; i++) {
        pq.enqueue(i, i)
      }
      assert.strictEqual(pq.size(), 1000)
    })
  })

  describe('edge cases', () => {
    it('single item enqueue and dequeue', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('only', 42)
      assert.strictEqual(pq.peek(), 'only')
      assert.strictEqual(pq.size(), 1)
      assert.strictEqual(pq.dequeue(), 'only')
      assert.strictEqual(pq.size(), 0)
      assert.strictEqual(pq.isEmpty(), true)
    })

    it('peek does not modify queue', () => {
      const pq = new PriorityQueue<number>()
      pq.enqueue(10, 5)
      assert.strictEqual(pq.peek(), 10)
      assert.strictEqual(pq.peek(), 10)
      assert.strictEqual(pq.size(), 1)
    })

    it('clear after clear is idempotent', () => {
      const pq = new PriorityQueue<number>()
      pq.clear()
      assert.strictEqual(pq.size(), 0)
      pq.enqueue(1, 1)
      pq.clear()
      pq.clear()
      assert.strictEqual(pq.size(), 0)
    })

    it('toArray returns independent copy', () => {
      const pq = new PriorityQueue<string>()
      pq.enqueue('x', 1)
      const arr = pq.toArray()
      arr[0] = { priority: 99, value: 'mutated' }
      assert.strictEqual(pq.peek(), 'x')
    })

    it('dequeue on empty returns undefined', () => {
      const pq = new PriorityQueue<number>()
      assert.strictEqual(pq.dequeue(), undefined)
      assert.strictEqual(pq.dequeue(), undefined)
      assert.strictEqual(pq.size(), 0)
    })

    it('handles alternating enqueue and dequeue many times', () => {
      const pq = new PriorityQueue<number>()
      for (let i = 0; i < 100; i++) {
        pq.enqueue(i, i)
        assert.strictEqual(pq.dequeue(), i)
        assert.strictEqual(pq.size(), 0)
      }
    })
  })
})
