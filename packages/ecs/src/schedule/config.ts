import { Enum, NotImplementedError, Trait, variant, Vec } from 'rustable';
import { IntoSystem } from '../system';
import { System } from '../system/base';
import { Ambiguity, DependencyKind, GraphInfo } from './graph';
import { IntoSystemSet, SystemSet } from './set';
import { Chain, Condition, IntoCondition } from './types';

export const ambiguousWith = (graphInfo: GraphInfo, set: SystemSet) => {
  const ambiguity = graphInfo.ambiguousWith;
  ambiguity.match({
    Check: () => {
      graphInfo.ambiguousWith = Ambiguity.IgnoreWithSet(Vec.from([set]));
    },
    IgnoreWithSet: (ambiguousWith) => {
      ambiguousWith.push(set);
    },
    IgnoreAll: () => {},
  });
};

export class NodeConfig<T> {
  constructor(
    public node: T,
    public graphInfo: GraphInfo = new GraphInfo(),
    public conditions: Vec<Condition> = Vec.new(),
  ) {}
}

export class SystemConfig extends NodeConfig<System> {}
export class SystemSetConfig extends NodeConfig<SystemSet> {}

export enum NodeConfigsType {
  NodeConfig,
  Configs,
}

interface NodeConfigsMatch<T, U> {
  NodeConfig: (config: NodeConfig<T>) => U;
  Configs: (
    configs: Vec<NodeConfigs<T>>,
    collectiveConditions: Vec<Condition>,
    chained: Chain,
  ) => U;
}

export class NodeConfigs<T> extends Enum {
  constructor(name: string, ...args: any[]) {
    super(name, ...args);
  }
  @variant
  static NodeConfig<T>(_config: NodeConfig<T>): NodeConfigs<T> {
    return null!;
  }

  @variant
  static Configs<T>(
    _configs: Vec<NodeConfigs<T>>,
    _collectiveConditions: Vec<Condition>,
    _chained: Chain,
  ): NodeConfigs<T> {
    return null!;
  }

  match<U>(patterns: NodeConfigsMatch<T, U>): U {
    return super.match(patterns);
  }

  inSet<S extends object>(set: S) {
    this.match({
      NodeConfig: (config) => {
        config.graphInfo.hierarchy.push(IntoSystemSet.wrap(set).intoSystemSet());
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.inSet(set);
        }
      },
    });
    return this;
  }

  before<T>(intoSet: T) {
    const set = IntoSystemSet.wrap(intoSet).intoSystemSet();
    this.match({
      NodeConfig: (config) => {
        config.graphInfo.dependencies.push({ kind: DependencyKind.Before, set });
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.before(set);
        }
      },
    });
    return this;
  }

  after<T>(intoSet: T) {
    const set = IntoSystemSet.wrap(intoSet).intoSystemSet();
    this.match({
      NodeConfig: (config) => {
        config.graphInfo.dependencies.push({ kind: DependencyKind.After, set });
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.after(set);
        }
      },
    });
    return this;
  }

  beforeIgnoreDeferred<T>(intoSet: T) {
    const set = IntoSystemSet.wrap(intoSet).intoSystemSet();
    this.match({
      NodeConfig: (config) => {
        config.graphInfo.dependencies.push({ kind: DependencyKind.BeforeNoSync, set });
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.beforeIgnoreDeferred(set);
        }
      },
    });
    return this;
  }

  afterIgnoreDeferred<T>(intoSet: T) {
    const set = IntoSystemSet.wrap(intoSet).intoSystemSet();
    this.match({
      NodeConfig: (config) => {
        config.graphInfo.dependencies.push({ kind: DependencyKind.AfterNoSync, set });
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.afterIgnoreDeferred(set);
        }
      },
    });
    return this;
  }

  distributiveRunIf<T extends IntoCondition>(condition: T) {
    this.match({
      NodeConfig: (config) => {
        config.conditions.push(condition.intoReadonlySystem());
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.distributiveRunIf(condition);
        }
      },
    });
    return this;
  }

  ambiguousWith<T>(intoSet: T) {
    const set = IntoSystemSet.wrap(intoSet).intoSystemSet();
    this.match({
      NodeConfig: (config) => {
        ambiguousWith(config.graphInfo, set);
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.ambiguousWith(set);
        }
      },
    });
    return this;
  }

  ambiguousWithAll() {
    this.match({
      NodeConfig: (config) => {
        config.graphInfo.ambiguousWith = Ambiguity.IgnoreAll();
      },
      Configs: (configs) => {
        for (const config of configs) {
          config.ambiguousWithAll();
        }
      },
    });
    return this;
  }

  runIf<T extends IntoCondition>(condition: T) {
    this.match({
      NodeConfig: (config) => {
        config.conditions.push(condition.intoReadonlySystem());
      },
      Configs: (_configs, collectiveConditions) => {
        collectiveConditions.push(condition.intoReadonlySystem());
      },
    });
    return this;
  }

  chain() {
    this.modify({
      Configs: (configs, collectiveConditions, _chained) => {
        return [configs, collectiveConditions, Chain.Yes];
      },
      NodeConfig: (config) => {
        return [config];
      },
    });
    return this;
  }

  chainIgnoreDeferred() {
    this.modify({
      Configs: (configs, collectiveConditions, _chained) => {
        return [configs, collectiveConditions, Chain.YesIgnoreDeferred];
      },
      NodeConfig: (config) => {
        return [config];
      },
    });
    return this;
  }
}

export type SystemConfigs = NodeConfigs<System>;

export namespace SystemConfigs {
  export function newSystem(system: System): SystemConfigs {
    const sets = Vec.from(system.defaultSystemSets().iter());
    return NodeConfigs.NodeConfig(new SystemConfig(system, new GraphInfo(sets), Vec.new()));
  }
}

export type SystemSetConfigs = NodeConfigs<SystemSet>;

export namespace SystemSetConfigs {
  export function newSet(set: SystemSet): SystemSetConfigs {
    if (!set.systemType().isNone()) {
      throw new Error('configuring system type sets is not allowed');
    }
    return NodeConfigs.NodeConfig(new SystemSetConfig(set, new GraphInfo(), Vec.new()));
  }
}

export class IntoConfigs<T> extends Trait {
  intoConfigs(): NodeConfigs<T> {
    throw new NotImplementedError();
  }

  inSet(set: IntoSystemSet): NodeConfigs<T> {
    return this.intoConfigs().inSet(set);
  }

  before(set: IntoSystemSet): NodeConfigs<T> {
    return this.intoConfigs().before(set);
  }

  after(set: IntoSystemSet): NodeConfigs<T> {
    return this.intoConfigs().after(set);
  }

  beforeIgnoreDeferred(set: IntoSystemSet): NodeConfigs<T> {
    return this.intoConfigs().beforeIgnoreDeferred(set);
  }

  afterIgnoreDeferred(set: IntoSystemSet): NodeConfigs<T> {
    return this.intoConfigs().afterIgnoreDeferred(set);
  }

  distributiveRunIf(condition: IntoCondition): NodeConfigs<T> {
    return this.intoConfigs().distributiveRunIf(condition);
  }

  runIf(condition: IntoCondition): NodeConfigs<T> {
    return this.intoConfigs().runIf(condition);
  }

  ambiguousWith(set: IntoSystemSet): NodeConfigs<T> {
    return this.intoConfigs().ambiguousWith(set);
  }

  ambiguousWithAll(): NodeConfigs<T> {
    return this.intoConfigs().ambiguousWithAll();
  }

  chain(): NodeConfigs<T> {
    return this.intoConfigs().chain();
  }

  chainIgnoreDeferred(): NodeConfigs<T> {
    return this.intoConfigs().chainIgnoreDeferred();
  }
}

IntoConfigs.implFor(NodeConfigs, {
  intoConfigs(): NodeConfigs<any> {
    return this;
  },
});

IntoConfigs.implFor(IntoSystem, {
  intoConfigs(): SystemConfigs {
    return SystemConfigs.newSystem(this.intoSystem());
  },
});

IntoConfigs.implFor(SystemSet, {
  intoConfigs(): SystemSetConfigs {
    return SystemSetConfigs.newSet(this as SystemSet);
  },
});

IntoConfigs.implFor(Array, {
  intoConfigs(): SystemConfigs {
    return NodeConfigs.Configs(
      Vec.from(this.map((config) => IntoConfigs.wrap(config).intoConfigs())),
      Vec.new(),
      Chain.No,
    );
  },
});

export interface NodeConfigs<T> extends IntoConfigs<T> {}

declare module '../system/into' {
  interface IntoSystem extends IntoConfigs<System> {}
}

declare module './set' {
  interface SystemSet extends IntoConfigs<SystemSet> {}
}

declare module '../system/base' {
  interface System extends IntoConfigs<System> {}
}

declare global {
  interface Array<T> extends IntoConfigs<T> {}
}
