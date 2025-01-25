import { logger, NOT_IMPLEMENTED } from '@sciurus/utils';
import { trait } from 'rustable';
import { Tick } from '../change_detection/tick';
import { Access, FilteredAccessSet } from '../query/access';

/**
 * The warning policy for system parameters
 */
export enum ParamWarnPolicy {
  /// Stop app with a panic.
  Panic,
  /// No warning should ever be emitted.
  Never,
  /// The warning will be emitted once and status will update to [`Self::Never`].
  Warn,
}

export namespace ParamWarnPolicy {
  export function advance(): ParamWarnPolicy {
    return ParamWarnPolicy.Never;
  }
  export function tryWarn(paramName: string, policy: ParamWarnPolicy, name: string): void {
    switch (policy) {
      case ParamWarnPolicy.Panic:
        throw new Error(`${name} could not access system parameter ${paramName}`);
      case ParamWarnPolicy.Warn:
        logger.warn(
          `${name} did not run because it requested inaccessible system parameter ${paramName}`,
        );
        break;
      case ParamWarnPolicy.Never:
        break;
    }
  }
}

@trait
export class WithParamWarnPolicy {
  withParamWarnPolicy(_warnPolicy: ParamWarnPolicy): this {
    throw NOT_IMPLEMENTED;
  }
  warnParamMissing(): this {
    return this.withParamWarnPolicy(ParamWarnPolicy.Warn);
  }
  ignoreParamMissing(): this {
    return this.withParamWarnPolicy(ParamWarnPolicy.Never);
  }
}

/**
 * The metadata of a System
 */
export class SystemMeta {
  name: string;
  componentAccessSet: FilteredAccessSet;
  archetypeComponentAccess: Access;
  hasDeferred: boolean;
  lastRun: Tick;
  paramWarnPolicy: ParamWarnPolicy;

  constructor() {
    this.name = '';
    this.componentAccessSet = new FilteredAccessSet();
    this.archetypeComponentAccess = new Access();
    this.hasDeferred = false;
    this.lastRun = new Tick(0);
    this.paramWarnPolicy = ParamWarnPolicy.Panic;
  }

  static new(name: string): SystemMeta {
    const meta = new SystemMeta();
    meta.name = name;
    return meta;
  }

  setHasDeferred() {
    this.hasDeferred = true;
  }

  setParamWarnPolicy(warnPolicy: ParamWarnPolicy): void {
    this.paramWarnPolicy = warnPolicy;
  }

  advanceParamWarnPolicy(): void {
    this.paramWarnPolicy = ParamWarnPolicy.Never;
  }

  tryWarnParam(name: string, paramName: string): void {
    ParamWarnPolicy.tryWarn(paramName, this.paramWarnPolicy, name);
  }
}
