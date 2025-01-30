import { Constructor, HashMap, Ptr, Trait, Vec } from 'rustable';
import { ComponentId } from '../component';
import { Entity } from '../entity/base';
import { DeferredWorld } from '../world/deferred';

export class Trigger<E, B extends object = {}> {
  constructor(
    public event: E,
    private __propagate: Ptr<boolean>,
    public trigger: ObserverTrigger,
    public marker: Constructor<B>,
  ) {}

  static new<E, B extends object = {}>(
    event: E,
    propagate: Ptr<boolean>,
    trigger: ObserverTrigger,
  ): Trigger<E, B> {
    return new Trigger(event, propagate, trigger, undefined as any);
  }

  get eventType(): ComponentId {
    return this.trigger.eventType;
  }

  get target(): Entity {
    return this.trigger.target;
  }

  get components(): Vec<ComponentId> {
    return this.trigger.components;
  }

  get observer(): Entity {
    return this.trigger.observer;
  }

  propagate(shouldPropagate: boolean): void {
    this.__propagate[Ptr.ptr] = shouldPropagate;
  }

  getPropagate(): boolean {
    return this.__propagate[Ptr.ptr];
  }
}

export class TriggerTargets extends Trait {
  /** The components the trigger should target. */
  components(): Vec<ComponentId> {
    return Vec.new();
  }

  /** The entities the trigger should target. */
  entities(): Vec<Entity> {
    return Vec.new();
  }
}

TriggerTargets.implFor(Entity, {
  entities(): Vec<Entity> {
    return Vec.from([this]);
  },
});

TriggerTargets.implFor(Number, {
  components(): Vec<ComponentId> {
    return Vec.from([this.valueOf()]);
  },
});

TriggerTargets.implFor(Array, {
  components(): Vec<ComponentId> {
    return Vec.from<number>(
      this.filter((c) => c !== undefined && Number.isInteger(c)).map((c) => c as number),
    );
  },
  entities(): Vec<Entity> {
    return Vec.from(
      this.filter((e) => e !== undefined && e instanceof Entity).map((e) => e as Entity),
    );
  },
});

export type ObserverRunner = (
  world: DeferredWorld,
  trigger: ObserverTrigger,
  data: any,
  propagate: Ptr<boolean>,
) => void;

export class ObserverDescriptor {
  constructor(
    public events: Vec<ComponentId> = Vec.new(),
    public components: Vec<ComponentId> = Vec.new(),
    public entities: Vec<Entity> = Vec.new(),
  ) {}

  withEvents(events: Vec<ComponentId>): ObserverDescriptor {
    this.events = events;
    return this;
  }

  withComponents(components: Vec<ComponentId>): ObserverDescriptor {
    this.components = components;
    return this;
  }

  withEntities(entities: Vec<Entity>): ObserverDescriptor {
    this.entities = entities;
    return this;
  }

  merge(descriptor: ObserverDescriptor): void {
    this.events.extend(descriptor.events.iter());
    this.components.extend(descriptor.components.iter());
    this.entities.extend(descriptor.entities.iter());
  }
}

export type ObserverMap = HashMap<Entity, ObserverRunner>;
export class ObserverTrigger {
  constructor(
    /** The Entity of the observer handling the trigger. */
    public observer: Entity,
    /** The Event the trigger targeted. */
    public eventType: ComponentId,
    /** The ComponentIds the trigger targeted. */
    public components: Vec<ComponentId>,
    /** The entity the trigger targeted. */
    public target: Entity,
  ) {}
}
export class CachedComponentObservers {
  constructor(
    // Observers listening to triggers targeting this component
    public map: ObserverMap = new HashMap(),
    // Observers listening to triggers targeting this component on a specific entity
    public entityMap: HashMap<Entity, ObserverMap> = new HashMap(),
  ) {}
}

export class CachedObservers {
  constructor(
    // Observers listening for any time this trigger is fired
    public map: ObserverMap = new HashMap(),
    // Observers listening for this trigger fired at a specific component
    public componentObservers: HashMap<ComponentId, CachedComponentObservers> = new HashMap(),
    // Observers listening for this trigger fired at a specific entity
    public entityObservers: HashMap<Entity, ObserverMap> = new HashMap(),
  ) {}
}
