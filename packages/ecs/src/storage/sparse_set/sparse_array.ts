import { None, Option, Ptr, Some, Vec } from 'rustable';

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
