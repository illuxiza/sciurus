import { EMPTY_VALUE } from '@sciurus/utils';
import { HashMap, Option, Ptr, range, RustIter, Vec } from 'rustable';
import { type ComponentId, type Components } from '../component';
import { type Observers } from '../observer/collection';
import { SparseSet, type TableId } from '../storage';
import { Archetype } from './base';
import { Edges } from './edges';
import {
  ArchetypeComponentInfo,
  ArchetypeComponents,
  ArchetypeFlags,
  ArchetypeGeneration,
  type ArchetypeId,
  type ComponentIndex,
} from './types';

export class Archetypes {
  private __archetypes: Vec<Archetype>;
  private __archetypeComponentCount: number;
  private __byComponents: HashMap<ArchetypeComponents, ArchetypeId>;
  private __byComponent: ComponentIndex;

  constructor() {
    this.__archetypes = Vec.new();
    this.__archetypeComponentCount = 0;
    this.__byComponents = new HashMap();
    this.__byComponent = new HashMap();
    this.__archetypes.push(
      new Archetype(
        EMPTY_VALUE,
        EMPTY_VALUE,
        new Edges(),
        Vec.new(),
        new SparseSet<ComponentId, ArchetypeComponentInfo>().intoImmutable(),
        ArchetypeFlags.empty(),
      ),
    );
  }

  get archetypes(): Vec<Archetype> {
    return this.__archetypes;
  }

  get byComponents(): HashMap<ArchetypeComponents, ArchetypeId> {
    return this.__byComponents;
  }

  get byComponent(): ComponentIndex {
    return this.__byComponent;
  }

  gen(): ArchetypeGeneration {
    const id = this.__archetypes.len();
    return new ArchetypeGeneration(id);
  }

  len() {
    return this.__archetypes.len();
  }

  empty(): Archetype {
    return this.__archetypes.getUnchecked(EMPTY_VALUE);
  }

  newArchetypeComponentId() {
    const id = this.__archetypeComponentCount;
    this.__archetypeComponentCount += 1;
    return id;
  }

  get(id: ArchetypeId): Option<Archetype> {
    return this.__archetypes.get(id);
  }

  getUnchecked(id: ArchetypeId): Archetype {
    return this.__archetypes.getUnchecked(id);
  }

  get2(a: ArchetypeId, b: ArchetypeId): [Ptr<Archetype>, Ptr<Archetype>] {
    if (a === b) {
      throw new Error('Cannot get mutable references to the same archetype');
    }
    return [this.__archetypes.getMut(a).unwrap(), this.__archetypes.getMut(b).unwrap()];
  }

  iter(): RustIter<Archetype> {
    return this.__archetypes.iter();
  }

  getIdOrInsert(
    components: Components,
    observers: Observers,
    tableId: TableId,
    tableComponents: Vec<ComponentId>,
    sparseSetComponents: Vec<ComponentId>,
  ): ArchetypeId {
    const archetypeIdentity = new ArchetypeComponents(tableComponents, sparseSetComponents);
    const archetypes = this.__archetypes;
    const componentIndex = this.__byComponent;

    const archetypeId = this.__byComponents.entry(archetypeIdentity).orInsertWithKey((identity) => {
      const { tableComponents, sparseSetComponents } = identity;
      const id = archetypes.len();
      const tableStart = this.__archetypeComponentCount;
      this.__archetypeComponentCount += tableComponents.len();
      const tableArchetypeComponents = range(tableStart, this.__archetypeComponentCount);

      const sparseStart = this.__archetypeComponentCount;
      this.__archetypeComponentCount += sparseSetComponents.len();
      const sparseSetArchetypeComponents = range(sparseStart, this.__archetypeComponentCount);

      archetypes.push(
        Archetype.new(
          components,
          componentIndex,
          observers,
          id,
          tableId,
          tableComponents.iter().zip(tableArchetypeComponents),
          sparseSetComponents.iter().zip(sparseSetArchetypeComponents),
        ),
      );
      return id;
    });

    return archetypeId;
  }

  archetypeComponentsLen() {
    return this.__archetypeComponentCount;
  }

  clearEntities() {
    for (const archetype of this.__archetypes) {
      archetype.clearEntities();
    }
  }

  componentIndex(): ComponentIndex {
    return this.__byComponent;
  }

  updateFlags(componentId: ComponentId, flags: ArchetypeFlags, set: boolean): void {
    const archetypes = this.__byComponent.get(componentId);
    if (archetypes.isSome()) {
      for (const [archetypeId] of archetypes.unwrap()) {
        this.__archetypes.getUnchecked(archetypeId).flags.set(flags, set);
      }
    }
  }
}
