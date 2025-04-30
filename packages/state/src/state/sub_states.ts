import { Schedule } from '@sciurus/ecs';
import { Constructor, NotImplementedError, Option } from 'rustable';
import { FreelyMutableState } from './freely_mutable_state';
import { StateSet } from './state_set';
import { States } from './states';

export class SubStates extends FreelyMutableState {
  static sourceStates(): Constructor<StateSet> {
    throw new NotImplementedError();
  }
  static shouldExist(_sources: StateSet): Option<SubStates> {
    throw new NotImplementedError();
  }
  static registerSystems(this: typeof SubStates, schedule: Schedule): void {
    StateSet.wrap(this.sourceStates()).regSubSystemsInSchedule(this, schedule);
  }
}


/**
 * Options for the subStates decorator
 */
export interface StatesOptions {
  /**
   * Whether entities scoped to this state should be automatically cleared
   * when the state is exited
   */
  scopedEntities?: boolean;

  /**
   * The source state type
   */
  source?: {
    /**
     * The type of the source state
     */
    type: Constructor<StateSet>;

    /**
     * A function that determines if this sub-state should exist based on the source state
     * Returns Some(instance) if the sub-state should exist, None otherwise
     */
    shouldExist: (source: StateSet) => Option<any>;
  };
}

/**
 * Decorator for implementing the SubStates trait
 * 
 * @param options Options for the sub-states implementation
 * @returns A decorator function
 */
export function states(options: StatesOptions = {}) {
  const isSub = options.source !== undefined;
  return function <T extends Constructor<any>>(target: T): T {
    // Implement the SubStates trait
    if (isSub) {
      SubStates.implFor(target, {
        static: {
          sourceStates(): Constructor<StateSet> {
            return options.source!.type;
          },

          shouldExist(sources: StateSet): Option<any> {
            return options.source!.shouldExist(sources);
          }
        }
      });
    }

    // Implement the States trait
    States.implFor(target, {
      static: {
        dependDepth(): number {
          // Dependency depth is source's dependency depth + 1
          const sourceDepth = isSub ? States.staticWrap(options.source!.type).dependDepth() : 0;
          return sourceDepth + 1;
        },

        scopedEntitiesEnabled(): boolean {
          return options.scopedEntities === true;
        }
      }
    });

    // Implement the FreelyMutableState trait
    FreelyMutableState.implFor(target);

    return target;
  };
}
