import { FixedBitSet } from '@sciurus/utils';
import { implTrait, Ok, Option, typeId, Vec } from 'rustable';
import { Tick } from '../../change_detection/tick';
import { Access } from '../../query/access';
import { type ScheduleSystem, System } from '../../system';
import { World } from '../../world/base';
import { WorldCell } from '../../world/cell';
import { DeferredWorld } from '../../world/deferred';
import { NodeId } from '../graph';
import { IntoSystemSet, SystemSet, SystemTypeSet } from '../set';
import { Condition } from '../types';

export class SystemSchedule {
  constructor(
    public systemIds: Vec<NodeId> = Vec.new(),
    public systems: Vec<ScheduleSystem> = Vec.new(),
    public systemConditions: Vec<Vec<Condition>> = Vec.new(),
    public systemDependencies: Vec<number> = Vec.new(),
    public systemDependents: Vec<Vec<number>> = Vec.new(),
    public setsWithConditionsOfSystems: Vec<FixedBitSet> = Vec.new(),
    public setIds: Vec<NodeId> = Vec.new(),
    public setConditions: Vec<Vec<Condition>> = Vec.new(),
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

implTrait(ApplyDeferred, System, {
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
  runUnsafe(_input: any[], _world: WorldCell) {
    return Ok(undefined);
  },
  run(_input: any[], _world: World) {
    return Ok(undefined);
  },
  applyDeferred(_world: World): void {},
  queueDeferred(_world: DeferredWorld): void {},
  validateParamUnsafe(_world: WorldCell): boolean {
    return true;
  },
  initialize(_world: World): void {},
  updateArchetypeComponentAccess(_world: WorldCell): void {},
  defaultSystemSets(): Vec<SystemSet> {
    return Vec.from([new SystemTypeSet(ApplyDeferred)]);
  },
  checkChangeTick(_changeTick: Tick): void {},
  getLastRun(): Tick {
    return Tick.MAX;
  },
  setLastRun(_lastRun: Tick): void {},
});

implTrait(ApplyDeferred, IntoSystemSet, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(ApplyDeferred);
  },
});

export const isApplyDeferred = (system: System) => {
  return typeId(system) === typeId(ApplyDeferred);
};
