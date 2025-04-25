import { Commands, EventReader, EventWriter, OptionRes, Schedule, system } from '@sciurus/ecs';
import { Constructor, None, NotImplementedError, Option, Trait, Type } from 'rustable';
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
      return wrapped.map((v) => v.get());
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
          EventWriter(Type(StateTransitionEvent, [rawStateType])),
          Commands,
          OptionRes(Type(State, [rawStateType])),
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
        .addSystems(lastTransition(type).pipe(runExit).inSet(new ExitSchedules(type)))
        .addSystems(lastTransition(type).pipe(runTransition).inSet(new TransitionSchedules(type)))
        .addSystems(lastTransition(type).pipe(runEnter).inSet(new EnterSchedules(type)));
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
        .addSystems(lastTransition(type).pipe(runExit).inSet(new ExitSchedules(type)))
        .addSystems(lastTransition(type).pipe(runTransition).inSet(new TransitionSchedules(type)))
        .addSystems(lastTransition(type).pipe(runEnter).inSet(new EnterSchedules(type)));
    },
  },
});
