import { Ptr } from 'rustable';

export class Cell<T> {
  private inner: T;

  constructor(inner: T) {
    this.inner = inner;
  }

  get(): T {
    return this.inner;
  }

  set(value: T): void {
    this.inner = value;
  }

  toInner(): T {
    return this.inner;
  }

  toPtr(): Ptr<T> {
    return Ptr({
      get: () => this.get(),
      set: (value) => this.set(value),
    });
  }
}
