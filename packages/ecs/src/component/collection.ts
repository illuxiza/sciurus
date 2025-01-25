import {
  Constructor,
  HashMap,
  HashSet,
  Ok,
  Option,
  Result,
  TypeId,
  typeId,
  useTrait,
  Vec,
} from 'rustable';
import { Storages, StorageType } from '../storage';
import { Component, Resource } from './base';
import { ComponentCloneHandlers, componentCloneIgnore } from './clone_handler';
import { ComponentHooks } from './hooks';
import { ComponentInfo } from './info';
import { RequiredComponent, RequiredComponents } from './required_components';
import { ComponentDescriptor, ComponentId, RequiredComponentsError } from './types';

export class Components {
  components: Vec<ComponentInfo> = Vec.new();
  indices: HashMap<TypeId, ComponentId> = new HashMap();
  resourceIndices: HashMap<TypeId, ComponentId> = new HashMap();
  componentCloneHandlers: ComponentCloneHandlers = new ComponentCloneHandlers(componentCloneIgnore);

  registerComponent<T extends Constructor>(component: T, storages: Storages): ComponentId {
    return this.registerComponentInternal(component, storages, Vec.new());
  }

  private registerComponentInternal<T extends Constructor>(
    component: T,
    storages: Storages,
    recursionCheckStack: Vec<ComponentId>,
  ): ComponentId {
    Component.validType(component);
    let isNewRegistration = false;
    const tid = typeId(component);
    let id = this.indices.get(tid).unwrapOrElse(() => {
      const id = this.registerComponentInner(storages, ComponentDescriptor.new(component));
      isNewRegistration = true;
      this.indices.insert(tid, id);
      return id;
    });
    if (isNewRegistration) {
      const requiredComponents = new RequiredComponents();
      useTrait(component, Component).registerRequiredComponents(
        id,
        this,
        storages,
        requiredComponents,
        0,
        recursionCheckStack,
      );
      const info = this.components[id];
      useTrait(component, Component).registerComponentHooks(info.hooks);
      info.requiredComponents = requiredComponents;
      const cloneHandler = useTrait(component, Component).getComponentCloneHandler();
      this.componentCloneHandlers.setComponentHandler(id, cloneHandler);
    }
    return id;
  }

  registerComponentWithDescriptor(
    storages: Storages,
    descriptor: ComponentDescriptor,
  ): ComponentId {
    return this.registerComponentInner(storages, descriptor);
  }

  private registerComponentInner(storages: Storages, descriptor: ComponentDescriptor): ComponentId {
    const componentId = this.components.len();
    const info = new ComponentInfo(componentId, descriptor);
    if (info.descriptor.storageType === StorageType.SparseSet) {
      storages.sparseSets.getOrInsert(info);
    }
    this.components.push(info);
    return componentId;
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
    return this.components[id];
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
      for (const id of requiredByRequiree.unwrap()) {
        requiredBy.insert(id);
      }
      // requiredBy.extend(requiredByRequiree.unwrap());

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
    Component.validType(component);
    Component.validType(requiredComponent);
    const requiree = this.registerComponentInternal(component, storages, recursionCheckStack);
    const required = this.registerComponentInternal(
      requiredComponent,
      storages,
      recursionCheckStack,
    );

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
    Component.validType(component);
    return this.getId(typeId(component));
  }

  getResourceId(typeId: TypeId): Option<number> {
    return this.resourceIndices.get(typeId);
  }

  resourceId(res: any): Option<number> {
    return this.getResourceId(typeId(res));
  }

  registerResource<T>(resource: Constructor<T>): ComponentId {
    Resource.validType(resource);
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
