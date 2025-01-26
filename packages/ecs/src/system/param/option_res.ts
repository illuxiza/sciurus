import { Constructor, createFactory, implTrait, None, Option, Some } from 'rustable';
import { Tick, Ticks } from '../../change_detection';
import { Res as ResValue } from '../../change_detection/res';
import { ComponentId } from '../../component';
import { World } from '../../world';
import { SystemMeta } from '../types';
import { ReadonlySystemParam, SystemParam } from './base';

class OptionResParam<T extends object = any> {
  constructor(public valueType: Constructor<T>) {}

  #world?: World;
  #value?: T;

  init(world: World): this {
    this.#world = world;
    this.#value = world.getResource(this.valueType).unwrap();
    return this;
  }

  clone(hash = new WeakMap<any, any>()): OptionResParam<T> {
    const cloned = new OptionResParam<T>(this.valueType);
    if (this.#world) cloned.#world = hash.get(this.#world);
    if (this.#value) cloned.#value = hash.get(this.#value);
    return cloned;
  }

  get value(): T {
    return this.#value!;
  }
}

implTrait(OptionResParam, SystemParam, {
  initParamState(this: OptionResParam, _world: World, _systemMeta: SystemMeta): ComponentId {
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

  validateParam(_state: ComponentId, _systemMeta: SystemMeta, _world: World): boolean {
    return true;
  },

  getParam(state: ComponentId, systemMeta: SystemMeta, world: World, changeTick: Tick): any {
    const op = world.getResourceWithTicks(state);
    if (op.isNone()) {
      return None;
    }
    const [ptr, ticks, caller] = op.unwrap();
    return Some(
      ResValue.new(ptr, Ticks.fromTickCells(ticks, systemMeta.lastRun, changeTick), caller),
    );
  },
});

interface OptionResParam<T extends object> extends SystemParam<ComponentId, OptionRes<T>> {}

implTrait(OptionResParam, ReadonlySystemParam);

function createParam<T extends object>(valueType: Constructor<T>): OptionResParam<T> {
  return new OptionResParam<T>(valueType);
}

export const OptionRes = createFactory(ResValue, createParam) as typeof ResValue & {
  <T extends object>(valueType: Constructor<T>): OptionResParam<T>;
};

export type OptionRes<T> = Option<ResValue<T> & T>;
