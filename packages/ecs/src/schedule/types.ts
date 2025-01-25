import { Option, Some, stringify, Vec } from 'rustable';
import { ReadonlySystem, System } from '../system/base';
import { SystemSet } from './set';
import { DiGraph, NodeId } from './graph';
import { IntoReadonlySystem } from '../system/into';

export enum LogLevel {
  /// Occurrences are completely ignored.
  Ignore,
  /// Occurrences are logged only.
  Warn,
  /// Occurrences are logged and result in errors.
  Error,
}

export enum Chain {
  Yes,
  YesIgnoreDeferred,
  No,
}

export enum ReportCycles {
  Hierarchy,
  Dependency,
}

export class SystemNode {
  inner: Option<System>;

  constructor(system: System) {
    this.inner = Some(system);
  }

  get() {
    return this.inner;
  }
}

export class SystemSetNode {
  inner: SystemSet;

  constructor(inner: SystemSet) {
    this.inner = inner;
  }

  name() {
    return stringify(this.inner);
  }

  isSystemType() {
    return this.inner.systemType().isSome();
  }

  isAnonymous() {
    return this.inner.isAnonymous();
  }
}

export class Dag {
  constructor(
    public graph: DiGraph = new DiGraph(),
    public topsort: Vec<NodeId> = Vec.new(),
  ) {}
}

export class ScheduleBuildSettings {
  constructor(
    public ambiguityDetection: LogLevel = LogLevel.Ignore,
    public hierarchyDetection: LogLevel = LogLevel.Warn,
    public autoInsertApplyDeferred: boolean = true,
    public useShortnames: boolean = true,
    public reportSets: boolean = true,
  ) {}
}

export type Condition = ReadonlySystem<any, boolean>;

export type IntoCondition = IntoReadonlySystem<any, boolean>;

export class ProcessConfigsResult {
  constructor(
    public nodes: Vec<NodeId>,
    public denselyChained: boolean,
  ) {}
}

export class ScheduleBuildError extends Error {
  static HierarchyLoop(a: string) {
    return new ScheduleBuildError(`System set ${a} contains itself.`);
  }

  static HierarchyCycle(a: string) {
    return new ScheduleBuildError(`System set hierarchy contains cycle(s).\n${a}`);
  }

  static HierarchyRedundancy(a: string) {
    return new ScheduleBuildError(`System set hierarchy contains redundant edges.\n${a}`);
  }

  static DependencyLoop(a: string) {
    return new ScheduleBuildError(`System set ${a} depends on itself.`);
  }

  static DependencyCycle(a: string) {
    return new ScheduleBuildError(`System dependencies contain cycle(s).\n${a}`);
  }

  static CrossDependency(a: string, b: string) {
    return new ScheduleBuildError(
      `${a} and ${b} have both in_set and before-after relationships (these might be transitive). This combination is unsolvable as a system cannot run before or after a set it belongs to.`,
    );
  }

  static SetsHaveOrderButIntersect(a: string, b: string) {
    return new ScheduleBuildError(
      `${a} and ${b} have a before-after relationship (which may be transitive) but share systems`,
    );
  }

  static SystemTypeSetAmbiguity(a: string) {
    return new ScheduleBuildError(
      `Tried to order against ${a} in a schedule that has more than one ${a} instance. ${a} is a SystemTypeSet and cannot be used for ordering if ambiguous. Use a different set without this restriction.`,
    );
  }

  static Ambiguity(a: string) {
    return new ScheduleBuildError(
      `Systems with conflicting access have indeterminate run order.\n${a}`,
    );
  }

  static Uninitialized() {
    return new ScheduleBuildError(`Systems in schedule have not been initialized.`);
  }
}
