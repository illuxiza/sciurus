import { implTrait } from 'rustable';
import { Tick } from '../../change_detection';
import { Entities } from '../../entity/collection';
import { World, WorldCell } from '../../world';
import { SystemMeta } from '../types';
import { IntoSystemParam, SystemParam } from './base';

class EntitiesSystemParam {
  initParamState(_world: World, _systemMeta: SystemMeta): void {}
  getParam(_state: void, _systemMeta: SystemMeta, world: WorldCell, _changeTick: Tick): Entities {
    return world.entities;
  }
}

implTrait(EntitiesSystemParam, SystemParam);

interface EntitiesSystemParam extends SystemParam<void, Entities> {}

implTrait(Entities, IntoSystemParam, {
  static: {
    intoSystemParam(): EntitiesSystemParam {
      return new EntitiesSystemParam();
    },
  },
});

declare module '../../entity/collection' {
  export interface Entities extends IntoSystemParam<Entities> {}
}
