import { NOT_IMPLEMENTED } from '@sciurus/utils';
import { implTrait, trait, Type, Vec } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access } from '../query/access';
import { SystemSet } from '../schedule/set';
import { World } from '../world';
import { DeferredWorld } from '../world/deferred';
import { System } from './base';

/**
 * Customizes the behavior of an AdapterSystem
 */
@trait
export class Adapt<In, Out, T> {
  /**
   * When used in an AdapterSystem, this function customizes how the system
   * is run and how its inputs/outputs are adapted.
   */
  adapt(_input: In, _runSystem: (input: In) => Out): T {
    throw NOT_IMPLEMENTED;
  }
}

export class AdaptFunc<In, Out, T> {
  constructor(public func: (out: Out) => T) {}
  adapt(input: In, runSystem: (input: In) => Out) {
    return this.func(runSystem(input));
  }
}

implTrait(AdaptFunc, Adapt);

/**
 * A System that takes the output of S and transforms it by applying Func to it
 */
export class AdapterSystem<In, Out, T> {
  constructor(
    public func: Adapt<In, Out, T>,
    public system: System<In, Out>,
    private _name: string,
  ) {}

  name(): string {
    return this._name;
  }

  type() {
    return Type(this.system.type(), [this.func.constructor]);
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

  runUnsafe(input: any, world: World): any {
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

  validateParamUnsafe(world: World): boolean {
    return this.system.validateParamUnsafe(world);
  }

  initialize(world: World): void {
    this.system.initialize(world);
  }

  updateArchetypeComponentAccess(world: World): void {
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

implTrait(AdapterSystem, System);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface AdapterSystem<In, Out, T> extends System<In, T> {}
