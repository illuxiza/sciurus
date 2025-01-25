import { logger, NOT_IMPLEMENTED, TraitValid } from '@sciurus/utils';
import {
  Constructor,
  Err,
  HashMap,
  implTrait,
  Ok,
  Option,
  Result,
  trait,
  typeId,
  TypeId,
  Vec,
} from 'rustable';
import { App } from './app';
import { Plugin, Plugins } from './plugin';

/** Plugin entry in a group */
class PluginEntry {
  constructor(
    public plugin: Plugin,
    public enabled: boolean = true,
  ) {}
}

/** Combines multiple Plugins into a single unit */
@trait
export class PluginGroup extends TraitValid {
  /** Configures the Plugins that are to be added */
  build(): PluginGroupBuilder {
    throw NOT_IMPLEMENTED;
  }
  /** Configures a name for the PluginGroup */
  name(): string {
    return this.constructor.name;
  }
  /** Sets the value of the given Plugin */
  set<T extends Plugin>(plugin: T): PluginGroupBuilder {
    return this.build().set(plugin);
  }
}

// Implement Plugins for PluginGroup
implTrait(PluginGroup, Plugins, {
  addToApp(app: App): void {
    this.build().finish(app);
  },
});

/** Facilitates the creation and configuration of a PluginGroup */
export class PluginGroupBuilder {
  plugins = new HashMap<TypeId, PluginEntry>();
  order = Vec.new<TypeId>();

  constructor(public groupName: string) {}

  /** Start a new builder for the PluginGroup */
  static start<PG extends object>(groupType: Constructor<PG>): PluginGroupBuilder {
    return new PluginGroupBuilder(groupType.name);
  }

  /** Checks if the PluginGroupBuilder contains the given Plugin */
  contains<T extends object>(pluginType: Constructor<T>): boolean {
    return this.plugins.containsKey(typeId(pluginType));
  }

  /** Returns true if the PluginGroupBuilder contains the given Plugin and it's enabled */
  enabled<T extends object>(pluginType: Constructor<T>): boolean {
    return this.plugins.get(typeId(pluginType)).isSomeAnd((v) => v.enabled);
  }

  /** Finds the index of a target Plugin */
  private indexOf<T extends Plugin>(pluginType: Constructor<T>): Option<number> {
    return this.order.iter().position((id) => id === typeId(pluginType));
  }

  /** Insert the new plugin as enabled, and removes its previous ordering if it was already present */
  private upsertPluginState<T extends Plugin>(plugin: T, addedAtIndex: number): void {
    this.upsertPluginEntryState(typeId(plugin), new PluginEntry(plugin, true), addedAtIndex);
  }

  private upsertPluginEntryState(key: TypeId, plugin: PluginEntry, addedAtIndex: number): void {
    if (this.plugins.insert(key, plugin).isSome()) {
      const entry = this.plugins.get(key).unwrap();
      if (entry.enabled) {
        logger.warn(`You are replacing plugin '${entry.plugin.name()}' that was not disabled.`);
      }
      const toRemove = this.order
        .iter()
        .enumerate()
        .find(([i, id]) => i !== addedAtIndex && id === key)
        .map(([i]) => i);
      if (toRemove.isSome()) {
        this.order.remove(toRemove.unwrap());
      }
    }
  }

  /** Sets the value of the given Plugin, if it exists */
  set<T extends Plugin>(plugin: T): PluginGroupBuilder {
    const result = this.trySet(plugin);
    if (result.isErr()) {
      throw new Error(`${plugin.constructor.name} does not exist in this PluginGroup`);
    }
    return result.unwrap();
  }

  /** Tries to set the value of the given Plugin, if it exists */
  trySet<T extends Plugin>(plugin: T): Result<PluginGroupBuilder, [PluginGroupBuilder, T]> {
    return this.plugins.entry(typeId(plugin)).match({
      Occupied: (entry) => {
        entry.plugin = plugin;
        return Ok(this);
      },
      Vacant: () => {
        return Err([this, plugin]);
      },
    });
  }

  /** Adds the plugin at the end of this PluginGroupBuilder */
  add<T extends object>(plugin: T): PluginGroupBuilder {
    const targetIndex = this.order.len();
    this.order.push(typeId(plugin));
    this.upsertPluginState(Plugin.wrap(plugin), targetIndex);
    return this;
  }

  /** Attempts to add the plugin at the end of this PluginGroupBuilder */
  tryAdd<T extends object>(plugin: T): Result<PluginGroupBuilder, [PluginGroupBuilder, T]> {
    if (this.contains(plugin.constructor as Constructor<T>)) {
      return Err([this, plugin]);
    }
    return Ok(this.add(plugin));
  }

  /** Adds a PluginGroup at the end of this PluginGroupBuilder */
  addGroup(group: any): PluginGroupBuilder {
    const { plugins, order } = PluginGroup.wrap(group).build();
    for (const pluginId of order) {
      this.upsertPluginEntryState(pluginId, plugins.remove(pluginId).unwrap(), this.order.len());
      this.order.push(pluginId);
    }
    return this;
  }

  /** Adds a Plugin before the target plugin */
  addBefore<Target extends object>(target: Constructor<Target>, plugin: any): PluginGroupBuilder {
    const result = this.tryAddBeforeOverwrite(target, plugin);
    if (result.isErr()) {
      throw new Error(`Plugin does not exist in group: ${target.name}`);
    }
    return result.unwrap();
  }

  /** Tries to add a Plugin before the target plugin */
  tryAddBefore<Target extends object, Insert extends object>(
    target: Constructor<Target>,
    plugin: Insert,
  ): Result<PluginGroupBuilder, [PluginGroupBuilder, Insert]> {
    if (this.contains(plugin.constructor as Constructor<Insert>)) {
      return Err([this, plugin]);
    }
    return this.tryAddBeforeOverwrite(target, plugin);
  }

  /** Adds a Plugin before the target plugin, overwriting if it exists */
  tryAddBeforeOverwrite<Target extends object, Insert extends object>(
    target: Constructor<Target>,
    plugin: Insert,
  ): Result<PluginGroupBuilder, [PluginGroupBuilder, Insert]> {
    const targetIndex = this.indexOf(target as Constructor<Plugin>);
    if (targetIndex.isNone()) {
      return Err([this, plugin]);
    }

    const index = targetIndex.unwrap();
    this.order.insert(index, typeId(plugin));
    this.upsertPluginState(Plugin.wrap(plugin), index);
    return Ok(this);
  }

  /** Adds a Plugin after the target plugin */
  addAfter<Target extends object>(target: Constructor<Target>, plugin: any): PluginGroupBuilder {
    const result = this.tryAddAfterOverwrite(target, plugin);
    if (result.isErr()) {
      throw new Error(`Plugin does not exist in group: ${target.name}`);
    }
    return result.unwrap();
  }

  /** Tries to add a Plugin after the target plugin */
  tryAddAfter<Target extends object, Insert extends object>(
    target: Constructor<Target>,
    plugin: Insert,
  ): Result<PluginGroupBuilder, [PluginGroupBuilder, Insert]> {
    if (this.contains(plugin.constructor as Constructor<Insert>)) {
      return Err([this, plugin]);
    }
    return this.tryAddAfterOverwrite(target, plugin);
  }

  /** Adds a Plugin after the target plugin, overwriting if it exists */
  tryAddAfterOverwrite<Target extends object, Insert extends object>(
    target: Constructor<Target>,
    plugin: Insert,
  ): Result<PluginGroupBuilder, [PluginGroupBuilder, Insert]> {
    const targetIndex = this.indexOf(target as Constructor<Plugin>);
    if (targetIndex.isNone()) {
      return Err([this, plugin]);
    }

    const index = targetIndex.unwrap() + 1;
    this.order.insert(index, typeId(plugin));
    this.upsertPluginState(Plugin.wrap(plugin), index);
    return Ok(this);
  }

  /** Enables a Plugin */
  enable<T extends object>(pluginType: Constructor<T>): PluginGroupBuilder {
    const entry = this.plugins
      .get(typeId(pluginType))
      .expect('Cannot enable a plugin that does not exist.');
    entry.enabled = true;
    return this;
  }

  /** Disables a Plugin */
  disable<T extends object>(pluginType: Constructor<T>): PluginGroupBuilder {
    const entry = this.plugins
      .get(typeId(pluginType))
      .expect('Cannot disable a plugin that does not exist.');
    entry.enabled = false;
    return this;
  }

  /** Builds the contained Plugins in the order specified */
  finish(app: App): void {
    for (const id of this.order) {
      const entry = this.plugins.remove(id);
      if (entry.isSomeAnd((entry) => entry.enabled)) {
        logger.debug(`added plugin: ${entry.unwrap().plugin.name()}`);
        const result = app.addBoxedPlugin(entry.unwrap().plugin);
        if (result.isErr()) {
          const err = result.unwrapErr();
          if (err.name === 'DuplicatePlugin') {
            throw new Error(
              `Error adding plugin ${entry.unwrap().plugin.name()} in group ${this.groupName}: plugin was already added in application`,
            );
          }
          throw err;
        }
      }
    }
  }

  /** PluginGroup implementation */
  build(): PluginGroupBuilder {
    return this;
  }
}

implTrait(PluginGroupBuilder, PluginGroup);

export interface PluginGroupBuilder extends PluginGroup {}

/** A plugin group which doesn't do anything */
export class NoopPluginGroup {
  build(): PluginGroupBuilder {
    return PluginGroupBuilder.start(NoopPluginGroup);
  }
}

implTrait(NoopPluginGroup, PluginGroup);

export interface NoopPluginGroup extends PluginGroup {}
