import { App, MainScheduleOrder, Plugin, PreStartup, PreUpdate, SubApp } from '@sciurus/app';
import { Events } from '@sciurus/ecs';
import { logger, once } from '@sciurus/utils';
import {
  Constructor,
  deepClone,
  derive,
  None,
  NotImplementedError,
  Some,
  Trait,
  type,
  Type,
  typeName,
} from 'rustable';
import {
  ComputedStates,
  FreelyMutableState,
  NextState,
  setupStateTransitionsInWorld,
  State,
  States,
  StateTransition,
  StateTransitionEvent,
  StateTransitionSteps,
  SubStates,
} from './state';
import { clearStateScopedEntities } from './state_scoped';

/**
 * State installation methods for App and SubApp.
 */
export class AppExtStates extends Trait {
  /**
   * Initializes a State with standard starting values.
   *
   * This method is idempotent: it has no effect when called again using the same generic type.
   *
   * Adds State<S> and NextState<S> resources, and enables use of the OnEnter, OnTransition and OnExit schedules.
   * These schedules are triggered before Update and at startup.
   *
   * If you would like to control how other systems run based on the current state, you can
   * emulate this behavior using the in_state Condition.
   *
   * Note that you can also apply state transitions at other points in the schedule
   * by triggering the StateTransition schedule manually.
   *
   * The use of any states requires the presence of StatesPlugin (which is included in DefaultPlugins).
   */
  initState<S extends FreelyMutableState>(_stateType: Constructor<S>): any {
    throw new NotImplementedError();
  }

  /**
   * Inserts a specific State to the current App and overrides any State previously
   * added of the same type.
   *
   * Adds State<S> and NextState<S> resources, and enables use of the OnEnter, OnTransition and OnExit schedules.
   * These schedules are triggered before Update and at startup.
   *
   * If you would like to control how other systems run based on the current state, you can
   * emulate this behavior using the in_state Condition.
   *
   * Note that you can also apply state transitions at other points in the schedule
   * by triggering the StateTransition schedule manually.
   */
  insertState<S extends FreelyMutableState>(_state: S): any {
    throw new NotImplementedError();
  }

  /**
   * Sets up a type implementing ComputedStates.
   *
   * This method is idempotent: it has no effect when called again using the same generic type.
   */
  addComputedState<S extends ComputedStates>(_stateType: Constructor<S>): any {
    throw new NotImplementedError();
  }

  /**
   * Sets up a type implementing SubStates.
   *
   * This method is idempotent: it has no effect when called again using the same generic type.
   */
  addSubState<S extends SubStates>(_stateType: Constructor<S>): any {
    throw new NotImplementedError();
  }

  /**
   * Enable state-scoped entity clearing for state S.
   *
   * If the States trait was derived with the #[states(scoped_entities)] attribute, it
   * will be called automatically.
   *
   * For more information refer to StateScoped.
   */
  enableStateScopedEntities<S extends States>(_stateType: Constructor<S>): any {
    throw new NotImplementedError();
  }
}

/**
 * Separate function to only warn once for all state installation methods.
 */
function warnIfNoStatesPluginInstalled(app: SubApp): void {
  if (!app.isPluginAdded(StatesPlugin)) {
    once(() => {
      logger.warn('States were added to the app, but StatesPlugin is not installed.');
    });
  }
}

// Implementation for SubApp
AppExtStates.implFor(SubApp, {
  initState<S extends FreelyMutableState>(this: SubApp, stateType: Constructor<S>): SubApp {
    warnIfNoStatesPluginInstalled(this);

    if (!this.world.containsResource(Type(State, [stateType]))) {
      const eventType = Type(StateTransitionEvent, [stateType]);
      this.initResource(Type(State, [stateType]));
      this.initResource(Type(NextState, [stateType]));
      this.addEvent(eventType);

      const schedule = this.getSchedule(StateTransition).expect(
        'The StateTransition schedule is missing. Did you forget to add StatesPlugin or DefaultPlugins before calling initState?',
      );
      FreelyMutableState.wrap(stateType).regState(schedule);

      const state = this.world
        .resource(Type(State, [stateType]))
        .get()
        .clone();
      this.world.sendEvent(new eventType(None, Some(state)));

      if (States.wrap(stateType).scopedEntitiesEnabled()) {
        this.enableStateScopedEntities(stateType);
      }
    } else {
      const name = stateType.name;
      logger.warn(`State ${name} is already initialized.`);
    }

    return this;
  },

  insertState<S extends FreelyMutableState>(this: SubApp, state: S): SubApp {
    warnIfNoStatesPluginInstalled(this);
    const stateType = type(state);
    const ST = State(stateType);
    const eventType = Type(StateTransitionEvent, [stateType]);

    if (!this.world.containsResource(ST)) {
      this.insertResource(new ST(deepClone(state)));
      this.initResource(Type(NextState, [ST]));
      this.addEvent(eventType);

      const schedule = this.getSchedule(StateTransition).expect(
        'The StateTransition schedule is missing. Did you forget to add StatesPlugin or DefaultPlugins before calling insertState?',
      );
      FreelyMutableState.wrap(stateType).regState(schedule);

      this.world.sendEvent(new eventType(None, Some(deepClone(state))));

      if (States.wrap(stateType).scopedEntitiesEnabled()) {
        this.enableStateScopedEntities(stateType);
      }
    } else {
      // Overwrite previous state and initial event
      this.insertResource(new ST(deepClone(state)));
      this.world.resourceMut(Type(Events, [eventType])).clear();
      this.world.sendEvent(new eventType(None, Some(deepClone(state))));
    }

    return this;
  },

  addComputedState<S extends ComputedStates>(this: SubApp, stateType: Constructor<S>): SubApp {
    warnIfNoStatesPluginInstalled(this);

    if (!this.world.containsResource(Type(Events, [Type(StateTransitionEvent, [stateType])]))) {
      const eventType = Type(StateTransitionEvent, [stateType]);
      this.addEvent(eventType);

      const schedule = this.getSchedule(StateTransition).expect(
        'The StateTransition schedule is missing. Did you forget to add StatesPlugin or DefaultPlugins before calling addComputedState?',
      );
      ComputedStates.wrap(stateType).regSystems(schedule);

      const state = this.world
        .getResource(Type(State, [stateType]))
        .map((res) => res.get())
        .clone();
      this.world.sendEvent(new eventType(None, Some(state)));

      if (States.wrap(stateType).scopedEntitiesEnabled()) {
        this.enableStateScopedEntities(stateType);
      }
    } else {
      const name = stateType.name;
      logger.warn(`Computed state ${name} is already initialized.`);
    }

    return this;
  },

  addSubState<S extends SubStates>(this: SubApp, stateType: Constructor<S>): SubApp {
    warnIfNoStatesPluginInstalled(this);

    if (!this.world.containsResource(Type(Events, [Type(StateTransitionEvent, [stateType])]))) {
      const eventType = Type(StateTransitionEvent, [stateType]);
      this.initResource(eventType);
      this.initResource(Type(NextState, [stateType]));
      this.addEvent(eventType);

      const schedule = this.getSchedule(StateTransition).expect(
        'The StateTransition schedule is missing. Did you forget to add StatesPlugin or DefaultPlugins before calling addSubState?',
      );
      SubStates.wrap(stateType).regState(schedule);

      const state = this.world
        .getResource(Type(State, [stateType]))
        .map((res) => res.get())
        .clone();
      this.world.sendEvent(new eventType(None, Some(state)));

      if (States.wrap(stateType).scopedEntitiesEnabled()) {
        this.enableStateScopedEntities(stateType);
      }
    } else {
      const name = stateType.name;
      logger.warn(`Sub state ${name} is already initialized.`);
    }

    return this;
  },

  enableStateScopedEntities<S extends States>(this: SubApp, stateType: Constructor<S>): SubApp {
    if (!this.world.containsResource(Type(Events, [Type(StateTransitionEvent, [stateType])]))) {
      const name = typeName(stateType);
      logger.warn(
        `State scoped entities are enabled for state '${name}', but the state isn't installed in the app!`,
      );
    }

    // We work with StateTransition in set StateTransitionSteps.ExitSchedules() as opposed to OnExit,
    // because OnExit only runs for one specific variant of the state.
    return this.addSystems(
      StateTransition,
      clearStateScopedEntities(stateType).inSet(StateTransitionSteps.ExitSchedules()),
    );
  },
});

// Implementation of AppExtStates for App
AppExtStates.implFor(App, {
  initState<S extends FreelyMutableState>(this: App, stateType: Constructor<S>): App {
    this.main().initState(stateType);
    return this;
  },

  insertState<S extends FreelyMutableState>(this: App, state: S): App {
    this.main().insertState(state);
    return this;
  },

  addComputedState<S extends ComputedStates>(this: App, stateType: Constructor<S>): App {
    this.main().addComputedState(stateType);
    return this;
  },

  addSubState<S extends SubStates>(this: App, stateType: Constructor<S>): App {
    this.main().addSubState(stateType);
    return this;
  },

  enableStateScopedEntities<S extends States>(this: App, stateType: Constructor<S>): App {
    this.main().enableStateScopedEntities(stateType);
    return this;
  },
});

/**
 * Registers the StateTransition schedule in the MainScheduleOrder to enable state processing.
 */
@derive([Plugin])
export class StatesPlugin {
  build(app: App): void {
    const schedule = app.world().resourceMut(MainScheduleOrder);
    schedule.insertAfter(PreUpdate, StateTransition);
    schedule.insertStartupBefore(PreStartup, StateTransition);
    setupStateTransitionsInWorld(app.world());
  }
}

// Declare the extensions to App and SubApp interfaces
declare module '@sciurus/app' {
  interface App extends AppExtStates {}
  interface SubApp extends AppExtStates {}
}
