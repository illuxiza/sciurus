import { Commands, EventWriter, OptionRes, Schedule, system } from '@sciurus/ecs';
import { Constructor, Type } from 'rustable';
import { NextState, State, takeNextState } from './resources';
import { States } from './states';
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

export class FreelyMutableState extends States {
  static registerState(this: typeof FreelyMutableState, schedule: Schedule): void {
    schedule.configureSets([
      new ApplyStateTransition(this).inSet(StateTransitionSteps.DependentTransitions()),
      new ExitSchedules(this).inSet(StateTransitionSteps.ExitSchedules()),
      new TransitionSchedules(this).inSet(StateTransitionSteps.TransitionSchedules()),
      new EnterSchedules(this).inSet(StateTransitionSteps.EnterSchedules()),
    ]);
    schedule
      .addSystems(applyStateTransition(this).inSet(new ApplyStateTransition(this)))
      .addSystems(lastTransition(this).pipe(runExit).inSet(new ExitSchedules(this)))
      .addSystems(lastTransition(this).pipe(runTransition).inSet(new TransitionSchedules(this)))
      .addSystems(lastTransition(this).pipe(runEnter).inSet(new EnterSchedules(this)));
  }
}

export const applyStateTransition = <S extends FreelyMutableState>(statesType: Constructor<S>) =>
  system(
    [
      EventWriter(Type(StateTransitionEvent<S>, [statesType])),
      Commands,
      OptionRes(Type(State<S>, [statesType])),
      OptionRes(Type(NextState<S>, [statesType])),
    ],
    (
      event: EventWriter<StateTransitionEvent<S>>,
      commands: Commands,
      currentState: OptionRes<State<S>>,
      nextState: OptionRes<NextState<S>>,
    ) => {
      const op = takeNextState(nextState);
      if (op.isNone()) {
        return;
      }
      if (currentState.isNone()) {
        return;
      }
      internalApplyStateTransition(statesType, event, commands, currentState, op);
    },
  );
