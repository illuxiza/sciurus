import { FixedBitSet, logger } from '@sciurus/utils';
import {
  Constructor,
  Err,
  HashMap,
  HashSet,
  iter,
  None,
  Ok,
  Option,
  Ptr,
  Result,
  RustIter,
  Some,
  Vec,
} from 'rustable';
import { ComponentId, Components } from '../component';
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

export class ScheduleGraph {
  syss: Vec<SystemNode> = Vec.new();
  sysCodns: Vec<Vec<Condition>> = Vec.new();
  sysSets: Vec<SystemSetNode> = Vec.new();
  sysSetConds: Vec<Vec<Condition>> = Vec.new();
  sysSetIds: HashMap<SystemSet, NodeId> = new HashMap();
  uninit: Vec<[NodeId, number]> = Vec.new();
  hierarchy: Dag = new Dag();
  dependency: Dag = new Dag();
  ambiguousWith: DiGraph = new DiGraph();
  ambiguousWithAll: HashSet<NodeId> = new HashSet();
  conflictingSystems: Vec<[NodeId, NodeId, Vec<ComponentId>]> = Vec.new();
  anonymousSets: number = 0;
  changed: boolean = false;
  settings: ScheduleBuildSettings = new ScheduleBuildSettings();
  noSyncEdges: HashSet<[NodeId, NodeId]> = new HashSet();
  autoSyncNodeIds: HashMap<number, NodeId> = new HashMap();

  getSystemAt(id: NodeId): Option<System> {
    if (!id.isSystem()) {
      return None;
    }
    return this.syss.get(id.index).andThen((node) => node.inner);
  }

  containsSet(set: SystemSet): boolean {
    return this.sysSetIds.containsKey(set);
  }

  systemAt(nodeId: NodeId): System {
    return this.getSystemAt(nodeId).unwrap();
  }

  getSetAt(id: NodeId): Option<SystemSet> {
    if (!id.isSet()) {
      return None;
    }
    return this.sysSets.get(id.index).map((node) => node.inner);
  }

  setAt(nodeId: NodeId): SystemSet {
    return this.getSetAt(nodeId).unwrap();
  }

  systems(): RustIter<[NodeId, System, Condition[]]> {
    return this.syss
      .iter()
      .zip(this.sysCodns.iter())
      .enumerate()
      .filterMap(([i, [systemNode, condition]]) => {
        if (systemNode.inner.isNone()) {
          return None;
        }
        return Some([NodeId.System(i), systemNode.inner.unwrap(), condition.asSlice()]);
      });
  }

  systemSets(): RustIter<[NodeId, SystemSet, Condition[]]> {
    return this.sysSetIds.iter().map(([_, id]) => {
      const setMode = this.sysSets.getUnchecked(id.index);
      let set = setMode.inner;
      const conditions = this.sysSetConds.getUnchecked(id.index).asSlice();
      return [id, set, conditions];
    });
  }

  processConfigs<T extends object>(
    type: Constructor<T>,
    nodeConfigs: NodeConfigs<T>,
    collectNodes: boolean,
  ): ProcessConfigsResult {
    return nodeConfigs.match<ProcessConfigsResult>({
      NodeConfig: (config) => {
        return processConfig(this, type, config, collectNodes);
      },
      Configs: (configs, collectiveConditions, chained) => {
        applyCollectiveConditions(this, configs, collectiveConditions);
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
                this.dependency.graph.addEdge(previousNode, currentNode);
                if (ignoreDeferred) {
                  this.noSyncEdges.insert([previousNode, currentNode]);
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

  configureSets(sets: IntoConfigs) {
    this.processConfigs(SystemSet, IntoConfigs.wrap(sets).intoConfigs(), false);
  }

  initialize(world: World) {
    for (const [id, i] of this.uninit.drain()) {
      if (id.isSystem()) {
        this.syss.getUnchecked(id.index).get().unwrap().initialize(world);
        for (const condition of this.sysCodns.getUnchecked(id.index).iter().skip(i)) {
          condition.initialize(world);
        }
      } else {
        for (const condition of this.sysSetConds.getUnchecked(id.index).iter().skip(i)) {
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
    return Result.fromFn<SystemSchedule, ScheduleBuildError>(() => {
      const hierarchyTopsortResult = topsortGraph(
        this,
        this.hierarchy.graph,
        ReportCycles.Hierarchy,
      );
      this.hierarchy.topsort = hierarchyTopsortResult;
      const hierarchyResults = checkGraph(this.hierarchy.graph, this.hierarchy.topsort);
      optionallyCheckHierarchyConflicts(this, hierarchyResults.transitiveEdges, scheduleLabel);
      this.hierarchy.graph = hierarchyResults.transitiveReduction;
      const dependencyTopsortResult = topsortGraph(
        this,
        this.dependency.graph,
        ReportCycles.Dependency,
      );
      this.dependency.topsort = dependencyTopsortResult;
      const dependencyResults = checkGraph(this.dependency.graph, this.dependency.topsort);
      checkForCrossDependencies(this, dependencyResults, hierarchyResults.connected);
      let [setSystems, setSystemBitsets] = mapSetsToSystems(
        this,
        this.hierarchy.topsort,
        this.hierarchy.graph,
      );
      checkOrderButIntersect(this, dependencyResults.connected, setSystemBitsets);

      checkSystemTypeSetAmbiguity(this, setSystems);

      let dependencyFlattened = getDependencyFlattened(this, setSystems);
      if (this.settings.autoInsertApplyDeferred) {
        const autoInsertResult = autoInsertApplyDeferred(this, dependencyFlattened);
        dependencyFlattened = autoInsertResult;
      }
      const topsortResult = topsortGraph(this, dependencyFlattened, ReportCycles.Dependency);
      const dependencyFlattenedDag = new Dag(dependencyFlattened, topsortResult);

      const flatResults = checkGraph(dependencyFlattenedDag.graph, dependencyFlattenedDag.topsort);

      dependencyFlattenedDag.graph = flatResults.transitiveReduction;

      const ambiguousWithFlattened = this.getAmbiguousWithFlattened(setSystems);

      const conflictingSystems = getConflictingSystems(
        this,
        flatResults.disconnected,
        ambiguousWithFlattened,
        ignoredAmbiguities,
      );
      optionallyCheckConflicts(this, conflictingSystems, components, scheduleLabel);
      this.conflictingSystems = conflictingSystems;

      return buildScheduleInner(this, dependencyFlattenedDag, hierarchyResults.reachable);
    })();
  }

  getAmbiguousWithFlattened(setSystems: HashMap<NodeId, Vec<NodeId>>): UnGraph {
    let ambiguousWithFlattened = new UnGraph();
    for (let [lhs, rhs] of this.ambiguousWith.allEdges()) {
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

  updateSchedule(
    schedule: Ptr<SystemSchedule>,
    components: Components,
    ignoredAmbiguities: HashSet<ComponentId>,
    scheduleLabel: ScheduleLabel,
  ): Result<void, ScheduleBuildError> {
    if (this.uninit.len() > 0) {
      return Err(ScheduleBuildError.Uninitialized());
    }

    for (const [[id, system], conditions] of schedule.systemIds
      .drain()
      .iter()
      .zip(schedule.systems.drain().iter())
      .zip(schedule.systemConditions.drain().iter())) {
      this.syss.getUnchecked(id.index).inner = Some(system);
      this.sysCodns.set(id.index, conditions);
    }

    for (const [id, conditions] of schedule.setIds
      .drain()
      .iter()
      .zip(schedule.setConditions.drain().iter())) {
      this.sysSetConds.set(id.index, conditions);
    }

    const buildResult = this.buildSchedule(components, scheduleLabel, ignoredAmbiguities);
    if (buildResult.isErr()) {
      return Err(buildResult.unwrapErr());
    }

    schedule[Ptr.ptr] = buildResult.unwrap();

    for (const id of schedule.systemIds) {
      const system = this.syss.getUnchecked(id.index).inner.unwrap();
      this.syss.getUnchecked(id.index).inner = None;
      const conditions = this.sysCodns.getUnchecked(id.index);
      this.sysCodns.set(id.index, Vec.new());
      schedule.systems.push(system as ScheduleSystem);
      schedule.systemConditions.push(conditions);
    }

    for (const id of schedule.setIds) {
      const conditions = this.sysSetConds.getUnchecked(id.index);
      this.sysSetConds.set(id.index, Vec.new());
      schedule.setConditions.push(conditions);
    }

    return Ok(void 0);
  }

  conflictsToString(
    ambiguities: Vec<[NodeId, NodeId, Vec<ComponentId>]>,
    components: Components,
  ): RustIter<[string, string, Vec<string>]> {
    return ambiguities.iter().map(([a, b, conflicts]) => {
      let nameA = getNodeName(this, a);
      let nameB = getNodeName(this, b);
      let conflictNames = conflicts
        .iter()
        .map((id) => components.getName(id).unwrap())
        .collectInto((v) => Vec.from(v));
      return [nameA, nameB, conflictNames];
    });
  }
}

function processConfig<T extends object>(
  self: ScheduleGraph,
  type: Constructor<T>,
  config: NodeConfig<T>,
  collectNodes: boolean,
): ProcessConfigsResult {
  const node =
    type === ScheduleSystem
      ? addSystem(self, config as SystemConfig)
      : configureSet(self, config as SystemSetConfig);
  return new ProcessConfigsResult(collectNodes ? Vec.from([node]) : Vec.new(), true);
}

function addSystem(self: ScheduleGraph, config: SystemConfig): NodeId {
  const id = NodeId.System(self.syss.len());
  updateGraphs(self, id, config.graphInfo);
  self.uninit.push([id, 0]);
  self.syss.push(new SystemNode(config.node));
  self.sysCodns.push(
    config.conditions
      .iter()
      .map((v) => v.intoSystem() as Condition)
      .collectInto((v) => Vec.from(v)),
  );
  return id;
}

function configureSet(self: ScheduleGraph, config: SystemSetConfig): NodeId {
  const { node: set, graphInfo, conditions } = config;
  const id = self.sysSetIds.get(set).match({
    Some: (id) => id,
    None: () => addSet(self, set),
  });

  updateGraphs(self, id, graphInfo);

  const systemSetConditions = self.sysSetConds.getUnchecked(id.index);
  self.uninit.push([id, systemSetConditions.len()]);
  systemSetConditions.append(conditions);
  return id;
}

function applyCollectiveConditions<T extends object>(
  self: ScheduleGraph,
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
      const set = createAnonymousSet(self);
      for (const config of configs) {
        config.inSet(set);
      }
      const setConfig = new SystemSetConfig(set);
      setConfig.conditions.extend(collectiveConditions);
      configureSet(self, setConfig);
    }
  }
}

function addSet(self: ScheduleGraph, set: SystemSet): NodeId {
  const id = NodeId.Set(self.sysSets.len());
  self.sysSets.push(new SystemSetNode(set));
  self.sysSetConds.push(Vec.new());
  self.sysSetIds.insert(set, id);
  return id;
}

function checkHierarchySet(self: ScheduleGraph, id: NodeId, set: SystemSet): void {
  self.sysSetIds.get(set).match({
    Some: (setId) => {
      if (id.eq(setId)) {
        throw ScheduleBuildError.HierarchyLoop(getNodeName(self, id));
      }
    },
    None: () => {
      addSet(self, set);
    },
  });
}

function createAnonymousSet(self: ScheduleGraph): AnonymousSet {
  const id = self.anonymousSets;
  self.anonymousSets += 1;
  return new AnonymousSet(id);
}

function checkHierarchySets(self: ScheduleGraph, id: NodeId, graphInfo: GraphInfo): void {
  for (let set of graphInfo.hierarchy) {
    checkHierarchySet(self, id, set);
  }
}

function checkEdges(self: ScheduleGraph, id: NodeId, graphInfo: GraphInfo): void {
  for (const { set } of graphInfo.dependencies) {
    const op = self.sysSetIds.get(set);
    if (op.isSome()) {
      const setId = op.unwrap();
      if (id.eq(setId)) {
        throw ScheduleBuildError.DependencyLoop(getNodeName(self, id));
      }
    } else {
      addSet(self, set);
    }
  }

  graphInfo.ambiguousWith.match({
    IgnoreWithSet: (ambiguousWith: Vec<SystemSet>) => {
      for (const set of ambiguousWith) {
        if (!self.sysSetIds.containsKey(set)) {
          addSet(self, set);
        }
      }
    },
    IgnoreAll: () => {},
    Check: () => {},
  });
}

function updateGraphs(self: ScheduleGraph, id: NodeId, graphInfo: GraphInfo): void {
  checkHierarchySets(self, id, graphInfo);

  checkEdges(self, id, graphInfo);
  self.changed = true;

  const { hierarchy: sets, dependencies, ambiguousWith } = graphInfo;

  self.hierarchy.graph.addNode(id);
  self.dependency.graph.addNode(id);

  for (const set of sets.iter().map((set) => self.sysSetIds.getUnchecked(set))) {
    self.hierarchy.graph.addEdge(set, id);
    self.dependency.graph.addNode(set);
  }

  for (const { kind, set } of dependencies
    .iter()
    .map(({ kind, set }) => ({ kind, set: self.sysSetIds.getUnchecked(set) }))) {
    let lhs: NodeId, rhs: NodeId;
    switch (kind) {
      case DependencyKind.Before:
        lhs = id;
        rhs = set;
        break;
      case DependencyKind.BeforeNoSync:
        self.noSyncEdges.insert([id, set]);
        lhs = id;
        rhs = set;
        break;
      case DependencyKind.After:
        lhs = set;
        rhs = id;
        break;
      case DependencyKind.AfterNoSync:
        self.noSyncEdges.insert([set, id]);
        lhs = set;
        rhs = id;
        break;
    }

    self.dependency.graph.addEdge(lhs, rhs);
    self.hierarchy.graph.addNode(set);
  }

  ambiguousWith.match({
    Check: () => {},
    IgnoreWithSet: (ambiguousWith) => {
      for (const set of ambiguousWith.iter().map((set) => self.sysSetIds.getUnchecked(set))) {
        self.ambiguousWith.addEdge(id, set);
      }
    },
    IgnoreAll: () => {
      self.ambiguousWithAll.insert(id);
    },
  });
}

function getConflictingSystems(
  self: ScheduleGraph,
  flatResultsDisconnected: Vec<[NodeId, NodeId]>,
  ambiguousWithFlattened: UnGraph,
  ignoredAmbiguities: HashSet<ComponentId>,
): Vec<[NodeId, NodeId, Vec<ComponentId>]> {
  let conflictingSystems = Vec.new<[NodeId, NodeId, Vec<ComponentId>]>();
  for (let [a, b] of flatResultsDisconnected) {
    if (
      ambiguousWithFlattened.containsEdge(a, b) ||
      self.ambiguousWithAll.contains(a) ||
      self.ambiguousWithAll.contains(b)
    ) {
      continue;
    }
    let systemA = self.syss.getUnchecked(a.index).get().unwrap();
    let systemB = self.syss.getUnchecked(b.index).get().unwrap();
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
          _: () => {},
        });
      }
    }
  }
  return conflictingSystems;
}

function buildScheduleInner(
  self: ScheduleGraph,
  dependencyFlattenedDag: Dag,
  hierResultsReachable: FixedBitSet,
): SystemSchedule {
  const dgSystemIds = dependencyFlattenedDag.topsort.clone();
  const dgSystemIdxMap = dgSystemIds
    .iter()
    .enumerate()
    .map(([i, id]) => [id, i] as [NodeId, number])
    .collectInto((values) => new HashMap(values));
  const hgSystems = self.hierarchy.topsort
    .iter()
    .enumerate()
    .filter(([_i, id]) => id.isSystem())
    .collectInto((values) => Vec.from(values));
  const [hgSetWithConditionsIdxsArray, hgSetIdsArray] = self.hierarchy.topsort
    .iter()
    .enumerate()
    .filter(([_i, id]) => id.isSet() && !self.sysSetConds.getUnchecked(id.index).isEmpty())
    .unzip();

  const hgSetWithConditionsIdxs = Vec.from(hgSetWithConditionsIdxsArray);
  const hgSetIds = Vec.from(hgSetIdsArray);
  const sysCount = self.syss.len();
  const setWithConditionsCount = hgSetIds.len();
  const hgNodeCount = self.hierarchy.graph.nodeCount();

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
    const bitset = systemsInSetsWithConditions.getUnchecked(i);
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
    const bitset = setsWithConditionsOfSystems.getUnchecked(i);
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

function autoInsertApplyDeferred(self: ScheduleGraph, dependencyFlattened: DiGraph): DiGraph {
  let syncPointGraph = dependencyFlattened.clone();
  const topoResult = topsortGraph(self, dependencyFlattened, ReportCycles.Dependency);
  let topo = topoResult;
  let distances = new HashMap<number, Option<number>>();
  for (let node of topo) {
    let addSyncAfter = self.syss.getUnchecked(node.index).get().unwrap().hasDeferred();
    for (let target of dependencyFlattened.neighborsDirected(node, Direction.Outgoing)) {
      let addSyncOnEdge =
        addSyncAfter &&
        !isApplyDeferred(self.syss.getUnchecked(target.index).get().unwrap()) &&
        !self.noSyncEdges.contains([node, target]);
      let weight = addSyncOnEdge ? 1 : 0;
      let distance = distances
        .get(target.index)
        .unwrapOr(None)
        .or(Some(0))
        .map((distance) => {
          return Math.max(distance, distances.get(node.index).unwrapOr(None).unwrapOr(0) + weight);
        });
      distances.insert(target.index, distance);
      if (addSyncOnEdge) {
        const syncPoint = getSyncPoint(self, distances.get(target.index).unwrap());
        syncPointGraph.addEdge(node, syncPoint);
        syncPointGraph.addEdge(syncPoint, target);
        syncPointGraph.removeEdge(node, target);
      }
    }
  }
  return syncPointGraph;
}

function addAutoSync(self: ScheduleGraph): NodeId {
  let id = NodeId.System(self.syss.len());
  self.syss.push(new SystemNode(IntoSystem.wrap(new ApplyDeferred()).intoSystem()));
  self.sysCodns.push(Vec.new());
  self.ambiguousWithAll.insert(id);
  return id;
}

function getSyncPoint(self: ScheduleGraph, distance: number): NodeId {
  return self.autoSyncNodeIds.get(distance).unwrapOrElse(() => {
    let node = addAutoSync(self);
    self.autoSyncNodeIds.insert(distance, node);
    return node;
  });
}

function mapSetsToSystems(
  self: ScheduleGraph,
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
    let bitset = new FixedBitSet(self.syss.len());
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

function getDependencyFlattened(
  self: ScheduleGraph,
  setSystems: HashMap<NodeId, Vec<NodeId>>,
): DiGraph {
  let dependencyFlattened = self.dependency.graph.clone();
  let temp = Vec.new<[NodeId, NodeId]>();
  for (let [set, systems] of setSystems.entries()) {
    if (systems.isEmpty()) {
      for (let a of dependencyFlattened.neighborsDirected(set, Direction.Incoming)) {
        for (let b of dependencyFlattened.neighborsDirected(set, Direction.Outgoing)) {
          if (self.noSyncEdges.contains([a, set]) && self.noSyncEdges.contains([set, b])) {
            self.noSyncEdges.insert([a, b]);
          }
          temp.push([a, b]);
        }
      }
    } else {
      for (let a of dependencyFlattened.neighborsDirected(set, Direction.Incoming)) {
        for (let sys of systems) {
          if (self.noSyncEdges.contains([a, set])) {
            self.noSyncEdges.insert([a, sys]);
          }
          temp.push([a, sys]);
        }
      }
      for (let b of dependencyFlattened.neighborsDirected(set, Direction.Outgoing)) {
        for (let sys of systems) {
          if (self.noSyncEdges.contains([set, b])) {
            self.noSyncEdges.insert([sys, b]);
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

function getNodeName(self: ScheduleGraph, id: NodeId) {
  return getNodeNameInner(self, id, self.settings.reportSets);
}

function getNodeNameInner(self: ScheduleGraph, id: NodeId, reportSets: boolean): string {
  if (id.isSystem()) {
    let name = self.systemAt(id).name();
    if (reportSets) {
      let sets = namesOfSetsContainingNode(self, id);
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
    let set = self.sysSets.getUnchecked(id.index);
    if (set.isAnonymous()) {
      return anonymousSetName(self, id);
    } else {
      return set.name();
    }
  } else {
    return '';
  }
}

function anonymousSetName(self: ScheduleGraph, id: NodeId): string {
  return (
    '(' +
    iter(self.hierarchy.graph.edgesDirected(id, Direction.Outgoing))
      .map(([_, memberId]) => {
        return getNodeNameInner(self, memberId, false);
      })
      .reduce((a, b) => a + ', ' + b) +
    ')'
  );
}

function getNodeKind(child: NodeId) {
  if (child.isSystem()) {
    return 'system';
  } else if (child.isSet()) {
    return 'system set';
  } else {
    return '';
  }
}

function optionallyCheckHierarchyConflicts(
  self: ScheduleGraph,
  transitiveEdges: Vec<[NodeId, NodeId]>,
  scheduleLabel: any,
): void {
  if (self.settings.hierarchyDetection === LogLevel.Ignore || transitiveEdges.isEmpty()) {
    return;
  }
  const message = getHierarchyConflictsErrorMessage(self, transitiveEdges);
  switch (self.settings.hierarchyDetection) {
    case LogLevel.Warn:
      logger.warn(`Schedule ${scheduleLabel.key()} has redundant edges:\n ${message}`);
      return;
    case LogLevel.Error:
      throw ScheduleBuildError.HierarchyRedundancy(message);
  }
}

function getHierarchyConflictsErrorMessage(
  self: ScheduleGraph,
  transitiveEdges: Vec<[NodeId, NodeId]>,
): string {
  let message = 'hierarchy contains redundant edge(s)';

  for (let [parent, child] of transitiveEdges) {
    message += ` -- ${getNodeKind(child)} ${getNodeName(self, child)} cannot be child of set ${getNodeName(self, parent)}, longer path exists`;
  }
  return message;
}

function topsortGraph(self: ScheduleGraph, graph: DiGraph, report: ReportCycles): Vec<NodeId> {
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
    return topSortedNodes;
  } else {
    let cycles = Vec.new<Vec<NodeId>>();
    for (const scc of sccsWithCycles) {
      cycles.append(simpleCyclesInComponent(graph, scc));
    }
    const error =
      report === ReportCycles.Hierarchy
        ? ScheduleBuildError.HierarchyCycle(getHierarchyCyclesErrorMessage(self, cycles))
        : ScheduleBuildError.DependencyCycle(getDependencyCyclesErrorMessage(self, cycles));
    throw error;
  }
}

function getHierarchyCyclesErrorMessage(self: ScheduleGraph, cycles: Vec<Vec<NodeId>>): string {
  let message = `schedule has ${cycles.len()} in_set cycle(s):\n`;
  for (let [i, cycle] of cycles.iter().enumerate()) {
    let names = cycle.iter().map((id) => getNodeName(self, id));
    let firstName = names.next().unwrap();
    message += `cycle ${i + 1}: set ${firstName} contains itself\n`;
    message += `set ${firstName}\n`;
    for (let name of names.chain([firstName].iter())) {
      message += ` ... which contains set ${name}\n`;
    }
  }
  return message;
}

function getDependencyCyclesErrorMessage(self: ScheduleGraph, cycles: Vec<Vec<NodeId>>): string {
  let message = `schedule has ${cycles.len()} before/after cycle(s):\n`;
  for (let [i, cycle] of cycles.iter().enumerate()) {
    let names = cycle.iter().map((id) => [getNodeKind(id), getNodeName(self, id)]);
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

function checkForCrossDependencies(
  self: ScheduleGraph,
  dependencyResults: CheckGraphResults,
  hierarchyResultsConnected: HashSet<[NodeId, NodeId]>,
): void {
  for (let [a, b] of dependencyResults.connected) {
    if (hierarchyResultsConnected.contains([a, b]) || hierarchyResultsConnected.contains([b, a])) {
      let nameA = getNodeName(self, a);
      let nameB = getNodeName(self, b);
      throw ScheduleBuildError.CrossDependency(nameA, nameB);
    }
  }
}

function checkOrderButIntersect(
  self: ScheduleGraph,
  connected: HashSet<[NodeId, NodeId]>,
  setSystemBitsets: HashMap<NodeId, FixedBitSet>,
): void {
  for (let [a, b] of connected) {
    if (!(a.isSet() && b.isSet())) {
      continue;
    }

    let aSystems = setSystemBitsets.get(a).unwrap();
    let bSystems = setSystemBitsets.get(b).unwrap();

    if (!aSystems.isDisjoint(bSystems)) {
      throw ScheduleBuildError.SetsHaveOrderButIntersect(
        getNodeName(self, a),
        getNodeName(self, b),
      );
    }
  }
}

function getConflictsErrorMessage(
  self: ScheduleGraph,
  ambiguities: Vec<[NodeId, NodeId, Vec<ComponentId>]>,
  components: Components,
): string {
  let nAmbiguities = ambiguities.len();
  let message = `${nAmbiguities} pairs of systems with conflicting data access have indeterminate execution order. \
        Consider adding 'before', 'after', or 'ambiguous_with' relationships between these:\n`;

  for (let [nameA, nameB, conflicts] of self.conflictsToString(ambiguities, components)) {
    message += ` -- ${nameA} and ${nameB}\n`;

    if (conflicts.len() > 0) {
      message += `    conflict on: ${conflicts.asSlice().join(', ')}\n`;
    } else {
      message += `    conflict on: World\n`;
    }
  }

  return message;
}

function checkSystemTypeSetAmbiguity(
  self: ScheduleGraph,
  setSystems: HashMap<NodeId, Vec<NodeId>>,
): void {
  for (let [id, systems] of setSystems) {
    let setNode = self.sysSets.getUnchecked(id.index);
    if (setNode.isSystemType()) {
      let instances = systems.len();
      let ambiguousWith = self.ambiguousWith.edges(id);
      let before = self.dependency.graph.edgesDirected(id, Direction.Incoming);
      let after = self.dependency.graph.edgesDirected(id, Direction.Outgoing);
      let relations = iter(before).count() + iter(after).count() + iter(ambiguousWith).count();
      if (instances > 1 && relations > 0) {
        throw ScheduleBuildError.SystemTypeSetAmbiguity(getNodeName(self, id));
      }
    }
  }
}

function optionallyCheckConflicts(
  self: ScheduleGraph,
  conflicts: Vec<[NodeId, NodeId, Vec<ComponentId>]>,
  components: Components,
  scheduleLabel: any,
): void {
  if (self.settings.ambiguityDetection === LogLevel.Ignore || conflicts.len() === 0) {
    return;
  }
  const message = getConflictsErrorMessage(self, conflicts, components);
  switch (self.settings.ambiguityDetection) {
    case LogLevel.Warn:
      logger.warn(`Schedule ${scheduleLabel.key()} has ambiguities.\n${message}`);
      return;
    case LogLevel.Error:
      throw ScheduleBuildError.Ambiguity(message);
  }
}

function traverseSetsContainingNode(
  self: ScheduleGraph,
  id: NodeId,
  fn: (setId: NodeId) => boolean,
) {
  for (let [setId] of self.hierarchy.graph.edgesDirected(id, Direction.Outgoing)) {
    if (fn(setId)) {
      traverseSetsContainingNode(self, setId, fn);
    }
  }
}

function namesOfSetsContainingNode(self: ScheduleGraph, id: NodeId): Vec<string> {
  let sets = new HashSet<NodeId>();
  traverseSetsContainingNode(self, id, (setId) => {
    let ret = self.sysSets.getUnchecked(setId.index).isSystemType() && !sets.contains(setId);
    sets.insert(setId);
    return ret;
  });

  const vec = Vec.from(sets.iter().map((setId) => getNodeName(self, setId)));
  vec.sort();
  return vec;
}
