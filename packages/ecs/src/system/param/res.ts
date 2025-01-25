import { Constructor, createFactory, implTrait } from 'rustable';
import { Tick, Ticks } from '../../change_detection';
import { Res as ResValue } from '../../change_detection/res';
import { ComponentId } from '../../component';
import { World } from '../../world/base';
import { WorldCell } from '../../world/cell';
import { SystemMeta } from '../types';
import { ReadonlySystemParam, SystemParam } from './base';

class ResParam<T extends object = any> {
  constructor(public valueType: Constructor<T>) {}

  #world?: WorldCell;
  #value?: T;

  init(world: WorldCell): this {
    this.#world = world;
    this.#value = world.getResource(this.valueType).unwrap();
    return this;
  }

  clone(hash = new WeakMap<any, any>()): ResParam<T> {
    const cloned = new ResParam<T>(this.valueType);
    if (this.#world) cloned.#world = hash.get(this.#world);
    if (this.#value) cloned.#value = hash.get(this.#value);
    return cloned;
  }

  get value(): T {
    return this.#value!;
  }
}

implTrait(ResParam, SystemParam, {
  initParamState(this: ResParam, _world: World, _systemMeta: SystemMeta): ComponentId {
    const componentId = _world.components.registerResource(this.valueType);
    const archetypeComponentId = _world.initializeResourceInternal(componentId).id;
    const combinedAccess = _systemMeta.componentAccessSet.combinedAccess;
    if (combinedAccess.hasResourceWrite(componentId)) {
      throw new Error(
        `error[B0002]: Res<${this.valueType.name}> in system ${_systemMeta.name} conflicts with a previous ResMut<${this.valueType.name}> access. Consider removing the duplicate access.`,
      );
    }
    _systemMeta.componentAccessSet.addUnfilteredResourceRead(componentId);
    _systemMeta.archetypeComponentAccess.addResourceRead(archetypeComponentId);
    return componentId;
  },

  validateParam(state: ComponentId, systemMeta: SystemMeta, world: WorldCell): boolean {
    const isValid = world.storages.resources
      .get(state)
      .isSomeAnd((resourceData) => resourceData.isPresent());
    if (!isValid) {
      systemMeta.tryWarnParam('Res', this.valueType.name);
    }
    return isValid;
  },

  getParam(state: ComponentId, systemMeta: SystemMeta, world: WorldCell, changeTick: Tick): any {
    const op = world.getResourceWithTicks(state);
    if (op.isNone()) {
      throw new Error(
        `Resource requested by ${systemMeta.name} does not exist: ${this.valueType.name}`,
      );
    }
    const [ptr, ticks, caller] = op.unwrap();
    return ResValue.new(ptr, Ticks.fromTickCells(ticks, systemMeta.lastRun, changeTick), caller);
  },
});

interface ResParam<T extends object> extends SystemParam<ComponentId, Res<T>> {}

implTrait(ResParam, ReadonlySystemParam);

function createParam<T extends object>(valueType: Constructor<T>): ResParam<T> {
  return new ResParam<T>(valueType);
}

export const Res = createFactory(ResValue, createParam) as typeof ResValue & {
  <T extends object>(valueType: Constructor<T>): ResParam<T>;
};

// export interface Res<T extends object> extends ResValue<T> {}

export type Res<T> = ResValue<T> & T;
