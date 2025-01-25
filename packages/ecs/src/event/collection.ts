import { logger } from '@sciurus/utils';
import {
  Constructor,
  createFactory,
  derive,
  iter,
  None,
  Option,
  RustIter,
  Type,
  Vec,
} from 'rustable';
import { Resource } from '../component';
import { EventId, EventInstance } from './base';
import { EventCursor } from './cursor';

export class EventSequence<E extends object> extends Vec<EventInstance<E>> {
  public startEventCount: number = 0;

  static default<E extends object>(): EventSequence<E> {
    return new EventSequence<E>();
  }
}

@derive([Resource])
export class EventsInner<E extends object> {
  eventsA: EventSequence<E>;
  eventsB: EventSequence<E>;
  eventCount: number;

  constructor(private event: Constructor<E>) {
    this.eventsA = new EventSequence<E>();
    this.eventsB = new EventSequence<E>();
    this.eventCount = 0;
  }

  public oldestEventCount(): number {
    return this.eventsA.startEventCount;
  }

  public send(event: E, caller?: string): EventId {
    const eventId = new EventId(this.eventCount, caller);
    const eventInstance = new EventInstance(eventId, event);
    this.eventsB.push(eventInstance);
    this.eventCount++;
    return eventId;
  }

  public sendBatch(events: Iterable<E>, caller?: string): SendBatchIds {
    const lastCount = this.eventCount;
    for (const event of events) {
      this.send(event, caller);
    }
    return new SendBatchIds(lastCount, this.eventCount);
  }

  public sendDefault(): EventId {
    return this.send(new this.event());
  }

  public getCursor(): EventCursor<E> {
    return new EventCursor<E>();
  }

  public getCursorCurrent(): EventCursor<E> {
    return new EventCursor<E>(this.eventCount);
  }

  public update(): void {
    [this.eventsA, this.eventsB] = [this.eventsB, this.eventsA];
    this.eventsB.clear();
    this.eventsB.startEventCount = this.eventCount;
  }

  public updateDrain(): RustIter<E> {
    [this.eventsA, this.eventsB] = [this.eventsB, this.eventsA];
    const iter = this.eventsB.drain();
    this.eventsB.startEventCount = this.eventCount;
    return iter.iter().map((instance) => instance.event);
  }

  private resetStartEventCount(): void {
    this.eventsA.startEventCount = this.eventCount;
    this.eventsB.startEventCount = this.eventCount;
  }

  public clear(): void {
    this.resetStartEventCount();
    this.eventsA.clear();
    this.eventsB.clear();
  }

  public len(): number {
    return this.eventsA.len() + this.eventsB.len();
  }

  public isEmpty(): boolean {
    return this.len() === 0;
  }

  public drain(): RustIter<E> {
    this.resetStartEventCount();
    return this.eventsA
      .drain()
      .iter()
      .chain(this.eventsB.drain().iter())
      .map((instance) => instance.event);
  }

  public iterCurrentUpdateEvents(): RustIter<E> {
    return this.eventsB.iter().map((instance) => instance.event);
  }

  public getEvent(id: number): Option<[E, EventId]> {
    if (id < this.oldestEventCount()) {
      return None;
    }
    const sequence = this.sequence(id);
    const index = id - sequence.startEventCount;
    return sequence.get(index).map((instance) => [instance.event, instance.eventId]);
  }

  private sequence(id: number): EventSequence<E> {
    return id < this.eventsB.startEventCount ? this.eventsA : this.eventsB;
  }

  public extend<I extends Iterable<E>>(it: I): void {
    const oldCount = this.eventCount;
    let eventCount = this.eventCount;
    const events = iter(it)
      .map((event) => {
        const eventId = new EventId(eventCount);
        eventCount++;
        return new EventInstance(eventId, event);
      })
      .collect();
    this.eventsB.extend(events);
    if (oldCount !== eventCount) {
      // Trace logging could be added here if needed
      logger.warn(`Events::extend() -> ids: (${oldCount}..${eventCount})`);
    }
    this.eventCount = eventCount;
  }
}

export function eventsType<T extends object>(
  eventType: Constructor<T>,
): Constructor<EventsInner<T>> {
  return Type(EventsInner, [eventType]);
}

export const Events = createFactory(EventsInner, eventsType) as typeof EventsInner & {
  <E extends object>(eventType: Constructor<E>): Constructor<EventsInner<E>>;
};

export interface Events<E extends object> extends EventsInner<E> {}

export class SendBatchIds implements IterableIterator<EventId> {
  private lastCount: number;
  private eventCount: number;

  constructor(lastCount: number, eventCount: number) {
    this.lastCount = lastCount;
    this.eventCount = eventCount;
  }

  [Symbol.iterator](): IterableIterator<EventId> {
    return this;
  }

  next(): IteratorResult<EventId> {
    if (this.lastCount >= this.eventCount) {
      return { done: true, value: undefined };
    }
    const result = new EventId(this.lastCount, 'send_batch_ids');
    this.lastCount++;
    return { done: false, value: result };
  }

  get length(): number {
    return Math.max(0, this.eventCount - this.lastCount);
  }
}
