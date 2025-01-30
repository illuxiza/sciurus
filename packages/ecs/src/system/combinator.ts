import { Constructor, NotImplementedError, Trait, Type, Vec } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access } from '../query/access';
import { SystemSet } from '../schedule/set';
import { World } from '../world';
import { DeferredWorld } from '../world/deferred';
import { System } from './base';

/**
 * Customizes the behavior of a CombinatorSystem
 */
export class Combine extends Trait {
  /**
   * When used in a CombinatorSystem, this function customizes how
   * the two composite systems are invoked and their outputs are combined.
   */
  combine(_input: any, _a: (input: any) => any, _b: (input: any) => any): any {
    throw new NotImplementedError();
  }
}

/**
 * A System defined by combining two other systems.
 * The behavior of this combinator is specified by implementing the Combine trait.
 */
export class CombinatorSystem {
  private compAccess: Access = new Access();
  private archetype_component_access: Access = new Access();

  constructor(
    public a: System,
    public b: System,
    private _name: string,
  ) {}

  static new<A extends System, B extends System>(a: A, b: B, name: string): CombinatorSystem {
    return new CombinatorSystem(a, b, name);
  }

  name(): string {
    return this._name;
  }

  componentAccess(): Access {
    return this.compAccess;
  }

  archetypeComponentAccess(): Access {
    return this.archetype_component_access;
  }

  isExclusive(): boolean {
    return this.a.isExclusive() || this.b.isExclusive();
  }

  hasDeferred(): boolean {
    return this.a.hasDeferred() || this.b.hasDeferred();
  }

  runUnsafe(input: any, world: World): any {
    return (this as any).func.combine(
      input,
      (input: any) => this.a.runUnsafe(input, world),
      (input: any) => this.b.runUnsafe(input, world),
    );
  }

  run(input: any, world: World): any {
    return (this as any).func.combine(
      input,
      (input: any) => this.a.run(input, world),
      (input: any) => this.b.run(input, world),
    );
  }

  applyDeferred(world: World): void {
    this.a.applyDeferred(world);
    this.b.applyDeferred(world);
  }

  queueDeferred(world: DeferredWorld): void {
    this.a.queueDeferred(world);
    this.b.queueDeferred(world);
  }

  validateParamUnsafe(world: World): boolean {
    return this.a.validateParamUnsafe(world);
  }

  initialize(world: World): void {
    this.a.initialize(world);
    this.b.initialize(world);
    this.compAccess.extend(this.a.componentAccess());
    this.compAccess.extend(this.b.componentAccess());
  }

  updateArchetypeComponentAccess(world: World): void {
    this.a.updateArchetypeComponentAccess(world);
    this.b.updateArchetypeComponentAccess(world);

    this.archetype_component_access.extend(this.a.archetypeComponentAccess());
    this.archetype_component_access.extend(this.b.archetypeComponentAccess());
  }

  checkChangeTick(changeTick: Tick): void {
    this.a.checkChangeTick(changeTick);
    this.b.checkChangeTick(changeTick);
  }

  defaultSystemSets(): Vec<SystemSet> {
    const defaultSets = this.a.defaultSystemSets();
    defaultSets.extend(this.b.defaultSystemSets());
    return defaultSets;
  }

  getLastRun(): Tick {
    return this.a.getLastRun();
  }

  setLastRun(lastRun: Tick): void {
    this.a.setLastRun(lastRun);
    this.b.setLastRun(lastRun);
  }
}

export interface CombinatorSystem extends System {}

/**
 * A System created by piping the output of the first system into the input of the second.
 */
export class PipeSystem {
  public compAccess: Access = new Access();
  public archeCompAccess: Access = new Access();

  constructor(
    public a: System,
    public b: System,
    private _name: string,
  ) {}

  name(): string {
    return this._name;
  }
}
System.implFor(PipeSystem, {
  name(): string {
    return this.name();
  },
  type(): Constructor {
    return Type(this.a.type(), [this.b.type()]);
  },
  componentAccess(): Access {
    return this.compAccess;
  },
  archetypeComponentAccess(): Access {
    return this.archeCompAccess;
  },
  isExclusive(): boolean {
    return this.a.isExclusive() || this.b.isExclusive();
  },

  hasDeferred(): boolean {
    return this.a.hasDeferred() || this.b.hasDeferred();
  },

  runUnsafe(input: any, world: World): any {
    const value = this.a.runUnsafe(input, world);
    return this.b.runUnsafe(value, world);
  },

  run(input: any, world: World): any {
    const value = this.a.run(input, world);
    return this.b.run(value, world);
  },

  applyDeferred(world: World): void {
    this.a.applyDeferred(world);
    this.b.applyDeferred(world);
  },

  queueDeferred(world: DeferredWorld): void {
    this.a.queueDeferred(world);
    this.b.queueDeferred(world);
  },

  validateParamUnsafe(world: World): boolean {
    return this.a.validateParamUnsafe(world);
  },

  validateParam(world: World): boolean {
    return this.a.validateParam(world) && this.b.validateParam(world);
  },

  initialize(world: World): void {
    this.a.initialize(world);
    this.b.initialize(world);
    this.compAccess.extend(this.a.componentAccess());
    this.compAccess.extend(this.b.componentAccess());
  },

  updateArchetypeComponentAccess(world: World): void {
    this.a.updateArchetypeComponentAccess(world);
    this.b.updateArchetypeComponentAccess(world);

    this.archeCompAccess.extend(this.a.archetypeComponentAccess());
    this.archeCompAccess.extend(this.b.archetypeComponentAccess());
  },

  checkChangeTick(changeTick: Tick): void {
    this.a.checkChangeTick(changeTick);
    this.b.checkChangeTick(changeTick);
  },

  defaultSystemSets(): Vec<SystemSet> {
    const defaultSets = this.a.defaultSystemSets();
    defaultSets.extend(this.b.defaultSystemSets());
    return defaultSets;
  },

  getLastRun(): Tick {
    return this.a.getLastRun();
  },

  setLastRun(lastRun: Tick): void {
    this.a.setLastRun(lastRun);
    this.b.setLastRun(lastRun);
  },
});
export interface PipeSystem extends System {}
