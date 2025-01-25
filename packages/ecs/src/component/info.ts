import { HashSet, Option, TypeId } from 'rustable';
import { ArchetypeFlags } from '../archetype/types';
import { StorageType } from '../storage';
import { ComponentHooks } from './hooks';
import { RequiredComponents } from './required_components';
import { type ComponentDescriptor, type ComponentId } from './types';

/**
 * Stores metadata for a type of component or resource stored in a specific World.
 */
export class ComponentInfo {
  id: ComponentId;
  descriptor: ComponentDescriptor;
  hooks: ComponentHooks;
  requiredComponents: RequiredComponents;
  requiredBy: HashSet<ComponentId>;

  /**
   * Create a new ComponentInfo.
   */
  constructor(id: ComponentId, descriptor: ComponentDescriptor) {
    this.id = id;
    this.descriptor = descriptor;
    this.hooks = new ComponentHooks();
    this.requiredComponents = new RequiredComponents();
    this.requiredBy = new HashSet();
  }

  /**
   * Returns the name of the current component.
   */
  get name(): string {
    return this.descriptor.name;
  }

  /**
   * Returns the TypeId of the underlying component type.
   * Returns undefined if the component does not correspond to a TypeScript type.
   */
  get typeId(): Option<TypeId> {
    return this.descriptor.typeId;
  }

  /**
   * Get the function which should be called to clean up values of
   * the underlying component type.
   */
  get drop(): Option<(ptr: any) => void> {
    return this.descriptor.drop;
  }

  /**
   * Returns a value indicating the storage strategy for the current component.
   */
  get storageType(): StorageType {
    return this.descriptor.storageType;
  }

  get mutable(): boolean {
    return this.descriptor.mutable;
  }

  /**
   * Update the given flags to include any ComponentHook registered to self
   */
  updateArchetypeFlags(flags: ArchetypeFlags): void {
    if (this.hooks.onAddHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_ADD_HOOK);
    }
    if (this.hooks.onInsertHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_INSERT_HOOK);
    }
    if (this.hooks.onReplaceHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_REPLACE_HOOK);
    }
    if (this.hooks.onRemoveHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_REMOVE_HOOK);
    }
    if (this.hooks.onDespawnHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_DESPAWN_HOOK);
    }
  }
}
