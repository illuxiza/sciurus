import { FixedBitSet } from '@sciurus/utils';
import { Option, range, Result, Vec } from 'rustable';
import { World } from '../../world/base';
import { Condition } from '../types';
import { ExecutorKind, isApplyDeferred, SystemExecutor, SystemSchedule } from './types';

export class SingleThreadedExecutor implements SystemExecutor {
  /// System sets whose conditions have been evaluated.
  evaluatedSets: FixedBitSet = new FixedBitSet();
  /// Systems that have run or been skipped.
  completedSystems: FixedBitSet = new FixedBitSet();
  /// Systems that have run but have not had their buffers applied.
  unappliedSystems: FixedBitSet = new FixedBitSet();
  /// Setting when true applies deferred system buffers after all systems have run
  applyFinalDeferred: boolean = true;
  resume: (error: Error) => Result<any, Error> = (error) => {
    throw error;
  };

  setCount: number = 0;
  sysCount: number = 0;

  kind(): ExecutorKind {
    return ExecutorKind.SingleThreaded;
  }

  init(schedule: SystemSchedule): void {
    this.sysCount = schedule.systemIds.len();
    this.setCount = schedule.systems.len();
    this.evaluatedSets = new FixedBitSet(this.setCount);
    this.completedSystems = new FixedBitSet(this.sysCount);
    this.unappliedSystems = new FixedBitSet(this.sysCount);
  }

  run(schedule: SystemSchedule, world: World, _skipSystems: Option<FixedBitSet>): void {
    for (const systemIndex of range(0, schedule.systems.len())) {
      let shouldRun = !this.completedSystems.contains(systemIndex);
      for (const setIdx of schedule.setsWithConditionsOfSystems[systemIndex].ones()) {
        if (this.evaluatedSets.contains(setIdx)) {
          continue;
        }

        const setConditionsMet = evaluateAndFoldConditions(schedule.setConditions[setIdx], world);

        if (!setConditionsMet) {
          this.completedSystems.unionWith(schedule.systemsInSetsWithConditions[setIdx]);
        }

        shouldRun = shouldRun && setConditionsMet;
        this.evaluatedSets.insert(setIdx);
      }

      const systemConditionsMet = evaluateAndFoldConditions(
        schedule.systemConditions[systemIndex],
        world,
      );

      shouldRun = shouldRun && systemConditionsMet;

      const system = schedule.systems[systemIndex];
      if (shouldRun) {
        const validParams = system.validateParam(world);
        shouldRun = shouldRun && validParams;
      }

      this.completedSystems.insert(systemIndex);

      if (!shouldRun) {
        continue;
      }
      if (isApplyDeferred(system)) {
        this.applyDeferred(schedule, world);
        continue;
      }
      try {
        if (system.isExclusive()) {
          system.run(undefined, world);
        } else {
          system.updateArchetypeComponentAccess(world);
          system.runUnsafe(undefined, world);
        }
      } catch (e) {
        this.resume(e as Error);
      }
      this.unappliedSystems.insert(systemIndex);
    }
    if (this.applyFinalDeferred) {
      this.applyDeferred(schedule, world);
    }
    this.evaluatedSets.clear();
    this.completedSystems.clear();
  }

  setApplyFinalDeferred(applyFinalDeferred: boolean) {
    this.applyFinalDeferred = applyFinalDeferred;
  }

  private applyDeferred(schedule: SystemSchedule, world: World) {
    for (const systemIndex of this.unappliedSystems.ones()) {
      const system = schedule.systems[systemIndex];
      system.applyDeferred(world);
    }
    this.unappliedSystems.clear();
  }
}

const evaluateAndFoldConditions = (conditions: Vec<Condition>, world: World): boolean => {
  // not short-circuiting is intentional
  return conditions
    .iter()
    .map((condition) => {
      if (!condition.validateParam(world)) {
        return false;
      }
      return condition.runReadonly(undefined, world);
    })
    .fold(true, (acc, res) => acc && res);
};
