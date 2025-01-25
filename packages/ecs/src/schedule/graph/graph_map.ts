import { Clone, derive, Eq, HashMap, HashSet, Vec } from 'rustable';
import { NodeId } from './node';
import { newTarjanScc } from './tarjan_scc';

export enum Direction {
  Incoming = 1,
  Outgoing = 0,
}

export namespace Direction {
  export function opposite(dir: Direction): Direction {
    return dir === Direction.Outgoing ? Direction.Incoming : Direction.Outgoing;
  }
}

class CompactNodeIdAndDirection {
  private constructor(
    private readonly index: number,
    private readonly isSystem: boolean,
    private readonly direction: Direction,
  ) {}

  static store(node: NodeId, direction: Direction): CompactNodeIdAndDirection {
    return new CompactNodeIdAndDirection(node.index, node.isSystem(), direction);
  }

  static load(self: CompactNodeIdAndDirection): [NodeId, Direction] {
    const node = self.isSystem ? NodeId.System(self.index) : NodeId.Set(self.index);
    return [node, self.direction];
  }
}

class CompactNodeIdPair {
  private constructor(
    private readonly indexA: number,
    private readonly indexB: number,
    private readonly isSystemA: boolean,
    private readonly isSystemB: boolean,
  ) {}

  static store(a: NodeId, b: NodeId): CompactNodeIdPair {
    return new CompactNodeIdPair(a.index, b.index, a.isSystem(), b.isSystem());
  }

  static load(self: CompactNodeIdPair): [NodeId, NodeId] {
    const a = self.isSystemA ? NodeId.System(self.indexA) : NodeId.Set(self.indexA);
    const b = self.isSystemB ? NodeId.System(self.indexB) : NodeId.Set(self.indexB);
    return [a, b];
  }
}

export interface Graph extends Clone, Eq {}
/**
 * A graph data structure using an associative array of its node weights NodeId.
 * It uses a combined adjacency list and sparse adjacency matrix representation,
 * using O(|N| + |E|) space, and allows testing for edge existence in constant time.
 */
@derive([Clone, Eq])
export class Graph {
  private readonly __nodes: HashMap<NodeId, Vec<CompactNodeIdAndDirection>>;
  private readonly __edges: HashSet<CompactNodeIdPair>;
  private readonly __directed: boolean;
  private readonly __nodeList: Vec<NodeId>;
  private readonly __nodeIndices: HashMap<NodeId, number>;

  constructor(directed: boolean = false) {
    this.__nodes = new HashMap();
    this.__edges = new HashSet();
    this.__directed = directed;
    this.__nodeList = Vec.new();
    this.__nodeIndices = new HashMap();
  }

  private edgeKey(a: NodeId, b: NodeId): CompactNodeIdPair {
    const [first, second] = this.__directed || a.cmp(b) <= 0 ? [a, b] : [b, a];
    return CompactNodeIdPair.store(first, second);
  }

  nodeCount(): number {
    return this.__nodeList.len();
  }

  addNode(n: NodeId): void {
    if (!this.__nodes.containsKey(n)) {
      this.__nodes.insert(n, Vec.new());
      this.__nodeIndices.insert(n, this.__nodeList.len());
      this.__nodeList.push(n);
    }
  }

  removeNode(n: NodeId): void {
    const linksOpt = this.__nodes.get(n);
    if (linksOpt.isNone()) return;

    const links = linksOpt.unwrap();
    // First remove all edges
    for (const link of links) {
      const [succ, dir] = CompactNodeIdAndDirection.load(link);
      const edge = dir === Direction.Outgoing ? this.edgeKey(n, succ) : this.edgeKey(succ, n);

      // Remove the edge from the other node's links
      const otherLinksOpt = this.__nodes.get(succ);
      if (otherLinksOpt.isSome()) {
        const otherLinks = otherLinksOpt.unwrap();
        const otherDir = dir === Direction.Outgoing ? Direction.Incoming : Direction.Outgoing;
        let otherIndex = -1;
        for (let i = 0; i < otherLinks.len(); i++) {
          const linkOpt = otherLinks.get(i);
          if (linkOpt.isSome()) {
            const [nodeId, linkDir] = CompactNodeIdAndDirection.load(linkOpt.unwrap());
            if (nodeId.eq(n) && linkDir === otherDir) {
              otherIndex = i;
              break;
            }
          }
        }
        if (otherIndex !== -1) {
          otherLinks.swapRemove(otherIndex);
        }
      }

      this.__edges.remove(edge);
    }

    // Then remove the node from nodes map
    this.__nodes.remove(n);

    // Remove from nodeList and update indices
    const indexOpt = this.__nodeIndices.get(n);
    if (indexOpt.isSome()) {
      const index = indexOpt.unwrap();
      const lastIndex = this.__nodeList.len() - 1;

      // If the node to remove is not the last one
      if (index < lastIndex) {
        // Get the last node that will be swapped to this position
        const lastNodeOpt = this.__nodeList.get(lastIndex);
        if (lastNodeOpt.isSome()) {
          const lastNode = lastNodeOpt.unwrap();
          // Update the index of the swapped node
          this.__nodeIndices.insert(lastNode, index);
        }
      }

      this.__nodeList.swapRemove(index);
      this.__nodeIndices.remove(n);
    }
  }

  containsNode(n: NodeId): boolean {
    return this.__nodes.containsKey(n);
  }

  addEdge(a: NodeId, b: NodeId): void {
    const edge = this.edgeKey(a, b);
    if (!this.__edges.contains(edge)) {
      this.__edges.insert(edge);

      // Ensure both nodes exist
      this.addNode(a);
      this.addNode(b);

      // Add edge to adjacency lists
      this.__nodes.get(a).unwrap().push(CompactNodeIdAndDirection.store(b, Direction.Outgoing));
      if (!a.eq(b)) {
        this.__nodes.get(b).unwrap().push(CompactNodeIdAndDirection.store(a, Direction.Incoming));
      }
    }
  }

  removeEdge(a: NodeId, b: NodeId): boolean {
    const edge = this.edgeKey(a, b);
    if (!this.__edges.remove(edge)) return false;

    // Remove from adjacency lists
    const aLinksOpt = this.__nodes.get(a);
    const bLinksOpt = this.__nodes.get(b);

    if (aLinksOpt.isSome()) {
      const aLinks = aLinksOpt.unwrap();
      let aIndex = -1;
      for (let i = 0; i < aLinks.len(); i++) {
        const linkOpt = aLinks.get(i);
        if (linkOpt.isSome()) {
          const [nodeId, dir] = CompactNodeIdAndDirection.load(linkOpt.unwrap());
          if (nodeId.eq(b) && dir === Direction.Outgoing) {
            aIndex = i;
            break;
          }
        }
      }
      if (aIndex !== -1) aLinks.swapRemove(aIndex);
    }

    if (bLinksOpt.isSome() && !a.eq(b)) {
      const bLinks = bLinksOpt.unwrap();
      let bIndex = -1;
      for (let i = 0; i < bLinks.len(); i++) {
        const linkOpt = bLinks.get(i);
        if (linkOpt.isSome()) {
          const [nodeId, dir] = CompactNodeIdAndDirection.load(linkOpt.unwrap());
          if (nodeId.eq(a) && dir === Direction.Incoming) {
            bIndex = i;
            break;
          }
        }
      }
      if (bIndex !== -1) bLinks.swapRemove(bIndex);
    }

    return true;
  }

  containsEdge(a: NodeId, b: NodeId): boolean {
    return this.__edges.contains(this.edgeKey(a, b));
  }

  *nodes(): IterableIterator<NodeId> {
    yield* this.__nodeList;
  }

  *neighbors(a: NodeId): IterableIterator<NodeId> {
    const linksOpt = this.__nodes.get(a);
    if (linksOpt.isNone()) return;

    const links = linksOpt.unwrap();
    for (const link of links) {
      const [nodeId, dir] = CompactNodeIdAndDirection.load(link);
      if (!this.__directed || dir === Direction.Outgoing) {
        yield nodeId;
      }
    }
  }

  *neighborsDirected(a: NodeId, dir: Direction): IterableIterator<NodeId> {
    const linksOpt = this.__nodes.get(a);
    if (linksOpt.isNone()) return;

    const links = linksOpt.unwrap();
    for (const link of links) {
      const [nodeId, linkDir] = CompactNodeIdAndDirection.load(link);
      if (!this.__directed || linkDir === dir || nodeId.eq(a)) {
        yield nodeId;
      }
    }
  }

  *edges(a: NodeId): IterableIterator<[NodeId, NodeId]> {
    for (const b of this.neighbors(a)) {
      if (this.__edges.contains(this.edgeKey(a, b))) {
        yield [a, b];
      }
    }
  }

  *edgesDirected(a: NodeId, dir: Direction): IterableIterator<[NodeId, NodeId]> {
    for (const b of this.neighborsDirected(a, dir)) {
      const [first, second] = dir === Direction.Incoming ? [b, a] : [a, b];
      if (this.__edges.contains(this.edgeKey(first, second))) {
        yield [first, second];
      }
    }
  }

  *allEdges(): IterableIterator<[NodeId, NodeId]> {
    for (const edge of this.__edges) {
      yield CompactNodeIdPair.load(edge);
    }
  }

  toIndex(node: NodeId): number {
    const indexOpt = this.__nodeIndices.get(node);
    if (indexOpt.isNone()) {
      throw new Error(`Node ${node} not found in graph`);
    }
    return indexOpt.unwrap();
  }
}

export class DiGraph extends Graph {
  constructor() {
    super(true);
  }

  iterSccs(): IterableIterator<Vec<NodeId>> {
    return newTarjanScc(this);
  }
}

export class UnGraph extends Graph {
  constructor() {
    super(false);
  }
}
