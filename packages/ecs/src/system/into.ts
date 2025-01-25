import { TraitValid } from '@sciurus/utils';
import { implTrait, trait } from 'rustable';
import { AdapterSystem } from './adapt';
import { ReadonlySystem, System } from './base';
import { PipeSystem } from './combinator';

@trait
export class IntoSystem<In = any, Out = any> extends TraitValid {
  intoSystem(): System<In, Out> {
    throw new Error('Method not implemented.');
  }
  pipe<B>(system: B): IntoPipeSystem<this, B> {
    return IntoPipeSystem.new(this, system);
  }
  map<T>(f: (out: Out) => T): IntoAdapterSystem<typeof f> {
    return IntoAdapterSystem.new(f, this);
  }
}

@trait
export class IntoReadonlySystem<In = any, Out = any> extends IntoSystem<In, Out> {
  intoReadonlySystem(): ReadonlySystem<In, Out> {
    return this.intoSystem() as ReadonlySystem;
  }
}

implTrait(System, IntoSystem, {
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

  static new<A, B>(a: A, b: B): IntoPipeSystem<A, B> {
    return new IntoPipeSystem(a, b);
  }
}

implTrait(IntoPipeSystem, IntoSystem, {
  intoSystem(): System {
    const systemA = IntoSystem.wrap(this.a).intoSystem();
    const systemB = IntoSystem.wrap(this.b).intoSystem();
    const name = `Pipe(${systemA.name()}, ${systemB.name()})`;
    return PipeSystem.new(systemA, systemB, name);
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

  static new<Func>(func: Func, system: IntoSystem): IntoAdapterSystem<Func> {
    return new IntoAdapterSystem(func, system);
  }
}

implTrait(IntoAdapterSystem<any>, IntoSystem, {
  intoSystem(): System {
    const system = IntoSystem.wrap(this.system).intoSystem();
    const name = system.name();
    return AdapterSystem.new(this.func, system, name);
  },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface IntoAdapterSystem<Func> extends IntoSystem {}
