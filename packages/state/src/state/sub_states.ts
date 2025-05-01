import { Schedule } from '@sciurus/ecs';
import { Constructor, Default, None, NotImplementedError, Option, Some, type } from 'rustable';
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
  static regSubSystems(this: typeof SubStates, schedule: Schedule): void {
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
  source?: any;
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
    // Implement the States trait
    States.implFor(target, {
      static: {
        dependDepth(): number {
          // Dependency depth is source's dependency depth + 1
          const sourceDepth = isSub ? States.staticWrap(type(options.source!)).dependDepth() : 0;
          return sourceDepth + 1;
        },

        scopedEntitiesEnabled(): boolean {
          return options.scopedEntities === true;
        },
      },
    });

    // Implement the FreelyMutableState trait
    FreelyMutableState.implFor(target);

    // Implement the SubStates trait
    if (isSub) {
      SubStates.implFor(target, {
        static: {
          sourceStates(): Constructor<StateSet> {
            return type(options.source!);
          },

          shouldExist(sources: StateSet): Option<any> {
            if (options.source! === sources || options.source!.eq(sources)) {
              return Some(Default.staticWrap(target).default());
            }
            return None;
          },
        },
      });
    }
    return target;
  };
}
