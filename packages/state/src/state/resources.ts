import { FromWorld, OptionRes, Resource, World } from '@sciurus/ecs';
import {
  Constructor,
  createFactory,
  Default,
  derive,
  Enum,
  getGenerics,
  None,
  Option,
  Ptr,
  Some,
  Type,
  variant,
} from 'rustable';
import { FreelyMutableState } from './freely_mutable_state';
import { States } from './states';

@derive([Resource])
class StateRes<S extends States = any> {
  constructor(public val: S) {}

  get(): S {
    return this.val;
  }
}

export const State = createFactory(StateRes, (type: Constructor) => {
  return Type(StateRes, [type]);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface State<S extends States = any> extends StateRes {}

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
class NextStateEnum<S extends FreelyMutableState = any> extends Enum {
  @variant
  static Unchanged<S extends FreelyMutableState>(): NextStateEnum<S> {
    return null!;
  }
  @variant
  static Pending<S extends FreelyMutableState>(_state: S): NextStateEnum<S> {
    return null!;
  }
  match<U>(patterns: NextStateMatch<S, U>): U {
    return super.match(patterns);
  }
  to(state: S): void {
    this.replace(NextStateEnum.Pending(state));
  }
  reset(): void {
    this.replace(NextStateEnum.Unchanged());
  }
}

Default.implFor(NextStateEnum, {
  static: {
    default(this: typeof NextStateEnum): NextStateEnum {
      return NextStateEnum.Unchanged();
    },
  },
});

export const NextState = createFactory(NextStateEnum, (stateType: Constructor) => {
  const type = Type(NextStateEnum, [stateType]);
  type.Pending = (state) => new type('Pending', state);
  type.Unchanged = () => new type('Unchanged');
  type.prototype.to = function (state) {
    this.replace(type.Pending(state));
  };
  type.prototype.reset = function () {
    this.replace(type.Unchanged());
  };
  return type;
});

export interface NextState<S extends FreelyMutableState = any> extends NextStateEnum<S> {}

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
