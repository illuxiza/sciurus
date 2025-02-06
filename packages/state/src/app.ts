import { NotImplementedError } from 'rustable';
import { FreelyMutableState } from './state/freely_mutable_state';
import { States } from './state/states';

export class AppExtStates {
  initState<S extends FreelyMutableState>(): this {
    throw new NotImplementedError();
  }
  insertState<S extends FreelyMutableState>(state: S): this {
    throw new NotImplementedError();
  }
  addComputedState<S extends ComputedStates>(): this {
    throw new NotImplementedError();
  }
  addSubState<S extends SubStates>(): this {
    throw new NotImplementedError();
  }
  enableStateScopedEntities<S extends States>(): this {
    throw new NotImplementedError();
  }
}
