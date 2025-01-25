export enum NodeIdType {
  System,
  Set,
}

export class NodeId {
  type: NodeIdType;
  index: number;

  constructor(type: NodeIdType, index: number) {
    this.type = type;
    this.index = index;
  }

  static System(index: number) {
    return new NodeId(NodeIdType.System, index);
  }

  static Set(index: number) {
    return new NodeId(NodeIdType.Set, index);
  }

  isSystem() {
    return this.type === NodeIdType.System;
  }

  isSet() {
    return this.type === NodeIdType.Set;
  }

  cmp(other: NodeId): number {
    if (this.type === other.type) {
      if (this.index < other.index) return -1;
      if (this.index > other.index) return 1;
      return 0;
    }
    return this.type === NodeIdType.System ? -1 : 1;
  }

  eq(other: NodeId) {
    return this.type === other.type && this.index === other.index;
  }
}
