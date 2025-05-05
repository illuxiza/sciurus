import { Commands, EventReader, EventWriter, OptionRes, Schedule, system } from '@sciurus/ecs';
import {
  Constructor,
  deepClone,
  getGenerics,
  None,
  NotImplementedError,
  Option,
  Some,
  Trait,
  Type,
} from 'rustable';
import { ComputedStates } from './computed_states';
import { NextState, State, takeNextState } from './resources';
import { States } from './states';
import { SubStates } from './sub_states';
import {
  ApplyStateTransition,
  EnterSchedules,
  ExitSchedules,
  internalApplyStateTransition,
  lastTransition,
  runEnter,
  runExit,
  runTransition,
  StateTransitionEvent,
  StateTransitionSteps,
  TransitionSchedules,
} from './transitions';

export class StateSet extends Trait {
  static setDependencyDepth(): number {
    throw new NotImplementedError();
  }

  static regComputedSystemsInSchedule(
    _type: Constructor<ComputedStates>,
    _schedule: Schedule,
  ): void {
    throw new NotImplementedError();
  }

  static regSubSystemsInSchedule(_type: Constructor<SubStates>, _schedule: Schedule) {
    throw new NotImplementedError();
  }
}

class InnerStateSet extends Trait {
  static rawStateType(): Constructor<States> {
    throw new NotImplementedError();
  }
  static iDependDepth(): number {
    throw new NotImplementedError();
  }
  static convertToUsableState(_wrapped: Option<State>): Option<InnerStateSet> {
    throw new NotImplementedError();
  }
}

InnerStateSet.implFor(States, {
  static: {
    rawStateType(this: typeof States) {
      return this;
    },
    iDependDepth(this: typeof States) {
      return this.dependDepth();
    },
    convertToUsableState(wrapped: Option<State>) {
      return wrapped.map((v) => v.val);
    },
  },
});

InnerStateSet.implFor(Option, {
  static: {
    rawStateType(this: typeof Option) {
      return getGenerics(this)[0];
    },
    iDependDepth(this: typeof Option) {
      return States.wrap(getGenerics(this)[0]).dependDepth();
    },
    convertToUsableState(wrapped: Option<State>) {
      return Some(deepClone(wrapped.map((v) => v.val)));
    },
  },
});

StateSet.implFor(InnerStateSet, {
  static: {
    setDependencyDepth(this: typeof InnerStateSet) {
      return this.iDependDepth();
    },
    regComputedSystemsInSchedule(
      this: typeof InnerStateSet,
      type: Constructor<ComputedStates>,
      schedule: Schedule,
    ) {
      const rawStateType = this.rawStateType();
      const applyStateTransition = system(
        [
          EventReader(Type(StateTransitionEvent, [rawStateType])),
          EventWriter(Type(StateTransitionEvent, [type])),
          Commands,
          OptionRes(Type(State, [type])),
          OptionRes(Type(State, [rawStateType])),
        ],
        (
          parentChanged: EventReader<StateTransitionEvent>,
          event: EventWriter<StateTransitionEvent>,
          commands: Commands,
          currentState: OptionRes<State>,
          stateSet: OptionRes<State>,
        ) => {
          if (parentChanged.isEmpty()) {
            return;
          }
          parentChanged.clear();
          let newState = this.convertToUsableState(stateSet).match({
            Some: (v) => ComputedStates.wrap(type).compute(v),
            None: None,
          });
          internalApplyStateTransition(type, event, commands, currentState, newState);
        },
      );

      schedule.configureSets([
        new ApplyStateTransition(type)
          .inSet(StateTransitionSteps.DependentTransitions())
          .after(new ApplyStateTransition(rawStateType)),
        new ExitSchedules(type)
          .inSet(StateTransitionSteps.ExitSchedules())
          .before(new ExitSchedules(rawStateType)),
        new TransitionSchedules(type).inSet(StateTransitionSteps.TransitionSchedules()),
        new EnterSchedules(type)
          .inSet(StateTransitionSteps.EnterSchedules())
          .after(new EnterSchedules(rawStateType)),
      ]);

      schedule
        .addSystems(applyStateTransition.inSet(new ApplyStateTransition(type)))
        .addSystems(lastTransition(type).pipe(runExit(type)).inSet(new ExitSchedules(type)))
        .addSystems(
          lastTransition(type).pipe(runTransition(type)).inSet(new TransitionSchedules(type)),
        )
        .addSystems(lastTransition(type).pipe(runEnter(type)).inSet(new EnterSchedules(type)));
    },
    regSubSystemsInSchedule(
      this: typeof InnerStateSet,
      type: Constructor<SubStates>,
      schedule: Schedule,
    ) {
      const rawStateType = this.rawStateType();
      const applyStateTransition = system(
        [
          EventReader(Type(StateTransitionEvent, [rawStateType])),
          EventWriter(Type(StateTransitionEvent, [type])),
          Commands,
          OptionRes(Type(State, [type])),
          OptionRes(Type(NextState, [type])),
          OptionRes(Type(State, [rawStateType])),
        ],
        (
          parentChanged: EventReader<StateTransitionEvent>,
          event: EventWriter<StateTransitionEvent>,
          commands: Commands,
          currentStateRes: OptionRes<State>,
          nextStateRes: OptionRes<NextState>,
          stateSet: OptionRes<State>,
        ) => {
          const parentChangedFlag = !parentChanged.isEmpty();
          const nextState = takeNextState(nextStateRes);
          if (!parentChangedFlag && nextState.isNone()) {
            return;
          }
          const currentState = currentStateRes.map((s) => s.get().get());
          const initialState = parentChangedFlag
            ? this.convertToUsableState(stateSet).match({
                Some: (v) => SubStates.wrap(type).shouldExist(v),
                None: None,
              })
            : currentState;
          const newState = initialState.map((x) => nextState.or(currentState).unwrapOr(x));
          internalApplyStateTransition(type, event, commands, currentStateRes, newState);
        },
      );

      schedule.configureSets([
        new ApplyStateTransition(type)
          .inSet(StateTransitionSteps.DependentTransitions())
          .after(new ApplyStateTransition(rawStateType)),
        new ExitSchedules(type)
          .inSet(StateTransitionSteps.ExitSchedules())
          .before(new ExitSchedules(rawStateType)),
        new TransitionSchedules(type).inSet(StateTransitionSteps.TransitionSchedules()),
        new EnterSchedules(type)
          .inSet(StateTransitionSteps.EnterSchedules())
          .after(new EnterSchedules(rawStateType)),
      ]);

      schedule
        .addSystems(applyStateTransition.inSet(new ApplyStateTransition(type)))
        .addSystems(lastTransition(type).pipe(runExit(type)).inSet(new ExitSchedules(type)))
        .addSystems(
          lastTransition(type).pipe(runTransition(type)).inSet(new TransitionSchedules(type)),
        )
        .addSystems(lastTransition(type).pipe(runEnter(type)).inSet(new EnterSchedules(type)));
    },
  },
});

interface InnerStateSet extends StateSet {}

// Implementation for tuples of InnerStateSet types
StateSet.implFor(Array<InnerStateSet>, {
  static: {
    setDependencyDepth(this: typeof Array<InnerStateSet>) {
      // Calculate dependency depth based on all elements
      return getGenerics(this).reduce(
        (sum: number, set) => sum + InnerStateSet.wrap(set).iDependDepth(),
        0,
      );
    },
    regComputedSystemsInSchedule(
      this: typeof Array<InnerStateSet>,
      type: Constructor<ComputedStates>,
      schedule: Schedule,
    ) {
      // Create event readers for each source state
      const sourceTypes = getGenerics(this).map((set) => InnerStateSet.wrap(set).rawStateType());

      const applyStateTransition = system(
        [
          ...sourceTypes.map((rawType) => EventReader(Type(StateTransitionEvent, [rawType]))),
          EventWriter(Type(StateTransitionEvent, [type])),
          Commands,
          OptionRes(Type(State, [type])),
          ...sourceTypes.map((rawType) => OptionRes(Type(State, [rawType]))),
        ],
        (...args: any[]) => {
          // Extract event readers, event writer, commands, and state resources
          const readers = args.slice(0, sourceTypes.length) as EventReader<StateTransitionEvent>[];
          const event = args[sourceTypes.length] as EventWriter<StateTransitionEvent>;
          const commands = args[sourceTypes.length + 1] as Commands;
          const currentState = args[sourceTypes.length + 2] as OptionRes<State>;
          const sourceStates = args.slice(sourceTypes.length + 3) as OptionRes<State>[];

          // Check if any parent state has changed
          if (readers.every((reader) => reader.isEmpty())) {
            return;
          }

          // Clear all readers
          readers.forEach((reader) => reader.clear());

          // Convert source states to usable form
          const stateSetArray = getGenerics(this);
          const convertedStates = sourceStates.map((state, i) =>
            (stateSetArray[i] as any).convertToUsableState(state),
          );

          // Compute new state if all source states are available
          const newState = convertedStates.every((state) => state.isSome())
            ? ComputedStates.wrap(type).compute(convertedStates.map((s) => s.unwrap()))
            : None;

          // Apply the state transition
          internalApplyStateTransition(type, event, commands, currentState, newState);
        },
      );

      // Configure system sets with proper ordering
      const setConfigs = [
        new ApplyStateTransition(type).inSet(StateTransitionSteps.DependentTransitions()),
        new ExitSchedules(type).inSet(StateTransitionSteps.ExitSchedules()),
        new TransitionSchedules(type).inSet(StateTransitionSteps.TransitionSchedules()),
        new EnterSchedules(type).inSet(StateTransitionSteps.EnterSchedules()),
      ];

      // Add after/before constraints for each source state
      sourceTypes.forEach((rawType) => {
        setConfigs[0].after(new ApplyStateTransition(rawType));
        setConfigs[1].before(new ExitSchedules(rawType));
        setConfigs[3].after(new EnterSchedules(rawType));
      });

      schedule.configureSets(setConfigs);

      // Add systems to the schedule
      schedule
        .addSystems(applyStateTransition.inSet(new ApplyStateTransition(type)))
        .addSystems(lastTransition(type).pipe(runExit(type)).inSet(new ExitSchedules(type)))
        .addSystems(
          lastTransition(type).pipe(runTransition(type)).inSet(new TransitionSchedules(type)),
        )
        .addSystems(lastTransition(type).pipe(runEnter(type)).inSet(new EnterSchedules(type)));
    },
    regSubSystemsInSchedule(
      this: typeof Array<InnerStateSet>,
      type: Constructor<SubStates>,
      schedule: Schedule,
    ) {
      // Create event readers for each source state
      const sourceTypes = getGenerics(this).map((set) => InnerStateSet.wrap(set).rawStateType());

      const applyStateTransition = system(
        [
          ...sourceTypes.map((rawType) => EventReader(Type(StateTransitionEvent, [rawType]))),
          EventWriter(Type(StateTransitionEvent, [type])),
          Commands,
          OptionRes(Type(State, [type])),
          OptionRes(Type(NextState, [type])),
          ...sourceTypes.map((rawType) => OptionRes(Type(State, [rawType]))),
        ],
        (...args: any[]) => {
          // Extract event readers, event writer, commands, and state resources
          const readers = args.slice(0, sourceTypes.length) as EventReader<StateTransitionEvent>[];
          const event = args[sourceTypes.length] as EventWriter<StateTransitionEvent>;
          const commands = args[sourceTypes.length + 1] as Commands;
          const currentStateRes = args[sourceTypes.length + 2] as OptionRes<State>;
          const nextStateRes = args[sourceTypes.length + 3] as OptionRes<NextState>;
          const sourceStates = args.slice(sourceTypes.length + 4) as OptionRes<State>[];

          // Check if any parent state has changed
          const parentChanged = readers.some((reader) => reader.read().iter().last().isSome());
          const nextState = takeNextState(nextStateRes);

          if (!parentChanged && nextState.isNone()) {
            return;
          }

          // Get current state
          const currentState = currentStateRes.map((s) => s.get().get());

          // Determine initial state based on parent changes
          let initialState;
          if (parentChanged) {
            // Convert source states to usable form
            const stateSetArray = getGenerics(this);
            const convertedStates = sourceStates.map((state, i) =>
              (stateSetArray[i] as any).convertToUsableState(state),
            );
            // Compute initial state if all source states are available
            initialState = convertedStates.every((state) => state.isSome())
              ? SubStates.wrap(type).shouldExist(convertedStates.map((s) => s.unwrap()) as any)
              : None;
          } else {
            initialState = currentState;
          }

          // Determine new state
          const newState = initialState.map((x) => nextState.or(currentState).unwrapOr(x));

          // Apply the state transition
          internalApplyStateTransition(type, event, commands, currentStateRes, newState);
        },
      );

      // Configure system sets with proper ordering
      const setConfigs = [
        new ApplyStateTransition(type).inSet(StateTransitionSteps.DependentTransitions()),
        new ExitSchedules(type).inSet(StateTransitionSteps.ExitSchedules()),
        new TransitionSchedules(type).inSet(StateTransitionSteps.TransitionSchedules()),
        new EnterSchedules(type).inSet(StateTransitionSteps.EnterSchedules()),
      ];

      // Add after/before constraints for each source state
      sourceTypes.forEach((rawType) => {
        setConfigs[0].after(new ApplyStateTransition(rawType));
        setConfigs[1].before(new ExitSchedules(rawType));
        setConfigs[3].after(new EnterSchedules(rawType));
      });

      schedule.configureSets(setConfigs);

      // Add systems to the schedule
      schedule
        .addSystems(applyStateTransition.inSet(new ApplyStateTransition(type)))
        .addSystems(lastTransition(type).pipe(runExit(type)).inSet(new ExitSchedules(type)))
        .addSystems(
          lastTransition(type).pipe(runTransition(type)).inSet(new TransitionSchedules(type)),
        )
        .addSystems(lastTransition(type).pipe(runEnter(type)).inSet(new EnterSchedules(type)));
    },
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Array<T> extends InnerStateSet {}
}

declare module './states' {
  export interface States extends InnerStateSet {}
}

declare module 'rustable' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface Option<T> extends InnerStateSet {}
}
