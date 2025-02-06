import {
  Commands,
  Event,
  EventReader,
  EventWriter,
  OptionRes,
  Schedule,
  ScheduleLabel,
  Schedules,
  SystemSet,
  World,
} from '@sciurus/ecs';
import { Constructor, derive, Enum, None, Option, Some, Type, variant } from 'rustable';
import { State } from './resources';
import { States } from './states';

@derive([ScheduleLabel])
export class OnEnter<S> {
  constructor(public state: S) {}
}

@derive([ScheduleLabel])
export class OnExit<S> {
  constructor(public state: S) {}
}

@derive([ScheduleLabel])
export class OnTransition<S> {
  constructor(
    public enter: S,
    public exit: S,
  ) {}
}

@derive([ScheduleLabel])
export class StateTransition {}

@derive([Event])
export class StateTransitionEvent<S> {
  constructor(
    public enter: Option<S>,
    public exit: Option<S>,
  ) {}
}

@derive([SystemSet])
export class StateTransitionSteps extends Enum<typeof StateTransition> {
  /// States apply their transitions from [`NextState`](super::NextState)
  /// and compute functions based on their parent states.
  @variant
  static DependentTransitions(): StateTransitionSteps {
    return null!;
  }
  /// Exit schedules are executed in leaf to root order
  @variant
  static ExitSchedules(): StateTransitionSteps {
    return null!;
  }
  /// Transition schedules are executed in arbitrary order.
  @variant
  static TransitionSchedules(): StateTransitionSteps {
    return null!;
  }
  /// Enter schedules are executed in root to leaf order.
  @variant
  static EnterSchedules(): StateTransitionSteps {
    return null!;
  }
}

export interface StateTransitionSteps extends SystemSet {}

@derive([SystemSet])
export class ExitSchedules<S> {
  constructor(public s: Constructor<S>) {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ExitSchedules<S> extends SystemSet {}

@derive([SystemSet])
export class TransitionSchedules<S> {
  constructor(public s: Constructor<S>) {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TransitionSchedules<S> extends SystemSet {}

@derive([SystemSet])
export class EnterSchedules<S> {
  constructor(public s: Constructor<S>) {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface EnterSchedules<S> extends SystemSet {}

@derive([SystemSet])
export class ApplyStateTransition<S> {
  constructor(public s: Constructor<S>) {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ApplyStateTransition<S> extends SystemSet {}

export function internalApplyStateTransition<S extends States>(
  statesType: Constructor<S>,
  event: EventWriter<StateTransitionEvent<S>>,
  commands: Commands,
  currentState: OptionRes<State<S>>,
  newState: Option<S>,
) {
  const ST = Type(State, [statesType]);
  newState.match({
    Some: (entered) => {
      currentState.match({
        // If the `State<S>` resource exists, and the state is not the one we are
        // entering - we need to set the new value, compute dependent states, send transition events
        // and register transition schedules.
        Some: (current) => {
          let exited = entered;
          if (!current.get().get().eq(entered)) {
            exited = current.get().get();
            current.set(new ST(entered));
          }
          // Transition events are sent even for same state transitions
          // Although enter and exit schedules are not run by default.
          event.send(new StateTransitionEvent(Some(entered), Some(exited)));
        },
        // If the `State<S>` resource does not exist, we create it, compute dependent states, send a transition event and register the `OnEnter` schedule.

        None: () => {
          commands.insertResource(new ST(entered));
          event.send(new StateTransitionEvent(Some(entered), None));
        },
      });
    },
    None: () => {
      // We first remove the `State<S>` resource, and if one existed we compute dependent states, send a transition event and run the `OnExit` schedule.
      if (currentState.isSome()) {
        commands.removeResource(ST);
        event.send(new StateTransitionEvent(None, Some(currentState.unwrap().get().get())));
      }
    },
  });
}

export function setupStateTransitionsInWorld(world: World) {
  const schedules = world.getResourceOrInit(Schedules);
  if (schedules.contains(StateTransition)) {
    return;
  }
  let schedule = new Schedule(StateTransition);
  schedule.configureSets(
    [
      StateTransitionSteps.DependentTransitions(),
      StateTransitionSteps.ExitSchedules(),
      StateTransitionSteps.TransitionSchedules(),
      StateTransitionSteps.EnterSchedules(),
    ].chain(),
  );
  schedules.insert(schedule);
}

export function lastTransition<S extends States>(reader: EventReader<StateTransitionEvent<S>>) {
  return reader.read().iter().last();
}

export function runEnter<S extends States>(
  transition: Option<StateTransitionEvent<S>>,
  world: World,
) {
  if (transition.isNone()) {
    return;
  }
  const t = transition.unwrap();
  const { enter, exit } = t;
  if (enter.eq(exit)) {
    return;
  }
  if (enter.isNone()) {
    return;
  }
  world.tryRunSchedule(new OnEnter(enter.unwrap()));
}

export function runExit<S extends States>(
  transition: Option<StateTransitionEvent<S>>,
  world: World,
) {
  if (transition.isNone()) {
    return;
  }
  const t = transition.unwrap();
  const { enter, exit } = t;
  if (enter.eq(exit)) {
    return;
  }
  if (exit.isNone()) {
    return;
  }
  world.tryRunSchedule(new OnExit(exit.unwrap()));
}

export function runTransition<S extends States>(
  transition: Option<StateTransitionEvent<S>>,
  world: World,
) {
  if (transition.isNone()) {
    return;
  }
  const t = transition.unwrap();
  const { enter, exit } = t;
  if (enter.isNone()) {
    return;
  }
  if (exit.isNone()) {
    return;
  }
  world.tryRunSchedule(new OnTransition(enter.unwrap(), exit.unwrap()));
}
