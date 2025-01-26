import { NOT_IMPLEMENTED, TraitValid } from '@sciurus/utils';
import { Constructor, implTrait, trait, useTrait } from 'rustable';
import { World } from '../../world/base';
import { SystemMeta } from '../types';

/**
 * A trait implemented for all exclusive system parameters.
 */
@trait
export class ExclusiveSystemParam<State = any, Item = any> extends TraitValid {
  isWorld(): boolean {
    return false;
  }
  /**
   * Creates a new instance of this param's State.
   */
  initExclusiveState(_world: World, _systemMeta: SystemMeta): State {
    throw NOT_IMPLEMENTED;
  }

  /**
   * Creates a parameter to be passed into an ExclusiveSystemParamFunction.
   */
  getExclusiveParam(_state: State, _systemMeta: SystemMeta, _input: any): Item {
    throw NOT_IMPLEMENTED;
  }
}

implTrait(Array<ExclusiveSystemParam>, ExclusiveSystemParam, {
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
    return useTrait(param, IntoExclusiveSystemParam).intoExclusiveSystemParam();
  } else {
    return param;
  }
}

@trait
export class IntoExclusiveSystemParam {
  static intoExclusiveSystemParam(): ExclusiveSystemParam {
    throw NOT_IMPLEMENTED;
  }
}
