import { NotImplementedError, Trait } from 'rustable';
import { AdapterSystem, AdaptFunc } from './adapt';
import { ReadonlySystem, System } from './base';
import { PipeSystem } from './combinator';

export class IntoSystem<In = any, Out = any> extends Trait {
  intoSystem(): System<In, Out> {
    throw new NotImplementedError();
  }
  pipe<B>(system: B): IntoPipeSystem<this, B> {
    return new IntoPipeSystem(this, system);
  }
  map<T>(f: (out: Out) => T): IntoAdapterSystem<AdaptFunc<In, Out, T>> {
    return new IntoAdapterSystem(new AdaptFunc(f), this);
  }
}

export class IntoReadonlySystem<In = any, Out = any> extends IntoSystem<In, Out> {
  intoReadonlySystem(): ReadonlySystem<In, Out> {
    return this.intoSystem() as ReadonlySystem;
  }
}

IntoSystem.implFor(System, {
  intoSystem(this: System): System {
    return this;
  },
});

declare module './base' {
  interface System<In = any, Out = any> extends IntoSystem<In, Out> {}
  interface ReadonlySystem<In = any, Out = any> extends IntoReadonlySystem<In, Out> {}
}

/**
 * An IntoSystem creating an instance of PipeSystem
 */
export class IntoPipeSystem<A, B> {
  constructor(
    public a: A,
    public b: B,
  ) {}
}

IntoSystem.implFor(IntoPipeSystem, {
  intoSystem(): System {
    const systemA = IntoSystem.wrap(this.a).intoSystem();
    const systemB = IntoSystem.wrap(this.b).intoSystem();
    const name = `Pipe(${systemA.name()}, ${systemB.name()})`;
    return new PipeSystem(systemA, systemB, name);
  },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface IntoPipeSystem<A, B> extends IntoSystem {}

/**
 * An IntoSystem creating an instance of AdapterSystem
 */
export class IntoAdapterSystem<Func> {
  constructor(
    public func: Func,
    public system: IntoSystem,
  ) {}
}

IntoSystem.implFor(IntoAdapterSystem<any>, {
  intoSystem(): System {
    const system = IntoSystem.wrap(this.system).intoSystem();
    const name = system.name();
    return new AdapterSystem(this.func, system, name);
  },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface IntoAdapterSystem<Func> extends IntoSystem {}
