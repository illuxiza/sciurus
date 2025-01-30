import {
  Event,
  EventCursor,
  EventRegistry,
  Events,
  eventUpdateCondition,
  EventUpdates,
  eventUpdateSystem,
  IntoConfigs,
  IntoObserverSystem,
  IntoSystem,
  IntoSystemSet,
  Resource,
  Schedule,
  ScheduleBuildSettings,
  ScheduleLabel,
  Schedules,
  System,
  SystemId,
  World,
} from '@sciurus/ecs';
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
  Result,
  Some,
  Vec,
} from 'rustable';
import { First, Main, MainSchedulePlugin } from './main_schedule';
import { PlaceholderPlugin, Plugin, PluginsState } from './plugin';

type ExtractFn = (world: World, appWorld: World) => void;

export class SubApp {
  /** The data of this application */
  public world: World;
  /** List of plugins that have been added */
  private _plugReg = Vec.new<Plugin>();
  /** The names of plugins that have been added to this app */
  private __pluginNames = new HashSet<string>();
  /** Panics if an update is attempted while plugins are building */
  private _plugBuildDep: number = 0;
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
    return this._plugReg
      .iter()
      .filter((p) => p instanceof pluginType)
      .map((p) => p as T)
      .collect();
  }

  /** Check if plugins are being built */
  private isBuildingPlugins(): boolean {
    return this._plugBuildDep > 0;
  }

  /** Get the state of plugins */
  pluginsState(): PluginsState {
    if (this.__pluginsState === PluginsState.Adding) {
      let state = PluginsState.Ready;
      const plugins = Vec.from([...this._plugReg]);
      this._plugReg = Vec.new();

      this.runAsApp((app) => {
        for (const plugin of plugins) {
          if (!plugin.ready(app)) {
            state = PluginsState.Adding;
            return;
          }
        }
      });

      this._plugReg = plugins;
      return state;
    }
    return this.__pluginsState;
  }

  /** Finish plugin setup */
  finish(): void {
    const plugins = Vec.from([...this._plugReg]);
    this._plugReg = Vec.new();
    this.runAsApp((app) => {
      for (const p of plugins) {
        p.finish(app);
      }
    });
    this._plugReg = plugins;
    this.__pluginsState = PluginsState.Finished;
  }

  /** Clean up plugins */
  cleanup(): void {
    const plugins = Vec.from([...this._plugReg]);
    this._plugReg = Vec.new();
    this.runAsApp((app) => {
      for (const p of plugins) {
        p.cleanup(app);
      }
    });
    this._plugReg = plugins;
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

/** Error types for App operations */
export class AppError extends Error {
  constructor(
    public name: string,
    message: string,
  ) {
    super(message);
  }

  static duplicatePlugin(pluginName: string): AppError {
    return new AppError('DuplicatePlugin', `duplicate plugin ${pluginName}`);
  }
}

type RunnerFn = (app: App) => AppExit;

/** Function that runs the app once and exits */
function runOnce(app: App): AppExit {
  app.finish();
  app.cleanup();
  app.update();
  return app.shouldExit().unwrapOr(AppExit.Success());
}

/** Result of running an App */
@derive([Event])
export class AppExit {
  constructor(public code: number = 0) {}

  isError(): boolean {
    return this.code !== 0;
  }

  static Success(): AppExit {
    return new AppExit(0);
  }

  static Error(code: number = 1): AppExit {
    return new AppExit(code);
  }

  static fromCode(code: number): AppExit {
    return new AppExit(code);
  }
}

/** Main App class that manages the game engine */
export class App {
  subApps: SubApps;
  private runner: RunnerFn;

  constructor(subApps: SubApps = new SubApps(), runner: RunnerFn = runOnce) {
    this.subApps = subApps;
    this.runner = runner;
  }

  /** Creates a new App with default configuration */
  static new(): App {
    return App.default();
  }

  /** Creates a new empty App with minimal configuration */
  static empty(): App {
    return new App(new SubApps(), runOnce);
  }

  /** Creates a new App with default configuration */
  static default(): App {
    const app = App.empty();
    app.subApps.main.updateSchedule = Some(new Main());

    app.addPlugins(new MainSchedulePlugin());
    app.addSystems(
      new First(),
      eventUpdateSystem.inSet(new EventUpdates()).runIf(eventUpdateCondition),
    );
    app.addEvent(AppExit);

    return app;
  }

  /** Updates all sub-apps once */
  update(): void {
    if (this.isBuildingPlugins()) {
      throw new Error('App::update() was called while a plugin was building.');
    }
    this.subApps.update();
  }

  /** Runs the app using its runner function */
  run(): AppExit {
    if (this.isBuildingPlugins()) {
      throw new Error('App::run() was called while a plugin was building.');
    }

    const runner = this.runner;
    this.runner = runOnce;
    return runner(this);
  }

  /** Sets the runner function for the app */
  setRunner(f: RunnerFn): this {
    this.runner = f;
    return this;
  }

  /** Returns the app's world */
  world(): World {
    return this.main().world;
  }

  /** Returns a mutable reference to the main sub-app */
  main(): SubApp {
    return this.subApps.main;
  }

  /** Gets a sub-app by label */
  getSubApp(label: string): Option<SubApp> {
    return this.subApps['__subApps'].get(label);
  }

  /** Returns a reference to the SubApp with the given label */
  subApp(label: string): SubApp {
    return this.getSubApp(label).unwrapOrElse(() => {
      throw new Error(`No sub-app with label '${label}' exists.`);
    });
  }

  /** Inserts a sub-app with the given label */
  insertSubApp(label: string, subApp: SubApp): void {
    this.subApps['__subApps'].insert(label, subApp);
  }

  /** Removes a sub-app with the given label */
  removeSubApp(label: string): Option<SubApp> {
    return this.subApps['__subApps'].remove(label);
  }

  /** Updates a sub-app by label */
  updateSubAppByLabel(label: string): void {
    this.subApps.updateSubappByLabel(label);
  }

  /** Gets the plugins state */
  pluginsState(): PluginsState {
    let overallState = this.main().pluginsState();
    if (overallState === PluginsState.Adding) {
      overallState = PluginsState.Ready;
      let plugins = this.main()['_plugReg'];
      for (let plugin of plugins) {
        // plugins installed to main need to see all sub-apps
        if (!plugin.ready(this)) {
          overallState = PluginsState.Adding;
          break;
        }
      }
    }

    // Overall state is earliest state of any sub-app
    for (const subApp of this.subApps.collect().iter().skip(1)) {
      overallState = Math.min(overallState, subApp.pluginsState());
    }

    return overallState;
  }

  /** Finishes plugin setup */
  finish(): void {
    // Finish plugins in main app
    const plugins = this.main()['_plugReg'];
    for (const plugin of plugins) {
      plugin.finish(this);
    }

    this.main()['__pluginsState'] = PluginsState.Finished;

    // Finish plugins in sub-apps
    for (const subApp of this.subApps.collect().iter().skip(1)) {
      subApp.finish();
    }
  }

  /** Cleans up plugins */
  cleanup(): void {
    // Cleanup plugins in main app
    const plugins = this.main()['_plugReg'];
    for (const plugin of plugins) {
      plugin.cleanup(this);
    }

    this.main()['__pluginsState'] = PluginsState.Cleaned;

    // Cleanup plugins in sub-apps
    for (const subApp of this.subApps.collect().iter().skip(1)) {
      subApp.cleanup();
    }
  }

  /** Returns true if any sub-apps are building plugins */
  protected isBuildingPlugins(): boolean {
    return this.subApps
      .collect()
      .iter()
      .any((app) => app['isBuildingPlugins']());
  }

  /** Adds systems to a schedule */
  addSystems(scheduleLabel: any, systems: IntoConfigs): this {
    this.main().addSystems(scheduleLabel, systems);
    return this;
  }

  /** Registers a system for manual execution */
  registerSystem<I, O>(system: System<I, O>): SystemId<I, O> {
    return this.main().registerSystem(system);
  }

  /** Configures system sets */
  configureSets(schedule: ScheduleLabel, sets: IntoConfigs): this {
    this.main().configureSets(schedule, sets);
    return this;
  }

  /** Adds an event type */
  addEvent<T extends object>(eventType: Constructor<T>): this {
    this.main().addEvent(eventType);
    return this;
  }

  /** Inserts a resource */
  insertResource<R extends Resource>(resource: R): this {
    this.main().insertResource(resource);
    return this;
  }

  /** Initializes a resource with its default value */
  initResource<R extends object>(resType: Constructor<R>): this {
    this.main().initResource(resType);
    return this;
  }

  /** Adds a boxed plugin to the app */
  addBoxedPlugin(plugin: Plugin): Result<void, AppError> {
    logger.debug(`added plugin: ${plugin.name()}`);
    if (plugin.isUnique() && this.main()['__pluginNames'].contains(plugin.name())) {
      return Err(AppError.duplicatePlugin(plugin.name()));
    }

    const index = this.main()['_plugReg'].len();
    this.main()['_plugReg'].push(new PlaceholderPlugin());

    this.main()['_plugBuildDep']++;

    try {
      plugin.build(this);
    } finally {
      this.main()['__pluginNames'].insert(plugin.name());
      this.main()['_plugBuildDep']--;
    }

    this.main()['_plugReg'].set(index, plugin);
    return Ok(undefined);
  }

  /** Returns true if the Plugin has already been added */
  isPluginAdded<T extends object>(pluginType: Constructor<T>): boolean {
    return this.main().isPluginAdded<T>(pluginType);
  }

  /** Returns a vector of references to all plugins of type T that have been added */
  getAddedPlugins<T extends Plugin>(pluginType: Constructor<T>): T[] {
    return this.main().getAddedPlugins<T>(pluginType);
  }

  /** Adds one or more plugins to the app */
  addPlugins(plugins: any): this {
    if (
      this.pluginsState() === PluginsState.Cleaned ||
      this.pluginsState() === PluginsState.Finished
    ) {
      throw new Error(
        'Plugins cannot be added after App::cleanup() or App::finish() has been called.',
      );
    }
    plugins.addToApp(this);
    return this;
  }

  /** Adds a schedule */
  addSchedule(schedule: Schedule): this {
    this.main().addSchedule(schedule);
    return this;
  }

  /** Initializes a schedule */
  initSchedule(label: ScheduleLabel): this {
    this.main().initSchedule(label);
    return this;
  }

  /** Gets a schedule by label */
  getSchedule(label: ScheduleLabel): Option<Schedule> {
    const schedule = this.main().getSchedule(label);
    return schedule ? Some(schedule) : None;
  }

  /** Edits a schedule */
  editSchedule(label: ScheduleLabel, f: (schedule: Schedule) => void): this {
    this.main().editSchedule(label, f);
    return this;
  }

  /** Configures schedule build settings */
  configureSchedules(settings: ScheduleBuildSettings): this {
    this.main().configureSchedules(settings);
    return this;
  }

  /** Allows ambiguous components */
  allowAmbiguousComponent<T extends object>(type: Constructor<T>): this {
    this.main().allowAmbiguousComponent(type);
    return this;
  }

  /** Allows ambiguous resources */
  allowAmbiguousResource<T extends object>(type: Constructor<T>): this {
    this.main().allowAmbiguousResource(type);
    return this;
  }

  /** Ignores ambiguity between system sets */
  ignoreAmbiguity(schedule: ScheduleLabel, a: IntoSystemSet, b: IntoSystemSet): this {
    this.main().ignoreAmbiguity(schedule, a, b);
    return this;
  }

  /** Checks if the app should exit */
  shouldExit(): Option<AppExit> {
    const events = this.world().getResource(Events(AppExit));
    if (events.isNone()) return None;

    const reader = new EventCursor<AppExit>();
    const exitEvents = reader.read(events.unwrap());

    if (exitEvents.len() > 0) {
      return Some(
        exitEvents
          .iter()
          .find((exit) => exit.isError())
          .unwrapOr(AppExit.Success()),
      );
    }

    return None;
  }

  /** Adds an observer */
  addObserver(eventType: Constructor, bundleType: any, observer: IntoObserverSystem): App {
    this.world().addObserver(eventType, bundleType, observer);
    return this;
  }
}
