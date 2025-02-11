import { Schedule } from '@sciurus/ecs';
import { Constructor, NotImplementedError, Option } from 'rustable';
import { FreelyMutableState } from './freely_mutable_state';
import { StateSet } from './state_set';

export class SubStates extends FreelyMutableState {
  static sourceStates(): Constructor<StateSet> {
    throw new NotImplementedError();
  }
  static shouldExist(_sources: StateSet): Option<SubStates> {
    throw new NotImplementedError();
  }
  static registerSystems(this: typeof SubStates, schedule: Schedule): void {
    StateSet.wrap(this.sourceStates()).registerSubSystemsInSchedule(this, schedule);
  }
}
