import { Schedule } from '@sciurus/ecs';
import { Constructor, NotImplementedError, Option, Trait } from 'rustable';
import { StateSet } from './state_set';
import { States } from './states';

export class ComputedStates extends Trait {
  static sourceStates(): Constructor<StateSet> {
    throw new NotImplementedError();
  }
  static compute(_sources: StateSet): Option<ComputedStates> {
    throw new NotImplementedError();
  }
  static registerSystems(this: typeof ComputedStates, schedule: Schedule): void {
    StateSet.wrap(this.sourceStates()).registerComputedSystemsInSchedule(this, schedule);
  }
}

States.implFor(ComputedStates, {
  static: {
    dependDepth(this: typeof ComputedStates): number {
      return StateSet.wrap(this.sourceStates()).setDependencyDepth() + 1;
    },
  },
});
