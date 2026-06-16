export type PriorityQueueItem<T> = {
  priority: number
  value: T
}

export type PriorityQueueOptions = {
  maxSize?: number
}
