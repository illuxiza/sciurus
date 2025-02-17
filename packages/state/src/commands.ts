import { Commands, World } from '@sciurus/ecs';
import { logger } from '@sciurus/utils';
import { Trait, type, Type } from 'rustable';
import { FreelyMutableState } from './state/freely_mutable_state';
import { NextState } from './state/resources';

export class CommandsStatesExt extends Trait {
  setState<S extends FreelyMutableState>(_state: S): void {}
}

CommandsStatesExt.implFor(Commands, {
  setState<S extends FreelyMutableState>(this: Commands, state: S): void {
    this.queue((world: World) => {
      const next = world.resourceMut(Type(NextState<S>, [type(state)]));
      next.match({
        Pending: (x: S) => {
          logger.debug(`overwriting next state ${x} with ${state}`);
        },
        Unchanged: () => {},
      });
      next.get().set(state);
    });
  },
});
