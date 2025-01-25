import { None, Option, Some } from 'rustable';
import { type World } from '../world/base';
import { SystemMeta } from './types';

/**
 * Holds on to persistent state required to drive SystemParam for a System.
 *
 * This is a powerful and convenient tool for working with exclusive world access,
 * allowing you to fetch data from the World as if you were running a System.
 */
export class State<P> {
  public state: Option<P>;
  public meta: SystemMeta;
  public worldId: Option<number>;
  public archetypeGeneration: number;

  constructor(name: string) {
    this.state = None;
    this.meta = SystemMeta.new(name);
    this.worldId = None;
    this.archetypeGeneration = 0;
  }

  /**
   * Creates a new State with default state.
   */
  static new<P>(world: World, name: string): State<P> {
    const state = new State<P>(name);
    state.initialize(world);
    return state;
  }

  /**
   * Returns true if worldId matches the World that was used to call State::new.
   * Otherwise, this returns false.
   */
  matchesWorld(worldId: number): boolean {
    return this.worldId.mapOr(false, (id) => id === worldId);
  }

  /**
   * Asserts that the State matches the provided world.
   */
  validateWorld(worldId: number): void {
    if (!this.matchesWorld(worldId)) {
      throw new Error(
        `Encountered a mismatched World. This State was created from ${this.worldId.unwrap()}, but a method was called using ${worldId}.`,
      );
    }
  }

  /**
   * Initializes the system state.
   */
  initialize(world: World): void {
    if (this.worldId.isSome()) {
      if (this.worldId.unwrap() !== world.id) {
        throw new Error('System built with a different world than the one it was added to.');
      }
    } else {
      this.state = Some(this.initParams(world));
      this.worldId = Some(world.id);
    }
    this.meta.lastRun = world.changeTick;
  }

  /**
   * Initialize system parameters.
   */
  protected initParams(_world: World): P {
    // This needs to be implemented by derived classes
    throw new Error('initParams must be implemented');
  }
}
