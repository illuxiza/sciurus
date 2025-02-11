import { FromWorld, OptionRes, Resource, World } from '@sciurus/ecs';
import { Default, derive, Enum, getGenerics, None, Option, Ptr, Some, variant } from 'rustable';
import { FreelyMutableState } from './freely_mutable_state';
import { States } from './states';

@derive([Resource])
export class State<S extends States = any> {
  constructor(public s: S) {}

  get(): S {
    return this.s;
  }
}

FromWorld.implFor(State, {
  static: {
    fromWorld(this: typeof State, world: World): State {
      const generics = getGenerics(this);
      if (generics.length !== 1) {
        throw new Error(`State ${this} is not generic`);
      }
      return new State(FromWorld.wrap(generics[0]).fromWorld(world));
    },
  },
});

interface NextStateMatch<S extends FreelyMutableState, U> {
  Pending: (state: S) => U;
  Unchanged: (() => U) | U;
}

@derive([Resource])
export class NextState<S extends FreelyMutableState = any> extends Enum {
  @variant
  static Unchanged<S extends FreelyMutableState>(): NextState<S> {
    return null!;
  }
  @variant
  static Pending<S extends FreelyMutableState>(_state: S): NextState<S> {
    return null!;
  }
  match<U>(patterns: NextStateMatch<S, U>): U {
    return super.match(patterns);
  }
  set(state: S): void {
    this.replace(NextState.Pending(state));
  }
  reset(): void {
    this.replace(NextState.Unchanged());
  }
}

Default.implFor(NextState, {
  static: {
    default(this: typeof NextState): NextState {
      return NextState.Unchanged();
    },
  },
});

export function takeNextState<S extends FreelyMutableState>(
  op: OptionRes<NextState<S>>,
): Option<S> {
  if (op.isNone()) {
    return None;
  }
  const nextState = op.unwrap();
  const ptr = nextState.bypassChangeDetection();
  const value = ptr[Ptr.ptr];
  ptr[Ptr.ptr] = NextState.Unchanged();
  return value.match({
    Pending: (x: S) => {
      nextState.setChanged();
      return Some(x);
    },
    Unchanged: None,
  });
}
