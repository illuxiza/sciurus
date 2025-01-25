import { EntityRef } from '../../src/world/entity_ref/ref';
import { derive, Ptr, Some } from 'rustable';
import { Component, ComponentId, Resource } from '../../src/component';
import { component } from '../../src/component/decorator';
import { Entity } from '../../src/entity/base';
import { World } from '../../src/world/base';
import { DeferredWorld } from '../../src/world/deferred';

// Test module
describe('Bundle Tests', () => {
  // Component definitions
  @derive([Component])
  class A {}

  @derive([Component])
  @component({
    onAdd: aOnAdd,
    onInsert: aOnInsert,
    onReplace: aOnReplace,
    onRemove: aOnRemove,
  })
  class AMacroHooks {}

  // Helper functions for component hooks
  function aOnAdd(world: DeferredWorld, _entity: Entity, _componentId: ComponentId) {
    world.resource<R>(R).assertOrder(0);
  }

  function aOnInsert<T1, T2>(world: DeferredWorld, _param1: T1, _param2: T2) {
    world.resource<R>(R).assertOrder(1);
  }

  function aOnReplace<T1, T2>(world: DeferredWorld, _param1: T1, _param2: T2) {
    world.resource<R>(R).assertOrder(2);
  }

  function aOnRemove<T1, T2>(world: DeferredWorld, _param1: T1, _param2: T2) {
    world.resource<R>(R).assertOrder(3);
  }

  @derive([Component])
  class B {}
  @derive([Component])
  class C {}
  @derive([Component])
  class D {}
  @derive([Component])
  class V {
    constructor(public value: string) {}
  }

  // Resource definition
  @derive([Resource])
  class R {
    count: number = 0;

    assertOrder(count: number) {
      expect(count).toBe(this.count);
      this.count++;
    }
  }

  // Tests
  test('component_hook_order_spawn_despawn', () => {
    const world = new World();
    world.initResource<R>(R);
    world
      .registerComponentHooks<A>(A)
      .onAdd((world, _e, _c) => world.resource<R>(R).assertOrder(0))
      .onInsert((world, _e, _c) => world.resource<R>(R).assertOrder(1))
      .onReplace((world, _e, _c) => world.resource<R>(R).assertOrder(2))
      .onRemove((world, _e, _c) => world.resource<R>(R).assertOrder(3));
    const entity = world.spawn(new A());
    world.despawn(entity.id);
    expect(world.resource<R>(R).count).toBe(4);
  });

  test('component_hook_order_spawn_despawn_with_macro_hooks', () => {
    const world = new World();
    world.initResource<R>(R);
    const entity = world.spawn(new AMacroHooks());
    world.despawn(entity.id);
    expect(world.resource<R>(R).count).toBe(4);
  });

  test('component_hook_order_insert_remove', () => {
    const world = new World();
    world.initResource<R>(R);
    world
      .registerComponentHooks<A>(A)
      .onAdd((world, _e, _c) => world.resource<R>(R).assertOrder(0))
      .onInsert((world, _e, _c) => world.resource<R>(R).assertOrder(1))
      .onReplace((world, _e, _c) => world.resource<R>(R).assertOrder(2))
      .onRemove((world, _e, _c) => world.resource<R>(R).assertOrder(3));
    const entity = world.spawnEmpty();
    entity.insert(new A());
    entity.remove<A>(A);
    entity.flush();
    expect(world.resource<R>(R).count).toBe(4);
  });

  test('component_hook_order_replace', () => {
    const world = new World();
    world
      .registerComponentHooks<A>(A)
      .onReplace((world, _e, _c) => world.resource<R>(R).assertOrder(0))
      .onInsert((world, _e, _c) => {
        const r = world.getResource<R>(R);
        if (r.isSome()) {
          r.unwrap().assertOrder(1);
        }
      });
    const entity = world.spawn(new A()).id;
    world.initResource<R>(R);
    const entityMut = world.entity(entity);
    entityMut.insert(new A());
    entityMut.insertIfNew(new A()); // this will not trigger onReplace or onInsert
    entityMut.flush();
    expect(world.resource<R>(R).count).toBe(2);
  });

  test('component_hook_order_recursive', () => {
    const world = new World();
    world.initResource<R>(R);
    world
      .registerComponentHooks<A>(A)
      .onAdd((world, entity, _) => {
        world.resource<R>(R).assertOrder(0);
        world.commands.entity(entity).insert(new B());
      })
      .onRemove((world, entity, _) => {
        world.resource<R>(R).assertOrder(2);
        world.commands.entity(entity).remove(B);
      });
    world
      .registerComponentHooks<B>(B)
      .onAdd((world, entity, _) => {
        world.resource<R>(R).assertOrder(1);
        world.commands.entity(entity).remove(A);
      })
      .onRemove((world, _e, _c) => {
        world.resource<R>(R).assertOrder(3);
      });
    const entityId = world.spawn(new A()).flush();
    const entity = world.getEntity(entityId);
    const entityRef = entity.unwrap() as EntityRef;

    expect(entityRef.contains(A)).toBe(false);
    expect(entityRef.contains(B)).toBe(false);
    expect(world.resource<R>(R).count).toBe(4);
  });

  test('component_hook_order_recursive_multiple', () => {
    const world = new World();
    world.initResource<R>(R);
    world.registerComponentHooks<A>(A).onAdd((world, entity, _) => {
      world.resource<R>(R).assertOrder(0);
      world.commands.entity(entity).insert(new B()).insert(new C());
    });
    world.registerComponentHooks<B>(B).onAdd((world, entity, _) => {
      world.resource<R>(R).assertOrder(1);
      world.commands.entity(entity).insert(new D());
    });
    world.registerComponentHooks<C>(C).onAdd((world, _e, _c) => {
      world.resource<R>(R).assertOrder(3);
    });
    world.registerComponentHooks<D>(D).onAdd((world, _e, _c) => {
      world.resource<R>(R).assertOrder(2);
    });
    world.spawn(new A()).flush();
    expect(world.resource<R>(R).count).toBe(4);
  });

  test('insert_if_new', () => {
    const world = new World();
    const id = world.spawn(new V('one')).id;
    const entity = world.entity(id);
    entity.insertIfNew(new V('two'));
    entity.insertIfNew([new A(), new V('three')]);
    entity.flush();
    // should still contain "one"
    const entityRef = world.entity(id);
    expect(entityRef.contains(A)).toBe(true);
    expect(entityRef.get(V).map((v) => (v as Ptr<V>)[Ptr.ptr])).toEqual(Some(new V('one')));
  });
});
