import { FixedBitSet } from '@sciurus/utils';
import { EnumInstance, Enums, HashMap, HashSet, iter, Vec } from 'rustable';
import { SystemSet } from '../set';
import { DiGraph, Direction, UnGraph } from './graph_map';
import { NodeId } from './node';

export { DiGraph, Direction, NodeId, UnGraph };

export enum DependencyKind {
  Before,
  After,
  BeforeNoSync,
  AfterNoSync,
}

export interface Dependency {
  kind: DependencyKind;
  set: SystemSet;
}

const params = {
  Check: () => {},
  IgnoreWithSet: (_sets: Vec<SystemSet>) => {},
  IgnoreAll: () => {},
};
export const Ambiguity = Enums.create('Ambiguity', params);

export type Ambiguity = EnumInstance<typeof params>;

export class GraphInfo {
  constructor(
    public hierarchy: Vec<SystemSet> = Vec.new(),
    public dependencies: Vec<Dependency> = Vec.new(),
    public ambiguousWith: Ambiguity = Ambiguity.Check(),
  ) {}
}

export function index(row: number, col: number, numCols: number): number {
  if (col >= numCols) {
    throw new Error('Column index out of bounds');
  }
  return row * numCols + col;
}

export function rowCol(index: number, numCols: number): [number, number] {
  return [Math.floor(index / numCols), index % numCols];
}

export class CheckGraphResults {
  reachable: FixedBitSet;
  connected: HashSet<[NodeId, NodeId]>;
  disconnected: Vec<[NodeId, NodeId]>;
  transitiveEdges: Vec<[NodeId, NodeId]>;
  transitiveReduction: DiGraph;
  transitiveClosure: DiGraph;

  constructor() {
    this.reachable = new FixedBitSet();
    this.connected = new HashSet();
    this.disconnected = Vec.new();
    this.transitiveEdges = Vec.new();
    this.transitiveReduction = new DiGraph();
    this.transitiveClosure = new DiGraph();
  }
}

export function checkGraph(graph: DiGraph, topologicalOrder: Vec<NodeId>): CheckGraphResults {
  if (graph.nodeCount() === 0) {
    return new CheckGraphResults();
  }

  const n = graph.nodeCount();
  const map = new HashMap<NodeId, number>();
  const topsorted = new DiGraph();

  for (const [i, node] of topologicalOrder.iter().enumerate()) {
    map.insert(node, i);
    topsorted.addNode(node);
    for (const pred of graph.neighborsDirected(node, Direction.Incoming)) {
      topsorted.addEdge(pred, node);
    }
  }

  const reachable = new FixedBitSet(n * n);
  const connected = new HashSet<[NodeId, NodeId]>();
  const disconnected: Vec<[NodeId, NodeId]> = Vec.new();
  const transitiveEdges: Vec<[NodeId, NodeId]> = Vec.new();
  const transitiveReduction = new DiGraph();
  const transitiveClosure = new DiGraph();

  const visited = new FixedBitSet(n);

  for (const node of topsorted.nodes()) {
    transitiveReduction.addNode(node);
    transitiveClosure.addNode(node);
  }

  // iterate nodes in reverse topological order
  for (const a of Array.from(topsorted.nodes()).reverse()) {
    const indexA = map.get(a).unwrap();
    // iterate their successors in topological order
    for (const b of topsorted.neighborsDirected(a, Direction.Outgoing)) {
      const indexB = map.get(b).unwrap();
      if (!visited.get(indexB)) {
        // edge <a, b> is not redundant
        transitiveReduction.addEdge(a, b);
        transitiveClosure.addEdge(a, b);
        reachable.set(index(indexA, indexB, n), true);

        for (const c of transitiveClosure.neighborsDirected(b, Direction.Outgoing)) {
          const indexC = map.get(c).unwrap();
          if (!visited.get(indexC)) {
            visited.set(indexC, true);
            transitiveClosure.addEdge(a, c);
            reachable.set(index(indexA, indexC, n), true);
          }
        }
      } else {
        // edge <a, b> is redundant
        transitiveEdges.push([a, b]);
      }
    }

    visited.clear();
  }

  // partition pairs of nodes into "connected by path" and "not connected by path"
  for (let i = 0; i < n - 1; i++) {
    // reachable is upper triangular because the nodes were topsorted
    for (let j = index(i, i + 1, n); j <= index(i, n - 1, n); j++) {
      const [a, b] = rowCol(j, n);
      const pair: [NodeId, NodeId] = [
        topologicalOrder.getUnchecked(a),
        topologicalOrder.getUnchecked(b),
      ];
      if (reachable.get(j)) {
        connected.insert(pair);
      } else {
        disconnected.push(pair);
      }
    }
  }

  const results = new CheckGraphResults();
  results.reachable = reachable;
  results.connected = connected;
  results.disconnected = disconnected;
  results.transitiveEdges = transitiveEdges;
  results.transitiveReduction = transitiveReduction;
  results.transitiveClosure = transitiveClosure;

  return results;
}

export function simpleCyclesInComponent(graph: DiGraph, scc: Vec<NodeId>): Vec<Vec<NodeId>> {
  const cycles: Vec<Vec<NodeId>> = Vec.new();
  const sccs: Vec<Vec<NodeId>> = Vec.new();
  sccs.push(scc);

  while (sccs.len() > 0) {
    const currentScc = sccs.pop().unwrap();
    const subgraph = new DiGraph();

    for (const node of currentScc) {
      subgraph.addNode(node);
    }

    for (const node of currentScc) {
      for (const successor of graph.neighbors(node)) {
        if (subgraph.containsNode(successor)) {
          subgraph.addEdge(node, successor);
        }
      }
    }

    const path: Vec<NodeId> = Vec.new();
    const blocked = new HashSet<NodeId>();
    const unblockTogether = new HashMap<NodeId, HashSet<NodeId>>();
    const maybeInMoreCycles = new HashSet<NodeId>();
    const stack: Vec<[NodeId, Iterator<NodeId>]> = Vec.new();

    // we're going to look for all cycles that begin and end at this node
    const root = currentScc.getUnchecked(currentScc.len() - 1);
    // start a path at the root
    path.push(root);
    // mark this node as blocked
    blocked.insert(root);

    // DFS
    stack.push([root, subgraph.neighbors(root)]);
    while (!stack.isEmpty()) {
      const [node, successors] = stack.last().unwrap();
      const next = successors.next();

      if (!next.done) {
        const nextNode = next.value;
        if (nextNode.eq(root)) {
          // found a cycle
          for (const n of path) {
            maybeInMoreCycles.insert(n);
          }
          const cycle: Vec<NodeId> = Vec.new();
          for (const n of path) {
            cycle.push(n);
          }
          cycles.push(cycle);
        } else if (!blocked.contains(nextNode)) {
          // first time seeing `next` on this path
          maybeInMoreCycles.remove(nextNode);
          path.push(nextNode);
          blocked.insert(nextNode);
          stack.push([nextNode, subgraph.neighbors(nextNode)]);
          continue;
        }
      } else {
        if (maybeInMoreCycles.contains(node)) {
          const unblockStack: Vec<NodeId> = Vec.new();
          unblockStack.push(node);
          // unblock this node's ancestors
          while (!unblockStack.isEmpty()) {
            const n = unblockStack.pop().unwrap();
            if (blocked.remove(n)) {
              const unblockPredecessors = unblockTogether.get(n).unwrapOr(new HashSet<NodeId>());
              for (const pred of unblockPredecessors) {
                unblockStack.push(pred);
              }
              unblockPredecessors.clear();
            }
          }
        } else {
          // if its descendants can be unblocked later, this node will be too
          for (const successor of subgraph.neighbors(node)) {
            const predecessors = unblockTogether.get(successor).unwrapOr(new HashSet<NodeId>());
            predecessors.insert(node);
            unblockTogether.insert(successor, predecessors);
          }
        }

        // remove node from path and DFS stack
        path.pop();
        stack.pop();
      }
    }

    // remove node from subgraph
    subgraph.removeNode(root);

    sccs.extend(iter(subgraph.iterSccs()).filter((scc) => scc.len() > 1));
  }

  return cycles;
}
