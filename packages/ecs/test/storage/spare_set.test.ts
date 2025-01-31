import { derive, iter, None, Some } from 'rustable';
import { Component, ComponentDescriptor, ComponentInfo } from '../../src/component';
import { Entity, EntityIndex } from '../../src/entity';
import { SparseSet, SparseSets } from '../../src/storage';
import '@rustable/iter/advanced';

class Foo {
  constructor(public value: number) {}
}

describe('SparseSet', () => {
  it('should handle basic operations', () => {
    const set = new SparseSet<EntityIndex, Foo>();
    const e0 = Entity.fromRaw(0);
    const e1 = Entity.fromRaw(1);
    const e2 = Entity.fromRaw(2);
    const e3 = Entity.fromRaw(3);
    const e4 = Entity.fromRaw(4);

    set.insert(e1.index, new Foo(1));
    set.insert(e2.index, new Foo(2));
    set.insert(e3.index, new Foo(3));

    expect(set.get(e0.index)).toBe(None);
    expect(set.get(e1.index)).toEqual(Some(new Foo(1)));
    expect(set.get(e2.index)).toEqual(Some(new Foo(2)));
    expect(set.get(e3.index)).toEqual(Some(new Foo(3)));
    expect(set.get(e4.index)).toBe(None);

    const iterResults = Array.from(set.values());
    expect(iterResults).toEqual([new Foo(1), new Foo(2), new Foo(3)]);

    expect(set.remove(e2.index)).toEqual(Some(new Foo(2)));
    expect(set.remove(e2.index)).toBe(None);

    expect(set.get(e0.index)).toBe(None);
    expect(set.get(e1.index)).toEqual(Some(new Foo(1)));

    expect(set.get(e2.index)).toBe(None);

    expect(set.get(e3.index)).toEqual(Some(new Foo(3)));

    expect(set.get(e4.index)).toBe(None);

    expect(set.remove(e1.index)).toEqual(Some(new Foo(1)));

    expect(set.get(e0.index)).toBe(None);
    expect(set.get(e1.index)).toBe(None);
    expect(set.get(e2.index)).toBe(None);
    expect(set.get(e3.index)).toEqual(Some(new Foo(3)));
    expect(set.get(e4.index)).toBe(None);

    set.insert(e1.index, new Foo(10));
    expect(set.get(e1.index)).toEqual(Some(new Foo(10)));

    const mutValue = set.get(e1.index);
    mutValue.map((foo) => {
      foo.value = 11;
    });
    expect(set.get(e1.index)).toEqual(Some(new Foo(11)));
  });
});

describe('SparseSets', () => {
  it('should handle multiple components', () => {
    const sets = new SparseSets();

    @derive([Component])
    class TestComponent1 {}

    @derive([Component])
    class TestComponent2 {}

    expect(sets.len()).toBe(0);
    expect(sets.isEmpty()).toBe(true);

    initComponent(sets, TestComponent1, 1);
    expect(sets.len()).toBe(1);

    initComponent(sets, TestComponent2, 2);
    expect(sets.len()).toBe(2);

    const collectedSets = iter(sets.iter())
      .map(([id, set]) => [id, set.len()])
      .sort((a, b) => a[0] - b[0]);

    expect(collectedSets.collect()).toEqual([
      [1, 0],
      [2, 0],
    ]);

    function initComponent<T>(sets: SparseSets, componentType: new () => T, id: number) {
      const descriptor = new ComponentDescriptor(componentType);
      const componentId = id;
      const info = new ComponentInfo(componentId, descriptor);
      sets.getOrInsert(info);
    }
  });
});
