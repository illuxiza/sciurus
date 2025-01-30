import { Tick } from '../../change_detection';
import { Entities } from '../../entity/collection';
import { World } from '../../world';
import { SystemMeta } from '../types';
import { IntoSystemParam, SystemParam } from './base';

class EntitiesSystemParam {}

SystemParam.implFor(EntitiesSystemParam, {
  initParamState(_world: World, _systemMeta: SystemMeta): void {},
  getParam(_state: unknown, _systemMeta: SystemMeta, world: World, _changeTick: Tick): Entities {
    return world.entities;
  },
});

interface EntitiesSystemParam extends SystemParam<void, Entities> {}

IntoSystemParam.implFor(Entities, {
  static: {
    intoSystemParam(): EntitiesSystemParam {
      return new EntitiesSystemParam();
    },
  },
});

declare module '../../entity/collection' {
  export interface Entities extends IntoSystemParam<Entities> {}
}
