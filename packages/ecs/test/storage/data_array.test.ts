import { Some } from 'rustable';
import { DataArray } from '../../src/storage/data_array';

class Foo {
  constructor(
    public a: number,
    public b: string,
    public dropCounter: { value: number },
  ) {}

  clone(): Foo {
    return new Foo(this.a, this.b, this.dropCounter);
  }
}

describe('DataArray', () => {
  test('basic operations', () => {
    const array = new DataArray<number>();
    array.push(1);
    array.push(2);
    array.push(3);

    expect(array.len).toBe(3);
    expect(array.get(0)).toBe(1);
    expect(array.get(1)).toBe(2);
    expect(array.get(2)).toBe(3);

    array.swapRemove(1);
    expect(array.len).toBe(2);
    expect(array.get(0)).toBe(1);
    expect(array.get(1)).toBe(3);
  });

  test('array operations', () => {
    const dropCounter = { value: 0 };
    const dropFn = (_foo: Foo) => {
      dropCounter.value += 1;
    };

    const array = new DataArray<Foo>(Some(dropFn));

    // Test push and get
    const foo1 = new Foo(42, 'abc', dropCounter);
    array.push(foo1);
    expect(array.len).toBe(1);
    expect(array.get(0)).toEqual(foo1);

    // Test push and array growth
    const foo2 = new Foo(7, 'xyz', dropCounter);
    array.push(foo2);
    expect(array.len).toBe(2);
    expect(array.get(0)).toEqual(foo1);
    expect(array.get(1)).toEqual(foo2);

    // Test value replacement
    const foo2Updated = new Foo(8, 'xyz', dropCounter);
    array.replace(1, foo2Updated);
    expect(dropCounter.value).toBe(1); // foo2 should be dropped
    expect(array.get(1).a).toBe(8);

    // Test additional push
    const foo3 = new Foo(16, '123', dropCounter);
    array.push(foo3);
    expect(array.len).toBe(3);

    // Test swap remove
    const lastIndex = array.len - 1;
    array.swapRemoveAndDrop(lastIndex);
    expect(dropCounter.value).toBe(2); // foo3 should be dropped
    expect(array.len).toBe(2);

    array.swapRemoveAndDrop(0);
    expect(dropCounter.value).toBe(3); // foo1 should be dropped
    expect(array.len).toBe(1);

    expect(array.get(0)).toEqual(foo2Updated);
  });

  test('drop functionality', () => {
    const dropCounter = { value: 0 };
    const dropFn = (_foo: Foo) => {
      dropCounter.value += 1;
    };

    const array = new DataArray<Foo>(Some(dropFn));
    const foo1 = new Foo(1, 'a', dropCounter);
    const foo2 = new Foo(2, 'b', dropCounter);
    const foo3 = new Foo(3, 'c', dropCounter);

    array.push(foo1);
    array.push(foo2);
    array.push(foo3);

    array.clear();
    expect(dropCounter.value).toBe(3);
    expect(array.len).toBe(0);
  });

  test('slice operations', () => {
    const array = new DataArray<number>();
    array.push(1);
    array.push(2);
    array.push(3);

    const slice = array.asSlice(2);
    expect(slice).toEqual([1, 2]);
    expect(slice.length).toBe(2);

    const fullSlice = array.asSlice();
    expect(fullSlice).toEqual([1, 2, 3]);
    expect(fullSlice.length).toBe(3);
  });

  test('empty initialization', () => {
    const dropFn = (_foo: Foo) => {};
    const array = new DataArray<Foo>(Some(dropFn));
    expect(array.len).toBe(0);
    expect(array.isEmpty()).toBe(true);
  });

  test('clear with length', () => {
    const dropCounter = { value: 0 };
    const dropFn = (_foo: Foo) => {
      dropCounter.value += 1;
    };

    const array = new DataArray<Foo>(Some(dropFn));
    const foo1 = new Foo(1, 'test1', dropCounter);
    const foo2 = new Foo(2, 'test2', dropCounter);
    const foo3 = new Foo(3, 'test3', dropCounter);

    array.push(foo1);
    array.push(foo2);
    array.push(foo3);

    // Clear only first two elements
    array.clear(2);
    expect(dropCounter.value).toBe(2);
    expect(array.len).toBe(3);
    expect(array.get(0)).toBeUndefined();
    expect(array.get(1)).toBeUndefined();
    expect(array.get(2)).toEqual(foo3);
  });
});
