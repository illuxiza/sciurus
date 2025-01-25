import { Constructor, hasTrait, implTrait, named, Type } from 'rustable';
import { Trigger } from '../../observer/types';
import { IntoSystemSet, SystemSet, SystemTypeSet } from '../../schedule/set';
import { IntoReadonlySystem, IntoSystem } from '../into';
import { In, SystemParam } from '../param';
import { IntoSystemParam } from '../param/base';
import { ExclusiveSystemParam } from '../param/exclusive';
import { ParamWarnPolicy, WithParamWarnPolicy } from '../types';
import { ExclusiveFunctionSystem } from './exclusive';
import { FunctionSystem } from './function';
import { ObserverFunctionSystem } from './observer';
import { FunctionReadonlySystem } from './readonly';

const typeMap = new Map<Function, Constructor>();

function funcType(func: Function) {
  let type = typeMap.get(func);
  if (!type) {
    type = class extends FunctionReadonlySystem {};
    named(func.name || 'anonymous_system')(type);
    typeMap.set(func, type);
  }
  return type;
}

export function condition<P extends readonly any[], R>(
  params: {
    [K in keyof P]: P[K] extends SystemParam | Constructor<IntoSystemParam> ? P[K] : never;
  },
  func: (
    ...args: {
      [K in keyof P]: P[K] extends SystemParam<any, infer T>
        ? T
        : P[K] extends Constructor<IntoSystemParam<infer T>>
          ? T
          : never;
    }
  ) => R,
): IntoReadonlySystem {
  return new IntoFunctionReadonlySystem(func, SystemParam.wrap(params as any));
}

export function system<P extends readonly any[], R>(
  params: {
    [K in keyof P]: P[K] extends SystemParam | Constructor<IntoSystemParam> ? P[K] : never;
  },
  func: (
    ...args: {
      [K in keyof P]: P[K] extends SystemParam<any, infer T>
        ? T
        : P[K] extends Constructor<IntoSystemParam<infer T>>
          ? T
          : never;
    }
  ) => R,
): IntoSystem & IntoSystemSet {
  if (
    params.length > 0 &&
    params.every((v) => hasTrait(v, ExclusiveSystemParam)) &&
    params[0].isWorld()
  ) {
    return new IntoExclusiveFunctionSystem(func, ExclusiveSystemParam.wrap(params.slice(1) as any));
  }
  return new IntoFunctionSystem(func, SystemParam.wrap(params as any));
}

class IntoFunctionSystem {
  constructor(
    public func: (...args: any[]) => any,
    public param: SystemParam,
  ) {}
  intoSystem() {
    return new FunctionSystem(this.func, this.param, funcType(this.func));
  }
}

implTrait(IntoFunctionSystem, IntoSystem);

interface IntoFunctionSystem extends IntoSystem {}

implTrait(IntoFunctionSystem, IntoSystemSet, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(funcType(this.func));
  },
});

interface IntoFunctionSystem extends IntoSystemSet {}

implTrait(IntoFunctionSystem, WithParamWarnPolicy, {
  withParamWarnPolicy(warnPolicy: ParamWarnPolicy): FunctionSystem {
    const system = this.intoSystem();
    system.meta.setParamWarnPolicy(warnPolicy);
    return system;
  },
});

interface IntoFunctionSystem extends WithParamWarnPolicy {}

class IntoFunctionReadonlySystem {
  constructor(
    public func: (...args: any[]) => any,
    public param: SystemParam,
  ) {}
  intoSystem() {
    return new FunctionReadonlySystem(this.func, this.param, funcType(this.func));
  }
}

implTrait(IntoFunctionReadonlySystem, IntoSystem);

implTrait(IntoFunctionReadonlySystem, IntoReadonlySystem);

interface IntoFunctionReadonlySystem extends IntoReadonlySystem {}

implTrait(IntoFunctionReadonlySystem, IntoSystemSet, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(funcType(this.func));
  },
});

interface IntoFunctionReadonlySystem extends IntoSystemSet {}

implTrait(IntoFunctionReadonlySystem, WithParamWarnPolicy, {
  withParamWarnPolicy(warnPolicy: ParamWarnPolicy): FunctionReadonlySystem {
    const system = this.intoSystem();
    system.meta.setParamWarnPolicy(warnPolicy);
    return system;
  },
});

interface IntoFunctionReadonlySystem extends WithParamWarnPolicy {}

class IntoExclusiveFunctionSystem {
  constructor(
    public func: (...args: any[]) => any,
    public param: ExclusiveSystemParam,
  ) {}
  intoSystem() {
    return new ExclusiveFunctionSystem(this.func, this.param, funcType(this.func));
  }
}

implTrait(IntoExclusiveFunctionSystem, IntoSystem);

interface IntoExclusiveFunctionSystem extends IntoSystem {}

implTrait(IntoExclusiveFunctionSystem, IntoSystemSet, {
  intoSystemSet(): SystemSet {
    return new SystemTypeSet(funcType(this.func));
  },
});

interface IntoExclusiveFunctionSystem extends IntoSystemSet {}

export function observer<E extends object, B extends object, P extends readonly any[]>(
  params: {
    [K in keyof P]: P[K] extends SystemParam | Constructor<IntoSystemParam> ? P[K] : never;
  },
  func: (
    trigger: Trigger<E, B>,
    ...args: {
      [K in keyof P]: P[K] extends SystemParam<any, infer T>
        ? T
        : P[K] extends Constructor<IntoSystemParam<infer T>>
          ? T
          : never;
    }
  ) => void,
): IntoSystem {
  return new IntoObserverFunctionSystem(func, SystemParam.wrap([In(Trigger), ...params] as any));
}

class IntoObserverFunctionSystem {
  constructor(
    public func: (...args: any[]) => any,
    public param: SystemParam,
  ) {}
  intoSystem() {
    return new ObserverFunctionSystem(this.func, this.param, funcType(this.func));
  }
}

implTrait(IntoObserverFunctionSystem, Type(IntoSystem, [Trigger]));

interface IntoObserverFunctionSystem extends IntoSystem {}
