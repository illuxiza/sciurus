import { Constructor, NotImplementedError, Trait } from 'rustable';
import { World } from '../../world/base';
import { SystemMeta } from '../types';

/**
 * A trait implemented for all exclusive system parameters.
 */
export class ExclusiveSystemParam<State = any, Item = any> extends Trait {
  isWorld(): boolean {
    return false;
  }
  /**
   * Creates a new instance of this param's State.
   */
  initExclusiveState(_world: World, _systemMeta: SystemMeta): State {
    throw new NotImplementedError();
  }

  /**
   * Creates a parameter to be passed into an ExclusiveSystemParamFunction.
   */
  getExclusiveParam(_state: State, _systemMeta: SystemMeta, _input: any): Item {
    throw new NotImplementedError();
  }
}

ExclusiveSystemParam.implFor<
  typeof ExclusiveSystemParam<any[]>,
  typeof Array<ExclusiveSystemParam>
>(Array<ExclusiveSystemParam>, {
  initExclusiveState(
    this: Array<ExclusiveSystemParam>,
    world: World,
    systemMeta: SystemMeta,
  ): any[] {
    return this.map((param) => into(param).initExclusiveState(world, systemMeta));
  },

  getExclusiveParam(
    this: Array<ExclusiveSystemParam>,
    state: any[],
    systemMeta: SystemMeta,
    input: any,
  ): any[] {
    return this.map((param, i) => into(param).getExclusiveParam(state[i], systemMeta, input));
  },
});

function into(param: Constructor<IntoExclusiveSystemParam> | ExclusiveSystemParam) {
  if (typeof param === 'function') {
    return IntoExclusiveSystemParam.wrap(param).intoExclusiveSystemParam();
  } else {
    return param;
  }
}

export class IntoExclusiveSystemParam extends Trait {
  static intoExclusiveSystemParam(): ExclusiveSystemParam {
    throw new NotImplementedError();
  }
}
