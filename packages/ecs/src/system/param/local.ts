import { Cell } from '@sciurus/utils';
import { Constructor, createFactory, Ptr } from 'rustable';
import { Tick } from '../../change_detection';
import { World } from '../../world';
import { FromWorld } from '../../world/from';
import { SystemMeta } from '../types';
import { SystemParam } from './base';
import { ExclusiveSystemParam } from './exclusive';

export class LocalParam<T extends object> {
  constructor(public valueType: Constructor<T>) {}

  initParamState(world: World, _systemMeta: SystemMeta): Cell<T> {
    return new Cell<T>(FromWorld.staticWrap(this.valueType).fromWorld(world));
  }

  getParam(state: Cell<T>, _systemMeta: SystemMeta, _world: World, _changeTick: Tick): Ptr<T> {
    return state.toPtr();
  }

  initExclusiveState(world: World, _systemMeta: SystemMeta): Cell<T> {
    return new Cell(FromWorld.staticWrap(this.valueType).fromWorld(world));
  }

  getExclusiveParam(state: Cell<T>, _systemMeta: SystemMeta, _input: any): Ptr<T> {
    return state.toPtr();
  }
}

SystemParam.implFor(LocalParam);

ExclusiveSystemParam.implFor(LocalParam);

export interface LocalParam<T extends object> extends SystemParam<Cell<T>, Ptr<T>> {}

export interface Local<T extends object> extends LocalParam<T> {}

export const Local = createFactory(LocalParam) as typeof LocalParam & {
  <T extends object>(valueType: Constructor<T>): LocalParam<T>;
};
