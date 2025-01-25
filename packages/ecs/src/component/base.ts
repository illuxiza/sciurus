import { TraitValid } from '@sciurus/utils';
import { macroTrait, trait, Vec } from 'rustable';
import { Storages, StorageType } from '../storage';
import { ComponentCloneHandler } from './clone_handler';
import { Components } from './collection';
import { ComponentHooks } from './hooks';
import { RequiredComponents } from './required_components';
import { ComponentId, storageSymbol } from './types';

@trait
class ComponentTrait extends TraitValid {
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

@trait
class ResourceTrait extends Component {}

export const Resource = macroTrait(ResourceTrait);

export interface Resource extends ResourceTrait {}
