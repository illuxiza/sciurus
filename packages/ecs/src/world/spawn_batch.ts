import { BundleSpawner } from '../bundle/spawner';
import { type Entity } from '../entity';
import { type World } from './base';

export class SpawnBatchIter<I extends Iterator<any>> {
  private inner: I;
  private spawner: BundleSpawner;
  private caller?: string;

  constructor(world: World, iter: I, caller?: string) {
    world.flush();
    const changeTick = world.changeTick;
    const spawner = BundleSpawner.newLazy(world, changeTick);
    this.inner = iter;
    this.spawner = spawner;
    this.caller = caller;
  }

  static new<I extends Iterator<any>>(world: World, iter: I, caller?: string) {
    return new SpawnBatchIter(world, iter, caller);
  }

  [Symbol.iterator](): IterableIterator<Entity> {
    return this;
  }

  next(): IteratorResult<Entity> {
    const bundle = this.inner.next();
    if (bundle.done) {
      return { done: true, value: undefined };
    }
    return { done: false, value: this.spawner.spawnLazy(bundle.value, this.caller) };
  }

  drop(): void {
    while (!this.next().done) {
      /* empty */
    }
    this.spawner.flushCommands();
  }

  [Symbol.dispose]() {
    this.drop();
  }
}
