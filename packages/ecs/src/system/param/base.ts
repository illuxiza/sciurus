import { Constructor, defaultVal, macroTrait, NotImplementedError, Trait } from 'rustable';
import { Archetype } from '../../archetype/base';
import { Tick } from '../../change_detection/tick';
import { World } from '../../world';
import { DeferredWorld } from '../../world/deferred';
import { SystemMeta } from '../types';

export type SystemParamConstructor<
  T extends SystemParamClass<O>,
  O extends Record<string, SystemParam> = Record<string, SystemParam>,
> = Constructor<T> & {
  getTargetType(): Constructor<any>;
};

export interface SystemParamClass<
  O extends Record<string, SystemParam> = Record<string, SystemParam>,
> {
  getOptions(): O;
}

export interface SystemParamState<T> {
  state: T;
}

export interface SystemParamOptions extends Record<string, SystemParam> {}

// Create FetchState class for storing field states
class FetchState implements SystemParamState<Record<string, any>> {
  constructor(public state: Record<string, any>) {}
}

/**
 * A parameter that can be used in a System.
 */
class SystemParamTrait<State = any, Item = any> extends Trait {
  STATE!: State;
  ITEM!: Item;
  /**
   * Registers any World access used by this SystemParam
   * and creates a new instance of this param's State.
   */
  initParamState(_world: World, _systemMeta: SystemMeta): State {
    throw new NotImplementedError();
  }

  /**
   * For the specified Archetype, registers the components accessed by this SystemParam (if applicable).
   *
   * @param state The system parameter state
   * @param archetype The archetype to register components for
   * @param systemMeta The system metadata
   */
  newArchetype(_state: State, _archetype: Archetype, _systemMeta: SystemMeta): void {}

  /**
   * Applies any deferred mutations stored in this SystemParam's state.
   * This is used to apply Commands during ApplyDeferred.
   */
  apply(_state: State, _systemMeta: SystemMeta, _world: World): void {}

  /**
   * Queues any deferred mutations to be applied at the next ApplyDeferred.
   */
  queue(_state: State, _systemMeta: SystemMeta, _world: DeferredWorld): void {}

  /**
   * Validates that the param can be acquired by the getParam.
   */
  validateParam(_state: State, _systemMeta: SystemMeta, _world: World): boolean {
    return true;
  }

  /**
   * Creates a parameter to be passed into a SystemParamFunction.
   */
  getParam(
    _state: State,
    _systemMeta: SystemMeta,
    _world: World,
    _changeTick: Tick,
    _input: any,
  ): Item {
    throw new NotImplementedError();
  }
}

export const SystemParam = macroTrait<
  SystemParamConstructor<SystemParamClass>,
  typeof SystemParamTrait<FetchState>
>(SystemParamTrait, {
  initParamState(world: World, systemMeta: SystemMeta): FetchState {
    // Initialize state for each property's SystemParam
    const states: Record<string, any> = {};
    for (const [key, param] of Object.entries(this.getOptions())) {
      states[key] = into(param).initParamState(world, systemMeta);
    }
    return new FetchState(states);
  },

  newArchetype(
    this: SystemParamClass,
    state: FetchState,
    archetype: Archetype,
    systemMeta: SystemMeta,
  ): void {
    // Delegate to each property's SystemParam
    for (const [key, param] of Object.entries(this.getOptions())) {
      into(param).newArchetype(state.state[key], archetype, systemMeta);
    }
  },

  apply(this: SystemParamClass, state: FetchState, systemMeta: SystemMeta, world: World): void {
    for (const [key, param] of Object.entries(this.getOptions())) {
      into(param).apply(state.state[key], systemMeta, world);
    }
  },

  queue(
    this: SystemParamClass,
    state: FetchState,
    systemMeta: SystemMeta,
    world: DeferredWorld,
  ): void {
    for (const [key, param] of Object.entries(this.getOptions())) {
      into(param).queue(state.state[key], systemMeta, world);
    }
  },

  validateParam(
    this: SystemParamClass,
    state: FetchState,
    systemMeta: SystemMeta,
    world: World,
  ): boolean {
    return Object.entries(this.getOptions()).every(([key, param]) => {
      return into(param).validateParam(state.state[key], systemMeta, world);
    });
  },

  getParam(
    this: SystemParamClass,
    state: FetchState,
    systemMeta: SystemMeta,
    world: World,
    changeTick: Tick,
    input: any,
  ): any {
    // Create instance and set property values from SystemParams
    const instance = defaultVal(
      (this.constructor as SystemParamConstructor<SystemParamClass>).getTargetType(),
    );
    for (const [key, param] of Object.entries(this.getOptions())) {
      instance[key] = into(param).getParam(state.state[key], systemMeta, world, changeTick, input);
    }
    return instance;
  },
}) as typeof SystemParamTrait & ((target: any) => void);

export interface SystemParam<State = any, Item = any> extends SystemParamTrait<State, Item> {}
/**
 * A SystemParam that only reads a given World.
 */
export class ReadonlySystemParam<State = any, Item = any> extends SystemParam<State, Item> {}

SystemParam.implFor<typeof SystemParam<any[]>, typeof Array<SystemParam>>(Array, {
  initParamState(this: Array<SystemParam>, world: World, systemMeta: SystemMeta): any[] {
    return this.map((param) => into(param).initParamState(world, systemMeta));
  },

  newArchetype(
    this: Array<SystemParam>,
    state: any[],
    archetype: Archetype,
    systemMeta: SystemMeta,
  ): void {
    this.map((param, i) => into(param).newArchetype(state[i], archetype, systemMeta));
  },

  apply(this: Array<SystemParam>, state: any[], systemMeta: SystemMeta, world: World): void {
    this.map((param, i) => into(param).apply(state[i], systemMeta, world));
  },

  queue(
    this: Array<SystemParam>,
    state: any[],
    systemMeta: SystemMeta,
    world: DeferredWorld,
  ): void {
    this.map((param, i) => into(param).queue(state[i], systemMeta, world));
  },

  validateParam(
    this: Array<SystemParam>,
    state: any[],
    systemMeta: SystemMeta,
    world: World,
  ): boolean {
    return this.map((param, i) => into(param).validateParam(state[i], systemMeta, world)).every(
      (result) => result,
    );
  },

  getParam(
    this: Array<SystemParam>,
    state: any[],
    systemMeta: SystemMeta,
    world: World,
    changeTick: Tick,
    input: any,
  ): any[] {
    return this.map((param, i) =>
      into(param).getParam(state[i], systemMeta, world, changeTick, input),
    );
  },
});

function into(param: Constructor<IntoSystemParam> | SystemParam) {
  if (typeof param === 'function') {
    return IntoSystemParam.wrap(param).intoSystemParam();
  } else {
    return param;
  }
}

export class IntoSystemParam<Item = any> extends Trait {
  ITEM!: Item;
  static intoSystemParam<P extends SystemParam>(): P {
    throw new NotImplementedError();
  }
}
