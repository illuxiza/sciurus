import { Constructor, createFactory, implTrait } from 'rustable';
import { Tick } from '../../change_detection';
import { World } from '../../world/base';
import { WorldCell } from '../../world/cell';
import { SystemMeta } from '../types';
import { SystemParam } from './base';
import { ExclusiveSystemParam } from './exclusive';

class InParam<T> {
  constructor(public valueType: Constructor<T>) {}

  initParamState(_world: World, _systemMeta: SystemMeta): void {}

  getParam(
    _state: any,
    _systemMeta: SystemMeta,
    _world: WorldCell,
    _changeTick: Tick,
    input: T,
  ): T {
    return input;
  }
  initExclusiveState(_world: World, _systemMeta: SystemMeta): void {}

  getExclusiveParam(_state: void, _systemMeta: SystemMeta, input: T): T {
    return input;
  }
}

implTrait(InParam, SystemParam);

implTrait(InParam, ExclusiveSystemParam);

interface InParam<T> extends SystemParam<void, T> {}

export interface In<T extends object> extends InParam<T> {}

function createParam<T extends object>(valueType: Constructor<T>): InParam<T> {
  return new InParam<T>(valueType);
}

export const In = createFactory(InParam, createParam) as typeof InParam & {
  <T extends object>(valueType: Constructor<T>): InParam<T>;
};
