import { Resources } from './resource/resources';
import { SparseSets } from './sparse_set';
import { Tables } from './table/collection';

export class Storages {
  /** Backing storage for `SparseSet` components. */
  public sparseSets: SparseSets = new SparseSets();

  /** Backing storage for `Table` components. */
  public tables: Tables = new Tables();

  /** Backing storage for resources. */
  public resources: Resources = new Resources();

  /** Backing storage for `!Send` resources. */
  public nonSendResources: Resources = new Resources();
}
