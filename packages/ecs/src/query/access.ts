import { FixedBitSet, NOT_IMPLEMENTED } from '@sciurus/utils';
import { Clone, derive, Enum, Eq, iter, variant, Vec } from 'rustable';
import { ComponentId } from '../component';
import { World } from '../world/base';

export interface Access extends Clone, Eq {}
/**
 * Tracks read and write access to components and resources.
 */
@derive([Clone, Eq])
export class Access {
  // All accessed components, or forbidden components if componentReadAndWritesInverted is set
  __componentReadAndWrites: FixedBitSet = new FixedBitSet();

  // All exclusively-accessed components, or components that may not be exclusively accessed if componentWritesInverted is set
  __componentWrites: FixedBitSet = new FixedBitSet();

  // All accessed resources
  __resourceReadAndWrites: FixedBitSet = new FixedBitSet();

  // The exclusively-accessed resources
  __resourceWrites: FixedBitSet = new FixedBitSet();

  // Is true if this component can read all components *except* those present in componentReadAndWrites
  componentReadAndWritesInverted: boolean = false;

  // Is true if this component can write to all components *except* those present in componentWrites
  componentWritesInverted: boolean = false;

  // Is true if this has access to all resources
  readsAllResources: boolean = false;

  // Is true if this has mutable access to all resources. If this is true, then readsAll must also be true
  writesAllResources: boolean = false;

  // Components that are not accessed, but whose presence in an archetype affect query results
  __archetypal: FixedBitSet = new FixedBitSet();

  /**
   * Creates a new empty access pattern.
   */
  static new(): Access {
    return new Access();
  }

  /**
   * Adds read access to a component by its sparse set index.
   */
  addComponentSparseSetIndexRead(index: number): void {
    if (!this.componentReadAndWritesInverted) {
      this.__componentReadAndWrites.growAndInsert(index);
    } else if (index < this.__componentReadAndWrites.len()) {
      this.__componentReadAndWrites.remove(index);
    }
  }

  /**
   * Adds write access to a component by its sparse set index.
   */
  addComponentSparseSetIndexWrite(index: number): void {
    if (!this.componentWritesInverted) {
      this.__componentWrites.growAndInsert(index);
    } else if (index < this.__componentWrites.len()) {
      this.__componentWrites.remove(index);
    }
  }

  /**
   * Adds read access to the given component.
   */
  addComponentRead(componentId: ComponentId): void {
    this.addComponentSparseSetIndexRead(componentId);
  }

  /**
   * Adds write access to the given component.
   */
  addComponentWrite(componentId: ComponentId): void {
    this.addComponentSparseSetIndexRead(componentId);
    this.addComponentSparseSetIndexWrite(componentId);
  }

  /**
   * Adds read access to the given resource.
   */
  addResourceRead(resourceId: number): void {
    this.__resourceReadAndWrites.growAndInsert(resourceId);
  }

  /**
   * Adds write access to the given resource.
   */
  addResourceWrite(resourceId: number): void {
    this.__resourceReadAndWrites.growAndInsert(resourceId);
    this.__resourceWrites.growAndInsert(resourceId);
  }

  /**
   * Removes read access to a component by its sparse set index.
   */
  removeComponentSparseSetIndexRead(index: number): void {
    if (this.componentReadAndWritesInverted) {
      this.__componentReadAndWrites.growAndInsert(index);
    } else if (index < this.__componentReadAndWrites.len()) {
      this.__componentReadAndWrites.remove(index);
    }
  }

  /**
   * Removes write access to a component by its sparse set index.
   */
  removeComponentSparseSetIndexWrite(index: number): void {
    if (this.componentWritesInverted) {
      this.__componentWrites.growAndInsert(index);
    } else if (index < this.__componentWrites.len()) {
      this.__componentWrites.remove(index);
    }
  }

  /**
   * Removes read access to the given component.
   */
  removeComponentRead(componentId: ComponentId): void {
    this.removeComponentSparseSetIndexWrite(componentId);
    this.removeComponentSparseSetIndexRead(componentId);
  }

  /**
   * Removes write access to the given component.
   *
   * Because this method corresponds to the set difference operator ∖, it can
   * create complicated logical formulas that you should verify correctness
   * of. For example, A ∪ (B ∖ A) isn't equivalent to (A ∪ B) ∖ A, so you
   * can't replace a call to `removeComponentWrite` followed by a call to
   * `extend` with a call to `extend` followed by a call to
   * `removeComponentWrite`.
   */
  removeComponentWrite(componentId: ComponentId): void {
    this.removeComponentSparseSetIndexWrite(componentId);
  }

  /**
   * Adds an archetypal access to the given component.
   */
  addArchetypal(componentId: ComponentId): void {
    this.__archetypal.growAndInsert(componentId);
  }

  /**
   * Returns true if this access pattern has read access to the given component.
   */
  hasComponentRead(componentId: number): boolean {
    return (
      this.componentReadAndWritesInverted !== this.__componentReadAndWrites.contains(componentId)
    );
  }
  /**
   * Returns true if this access pattern has any component reads.
   */
  hasAnyComponentRead(): boolean {
    return this.componentReadAndWritesInverted || !this.__componentReadAndWrites.isClear();
  }

  /**
   * Returns true if this access pattern has write access to the given component.
   */
  hasComponentWrite(componentId: number): boolean {
    return this.componentWritesInverted !== this.__componentWrites.contains(componentId);
  }
  /**
   * Returns true if this access pattern has any component writes.
   */
  hasAnyComponentWrite(): boolean {
    return this.componentWritesInverted || !this.__componentWrites.isClear();
  }

  /**
   * Returns true if this access pattern has read access to the given resource.
   */
  hasResourceRead(resourceId: number): boolean {
    return this.readsAllResources || this.__resourceReadAndWrites.contains(resourceId);
  }

  /**
   * Returns true if this access pattern has write access to the given resource.
   */
  hasResourceWrite(resourceId: number): boolean {
    return this.writesAllResources || this.__resourceWrites.contains(resourceId);
  }

  /**
   * Returns true if this access pattern has any resource read access.
   */
  hasAnyResourceRead(): boolean {
    return this.readsAllResources || !this.__resourceReadAndWrites.isClear();
  }

  /**
   * Returns true if this access pattern has any resource write access.
   */
  hasAnyResourceWrite(): boolean {
    return this.writesAllResources || !this.__resourceWrites.isClear();
  }

  /**
   * Returns true if this has an archetypal access to the given component.
   */
  hasArchetypal(componentId: number): boolean {
    return this.__archetypal.contains(componentId);
  }

  /**
   * Sets this as having access to all components.
   */
  readAllComponents(): void {
    this.componentReadAndWritesInverted = true;
    this.__componentReadAndWrites.clear();
  }

  /**
   * Sets this as having mutable access to all components.
   */
  writeAllComponents(): void {
    this.readAllComponents();
    this.componentWritesInverted = true;
    this.__componentWrites.clear();
  }

  /**
   * Sets this as having access to all resources.
   */
  readAllResources(): void {
    this.readsAllResources = true;
  }

  /**
   * Sets this as having mutable access to all resources.
   */
  writeAllResources(): void {
    this.readsAllResources = true;
    this.writesAllResources = true;
  }

  /**
   * Sets this as having access to all indexed elements.
   */
  readAll(): void {
    this.readAllComponents();
    this.readAllResources();
  }

  /**
   * Sets this as having mutable access to all indexed elements.
   */
  writeAll(): void {
    this.writeAllComponents();
    this.writeAllResources();
  }

  /**
   * Returns true if this has access to all components.
   */
  hasReadAllComponents(): boolean {
    return this.componentReadAndWritesInverted && this.__componentReadAndWrites.isClear();
  }

  /**
   * Returns true if this has write access to all components.
   */
  hasWriteAllComponents(): boolean {
    return this.componentWritesInverted && this.__componentWrites.isClear();
  }

  /**
   * Returns true if this has access to all resources.
   */
  hasReadAllResources(): boolean {
    return this.readsAllResources;
  }

  /**
   * Returns true if this has write access to all resources.
   */
  hasWriteAllResources(): boolean {
    return this.writesAllResources;
  }

  /**
   * Returns true if this has access to all indexed elements.
   */
  hasReadAll(): boolean {
    return this.hasReadAllComponents() && this.hasReadAllResources();
  }

  /**
   * Returns true if this has write access to all indexed elements.
   */
  hasWriteAll(): boolean {
    return this.hasWriteAllComponents() && this.hasWriteAllResources();
  }

  /**
   * Returns true if this access pattern conflicts with another access pattern.
   */
  isComponentsCompatible(other: Access): boolean {
    // Check write conflicts in both directions
    for (const [lhsWrites, rhsReadsAndWrites, lhsWritesInverted, rhsReadsAndWritesInverted] of [
      [
        this.__componentWrites,
        other.__componentReadAndWrites,
        this.componentWritesInverted,
        other.componentReadAndWritesInverted,
      ],
      [
        other.__componentWrites,
        this.__componentReadAndWrites,
        other.componentWritesInverted,
        this.componentReadAndWritesInverted,
      ],
    ] as [FixedBitSet, FixedBitSet, boolean, boolean][]) {
      if (lhsWritesInverted && rhsReadsAndWritesInverted) {
        return false;
      }
      if (!lhsWritesInverted && rhsReadsAndWritesInverted) {
        if (!lhsWrites.isSubset(rhsReadsAndWrites)) {
          return false;
        }
      }
      if (lhsWritesInverted && !rhsReadsAndWritesInverted) {
        if (!rhsReadsAndWrites.isSubset(lhsWrites)) {
          return false;
        }
      }
      if (!lhsWritesInverted && !rhsReadsAndWritesInverted) {
        if (!lhsWrites.isDisjoint(rhsReadsAndWrites)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns true if this access pattern conflicts with another access pattern for resources.
   */
  isResourcesCompatible(other: Access): boolean {
    if (this.writesAllResources) {
      return !other.hasAnyResourceRead();
    }

    if (other.writesAllResources) {
      return !this.hasAnyResourceRead();
    }

    if (this.readsAllResources) {
      return !other.hasAnyResourceWrite();
    }

    if (other.readsAllResources) {
      return !this.hasAnyResourceWrite();
    }

    return (
      this.__resourceWrites.isDisjoint(other.__resourceReadAndWrites) &&
      other.__resourceWrites.isDisjoint(this.__resourceReadAndWrites)
    );
  }

  /**
   * Returns true if this access pattern conflicts with another access pattern.
   */
  isCompatible(other: Access): boolean {
    return this.isComponentsCompatible(other) && this.isResourcesCompatible(other);
  }

  /**
   * Returns true if this access pattern is a subset of another access pattern for components.
   */
  isSubsetComponents(other: Access): boolean {
    for (const [ourComponents, theirComponents, ourComponentsInverted, theirComponentsInverted] of [
      [
        this.__componentReadAndWrites,
        other.__componentReadAndWrites,
        this.componentReadAndWritesInverted,
        other.componentReadAndWritesInverted,
      ],
      [
        this.__componentWrites,
        other.__componentWrites,
        this.componentWritesInverted,
        other.componentWritesInverted,
      ],
    ] as [FixedBitSet, FixedBitSet, boolean, boolean][]) {
      if (ourComponentsInverted && theirComponentsInverted) {
        if (!theirComponents.isSubset(ourComponents)) {
          return false;
        }
      } else if (ourComponentsInverted && !theirComponentsInverted) {
        return false;
      } else if (!ourComponentsInverted && theirComponentsInverted) {
        if (!ourComponents.isDisjoint(theirComponents)) {
          return false;
        }
      } else if (!ourComponentsInverted && !theirComponentsInverted) {
        if (!ourComponents.isSubset(theirComponents)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns true if this access pattern is a subset of another access pattern for resources.
   */
  isSubsetResources(other: Access): boolean {
    if (this.writesAllResources) {
      return other.writesAllResources;
    }

    if (other.writesAllResources) {
      return true;
    }

    if (this.readsAllResources) {
      return other.readsAllResources;
    }

    if (other.readsAllResources) {
      return this.__resourceWrites.isSubset(other.__resourceWrites);
    }

    return (
      this.__resourceReadAndWrites.isSubset(other.__resourceReadAndWrites) &&
      this.__resourceWrites.isSubset(other.__resourceWrites)
    );
  }

  /**
   * Returns true if this access pattern is a subset of another access pattern.
   */
  isSubset(other: Access): boolean {
    return this.isSubsetComponents(other) && this.isSubsetResources(other);
  }

  /**
   * Removes all writes.
   */
  clearWrites(): void {
    this.writesAllResources = false;
    this.componentWritesInverted = false;
    this.__componentWrites.clear();
    this.__resourceWrites.clear();
  }

  /**
   * Clears all access patterns.
   */
  clear(): void {
    this.readsAllResources = false;
    this.writesAllResources = false;
    this.componentReadAndWritesInverted = false;
    this.componentWritesInverted = false;
    this.__componentReadAndWrites.clear();
    this.__componentWrites.clear();
    this.__resourceReadAndWrites.clear();
    this.__resourceWrites.clear();
    this.__archetypal.clear();
  }

  /**
   * Adds all access from other.
   */
  extend(other: Access): void {
    const componentReadAndWritesInverted =
      this.componentReadAndWritesInverted || other.componentReadAndWritesInverted;
    const componentWritesInverted = this.componentWritesInverted || other.componentWritesInverted;

    // Handle component read and writes
    if (this.componentReadAndWritesInverted && other.componentReadAndWritesInverted) {
      this.__componentReadAndWrites.intersectWith(other.__componentReadAndWrites);
    } else if (this.componentReadAndWritesInverted && !other.componentReadAndWritesInverted) {
      this.__componentReadAndWrites.differenceWith(other.__componentReadAndWrites);
    } else if (!this.componentReadAndWritesInverted && other.componentReadAndWritesInverted) {
      this.__componentReadAndWrites.grow(
        Math.max(this.__componentReadAndWrites.len(), other.__componentReadAndWrites.len()),
      );
      this.__componentReadAndWrites.toggleRange(0, this.__componentReadAndWrites.len());
      this.__componentReadAndWrites.intersectWith(other.__componentReadAndWrites);
    } else {
      this.__componentReadAndWrites.unionWith(other.__componentReadAndWrites);
    }

    // Handle component writes
    if (this.componentWritesInverted && other.componentWritesInverted) {
      this.__componentWrites.intersectWith(other.__componentWrites);
    } else if (this.componentWritesInverted && !other.componentWritesInverted) {
      this.__componentWrites.differenceWith(other.__componentWrites);
    } else if (!this.componentWritesInverted && other.componentWritesInverted) {
      this.__componentWrites.grow(
        Math.max(this.__componentWrites.len(), other.__componentWrites.len()),
      );
      this.__componentWrites.toggleRange(0, this.__componentWrites.len());
      this.__componentWrites.intersectWith(other.__componentWrites);
    } else {
      this.__componentWrites.unionWith(other.__componentWrites);
    }

    this.readsAllResources = this.readsAllResources || other.readsAllResources;
    this.writesAllResources = this.writesAllResources || other.writesAllResources;
    this.componentReadAndWritesInverted = componentReadAndWritesInverted;
    this.componentWritesInverted = componentWritesInverted;
    this.__resourceReadAndWrites.unionWith(other.__resourceReadAndWrites);
    this.__resourceWrites.unionWith(other.__resourceWrites);
    this.__archetypal.unionWith(other.__archetypal);
  }

  getComponentConflicts(other: Access): AccessConflicts {
    const conflicts = new FixedBitSet();

    // We have a conflict if we write and they read or write, or if they
    // write and we read or write
    const cases = [
      {
        lhsWrites: this.__componentWrites,
        rhsReadsAndWrites: other.__componentReadAndWrites,
        lhsWritesInverted: this.componentWritesInverted,
        rhsReadsAndWritesInverted: other.componentReadAndWritesInverted,
      },
      {
        lhsWrites: other.__componentWrites,
        rhsReadsAndWrites: this.__componentReadAndWrites,
        lhsWritesInverted: other.componentWritesInverted,
        rhsReadsAndWritesInverted: this.componentReadAndWritesInverted,
      },
    ];

    for (const {
      lhsWrites,
      rhsReadsAndWrites,
      lhsWritesInverted,
      rhsReadsAndWritesInverted,
    } of cases) {
      // There's no way to do this without a temporary.
      // Neither CNF nor DNF allows us to avoid one.
      let tempConflicts: FixedBitSet;

      if (lhsWritesInverted && rhsReadsAndWritesInverted) {
        return AccessConflicts.All();
      } else if (!lhsWritesInverted && rhsReadsAndWritesInverted) {
        tempConflicts = lhsWrites.difference(rhsReadsAndWrites);
      } else if (lhsWritesInverted && !rhsReadsAndWritesInverted) {
        tempConflicts = rhsReadsAndWrites.difference(lhsWrites);
      } else {
        tempConflicts = lhsWrites.intersection(rhsReadsAndWrites);
      }

      conflicts.unionWith(tempConflicts);
    }

    return AccessConflicts.Individual(conflicts);
  }

  /**
   * Returns all conflicts between this access pattern and another access pattern.
   */
  getConflicts(other: Access): AccessConflicts {
    let conflicts: FixedBitSet;

    // First check component conflicts
    const componentConflicts = this.getComponentConflicts(other);

    if (componentConflicts.isAll()) {
      return AccessConflicts.All();
    }
    conflicts = componentConflicts.match({ Individual: (conflicts) => conflicts });

    // Check resource conflicts
    if (this.readsAllResources) {
      if (other.writesAllResources) {
        return AccessConflicts.All();
      }
      // Add all of other's resource writes to conflicts
      conflicts.extend(other.__resourceWrites.ones());
    }

    if (other.readsAllResources) {
      if (this.writesAllResources) {
        return AccessConflicts.All();
      }
      // Add all of our resource writes to conflicts
      conflicts.extend(this.__resourceWrites.ones());
    }

    if (this.writesAllResources) {
      // Add all of other's resource reads/writes to conflicts
      conflicts.extend(other.__resourceReadAndWrites.ones());
    }

    if (other.writesAllResources) {
      // Add all of our resource reads/writes to conflicts
      conflicts.extend(this.__resourceReadAndWrites.ones());
    }

    conflicts.extend(this.__resourceWrites.intersection(other.__resourceReadAndWrites).ones());
    conflicts.extend(this.__resourceReadAndWrites.intersection(other.__resourceWrites).ones());

    return AccessConflicts.Individual(conflicts);
  }

  /**
   * Returns an iterator over the indices of resources this has access to.
   */
  resourceReadAndWrites(): Iterable<number> {
    return this.__resourceReadAndWrites.ones();
  }

  /**
   * Returns an iterator over the indices of resources this has non-exclusive access to.
   */
  resourceReads(): Iterable<number> {
    const reads = new FixedBitSet();
    reads.unionWith(this.__resourceReadAndWrites);
    reads.differenceWith(this.__resourceWrites);
    return reads.ones();
  }

  /**
   * Returns an iterator over the indices of resources this has exclusive access to.
   */
  resourceWrites(): Iterable<number> {
    return this.__resourceWrites.ones();
  }

  /**
   * Returns an iterator over the indices of archetypal components this has access to.
   */
  archetypal(): Iterable<number> {
    return this.__archetypal.ones();
  }

  /**
   * Returns an iterator over the component IDs that this Access either reads and writes or can't read or write,
   * along with a flag indicating whether the list consists of accessible (false) or inaccessible (true) components.
   *
   * @deprecated This method exposes internal implementation details and should not be used.
   * Prefer managing your own lists of accessible components instead.
   */
  componentReadsAndWrites(): [Iterable<number>, boolean] {
    return [this.__componentReadAndWrites.ones(), this.componentReadAndWritesInverted];
  }

  /**
   * Returns an iterator over the component IDs that this Access either writes or can't write,
   * along with a flag indicating whether the list consists of writable (false) or non-writable (true) components.
   */
  componentWrites(): [Iterable<number>, boolean] {
    return [this.__componentWrites.ones(), this.componentWritesInverted];
  }
}

interface AccessConflictsMatch<U> {
  All: () => U;
  Individual: (conflicts: FixedBitSet) => U;
}

/**
 * Records how two accesses conflict with each other
 */
export class AccessConflicts extends Enum {
  @variant static All(): AccessConflicts {
    throw NOT_IMPLEMENTED;
  }

  @variant static Individual(_conflicts: FixedBitSet): AccessConflicts {
    throw NOT_IMPLEMENTED;
  }

  match<U>(patterns: Partial<AccessConflictsMatch<U>>): U {
    return super.match(patterns, {
      All: (): U => {
        return undefined as any;
      },
      Individual: (_conflicts): U => {
        return undefined as any;
      },
    });
  }

  isAll(): boolean {
    return this.is('All');
  }

  isIndividual(): boolean {
    return this.is('Individual');
  }

  add(other: AccessConflicts): void {
    this.match({
      All: () => {},
      Individual: (conflicts) => {
        other.match({
          All: () => {
            this.replace(AccessConflicts.All() as any);
          },
          Individual: (otherConflicts) => {
            conflicts.extend(otherConflicts.ones());
          },
        });
      },
    });
  }

  isEmpty(): boolean {
    return this.match({
      All: () => false,
      Individual: (conflicts) => conflicts.isEmpty(),
    });
  }

  formatConflictList(world: World): string {
    return this.match({
      All: () => '',
      Individual: (indices) =>
        iter(indices.ones())
          .map((index) => {
            const componentInfo = world.components.getInfo(index).unwrap();
            return componentInfo.name;
          })
          .collect()
          .join(', '),
    });
  }

  static empty(): AccessConflicts {
    return AccessConflicts.Individual(new FixedBitSet());
  }
}
/**
 * A filtered access pattern.
 */
export class FilteredAccess extends Access {
  /**
   * The filter sets to express `With` or `Without` clauses in disjunctive normal form.
   * For example: `Or<(With<A>, With<B>)>`.
   * Filters like `(With<A>, Or<(With<B>, Without<C>)>` are expanded into `Or<((With<A>, With<B>), (With<A>, Without<C>))>`.
   */
  filterSets: Vec<AccessFilters> = Vec.from([new AccessFilters()]);

  /**
   * The components that are required.
   */
  required: FixedBitSet = new FixedBitSet();

  /**
   * Creates a new empty filtered access pattern.
   */
  static new(): FilteredAccess {
    return new FilteredAccess();
  }

  /**
   * Creates a FilteredAccess that matches everything.
   * This is the equivalent of a `TRUE` logic atom.
   */
  static matchesEverything(): FilteredAccess {
    return new FilteredAccess();
  }

  /**
   * Creates a FilteredAccess that matches nothing.
   * This is the equivalent of a `FALSE` logic atom.
   */
  static matchesNothing(): FilteredAccess {
    const access = new FilteredAccess();
    access.filterSets = Vec.new();
    return access;
  }

  /**
   * Returns a reference to the underlying unfiltered access.
   */
  access(): Access {
    return this;
  }

  /**
   * Returns a mutable reference to the underlying unfiltered access.
   */
  accessMut(): Access {
    return this;
  }

  /**
   * Adds read access to the component given by index.
   */
  addComponentRead(componentId: number): void {
    super.addComponentRead(componentId);
    this.addRequired(componentId);
    this.andWith(componentId);
  }

  /**
   * Adds write access to the component given by index.
   */
  addComponentWrite(componentId: number): void {
    super.addComponentWrite(componentId);
    this.addRequired(componentId);
    this.andWith(componentId);
  }

  /**
   * Adds a required component by its index.
   */
  addRequired(componentId: number): void {
    this.required.growAndInsert(componentId);
  }

  /**
   * Adds a `With` filter: corresponds to a conjunction (AND) operation.
   *
   * Suppose we begin with `Or<(With<A>, With<B>)>`, which is represented by an array of two `AccessFilter` instances.
   * Adding `AND With<C>` via this method transforms it into the equivalent of `Or<((With<A>, With<C>), (With<B>, With<C>))>`.
   */
  andWith(componentId: number): void {
    for (const filter of this.filterSets) {
      filter.with.growAndInsert(componentId);
    }
  }

  /**
   * Adds a `Without` filter: corresponds to a conjunction (AND) operation.
   *
   * Suppose we begin with `Or<(With<A>, With<B>)>`, which is represented by an array of two `AccessFilter` instances.
   * Adding `AND Without<C>` via this method transforms it into the equivalent of `Or<((With<A>, Without<C>), (With<B>, Without<C>))>`.
   */
  andWithout(componentId: number): void {
    for (const filter of this.filterSets) {
      filter.without.growAndInsert(componentId);
    }
  }

  /**
   * Appends an array of filters: corresponds to a disjunction (OR) operation.
   *
   * As the underlying array of filters represents a disjunction,
   * where each element (`AccessFilters`) represents a conjunction,
   * we can simply append to the array.
   */
  appendOr(other: FilteredAccess): void {
    this.filterSets.extend(other.filterSets);
  }

  /**
   * Adds all of the accesses from other.
   */
  extendAccess(other: FilteredAccess): void {
    super.extend(other);
  }

  /**
   * Returns true if this and other can be active at the same time.
   */
  isCompatible(other: FilteredAccess): boolean {
    // Resources are read from the world rather than the filtered archetypes,
    // so they must be compatible even if the filters are disjoint.
    if (!this.isResourcesCompatible(other)) {
      return false;
    }

    if (this.isComponentsCompatible(other)) {
      return true;
    }

    // If the access instances are incompatible, we want to check that whether filters can
    // guarantee that queries are disjoint.
    // Since the `filter_sets` array represents a Disjunctive Normal Form formula ("ORs of ANDs"),
    // we need to make sure that each filter set (ANDs) rule out every filter set from the `other` instance.
    return this.filterSets
      .iter()
      .all((filter) =>
        other.filterSets.iter().all((otherFilter) => filter.isRuledOutBy(otherFilter)),
      );
  }

  /**
   * Returns a vector of elements that this and other cannot access at the same time.
   */
  getConflicts(other: FilteredAccess): AccessConflicts {
    if (!this.isCompatible(other)) {
      // filters are disjoint, so we can just look at the unfiltered intersection
      return super.getConflicts(other);
    }
    return AccessConflicts.empty();
  }

  /**
   * Adds all access and filters from other.
   *
   * Corresponds to a conjunction operation (AND) for filters.
   *
   * Extending `Or<(With<A>, Without<B>)>` with `Or<(With<C>, Without<D>)>` will result in
   * `Or<((With<A>, With<C>), (With<A>, Without<D>), (Without<B>, With<C>), (Without<B>, Without<D>))>`.
   */
  extend(other: FilteredAccess): void {
    super.extend(other);
    this.required.unionWith(other.required);

    // We can avoid allocating a new array of bitsets if other contains just a single set of filters:
    // in this case we can short-circuit by performing an in-place union for each bitset.
    if (other.filterSets.len() === 1) {
      for (const filter of this.filterSets) {
        filter.with.unionWith(other.filterSets[0].with);
        filter.without.unionWith(other.filterSets[0].without);
      }
      return;
    }

    const newFilters = Vec.new<AccessFilters>();
    for (const filter of this.filterSets) {
      for (const otherFilter of other.filterSets) {
        const newFilter = new AccessFilters();
        newFilter.with = filter.with.clone();
        newFilter.without = filter.without.clone();
        newFilter.with.unionWith(otherFilter.with);
        newFilter.without.unionWith(otherFilter.without);
        newFilters.push(newFilter);
      }
    }
    this.filterSets = newFilters;
  }

  /**
   * Returns true if this access pattern is a subset of another.
   */
  isSubset(other: FilteredAccess): boolean {
    return this.required.isSubset(other.required) && super.isSubset(other);
  }

  /**
   * Returns an iterator over the indices of the elements that this access filters for.
   */
  withFilters(): Iterable<number> {
    return this.filterSets.iter().flatMap((f) => f.with.ones());
  }

  /**
   * Returns an iterator over the indices of the elements that this access filters out.
   */
  withoutFilters(): Iterable<number> {
    return this.filterSets.iter().flatMap((f) => f.without.ones());
  }

  /**
   * Clears all access patterns and filters.
   */
  clear(): void {
    super.clear();
    this.required.clear();
    this.filterSets = Vec.from([new AccessFilters()]);
  }
}

/**
 * A collection of access patterns.
 */
export class FilteredAccessSet {
  /**
   * The combined access of all filters in this set.
   */
  private __combinedAccess: Access = new Access();

  /**
   * The set of access of each individual filter.
   */
  private __filteredAccesses: Vec<FilteredAccess> = Vec.new();

  /**
   * Creates a new empty access set.
   */
  static new(): FilteredAccessSet {
    return new FilteredAccessSet();
  }

  /**
   * Returns a reference to the unfiltered access of the entire set.
   */
  get combinedAccess(): Access {
    return this.__combinedAccess;
  }

  /**
   * Returns true if this and other can be active at the same time.
   */
  isCompatible(other: FilteredAccessSet): boolean {
    if (this.__combinedAccess.isCompatible(other.__combinedAccess)) {
      return true;
    }

    for (const filtered of this.__filteredAccesses) {
      for (const otherFiltered of other.__filteredAccesses) {
        if (!filtered.isCompatible(otherFiltered)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns a vector of elements that this set and other cannot access at the same time.
   */
  getConflicts(other: FilteredAccessSet): AccessConflicts {
    if (this.__combinedAccess.isCompatible(other.__combinedAccess)) {
      return AccessConflicts.empty();
    }

    let conflicts = new FixedBitSet();
    for (const filtered of this.__filteredAccesses) {
      for (const otherFiltered of other.__filteredAccesses) {
        if (!filtered.isCompatible(otherFiltered)) {
          return AccessConflicts.All();
        }
      }
    }
    return AccessConflicts.Individual(conflicts);
  }

  /**
   * Returns a vector of elements that this set and the filtered access cannot access at the same time.
   */
  getConflictsSingle(filteredAccess: FilteredAccess): AccessConflicts {
    if (this.__combinedAccess.isCompatible(filteredAccess)) {
      return AccessConflicts.empty();
    }

    let conflicts = new FixedBitSet();
    for (const filtered of this.__filteredAccesses) {
      if (!filtered.isCompatible(filteredAccess)) {
        return AccessConflicts.All();
      }
    }
    return AccessConflicts.Individual(conflicts);
  }

  /**
   * Adds the filtered access to the set.
   */
  add(filteredAccess: FilteredAccess): void {
    this.__combinedAccess.extend(filteredAccess);
    this.__filteredAccesses.push(filteredAccess);
  }

  /**
   * Adds a read access to a resource to the set.
   */
  addUnfilteredResourceRead(resourceId: number): void {
    const filter = new FilteredAccess();
    filter.addResourceRead(resourceId);
    this.add(filter);
  }

  /**
   * Adds a write access to a resource to the set.
   */
  addUnfilteredResourceWrite(resourceId: number): void {
    const filter = new FilteredAccess();
    filter.addResourceWrite(resourceId);
    this.add(filter);
  }

  /**
   * Adds read access to all resources to the set.
   */
  addUnfilteredReadAllResources(): void {
    const filter = new FilteredAccess();
    filter.readAllResources();
    this.add(filter);
  }

  /**
   * Adds write access to all resources to the set.
   */
  addUnfilteredWriteAllResources(): void {
    const filter = new FilteredAccess();
    filter.writeAllResources();
    this.add(filter);
  }

  /**
   * Adds all of the accesses from the passed set to this.
   */
  extend(filteredAccessSet: FilteredAccessSet): void {
    this.__combinedAccess.extend(filteredAccessSet.__combinedAccess);
    this.__filteredAccesses.extend(filteredAccessSet.__filteredAccesses);
  }

  /**
   * Marks the set as reading all possible indices.
   */
  readAll(): void {
    this.__combinedAccess.readAll();
  }

  /**
   * Marks the set as writing all indices.
   */
  writeAll(): void {
    this.__combinedAccess.writeAll();
  }

  /**
   * Removes all accesses stored in this set.
   */
  clear(): void {
    this.__combinedAccess.clear();
    this.__filteredAccesses.clear();
  }
}

export interface AccessFilters extends Clone, Eq {}
/**
 * A collection of access filters.
 */
@derive([Clone, Eq])
export class AccessFilters {
  /**
   * Components that must be present.
   */
  with: FixedBitSet = new FixedBitSet();

  /**
   * Components that must not be present.
   */
  without: FixedBitSet = new FixedBitSet();

  /**
   * Returns true if this filter is ruled out by another filter.
   */
  isRuledOutBy(other: AccessFilters): boolean {
    return !this.with.isDisjoint(other.without) || !this.without.isDisjoint(other.with);
  }
}
