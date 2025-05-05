import { Schedule } from '@sciurus/ecs';
import {
  Constructor,
  NotImplementedError,
  Trait
} from 'rustable';
import { ComputedStates } from './computed_states';
import { SubStates } from './sub_states';

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
