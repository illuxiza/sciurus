import { TraitValid } from '@sciurus/utils';
import { Constructor, createFactory, derive, macroTrait, Option, trait, Type } from 'rustable';
import { ComponentId } from '../component';
import { Component } from '../component';
import { EmptyTraversal } from '../traversal';
import { World } from '../world';

@derive([Component])
class EventWrapperComponentType<T extends object> {
  eventType!: Constructor<T>;
}

function eventWrapperComponentType<T extends object>(
  event: Constructor<T>,
): Constructor<EventWrapperComponentType<T>> {
  return Type(EventWrapperComponentType, [event]);
}

const EventWrapperComponent = createFactory(
  EventWrapperComponentType,
  eventWrapperComponentType,
) as typeof EventWrapperComponentType & {
  <T extends object>(eventType: Constructor<T>): Constructor<EventWrapperComponentType<T>>;
};

@trait
class EventTrait extends TraitValid {
  static traversal(): Constructor {
    return EmptyTraversal;
  }

  static autoPropagate(): boolean {
    return false;
  }

  static registerComponentId(world: World): ComponentId {
    return world.registerComponent(EventWrapperComponent(this));
  }

  static componentId(world: World): Option<ComponentId> {
    return world.componentId(EventWrapperComponent(this));
  }
}

export const Event = macroTrait(EventTrait);

export interface Event extends EventTrait {}

export class EventId {
  constructor(
    public id: number,
    public caller?: string,
  ) {}

  toString(): string {
    return `event<${this.constructor.name}>#${this.id}`;
  }
}

export class EventInstance<E> {
  constructor(
    public eventId: EventId,
    public event: E,
  ) {}
}
