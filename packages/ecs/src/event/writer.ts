import { Constructor, createFactory, Default, derive } from 'rustable';
import { Res, SystemParam } from '../system/param';
import { EventId } from './base';
import { Events, SendBatchIds } from './collection';

@derive([Default])
export class EventWriterInner<E extends object> {
  events: Events<E>;

  constructor(events: Events<E>) {
    this.events = events;
  }

  send(event: E): EventId {
    return this.events.send(event);
  }

  sendBatch(events: Iterable<E>): SendBatchIds {
    return this.events.sendBatch(events);
  }

  sendDefault(): EventId {
    return this.events.sendDefault();
  }
}

@derive([SystemParam])
export class EventWriterParam<E extends object> {
  constructor(public eventType: Constructor<E>) {}
  getOptions() {
    return {
      events: Res(Events(this.eventType)),
    };
  }

  static getTargetType() {
    return EventWriterInner;
  }
}

export interface EventWriterParam<E extends object> extends SystemParam<any, EventWriter<E>> {}

export interface EventWriter<E extends object> extends EventWriterInner<E> {}

export const EventWriter = createFactory(
  EventWriterInner,
  (eventType: Constructor) => new EventWriterParam(eventType),
) as typeof EventWriterInner & {
  <E extends object>(eventType: Constructor<E>): EventWriterParam<E>;
};
