import { implTrait, trait, Vec } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access } from '../query/access';
import { SystemSet } from '../schedule/set';
import { WorldCell } from '../world';
import { World } from '../world/base';
import { DeferredWorld } from '../world/deferred';
import { System } from './base';

/**
 * Customizes the behavior of an AdapterSystem
 */
@trait
export class Adapt {
  /**
   * When used in an AdapterSystem, this function customizes how the system
   * is run and how its inputs/outputs are adapted.
   */
  adapt(_input: any, _runSystem: (input: any) => any): any {
    throw new Error('Method not implemented.');
  }
}

/**
 * A System that takes the output of S and transforms it by applying Func to it
 */
export class AdapterSystem {
  constructor(
    public func: Adapt,
    public system: System,
    private __name: string,
  ) {}

  static new<Func extends Adapt, S extends System>(
    func: Func,
    system: S,
    name: string,
  ): AdapterSystem {
    return new AdapterSystem(func, system, name);
  }

  name(): string {
    return this.__name;
  }

  componentAccess(): Access {
    return this.system.componentAccess();
  }

  archetypeComponentAccess(): Access {
    return this.system.archetypeComponentAccess();
  }

  isExclusive(): boolean {
    return this.system.isExclusive();
  }

  hasDeferred(): boolean {
    return this.system.hasDeferred();
  }

  runUnsafe(input: any, world: WorldCell): any {
    return this.func.adapt(input, (input) => this.system.runUnsafe(input, world));
  }

  run(input: any, world: World): any {
    return this.func.adapt(input, (input) => this.system.run(input, world));
  }

  applyDeferred(world: World): void {
    this.system.applyDeferred(world);
  }

  queueDeferred(world: DeferredWorld): void {
    this.system.queueDeferred(world);
  }

  validateParamUnsafe(world: WorldCell): boolean {
    return this.system.validateParamUnsafe(world);
  }

  initialize(world: World): void {
    this.system.initialize(world);
  }

  updateArchetypeComponentAccess(world: WorldCell): void {
    this.system.updateArchetypeComponentAccess(world);
  }

  checkChangeTick(changeTick: Tick): void {
    this.system.checkChangeTick(changeTick);
  }

  defaultSystemSets(): Vec<SystemSet> {
    return this.system.defaultSystemSets();
  }

  getLastRun(): Tick {
    return this.system.getLastRun();
  }

  setLastRun(lastRun: Tick): void {
    this.system.setLastRun(lastRun);
  }
}

// Implement ReadonlySystem for AdapterSystem if the inner system is read-only
implTrait(AdapterSystem, System);

export interface AdapterSystem extends System {}
