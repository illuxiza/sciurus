import { NOT_IMPLEMENTED, TraitValid } from '@sciurus/utils';
import { Constructor, implTrait, Option, trait, TypeId, typeId, useTrait, Vec } from 'rustable';
import {
  Component,
  type ComponentId,
  type Components,
  type RequiredComponents,
} from '../component';
import { type Storages, type StorageType } from '../storage';

@trait
export class DynamicBundle extends TraitValid {
  getComponents(_ids: (storageType: StorageType, component: Component) => void) {
    throw NOT_IMPLEMENTED;
  }
}

@trait
export class Bundle extends DynamicBundle {
  getBundleType(): BundleType {
    return (this.constructor as typeof Bundle).staticBundleType();
  }
  componentIds(
    components: Components,
    storages: Storages,
    ids: (componentId: ComponentId) => void,
  ) {
    return this.getBundleType().componentIds(components, storages, ids);
  }
  getComponentIds(components: Components, ids: (id: Option<ComponentId>) => void): void {
    return this.getBundleType().getComponentIds(components, ids);
  }
  fromComponents<T>(ctx: T, func: (t: T) => Bundle): any {
    return this.getBundleType().fromComponents(ctx, func);
  }
  bundleRegisterRequiredComponents(
    components: Components,
    storages: Storages,
    requiredComponents: RequiredComponents,
  ): void {
    return this.getBundleType().bundleRegisterRequiredComponents(
      components,
      storages,
      requiredComponents,
    );
  }
  static staticBundleType(): BundleType {
    throw NOT_IMPLEMENTED;
  }
  static componentIds(
    components: Components,
    storages: Storages,
    ids: (componentId: ComponentId) => void,
  ) {
    return this.staticBundleType().componentIds(components, storages, ids);
  }
  static getComponentIds(components: Components, ids: (id: Option<ComponentId>) => void): void {
    return this.staticBundleType().getComponentIds(components, ids);
  }
  static fromComponents<T>(ctx: T, func: (t: T) => Bundle): any {
    return this.staticBundleType().fromComponents(ctx, func);
  }
  static bundleRegisterRequiredComponents(
    components: Components,
    storages: Storages,
    requiredComponents: RequiredComponents,
  ): void {
    return this.staticBundleType().bundleRegisterRequiredComponents(
      components,
      storages,
      requiredComponents,
    );
  }
}

@trait
export class BundleType extends TraitValid {
  componentIds(
    _components: Components,
    _storages: Storages,
    _ids: (componentId: ComponentId) => void,
  ) {
    throw NOT_IMPLEMENTED;
  }
  getComponentIds(_components: Components, _ids: (id: Option<ComponentId>) => void): void {
    throw NOT_IMPLEMENTED;
  }
  fromComponents<T>(_ctx: T, _func: (t: T) => Bundle): any {
    throw NOT_IMPLEMENTED;
  }
  bundleRegisterRequiredComponents(
    _components: Components,
    _storages: Storages,
    _requiredComponents: RequiredComponents,
  ): void {
    throw NOT_IMPLEMENTED;
  }
}

implTrait(Component, DynamicBundle, {
  getComponents(this: Component, ids: (storageType: StorageType, component: Component) => void) {
    ids(useTrait(this.constructor as Constructor<Component>, Component).storageType(), this);
  },
});

class ComponentBundleType {
  constructor(public component: Constructor<Component>) {}
  componentIds(
    components: Components,
    storages: Storages,
    ids: (componentId: ComponentId) => void,
  ) {
    ids(components.registerComponent(this.component, storages));
  }
  getComponentIds(components: Components, ids: (id: Option<ComponentId>) => void): void {
    ids(components.getId(typeId(this.component)));
  }
  fromComponents<T>(ctx: T, func: (t: T) => Bundle): any {
    return func(ctx);
  }
  bundleRegisterRequiredComponents(
    components: Components,
    storages: Storages,
    requiredComponents: RequiredComponents,
  ): void {
    const componentId = components.registerComponent(this.component, storages);
    Component.registerRequiredComponents(
      componentId,
      components,
      storages,
      requiredComponents,
      0,
      Vec.new(),
    );
  }
}

implTrait(ComponentBundleType, BundleType);

implTrait(ComponentBundleType, DynamicBundle);

implTrait(Component, Bundle, {
  static: {
    staticBundleType(this: Constructor<Component>): BundleType {
      return new ComponentBundleType(this);
    },
  },
});

implTrait(Array, DynamicBundle, {
  getComponents(this: Array<any>, ids: (storageType: StorageType, component: Component) => void) {
    this.forEach((component) => component.getComponents(ids));
  },
});

const arrayBundleTypeMap = new Map<TypeId, any>();

implTrait(Array<any>, Bundle, {
  getBundleType(this: Array<any>): BundleType {
    const types = this.map((component) => {
      if (typeof component === 'object') {
        return component.constructor;
      } else if (typeof component === 'function') {
        return component;
      }
    });
    if (arrayBundleTypeMap.has(typeId(this, types))) {
      return arrayBundleTypeMap.get(typeId(this, types))!;
    }
    class ArrayBundleType {
      constructor(public components: Array<BundleType>) {}
      componentIds(
        components: Components,
        storages: Storages,
        ids: (componentId: ComponentId) => void,
      ) {
        this.components.forEach((component) => component.componentIds(components, storages, ids));
      }
      getComponentIds(components: Components, ids: (id: Option<ComponentId>) => void): void {
        this.components.forEach((component) => component.getComponentIds(components, ids));
      }
      fromComponents<T>(ctx: T, func: (t: T) => Bundle): any {
        this.components.forEach((component) => component.fromComponents(ctx, func));
        return this;
      }
      bundleRegisterRequiredComponents(
        components: Components,
        storages: Storages,
        requiredComponents: RequiredComponents,
      ): void {
        this.components.forEach((component) =>
          component.bundleRegisterRequiredComponents(components, storages, requiredComponents),
        );
      }
    }
    implTrait(ArrayBundleType, BundleType);
    const bundleType = new ArrayBundleType(types);
    arrayBundleTypeMap.set(typeId(this, types), bundleType);
    return bundleType;
  },
});
