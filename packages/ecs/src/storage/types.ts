export enum StorageType {
  /** Optimized for query iteration */
  Table = 'Table',
  /** Optimized for component insertion and removal */
  SparseSet = 'SparseSet',
}

export type TableId = number;

export type TableRow = number;
