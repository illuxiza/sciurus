import { Constructor, createFactory, Default, derive } from 'rustable';
import { Local, Res, SystemParam } from '../system/param';
import { Events } from './collection';
import { EventCursor } from './cursor';
import { EventIterator, EventIteratorWithId } from './iterators';

@derive([Default])
export class EventReaderInner<E extends object> {
  reader: EventCursor<E>;
  events: Events<E>;

  constructor(events: Events<E>, reader?: EventCursor<E>) {
    this.events = events;
    this.reader = (reader ?? events) ? events.getCursor() : new EventCursor();
  }

  public read(): EventIterator<E> {
    return this.reader.read(this.events);
  }

  public readWithId(): EventIteratorWithId<E> {
    return this.reader.readWithId(this.events);
  }

  public len(): number {
    return this.reader.len(this.events);
  }

  public isEmpty(): boolean {
    return this.reader.isEmpty(this.events);
  }

  public clear(): void {
    this.reader.clear(this.events);
  }
}

@derive([SystemParam])
export class EventReaderParam<E extends object> {
  constructor(public eventType: Constructor<E>) {}
  getOptions() {
    return {
      reader: Local(EventCursor),
      events: Res(Events(this.eventType)),
    };
  }

  static getTargetType() {
    return EventReaderInner;
  }
}

export interface EventReaderParam<E extends object> extends SystemParam<any, EventReader<E>> {}

export interface EventReader<E extends object> extends EventReaderInner<E> {}

export const EventReader = createFactory(
  EventReaderInner,
  (eventType: Constructor) => new EventReaderParam(eventType),
) as typeof EventReaderInner & {
  <E extends object>(eventType: Constructor<E>): EventReaderParam<E>;
};
