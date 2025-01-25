import { type ComponentId } from '../../component/types';
import { ComponentInfo } from '../../component/info';
import { SparseSet } from '../sparse_set';
import { Table } from './base';
import { ThinColumn } from './thin_column';

/**
 * A builder type for constructing Tables.
 *
 * Usage:
 * ```typescript
 * const builder = TableBuilder.new()
 *   .addColumn(componentInfo1)
 *   .addColumn(componentInfo2)
 *   .build();
 * ```
 */
export class TableBuilder {
  private __columns: SparseSet<ComponentId, ThinColumn>;

  private constructor() {
    this.__columns = new SparseSet();
  }

  /**
   * Start building a new Table with specified capacity
   */
  static new(): TableBuilder {
    const builder = new TableBuilder();
    builder.__columns = new SparseSet();
    return builder;
  }

  /**
   * Add a new column to the Table
   * @param componentInfo Information about the component to store in this column
   * @returns The builder instance for method chaining
   */
  addColumn(componentInfo: ComponentInfo): this {
    this.__columns.insert(componentInfo.id, new ThinColumn(componentInfo));
    return this;
  }

  /**
   * Build the Table
   * After this operation the builder can no longer add more columns
   * @returns The constructed Table
   */
  build(): Table {
    return new Table(this.__columns.intoImmutable());
  }
}
