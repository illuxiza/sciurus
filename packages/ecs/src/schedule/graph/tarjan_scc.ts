import { None, Option, Some, Vec } from 'rustable';
import { DiGraph } from './graph_map';
import { NodeId } from './node';

class NodeData {
  rootIndex: Option<number>;
  neighbors: Iterator<NodeId>;

  constructor(neighbors: Iterator<NodeId>) {
    this.rootIndex = None;
    this.neighbors = neighbors;
  }
}

class TarjanScc {
  private graph: DiGraph;
  private uncheckedNodes: Iterator<NodeId>;
  private index: number;
  private componentCount: number;
  private nodes: Vec<NodeData>;
  private stack: Vec<NodeId>;
  private visitationStack: Vec<[NodeId, boolean]>;
  private start: Option<number>;
  private indexAdjustment: Option<number>;

  constructor(graph: DiGraph, uncheckedNodes: Iterator<NodeId>, nodes: NodeData[]) {
    this.graph = graph;
    this.uncheckedNodes = uncheckedNodes;
    this.index = 1;
    this.componentCount = Number.MAX_SAFE_INTEGER;
    this.nodes = Vec.from(nodes);
    this.stack = Vec.new();
    this.visitationStack = Vec.new();
    this.start = None;
    this.indexAdjustment = None;
  }

  nextScc(): Option<Vec<NodeId>> {
    // Cleanup from possible previous iteration
    if (this.start.isSome() && this.indexAdjustment.isSome()) {
      this.stack.truncate(this.start.unwrap());
      this.index -= this.indexAdjustment.unwrap();
      this.componentCount -= 1;
    }
    this.start = None;
    this.indexAdjustment = None;

    while (true) {
      // If there are items on the visitation stack, then we haven't finished visiting
      // the node at the bottom of the stack yet.
      // Must visit all nodes in the stack from top to bottom before visiting the next node.
      while (this.visitationStack.len() > 0) {
        const lastOpt = this.visitationStack.pop();
        if (lastOpt.isNone()) continue;
        const [v, vIsLocalRoot] = lastOpt.unwrap();
        const startOpt = this.visitOnce(v, vIsLocalRoot);
        if (startOpt.isSome()) {
          return Some(Vec.from(this.stack.slice(startOpt.unwrap())));
        }
      }

      // Get the next node to check, otherwise we're done and can return None.
      const next = this.uncheckedNodes.next();
      if (next.done) {
        return None;
      }

      const node = next.value;
      const visited = this.nodes.get(this.graph.toIndex(node)).unwrap().rootIndex.isSome();

      // If this node hasn't already been visited (e.g., it was the neighbor of a previously checked node)
      // add it to the visitation stack.
      if (!visited) {
        this.visitationStack.push([node, true]);
      }
    }
  }

  private visitOnce(v: NodeId, vIsLocalRoot: boolean): Option<number> {
    const nodeV = this.nodes.getUnchecked(this.graph.toIndex(v));

    if (nodeV.rootIndex.isNone()) {
      const vIndex = this.index;
      nodeV.rootIndex = Some(vIndex);
      this.index += 1;
    }

    // Get the next neighbor to visit
    const { value: w, done } = nodeV.neighbors.next();
    if (done) {
      // If we've visited all neighbors and this is not a local root,
      // add it to the stack for later processing
      if (!vIsLocalRoot) {
        this.stack.push(v);
      } else {
        // Pop the stack and generate an SCC
        let indexAdjustment = 1;
        const c = this.componentCount;
        const nodes = this.nodes;

        let start = 0;
        for (let i = this.stack.len() - 1; i >= 0; i--) {
          const wOpt = this.stack.get(i);
          if (wOpt.isNone()) continue;
          const w = wOpt.unwrap();
          if (
            nodes.getUnchecked(this.graph.toIndex(v)).rootIndex.unwrap() >
            nodes.getUnchecked(this.graph.toIndex(w)).rootIndex.unwrap()
          ) {
            start = i + 1;
            break;
          } else {
            nodes.getUnchecked(this.graph.toIndex(w)).rootIndex = Some(c);
            indexAdjustment += 1;
          }
        }

        nodes.getUnchecked(this.graph.toIndex(v)).rootIndex = Some(c);
        this.stack.push(v);

        this.start = Some(start);
        this.indexAdjustment = Some(indexAdjustment);

        return Some(start);
      }
      return None;
    }

    // If a neighbor hasn't been visited yet...
    if (this.nodes.getUnchecked(this.graph.toIndex(w)).rootIndex.isNone()) {
      // Push the current node and the neighbor back onto the visitation stack
      this.visitationStack.push([v, vIsLocalRoot]);
      this.visitationStack.push([w, true]);
      return None;
    }

    if (
      this.nodes.getUnchecked(this.graph.toIndex(w)).rootIndex.unwrap() <
      this.nodes.getUnchecked(this.graph.toIndex(v)).rootIndex.unwrap()
    ) {
      this.nodes.getUnchecked(this.graph.toIndex(v)).rootIndex = this.nodes.getUnchecked(
        this.graph.toIndex(w),
      ).rootIndex;
      vIsLocalRoot = false;
    }

    // Push the current node back onto the visitation stack to continue processing its neighbors
    this.visitationStack.push([v, vIsLocalRoot]);
    return None;
  }
}

export function newTarjanScc(graph: DiGraph): IterableIterator<Vec<NodeId>> {
  // Create a list of all nodes we need to visit.
  const uncheckedNodes = graph.nodes();

  // For each node we need to visit, we also need to visit its neighbors.
  // Storing the iterator for each set of neighbors allows this list to be computed without
  // an additional allocation.
  const nodes = Array.from(graph.nodes()).map((node) => new NodeData(graph.neighbors(node)));

  const tarjan = new TarjanScc(graph, uncheckedNodes, nodes);

  return {
    [Symbol.iterator]() {
      return this;
    },
    next(): IteratorResult<Vec<NodeId>> {
      const sccOpt = tarjan.nextScc();
      if (sccOpt.isNone()) {
        return { done: true, value: undefined };
      }
      return { done: false, value: sccOpt.unwrap() };
    },
  };
}
