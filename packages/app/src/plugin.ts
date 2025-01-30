import { macroTrait, NotImplementedError, Trait } from 'rustable';
import { App } from './app';

/** A collection of Bevy app logic and configuration */
class PluginTrait extends Trait {
  /** Configures the App to which this plugin is added */
  build(_app: App): void {
    throw new NotImplementedError();
  }

  /** Has the plugin finished its setup? */
  ready(_app: App): boolean {
    return true;
  }

  /** Finish adding this plugin to the App */
  finish(_app: App): void {
    // do nothing
  }

  /** Runs after all plugins are built and finished */
  cleanup(_app: App): void {
    // do nothing
  }

  /** Configures a name for the Plugin */
  name(): string {
    return this.constructor.name;
  }

  /** If the plugin can be instantiated several times */
  isUnique(): boolean {
    return true;
  }
}

export const Plugin = macroTrait(PluginTrait);
export interface Plugin extends PluginTrait {}

/** Plugin state in the application */
export enum PluginsState {
  /** Plugins are being added */
  Adding,
  /** All plugins already added are ready */
  Ready,
  /** Finish has been executed for all plugins added */
  Finished,
  /** Cleanup has been executed for all plugins added */
  Cleaned,
}

/** A dummy plugin that's to temporarily occupy an entry in an app's plugin registry */
export class PlaceholderPlugin {}

Plugin.implFor(PlaceholderPlugin, {
  build(_app: App): void {},
});

export interface PlaceholderPlugin extends Plugin {}

export class Plugins extends Trait {
  addToApp(_app: App): void {
    throw new NotImplementedError();
  }
}

// Implement Plugins for Plugin
Plugins.implFor(Plugin, {
  addToApp(app: App): void {
    const result = app.addBoxedPlugin(this);
    if (result.isErr()) {
      const err = result.unwrapErr();
      if (err.name === 'DuplicatePlugin') {
        throw new Error(
          `Error adding plugin ${this.name()}: plugin was already added in application`,
        );
      }
      throw err;
    }
  },
});

interface PluginTrait extends Plugins {}

Plugins.implFor(Array<Plugin>, {
  addToApp(app: App): void {
    for (const plugin of this) {
      plugin.addToApp(app);
    }
  },
});

/** Plugin marker types */
export class PluginMarker {}
export class PluginGroupMarker {}
export class PluginsTupleMarker {}

/** Plugin group trait */
class PluginGroupTrait extends Trait {
  build(): PluginGroupBuilder {
    throw new NotImplementedError();
  }
}

export const PluginGroup = macroTrait(PluginGroupTrait);
export interface PluginGroup extends PluginGroupTrait {}

/** Plugin group builder */
export class PluginGroupBuilder {
  private plugins: Plugin[] = [];

  add<P extends Plugin>(plugin: P): this {
    this.plugins.push(plugin);
    return this;
  }

  finish(app: App): void {
    for (const plugin of this.plugins) {
      const result = app.addBoxedPlugin(plugin);
      if (result.isErr()) {
        const err = result.unwrapErr();
        if (err.name === 'DuplicatePlugin') {
          throw new Error(
            `Error adding plugin ${plugin.name()}: plugin was already added in application`,
          );
        }
        throw err;
      }
    }
  }
}

// Implement Plugin trait for function types
export class FnPlugin {
  constructor(public fn: (app: App) => void) {}
}

Plugin.implFor(FnPlugin, {
  build(app: App): void {
    this.fn(app);
  },
});
