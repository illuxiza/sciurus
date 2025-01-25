import {
  Constructor,
  Default,
  defaultVal,
  EnumInstance,
  Enums,
  hasTrait,
  implTrait,
  useTrait,
  Vec,
} from 'rustable';
import { EntityCloner } from '../entity/cloner';
import { StorageType } from '../storage';
import { Storages } from '../storage/storages';
import { DeferredWorld } from '../world/deferred';
import { Component } from './base';
import { ComponentCloneHandler } from './clone_handler';
import { Components } from './collection';
import { ComponentHook, ComponentHooks } from './hooks';
import { RequiredComponents } from './required_components';
import { ComponentId, dropSymbol, storageSymbol } from './types';

interface Require<T> {
  type: Constructor<T>;
  func?: RequireFunc;
}

const params = {
  Closure: (_func: () => any) => {},
};
export const RequireFunc = Enums.create('RequireFunc', params);

export type RequireFunc = EnumInstance<typeof params>;

interface ComponentOptions {
  storage: StorageType;
  drop: (value: any) => void;
  onAdd: ComponentHook;
  onRemove: ComponentHook;
  onInsert: ComponentHook;
  onReplace: ComponentHook;
  requires: Require<any>[];
}

export function component<T extends object>(options: Partial<ComponentOptions> = {}) {
  const requires = options.requires || [];

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
    implTrait(target, Component, {
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
                  if (hasTrait(required.type, Default)) {
                    return defaultVal(required.type);
                  }
                  return new required.type();
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
            useTrait(required.type, Component).registerRequiredComponents(
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

export function componentCloneViaClone<C extends object>(
  this: Constructor<C>,
  world: DeferredWorld,
  entityCloner: EntityCloner,
): void {
  const component = world.world.world
    .entity(entityCloner.source)
    .get(this)
    .expect('Component must exist on source entity')
    .clone();

  world.commands.entity(entityCloner.target).insert(component);
}
