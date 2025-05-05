import { Commands, Component, Entity, EventReader, Query, system } from '@sciurus/ecs';
import {
  Constructor,
  createGenericType,
  Default,
  derive,
  getGenerics,
  HashMap,
  Type,
} from 'rustable';
import { StateTransitionEvent } from './state';
import { States } from './state/states';

/**
 * Entities marked with this component will be removed
 * when the world's state of the matching type no longer matches the supplied value.
 *
 * To enable this feature remember to add the attribute `@stateScoped()` when defining States.
 * It's also possible to enable it when adding the state to an app with `enableStateScopedEntities`.
 *
 * ```typescript
 * import { States, stateScoped, StateScoped } from '@sciurus/state';
 * import { Component, World } from '@sciurus/ecs';
 * import { system, Commands } from '@sciurus/ecs/system';
 *
 * @stateScoped()
 * class GameState extends States {
 *   static readonly MainMenu = new GameState('MainMenu');
 *   static readonly SettingsMenu = new GameState('SettingsMenu');
 *   static readonly InGame = new GameState('InGame');
 *
 *   static readonly default = GameState.MainMenu;
 * }
 *
 * @Component
 * class Player {}
 *
 * const spawnPlayer = system([Commands], (commands: Commands) => {
 *   commands.spawn([
 *     new StateScoped(GameState.InGame),
 *     new Player()
 *   ]);
 * });
 *
 * const app = new App();
 * app.initState(GameState);
 * app.addSystems(OnEnter(GameState.InGame), spawnPlayer);
 * ```
 */
@derive([Component])
class StateScopedTrait<S extends States> {
  constructor(public value: S) {}
}

export const StateScoped = createGenericType(StateScopedTrait);

Default.implFor(StateScoped, {
  static: {
    default(this: typeof StateScoped): StateScoped<any> {
      const generics = getGenerics(this);
      const defaultState = generics[0];
      return new StateScoped(Default.staticWrap(defaultState).default());
    },
  },
});

export interface StateScoped<S extends States> extends StateScopedTrait<S> {}

// Cache to store the system functions for each state type
const systemCache = new HashMap<Constructor<any>, any>();
/**
 * Removes entities marked with `StateScoped<S>`
 * when their state no longer matches the world state.
 *
 * @param stateType The state type to clear entities for
 */
export const clearStateScopedEntities = <S extends States>(stateType: Constructor<S>) => {
  // Check if we already have a cached system for this type
  if (systemCache.containsKey(stateType)) {
    return systemCache.get(stateType).unwrap();
  }

  // Create a new system and cache it
  const newSystem = system(
    [
      Commands,
      EventReader(Type(StateTransitionEvent<S>, [stateType])),
      Query([Entity, StateScoped(stateType)]),
    ],
    (
      commands: Commands,
      transitions: EventReader<StateTransitionEvent<S>>,
      query: Query<[Entity, StateScoped<S>]>,
    ) => {
      // We use the latest event, because state machine internals generate at most 1
      // transition event (per type) each frame. No event means no change happened
      // and we skip iterating all entities.
      const transition = transitions.read().iter().last();

      if (!transition.isSome()) {
        return;
      }

      if (transition.unwrap().enter.eq(transition.unwrap().exit)) {
        return;
      }

      const exited = transition.unwrap().exit;
      if (!exited.isSome()) {
        return;
      }

      for (const [entity, binding] of query.iter()) {
        if (binding.value.eq(exited.unwrap())) {
          commands.entity(entity).despawn();
        }
      }
    },
  );

  // Store in cache
  systemCache.insert(stateType, newSystem);

  return newSystem;
};
