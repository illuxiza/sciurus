import { App, SubApp } from '@sciurus/app';
import { Commands, Event, EventReader, Events, Resource, system, World } from '@sciurus/ecs';
import {
  Constructor,
  deepClone,
  Default,
  derive,
  HashMap,
  NotImplementedError,
  Trait,
  type,
  Type,
  Vec,
} from 'rustable';
import { OnExit, StateTransitionEvent } from './state';
import { FreelyMutableState } from './state/freely_mutable_state';

// Cache to store the system functions for each event type
const clearEventQueueSystemCache = new HashMap<Constructor<any>, any>();
/**
 * Clears the event queue for a specific event type
 *
 * @param eventType The event type to clear
 */
export const clearEventQueueSystem = <E extends Event>(eventType: Constructor<E>) => {
  // Check if we already have a cached system for this type
  if (clearEventQueueSystemCache.containsKey(eventType)) {
    return clearEventQueueSystemCache.get(eventType).unwrap();
  }

  // Create a new system and cache it
  const newSystem = system([World], clearEventQueue(eventType));

  // Store in cache
  clearEventQueueSystemCache.insert(eventType, newSystem);

  return newSystem;
};

export const clearEventQueue = <E extends Event>(eventType: Constructor<E>) => {
  return (world: World) => {
    const events = world.getResource(Events(eventType));
    if (events.isSome()) {
      events.unwrap().clear();
    }
  };
};

/**
 * Resource that stores cleanup functions for state-scoped events
 */
@derive([Resource, Default])
export class StateScopedEvents<S extends FreelyMutableState> {
  private cleanupFns: HashMap<S, Vec<(world: World) => void>> = new HashMap();

  /**
   * Add an event type to be cleared when exiting the specified state
   *
   * @param eventType The event type to clear
   * @param state The state to associate with this event cleanup
   */
  addEvent<E extends Event>(eventType: Constructor<E>, state: S): void {
    const entry = this.cleanupFns.entry(state).orInsert(Vec.new());
    entry.push(clearEventQueue(eventType));
  }

  /**
   * Clean up events associated with the specified state
   *
   * @param world The world to clean up events in
   * @param state The state being exited
   */
  cleanup(world: World, state: S): void {
    const fns = this.cleanupFns.get(state);
    if (!fns.isSome()) {
      return;
    }

    for (const callback of fns.unwrap()) {
      callback(world);
    }
  }
}

// Cache to store the system functions for each state type
const cleanupStateScopedEventsCache = new HashMap<Constructor<any>, any>();
/**
 * System that cleans up state-scoped events when exiting a state
 */
export const cleanupStateScopedEvents = <S extends FreelyMutableState>(
  stateType: Constructor<S>,
) => {
  // Check if we already have a cached system for this type
  if (cleanupStateScopedEventsCache.containsKey(stateType)) {
    return cleanupStateScopedEventsCache.get(stateType).unwrap();
  }

  // Create a new system and cache it
  const newSystem = system(
    [Commands, EventReader(Type(StateTransitionEvent<S>, [stateType]))],
    (commands: Commands, transitions: EventReader<StateTransitionEvent<S>>) => {
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

      const exitedState = exited.unwrap();
      commands.queue((world: World) => {
        world.resourceScope<StateScopedEvents<S>, void>(
          Type(StateScopedEvents, [stateType]),
          (world, events) => {
            events.cleanup(world, exitedState);
          },
        );
      });
    },
  );

  // Store in cache
  cleanupStateScopedEventsCache.insert(stateType, newSystem);

  return newSystem;
};

/**
 * Implementation for adding a state-scoped event
 */
function addStateScopedEventImpl<E extends Event, S extends FreelyMutableState>(
  app: SubApp,
  eventType: Constructor<E>,
  state: S,
): void {
  if (!app.world.containsResource(Type(StateScopedEvents, [type(state)]))) {
    app.initResource(Type(StateScopedEvents, [type(state)]));
  }

  app.addEvent(eventType);

  app.world
    .resourceMut(Type(StateScopedEvents, [type(state)]))
    .addEvent(eventType, deepClone(state));

  app.addSystems(new OnExit(state), cleanupStateScopedEvents(type(state)));
}

/**
 * Extension trait for App adding methods for registering state scoped events
 */
export class StateScopedEventsAppExt extends Trait {
  /**
   * Adds an Event that is automatically cleaned up when leaving the specified state.
   *
   * Note that event cleanup is ordered ambiguously relative to StateScoped entity
   * cleanup and the OnExit schedule for the target state. All of these (state scoped
   * entities and events cleanup, and OnExit) occur within schedule StateTransition
   * and system set StateTransitionSteps.ExitSchedules.
   *
   * @param eventType The event type to register
   * @param state The state to associate with this event cleanup
   */
  addStateScopedEvent<E extends Event>(eventType: Constructor<E>, state: FreelyMutableState): any {
    throw new NotImplementedError();
  }
}

// Implementation for App
StateScopedEventsAppExt.implFor(App, {
  addStateScopedEvent<E extends Event>(
    this: App,
    eventType: Constructor<E>,
    state: FreelyMutableState,
  ): App {
    addStateScopedEventImpl(this.main(), eventType, state);
    return this;
  },
});

// Implementation for SubApp
StateScopedEventsAppExt.implFor(SubApp, {
  addStateScopedEvent<E extends Event>(
    this: SubApp,
    eventType: Constructor<E>,
    state: FreelyMutableState,
  ): SubApp {
    addStateScopedEventImpl(this, eventType, state);
    return this;
  },
});

declare module '@sciurus/app' {
  interface App {
    addStateScopedEvent<E extends Event>(eventType: Constructor<E>, state: FreelyMutableState): App;
  }

  interface SubApp {
    addStateScopedEvent<E extends Event>(
      eventType: Constructor<E>,
      state: FreelyMutableState,
    ): SubApp;
  }
}
