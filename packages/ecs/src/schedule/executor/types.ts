import { FixedBitSet } from '@sciurus/utils';
import { Ok, Option, typeId, Vec } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { Access } from '../../query/access';
import { type ReadonlySystem, type ScheduleSystem, System } from '../../system';
import { World } from '../../world';
import { DeferredWorld } from '../../world/deferred';
import { NodeId } from '../graph';
import { IntoSystemSet, SystemSet, SystemTypeSet } from '../set';

export class SystemSchedule {
  constructor(
    public systemIds: Vec<NodeId> = Vec.new(),
    public systems: Vec<ScheduleSystem> = Vec.new(),
    public systemConditions: Vec<Vec<ReadonlySystem<any, boolean>>> = Vec.new(),
    public systemDependencies: Vec<number> = Vec.new(),
    public systemDependents: Vec<Vec<number>> = Vec.new(),
    public setsWithConditionsOfSystems: Vec<FixedBitSet> = Vec.new(),
    public setIds: Vec<NodeId> = Vec.new(),
    public setConditions: Vec<Vec<ReadonlySystem<any, boolean>>> = Vec.new(),
    public systemsInSetsWithConditions: Vec<FixedBitSet> = Vec.new(),
  ) {}
}

export interface SystemExecutor {
  kind(): ExecutorKind;
  init(schedule: SystemSchedule): void;
  run(schedule: SystemSchedule, world: World, skipSystems: Option<FixedBitSet>): void;
  setApplyFinalDeferred(apply: boolean): void;
}

export enum ExecutorKind {
  SingleThreaded = 'SingleThreaded',
  Simple = 'Simple',
  MultiThreaded = 'MultiThreaded',
}

export class ApplyDeferred {}

System.implFor(ApplyDeferred, {
  name(): string {
    return 'applyDeferred';
  },
  componentAccess(): Access {
    return new Access();
  },
  archetypeComponentAccess(): Access {
    return new Access();
  },
  isExclusive(): boolean {
    return true;
  },
  hasDeferred(): boolean {
    return false;
  },
  runUnsafe(_input: any, _world: World) {
    return Ok(undefined);
  },
  run(_input: any, _world: World) {
    return Ok(undefined);
  },
  applyDeferred(_world: World): void {},
  queueDeferred(_world: DeferredWorld): void {},
  validateParamUnsafe(_world: World): boolean {
    return true;
  },
  initialize(_world: World): void {},
  updateArchetypeComponentAccess(_world: World): void {},
  defaultSystemSets(): Vec<SystemSet> {
    return Vec.from([new SystemTypeSet(ApplyDeferred)]);
  },
  checkChangeTick(_changeTick: Tick): void {},
  getLastRun(): Tick {
    return Tick.MAX;
  },
  setLastRun(_lastRun: Tick): void {},
});

IntoSystemSet.implFor(ApplyDeferred, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(ApplyDeferred);
  },
});

export const isApplyDeferred = (system: System) => {
  return typeId(system) === typeId(ApplyDeferred);
};
