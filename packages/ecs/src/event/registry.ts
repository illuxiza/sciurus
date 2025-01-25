import { Constructor, derive, Vec } from 'rustable';
import { Tick } from '../change_detection';
import { MutUntyped } from '../change_detection/mut';
import { ComponentId, Resource } from '../component';
import { World } from '../world';
import { Events } from './collection';

class RegisteredEvent {
  constructor(
    public componentId: ComponentId,
    public update: (ptr: MutUntyped) => void,
    public previouslyUpdated = false,
  ) {}
}

export enum ShouldUpdateEvents {
  Always,
  Waiting,
  Ready,
}

@derive([Resource])
export class EventRegistry {
  shouldUpdate: ShouldUpdateEvents = ShouldUpdateEvents.Always;
  private eventUpdates: Vec<RegisteredEvent> = Vec.new();

  static registerEvent<T extends object>(event: Constructor<T>, world: World): void {
    const componentId = world.initResource(Events(event), 'EventRegistry');
    const registry = world.getResourceOrInit(EventRegistry);
    registry.eventUpdates.push(
      new RegisteredEvent(componentId, (ptr) => {
        ptr.withType<Events<T>>().bypassChangeDetection().update();
      }),
    );
  }

  runUpdates(world: World, lastChangeTick: Tick): void {
    for (const registeredEvent of this.eventUpdates) {
      const events = world.getResourceMutById(registeredEvent.componentId);
      if (events.isSome()) {
        const hasChanged = events.unwrap().hasChangedSince(lastChangeTick);
        if (registeredEvent.previouslyUpdated || hasChanged) {
          registeredEvent.update(events.unwrap());
          registeredEvent.previouslyUpdated = hasChanged || !registeredEvent.previouslyUpdated;
        }
      }
    }
  }

  static deregisterEvents<T extends object>(event: Constructor<T>, world: World): void {
    const componentId = world.initResource(Events(event));
    const registry = world.getResourceOrInit<EventRegistry>(EventRegistry);
    registry.eventUpdates = registry.eventUpdates
      .iter()
      .filter((e) => e.componentId !== componentId)
      .collectInto((v) => Vec.from(v));
    world.removeResource(Events(event));
  }
}
