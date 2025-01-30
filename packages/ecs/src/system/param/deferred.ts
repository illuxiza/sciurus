import { Cell } from '@sciurus/utils';
import { Constructor, createFactory, Ptr } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { World } from '../../world';
import { DeferredWorld } from '../../world/deferred';
import { FromWorld } from '../../world/from';
import { SystemBuffer } from '../buffer';
import { SystemMeta } from '../types';
import { SystemParam } from './base';

export class DeferredParam<T extends SystemBuffer> {
  constructor(public valueType: Constructor<T>) {}
}

SystemParam.implFor<typeof SystemParam<Cell<any>>, typeof DeferredParam>(DeferredParam, {
  initParamState(world: World, systemMeta: SystemMeta): Cell<any> {
    systemMeta.setHasDeferred();
    return new Cell(FromWorld.staticWrap(this.valueType).fromWorld(world));
  },

  apply(state: Cell<any>, systemMeta: SystemMeta, world: World): void {
    state.get().applyBuffer(systemMeta, world);
  },

  queue(state: Cell<any>, systemMeta: SystemMeta, world: DeferredWorld): void {
    state.get().queueBuffer(systemMeta, world);
  },

  getParam(state: Cell<any>, _systemMeta: SystemMeta, _world: World, _changeTick: Tick): Ptr<any> {
    return state.toPtr();
  },
});

export interface DeferredParam<T extends SystemBuffer> extends SystemParam<Cell<T>, Ptr<T>> {}

export interface Deferred<T extends SystemBuffer> extends DeferredParam<T> {}

export const Deferred = createFactory(DeferredParam) as typeof DeferredParam & {
  <T extends SystemBuffer>(valueType: Constructor<T>): DeferredParam<T>;
};
