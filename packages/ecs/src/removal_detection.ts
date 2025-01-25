import { Constructor, createFactory, derive, implTrait, iter, Option, RustIter } from 'rustable';
import { Tick } from './change_detection/tick';
import { Component } from './component/base';
import { ComponentId } from './component/types';
import { Entity } from './entity/base';
import { Event, EventId } from './event/base';
import { Events } from './event/collection';
import { EventCursor } from './event/cursor';
import { SparseSet } from './storage/sparse_set';
import { SystemParam } from './system/param/base';
import { SystemMeta } from './system/types';
import { World } from './world/base';
import { WorldCell } from './world/cell';

export class RemovedComponentEvents {
  private eventSets: SparseSet<ComponentId, Events<RemovedComponentEntity>> = new SparseSet();

  static new(): RemovedComponentEvents {
    return new RemovedComponentEvents();
  }

  update(): void {
    for (const [_, events] of this.eventSets.iter()) {
      events.update();
    }
  }

  iter(): RustIter<[ComponentId, Events<RemovedComponentEntity>]> {
    return this.eventSets.iter();
  }

  get(componentId: ComponentId): Option<Events<RemovedComponentEntity>> {
    return this.eventSets.get(componentId);
  }

  send(componentId: ComponentId, entity: Entity): void {
    this.eventSets
      .getOrInsertWith(
        componentId,
        () => new Events<RemovedComponentEntity>(RemovedComponentEntity),
      )
      .send(new RemovedComponentEntity(entity));
  }
}

@derive([Event])
export class RemovedComponentEntity {
  constructor(public entity: Entity) {}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class RemovedComponentReader<T extends Component> {
  private reader: EventCursor<RemovedComponentEntity> = new EventCursor<RemovedComponentEntity>();

  static default<T extends Component>(): RemovedComponentReader<T> {
    return new RemovedComponentReader<T>();
  }

  get(): EventCursor<RemovedComponentEntity> {
    return this.reader;
  }

  getMut(): EventCursor<RemovedComponentEntity> {
    return this.reader;
  }
}

class RemovedComponentsInner<T extends Component> {
  constructor(
    private componentId: ComponentId,
    public reader: RemovedComponentReader<T>,
    private eventSets: RemovedComponentEvents,
  ) {}

  events(): Option<Events<RemovedComponentEntity>> {
    return this.eventSets.get(this.componentId);
  }

  readerMutWithEvents(): Option<[RemovedComponentReader<T>, Events<RemovedComponentEntity>]> {
    return this.events().map((events) => [this.reader, events]);
  }

  read(): RustIter<Entity> {
    return this.readerMutWithEvents()
      .map(([reader, events]) => iter(reader.getMut().read(events)).map((e) => e.entity))
      .unwrapOr([].iter());
  }

  readWithId(): RustIter<[Entity, EventId]> {
    return this.readerMutWithEvents()
      .map(([reader, events]) =>
        iter(reader.getMut().readWithId(events)).map(([e, id]) => [e.entity, id]),
      )
      .unwrapOr([].iter());
  }

  len(): number {
    return this.events()
      .map((events) => this.reader.get().len(events))
      .unwrapOr(0);
  }

  isEmpty(): boolean {
    return this.events()
      .map((events) => this.reader.get().isEmpty(events))
      .unwrapOr(true);
  }

  clear(): void {
    this.readerMutWithEvents().map(([reader, events]) => reader.getMut().clear(events));
  }
}

class RemovedComponentsParam<T extends Component> {
  constructor(private componentType: new () => T) {}

  initParamState(world: World, _systemMeta: SystemMeta): [ComponentId, RemovedComponentReader<T>] {
    return [world.registerComponent(this.componentType), RemovedComponentReader.default()];
  }

  getParam(
    [componentId, reader]: [ComponentId, RemovedComponentReader<T>],
    _systemMeta: SystemMeta,
    world: WorldCell,
    _changeTick: Tick,
  ): RemovedComponentsInner<T> {
    return new RemovedComponentsInner(componentId, reader, world.removedComponents);
  }
}

implTrait(RemovedComponentsParam, SystemParam);

interface RemovedComponentsParam<T extends Component>
  extends SystemParam<[ComponentId, RemovedComponentReader<T>], RemovedComponentsInner<T>> {}

export const RemovedComponents = createFactory(
  RemovedComponentsInner,
  (eventType: Constructor) => new RemovedComponentsParam(eventType),
) as typeof RemovedComponentsInner & {
  <E extends object>(eventType: Constructor<E>): RemovedComponentsParam<E>;
};

export interface RemovedComponents<E extends object> extends RemovedComponentsInner<E> {}
