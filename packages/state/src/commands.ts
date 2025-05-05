import { Commands, World } from '@sciurus/ecs';
import { logger } from '@sciurus/utils';
import { Trait, type } from 'rustable';
import { FreelyMutableState } from './state/freely_mutable_state';
import { NextState } from './state/resources';

export class CommandsStatesExt extends Trait {
  setState<S extends FreelyMutableState>(_state: S): void {}
}

CommandsStatesExt.implFor(Commands, {
  setState<S extends FreelyMutableState>(this: Commands, state: S): void {
    this.queue((world: World) => {
      const next = world.resourceMut(NextState(type(state))<S>);
      next.match({
        Pending: (x: S) => {
          logger.debug(`overwriting next state ${x} with ${state}`);
        },
        Unchanged: () => {},
      });
      next.to(state);
    });
  },
});
