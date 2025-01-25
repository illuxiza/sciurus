import { Constructor, hasTrait, implTrait, named, Type } from 'rustable';
import { Trigger } from '../../observer/types';
import { IntoSystemSet, SystemTypeSet } from '../../schedule/set';
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

export type SystemParamTuple<P extends readonly any[]> = {
  [K in keyof P]: P[K] extends SystemParam | Constructor<IntoSystemParam> ? P[K] : never;
};

export type SystemParamValues<P extends readonly any[]> = {
  [K in keyof P]: P[K] extends SystemParam<any, infer T>
    ? T
    : P[K] extends Constructor<IntoSystemParam<infer T>>
      ? T
      : never;
};

export type SystemFunction<P extends readonly any[] = any, R = any> = (
  ...args: SystemParamValues<P>
) => R;

export function condition<P extends readonly any[], R>(
  params: SystemParamTuple<P>,
  func: SystemFunction<P, R>,
): IntoReadonlySystem {
  return new IntoFunctionReadonlySystem(func, SystemParam.wrap(params as any));
}

export function system<P extends readonly any[], R>(
  params: SystemParamTuple<P>,
  func: SystemFunction<P, R>,
): IntoSystem & IntoSystemSet & WithParamWarnPolicy {
  if (
    params.length > 0 &&
    params.every((v) => hasTrait(v, ExclusiveSystemParam)) &&
    params[0].isWorld()
  ) {
    return new IntoExclusiveFunctionSystem(func, ExclusiveSystemParam.wrap(params.slice(1) as any));
  }
  return new IntoFunctionSystem(func, SystemParam.wrap(params as any));
}

export function observer<P extends readonly any[], E extends object, B extends object>(
  params: SystemParamTuple<P>,
  func: (trigger: Trigger<E, B>, ...args: SystemParamValues<P>) => void,
): IntoSystem {
  return new IntoObserverFunctionSystem(func, SystemParam.wrap([In(Trigger), ...params] as any));
}

class IntoFunctionSystem {
  constructor(
    public func: SystemFunction,
    public param: SystemParam,
  ) {}
  intoSystem() {
    return new FunctionSystem(this.func, this.param, funcType(this.func));
  }
}

function implInto(constructor: Constructor) {
  implTrait(constructor, IntoSystem);

  implTrait(constructor, IntoSystemSet, {
    intoSystemSet() {
      return new SystemTypeSet(funcType(this.func));
    },
  });

  implTrait(constructor, WithParamWarnPolicy, {
    withParamWarnPolicy(warnPolicy: ParamWarnPolicy) {
      const system = this.intoSystem();
      system.meta.setParamWarnPolicy(warnPolicy);
      return system;
    },
  });
}

implInto(IntoFunctionSystem);

interface IntoFunctionSystem extends IntoSystem, IntoSystemSet, WithParamWarnPolicy {}

class IntoFunctionReadonlySystem {
  constructor(
    public func: SystemFunction,
    public param: SystemParam,
  ) {}
  intoSystem() {
    return new FunctionReadonlySystem(this.func, this.param, funcType(this.func));
  }
}

implInto(IntoFunctionReadonlySystem);

implTrait(IntoFunctionReadonlySystem, IntoReadonlySystem);

interface IntoFunctionReadonlySystem
  extends IntoReadonlySystem,
    IntoSystemSet,
    WithParamWarnPolicy {}

class IntoExclusiveFunctionSystem {
  constructor(
    public func: SystemFunction,
    public param: ExclusiveSystemParam,
  ) {}
  intoSystem() {
    return new ExclusiveFunctionSystem(this.func, this.param, funcType(this.func));
  }
}

implInto(IntoExclusiveFunctionSystem);

interface IntoExclusiveFunctionSystem extends IntoSystem, IntoSystemSet, WithParamWarnPolicy {}

class IntoObserverFunctionSystem {
  constructor(
    public func: (trigger: Trigger<any, any>, ...args: any[]) => any,
    public param: SystemParam,
  ) {}
  intoSystem() {
    return new ObserverFunctionSystem(this.func, this.param, funcType(this.func));
  }
}

implTrait(IntoObserverFunctionSystem, Type(IntoSystem, [Trigger]));

interface IntoObserverFunctionSystem extends IntoSystem {}
