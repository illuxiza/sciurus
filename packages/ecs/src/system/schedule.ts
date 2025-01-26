import { implTrait, Ok, Result, Vec } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access } from '../query/access';
import { SystemSet } from '../schedule/set';
import { World } from '../world/base';
import { DeferredWorld } from '../world/deferred';
import { System } from './base';

/**
 * A type which wraps and unifies the different sorts of systems that can be added to a schedule.
 */
export class ScheduleSystem {
  constructor(public inner: System<void, Result<void, Error>> | System<void, void>) {}
}

export interface ScheduleSystem extends System<void, Result<void, Error>> {}

implTrait(ScheduleSystem, System<void, Result<void, Error>>, {
  name(this: ScheduleSystem): string {
    return this.inner.name();
  },

  componentAccess(this: ScheduleSystem): Access {
    return this.inner.componentAccess();
  },

  archetypeComponentAccess(this: ScheduleSystem): Access {
    return this.inner.archetypeComponentAccess();
  },

  isExclusive(this: ScheduleSystem): boolean {
    return this.inner.isExclusive();
  },

  hasDeferred(this: ScheduleSystem): boolean {
    return this.inner.hasDeferred();
  },
  runUnsafe(this: ScheduleSystem, world: World): Result<void, Error> {
    const ret = (this.inner as System<void, Result<void, Error>>).runUnsafe(void 0, world);
    if (!ret) {
      return Ok(void 0);
    }
    return ret;
  },

  run(this: ScheduleSystem, input: any, world: World): Result<void, Error> {
    const ret = (this.inner as System<void, Result<void, Error>>).run(input, world);
    if (!ret) {
      return Ok(void 0);
    }
    return ret;
  },

  applyDeferred(this: ScheduleSystem, world: World): void {
    this.inner.applyDeferred(world);
  },

  queueDeferred(this: ScheduleSystem, world: DeferredWorld): void {
    this.inner.queueDeferred(world);
  },

  validateParamUnsafe(this: ScheduleSystem, world: World): boolean {
    return this.inner.validateParamUnsafe(world);
  },

  initialize(this: ScheduleSystem, world: World): void {
    this.inner.initialize(world);
  },

  updateArchetypeComponentAccess(this: ScheduleSystem, world: World): void {
    this.inner.updateArchetypeComponentAccess(world);
  },

  checkChangeTick(this: ScheduleSystem, changeTick: Tick): void {
    this.inner.checkChangeTick(changeTick);
  },

  defaultSystemSets(this: ScheduleSystem): Vec<SystemSet> {
    return this.inner.defaultSystemSets();
  },

  getLastRun(this: ScheduleSystem): Tick {
    return this.inner.getLastRun();
  },

  setLastRun(this: ScheduleSystem, lastRun: Tick): void {
    this.inner.setLastRun(lastRun);
  },
});
