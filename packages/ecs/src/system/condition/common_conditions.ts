import { Constructor, equals, Ptr } from 'rustable';
import { Component, Resource } from '../../component';
import { Event, EventReader } from '../../event';
import { With } from '../../query';
import { RemovedComponents } from '../../removal_detection';
import { Adapt, AdapterSystem } from '../adapt';
import { condition } from '../function/fn';
import { In, Local, OptionRes, Query, Res } from '../param';
import { Condition, IntoCondition, NotMark } from './condition';

/**
 * A collection of run conditions that may be useful in any Sciurus app.
 */

/**
 * A condition-satisfying system that returns `true`
 * on the first time the condition is run and false every time after.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `runOnce` will only return true the first time it's evaluated
 *   mySystem.runIf(runOnce)
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // This is the first time the condition will be evaluated so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // This is the second time the condition will be evaluated so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export const runOnce = condition([Local(Boolean)], (hasRun: Ptr<Boolean>) => {
  if (!hasRun[Ptr.ptr]) {
    hasRun[Ptr.ptr] = true;
    return true;
  } else {
    return false;
  }
});

/**
 * A condition-satisfying system that returns `true`
 * if the resource exists.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceExists` will only return true if the given resource exists in the world
 *   mySystem.runIf(resourceExists<Counter>)
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `Counter` hasn't been added so `mySystem` won't run
 * app.run(world);
 * world.initResource<Counter>();
 *
 * // `Counter` has now been added so `mySystem` can run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function resourceExists<T extends Resource>(resType: Constructor<T>) {
  return condition([OptionRes(resType)], (res: OptionRes<T>) => {
    return res.isSome();
  });
}

/**
 * Generates a condition-satisfying closure that returns `true`
 * if the resource is equal to `value`.
 *
 * The condition will return false if the resource does not exist.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceeq` will only return true if the given resource eq the given value
 *   mySystem.runIf(resourceeq(new Counter(0)))
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `Counter` is `0` so `mySystem` can run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // `Counter` is no longer `0` so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function resourceeq<T extends Resource>(value: T) {
  return condition([Res(value.constructor as Constructor<T>)], (res: Res<T>) => {
    return res === value || (res && value && res.eq?.(value)) || equals(res, value);
  });
}

/**
 * Generates a condition-satisfying closure that returns `true`
 * if the resource exists and is equal to `value`.
 *
 * The condition will return `false` if the resource does not exist.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceExistsAndeq` will only return true
 *   // if the given resource exists and eq the given value
 *   mySystem.runIf(resourceExistsAndeq(new Counter(0)))
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `Counter` hasn't been added so `mySystem` can't run
 * app.run(world);
 * world.initResource<Counter>();
 *
 * // `Counter` is `0` so `mySystem` can run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // `Counter` is no longer `0` so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function resourceExistsAndeq<T extends Resource>(value: T) {
  return condition([OptionRes(value.constructor as Constructor<T>)], (res: OptionRes<T>) => {
    if (res.isNone()) return false;
    const resVal = res.unwrap();
    return resVal === value || (resVal && value && resVal.eq?.(value)) || equals(resVal, value);
  });
}

/**
 * A condition-satisfying system that returns `true`
 * if the resource of the given type has been added since the condition was last checked.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceAdded` will only return true if the
 *   // given resource was just added
 *   mySystem.runIf(resourceAdded<Counter>)
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * world.initResource<Counter>();
 *
 * // `Counter` was just added so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // `Counter` was not just added so `mySystem` will not run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function resourceAdded<T extends Resource>(resourceType: Constructor<T>) {
  return condition([OptionRes(resourceType)], (res: OptionRes<T>) => {
    return res.isSome() && res.unwrap().isAdded();
  });
}

/**
 * A condition-satisfying system that returns `true`
 * if the resource of the given type has had its value changed since the condition
 * was last checked.
 *
 * The value is considered changed when it is added. The first time this condition
 * is checked after the resource was added, it will return `true`.
 * Change detection behaves like this everywhere in Sciurus.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceChanged` will only return true if the
 *   // given resource was just changed (or added)
 *   mySystem.runIf(
 *     resourceChanged<Counter>
 *     // By default detecting changes will also trigger if the resource was
 *     // just added, this won't work with my example so I will add a second
 *     // condition to make sure the resource wasn't just added
 *     .and(not(resourceAdded<Counter>))
 *   )
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `Counter` hasn't been changed so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 0);
 *
 * world.resourceMut<Counter>().0 = 50;
 *
 * // `Counter` was just changed so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 51);
 * ```
 */
export function resourceChanged<T extends Resource>(resourceType: Constructor<T>) {
  return condition([Res(resourceType)], (res: Res<T>) => {
    return res.isChanged();
  });
}

/**
 * A condition-satisfying system that returns `true`
 * if the resource of the given type has had its value changed since the condition
 * was last checked.
 *
 * The value is considered changed when it is added. The first time this condition
 * is checked after the resource was added, it will return `true`.
 * Change detection behaves like this everywhere in Sciurus.
 *
 * This run condition does not detect when the resource is removed.
 *
 * The condition will return `false` if the resource does not exist.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceExistsAndChanged` will only return true if the
 *   // given resource exists and was just changed (or added)
 *   mySystem.runIf(
 *     resourceExistsAndChanged<Counter>
 *     // By default detecting changes will also trigger if the resource was
 *     // just added, this won't work with my example so I will add a second
 *     // condition to make sure the resource wasn't just added
 *     .and(not(resourceAdded<Counter>))
 *   )
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `Counter` doesn't exist so `mySystem` won't run
 * app.run(world);
 * world.initResource<Counter>();
 *
 * // `Counter` hasn't been changed so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 0);
 *
 * world.resourceMut<Counter>().0 = 50;
 *
 * // `Counter` was just changed so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 51);
 * ```
 */
export function resourceExistsAndChanged<T extends Resource>(resourceType: Constructor<T>) {
  return condition([OptionRes(resourceType)], (res: OptionRes<T>) => {
    if (res.isNone()) return false;
    return res.unwrap().isChanged();
  });
}

/**
 * A condition-satisfying system that returns `true`
 * if the resource of the given type has had its value changed since the condition
 * was last checked.
 *
 * The value is considered changed when it is added. The first time this condition
 * is checked after the resource was added, it will return `true`.
 * Change detection behaves like this everywhere in Sciurus.
 *
 * This run condition also detects removal. It will return `true` if the resource
 * has been removed since the run condition was last checked.
 *
 * The condition will return `false` if the resource does not exist.
 */
export function resourceChangedOrRemoved<T extends Resource>(resourceType: Constructor<T>) {
  return condition(
    [OptionRes(resourceType), Local(Boolean)],
    (res: OptionRes<T>, existed: Ptr<Boolean>) => {
      if (res.isSome()) {
        existed[Ptr.ptr] = true;
        return res.unwrap().isChanged();
      } else if (existed[Ptr.ptr]) {
        existed[Ptr.ptr] = false;
        return true;
      } else {
        return false;
      }
    },
  );
}

/**
 * A condition-satisfying system that returns `true`
 * if the resource of the given type has been removed since the condition was last checked.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `resourceRemoved` will only return true if the
 *   // given resource was just removed
 *   mySystem.runIf(resourceRemoved<MyResource>)
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * world.initResource<MyResource>();
 *
 * // `MyResource` hasn't just been removed so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 0);
 *
 * world.removeResource<MyResource>();
 *
 * // `MyResource` was just removed so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function resourceRemoved<T extends Resource>(resourceType: Constructor<T>) {
  return condition(
    [OptionRes(resourceType), Local(Boolean)],
    (res: OptionRes<T>, existed: Ptr<Boolean>) => {
      if (res.isSome()) {
        existed[Ptr.ptr] = true;
        return false;
      } else if (existed[Ptr.ptr]) {
        existed[Ptr.ptr] = false;
        return true;
      } else {
        return false;
      }
    },
  );
}

/**
 * A condition-satisfying system that returns `true`
 * if there are any new events of the given type since it was last called.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   mySystem.runIf(onEvent<MyEvent>)
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // No new `MyEvent` events have been push so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 0);
 *
 * world.resourceMut<Events<MyEvent>>().send(new MyEvent());
 *
 * // A `MyEvent` event has been pushed so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function onEvent<T extends Event>(eventType: Constructor<T>) {
  return condition([EventReader(eventType)], (reader: EventReader<T>) => {
    // The events need to be consumed, so that there are no false positives on subsequent
    // calls of the run condition.
    return reader.read().len() > 0;
  });
}

/**
 * A condition-satisfying system that returns `true`
 * if there are any entities with the given component type.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   mySystem.runIf(anyWithComponent<MyComponent>)
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // No entities exist yet with a `MyComponent` component so `mySystem` won't run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 0);
 *
 * world.spawn(new MyComponent());
 *
 * // An entities with `MyComponent` now exists so `mySystem` will run
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * ```
 */
export function anyWithComponent<T extends Component>(componentType: Constructor<T>) {
  return condition([Query([], With(componentType))], (query: Query<[]>) => {
    return query.iter().count() > 0;
  });
}

/**
 * A condition-satisfying system that returns `true`
 */
export function anyComponentRemoved<T extends Component>(componentType: Constructor<T>) {
  return condition([RemovedComponents(componentType)], (removals: RemovedComponents<T>) => {
    return removals.read().count() > 0;
  });
}

/**
 * A condition-satisfying system that returns `true`
 * if there are any entities that match the given QueryFilter.
 */
export function anyMatchFilter(filter: any) {
  return condition([Query([], filter)], (query: Query<[]>) => {
    return query.iter().count() > 0;
  });
}

/**
 * Generates a condition that inverses the result of passed one.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   // `not` will inverse any condition you pass in.
 *   // Since the condition we choose always returns true
 *   // this system will never run
 *   mySystem.runIf(not(always))
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * function always(): boolean {
 *   return true;
 * }
 *
 * app.run(world);
 * assert(world.resource<Counter>().0 === 0);
 * ```
 */
export function not<C extends IntoCondition>(cond: C): Condition {
  const condition = cond.intoReadonlySystem();
  const name = `!${condition.name()}`;
  const system = new AdapterSystem(Adapt.wrap(new NotMark()), condition, name);
  return system as unknown as Condition;
}

/**
 * Generates a condition that returns true when the passed one changes.
 *
 * The first time this is called, the passed condition is assumed to have been previously false.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   mySystem.runIf(conditionChanged(resourceExists<MyResource>))
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `MyResource` is initially there, the inner condition is true, the system runs once
 * world.insertResource(new MyResource());
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // We remove `MyResource`, the inner condition is now false, the system runs one more time.
 * world.removeResource<MyResource>();
 * app.run(world);
 * assert(world.resource<Counter>().0 === 2);
 * app.run(world);
 * assert(world.resource<Counter>().0 === 2);
 * ```
 */
export function conditionChanged<C extends IntoCondition>(cond: C): Condition {
  return cond.pipe(
    condition([In(Boolean), Local(Boolean)], (curr: Boolean, prev: Ptr<Boolean>) => {
      const changed = prev[Ptr.ptr] !== curr;
      prev[Ptr.ptr] = curr;
      return changed;
    }),
  ) as unknown as Condition;
}

/**
 * Generates a condition that returns true when the result of
 * the passed one went from false to true since the last time this was called.
 *
 * The first time this is called, the passed condition is assumed to have been previously false.
 *
 * # Example
 * ```typescript
 * app.addSystems(
 *   mySystem.runIf(conditionChangedTo(true, resourceExists<MyResource>))
 * );
 *
 * function mySystem(counter: ResMut<Counter>) {
 *   counter.0 += 1;
 * }
 *
 * // `MyResource` is initially there, the inner condition is true, the system runs once
 * world.insertResource(new MyResource());
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // We remove `MyResource`, the inner condition is now false, the system doesn't run.
 * world.removeResource<MyResource>();
 * app.run(world);
 * assert(world.resource<Counter>().0 === 1);
 *
 * // We reinsert `MyResource` again, so the system will run one more time
 * world.insertResource(new MyResource());
 * app.run(world);
 * assert(world.resource<Counter>().0 === 2);
 * app.run(world);
 * assert(world.resource<Counter>().0 === 2);
 * ```
 */
export function conditionChangedTo<C extends IntoCondition>(to: boolean, cond: C): Condition {
  return cond.pipe(
    condition([In(Boolean), Local(Boolean)], (curr: Boolean, prev: Ptr<Boolean>) => {
      const changed = prev[Ptr.ptr] !== curr && curr === to;
      prev[Ptr.ptr] = curr;
      return changed;
    }),
  ) as unknown as Condition;
}
