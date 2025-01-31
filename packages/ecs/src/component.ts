import {
  Clone,
  Constructor,
  deepClone,
  defaultVal,
  derive,
  EnumInstance,
  Enums,
  HashMap,
  HashSet,
  macroTrait,
  None,
  Ok,
  Option,
  Result,
  Some,
  Trait,
  typeId,
  TypeId,
  Vec,
} from 'rustable';
import { ArchetypeFlags } from './archetype/types';
import { Tick } from './change_detection/tick';
import { type Entity } from './entity/base';
import { EntityCloner } from './entity/cloner';
import { SparseSets, Storages, StorageType, TableRow } from './storage';
import { Table } from './storage/table/base';
import { type DeferredWorld } from './world/deferred';

const storageSymbol = Symbol('COMPONENT_STORAGE');
const dropSymbol = Symbol('COMPONENT_DROP');
const mutSymbol = Symbol('COMPONENT_MUT');

export class ComponentDescriptor<T = any> {
  name: string;
  storageType: StorageType;
  typeId: Option<TypeId>;
  mutable: boolean;
  drop: Option<(value: any) => void>;

  constructor(component: Constructor<T>) {
    this.name = component.name;
    this.storageType = Component.staticWrap(component).storageType();
    this.typeId = Some(typeId(component));
    this.mutable = (component as any)[mutSymbol] ?? true;
    this.drop = (component as any)[dropSymbol] ? Some((component as any)[dropSymbol]) : None;
  }

  static new<T>(component: Constructor<T>): ComponentDescriptor<T> {
    return new ComponentDescriptor(component);
  }
}

export type ComponentId = number;

export class RequiredComponentsError extends Error {
  static DuplicateRegistration(requiree: ComponentId, required: ComponentId) {
    return new RequiredComponentsError(
      `Component ${requiree} already directly requires component ${required}`,
    );
  }

  static ArchetypeExists(component: ComponentId) {
    return new RequiredComponentsError(`Archetype for component ${component} already exists`);
  }

  constructor(message: string) {
    super(message);
  }
}

class ComponentTrait extends Trait {
  static [storageSymbol]?: StorageType;
  static registerRequiredComponents(
    _componentId: number,
    _components: Components,
    _storages: Storages,
    _requiredComponents: RequiredComponents,
    _inheritanceDepth: number,
    _recursionCheckStack: Vec<ComponentId>,
  ): void {}
  static registerComponentHooks(_hooks: ComponentHooks): void {}
  static getComponentCloneHandler(): ComponentCloneHandler {
    return ComponentCloneHandler.Default();
  }
  static storageType(): StorageType {
    return this[storageSymbol] ?? StorageType.Table;
  }
}

export const Component = macroTrait(ComponentTrait);

export interface Component extends ComponentTrait {}

class ResourceTrait extends Component {}

export const Resource = macroTrait(ResourceTrait);

export interface Resource extends ResourceTrait {}

/**
 * Stores metadata for a type of component or resource stored in a specific World.
 */
export class ComponentInfo {
  hooks: ComponentHooks;
  requiredComponents: RequiredComponents;
  requiredBy: HashSet<ComponentId>;

  /**
   * Create a new ComponentInfo.
   */
  constructor(
    public id: ComponentId,
    public descriptor: ComponentDescriptor,
  ) {
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
    if (this.hooks.addHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_ADD_HOOK);
    }
    if (this.hooks.insertHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_INSERT_HOOK);
    }
    if (this.hooks.replaceHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_REPLACE_HOOK);
    }
    if (this.hooks.removeHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_REMOVE_HOOK);
    }
    if (this.hooks.despawnHook.isSome()) {
      flags.insert(ArchetypeFlags.ON_DESPAWN_HOOK);
    }
  }
}

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
  addHook: Option<ComponentHook>;
  insertHook: Option<ComponentHook>;
  replaceHook: Option<ComponentHook>;
  removeHook: Option<ComponentHook>;
  despawnHook: Option<ComponentHook>;

  constructor() {
    this.addHook = None;
    this.insertHook = None;
    this.replaceHook = None;
    this.removeHook = None;
    this.despawnHook = None;
  }

  /**
   * Try to register a hook that will be run when this component is added to an entity.
   * Returns None if the component already has an onAdd hook.
   */
  tryOnAdd(hook: ComponentHook): Option<this> {
    if (this.addHook.isSome()) {
      return None;
    }
    this.addHook = Some(hook);
    return Some(this);
  }

  /**
   * Try to register a hook that will be run when this component is added (with insert)
   * Returns None if the component already has an onInsert hook.
   */
  tryOnInsert(hook: ComponentHook): Option<this> {
    if (this.insertHook.isSome()) {
      return None;
    }
    this.insertHook = Some(hook);
    return Some(this);
  }

  /**
   * Try to register a hook that will be run when this component is about to be dropped.
   * Returns None if the component already has an onReplace hook.
   */
  tryOnReplace(hook: ComponentHook): Option<this> {
    if (this.replaceHook.isSome()) {
      return None;
    }
    this.replaceHook = Some(hook);
    return Some(this);
  }

  /**
   * Try to register a hook that will be run when this component is removed from an entity.
   * Returns None if the component already has an onRemove hook.
   */
  tryOnRemove(hook: ComponentHook): Option<this> {
    if (this.removeHook.isSome()) {
      return None;
    }
    this.removeHook = Some(hook);
    return Some(this);
  }

  tryOnDespawn(hook: ComponentHook): Option<this> {
    if (this.despawnHook.isSome()) {
      return None;
    }
    this.despawnHook = Some(hook);
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
      this.addHook.isSome() ||
      this.insertHook.isSome() ||
      this.replaceHook.isSome() ||
      this.removeHook.isSome() ||
      this.despawnHook.isSome()
    );
  }
}

interface Require<T = any> {
  type: Constructor<T>;
  func?: RequireFunc;
}

const requireFuncParams = {
  Closure: (_func: () => any) => {},
};

export const RequireFunc = Enums.create('RequireFunc', requireFuncParams);

export type RequireFunc = EnumInstance<typeof requireFuncParams>;

interface ComponentOptions {
  storage: StorageType;
  drop: (value: any) => void;
  onAdd: ComponentHook;
  onRemove: ComponentHook;
  onInsert: ComponentHook;
  onReplace: ComponentHook;
  onDespawn: ComponentHook;
  requires: (Require | Constructor)[];
}

export function component<T extends object>(options: Partial<ComponentOptions> = {}) {
  const optionRequires = options.requires || [];
  const requires = optionRequires.map((require) => {
    if (typeof require === 'function') {
      return { type: require };
    }
    return require;
  });
  return function (target: Constructor<T>) {
    if (options.storage) {
      Object.defineProperty(target, storageSymbol, {
        value: options.storage,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
    if (options.drop) {
      Object.defineProperty(target, dropSymbol, {
        value: options.drop,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }
    Component.implFor(target, {
      static: {
        registerRequiredComponents(
          requiree: ComponentId,
          components: Components,
          storages: Storages,
          requiredComponents: RequiredComponents,
          inheritanceDepth: number,
          recursionCheckStack: Vec<ComponentId>,
        ): void {
          enforceNoRequiredComponentsRecursion(components, recursionCheckStack);
          const selfId = components.registerComponent(target, storages);
          recursionCheckStack.push(selfId);

          for (const required of requires) {
            const createRequired = required.func
              ? required.func.match({
                  Closure: (func) => func,
                })
              : () => {
                  return defaultVal(required.type);
                };
            components.registerRequiredComponentsManual(
              target,
              required.type,
              storages,
              requiredComponents,
              createRequired,
              inheritanceDepth,
              recursionCheckStack,
            );
          }
          for (const required of requires) {
            Component.wrap(required.type).registerRequiredComponents(
              requiree,
              components,
              storages,
              requiredComponents,
              inheritanceDepth + 1,
              recursionCheckStack,
            );
          }

          recursionCheckStack.pop();
        },

        registerComponentHooks(hooks: ComponentHooks): void {
          if (options.onAdd) hooks.tryOnAdd(options.onAdd);
          if (options.onRemove) hooks.tryOnRemove(options.onRemove);
          if (options.onInsert) hooks.tryOnInsert(options.onInsert);
          if (options.onReplace) hooks.tryOnReplace(options.onReplace);
          if (options.onDespawn) hooks.tryOnDespawn(options.onDespawn);
        },

        getComponentCloneHandler(): ComponentCloneHandler {
          return ComponentCloneHandler.Custom(componentCloneViaClone.bind(target));
        },
      },
    });

    return target;
  };
}

function enforceNoRequiredComponentsRecursion(
  components: Components,
  recursionCheckStack: Vec<ComponentId>,
): void {
  if (recursionCheckStack.len() > 0) {
    const requiree = recursionCheckStack.last().unwrap();
    const check = recursionCheckStack.slice(0, -1);
    const directRecursion = check.findIndex((id) => id === requiree) === check.length - 1;
    if (directRecursion || check.includes(requiree)) {
      const path = recursionCheckStack
        .iter()
        .map((id) => components.getName(id).unwrap())
        .collect()
        .join(' → ');
      const help = directRecursion
        ? `Remove require(${components.getName(requiree).unwrap()})`
        : 'If this is intentional, consider merging the components.';
      throw new Error(`Recursive required components detected: ${path}\nhelp: ${help}`);
    }
  }
}

function componentCloneViaClone<C extends object>(
  this: Constructor<C>,
  world: DeferredWorld,
  entityCloner: EntityCloner,
): void {
  const component = deepClone(
    world.entity(entityCloner.source).get(this).expect('Component must exist on source entity'),
  );

  world.commands.entity(entityCloner.target).insert(component);
}

/**
 * Function type for constructing a required component
 */
export type RequiredComponentConstructor = (
  table: Table,
  sparseSets: SparseSets,
  changeTick: Tick,
  tableRow: TableRow,
  entity: Entity,
  caller?: string,
) => void;

/**
 * Represents a required component with its constructor and inheritance depth
 */
@derive([Clone])
export class RequiredComponent {
  constructor(
    public __constructor: RequiredComponentConstructor,
    public inheritanceDepth: number,
  ) {}
}

export interface RequiredComponent extends Clone {}

/**
 * The collection of metadata for components that are required for a given component.
 */
export class RequiredComponents {
  readonly components = new HashMap<ComponentId, RequiredComponent>();

  /**
   * Registers a required component.
   *
   * If the component is already registered, it will be overwritten if the given inheritance depth
   * is smaller than the depth of the existing registration. Otherwise, the new registration will be ignored.
   */
  registerDynamic(
    componentId: ComponentId,
    constructor: RequiredComponentConstructor,
    inheritanceDepth: number,
  ): void {
    this.components.get(componentId).match({
      Some: (component) => {
        if (component.inheritanceDepth > inheritanceDepth) {
          component.__constructor = constructor;
          component.inheritanceDepth = inheritanceDepth;
        }
      },
      None: () => {
        this.components.insert(componentId, new RequiredComponent(constructor, inheritanceDepth));
      },
    });
  }

  /**
   * Registers a required component.
   *
   * If the component is already registered, it will be overwritten if the given inheritance depth
   * is smaller than the depth of the existing registration. Otherwise, the new registration will be ignored.
   */
  register<C extends Constructor>(
    components: Components,
    storages: Storages,
    constructor: C,
    inheritanceDepth: number,
  ): void {
    const componentId = components.registerComponent(constructor, storages);
    this.registerById(componentId, () => new constructor(), inheritanceDepth);
  }

  /**
   * Registers the Component with the given ID as required if it exists.
   */
  registerById<C>(
    componentId: ComponentId,
    customCreator: () => C,
    inheritanceDepth: number,
  ): void {
    function erased(
      table: Table,
      sparseSets: SparseSets,
      changeTick: Tick,
      tableRow: TableRow,
      entity: Entity,
      caller?: string,
    ) {
      const component = customCreator();
      initializeRequiredComponent(
        table,
        sparseSets,
        changeTick,
        tableRow,
        entity,
        componentId,
        StorageType.Table,
        component,
        caller,
      );
    }

    this.registerDynamic(componentId, erased, inheritanceDepth);
  }

  /**
   * Iterates the ids of all required components. This includes recursive required components.
   */
  iterIds(): ComponentId[] {
    return [...this.components.keys()];
  }

  /**
   * Removes components that are explicitly provided in a given Bundle. These components should
   * be logically treated as normal components, not "required components".
   */
  removeExplicitComponents(components: Iterable<ComponentId>): void {
    for (const component of components) {
      this.components.remove(component);
    }
  }

  /**
   * Merges required_components into this collection. This only inserts a required component
   * if it did not already exist.
   */
  merge(requiredComponents: RequiredComponents): void {
    for (const [id, component] of requiredComponents.components) {
      if (!this.components.containsKey(id)) {
        this.components.insert(id, component.clone());
      }
    }
  }

  toString(): string {
    return `RequiredComponents(${this.iterIds().join(', ')})`;
  }
}

function initializeRequiredComponent(
  table: Table,
  sparseSets: SparseSets,
  changeTick: Tick,
  tableRow: TableRow,
  entity: Entity,
  componentId: ComponentId,
  storageType: StorageType,
  componentPtr: any,
  caller?: string,
): void {
  switch (storageType) {
    case StorageType.Table: {
      const column = table.getColumnUnchecked(componentId)!;
      column.initialize(tableRow, componentPtr, changeTick, caller);
      break;
    }
    case StorageType.SparseSet: {
      const sparseSet = sparseSets.get(componentId).unwrap();
      sparseSet.insert(entity, componentPtr, changeTick, caller);
      break;
    }
  }
}

export type ComponentCloneFn = (world: DeferredWorld, cloner: EntityCloner) => void;

export function componentCloneIgnore(_world: DeferredWorld, _entityCloner: EntityCloner): void {}

const componentCloneHandlerParams = {
  Default: () => {},
  Ignore: () => {},
  Custom: (_fn: ComponentCloneFn) => {},
};
export const ComponentCloneHandler = Enums.create(
  'ComponentCloneHandler',
  componentCloneHandlerParams,
);

export type ComponentCloneHandler = EnumInstance<typeof componentCloneHandlerParams>;

export class ComponentCloneHandlers {
  handlers: Vec<Option<ComponentCloneFn>> = Vec.new();
  defaultHandler: ComponentCloneFn;

  constructor(defaultHandler: ComponentCloneFn) {
    this.defaultHandler = defaultHandler;
  }

  setDefaultHandler(handler: ComponentCloneFn): void {
    this.defaultHandler = handler;
  }

  getDefaultHandler(): ComponentCloneFn {
    return this.defaultHandler;
  }

  setComponentHandler(id: ComponentId, handler: ComponentCloneHandler): void {
    if (id >= this.handlers.len()) {
      this.handlers.resize(id + 1, None);
    }
    handler.match({
      Default: () => {
        this.handlers.set(id, None);
      },
      Ignore: () => {
        this.handlers.set(id, Some(componentCloneIgnore));
      },
      Custom: (fn) => {
        this.handlers.set(id, Some(fn));
      },
    });
  }

  isHandlerRegistered(id: ComponentId): boolean {
    return this.handlers.get(id).isSomeAnd((handler) => handler.isSome());
  }

  getHandler(id: ComponentId): ComponentCloneFn {
    return this.handlers.get(id).match({
      Some: (handler) => handler.unwrap(),
      None: () => this.defaultHandler,
    });
  }
}

export class Components {
  components: Vec<ComponentInfo> = Vec.new();
  indices: HashMap<TypeId, ComponentId> = new HashMap();
  resourceIndices: HashMap<TypeId, ComponentId> = new HashMap();
  componentCloneHandlers: ComponentCloneHandlers = new ComponentCloneHandlers(componentCloneIgnore);

  registerComponent<T extends Constructor>(component: T, storages: Storages): ComponentId {
    return registerComponent(this, component, storages, Vec.new());
  }

  registerComponentWithDescriptor(
    storages: Storages,
    descriptor: ComponentDescriptor,
  ): ComponentId {
    return registerComponentInner(this, storages, descriptor);
  }

  len() {
    return this.components.len();
  }

  isEmpty() {
    return this.components.len() === 0;
  }

  getInfo(id: ComponentId): Option<ComponentInfo> {
    return this.components.get(id);
  }

  getInfoUnchecked(id: ComponentId): ComponentInfo {
    return this.components.getUnchecked(id);
  }

  getName(id: ComponentId): Option<string> {
    return this.getInfo(id).map((info) => info.name);
  }

  getHooks(id: ComponentId): Option<ComponentHooks> {
    return this.components.get(id).map((info) => info.hooks);
  }

  getRequiredComponents(id: ComponentId): Option<RequiredComponents> {
    return this.components.get(id).map((info) => info.requiredComponents);
  }

  registerRequiredComponents<R extends Component>(
    requiree: ComponentId,
    required: ComponentId,
    constructor: () => R,
  ): Result<void, RequiredComponentsError> {
    const requiredComponents = this.getRequiredComponents(requiree).unwrap();

    if (
      requiredComponents.components
        .get(required)
        .isSomeAnd((component) => component.inheritanceDepth === 0)
    ) {
      return Result.Err(RequiredComponentsError.DuplicateRegistration(requiree, required));
    }

    requiredComponents.registerById(required, constructor, 0);

    const requiredBy = this.getRequiredBy(required).unwrap();
    requiredBy.insert(requiree);

    const inheritedRequirements = this.registerInheritedRequiredComponents(requiree, required);

    const requiredByRequiree = this.getRequiredBy(requiree);
    if (requiredByRequiree.isSome()) {
      requiredBy.extend(requiredByRequiree.unwrap());
      for (const requiredById of requiredByRequiree.unwrap()) {
        const parentRequiredComponents = this.getRequiredComponents(requiredById).unwrap();
        const depth = parentRequiredComponents.components
          .get(requiree)
          .expect(
            'requiree is required by required_by_id, so its required_components must include requiree',
          ).inheritanceDepth;

        parentRequiredComponents.registerById(required, constructor, depth + 1);

        for (const [componentId, component] of inheritedRequirements) {
          parentRequiredComponents.registerDynamic(
            componentId,
            component.__constructor,
            component.inheritanceDepth + depth + 1,
          );
        }
      }
    }

    return Ok(undefined);
  }

  registerInheritedRequiredComponents(
    requiree: ComponentId,
    required: ComponentId,
  ): Vec<[ComponentId, RequiredComponent]> {
    const requiredComponentInfo = this.getInfoUnchecked(required);
    const inheritedRequirements: Vec<[ComponentId, RequiredComponent]> = Vec.from(
      requiredComponentInfo.requiredComponents.components.entries(),
    )
      .iter()
      .map(
        ([componentId, requiredComponent]) =>
          [
            componentId,
            new RequiredComponent(
              requiredComponent.__constructor,
              requiredComponent.inheritanceDepth + 1,
            ),
          ] as [ComponentId, RequiredComponent],
      )
      .collectInto((value) => Vec.from(value));

    for (const [componentId, component] of inheritedRequirements) {
      const requiredComponents = this.getRequiredComponents(requiree).unwrap();
      requiredComponents.registerDynamic(
        componentId,
        component.__constructor,
        component.inheritanceDepth,
      );

      const requiredBy = this.getRequiredBy(componentId).unwrap();
      requiredBy.insert(requiree);
    }

    return inheritedRequirements;
  }

  registerRequiredComponentsManual<T extends Constructor, R extends Constructor>(
    component: T,
    requiredComponent: R,
    storages: Storages,
    requiredComponents: RequiredComponents,
    customCreator: () => R,
    inheritanceDepth: number,
    recursionCheckStack: Vec<ComponentId>,
  ): void {
    const requiree = registerComponent(this, component, storages, recursionCheckStack);
    const required = registerComponent(this, requiredComponent, storages, recursionCheckStack);

    // SAFETY: We just created the components.
    this.registerRequiredComponentsManualUnchecked(
      requiree,
      required,
      requiredComponents,
      customCreator,
      inheritanceDepth,
    );
  }

  registerRequiredComponentsManualUnchecked<R>(
    requiree: ComponentId,
    required: ComponentId,
    requiredComponents: RequiredComponents,
    customCreator: () => R,
    inheritanceDepth: number,
  ): void {
    if (required === requiree) {
      return;
    }
    requiredComponents.registerById(required, customCreator, inheritanceDepth);
    const requiredBy = this.getInfoUnchecked(required).requiredBy;
    requiredBy.insert(requiree);
    const inherited = this.getInfoUnchecked(required)
      .requiredComponents.components.iter()
      .map(([id, component]) => {
        return [id, component.clone()] as [ComponentId, RequiredComponent];
      });
    for (const [id, component] of inherited) {
      requiredComponents.registerDynamic(
        id,
        component.__constructor,
        component.inheritanceDepth + 1,
      );
      this.getInfoUnchecked(id).requiredBy.insert(requiree);
    }
  }

  getRequiredBy(id: ComponentId): Option<HashSet<ComponentId>> {
    return this.components.get(id).map((info) => info.requiredBy);
  }

  getId(id: TypeId): Option<ComponentId> {
    return this.indices.get(id);
  }

  componentId(component: any): Option<ComponentId> {
    Component.validFor(component);
    return this.getId(typeId(component));
  }

  getResourceId(typeId: TypeId): Option<number> {
    return this.resourceIndices.get(typeId);
  }

  resourceId(res: any): Option<number> {
    return this.getResourceId(typeId(res));
  }

  registerResource<T>(resource: Constructor<T>): ComponentId {
    Resource.validFor(resource);
    return this.getOrInsertResourceWith(typeId(resource), () => {
      return ComponentDescriptor.new(resource);
    });
  }

  registerResourceWithDescriptor(descriptor: ComponentDescriptor): ComponentId {
    return this.registerResourceInner(descriptor);
  }

  getOrInsertResourceWith(typeId: TypeId, func: () => ComponentDescriptor): ComponentId {
    const id = this.resourceIndices.get(typeId).unwrapOrElse(() => {
      const descriptor = func();
      const id = this.registerResourceInner(descriptor);
      this.resourceIndices.insert(typeId, id);
      return id;
    });
    return id;
  }

  private registerResourceInner(descriptor: ComponentDescriptor): ComponentId {
    const componentId = this.components.len();
    this.components.push(new ComponentInfo(componentId, descriptor));
    return componentId;
  }

  iter() {
    return this.components;
  }
}

function registerComponent<T extends Constructor>(
  self: Components,
  component: T,
  storages: Storages,
  recursionCheckStack: Vec<ComponentId>,
): ComponentId {
  let isNewRegistration = false;
  const tid = typeId(component);
  let id = self.indices.get(tid).unwrapOrElse(() => {
    const id = registerComponentInner(self, storages, ComponentDescriptor.new(component));
    isNewRegistration = true;
    self.indices.insert(tid, id);
    return id;
  });
  if (isNewRegistration) {
    const requiredComponents = new RequiredComponents();
    Component.wrap(component).registerRequiredComponents(
      id,
      self,
      storages,
      requiredComponents,
      0,
      recursionCheckStack,
    );
    const info = self.components.getUnchecked(id);
    Component.wrap(component).registerComponentHooks(info.hooks);
    info.requiredComponents = requiredComponents;
    const cloneHandler = Component.wrap(component).getComponentCloneHandler();
    self.componentCloneHandlers.setComponentHandler(id, cloneHandler);
  }
  return id;
}

function registerComponentInner(
  self: Components,
  storages: Storages,
  descriptor: ComponentDescriptor,
): ComponentId {
  const componentId = self.components.len();
  const info = new ComponentInfo(componentId, descriptor);
  if (info.descriptor.storageType === StorageType.SparseSet) {
    storages.sparseSets.getOrInsert(info);
  }
  self.components.push(info);
  return componentId;
}
