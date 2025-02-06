import { Commands, EventWriter, OptionRes, system } from '@sciurus/ecs';
import { Constructor, Type } from 'rustable';
import { NextState, State, takeNextState } from './resources';
import { States } from './states';
import { internalApplyStateTransition, StateTransitionEvent } from './transitions';

export class FreelyMutableState extends States {}

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
