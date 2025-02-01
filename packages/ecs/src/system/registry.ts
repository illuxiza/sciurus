import { Constructor, createFactory, derive, Eq, Type } from 'rustable';
import { Component, Resource } from '../component';
import { Entity } from '../entity';
import { System } from './base';

@derive([Component])
export class RegisteredSystem<I = any, O = any> {
  constructor(
    public system: System<I, O>,
    public initialized: boolean = false,
  ) {}

  public static new<I = any, O = any>(system: System<I, O>): RegisteredSystem<I, O> {
    return new RegisteredSystem(system);
  }
}

export class RemovedSystem<I = any, O = any> {
  constructor(
    public system: System<I, O>,
    public initialized: boolean = false,
  ) {}

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getSystem(): System<I, O> {
    return this.system;
  }
}

@derive([Eq])
export class SystemId<I = any, O = any> {
  constructor(
    public entity: Entity,
    public hash: number = 0,
  ) {}

  clone(): SystemId<I, O> {
    return this;
  }

  toString(): string {
    return `SystemId:${this.entity.idx}`;
  }
}

@derive([Resource])
export class CachedSystemIdType<I = any, O = any> {
  constructor(public systemId: SystemId<I, O>) {}
}

export function cachedSystemIdType<I = any, O = any>(
  system: Constructor,
): Constructor<CachedSystemIdType<I, O>> {
  return Type(CachedSystemIdType, [system]);
}

export const CachedSystemId = createFactory(
  CachedSystemIdType,
  cachedSystemIdType,
) as typeof CachedSystemIdType & {
  <I = any, O = any>(system: Constructor): Constructor<CachedSystemIdType<I, O>>;
};

export interface CachedSystemId<I = any, O = any> extends CachedSystemIdType<I, O> {}

export class RegisteredSystemError extends Error {
  static SystemIdNotRegistered(systemId: SystemId): RegisteredSystemError {
    return new RegisteredSystemError(`System ${systemId} was not registered`);
  }

  static SystemNotCached(): RegisteredSystemError {
    return new RegisteredSystemError('Cached system was not found');
  }

  static Recursive(systemId: SystemId): RegisteredSystemError {
    return new RegisteredSystemError(`System ${systemId} tried to run itself recursively`);
  }

  static SelfRemove(systemId: SystemId): RegisteredSystemError {
    return new RegisteredSystemError(`System ${systemId} tried to remove itself`);
  }

  static InvalidParams(systemId: SystemId): RegisteredSystemError {
    return new RegisteredSystemError(
      `The data required by the system ${systemId} was not found in the world and the system did not run due to failed parameter validation.`,
    );
  }
}
