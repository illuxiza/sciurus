import { FixedBitSet, logger, NOT_IMPLEMENTED } from '@sciurus/utils';
import {
  Constructor,
  Err,
  HashMap,
  HashSet,
  implTrait,
  iter,
  None,
  Ok,
  Option,
  Ptr,
  Result,
  RustIter,
  Some,
  trait,
  useTrait,
  Vec,
} from 'rustable';
import { Components } from '../component/collection';
import { ComponentId } from '../component/types';
import { IntoSystem, ScheduleSystem } from '../system';
import { System } from '../system/base';
import { World } from '../world/base';
import { IntoConfigs, NodeConfig, NodeConfigs, SystemConfig, SystemSetConfig } from './config';
import { ApplyDeferred, isApplyDeferred, SystemSchedule } from './executor';
import {
  checkGraph,
  CheckGraphResults,
  DependencyKind,
  DiGraph,
  Direction,
  GraphInfo,
  index,
  NodeId,
  simpleCyclesInComponent,
  UnGraph,
} from './graph';
import { AnonymousSet, ScheduleLabel, SystemSet } from './set';
import {
  Chain,
  Condition,
  Dag,
  LogLevel,
  ProcessConfigsResult,
  ReportCycles,
  ScheduleBuildError,
  ScheduleBuildSettings,
  SystemNode,
  SystemSetNode,
} from './types';

@trait
export class ProcessNodeConfig {
  static processConfig(_scheduleGraph: ScheduleGraph, _config: NodeConfig<any>): NodeId {
    throw NOT_IMPLEMENTED;
  }
}

implTrait(ScheduleSystem, ProcessNodeConfig, {
  static: {
    processConfig(scheduleGraph: ScheduleGraph, config: NodeConfig<ScheduleSystem>): NodeId {
      return scheduleGraph.addSystemInner(config).unwrap();
    },
  },
});

implTrait(SystemSet, ProcessNodeConfig, {
  static: {
    processConfig(scheduleGraph: ScheduleGraph, config: NodeConfig<SystemSet>): NodeId {
      return scheduleGraph.configureSetInner(config).unwrap();
    },
  },
});

export class ScheduleGraph {
  __systems: Vec<SystemNode> = Vec.new();
  __systemConditions: Vec<Vec<Condition>> = Vec.new();
  __systemSets: Vec<SystemSetNode> = Vec.new();
  __systemSetConditions: Vec<Vec<Condition>> = Vec.new();
  __systemSetIds: HashMap<SystemSet, NodeId> = new HashMap();
  __uninit: Vec<[NodeId, number]> = Vec.new();
  __hierarchy: Dag = new Dag();
  __dependency: Dag = new Dag();
  __ambiguousWith: DiGraph = new DiGraph();
  __ambiguousWithAll: HashSet<NodeId> = new HashSet();
  __conflictingSystems: Vec<[NodeId, NodeId, Vec<ComponentId>]> = Vec.new();
  __anonymousSets: number = 0;
  __changed: boolean = false;
  __settings: ScheduleBuildSettings = new ScheduleBuildSettings();
  __noSyncEdges: HashSet<[NodeId, NodeId]> = new HashSet();
  __autoSyncNodeIds: HashMap<number, NodeId> = new HashMap();

  getSystemAt(id: NodeId): Option<System> {
    if (!id.isSystem()) {
      return None;
    }
    return this.__systems.get(id.index).andThen((node) => node.inner);
  }

  containsSet(set: SystemSet): boolean {
    return this.__systemSetIds.containsKey(set);
  }

  systemAt(nodeId: NodeId): System {
    return this.getSystemAt(nodeId).unwrap();
  }

  getSetAt(id: NodeId): Option<SystemSet> {
    if (!id.isSet()) {
      return None;
    }
    return this.__systemSets.get(id.index).map((node) => node.inner);
  }

  setAt(nodeId: NodeId): SystemSet {
    return this.getSetAt(nodeId).unwrap();
  }

  systems(): RustIter<[NodeId, System, Condition[]]> {
    return this.__systems
      .iter()
      .zip(this.__systemConditions.iter())
      .enumerate()
      .filterMap(([i, [systemNode, condition]]) => {
        if (systemNode.inner.isNone()) {
          return None;
        }
        return Some([NodeId.System(i), systemNode.inner.unwrap(), condition.asSlice()]);
      });
  }

  systemSets(): RustIter<[NodeId, SystemSet, Condition[]]> {
    return this.__systemSetIds.iter().map(([_, id]) => {
      const setMode = this.__systemSets[id.index];
      let set = setMode.inner;
      const conditions = this.__systemSetConditions[id.index].asSlice();
      return [id, set, conditions];
    });
  }

  get hierarchy() {
    return this.__hierarchy;
  }

  get dependency() {
    return this.__dependency;
  }

  get conflictingSystems() {
    return this.__conflictingSystems;
  }

  get changed() {
    return this.__changed;
  }

  private processConfig<T extends object>(
    type: Constructor<T>,
    config: NodeConfig<T>,
    collectNodes: boolean,
  ): ProcessConfigsResult {
    const node = useTrait(type, ProcessNodeConfig).processConfig(this, config);
    return new ProcessConfigsResult(collectNodes ? Vec.from([node]) : Vec.new(), true);
  }

  private applyCollectiveConditions<T extends object>(
    configs: Vec<NodeConfigs<T>>,
    collectiveConditions: Vec<Condition>,
  ): void {
    if (!collectiveConditions.isEmpty()) {
      if (configs.len() === 1) {
        const [config] = configs;
        for (const condition of collectiveConditions) {
          config.runIf(condition);
        }
      } else {
        const set = this.createAnonymousSet();
        for (const config of configs) {
          config.inSet(set);
        }
        const setConfig = new SystemSetConfig(set);
        setConfig.conditions.extend(collectiveConditions);
        this.configureSetInner(setConfig);
      }
    }
  }

  processConfigs<T extends object>(
    type: Constructor<T>,
    nodeConfigs: NodeConfigs<T>,
    collectNodes: boolean,
  ): ProcessConfigsResult {
    return nodeConfigs.match<ProcessConfigsResult>({
      NodeConfig: (config) => {
        return this.processConfig(type, config, collectNodes);
      },
      Configs: (configs, collectiveConditions, chained) => {
        this.applyCollectiveConditions(configs, collectiveConditions);
        const ignoreDeferred = chained === Chain.YesIgnoreDeferred;
        const isChained = chained === Chain.Yes || chained === Chain.YesIgnoreDeferred;

        let denselyChained = isChained || configs.len() === 1;
        const configsIter = configs[Symbol.iterator]();
        const nodes = Vec.new<NodeId>();
        const first = configsIter.next().value;
        if (!first) {
          return new ProcessConfigsResult(Vec.new(), denselyChained);
        }
        let previousResult = this.processConfigs(type, first, collectNodes || isChained);
        denselyChained &&= previousResult.denselyChained;
        for (const current of configsIter) {
          const currentResult = this.processConfigs(type, current, collectNodes || isChained);
          denselyChained &&= currentResult.denselyChained;
          if (isChained) {
            const currentNodes = currentResult.denselyChained
              ? currentResult.nodes.slice(0, 1)
              : currentResult.nodes;
            const previousNodes = previousResult.denselyChained
              ? previousResult.nodes.slice(previousResult.nodes.len() - 1)
              : previousResult.nodes;
            for (const previousNode of previousNodes) {
              for (const currentNode of currentNodes) {
                this.__dependency.graph.addEdge(previousNode, currentNode);
                if (ignoreDeferred) {
                  this.__noSyncEdges.insert([previousNode, currentNode]);
                }
              }
            }
          }
          if (collectNodes) {
            nodes.append(previousResult.nodes);
          }
          previousResult = currentResult;
        }
        if (collectNodes) {
          nodes.append(previousResult.nodes);
        }
        return new ProcessConfigsResult(nodes, denselyChained);
      },
    });
  }

  addSystemInner(config: SystemConfig): Result<NodeId, ScheduleBuildError> {
    const id = NodeId.System(this.__systems.len());
    const res = this.updateGraphs(id, config.graphInfo);
    if (res.isErr()) {
      return res as unknown as Result<NodeId, ScheduleBuildError>;
    }
    this.__uninit.push([id, 0]);
    this.__systems.push(new SystemNode(config.node));
    this.__systemConditions.push(
      config.conditions
        .iter()
        .map((v) => v.intoSystem() as Condition)
        .collectInto((v) => Vec.from(v)),
    );
    return Ok(id);
  }

  configureSets(sets: any) {
    this.processConfigs(SystemSet, IntoConfigs.wrap(sets).intoConfigs(), false);
  }

  configureSetInner(config: SystemSetConfig): Result<NodeId, ScheduleBuildError> {
    const { node: set, graphInfo, conditions } = config;
    const id = this.__systemSetIds.get(set).match({
      Some: (id) => id,
      None: () => this.addSet(set),
    });

    const res = this.updateGraphs(id, graphInfo);
    if (res.isErr()) {
      return res as unknown as Result<NodeId, ScheduleBuildError>;
    }

    const systemSetConditions = this.__systemSetConditions[id.index];
    this.__uninit.push([id, systemSetConditions.len()]);
    systemSetConditions.append(conditions);

    return Ok(id);
  }

  private addSet(set: SystemSet): NodeId {
    const id = NodeId.Set(this.__systemSets.len());
    this.__systemSets.push(new SystemSetNode(set));
    this.__systemSetConditions.push(Vec.new());
    this.__systemSetIds.insert(set, id);
    return id;
  }

  private checkHierarchySet(id: NodeId, set: SystemSet): Result<void, ScheduleBuildError> {
    return this.__systemSetIds.get(set).match({
      Some: (setId) => {
        if (id.eq(setId)) {
          return Err(ScheduleBuildError.HierarchyLoop(this.getNodeName(id)));
        }
        return Ok(void 0);
      },
      None: () => {
        this.addSet(set);
        return Ok(void 0);
      },
    });
  }

  private createAnonymousSet(): AnonymousSet {
    const id = this.__anonymousSets;
    this.__anonymousSets += 1;
    return new AnonymousSet(id);
  }

  private checkHierarchySets(id: NodeId, graphInfo: GraphInfo): Result<void, ScheduleBuildError> {
    for (let set of graphInfo.hierarchy) {
      const res = this.checkHierarchySet(id, set);
      if (res.isErr()) {
        return res;
      }
    }
    return Ok(void 0);
  }

  private checkEdges(id: NodeId, graphInfo: GraphInfo): Result<void, ScheduleBuildError> {
    for (const { set } of graphInfo.dependencies) {
      const op = this.__systemSetIds.get(set);
      if (op.isSome()) {
        const setId = op.unwrap();
        if (id.eq(setId)) {
          return Err(ScheduleBuildError.DependencyLoop(this.getNodeName(id)));
        }
      } else {
        this.addSet(set);
      }
    }

    graphInfo.ambiguousWith.match({
      IgnoreWithSet: (ambiguousWith: Vec<SystemSet>) => {
        for (const set of ambiguousWith) {
          if (!this.__systemSetIds.containsKey(set)) {
            this.addSet(set);
          }
        }
      },
      IgnoreAll: () => {},
      Check: () => {},
    });

    return Ok(void 0);
  }

  private updateGraphs(id: NodeId, graphInfo: GraphInfo): Result<void, ScheduleBuildError> {
    const checkHierarchyResult = this.checkHierarchySets(id, graphInfo);
    if (checkHierarchyResult.isErr()) {
      return checkHierarchyResult;
    }

    const checkEdgesResult = this.checkEdges(id, graphInfo);
    if (checkEdgesResult.isErr()) {
      return checkEdgesResult;
    }
    this.__changed = true;

    const { hierarchy: sets, dependencies, ambiguousWith } = graphInfo;

    this.__hierarchy.graph.addNode(id);
    this.__dependency.graph.addNode(id);

    for (const set of sets.iter().map((set) => this.__systemSetIds.getUnchecked(set))) {
      this.__hierarchy.graph.addEdge(set, id);
      this.__dependency.graph.addNode(set);
    }

    for (const { kind, set } of dependencies
      .iter()
      .map(({ kind, set }) => ({ kind, set: this.__systemSetIds.getUnchecked(set) }))) {
      let lhs: NodeId, rhs: NodeId;
      switch (kind) {
        case DependencyKind.Before:
          lhs = id;
          rhs = set;
          break;
        case DependencyKind.BeforeNoSync:
          this.__noSyncEdges.insert([id, set]);
          lhs = id;
          rhs = set;
          break;
        case DependencyKind.After:
          lhs = set;
          rhs = id;
          break;
        case DependencyKind.AfterNoSync:
          this.__noSyncEdges.insert([set, id]);
          lhs = set;
          rhs = id;
          break;
      }

      this.__dependency.graph.addEdge(lhs, rhs);
      this.__hierarchy.graph.addNode(set);
    }

    ambiguousWith.match({
      Check: () => {},
      IgnoreWithSet: (ambiguousWith) => {
        for (const set of ambiguousWith
          .iter()
          .map((set) => this.__systemSetIds.getUnchecked(set))) {
          this.__ambiguousWith.addEdge(id, set);
        }
      },
      IgnoreAll: () => {
        this.__ambiguousWithAll.insert(id);
      },
    });

    return Ok(void 0);
  }

  initialize(world: World) {
    for (const [id, i] of this.__uninit.drain()) {
      if (id.isSystem()) {
        this.__systems[id.index].get().unwrap().initialize(world);
        for (const condition of this.__systemConditions[id.index]) {
          condition.initialize(world);
        }
      } else {
        for (const condition of this.__systemSetConditions[id.index].iter().skip(i)) {
          condition.initialize(world);
        }
      }
    }
  }

  buildSchedule(
    components: Components,
    scheduleLabel: ScheduleLabel,
    ignoredAmbiguities: HashSet<ComponentId>,
  ): Result<SystemSchedule, ScheduleBuildError> {
    const hierarchyTopsortResult = this.topsortGraph(
      this.__hierarchy.graph,
      ReportCycles.Hierarchy,
    );
    if (hierarchyTopsortResult.isErr()) {
      return hierarchyTopsortResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }
    this.__hierarchy.topsort = hierarchyTopsortResult.unwrap();

    const hierarchyResults = checkGraph(this.__hierarchy.graph, this.__hierarchy.topsort);
    const checkHierarchyResult = this.optionallyCheckHierarchyConflicts(
      hierarchyResults.transitiveEdges,
      scheduleLabel,
    );
    if (checkHierarchyResult.isErr()) {
      return checkHierarchyResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }

    this.__hierarchy.graph = hierarchyResults.transitiveReduction;

    const dependencyTopsortResult = this.topsortGraph(
      this.__dependency.graph,
      ReportCycles.Dependency,
    );
    if (dependencyTopsortResult.isErr()) {
      return dependencyTopsortResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }
    this.__dependency.topsort = dependencyTopsortResult.unwrap();
    const dependencyResults = checkGraph(this.__dependency.graph, this.__dependency.topsort);
    const crossDependenciesResult = this.checkForCrossDependencies(
      dependencyResults,
      hierarchyResults.connected,
    );
    if (crossDependenciesResult.isErr()) {
      return crossDependenciesResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }

    let [setSystems, setSystemBitsets] = this.mapSetsToSystems(
      this.__hierarchy.topsort,
      this.__hierarchy.graph,
    );
    const orderButIntersectResult = this.checkOrderButIntersect(
      dependencyResults.connected,
      setSystemBitsets,
    );
    if (orderButIntersectResult.isErr()) {
      return orderButIntersectResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }

    const systemTypeSetAmbiguityResult = this.checkSystemTypeSetAmbiguity(setSystems);
    if (systemTypeSetAmbiguityResult.isErr()) {
      return systemTypeSetAmbiguityResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }

    let dependencyFlattened = this.getDependencyFlattened(setSystems);
    if (this.__settings.autoInsertApplyDeferred) {
      const autoInsertResult = this.autoInsertApplyDeferred(dependencyFlattened);
      if (autoInsertResult.isErr()) {
        return autoInsertResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
      }
      dependencyFlattened = autoInsertResult.unwrap();
    }
    const topsortResult = this.topsortGraph(dependencyFlattened, ReportCycles.Dependency);
    if (topsortResult.isErr()) {
      return topsortResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }
    const dependencyFlattenedDag = new Dag(dependencyFlattened, topsortResult.unwrap());

    const flatResults = checkGraph(dependencyFlattenedDag.graph, dependencyFlattenedDag.topsort);

    dependencyFlattenedDag.graph = flatResults.transitiveReduction;

    const ambiguousWithFlattened = this.getAmbiguousWithFlattened(setSystems);

    const conflictingSystems = this.getConflictingSystems(
      flatResults.disconnected,
      ambiguousWithFlattened,
      ignoredAmbiguities,
    );
    const checkConflictsResult = this.optionallyCheckConflicts(
      conflictingSystems,
      components,
      scheduleLabel,
    );
    if (checkConflictsResult.isErr()) {
      return checkConflictsResult as unknown as Result<SystemSchedule, ScheduleBuildError>;
    }
    this.__conflictingSystems = conflictingSystems;

    return Ok(this.buildScheduleInner(dependencyFlattenedDag, hierarchyResults.reachable));
  }

  private autoInsertApplyDeferred(
    dependencyFlattened: DiGraph,
  ): Result<DiGraph, ScheduleBuildError> {
    let syncPointGraph = dependencyFlattened.clone();
    const topoResult = this.topsortGraph(dependencyFlattened, ReportCycles.Dependency);
    if (topoResult.isErr()) {
      return Err(topoResult.unwrapErr());
    }
    let topo = topoResult.unwrap();
    let distances = new HashMap<number, Option<number>>();
    for (let node of topo) {
      let addSyncAfter = this.__systems[node.index].get().unwrap().hasDeferred();
      for (let target of dependencyFlattened.neighborsDirected(node, Direction.Outgoing)) {
        let addSyncOnEdge =
          addSyncAfter &&
          !isApplyDeferred(this.__systems[target.index].get().unwrap()) &&
          !this.__noSyncEdges.contains([node, target]);
        let weight = addSyncOnEdge ? 1 : 0;
        let distance = distances
          .get(target.index)
          .unwrapOr(None)
          .or(Some(0))
          .map((distance) => {
            return Math.max(
              distance,
              distances.get(node.index).unwrapOr(None).unwrapOr(0) + weight,
            );
          });
        distances.insert(target.index, distance);
        if (addSyncOnEdge) {
          const syncPoint = this.getSyncPoint(distances.get(target.index).unwrap());
          syncPointGraph.addEdge(node, syncPoint);
          syncPointGraph.addEdge(syncPoint, target);
          syncPointGraph.removeEdge(node, target);
        }
      }
    }
    return Ok(syncPointGraph);
  }

  private addAutoSync(): NodeId {
    let id = NodeId.System(this.__systems.len());
    this.__systems.push(new SystemNode(IntoSystem.wrap(new ApplyDeferred()).intoSystem()));
    this.__systemConditions.push(Vec.new());
    this.__ambiguousWithAll.insert(id);
    return id;
  }

  private getSyncPoint(distance: number): NodeId {
    return this.__autoSyncNodeIds.get(distance).unwrapOrElse(() => {
      let node = this.addAutoSync();
      this.__autoSyncNodeIds.insert(distance, node);
      return node;
    });
  }

  private mapSetsToSystems(
    topsort: Vec<NodeId>,
    graph: DiGraph,
  ): [HashMap<NodeId, Vec<NodeId>>, HashMap<NodeId, FixedBitSet>] {
    let setSystems = new HashMap<NodeId, Vec<NodeId>>();
    let setSystemBitsets = new HashMap<NodeId, FixedBitSet>();
    for (let id of topsort) {
      if (id.isSystem()) {
        continue;
      }
      let systems = Vec.new<NodeId>();
      let bitset = new FixedBitSet(this.__systems.len());
      for (const child of graph.neighborsDirected(id, Direction.Outgoing)) {
        if (child.isSystem()) {
          systems.push(child);
          bitset.insert(child.index);
        } else if (child.isSet()) {
          let child_systems = setSystems.get(child).unwrap();
          let child_system_bitset = setSystemBitsets.get(child).unwrap();
          systems.extend(child_systems);
          bitset.unionWith(child_system_bitset);
        }
      }
      setSystems.insert(id, systems);
      setSystemBitsets.insert(id, bitset);
    }
    return [setSystems, setSystemBitsets];
  }

  private getDependencyFlattened(setSystems: HashMap<NodeId, Vec<NodeId>>): DiGraph {
    let dependencyFlattened = this.__dependency.graph.clone();
    let temp = Vec.new<[NodeId, NodeId]>();
    for (let [set, systems] of setSystems.entries()) {
      if (systems.isEmpty()) {
        for (let a of dependencyFlattened.neighborsDirected(set, Direction.Incoming)) {
          for (let b of dependencyFlattened.neighborsDirected(set, Direction.Outgoing)) {
            if (this.__noSyncEdges.contains([a, set]) && this.__noSyncEdges.contains([set, b])) {
              this.__noSyncEdges.insert([a, b]);
            }
            temp.push([a, b]);
          }
        }
      } else {
        for (let a of dependencyFlattened.neighborsDirected(set, Direction.Incoming)) {
          for (let sys of systems) {
            if (this.__noSyncEdges.contains([a, set])) {
              this.__noSyncEdges.insert([a, sys]);
            }
            temp.push([a, sys]);
          }
        }
        for (let b of dependencyFlattened.neighborsDirected(set, Direction.Outgoing)) {
          for (let sys of systems) {
            if (this.__noSyncEdges.contains([set, b])) {
              this.__noSyncEdges.insert([sys, b]);
            }
            temp.push([sys, b]);
          }
        }
      }
      dependencyFlattened.removeNode(set);
      for (let [a, b] of temp.drain()) {
        dependencyFlattened.addEdge(a, b);
      }
    }
    return dependencyFlattened;
  }

  getAmbiguousWithFlattened(setSystems: HashMap<NodeId, Vec<NodeId>>): UnGraph {
    let ambiguousWithFlattened = new UnGraph();
    for (let [lhs, rhs] of this.__ambiguousWith.allEdges()) {
      if (lhs.isSystem() && rhs.isSystem()) {
        ambiguousWithFlattened.addEdge(lhs, rhs);
      } else if (lhs.isSet() && rhs.isSystem()) {
        for (let lhs_ of setSystems.get(lhs).unwrapOr(Vec.new<NodeId>())) {
          ambiguousWithFlattened.addEdge(lhs_, rhs);
        }
      } else if (lhs.isSystem() && rhs.isSet()) {
        for (let rhs_ of setSystems.get(rhs).unwrapOr(Vec.new<NodeId>())) {
          ambiguousWithFlattened.addEdge(lhs, rhs_);
        }
      } else if (lhs.isSet() && rhs.isSet()) {
        for (let lhs_ of setSystems.get(lhs).unwrapOr(Vec.new<NodeId>())) {
          for (let rhs_ of setSystems.get(rhs).unwrapOr(Vec.new<NodeId>())) {
            ambiguousWithFlattened.addEdge(lhs_, rhs_);
          }
        }
      }
    }
    return ambiguousWithFlattened;
  }

  private getConflictingSystems(
    flatResultsDisconnected: Vec<[NodeId, NodeId]>,
    ambiguousWithFlattened: UnGraph,
    ignoredAmbiguities: HashSet<ComponentId>,
  ): Vec<[NodeId, NodeId, Vec<ComponentId>]> {
    let conflictingSystems = Vec.new<[NodeId, NodeId, Vec<ComponentId>]>();
    for (let [a, b] of flatResultsDisconnected) {
      if (
        ambiguousWithFlattened.containsEdge(a, b) ||
        this.__ambiguousWithAll.contains(a) ||
        this.__ambiguousWithAll.contains(b)
      ) {
        continue;
      }
      let systemA = this.__systems[a.index].get().unwrap();
      let systemB = this.__systems[b.index].get().unwrap();
      if (systemA.isExclusive() || systemB.isExclusive()) {
        conflictingSystems.push([a, b, Vec.new()]);
      } else {
        let accessA = systemA.componentAccess();
        let accessB = systemB.componentAccess();
        if (!accessA.isCompatible(accessB)) {
          accessA.getConflicts(accessB).match({
            All: () => {
              conflictingSystems.push([a, b, Vec.new()]);
            },
            Individual: (conflicts) => {
              let c = iter(conflicts.ones())
                .filter((id) => !ignoredAmbiguities.contains(id))
                .collectInto((v) => Vec.from(v));
              if (!c.isEmpty()) {
                conflictingSystems.push([a, b, c]);
              }
            },
          });
        }
      }
    }
    return conflictingSystems;
  }

  private buildScheduleInner(
    dependencyFlattenedDag: Dag,
    hierResultsReachable: FixedBitSet,
  ): SystemSchedule {
    const dgSystemIds = dependencyFlattenedDag.topsort.clone();
    const dgSystemIdxMap = dgSystemIds
      .iter()
      .cloned()
      .enumerate()
      .map(([i, id]) => [id, i] as [NodeId, number])
      .collectInto((values) => new HashMap(values));
    const hgSystems = this.__hierarchy.topsort
      .iter()
      .cloned()
      .enumerate()
      .filter(([_i, id]) => id.isSystem())
      .collectInto((values) => Vec.from(values));
    const [hgSetWithConditionsIdxsArray, hgSetIdsArray] = this.__hierarchy.topsort
      .iter()
      .cloned()
      .enumerate()
      .filter(([_i, id]) => id.isSet() && !this.__systemSetConditions[id.index].isEmpty())
      .unzip();

    const hgSetWithConditionsIdxs = Vec.from(hgSetWithConditionsIdxsArray);
    const hgSetIds = Vec.from(hgSetIdsArray);
    const sysCount = this.__systems.len();
    const setWithConditionsCount = hgSetIds.len();
    const hgNodeCount = this.__hierarchy.graph.nodeCount();

    const systemDependencies = Vec.new<number>();
    const systemDependents = Vec.new<Vec<number>>();
    for (let sysId of dgSystemIds) {
      const numDependencies = iter(
        dependencyFlattenedDag.graph.neighborsDirected(sysId, Direction.Incoming),
      ).count();
      const dependents = iter(
        dependencyFlattenedDag.graph.neighborsDirected(sysId, Direction.Outgoing),
      )
        .map((depId) => dgSystemIdxMap.get(depId).unwrap())
        .collectInto((v) => Vec.from(v));
      systemDependencies.push(numDependencies);
      systemDependents.push(dependents);
    }

    const systemsInSetsWithConditions = Vec.new<FixedBitSet>();
    systemsInSetsWithConditions.resize(setWithConditionsCount, new FixedBitSet(sysCount));
    for (const [i, row] of hgSetWithConditionsIdxs.iter().enumerate()) {
      const bitset = systemsInSetsWithConditions[i];
      for (const [col, sysId] of hgSystems) {
        const idx = dgSystemIdxMap.get(sysId).unwrap();
        const isDescendant = hierResultsReachable.get(index(row, col, hgNodeCount));
        bitset.set(idx, isDescendant);
      }
    }

    const setsWithConditionsOfSystems = Vec.new<FixedBitSet>();
    setsWithConditionsOfSystems.resize(sysCount, new FixedBitSet(setWithConditionsCount));
    for (const [col, sysId] of hgSystems) {
      const i = dgSystemIdxMap.get(sysId).unwrap();
      const bitset = setsWithConditionsOfSystems[i];
      for (const [idx, row] of hgSetWithConditionsIdxs
        .iter()
        .enumerate()
        .takeWhile(([_idx, row]) => row < col)) {
        const isAncestor = hierResultsReachable.get(index(row, col, hgNodeCount));
        bitset.set(idx, isAncestor);
      }
    }

    return new SystemSchedule(
      dgSystemIds,
      Vec.new(),
      Vec.new(),
      systemDependencies,
      systemDependents,
      setsWithConditionsOfSystems,
      hgSetIds,
      Vec.new(),
      systemsInSetsWithConditions,
    );
  }

  updateSchedule(
    schedule: Ptr<SystemSchedule>,
    components: Components,
    ignoredAmbiguities: HashSet<ComponentId>,
    scheduleLabel: ScheduleLabel,
  ): Result<void, ScheduleBuildError> {
    if (this.__uninit.len() > 0) {
      return Err(ScheduleBuildError.Uninitialized());
    }

    for (const [[id, system], conditions] of schedule.systemIds
      .drain()
      .iter()
      .zip(schedule.systems.drain().iter())
      .zip(schedule.systemConditions.drain().iter())) {
      this.__systems[id.index].inner = Some(system);
      this.__systemConditions[id.index] = conditions;
    }

    for (const [id, conditions] of schedule.setIds
      .drain()
      .iter()
      .zip(schedule.setConditions.drain().iter())) {
      this.__systemSetConditions[id.index] = conditions;
    }

    const buildResult = this.buildSchedule(components, scheduleLabel, ignoredAmbiguities);
    if (buildResult.isErr()) {
      return Err(buildResult.unwrapErr());
    }

    schedule[Ptr.ptr] = buildResult.unwrap();

    for (const id of schedule.systemIds) {
      const system = this.__systems[id.index].inner.unwrap();
      this.__systems[id.index].inner = None;
      const conditions = this.__systemConditions[id.index];
      this.__systemConditions[id.index] = Vec.new();
      schedule.systems.push(system as ScheduleSystem);
      schedule.systemConditions.push(conditions);
    }

    for (const id of schedule.setIds) {
      const conditions = this.__systemSetConditions[id.index];
      this.__systemSetConditions[id.index] = Vec.new();
      schedule.setConditions.push(conditions);
    }

    return Ok(void 0);
  }

  private getNodeName(id: NodeId) {
    return this.getNodeNameInner(id, this.__settings.reportSets);
  }

  private getNodeNameInner(id: NodeId, reportSets: boolean): string {
    if (id.isSystem()) {
      let name = this.systemAt(id).name();
      if (reportSets) {
        let sets = this.namesOfSetsContainingNode(id);
        if (sets.isEmpty()) {
          return name;
        } else if (sets.len() === 1) {
          return `${name} (in set ${sets.get(0)})`;
        } else {
          return `${name} (in sets ${sets.asSlice().join(', ')})`;
        }
      }
      return name;
    } else if (id.isSet()) {
      let set = this.__systemSets[id.index];
      if (set.isAnonymous()) {
        return this.anonymousSetName(id);
      } else {
        return set.name();
      }
    } else {
      return '';
    }
  }

  private anonymousSetName(id: NodeId): string {
    return (
      '(' +
      iter(this.__hierarchy.graph.edgesDirected(id, Direction.Outgoing))
        .map(([_, memberId]) => {
          return this.getNodeNameInner(memberId, false);
        })
        .reduce((a, b) => a + ', ' + b) +
      ')'
    );
  }

  private getNodeKind(child: NodeId) {
    if (child.isSystem()) {
      return 'system';
    } else if (child.isSet()) {
      return 'system set';
    } else {
      return '';
    }
  }

  private optionallyCheckHierarchyConflicts(
    transitiveEdges: Vec<[NodeId, NodeId]>,
    scheduleLabel: any,
  ): Result<void, ScheduleBuildError> {
    if (this.__settings.hierarchyDetection === LogLevel.Ignore || transitiveEdges.isEmpty()) {
      return Ok(void 0);
    }
    const message = this.getHierarchyConflictsErrorMessage(transitiveEdges);
    switch (this.__settings.hierarchyDetection) {
      case LogLevel.Warn:
        logger.warn(`Schedule ${scheduleLabel.key()} has redundant edges:\n ${message}`);
        return Ok(void 0);
      case LogLevel.Error:
        return Err(ScheduleBuildError.HierarchyRedundancy(message));
    }
  }

  private getHierarchyConflictsErrorMessage(transitiveEdges: Vec<[NodeId, NodeId]>) {
    let message = 'hierarchy contains redundant edge(s)';

    for (let [parent, child] of transitiveEdges) {
      message += ` -- ${this.getNodeKind(child)} ${this.getNodeName(child)} cannot be child of set ${this.getNodeName(parent)}, longer path exists`;
    }
    return message;
  }

  private topsortGraph(
    graph: DiGraph,
    report: ReportCycles,
  ): Result<Vec<NodeId>, ScheduleBuildError> {
    let topSortedNodes = Vec.new<NodeId>();
    let sccsWithCycles = Vec.new<Vec<NodeId>>();

    for (const scc of graph.iterSccs()) {
      topSortedNodes.extend(scc);
      if (scc.len() > 1) {
        sccsWithCycles.push(scc);
      }
    }

    if (sccsWithCycles.isEmpty()) {
      topSortedNodes.reverse();
      return Ok(topSortedNodes);
    } else {
      let cycles = Vec.new<Vec<NodeId>>();
      for (const scc of sccsWithCycles) {
        cycles.append(simpleCyclesInComponent(graph, scc));
      }
      const error =
        report === ReportCycles.Hierarchy
          ? ScheduleBuildError.HierarchyCycle(this.getHierarchyCyclesErrorMessage(cycles))
          : ScheduleBuildError.DependencyCycle(this.getDependencyCyclesErrorMessage(cycles));
      return Err(error);
    }
  }

  private getHierarchyCyclesErrorMessage(cycles: Vec<Vec<NodeId>>): string {
    let message = `schedule has ${cycles.len()} in_set cycle(s):\n`;
    for (let [i, cycle] of cycles.iter().enumerate()) {
      let names = cycle.iter().map((id) => this.getNodeName(id));
      let firstName = names.next().unwrap();
      message += `cycle ${i + 1}: set ${firstName} contains itself\n`;
      message += `set ${firstName}\n`;
      for (let name of names.chain([firstName].iter())) {
        message += ` ... which contains set ${name}\n`;
      }
    }
    return message;
  }

  private getDependencyCyclesErrorMessage(cycles: Vec<Vec<NodeId>>): string {
    let message = `schedule has ${cycles.len()} before/after cycle(s):\n`;
    for (let [i, cycle] of cycles.iter().enumerate()) {
      let names = cycle.iter().map((id) => [this.getNodeKind(id), this.getNodeName(id)]);
      let [firstKind, firstName] = names.next().unwrap();
      message += `cycle ${i + 1}: ${firstKind} ${firstName} must run before itself\n`;
      message += `${firstKind} ${firstName}\n`;
      for (let [kind, name] of names.chain([[firstKind, firstName]].iter())) {
        message += ` ... which must run before ${kind} ${name}\n`;
      }
      message += '\n';
    }
    return message;
  }

  private checkForCrossDependencies(
    dependencyResults: CheckGraphResults,
    hierarchyResultsConnected: HashSet<[NodeId, NodeId]>,
  ): Result<void, ScheduleBuildError> {
    for (let [a, b] of dependencyResults.connected) {
      if (
        hierarchyResultsConnected.contains([a, b]) ||
        hierarchyResultsConnected.contains([b, a])
      ) {
        let nameA = this.getNodeName(a);
        let nameB = this.getNodeName(b);
        return Err(ScheduleBuildError.CrossDependency(nameA, nameB));
      }
    }

    return Ok(void 0);
  }

  private checkOrderButIntersect(
    connected: HashSet<[NodeId, NodeId]>,
    setSystemBitsets: HashMap<NodeId, FixedBitSet>,
  ): Result<void, ScheduleBuildError> {
    for (let [a, b] of connected) {
      if (!(a.isSet() && b.isSet())) {
        continue;
      }

      let aSystems = setSystemBitsets.get(a).unwrap();
      let bSystems = setSystemBitsets.get(b).unwrap();

      if (!aSystems.isDisjoint(bSystems)) {
        return Err(
          ScheduleBuildError.SetsHaveOrderButIntersect(this.getNodeName(a), this.getNodeName(b)),
        );
      }
    }

    return Ok(void 0);
  }

  private checkSystemTypeSetAmbiguity(
    setSystems: HashMap<NodeId, Vec<NodeId>>,
  ): Result<void, ScheduleBuildError> {
    for (let [id, systems] of setSystems) {
      let setNode = this.__systemSets[id.index];
      if (setNode.isSystemType()) {
        let instances = systems.len();
        let ambiguousWith = this.__ambiguousWith.edges(id);
        let before = this.__dependency.graph.edgesDirected(id, Direction.Incoming);
        let after = this.__dependency.graph.edgesDirected(id, Direction.Outgoing);
        let relations = iter(before).count() + iter(after).count() + iter(ambiguousWith).count();
        if (instances > 1 && relations > 0) {
          return Err(ScheduleBuildError.SystemTypeSetAmbiguity(this.getNodeName(id)));
        }
      }
    }

    return Ok(void 0);
  }

  private optionallyCheckConflicts(
    conflicts: Vec<[NodeId, NodeId, Vec<ComponentId>]>,
    components: Components,
    scheduleLabel: any,
  ): Result<void, ScheduleBuildError> {
    if (this.__settings.ambiguityDetection === LogLevel.Ignore || conflicts.len() === 0) {
      return Ok(void 0);
    }
    const message = this.getConflictsErrorMessage(conflicts, components);
    switch (this.__settings.ambiguityDetection) {
      case LogLevel.Warn:
        logger.warn(`Schedule ${scheduleLabel.key()} has ambiguities.\n${message}`);
        return Ok(void 0);
      case LogLevel.Error:
        return Err(ScheduleBuildError.Ambiguity(message));
    }
  }

  private getConflictsErrorMessage(
    ambiguities: Vec<[NodeId, NodeId, Vec<ComponentId>]>,
    components: Components,
  ): string {
    let nAmbiguities = ambiguities.len();
    let message = `${nAmbiguities} pairs of systems with conflicting data access have indeterminate execution order. \
          Consider adding 'before', 'after', or 'ambiguous_with' relationships between these:\n`;

    for (let [nameA, nameB, conflicts] of this.conflictsToString(ambiguities, components)) {
      message += ` -- ${nameA} and ${nameB}\n`;

      if (conflicts.len() > 0) {
        message += `    conflict on: ${conflicts.asSlice().join(', ')}\n`;
      } else {
        message += `    conflict on: World\n`;
      }
    }

    return message;
  }

  conflictsToString(
    ambiguities: Vec<[NodeId, NodeId, Vec<ComponentId>]>,
    components: Components,
  ): RustIter<[string, string, Vec<string>]> {
    return ambiguities.iter().map(([a, b, conflicts]) => {
      let nameA = this.getNodeName(a);
      let nameB = this.getNodeName(b);
      let conflictNames = conflicts
        .iter()
        .map((id) => components.getName(id).unwrap())
        .collectInto((v) => Vec.from(v));
      return [nameA, nameB, conflictNames];
    });
  }

  private traverseSetsContainingNode(id: NodeId, fn: (setId: NodeId) => boolean) {
    for (let [setId] of this.__hierarchy.graph.edgesDirected(id, Direction.Outgoing)) {
      if (fn(setId)) {
        this.traverseSetsContainingNode(setId, fn);
      }
    }
  }

  private namesOfSetsContainingNode(id: NodeId): Vec<string> {
    let sets = new HashSet<NodeId>();
    this.traverseSetsContainingNode(id, (setId) => {
      let ret = this.__systemSets[setId.index].isSystemType() && !sets.contains(setId);
      sets.insert(setId);
      return ret;
    });

    const vec = Vec.from(sets.iter().map((setId) => this.getNodeName(setId)));
    vec.sort();
    return vec;
  }
}
