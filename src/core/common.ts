export type IteratorImpl<TItem> = {
  [Symbol.iterator](): Iterator<TItem>
}

export type IterableElement<T> = T extends Iterable<infer U> ? U : never
