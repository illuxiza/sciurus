import {
  ExecutorKind,
  Local,
  Mut,
  Resource,
  Schedule,
  ScheduleLabel,
  system,
  SystemSet,
  World,
} from '@sciurus/ecs';
import { Default, derive, Ptr, Vec } from 'rustable';
import { App } from './app';
import { Plugin } from './plugin';

/** The schedule that contains the app logic that is evaluated each tick of [`App::update()`].
 *
 * By default, it will run the following schedules in the given order:
 *
 * On the first run of the schedule (and only on the first run), it will run:
 * * [`PreStartup`]
 * * [`Startup`]
 * * [`PostStartup`]
 *
 * Then it will run:
 * * [`First`]
 * * [`PreUpdate`]
 * * [`StateTransition`]
 * * [`RunFixedMainLoop`]
 *     * This will run [`FixedMain`] zero to many times, based on how much time has elapsed.
 * * [`Update`]
 * * [`PostUpdate`]
 * * [`Last`]
 *
 * # Rendering
 *
 * Note rendering is not executed in the main schedule by default.
 * Instead, rendering is performed in a separate [`SubApp`]
 * which exchanges data with the main app in between the main schedule runs.
 *
 * See [`StateTransition`]: https://docs.rs/bevy/latest/bevy/prelude/struct.StateTransition.html
 * [`RenderPlugin`]: https://docs.rs/bevy/latest/bevy/render/struct.RenderPlugin.html
 * [`PipelinedRenderingPlugin`]: https://docs.rs/bevy/latest/bevy/render/pipelined_rendering/struct.PipelinedRenderingPlugin.html
 * [`SubApp`]: crate::SubApp
 */
@derive([Default, ScheduleLabel])
export class Main {
  static runMain = system([World, Local(Boolean)], (world: World, runAtLeastOnce: Ptr<Boolean>) => {
    if (!runAtLeastOnce.valueOf()) {
      world.resourceScope(MainScheduleOrder, (world, order: Mut<MainScheduleOrder>) => {
        for (const label of order.startupLabels) {
          world.tryRunSchedule(label);
        }
      });
      runAtLeastOnce[Ptr.ptr] = true;
    }
    world.resourceScope(MainScheduleOrder, (world, order: Mut<MainScheduleOrder>) => {
      for (const label of order.labels) {
        world.tryRunSchedule(label);
      }
    });
  });
}

/** The schedule that runs before [`Startup`].
 *
 * See the [`Main`] schedule for some details about how schedules are run.
 */
@derive([Default, ScheduleLabel])
export class PreStartup {}

/** The schedule that runs once when the app starts.
 *
 * See the `Main` schedule for some details about how schedules are run.
 */
@derive([Default, ScheduleLabel])
export class Startup {}

/** The schedule that runs once after `Startup`.
 *
 * See the `Main` schedule for some details about how schedules are run.
 */
@derive([Default, ScheduleLabel])
export class PostStartup {}

/** Runs first in the schedule.
 *
 * See the `Main` schedule for some details about how schedules are run.
 */
@derive([Default, ScheduleLabel])
export class First {}

@derive([Default, ScheduleLabel])
export class PreUpdate {}

@derive([Default, ScheduleLabel])
export class RunFixedMainLoop {}

@derive([Default, ScheduleLabel])
export class FixedFirst {}

@derive([Default, ScheduleLabel])
export class FixedPreUpdate {}

@derive([Default, ScheduleLabel])
export class FixedUpdate {}

@derive([Default, ScheduleLabel])
export class FixedPostUpdate {}

@derive([Default, ScheduleLabel])
export class FixedLast {}

@derive([Default, ScheduleLabel])
export class FixedMain {
  static runFixedMain = system([World], (world: World) => {
    world.resourceScope(FixedMainScheduleOrder, (world, order: Mut<FixedMainScheduleOrder>) => {
      for (const label of order.labels) {
        world.tryRunSchedule(label);
      }
    });
  });
}

@derive([Default, ScheduleLabel])
export class Update {}

@derive([Default, ScheduleLabel])
export class SpawnScene {}

@derive([Default, ScheduleLabel])
export class PostUpdate {}

@derive([Default, ScheduleLabel])
export class Last {}

@derive([SystemSet])
export class Animation {}

@derive([Resource, Default])
export class MainScheduleOrder {
  /** The labels to run for the main phase of the [`Main`] schedule (in the order they will be run). */
  public labels: Vec<ScheduleLabel>;

  /** The labels to run for the startup phase of the [`Main`] schedule (in the order they will be run). */
  public startupLabels: Vec<ScheduleLabel>;

  constructor() {
    this.labels = Vec.new<ScheduleLabel>();
    this.startupLabels = Vec.new<ScheduleLabel>();

    // Set default labels
    this.labels.extend([
      new First(),
      new PreUpdate(),
      new RunFixedMainLoop(),
      new Update(),
      new SpawnScene(),
      new PostUpdate(),
      new Last(),
    ]);

    // Set default startup labels
    this.startupLabels.extend([new PreStartup(), new Startup(), new PostStartup()]);
  }

  insertAfter(after: ScheduleLabel, schedule: ScheduleLabel): void {
    const afterLabel = ScheduleLabel.label(after);
    const label = ScheduleLabel.label(schedule);
    const index = this.labels
      .iter()
      .position((current) => current.eq(afterLabel))
      .unwrapOrElse(() => {
        throw new Error(`Expected ${afterLabel} to exist`);
      });
    this.labels.insert(index + 1, label);
  }

  insertBefore(before: ScheduleLabel, schedule: ScheduleLabel): void {
    const beforeLabel = ScheduleLabel.label(before);
    const label = ScheduleLabel.label(schedule);
    const index = this.labels
      .iter()
      .position((current) => current.eq(beforeLabel))
      .unwrapOrElse(() => {
        throw new Error(`Expected ${beforeLabel} to exist`);
      });
    this.labels.insert(index, label);
  }

  insertStartupAfter(after: ScheduleLabel, schedule: ScheduleLabel): void {
    const afterLabel = ScheduleLabel.label(after);
    const label = ScheduleLabel.label(schedule);
    const index = this.startupLabels
      .iter()
      .position((current) => current.eq(afterLabel))
      .unwrapOrElse(() => {
        throw new Error(`Expected ${afterLabel} to exist`);
      });
    this.startupLabels.insert(index + 1, label);
  }

  insertStartupBefore(before: ScheduleLabel, schedule: ScheduleLabel): void {
    const beforeLabel = ScheduleLabel.label(before);
    const label = ScheduleLabel.label(schedule);
    const index = this.startupLabels
      .iter()
      .position((current) => current.eq(beforeLabel))
      .unwrapOrElse(() => {
        throw new Error(`Expected ${beforeLabel} to exist`);
      });
    this.startupLabels.insert(index, label);
  }
}

/** Defines the schedules to be run for the [`FixedMain`] schedule */
@derive([Resource, Default])
export class FixedMainScheduleOrder {
  public labels: Vec<ScheduleLabel>;

  constructor() {
    this.labels = Vec.new<ScheduleLabel>();

    // Set default labels
    this.labels.extend([
      new FixedFirst(),
      new FixedPreUpdate(),
      new FixedUpdate(),
      new FixedPostUpdate(),
      new FixedLast(),
    ]);
  }

  insertAfter(after: ScheduleLabel, schedule: ScheduleLabel): void {
    const afterLabel = ScheduleLabel.label(after);
    const label = ScheduleLabel.label(schedule);
    const index = this.labels
      .iter()
      .position((current) => current.eq(afterLabel))
      .expect(`Expected ${afterLabel} to exist`);
    this.labels.insert(index + 1, label);
  }

  insertBefore(before: ScheduleLabel, schedule: ScheduleLabel): void {
    const beforeLabel = ScheduleLabel.label(before);
    const label = ScheduleLabel.label(schedule);
    const index = this.labels
      .iter()
      .position((current) => current.eq(beforeLabel))
      .expect(`Expected ${beforeLabel} to exist`);
    this.labels.insert(index, label);
  }
}

/** Initializes the [`Main`] schedule, sub schedules, and resources */
export class MainSchedulePlugin {}

Plugin.implFor(MainSchedulePlugin, {
  build(app: App): void {
    // Simple "facilitator" schedules benefit from simpler single threaded scheduling
    const mainSchedule = new Schedule(Main);
    mainSchedule.setExecutorKind(ExecutorKind.SingleThreaded);

    const fixedMainSchedule = new Schedule(FixedMain);
    fixedMainSchedule.setExecutorKind(ExecutorKind.SingleThreaded);

    const fixedMainLoopSchedule = new Schedule(RunFixedMainLoop);
    fixedMainLoopSchedule.setExecutorKind(ExecutorKind.SingleThreaded);

    app
      .addSchedule(mainSchedule)
      .addSchedule(fixedMainSchedule)
      .addSchedule(fixedMainLoopSchedule)
      .initResource(MainScheduleOrder)
      .initResource(FixedMainScheduleOrder)
      .addSystems(new Main(), Main.runMain)
      .addSystems(new FixedMain(), FixedMain.runFixedMain)
      .configureSets(
        RunFixedMainLoop,
        [
          RunFixedMainLoopSystem.BeforeFixedMainLoop,
          RunFixedMainLoopSystem.FixedMainLoop,
          RunFixedMainLoopSystem.AfterFixedMainLoop,
        ].chain(),
      );
  },
});

/** Set enum for the systems that want to run inside [`RunFixedMainLoop`] */
@derive([SystemSet])
export class RunFixedMainLoopSystem {
  constructor(public value: number) {}
  /** Runs before the fixed update logic */
  static BeforeFixedMainLoop = new RunFixedMainLoopSystem(0);
  /** Contains the fixed update logic */
  static FixedMainLoop = new RunFixedMainLoopSystem(1);
  /** Runs after the fixed update logic */
  static AfterFixedMainLoop = new RunFixedMainLoopSystem(2);
}
