import { None, Option, Ptr, RustIter, Some, Vec } from 'rustable';
import { ComponentTicks, Tick } from '../change_detection/tick';
import { type ComponentId, type ComponentInfo } from '../component';
import { type Entity } from '../entity/base';
import { type EntityIndex } from '../entity/types';
import { Column } from './table/column';
import { type TableRow } from './types';

export class ImmutableSparseArray<I extends number, V> {
  private readonly __values: Vec<Option<V>>;

  constructor(values: Vec<Option<V>>) {
    this.__values = values;
  }

  contains(index: I): boolean {
    return this.__values
      .get(index)
      .map((v) => v.isSome())
      .unwrapOr(false);
  }

  get(index: I): Option<V> {
    return this.__values.get(index).unwrapOr(None);
  }
}

export class SparseArray<I extends number, V> {
  private __values: Vec<Option<V>> = Vec.new();

  contains(index: I): boolean {
    return this.__values
      .get(index)
      .map((v) => v.isSome())
      .unwrapOr(false);
  }

  get(index: I): Option<V> {
    return this.__values.get(index).unwrapOr(None);
  }

  getMut(index: I): Option<Ptr<V>> {
    return this.__values.getMut(index).map((mut) =>
      Ptr({
        get: () => mut[Ptr.ptr].unwrap(),
        set: (value) => (mut[Ptr.ptr] = Some(value)),
      }),
    );
  }

  insert(index: I, value: V) {
    if (index >= this.__values.len()) {
      this.__values.resizeWith(index + 1, () => None);
    }
    this.__values[index] = Some(value);
  }

  remove(index: I): Option<V> {
    return this.__values.getMut(index).andThen((mut) => {
      const value = mut[Ptr.ptr];
      if (mut.isSome()) {
        mut[Ptr.ptr] = None;
      }
      return value;
    });
  }

  clear() {
    this.__values.clear();
  }

  intoImmutable(): ImmutableSparseArray<I, V> {
    return new ImmutableSparseArray(this.__values);
  }
}

export class ImmutableSparseSet<I extends number, V> {
  constructor(
    private readonly __indices: Vec<I>,
    private readonly __dense: Vec<V>,
    private readonly __sparse: ImmutableSparseArray<I, number>,
  ) {}

  len(): number {
    return this.__dense.len();
  }

  contains(index: I) {
    return this.__sparse.contains(index);
  }

  get(index: I): Option<V> {
    return this.__sparse.get(index).map((denseIndex) => this.__dense[denseIndex]);
  }

  getMut(index: I): Option<Ptr<V>> {
    return this.__sparse.get(index).map((denseIndex) => {
      return Ptr({
        get: () => this.__dense[denseIndex],
        set: (value) => (this.__dense[denseIndex] = value),
      });
    });
  }

  getUnchecked(index: I): V {
    return this.__dense[this.__sparse.get(index).unwrap()];
  }

  indices(): RustIter<I> {
    return this.__indices.iter().cloned();
  }

  values(): RustIter<V> {
    return this.__dense.iter();
  }

  iter(): RustIter<[I, V]> {
    return this.__indices.iter().zip(this.__dense.iter());
  }
}

export class ComponentSparseSet {
  private __dense: Column;
  private __entities: Vec<Entity>;
  private __sparse: SparseArray<EntityIndex, TableRow>;

  constructor(componentInfo: ComponentInfo) {
    this.__dense = new Column(componentInfo);
    this.__entities = Vec.new();
    this.__sparse = new SparseArray();
  }

  clear() {
    this.__dense.clear();
    this.__entities.clear();
    this.__sparse.clear();
  }
  len(): number {
    return this.__dense.len();
  }

  isEmpty(): boolean {
    return this.__dense.len() === 0;
  }

  insert(entity: Entity, value: any, changeTick: Tick, caller?: string) {
    const denseIndex = this.__sparse.get(entity.index);
    if (denseIndex.isSome()) {
      this.__dense.replace(denseIndex.unwrap(), value, changeTick, caller);
      return;
    }
    const denseLength = this.__dense.len();
    this.__dense.push(value, ComponentTicks.new(changeTick), caller);
    this.__sparse.insert(entity.index, denseLength);
    this.__entities.push(entity);
  }

  contains(entity: Entity) {
    const denseIndex = this.__sparse.get(entity.index);
    if (denseIndex.isNone()) {
      return false;
    }
    return this.__entities.get(denseIndex.unwrap()).isSomeAnd((e) => e.eq(entity));
  }

  get(entity: Entity): Option<any> {
    return this.__sparse
      .get(entity.index)
      .map((denseIndex) => this.__dense.getDataUnchecked(denseIndex));
  }

  getWithTicks(entity: Entity): Option<[Ptr<any>, ComponentTicks, Ptr<string>]> {
    return this.__sparse
      .get(entity.index)
      .map((denseIndex) => [
        this.__dense.getDataMut(denseIndex).unwrap(),
        this.__dense.getTicksUnchecked(denseIndex),
        this.__dense.getChangedByMut(denseIndex).unwrap(),
      ]);
  }

  getAddedTick(entity: Entity): Option<Tick> {
    return this.__sparse
      .get(entity.index)
      .map((denseIndex) => this.__dense.getAddedTickUnchecked(denseIndex));
  }

  getChangedTick(entity: Entity): Option<Tick> {
    return this.__sparse
      .get(entity.index)
      .map((denseIndex) => this.__dense.getChangedTickUnchecked(denseIndex));
  }

  getTicks(entity: Entity): Option<ComponentTicks> {
    return this.__sparse
      .get(entity.index)
      .map((denseIndex) => this.__dense.getTicksUnchecked(denseIndex));
  }

  removeAndForget(entity: Entity): Option<any> {
    return this.__sparse.remove(entity.index).map((denseIndex) => {
      this.__entities.swapRemove(denseIndex);
      const isLast = denseIndex === this.__dense.len() - 1;
      const [value] = this.__dense.swapRemoveAndForget(denseIndex);
      if (!isLast) {
        const swappedEntity = this.__entities.get(denseIndex).unwrap();
        this.__sparse.getMut(swappedEntity.index).unwrap()[Ptr.ptr] = denseIndex;
      }
      return value;
    });
  }

  remove(entity: Entity) {
    return this.__sparse.remove(entity.index).map((denseIndex) => {
      this.__entities.swapRemove(denseIndex);
      const isLast = denseIndex === this.__dense.len() - 1;
      this.__dense.swapRemove(denseIndex);
      if (!isLast) {
        const last = this.__entities.get(denseIndex).unwrap();
        this.__sparse.getMut(last.index).unwrap()[Ptr.ptr] = denseIndex;
      }
    });
  }

  checkChangeTicks(changeTick: Tick) {
    this.__dense.checkChangeTicks(changeTick);
  }
}

export class SparseSet<I extends number, V> {
  private __dense: Vec<V> = Vec.new();
  private __indices: Vec<I> = Vec.new();
  private __sparse: SparseArray<I, number> = new SparseArray();

  len(): number {
    return this.__dense.len();
  }

  contains(index: I) {
    return this.__sparse.contains(index);
  }

  get(index: I): Option<V> {
    return this.__sparse.get(index).map((denseIndex) => {
      return this.__dense[denseIndex];
    });
  }

  getMut(index: I): Option<Ptr<V>> {
    return this.__sparse.get(index).andThen((denseIndex) => {
      return this.__dense.getMut(denseIndex);
    });
  }

  indices(): RustIter<I> {
    return this.__indices.iter().cloned();
  }

  values(): RustIter<V> {
    return this.__dense.iter();
  }

  iter(): RustIter<[I, V]> {
    return this.__indices.iter().zip(this.__dense.iter());
  }

  insert(index: I, value: V) {
    this.__sparse
      .get(index)
      .map((denseIndex) => this.__dense.insert(denseIndex, value))
      .orElse(() => {
        this.__sparse.insert(index, this.__dense.len());
        this.__indices.push(index);
        this.__dense.push(value);
        return None;
      });
  }

  getOrInsertWith(index: I, func: () => V) {
    return this.__sparse.get(index).match({
      Some: (denseIndex) => {
        return this.__dense[denseIndex];
      },
      None: () => {
        const value = func();
        const denseIndex = this.__dense.len();
        this.__sparse.insert(index, denseIndex);
        this.__indices.push(index);
        this.__dense.push(value);
        return this.__dense[denseIndex];
      },
    });
  }

  isEmpty() {
    return this.__dense.len() === 0;
  }

  remove(index: I): Option<V> {
    let value = this.__sparse.remove(index).map((denseIndex) => {
      const isLast = denseIndex === this.__dense.len() - 1;
      const value = this.__dense.swapRemove(denseIndex);
      this.__indices.swapRemove(denseIndex);
      if (!isLast) {
        const swappedIndex = this.__indices.get(denseIndex).unwrap();
        this.__sparse.getMut(swappedIndex).unwrap()[Ptr.ptr] = denseIndex;
      }
      return value;
    });
    return value;
  }

  clear() {
    this.__dense.clear();
    this.__indices.clear();
    this.__sparse.clear();
  }

  intoImmutable() {
    return new ImmutableSparseSet<I, V>(
      Vec.from(this.__indices),
      Vec.from(this.__dense),
      this.__sparse.intoImmutable(),
    );
  }
}

export class SparseSets {
  sets: SparseSet<ComponentId, ComponentSparseSet> = new SparseSet<
    ComponentId,
    ComponentSparseSet
  >();

  len() {
    return this.sets.len();
  }

  isEmpty() {
    return this.sets.isEmpty();
  }

  iter(): Iterable<[ComponentId, ComponentSparseSet]> {
    return this.sets.iter();
  }

  get(id: ComponentId): Option<ComponentSparseSet> {
    return this.sets.get(id);
  }

  getOrInsert(componentInfo: ComponentInfo) {
    return this.sets.getOrInsertWith(componentInfo.id, () => new ComponentSparseSet(componentInfo));
  }

  clearEntities() {
    for (const set of this.sets.values()) {
      set.clear();
    }
  }

  checkChangeTicks(changeTick: Tick) {
    for (const set of this.sets.values()) {
      set.checkChangeTicks(changeTick);
    }
  }
}
