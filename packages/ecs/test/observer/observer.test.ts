import { EntityCell } from 'packages/ecs/src/world/entity_ref/cell';
import { Default, derive, Option, Some, Vec } from 'rustable';
import { Component, ComponentId, Res, Resource, World } from '../../src';
import { component } from '../../src/component';
import { Entity } from '../../src/entity/base';
import { Event } from '../../src/event';
import { Observer, ObserverState } from '../../src/observer/runner';
import { ObserverDescriptor, Trigger } from '../../src/observer/types';
import { StorageType } from '../../src/storage';
import { observer } from '../../src/observer';
import { Commands } from '../../src/system/commands/base';
import { Query } from '../../src/system/param/query';
import { Traversal } from '../../src/traversal';
import { OnAdd, OnInsert, OnRemove, OnReplace } from '../../src/world/component_constants';
import { DeferredWorld } from '../../src/world/deferred';

@derive([Component])
class A {}

@derive([Component])
class B {}

@derive([Component])
@component({
  storage: StorageType.SparseSet,
})
class S {}

@derive([Event])
class EventA {}

@derive([Event])
class EventWithData {
  counter: number = 0;
}

@derive([Resource, Default])
class Order {
  private orders: string[] = [];

  observed(name: string) {
    this.orders.push(name);
  }

  get(): string[] {
    return this.orders;
  }
}

@derive([Component])
class Parent {
  constructor(public entity: Entity) {}
}

Traversal.implFor(Parent, {
  static: {
    traverse<D>(item: Parent, _: D): Option<Entity> {
      return Some(item.entity);
    },
  },
});

@derive([Event])
class EventPropagating {
  static traversal() {
    return Parent;
  }
  static autoPropagate() {
    return true;
  }
}

describe('Observer Tests', () => {
  test('observer_order_spawn_despawn', () => {
    const world = new World();
    world.initResource(Order);

    world.addObserver(
      OnAdd,
      A,
      observer([Res(Order)], (_: Trigger<OnAdd, A>, res: Res<Order>) => res.observed('add')),
    );
    world.addObserver(
      OnInsert,
      A,
      observer([Res(Order)], (_: Trigger<OnInsert, A>, res: Res<Order>) => res.observed('insert')),
    );
    world.addObserver(
      OnReplace,
      A,
      observer([Res(Order)], (_: Trigger<OnReplace, A>, res: Res<Order>) =>
        res.observed('replace'),
      ),
    );
    world.addObserver(
      OnRemove,
      A,
      observer([Res(Order)], (_: Trigger<OnRemove, A>, res: Res<Order>) => res.observed('remove')),
    );

    const entity = world.spawn(new A()).id;
    world.despawn(entity);
    expect(world.resource(Order).get()).toEqual(['add', 'insert', 'replace', 'remove']);
  });

  test('observer_order_insert_remove', () => {
    const world = new World();
    world.initResource(Order);

    world.addObserver(
      OnAdd,
      A,
      observer([Res(Order)], (_: Trigger<OnAdd, A>, res: Res<Order>) => res.observed('add')),
    );
    world.addObserver(
      OnInsert,
      A,
      observer([Res(Order)], (_: Trigger<OnInsert, A>, res: Res<Order>) => res.observed('insert')),
    );
    world.addObserver(
      OnReplace,
      A,
      observer([Res(Order)], (_: Trigger<OnReplace, A>, res: Res<Order>) =>
        res.observed('replace'),
      ),
    );
    world.addObserver(
      OnRemove,
      A,
      observer([Res(Order)], (_: Trigger<OnRemove, A>, res: Res<Order>) => res.observed('remove')),
    );

    const entity = world.spawnEmpty();
    entity.insert(new A());
    entity.remove(A);
    entity.flush();
    expect(world.resource(Order).get()).toEqual(['add', 'insert', 'replace', 'remove']);
  });

  test('observer_order_insert_remove_sparse', () => {
    const world = new World();
    world.initResource(Order);

    world.addObserver(
      OnAdd,
      S,
      observer([Res(Order)], (_: Trigger<OnAdd, S>, res: Res<Order>) => res.observed('add')),
    );
    world.addObserver(
      OnInsert,
      S,
      observer([Res(Order)], (_: Trigger<OnInsert, S>, res: Res<Order>) => res.observed('insert')),
    );
    world.addObserver(
      OnReplace,
      S,
      observer([Res(Order)], (_: Trigger<OnReplace, S>, res: Res<Order>) =>
        res.observed('replace'),
      ),
    );
    world.addObserver(
      OnRemove,
      S,
      observer([Res(Order)], (_: Trigger<OnRemove, S>, res: Res<Order>) => res.observed('remove')),
    );

    const entity = world.spawnEmpty();
    entity.insert(new S());
    entity.remove(S);
    entity.flush();
    expect(world.resource(Order).get()).toEqual(['add', 'insert', 'replace', 'remove']);
  });

  test('observer_order_replace', () => {
    const world = new World();
    world.initResource(Order);

    const entity = world.spawn(new A()).id;

    world.addObserver(
      OnAdd,
      A,
      observer([Res(Order)], (_: Trigger<OnAdd, A>, res: Res<Order>) => res.observed('add')),
    );
    world.addObserver(
      OnInsert,
      A,
      observer([Res(Order)], (_: Trigger<OnInsert, A>, res: Res<Order>) => res.observed('insert')),
    );
    world.addObserver(
      OnReplace,
      A,
      observer([Res(Order)], (_: Trigger<OnReplace, A>, res: Res<Order>) =>
        res.observed('replace'),
      ),
    );
    world.addObserver(
      OnRemove,
      A,
      observer([Res(Order)], (_: Trigger<OnRemove, A>, res: Res<Order>) => res.observed('remove')),
    );

    world.flush();

    const entityMut = world.entity(entity);
    entityMut.insert(new A());
    entityMut.flush();
    expect(world.resource(Order).get()).toEqual(['replace', 'insert']);
  });

  test('observer_order_recursive', () => {
    const world = new World();
    world.initResource(Order);

    world.addObserver(
      OnAdd,
      A,
      observer(
        [Res(Order), Commands],
        (obs: Trigger<OnAdd, A>, res: Res<Order>, commands: Commands) => {
          res.observed('add_a');
          commands.entity(obs.target).insert(new B());
        },
      ),
    );

    world.addObserver(
      OnRemove,
      A,
      observer(
        [Res(Order), Commands],
        (obs: Trigger<OnRemove, A>, res: Res<Order>, commands: Commands) => {
          res.observed('remove_a');
          commands.entity(obs.target).remove(B);
        },
      ),
    );

    world.addObserver(
      OnAdd,
      B,
      observer(
        [Res(Order), Commands],
        (obs: Trigger<OnAdd, B>, res: Res<Order>, commands: Commands) => {
          res.observed('add_b');
          commands.entity(obs.target).remove(A);
        },
      ),
    );

    world.addObserver(
      OnRemove,
      B,
      observer([Res(Order)], (_: Trigger<OnRemove, B>, res: Res<Order>) => {
        res.observed('remove_b');
      }),
    );

    const entity = world.spawn(new A()).flush();
    const entityRef = world.fetchEntity(entity).unwrap() as EntityCell;
    expect(entityRef?.contains(A)).toBeFalsy();
    expect(entityRef?.contains(B)).toBeFalsy();
    expect(world.resource(Order).get()).toEqual(['add_a', 'add_b', 'remove_a', 'remove_b']);
  });

  test('observer_trigger_ref', () => {
    const world = new World();

    world.addObserver(
      EventWithData,
      [],
      observer([], (trigger: Trigger<EventWithData>) => {
        trigger.event.counter += 1;
      }),
    );
    world.addObserver(
      EventWithData,
      [],
      observer([], (trigger: Trigger<EventWithData>) => {
        trigger.event.counter += 2;
      }),
    );
    world.addObserver(
      EventWithData,
      [],
      observer([], (trigger: Trigger<EventWithData>) => {
        trigger.event.counter += 4;
      }),
    );
    world.flush();

    const event = new EventWithData();
    world.trigger(event);
    expect(event.counter).toBe(7);
  });

  test('observer_multiple_events', () => {
    const world = new World();
    world.initResource(Order);
    const onRemove = OnRemove.registerComponentId(world);

    world.spawn(
      new Observer(
        OnAdd,
        A,
        observer([Res(Order)], (_: Trigger<OnAdd, A>, res: Res<Order>) => {
          res.observed('add/remove');
        }),
      ).withEvent(onRemove),
    );

    const entity = world.spawn(new A()).id;
    world.despawn(entity);
    expect(world.resource(Order).get()).toEqual(['add/remove', 'add/remove']);
  });

  test('observer_multiple_components', () => {
    const world = new World();
    world.initResource(Order);
    world.registerComponent(A);
    world.registerComponent(B);

    world.addObserver(
      OnAdd,
      [A, B],
      observer([Res(Order)], (_: Trigger<OnAdd, A & B>, res: Res<Order>) => {
        res.observed('add_ab');
      }),
    );

    const entity = world.spawn(new A()).id;
    world.entity(entity).insert(new B());
    world.flush();
    expect(world.resource(Order).get()).toEqual(['add_ab', 'add_ab']);
  });

  test('observer_despawn', () => {
    const world = new World();

    const ob = world.addObserver(
      OnAdd,
      A,
      observer([], (_: Trigger<OnAdd, A>) => {
        throw new Error('Observer triggered after being despawned.');
      }),
    ).id;
    world.despawn(ob);
    world.spawn(new A()).flush();
  });

  test('observer_despawn_archetype_flags', () => {
    const world = new World();
    world.initResource(Order);
    const entity = world.spawn(new A()).insert(new B()).flush();
    world.addObserver(
      OnRemove,
      A,
      observer([Res(Order)], (_: Trigger<OnRemove, A>, res: Res<Order>) => {
        res.observed('remove_a');
      }),
    );
    const ob = world.addObserver(
      OnRemove,
      B,
      observer([], (_: Trigger<OnRemove, B>) => {
        throw new Error('Observer triggered after being despawned.');
      }),
    ).id;
    world.despawn(ob);
    world.despawn(entity);
    expect(world.resource(Order).get()).toEqual(['remove_a']);
  });

  test('observer_multiple_matches', () => {
    const world = new World();
    world.initResource(Order);
    world.addObserver(
      OnAdd,
      [A, B],
      observer([Res(Order)], (_: Trigger<OnAdd, A & B>, res: Res<Order>) => {
        res.observed('add_ab');
      }),
    );
    world.spawn([new A(), new B()]).flush();
    expect(world.resource(Order).get()).toEqual(['add_ab']);
  });

  test('observer_no_target', () => {
    const world = new World();
    world.initResource(Order);
    world.spawnEmpty().observe(
      EventA,
      [],
      observer([], (_: Trigger<EventA>) => {
        throw new Error('Trigger routed to non-targeted entity.');
      }),
    );
    world.addObserver(
      EventA,
      [],
      observer([Res(Order)], (obs: Trigger<EventA>, order: Res<Order>) => {
        expect(obs.target).toEqual(Entity.PLACEHOLDER);
        order.observed('event_a');
      }),
    );
    world.flush();
    world.trigger(new EventA());
    world.flush();
    expect(world.resource(Order).get()).toEqual(['event_a']);
  });

  test('observer_entity_routing', () => {
    const world = new World();
    world.initResource(Order);

    world.spawnEmpty().observe(
      EventA,
      [],
      observer([], (_: Trigger<EventA>) => {
        throw new Error('Trigger routed to non-targeted entity.');
      }),
    );
    const entity = world.spawnEmpty().observe(
      EventA,
      [],
      observer([Res(Order)], (_: Trigger<EventA>, res: Res<Order>) => res.observed('a_1')),
    ).id;
    world.addObserver(
      EventA,
      [],
      observer([Res(Order)], (obs: Trigger<EventA>, res: Res<Order>) => {
        expect(obs.target).toEqual(entity);
        res.observed('a_2');
      }),
    );

    world.flush();
    world.triggerTargets(new EventA(), entity);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['a_2', 'a_1']);
  });

  test('observer_dynamic_component', () => {
    const world = new World();
    world.initResource(Order);

    const componentId = world.registerComponent(A);
    world.spawn(
      new Observer(
        OnAdd,
        [],
        observer([Res(Order)], (_: Trigger<OnAdd>, res: Res<Order>) => res.observed('event_a')),
      ).withComponent(componentId),
    );

    const entity = world.spawnEmpty();
    entity.insertById(componentId, new A());
    const entityId = entity.flush();

    world.triggerTargets(new EventA(), entityId);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['event_a']);
  });

  test('observer_dynamic_trigger', () => {
    const world = new World();
    world.initResource(Order);
    const eventA = OnRemove.registerComponentId(world);

    world.spawn(
      new ObserverState(
        (world: DeferredWorld, _trigger: any, _ptr: any, _propagate: any) => {
          world.resource(Order).observed('event_a');
        },
        new ObserverDescriptor().withEvents(Vec.from([eventA])),
      ),
    );
    world.commands.queue((world: World) => {
      world.triggerTargetsDynamic(eventA, new EventA(), []);
    });
    world.flush();
    expect(world.resource(Order).get()).toEqual(['event_a']);
  });

  test('observer_propagating', () => {
    const world = new World();
    world.initResource(Order);

    const parent = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent');
      }),
    ).id;

    const child = world.spawn(new Parent(parent)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child');
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), child);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['child', 'parent']);
  });
  test('observer_propagating_redundant_dispatch_same_entity', () => {
    const world = new World();
    world.initResource(Order);

    const parent = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent');
      }),
    ).id;

    const child = world.spawn(new Parent(parent)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child');
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), [child, child]);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['child', 'parent', 'child', 'parent']);
  });

  test('observer_propagating_redundant_dispatch_parent_child', () => {
    const world = new World();
    world.initResource(Order);

    const parent = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent');
      }),
    ).id;

    const child = world.spawn(new Parent(parent)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child');
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), [child, parent]);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['child', 'parent', 'parent']);
  });

  test('observer_propagating_halt', () => {
    const world = new World();
    world.initResource(Order);

    const parent = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent');
      }),
    ).id;

    const child = world.spawn(new Parent(parent)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (trigger: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child');
        trigger.propagate(false);
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), child);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['child']);
  });

  test('observer_propagating_join', () => {
    const world = new World();
    world.initResource(Order);

    const parent = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent');
      }),
    ).id;

    const childA = world.spawn(new Parent(parent)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child_a');
      }),
    ).id;

    const childB = world.spawn(new Parent(parent)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child_b');
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), [childA, childB]);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['child_a', 'parent', 'child_b', 'parent']);
  });

  test('observer_propagating_no_next', () => {
    const world = new World();
    world.initResource(Order);

    const entity = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('event');
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), entity);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['event']);
  });

  test('observer_propagating_parallel_propagation', () => {
    const world = new World();
    world.initResource(Order);

    const parentA = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent_a');
      }),
    ).id;

    const childA = world.spawn(new Parent(parentA)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (trigger: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child_a');
        trigger.propagate(false);
      }),
    ).id;

    const parentB = world.spawnEmpty().observe(
      EventPropagating,
      [],
      observer([Res(Order)], (trigger: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('parent_b');
      }),
    ).id;

    const childB = world.spawn(new Parent(parentB)).observe(
      EventPropagating,
      [],
      observer([Res(Order)], (trigger: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('child_b');
      }),
    ).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), [childA, childB]);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['child_a', 'child_b', 'parent_b']);
  });

  test('observer_propagating_world', () => {
    const world = new World();
    world.initResource(Order);

    world.addObserver(
      EventPropagating,
      [],
      observer([Res(Order)], (_: Trigger<EventPropagating>, res: Res<Order>) => {
        res.observed('event');
      }),
    );

    const grandparent = world.spawnEmpty().id;
    const parent = world.spawn(new Parent(grandparent)).id;
    const child = world.spawn(new Parent(parent)).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), child);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['event', 'event', 'event']);
  });

  test('observer_propagating_world_skipping', () => {
    const world = new World();
    world.initResource(Order);

    world.addObserver(
      EventPropagating,
      [],
      observer(
        [Res(Order), Query(A)],
        (trigger: Trigger<EventPropagating>, res: Res<Order>, query: Query<A>) => {
          if (query.get(trigger.target).isOk()) {
            res.observed('event');
          }
        },
      ),
    );

    const grandparent = world.spawn(new A()).id;
    const parent = world.spawn(new Parent(grandparent)).id;
    const child = world.spawn([new A(), new Parent(parent)]).id;

    world.flush();
    world.triggerTargets(new EventPropagating(), child);
    world.flush();
    expect(world.resource(Order).get()).toEqual(['event', 'event']);
  });

  test('observer_on_remove_during_despawn_spawn_empty', () => {
    const world = new World();

    world.addObserver(
      OnRemove,
      A,
      observer([Commands], (_: Trigger<OnRemove, A>, commands: Commands) => {
        commands.spawnEmpty();
      }),
    );

    const entity = world.spawn(new A()).id;
    world.despawn(entity);
  });

  test('observer_invalid_params', () => {
    @derive([Resource])
    class ResA {}
    @derive([Resource])
    class ResB {}

    const world = new World();

    expect(() => {
      world.addObserver(
        EventA,
        [],
        observer(
          [Res(ResA), Commands],
          (_: Trigger<EventA>, _res: Res<ResA>, commands: Commands) => {
            commands.insertResource(new ResB());
          },
        ),
      );
      world.trigger(new EventA());
    }).toThrow();
  });

  test('observer_apply_deferred_from_param_set', () => {
    @derive([Resource])
    class ResA {}

    const world = new World();
    world.addObserver(
      EventA,
      [],
      // observer([], (_: Trigger<EventA>, params: ParamSet<[Query<Entity>, Commands]>) => {
      //   params.p1.insertResource(new ResA());
      // }),
      observer(
        [Query(Entity), Commands],
        (_: Trigger<EventA>, query: Query<Entity>, commands: Commands) => {
          commands.insertResource(new ResA());
        },
      ),
    );

    world.flush();
    world.trigger(new EventA());
    world.flush();

    expect(world.resource(ResA)).toBeDefined();
  });

  test('observer_triggered_components', () => {
    @derive([Resource, Default])
    class Counter {
      private counter = new Map<ComponentId, number>();

      increment(id: ComponentId) {
        this.counter.set(id, (this.counter.get(id) || 0) + 1);
      }

      get(id: ComponentId): number {
        return this.counter.get(id) || 0;
      }
    }

    const world = new World();
    world.initResource(Counter);
    const aId = world.registerComponent(A);
    const bId = world.registerComponent(B);

    world.addObserver(
      EventA,
      [A, B],
      observer([Res(Counter)], (trigger: Trigger<EventA, A & B>, counter: Res<Counter>) => {
        for (const component of trigger.components) {
          counter.increment(component);
        }
      }),
    );
    world.flush();

    world.triggerTargets(new EventA(), [aId, bId]);
    world.triggerTargets(new EventA(), aId);
    world.triggerTargets(new EventA(), bId);
    world.triggerTargets(new EventA(), [aId, bId]);
    world.triggerTargets(new EventA(), aId);
    world.flush();

    const counter = world.resource(Counter);
    expect(counter.get(aId)).toBe(4);
    expect(counter.get(bId)).toBe(3);
  });
});
