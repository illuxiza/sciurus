import { Schedule } from '@sciurus/ecs';
import { Constructor, NotImplementedError, Option, Trait } from 'rustable';
import { StateSet } from './state_set';
import { States } from './states';

export class ComputedStates extends Trait {
  static sourceStates(): Constructor<StateSet> | any[] {
    throw new NotImplementedError();
  }
  static compute(_sources: any): Option<ComputedStates> {
    throw new NotImplementedError();
  }
  static regSystems(this: typeof ComputedStates, schedule: Schedule): void {
    StateSet.staticWrap(this.sourceStates()).regComputedSystemsInSchedule(this, schedule);
  }
}

States.implFor(ComputedStates, {
  static: {
    dependDepth(this: typeof ComputedStates): number {
      return StateSet.staticWrap(this.sourceStates()).setDependencyDepth() + 1;
    },
  },
});
