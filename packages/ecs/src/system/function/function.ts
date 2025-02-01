import { Constructor, None, Option, Some, Vec } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { Access } from '../../query/access';
import { IntoSystemSet, SystemSet, SystemTypeSet } from '../../schedule/set';
import { World } from '../../world';
import { DeferredWorld } from '../../world/deferred';
import { checkSystemChangeTick, System } from '../base';
import { SystemParam } from '../param';
import { ParamWarnPolicy, SystemMeta, WithParamWarnPolicy } from '../types';
import { ERROR_UNINITIALIZED, FunctionSystemState } from './types';

export interface FunctionSystem extends System {}
/**
 * The function system implementation
 */
export class FunctionSystem {
  state: Option<FunctionSystemState<any>>;
  meta: SystemMeta;
  archetypeGen: number;

  constructor(
    public func: (...args: any[]) => any,
    public param: SystemParam,
    private _type: Constructor,
  ) {
    this.state = None;
    this.meta = SystemMeta.new(func.name || 'anonymous_system');
    this.archetypeGen = 0;
  }

  name(): string {
    return this.meta.name;
  }

  type(): Constructor {
    return this._type;
  }

  componentAccess(): Access {
    return this.meta.componentAccessSet.combinedAccess;
  }

  archetypeComponentAccess(): Access {
    return this.meta.archetypeComponentAccess;
  }

  isSend(): boolean {
    return true;
  }

  isExclusive(): boolean {
    return false;
  }

  hasDeferred(): boolean {
    return this.meta.hasDeferred;
  }

  withName(name: string): this {
    this.meta.name = name;
    return this;
  }

  runUnsafe(input: any, world: World): any {
    const changeTick = world.incrementChangeTick();
    const paramState = this.state.expect(ERROR_UNINITIALIZED).param;
    const params = this.param.getParam(paramState, this.meta, world, changeTick, input);
    const out = this.func(...params);
    this.meta.lastRun = changeTick;
    return out;
  }

  applyDeferred(world: World): void {
    const paramState = this.state.expect(ERROR_UNINITIALIZED).param;
    this.param.apply(paramState, this.meta, world);
  }

  queueDeferred(world: DeferredWorld): void {
    const paramState = this.state.expect(ERROR_UNINITIALIZED).param;
    this.param.queue(paramState, this.meta, world);
  }

  validateParamUnsafe(world: World): boolean {
    const paramState = this.state.expect(ERROR_UNINITIALIZED).param;
    const isValid = this.param.validateParam(paramState, this.meta, world);
    if (!isValid) {
      this.meta.advanceParamWarnPolicy();
    }
    return isValid;
  }

  initialize(world: World): void {
    if (this.state.isSome()) {
      const state = this.state.unwrap();
      if (state.worldId !== world.id) {
        throw new Error('System built with a different world than the one it was added to.');
      }
    } else {
      this.state = Some({
        param: this.param.initParamState(world, this.meta),
        worldId: world.id,
      });
    }
    this.meta.lastRun = world.changeTick.relativeTo(Tick.MAX);
  }

  updateArchetypeComponentAccess(world: World): void {
    // This method is called with World, but we need World
    // We can access the World through World.world
    const state = this.state.expect(ERROR_UNINITIALIZED);
    if (state.worldId !== world.id) {
      throw new Error(
        'Encountered a mismatched World. A System cannot be used with Worlds other than the one it was initialized with.',
      );
    }

    const archetypes = world.archetypes;
    const oldGeneration = this.archetypeGen;
    this.archetypeGen = archetypes.len();

    for (let i = oldGeneration; i < archetypes.len(); i++) {
      const archetype = archetypes.get(i);
      if (archetype.isSome()) {
        this.param.newArchetype(state.param, archetype.unwrap(), this.meta);
      }
    }
  }

  checkChangeTick(changeTick: Tick): void {
    checkSystemChangeTick(this.meta.lastRun, changeTick, this.meta.name);
  }

  defaultSystemSets(): Vec<SystemSet> {
    const set = new SystemTypeSet(this._type);
    return Vec.from([set]);
  }

  getLastRun(): Tick {
    return this.meta.lastRun;
  }

  setLastRun(lastRun: Tick): void {
    this.meta.lastRun = lastRun;
  }
}

System.implFor(FunctionSystem);

WithParamWarnPolicy.implFor(FunctionSystem, {
  withParamWarnPolicy(warnPolicy: ParamWarnPolicy): FunctionSystem {
    this.meta.setParamWarnPolicy(warnPolicy);
    return this;
  },
});

export interface FunctionSystem extends WithParamWarnPolicy {}

IntoSystemSet.implFor(FunctionSystem, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(this.type());
  },
});

export interface FunctionSystem extends IntoSystemSet {}
