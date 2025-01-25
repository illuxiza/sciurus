import {
  EventRegistry,
  Events,
  IntoConfigs,
  IntoSystem,
  IntoSystemSet,
  Schedule,
  ScheduleBuildSettings,
  ScheduleLabel,
  Schedules,
  SystemId,
  World,
} from '@sciurus/ecs';
import { Constructor, HashMap, HashSet, None, Option, Some, Vec } from 'rustable';
import { App } from './app';
import { Plugin, PluginsState } from './plugin';

type ExtractFn = (world: World, appWorld: World) => void;

export class SubApp {
  /** The data of this application */
  public world: World;
  /** List of plugins that have been added */
  private __pluginRegistry = Vec.new<Plugin>();
  /** The names of plugins that have been added to this app */
  private __pluginNames = new HashSet<string>();
  /** Panics if an update is attempted while plugins are building */
  private __pluginBuildDepth: number = 0;
  private __pluginsState: PluginsState = PluginsState.Adding;
  /** The schedule that will be run by update */
  public updateSchedule: Option<ScheduleLabel> = None;
  /** Function for copying data between worlds */
  private __extract: Option<ExtractFn> = None;

  constructor() {
    this.world = new World();
    this.world.initResource(Schedules);
  }

  /** Returns a default, empty SubApp */
  static new(): SubApp {
    return new SubApp();
  }

  /** This method is a workaround. Each SubApp can have its own plugins, but Plugin works on an App as a whole */
  private runAsApp(f: (app: App) => void): void {
    const app = App.empty();
    const tmp = app.subApps.main;
    app.subApps.main = this;
    f(app);
    app.subApps.main = tmp;
  }

  /** Runs the default schedule */
  runDefaultSchedule(): void {
    if (this.isBuildingPlugins()) {
      throw new Error('SubApp::update() was called while a plugin was building.');
    }

    if (this.updateSchedule.isSome()) {
      this.world.runSchedule(this.updateSchedule.unwrap());
    }
  }

  /** Runs the default schedule and updates internal component trackers */
  update(): void {
    this.runDefaultSchedule();
    this.world.clearTrackers();
  }

  /** Extracts data from world into the app's world using the registered extract method */
  extract(world: World): void {
    if (this.__extract.isSome()) {
      this.__extract.unwrap()(world, this.world);
    }
  }

  /** Sets the method that will be called by extract */
  setExtract(extract: ExtractFn): this {
    this.__extract = Some(extract);
    return this;
  }

  /** Take the function that will be called by extract out of the app */
  takeExtract(): Option<ExtractFn> {
    const extract = this.__extract;
    this.__extract = None;
    return extract;
  }

  /** Insert a resource */
  insertResource<R extends object>(resource: R): this {
    this.world.insertResource(resource);
    return this;
  }

  /** Initialize a resource */
  initResource<R extends object>(resType: Constructor<R>): this {
    this.world.initResource(resType);
    return this;
  }

  /** Add systems to a schedule */
  addSystems<M>(scheduleLabel: ScheduleLabel, systems: IntoConfigs<M>): this {
    const schedules = this.world.resourceMut(Schedules);
    schedules.addSystems(scheduleLabel, systems);
    return this;
  }

  /** Register a system */
  registerSystem<I, O>(system: IntoSystem<I, O>): SystemId<I, O> {
    return this.world.registerSystem(system);
  }

  /** Configure system sets */
  configureSets<M>(schedule: ScheduleLabel, sets: IntoConfigs<M>): this {
    const schedules = this.world.resourceMut(Schedules);
    schedules.configureSets(schedule, sets);
    return this;
  }

  /** Add a schedule */
  addSchedule(schedule: Schedule): this {
    const schedules = this.world.resourceMut(Schedules);
    schedules.insert(schedule);
    return this;
  }

  /** Initialize a schedule */
  initSchedule(label: ScheduleLabel): this {
    const schedules = this.world.resourceMut(Schedules);
    if (!schedules.contains(label)) {
      schedules.insert(new Schedule(label));
    }
    return this;
  }

  /** Get a schedule */
  getSchedule(label: ScheduleLabel): Option<Schedule> {
    const schedules = this.world.getResource(Schedules);
    return schedules.andThen((v) => v.get(label));
  }

  /** Edit a schedule */
  editSchedule(label: ScheduleLabel, f: (schedule: Schedule) => void): this {
    const schedules = this.world.resourceMut(Schedules);
    if (!schedules.contains(label)) {
      schedules.insert(new Schedule(label));
    }
    const schedule = schedules.get(label);
    if (schedule.isSome()) f(schedule.unwrap());
    return this;
  }

  /** Configure schedules */
  configureSchedules(settings: ScheduleBuildSettings): this {
    this.world.resourceMut(Schedules).configureSchedules(settings);
    return this;
  }

  /** Allow ambiguous component */
  allowAmbiguousComponent(component: Constructor): this {
    this.world.allowAmbiguousComponent(component);
    return this;
  }

  /** Allow ambiguous resource */
  allowAmbiguousResource(res: Constructor): this {
    this.world.allowAmbiguousResource(res);
    return this;
  }

  /** Ignore ambiguity between system sets */
  ignoreAmbiguity(schedule: ScheduleLabel, a: IntoSystemSet, b: IntoSystemSet): this {
    const schedules = this.world.resourceMut(Schedules);
    schedules.ignoreAmbiguity(schedule, a, b);
    return this;
  }

  /** Add an event type */
  addEvent(eventType: Constructor): this {
    if (!this.world.containsResource(Events(eventType))) {
      EventRegistry.registerEvent(eventType, this.world);
    }
    return this;
  }

  /** Add plugins */
  addPlugins(plugins: Plugin[]): this {
    this.runAsApp((app) => plugins.forEach((p) => p.addToApp(app)));
    return this;
  }

  /** Check if a plugin is added */
  isPluginAdded<T extends object>(pluginType: Constructor<T>): boolean {
    return this.__pluginNames.contains(pluginType.name);
  }

  /** Get added plugins of a specific type */
  getAddedPlugins<T extends object>(pluginType: Constructor<T>): T[] {
    return this.__pluginRegistry
      .iter()
      .filter((p) => p instanceof pluginType)
      .map((p) => p as T)
      .collect();
  }

  /** Check if plugins are being built */
  private isBuildingPlugins(): boolean {
    return this.__pluginBuildDepth > 0;
  }

  /** Get the state of plugins */
  pluginsState(): PluginsState {
    if (this.__pluginsState === PluginsState.Adding) {
      let state = PluginsState.Ready;
      const plugins = Vec.from([...this.__pluginRegistry]);
      this.__pluginRegistry = Vec.new();

      this.runAsApp((app) => {
        for (const plugin of plugins) {
          if (!plugin.ready(app)) {
            state = PluginsState.Adding;
            return;
          }
        }
      });

      this.__pluginRegistry = plugins;
      return state;
    }
    return this.__pluginsState;
  }

  /** Finish plugin setup */
  finish(): void {
    const plugins = Vec.from([...this.__pluginRegistry]);
    this.__pluginRegistry = Vec.new();
    this.runAsApp((app) => {
      for (const p of plugins) {
        p.finish(app);
      }
    });
    this.__pluginRegistry = plugins;
    this.__pluginsState = PluginsState.Finished;
  }

  /** Clean up plugins */
  cleanup(): void {
    const plugins = Vec.from([...this.__pluginRegistry]);
    this.__pluginRegistry = Vec.new();
    this.runAsApp((app) => {
      for (const p of plugins) {
        p.cleanup(app);
      }
    });
    this.__pluginRegistry = plugins;
    this.__pluginsState = PluginsState.Cleaned;
  }
}

export type AppLabel = string;

export class SubApps {
  /** The primary sub-app that contains the "main" world */
  main: SubApp;
  /** Other, labeled sub-apps */
  private __subApps = new HashMap<AppLabel, SubApp>();

  constructor(main: SubApp = new SubApp()) {
    this.main = main;
  }

  /**
   * Calls update for the main sub-app, and then calls
   * extract and update for the rest.
   */
  update(): void {
    // Update main app
    this.main.runDefaultSchedule();

    // Update sub apps
    for (const [_label, subApp] of this.__subApps) {
      subApp.extract(this.main.world);
      subApp.update();
    }

    this.main.world.clearTrackers();
  }

  collect() {
    return [this.main, ...this.__subApps.values()];
  }

  /** Extract data from the main world into the SubApp with the given label and perform an update if it exists */
  updateSubappByLabel(label: AppLabel): void {
    const subApp = this.__subApps.get(label);
    if (subApp.isSome()) {
      subApp.unwrap().extract(this.main.world);
      subApp.unwrap().update();
    }
  }
}
