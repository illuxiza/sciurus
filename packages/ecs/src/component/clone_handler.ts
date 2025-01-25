import { EnumInstance, Enums, None, Option, Some, Vec } from 'rustable';
import { EntityCloner } from '../entity/cloner';
import { DeferredWorld } from '../world/deferred';
import { ComponentId } from './types';

export type ComponentCloneFn = (world: DeferredWorld, cloner: EntityCloner) => void;

export function componentCloneIgnore(_world: DeferredWorld, _entityCloner: EntityCloner): void {}

const params = {
  Default: () => {},
  Ignore: () => {},
  Custom: (_fn: ComponentCloneFn) => {},
};
export const ComponentCloneHandler = Enums.create('ComponentCloneHandler', params);

export type ComponentCloneHandler = EnumInstance<typeof params>;

export class ComponentCloneHandlers {
  private handlers: Vec<Option<ComponentCloneFn>> = Vec.new();
  private defaultHandler: ComponentCloneFn;

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
