import { logger } from '@sciurus/utils';
import { Constructor, NotImplementedError, Result, Trait, Type, Vec } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access } from '../query/access';
import { SystemSet } from '../schedule/set';
import { World } from '../world';
import { DeferredWorld } from '../world/deferred';

export class System<In = any, Out = any> extends Trait {
  INPUT: Constructor<In> = undefined!;
  OUTPUT: Constructor<Out> = undefined!;

  name(): string {
    throw new NotImplementedError();
  }

  type(): Constructor {
    return Type(this.constructor as Constructor, [this.INPUT, this.OUTPUT]);
  }

  componentAccess(): Access {
    throw new NotImplementedError();
  }

  archetypeComponentAccess(): Access {
    throw new NotImplementedError();
  }

  run(input: In, world: World): Out {
    this.updateArchetypeComponentAccess(world);
    let ret = this.runUnsafe(input, world);
    this.applyDeferred(world);
    return ret;
  }

  runUnsafe(_input: In, _world: World): Out {
    throw new NotImplementedError();
  }

  applyDeferred(_world: World): void {
    throw new NotImplementedError();
  }

  queueDeferred(_world: DeferredWorld): void {
    throw new NotImplementedError();
  }

  validateParamUnsafe(_world: World): boolean {
    throw new NotImplementedError();
  }

  validateParam(world: World): boolean {
    this.updateArchetypeComponentAccess(world);
    return this.validateParamUnsafe(world);
  }

  initialize(_world: World): void {
    throw new NotImplementedError();
  }

  isExclusive(): boolean {
    throw new NotImplementedError();
  }

  hasDeferred(): boolean {
    throw new NotImplementedError();
  }

  updateArchetypeComponentAccess(_world: World): void {
    throw new NotImplementedError();
  }

  defaultSystemSets(): Vec<SystemSet> {
    return Vec.new();
  }

  checkChangeTick(_changeTick: Tick): void {
    throw new NotImplementedError();
  }

  getLastRun(): Tick {
    throw new NotImplementedError();
  }

  setLastRun(_lastRun: Tick): void {
    throw new NotImplementedError();
  }
}

export class ReadonlySystem<In = any, Out = any> extends System<In, Out> {
  runReadonly(input: In, world: World): Out {
    this.updateArchetypeComponentAccess(world);
    return this.runUnsafe(input, world);
  }
}

export class RunSystemOnce extends Trait {
  /**
   * Tries to run a system and apply its deferred parameters.
   */
  runSystemOnce<T, Out>(system: T): Result<Out, Error> {
    return this.runSystemOnceWith(system, []);
  }

  /**
   * Tries to run a system with given input and apply deferred parameters.
   */
  runSystemOnceWith<T, In, Out>(_system: T, _input: In): Result<Out, Error> {
    throw new NotImplementedError();
  }
}

export const checkSystemChangeTick = (lastRun: Tick, thisRun: Tick, systemName: string) => {
  if (lastRun.checkTick(thisRun)) {
    let age = thisRun.relativeTo(lastRun).get();
    logger.warn(`System ${systemName} has not run for ${age} ticks. \
            Changes older than ${Tick.MAX.get() - 1} ticks will not be detected.`);
  }
};
