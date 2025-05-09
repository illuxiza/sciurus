import { iter, RustIter } from 'rustable';
import { EventId, EventInstance } from './base';
import { Events } from './collection';
import { EventCursor } from './cursor';

export class EventIterator<E extends object> implements IterableIterator<E> {
  constructor(private _iter: EventIteratorWithId<E>) {}

  next(): IteratorResult<E> {
    const result = this._iter.next();
    return result.done ? { done: true, value: undefined } : { done: false, value: result.value[0] };
  }

  [Symbol.iterator](): IterableIterator<E> {
    return this;
  }

  iter(): RustIter<E> {
    return iter(this);
  }

  len(): number {
    return this._iter.len();
  }
}

export class EventIteratorWithId<E extends object> implements IterableIterator<[E, EventId]> {
  private chain: RustIter<EventInstance<E>>;
  private unread: number;

  constructor(
    private reader: EventCursor<E>,
    events: Events<E>,
  ) {
    const aIndex = Math.max(reader.lastEventCount - events.eventsA.startEventCount, 0);
    const bIndex = Math.max(reader.lastEventCount - events.eventsB.startEventCount, 0);
    const a = events.eventsA.slice(aIndex);
    const b = events.eventsB.slice(bIndex);
    this.unread = a.length + b.length;
    this.chain = iter(a).chain(iter(b));
    this.reader.lastEventCount = events.eventCount - this.unread;
  }

  next(): IteratorResult<[E, EventId]> {
    const instance = this.chain[Symbol.iterator]().next();
    if (instance.done) {
      return { done: true, value: undefined };
    }
    this.reader.lastEventCount++;
    this.unread--;
    return { done: false, value: [instance.value.event, instance.value.eventId] };
  }

  [Symbol.iterator](): IterableIterator<[E, EventId]> {
    return this;
  }

  withoutId(): EventIterator<E> {
    return new EventIterator(this);
  }

  len(): number {
    return this.unread;
  }
}
