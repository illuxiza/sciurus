import { logger } from '@sciurus/utils';
import {
  Constructor,
  derive,
  Err,
  HashMap,
  HashSet,
  None,
  Ok,
  Option,
  Ptr,
  Result,
  RustIter,
} from 'rustable';
import { Tick } from '../change_detection/tick';
import { ComponentId, Resource } from '../component';
import { Components } from '../component/collection';
import { ScheduleSystem } from '../system';
import { type World } from '../world/base';
import { IntoConfigs } from './config';
import {
  ExecutorKind,
  isApplyDeferred,
  makeExecutor,
  SystemExecutor,
  SystemSchedule,
} from './executor';
import { SingleThreadedExecutor } from './executor/single_threaded';
import { NodeId } from './graph';
import { ScheduleGraph } from './schedule_graph';
import { IntoSystemSet, ScheduleLabel, SystemSet } from './set';
import { ScheduleBuildError, ScheduleBuildSettings } from './types';

@derive(ScheduleLabel)
export class DefaultSchedule {
  static new() {
    return new DefaultSchedule();
  }
}

export class Schedule {
  label: ScheduleLabel;
  graph = new ScheduleGraph();
  executable = new SystemSchedule();
  executor: SystemExecutor = new SingleThreadedExecutor();
  executorInitialized = false;

  constructor(label: any = DefaultSchedule) {
    if (typeof label === 'function') {
      this.label = ScheduleLabel.wrap(new (label as new () => object)());
    } else {
      this.label = ScheduleLabel.wrap(label);
    }
  }

  addSystems(systems: any): Schedule {
    this.graph.processConfigs(ScheduleSystem, IntoConfigs.wrap(systems).intoConfigs(), false);
    return this;
  }

  ignoreAmbiguity<S1 extends object, S2 extends object>(a: S1, b: S2): this {
    const aSet = IntoSystemSet.wrap(a).intoSystemSet();
    const bSet = IntoSystemSet.wrap(b).intoSystemSet();

    const aId = this.graph.__systemSetIds
      .get(aSet)
      .expect(
        `Could not mark system as ambiguous, '${aSet}' was not found in the schedule. Did you try to call 'ambiguousWith' before adding the system to the world?`,
      );

    const bId = this.graph.__systemSetIds
      .get(bSet)
      .expect(
        `Could not mark system as ambiguous, '${bSet}' was not found in the schedule. Did you try to call 'ambiguousWith' before adding the system to the world?`,
      );

    this.graph.__ambiguousWith.addEdge(aId, bId);

    return this;
  }

  configureSets(sets: IntoConfigs<SystemSet>): this {
    this.graph.configureSets(sets);
    return this;
  }

  setBuildSettings(settings: ScheduleBuildSettings): this {
    this.graph.__settings = settings;
    return this;
  }

  getBuildSettings(): ScheduleBuildSettings {
    return this.graph.__settings;
  }

  getExecutorKind(): ExecutorKind {
    return this.executor.kind();
  }

  setExecutorKind(executor: ExecutorKind): this {
    if (executor !== this.executor.kind()) {
      this.executor = makeExecutor(executor);
      this.executorInitialized = false;
    }
    return this;
  }

  setApplyFinalDeferred(applyFinalDeferred: boolean): this {
    this.executor.setApplyFinalDeferred(applyFinalDeferred);
    return this;
  }

  run(world: World): void {
    world.checkChangeTicks();
    this.initialize(world).unwrapOrElse((e) => {
      throw new Error(`Error when initializing schedule ${this.label}: ${e}`);
    });
    this.executor.run(this.executable, world, None);
  }

  initialize(world: World, caller?: string): Result<void, ScheduleBuildError> {
    if (this.graph.changed) {
      this.graph.initialize(world);
      const ignoredAmbiguities = world.getResourceOrInit(
        Schedules,
        caller,
      ).ignoredSchedulingAmbiguities;
      const result = this.graph.updateSchedule(
        Ptr({
          get: () => this.executable,
          set: (schedule) => (this.executable = schedule),
        }),
        world.components,
        ignoredAmbiguities,
        this.label,
      );
      if (result.isErr()) {
        return result;
      }
      this.graph.__changed = false;
      this.executorInitialized = false;
    }
    if (!this.executorInitialized) {
      this.executor.init(this.executable);
      this.executorInitialized = true;
    }
    return Ok(undefined);
  }

  checkChangeTicks(changeTick: Tick): void {
    for (const system of this.executable.systems) {
      if (!isApplyDeferred(system)) {
        system.checkChangeTick(changeTick);
      }
    }
    for (const conditions of this.executable.systemConditions) {
      for (const system of conditions) {
        system.checkChangeTick(changeTick);
      }
    }
    for (const conditions of this.executable.setConditions) {
      for (const system of conditions) {
        system.checkChangeTick(changeTick);
      }
    }
  }

  applyDeferred(world: World): void {
    for (const system of this.executable.systems) {
      system.applyDeferred(world);
    }
  }

  systems(): Result<RustIter<[NodeId, ScheduleSystem]>, Error> {
    if (!this.executorInitialized) {
      return Err(new Error('executable schedule has not been built'));
    }
    const iter = this.executable.systemIds
      .iter()
      .zip(this.executable.systems.iter())
      .map(([nodeId, system]) => [nodeId, system] as [NodeId, ScheduleSystem]);
    return Ok(iter);
  }

  systemsLen(): number {
    if (!this.executorInitialized) {
      return this.graph.__systems.len();
    } else {
      return this.executable.systems.len();
    }
  }
}

@derive([Resource])
export class Schedules {
  inner: HashMap<any, Schedule> = new HashMap();
  ignoredSchedulingAmbiguities: HashSet<ComponentId> = new HashSet();

  insert(schedule: Schedule): Option<Schedule> {
    return this.inner.insert(schedule.label, schedule);
  }

  remove<T extends object>(label: T): Option<Schedule> {
    return this.inner.remove(label);
  }

  removeEntry<T extends object>(label: T): Option<[T, Schedule]> {
    return this.inner.removeEntry(label) as Option<[T, Schedule]>;
  }

  contains<T extends object>(label: T): boolean {
    return this.inner.containsKey(label);
  }

  get<T extends object>(label: T): Option<Schedule> {
    return this.inner.get(label);
  }

  entry<T>(label: T): Schedule {
    return this.inner.entry(label).orInsertWith(() => new Schedule(label));
  }

  iter<T extends object>(): RustIter<[T, Schedule]> {
    return this.inner.iter() as RustIter<[T, Schedule]>;
  }

  checkChangeTicks(changeTick: Tick) {
    for (let schedule of this.inner.values()) {
      schedule.checkChangeTicks(changeTick);
    }
  }

  configureSchedules(scheduleBuildSettings: ScheduleBuildSettings) {
    for (let schedule of this.inner.values()) {
      schedule.setBuildSettings(scheduleBuildSettings);
    }
  }

  allowAmbiguousComponent<T extends object>(component: Constructor<T>, world: World) {
    this.ignoredSchedulingAmbiguities.insert(world.registerComponent<T>(component));
  }

  allowAmbiguousResource<T extends object>(res: Constructor<T>, world: World) {
    this.ignoredSchedulingAmbiguities.insert(world.registerResource<T>(res));
  }

  iterIgnoredAmbiguities() {
    return this.ignoredSchedulingAmbiguities.iter();
  }

  printIgnoredAmbiguities(components: Components) {
    let message =
      'System order ambiguities caused by conflicts on the following types are ignored:\n';
    for (let id of this.iterIgnoredAmbiguities()) {
      message += components.getName(id).unwrap() + '\n';
    }
    logger.info(message);
  }

  addSystems<T extends object>(label: T, system: any) {
    this.entry(label).addSystems(system);
    return this;
  }

  configureSets<T extends object>(label: T, sets: any): this {
    this.entry(label).configureSets(sets);
    return this;
  }

  ignoreAmbiguity<S1 extends object, S2 extends object>(
    schedule: ScheduleLabel,
    a: S1,
    b: S2,
  ): this {
    this.entry(schedule).ignoreAmbiguity(a, b);
    return this;
  }
}
