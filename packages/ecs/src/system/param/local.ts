import { Cell } from '@sciurus/utils';
import { Constructor, createFactory, implTrait, Ptr } from 'rustable';
import { Tick } from '../../change_detection';
import { World } from '../../world/base';
import { WorldCell } from '../../world/cell';
import { fromWorld } from '../../world/from';
import { SystemMeta } from '../types';
import { SystemParam } from './base';
import { ExclusiveSystemParam } from './exclusive';

export class LocalParam<T extends object> {
  constructor(public valueType: Constructor<T>) {}

  initParamState(world: World, _systemMeta: SystemMeta): Cell<T> {
    return new Cell<T>(fromWorld(world, this.valueType));
  }

  getParam(state: Cell<T>, _systemMeta: SystemMeta, _world: WorldCell, _changeTick: Tick): Ptr<T> {
    return state.toPtr();
  }

  initExclusiveState(world: World, _systemMeta: SystemMeta): Cell<T> {
    return new Cell(fromWorld(world, this.valueType));
  }

  getExclusiveParam(state: Cell<T>, _systemMeta: SystemMeta, _input: any): Ptr<T> {
    return state.toPtr();
  }
}

implTrait(LocalParam, SystemParam);

implTrait(LocalParam, ExclusiveSystemParam);

export interface LocalParam<T extends object> extends SystemParam<Cell<T>, Ptr<T>> {}

export interface Local<T extends object> extends LocalParam<T> {}

export const Local = createFactory(LocalParam) as typeof LocalParam & {
  <T extends object>(valueType: Constructor<T>): LocalParam<T>;
};
