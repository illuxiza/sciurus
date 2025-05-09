import { Constructor, None, Option, Some, Vec } from 'rustable';
import { Tick } from '../../change_detection';
import { Access } from '../../query/access';
import { IntoSystemSet, SystemSet, SystemTypeSet } from '../../schedule/set';
import { World } from '../../world';
import { DeferredWorld } from '../../world/deferred';
import { checkSystemChangeTick, System } from '../base';
import { ExclusiveSystemParam } from '../param/exclusive';
import { SystemMeta } from '../types';
import { ERROR_UNINITIALIZED, FunctionSystemState } from './types';

/** A function system that runs with exclusive World access */
export class ExclusiveFunctionSystem {
  state: Option<FunctionSystemState<any>>;
  meta: SystemMeta;

  constructor(
    public func: (...args: any[]) => any,
    public param: ExclusiveSystemParam,
    private _type: Constructor,
  ) {
    this.state = None;
    this.meta = SystemMeta.new(func.name || 'anonymous_system');
  }

  /** Return this system with a new name */
  withName(newName: string): this {
    this.meta.name = newName;
    return this;
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
    // exclusive systems should have access to non-send resources
    // the executor runs exclusive systems on the main thread
    return false;
  }

  isExclusive(): boolean {
    return true;
  }

  hasDeferred(): boolean {
    // exclusive systems have no deferred system params
    return false;
  }

  initialize(world: World): void {
    this.meta.lastRun = world.changeTick.relativeTo(Tick.MAX);
    this.state = Some({
      param: this.param.initExclusiveState(world, this.meta),
      worldId: world.id,
    });
  }

  run(input: any, world: World): any {
    return world.lastChangeTickScope(this.meta.lastRun, (world) => {
      const paramState = this.state.expect(ERROR_UNINITIALIZED).param;
      const params = this.param.getExclusiveParam(paramState, this.meta, input);
      const out = this.func(world, ...params);

      world.flush();
      this.meta.lastRun = world.incrementChangeTick();

      return out;
    });
  }

  runUnsafe(_input: any, _world: World): any {
    throw new Error('Cannot run exclusive systems with a shared World reference');
  }

  applyDeferred(_world: World): void {
    // "pure" exclusive systems do not have any buffers to apply
  }

  queueDeferred(_world: DeferredWorld): void {
    // "pure" exclusive systems do not have any buffers to apply
  }

  validateParamUnsafe(_world: World): boolean {
    // All exclusive system params are always available
    return true;
  }

  updateArchetypeComponentAccess(_world: World): void {}

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

System.implFor(ExclusiveFunctionSystem);

export interface ExclusiveFunctionSystem extends System {}

IntoSystemSet.implFor(ExclusiveFunctionSystem, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(this.type());
  },
});

export interface ExclusiveFunctionSystem extends IntoSystemSet {}
