import { Constructor, createFactory } from 'rustable';
import { Tick } from '../../change_detection';
import { World } from '../../world';
import { SystemMeta } from '../types';
import { SystemParam } from './base';
import { ExclusiveSystemParam } from './exclusive';

class InParam<T> {
  constructor(public valueType: Constructor<T>) {}
}

SystemParam.implFor(InParam, {
  initParamState() {},
  getParam(_state: any, _systemMeta: SystemMeta, _world: World, _changeTick: Tick, input: any) {
    return input;
  },
});

ExclusiveSystemParam.implFor(InParam, {
  initExclusiveState() {},
  getExclusiveParam(_state: unknown, _systemMeta: SystemMeta, input: any) {
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
