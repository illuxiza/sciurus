import { Constructor, createFactory, implTrait } from 'rustable';
import { Tick } from '../../change_detection';
import { WorldCell } from '../../world/cell';
import { SystemMeta } from '../types';
import { SystemParam } from './base';
import { ExclusiveSystemParam } from './exclusive';

class InParam<T> {
  constructor(public valueType: Constructor<T>) {}
}

implTrait(InParam, SystemParam, {
  initParamState() {},
  getParam(_state: any, _systemMeta: SystemMeta, _world: WorldCell, _changeTick: Tick, input: any) {
    return input;
  },
});

implTrait(InParam, ExclusiveSystemParam, {
  initExclusiveState() {},
  getExclusiveParam(_state: void, _systemMeta: SystemMeta, input: any) {
    return input;
  },
});

interface InParam<T> extends SystemParam<void, T> {}

export interface In<T extends object> extends InParam<T> {}

function createParam<T extends object>(valueType: Constructor<T>): InParam<T> {
  return new InParam<T>(valueType);
}

export const In = createFactory(InParam, createParam) as typeof InParam & {
  <T extends object>(valueType: Constructor<T>): InParam<T>;
};
