import { logger } from '@sciurus/utils';
import { Constructor, Result, trait, Type, Vec } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access } from '../query/access';
import { SystemSet } from '../schedule/set';
import { World } from '../world/base';
import { WorldCell } from '../world/cell';
import { DeferredWorld } from '../world/deferred';

@trait
export class System<In = any, Out = any> {
  input: Constructor<In> = undefined!;
  output: Constructor<Out> = undefined!;

  name(): string {
    throw new Error('Method not implemented.');
  }

  type(): Constructor {
    return Type(System, [this.input, this.output]);
  }

  componentAccess(): Access {
    throw new Error('Method not implemented.');
  }

  archetypeComponentAccess(): Access {
    throw new Error('Method not implemented.');
  }

  run(input: In, world: World): Out {
    const cell = world.asWorldCell();
    this.updateArchetypeComponentAccess(cell);
    let ret = this.runUnsafe(input, cell);
    this.applyDeferred(cell.world);
    return ret;
  }

  runUnsafe(_input: In, _world: WorldCell): Out {
    throw new Error('Method not implemented.');
  }

  applyDeferred(_world: World): void {
    throw new Error('Method not implemented.');
  }

  queueDeferred(_world: DeferredWorld): void {
    throw new Error('Method not implemented.');
  }

  validateParamUnsafe(_world: WorldCell): boolean {
    throw new Error('Method not implemented.');
  }

  validateParam(world: World): boolean {
    const cell = world.asWorldCell();
    this.updateArchetypeComponentAccess(cell);
    return this.validateParamUnsafe(cell);
  }

  initialize(_world: World): void {
    throw new Error('Method not implemented.');
  }

  isExclusive(): boolean {
    throw new Error('Method not implemented.');
  }

  hasDeferred(): boolean {
    throw new Error('Method not implemented.');
  }

  updateArchetypeComponentAccess(_world: WorldCell): void {
    throw new Error('Method not implemented.');
  }

  defaultSystemSets(): Vec<SystemSet> {
    return Vec.new();
  }

  checkChangeTick(_changeTick: Tick): void {
    throw new Error('Method not implemented.');
  }

  getLastRun(): Tick {
    throw new Error('Method not implemented.');
  }

  setLastRun(_lastRun: Tick): void {
    throw new Error('Method not implemented.');
  }
}

@trait
export class ReadonlySystem<In = any, Out = any> extends System<In, Out> {
  runReadonly(input: In, world: World): Out {
    const worldCell = world.asWorldCell();
    this.updateArchetypeComponentAccess(worldCell);
    return this.runUnsafe(input, worldCell);
  }
}

@trait
export class RunSystemOnce {
  /**
   * Tries to run a system and apply its deferred parameters.
   */
  runSystemOnce<T extends object, Out>(system: T): Result<Out, Error> {
    return this.runSystemOnceWith(system, []);
  }

  /**
   * Tries to run a system with given input and apply deferred parameters.
   */
  runSystemOnceWith<T extends object, In, Out>(_system: T, _input: In): Result<Out, Error> {
    throw new Error('Method not implemented.');
  }
}

export const checkSystemChangeTick = (lastRun: Tick, thisRun: Tick, systemName: string) => {
  if (lastRun.checkTick(thisRun)) {
    let age = thisRun.relativeTo(lastRun).get();
    logger.warn(`System ${systemName} has not run for ${age} ticks. \
            Changes older than ${Tick.MAX.get() - 1} ticks will not be detected.`);
  }
};
