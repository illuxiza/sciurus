import { Cell } from '@sciurus/utils';
import { Constructor, createFactory, implTrait, Ptr } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { World } from '../../world/base';
import { WorldCell } from '../../world/cell';
import { DeferredWorld } from '../../world/deferred';
import { fromWorld } from '../../world/from';
import { SystemBuffer } from '../buffer';
import { SystemMeta } from '../types';
import { SystemParam } from './base';

export class DeferredParam<T extends SystemBuffer> {
  constructor(public valueType: Constructor<T>) {}

  initParamState(world: World, systemMeta: SystemMeta): Cell<T> {
    systemMeta.setHasDeferred();
    return new Cell(fromWorld(world, this.valueType));
  }

  apply(state: Cell<T>, systemMeta: SystemMeta, world: World): void {
    state.get().applyBuffer(systemMeta, world);
  }

  queue(state: Cell<T>, systemMeta: SystemMeta, world: DeferredWorld): void {
    state.get().queueBuffer(systemMeta, world);
  }

  getParam(state: Cell<T>, _systemMeta: SystemMeta, _world: WorldCell, _changeTick: Tick): Ptr<T> {
    return state.toPtr();
  }
}

implTrait(DeferredParam, SystemParam);

export interface DeferredParam<T extends SystemBuffer> extends SystemParam<Cell<T>, Ptr<T>> {}

export interface Deferred<T extends SystemBuffer> extends DeferredParam<T> {}

export const Deferred = createFactory(DeferredParam) as typeof DeferredParam & {
  <T extends SystemBuffer>(valueType: Constructor<T>): DeferredParam<T>;
};
