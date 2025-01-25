import { DiGraph } from '../../../src/schedule/graph/graph_map';
import { NodeId } from '../../../src/schedule/graph/node';

describe('Graph', () => {
  describe('node_order_preservation', () => {
    /**
     * The `Graph` type _must_ preserve the order that nodes are inserted in if
     * no removals occur. Removals are permitted to swap the latest node into the
     * location of the removed node.
     */
    test('should preserve node order and handle removals correctly', () => {
      const graph = new DiGraph();

      graph.addNode(NodeId.System(1));
      graph.addNode(NodeId.System(2));
      graph.addNode(NodeId.System(3));
      graph.addNode(NodeId.System(4));

      expect(Array.from(graph.nodes())).toEqual([
        NodeId.System(1),
        NodeId.System(2),
        NodeId.System(3),
        NodeId.System(4),
      ]);

      graph.removeNode(NodeId.System(1));

      expect(Array.from(graph.nodes())).toEqual([
        NodeId.System(4),
        NodeId.System(2),
        NodeId.System(3),
      ]);

      graph.removeNode(NodeId.System(4));

      expect(Array.from(graph.nodes())).toEqual([NodeId.System(3), NodeId.System(2)]);

      graph.removeNode(NodeId.System(2));

      expect(Array.from(graph.nodes())).toEqual([NodeId.System(3)]);

      graph.removeNode(NodeId.System(3));

      expect(Array.from(graph.nodes())).toEqual([]);
    });
  });

  describe('strongly_connected_components', () => {
    /**
     * Nodes that have bidrectional edges (or any edge in the case of undirected graphs) are
     * considered strongly connected. A strongly connected component is a collection of
     * nodes where there exists a path from any node to any other node in the collection.
     */
    test('should correctly identify strongly connected components', () => {
      const graph = new DiGraph();

      graph.addEdge(NodeId.System(1), NodeId.System(2));
      graph.addEdge(NodeId.System(2), NodeId.System(1));

      graph.addEdge(NodeId.System(2), NodeId.System(3));
      graph.addEdge(NodeId.System(3), NodeId.System(2));

      graph.addEdge(NodeId.System(4), NodeId.System(5));
      graph.addEdge(NodeId.System(5), NodeId.System(4));

      graph.addEdge(NodeId.System(6), NodeId.System(2));

      const sccs = [];
      const iterator = graph.iterSccs();
      let result = iterator.next();
      while (!result.done) {
        sccs.push(Array.from(result.value));
        result = iterator.next();
      }

      expect(sccs).toEqual([
        [NodeId.System(3), NodeId.System(2), NodeId.System(1)],
        [NodeId.System(5), NodeId.System(4)],
        [NodeId.System(6)],
      ]);
    });
  });
});
