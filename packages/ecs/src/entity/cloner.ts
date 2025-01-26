import { HashMap, HashSet, None, Option, Some } from 'rustable';
import {
  type ComponentCloneFn,
  type ComponentCloneHandler,
  componentCloneIgnore,
  type ComponentId,
} from '../component';
import { World } from '../world/base';
import { EntityCell } from '../world/entity_ref/cell';
import { Entity } from './base';

export class EntityCloner {
  private __source: Entity;
  private __target: Entity;
  private __componentId: Option<ComponentId>;
  private __filterAllowsComponents: boolean;
  private __filter: HashSet<ComponentId>;
  private __cloneHandlersOverrides: HashMap<ComponentId, ComponentCloneHandler>;

  constructor(
    source: Entity,
    target: Entity,
    filterAllowsComponents: boolean,
    filter: HashSet<ComponentId>,
    cloneHandlersOverrides: HashMap<ComponentId, ComponentCloneHandler>,
  ) {
    this.__source = source;
    this.__target = target;
    this.__componentId = None;
    this.__filterAllowsComponents = filterAllowsComponents;
    this.__filter = filter;
    this.__cloneHandlersOverrides = cloneHandlersOverrides;
  }

  cloneEntity(world: World): void {
    const sourceEntity = world.fetchEntity(this.__source).unwrapOrElse(() => {
      throw new Error('Source entity must exist');
    }) as EntityCell;

    const archetype = sourceEntity.archetype;
    const components = archetype.components.filter((id) => this.isCloningAllowed(id));

    for (const component of components) {
      const globalHandlers = world.components.componentCloneHandlers;
      const handler = this.__cloneHandlersOverrides.get(component).match({
        None: () => globalHandlers.getHandler(component),
        Some: (handler) =>
          handler.match({
            Default: () => {
              return globalHandlers.getDefaultHandler();
            },
            Ignore: componentCloneIgnore,
            Custom: (fn: ComponentCloneFn) => fn,
          }),
      });

      this.__componentId = Some(component);
      handler(world.intoDeferred(), this);
    }
  }

  private isCloningAllowed(component: ComponentId): boolean {
    return (
      (this.__filterAllowsComponents && this.__filter.contains(component)) ||
      (!this.__filterAllowsComponents && !this.__filter.contains(component))
    );
  }

  get source(): Entity {
    return this.__source;
  }

  get target(): Entity {
    return this.__target;
  }

  get componentId(): ComponentId {
    return this.__componentId.expect('ComponentId must be set in clone_entity');
  }

  withSourceAndTarget(source: Entity, target: Entity): EntityCloner {
    return new EntityCloner(
      source,
      target,
      this.__filterAllowsComponents,
      new HashSet(this.__filter.iter().collect()),
      new HashMap(this.__cloneHandlersOverrides.iter().collect()),
    );
  }
}
