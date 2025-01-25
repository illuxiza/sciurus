import { None, Option, Some } from 'rustable';
import { type Entity } from '../entity/base';
import { type DeferredWorld } from '../world/deferred';
import { type ComponentId } from './types';

/**
 * Type definition for component hooks that run during component lifecycle events
 */
export type ComponentHook = (
  world: DeferredWorld,
  entity: Entity,
  componentId: ComponentId,
) => void;

/**
 * World-mutating functions that run as part of lifecycle events of a Component.
 *
 * Hooks are functions that run when a component is added, overwritten, or removed from an entity.
 * These are intended to be used for structural side effects that need to happen when a component is added or removed,
 * and are not intended for general-purpose logic.
 */
export class ComponentHooks {
  private __onAdd: Option<ComponentHook>;
  private __onInsert: Option<ComponentHook>;
  private __onReplace: Option<ComponentHook>;
  private __onRemove: Option<ComponentHook>;
  private __onDespawn: Option<ComponentHook>;

  constructor() {
    this.__onAdd = None;
    this.__onInsert = None;
    this.__onReplace = None;
    this.__onRemove = None;
    this.__onDespawn = None;
  }

  /**
   * Try to register a hook that will be run when this component is added to an entity.
   * Returns None if the component already has an onAdd hook.
   */
  tryOnAdd(hook: ComponentHook): Option<this> {
    if (this.__onAdd.isSome()) {
      return None;
    }
    this.__onAdd = Some(hook);
    return Some(this);
  }

  /**
   * Try to register a hook that will be run when this component is added (with insert)
   * Returns None if the component already has an onInsert hook.
   */
  tryOnInsert(hook: ComponentHook): Option<this> {
    if (this.__onInsert.isSome()) {
      return None;
    }
    this.__onInsert = Some(hook);
    return Some(this);
  }

  /**
   * Try to register a hook that will be run when this component is about to be dropped.
   * Returns None if the component already has an onReplace hook.
   */
  tryOnReplace(hook: ComponentHook): Option<this> {
    if (this.__onReplace.isSome()) {
      return None;
    }
    this.__onReplace = Some(hook);
    return Some(this);
  }

  /**
   * Try to register a hook that will be run when this component is removed from an entity.
   * Returns None if the component already has an onRemove hook.
   */
  tryOnRemove(hook: ComponentHook): Option<this> {
    if (this.__onRemove.isSome()) {
      return None;
    }
    this.__onRemove = Some(hook);
    return Some(this);
  }

  tryOnDespawn(hook: ComponentHook): Option<this> {
    if (this.__onDespawn.isSome()) {
      return None;
    }
    this.__onDespawn = Some(hook);
    return Some(this);
  }

  /**
   * Register a hook that will be run when this component is added to an entity.
   * An onAdd hook will always run before onInsert hooks. Spawning an entity counts as
   * adding all of its components.
   * @throws Error if the component already has an onAdd hook
   */
  onAdd(hook: ComponentHook): this {
    return this.tryOnAdd(hook).expect('Component already has an onAdd hook');
  }

  /**
   * Register a hook that will be run when this component is added (with insert)
   * or replaced.
   *
   * An onInsert hook always runs after any onAdd hooks (if the entity didn't already have the component).
   *
   * Warning: The hook won't run if the component is already present and is only mutated, such as in a system via a query.
   * As a result, this is NOT an appropriate mechanism for reliably updating indexes and other caches.
   * @throws Error if the component already has an onInsert hook
   */
  onInsert(hook: ComponentHook): this {
    return this.tryOnInsert(hook).expect('Component already has an onInsert hook');
  }

  /**
   * Register a hook that will be run when this component is about to be dropped,
   * such as being replaced (with insert) or removed.
   *
   * If this component is inserted onto an entity that already has it, this hook will run before the value is replaced,
   * allowing access to the previous data just before it is dropped.
   * This hook does NOT run if the entity did not already have this component.
   *
   * An onReplace hook always runs before any onRemove hooks (if the component is being removed from the entity).
   *
   * Warning: The hook won't run if the component is already present and is only mutated, such as in a system via a query.
   * As a result, this is NOT an appropriate mechanism for reliably updating indexes and other caches.
   * @throws Error if the component already has an onReplace hook
   */
  onReplace(hook: ComponentHook): this {
    return this.tryOnReplace(hook).expect('Component already has an onReplace hook');
  }

  /**
   * Register a hook that will be run when this component is removed from an entity.
   * Despawning an entity counts as removing all of its components.
   * @throws Error if the component already has an onRemove hook
   */
  onRemove(hook: ComponentHook): this {
    return this.tryOnRemove(hook).expect('Component already has an onRemove hook');
  }

  onDespawn(hook: ComponentHook): this {
    return this.tryOnDespawn(hook).expect('Component already has an onDespawn hook');
  }

  /**
   * Check if any hooks are registered
   */
  hasHooks(): boolean {
    return (
      this.__onAdd.isSome() ||
      this.__onInsert.isSome() ||
      this.__onReplace.isSome() ||
      this.__onRemove.isSome() ||
      this.__onDespawn.isSome()
    );
  }

  /**
   * Get the registered onAdd hook if any
   */
  get onAddHook(): Option<ComponentHook> {
    return this.__onAdd;
  }

  /**
   * Get the registered onInsert hook if any
   */
  get onInsertHook(): Option<ComponentHook> {
    return this.__onInsert;
  }

  /**
   * Get the registered onReplace hook if any
   */
  get onReplaceHook(): Option<ComponentHook> {
    return this.__onReplace;
  }

  /**
   * Get the registered onRemove hook if any
   */
  get onRemoveHook(): Option<ComponentHook> {
    return this.__onRemove;
  }

  get onDespawnHook(): Option<ComponentHook> {
    return this.__onDespawn;
  }
}
