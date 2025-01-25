import { derive, Ptr } from 'rustable';
import { Tick } from '../change_detection';
import { Mut } from '../change_detection/mut';
import { SystemSet } from '../schedule/set';
import { condition, Local, system } from '../system';
import { OptionRes } from '../system/param';
import { World } from '../world';
import { EventRegistry, ShouldUpdateEvents } from './registry';

@derive([SystemSet])
export class EventUpdates {}

export interface EventUpdates extends SystemSet {}

export const signalEventUpdateSystem = system(
  [OptionRes(EventRegistry)],
  (signal: OptionRes<EventRegistry>): void => {
    if (signal.isSome()) {
      const registry = signal.unwrap();
      registry.shouldUpdate = ShouldUpdateEvents.Ready;
    }
  },
);

export const eventUpdateSystem = system(
  [World, Local(Tick)],
  (world: World, lastChangeTick: Ptr<Tick>): void => {
    if (world.containsResource(EventRegistry)) {
      world.resourceScope(EventRegistry, (world, registry: Mut<EventRegistry>) => {
        registry.runUpdates(world, lastChangeTick[Ptr.ptr]);
        registry.shouldUpdate =
          registry.shouldUpdate === ShouldUpdateEvents.Always
            ? ShouldUpdateEvents.Always
            : ShouldUpdateEvents.Waiting;
      });
    }
    lastChangeTick.set(world.changeTick.get());
  },
);

export const eventUpdateCondition = condition(
  [OptionRes(EventRegistry)],
  (maybeSignal: OptionRes<EventRegistry>): boolean => {
    return maybeSignal.match({
      Some: (signal) => signal.shouldUpdate !== ShouldUpdateEvents.Waiting,
      None: () => true,
    });
  },
);
