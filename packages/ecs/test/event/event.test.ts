import { Schedule } from '../../../ecs/src/schedule/base';
import { system } from '../../../ecs/src/system';
import { deepClone, derive, None, Option, Some } from 'rustable';
import { Event, EventCursor, EventReader, EventRegistry, Events } from '../../src/event';
import { World } from '../../src/world';

@derive([Event])
class TestEvent {
  constructor(public i: number) {}
}

@derive([Event])
class EmptyTestEvent {
  constructor() {}
}

function getEvents<E extends object>(events: Events<E>, cursor: EventCursor<E>): E[] {
  return cursor
    .read(events)
    .iter()
    .map((e) => deepClone(e))
    .collect();
}

describe('Events', () => {
  test('basic event functionality', () => {
    const events = new Events(TestEvent);
    const event0 = new TestEvent(0);
    const event1 = new TestEvent(1);
    const event2 = new TestEvent(2);

    // This reader will miss event0 and event1 because it won't read them over two updates
    const readerMissed = events.getCursor();
    const readerA = events.getCursor();

    events.send(event0);

    expect(getEvents(events, readerA)).toEqual([event0]);
    expect(getEvents(events, readerA)).toEqual([]);

    const readerB = events.getCursor();
    expect(getEvents(events, readerB)).toEqual([event0]);
    expect(getEvents(events, readerB)).toEqual([]);

    events.send(event1);
    const readerC = events.getCursor();

    expect(getEvents(events, readerC)).toEqual([event0, event1]);
    expect(getEvents(events, readerC)).toEqual([]);
    expect(getEvents(events, readerA)).toEqual([event1]);

    events.update();
    const readerD = events.getCursor();
    events.send(event2);

    expect(getEvents(events, readerA)).toEqual([event2]);
    expect(getEvents(events, readerB)).toEqual([event1, event2]);
    expect(getEvents(events, readerD)).toEqual([event0, event1, event2]);

    events.update();
    expect(getEvents(events, readerMissed)).toEqual([event2]);
  });

  test('clear and read events', () => {
    const events = new Events(TestEvent);
    const reader = events.getCursor();

    expect(reader.read(events).iter().collect()).toEqual([]);

    events.send(new TestEvent(0));
    expect(
      reader
        .read(events)
        .iter()
        .collect()
        .map((e) => e.i),
    ).toEqual([0]);
    expect(reader.read(events).iter().collect()).toEqual([]);

    events.send(new TestEvent(1));
    events.clear();
    expect(reader.read(events).iter().collect()).toEqual([]);

    events.send(new TestEvent(2));
    events.update();
    events.send(new TestEvent(3));

    expect(
      reader
        .read(events)
        .iter()
        .collect()
        .map((e) => e.i),
    ).toEqual([2, 3]);
  });

  test('drain and read events', () => {
    const events = new Events(TestEvent);
    const reader = events.getCursor();

    expect(reader.read(events).iter().collect()).toEqual([]);

    events.send(new TestEvent(0));
    expect(
      reader
        .read(events)
        .iter()
        .collect()
        .map((e) => e.i),
    ).toEqual([0]);
    expect(reader.read(events).iter().collect()).toEqual([]);

    events.send(new TestEvent(1));
    const drained = events
      .drain()
      .collect()
      .map((e) => e.i);
    expect(drained).toEqual([0, 1]);
    expect(reader.read(events).iter().collect()).toEqual([]);

    events.send(new TestEvent(2));
    events.update();
    events.send(new TestEvent(3));

    expect(
      reader
        .read(events)
        .iter()
        .collect()
        .map((e) => e.i),
    ).toEqual([2, 3]);
  });

  test('send default event', () => {
    const events = new Events(EmptyTestEvent);
    events.sendDefault();

    const reader = events.getCursor();
    expect(reader.read(events).iter().collect()).toHaveLength(1);
  });

  test('send event ids', () => {
    const events = new Events(TestEvent);
    const event0 = new TestEvent(0);
    const event1 = new TestEvent(1);
    const event2 = new TestEvent(2);

    const event0Id = events.send(event0);
    const eventFromId = events.getEvent(event0Id.id);
    expect(eventFromId.unwrap()[0].i).toBe(event0.i);

    const eventIds = events.sendBatch([event1, event2]);
    let id = eventIds.next();
    expect(id.done).toBe(false);
    if (!id.done) {
      const event = events.getEvent(id.value.id);
      expect(event.unwrap()[0].i).toBe(event1.i);
    }

    id = eventIds.next();
    expect(id.done).toBe(false);
    if (!id.done) {
      const event = events.getEvent(id.value.id);
      expect(event.unwrap()[0].i).toBe(event2.i);
    }

    id = eventIds.next();
    expect(id.done).toBe(true);
  });

  test('event registry can add and remove events to world', () => {
    const world = new World();
    EventRegistry.registerEvent(TestEvent, world);
    expect(world.getResource(Events(TestEvent))!.isSome()).toBeTruthy();

    EventRegistry.deregisterEvents(TestEvent, world);
    expect(world.getResource(Events(TestEvent))!.isSome()).toBeFalsy();
  });

  test('events update drain', () => {
    const events = new Events(TestEvent);
    const reader = events.getCursor();

    events.send(new TestEvent(0));
    events.send(new TestEvent(1));
    expect(reader.read(events).iter().collect()).toHaveLength(2);

    let oldEvents = Array.from(events.updateDrain());
    expect(oldEvents).toHaveLength(0);

    events.send(new TestEvent(2));
    expect(reader.read(events).iter().collect()).toHaveLength(1);

    oldEvents.push(...events.updateDrain());
    expect(oldEvents).toHaveLength(2);

    oldEvents.push(...events.updateDrain());
    expect(oldEvents.map((e) => e.i)).toEqual([0, 1, 2]);
  });

  test('events empty check', () => {
    const events = new Events(TestEvent);
    expect(events.isEmpty()).toBe(true);

    events.send(new TestEvent(0));
    expect(events.isEmpty()).toBe(false);

    events.update();
    expect(events.isEmpty()).toBe(false);

    // Events are only empty after second update due to double buffering
    events.update();
    expect(events.isEmpty()).toBe(true);
  });

  test('events extend implementation', () => {
    const events = new Events(TestEvent);
    const reader = events.getCursor();

    events.extend([new TestEvent(0), new TestEvent(1)]);
    expect(
      reader
        .read(events)
        .iter()
        .collect()
        .map((e) => e.i),
    ).toEqual([0, 1]);
  });
});

describe('EventCursor', () => {
  test('cursor read functionality', () => {
    const events = new Events(TestEvent);
    const cursor = events.getCursor();
    expect(cursor.read(events).next().done).toBe(true);

    events.send(new TestEvent(0));
    const sentEvent = cursor.read(events).next();
    expect(sentEvent.done).toBe(false);
    expect(sentEvent.value?.i).toBe(0);
    expect(cursor.read(events).next().done).toBe(true);

    events.send(new TestEvent(2));
    const nextEvent = cursor.read(events).next();
    expect(nextEvent.done).toBe(false);
    expect(nextEvent.value?.i).toBe(2);
    expect(cursor.read(events).next().done).toBe(true);

    events.clear();
    expect(cursor.read(events).next().done).toBe(true);
  });

  test('cursor read mut functionality', () => {
    const events = new Events(TestEvent);
    const writeCursor = events.getCursor();
    const readCursor = events.getCursor();
    expect(writeCursor.read(events).next().done).toBe(true);
    expect(readCursor.read(events).next().done).toBe(true);

    events.send(new TestEvent(0));
    const sentEvent = writeCursor.read(events).next();
    expect(sentEvent.done).toBe(false);
    if (!sentEvent.done) {
      sentEvent.value.i = 1;
      const readEvent = readCursor.read(events).next();
      expect(readEvent.done).toBe(false);
      expect(readEvent.value?.i).toBe(1);
    }
    expect(readCursor.read(events).next().done).toBe(true);

    events.send(new TestEvent(2));
    const nextEvent = writeCursor.read(events).next();
    expect(nextEvent.done).toBe(false);
    if (!nextEvent.done) {
      nextEvent.value.i = 3;
      const readEvent = readCursor.read(events).next();
      expect(readEvent.done).toBe(false);
      expect(readEvent.value?.i).toBe(3);
    }
    expect(readCursor.read(events).next().done).toBe(true);

    events.clear();
    expect(writeCursor.read(events).next().done).toBe(true);
    expect(readCursor.read(events).next().done).toBe(true);
  });

  test('cursor clear functionality', () => {
    const events = new Events(TestEvent);
    const reader = events.getCursor();

    events.send(new TestEvent(0));
    expect(reader.len(events)).toBe(1);
    reader.clear(events);
    expect(reader.len(events)).toBe(0);
  });

  test('cursor length with updates', () => {
    const events = new Events(TestEvent);
    events.send(new TestEvent(0));
    events.send(new TestEvent(0));
    const reader = events.getCursor();
    expect(reader.len(events)).toBe(2);

    events.update();
    events.send(new TestEvent(0));
    expect(reader.len(events)).toBe(3);

    events.update();
    expect(reader.len(events)).toBe(1);

    events.update();
    expect(reader.isEmpty(events)).toBe(true);
  });

  test('cursor length current', () => {
    const events = new Events(TestEvent);
    events.send(new TestEvent(0));
    const reader = events.getCursorCurrent();
    expect(reader.isEmpty(events)).toBe(true);

    events.send(new TestEvent(0));
    expect(reader.len(events)).toBe(1);
    expect(reader.isEmpty(events)).toBe(false);
  });

  test('cursor iterator length updates', () => {
    const events = new Events(TestEvent);
    events.send(new TestEvent(0));
    events.send(new TestEvent(1));
    events.send(new TestEvent(2));

    const reader = events.getCursor();
    const iter = reader.read(events);
    expect(iter.len()).toBe(3);

    iter.next();
    expect(iter.len()).toBe(2);

    iter.next();
    expect(iter.len()).toBe(1);

    iter.next();
    expect(iter.len()).toBe(0);
  });

  test('cursor length empty and filled', () => {
    const events = new Events(TestEvent);
    expect(events.getCursor().len(events)).toBe(0);
    expect(events.getCursor().isEmpty(events)).toBe(true);

    events.send(new TestEvent(0));
    expect(events.getCursor().len(events)).toBe(1);
    expect(events.getCursor().isEmpty(events)).toBe(false);
  });

  test('event cursor parallel read', () => {
    const world = new World();
    world.initResource(Events(TestEvent));

    const events = world.resource(Events(TestEvent));

    for (let i = 0; i < 100; i++) {
      world.sendEvent(new TestEvent(1));
    }

    const counter = { value: 0 };
    const cursor = events.getCursor();

    cursor
      .read(events)
      .iter()
      .forEach((event) => {
        counter.value += event.i;
      });

    expect(counter.value).toBe(100);

    counter.value = 0;
    cursor
      .read(events)
      .iter()
      .forEach((event) => {
        counter.value += event.i;
      });

    expect(counter.value).toBe(0);
  });

  test('event cursor parallel read mut', () => {
    const world = new World();
    world.initResource(Events(TestEvent));

    const events = world.resource(Events(TestEvent));

    for (let i = 0; i < 100; i++) {
      world.sendEvent(new TestEvent(1));
    }

    const counter = { value: 0 };
    const cursor = events.getCursor();

    cursor
      .read(events)
      .iter()
      .forEach((event) => {
        event.i += 1;
        counter.value += event.i;
      });

    expect(counter.value).toBe(200);

    counter.value = 0;
    cursor
      .read(events)
      .iter()
      .forEach((event) => {
        counter.value += event.i;
      });

    expect(counter.value).toBe(0);
  });

  test('event reader iter last', () => {
    const world = new World();
    world.initResource(Events(TestEvent));

    const reader = system(
      [EventReader(TestEvent)],
      (events: EventReader<TestEvent>): Option<TestEvent> => {
        return events.read().iter().last();
      },
    ).intoSystem();

    reader.initialize(world);
    let last = reader.run([], world);
    expect(last).toBe(None);

    world.sendEvent(new TestEvent(0));
    last = reader.run([], world);
    expect(last).toEqual(Some(new TestEvent(0)));

    world.sendEvent(new TestEvent(1));
    world.sendEvent(new TestEvent(2));
    world.sendEvent(new TestEvent(3));
    last = reader.run([], world);
    expect(last).toEqual(Some(new TestEvent(3)));

    last = reader.run([], world);
    expect(last).toBe(None);
  });

  test('event reader iter nth', () => {
    const world = new World();
    world.initResource(Events(TestEvent));

    world.sendEvent(new TestEvent(0));
    world.sendEvent(new TestEvent(1));
    world.sendEvent(new TestEvent(2));
    world.sendEvent(new TestEvent(3));
    world.sendEvent(new TestEvent(4));

    const schedule = new Schedule();
    schedule.addSystems(
      system([EventReader(TestEvent)], (events: EventReader<TestEvent>) => {
        let iter = events.read().iter();
        expect(iter.next()).toEqual(Some(new TestEvent(0)));
        expect(iter.nth(2)).toEqual(Some(new TestEvent(3)));
        expect(iter.nth(1)).toBe(None);
        expect(events.isEmpty()).toBe(true);
      }),
    );
    schedule.run(world);
  });
});
