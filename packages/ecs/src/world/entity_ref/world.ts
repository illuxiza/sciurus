import { getCaller, INVALID_VALUE } from '@sciurus/utils';
import {
  Constructor,
  defaultVal,
  None,
  Option,
  Result,
  Some,
  typeId,
  TypeId,
  useTrait,
  Vec,
} from 'rustable';
import { Archetype, ArchetypeId, Archetypes } from '../../archetype';
import { Bundle, BundleId, BundleInfo, BundleInserter, InsertMode } from '../../bundle';
import { ComponentTicks, Mut, Ref } from '../../change_detection';
import { ComponentId } from '../../component';
import { Entities, Entity, EntityLocation } from '../../entity';
import { Observer } from '../../observer/runner';
import { Storages, StorageType } from '../../storage';
import { IntoObserverSystem } from '../../system';
import { World } from '../base';
import { ON_DESPAWN, ON_REMOVE, ON_REPLACE } from '../component_constants';
import { DeferredWorld } from '../deferred';
import { EntityCell } from './cell';
import { insertDynamicBundle, takeComponent } from './func';

export class EntityWorld {
  __world: World;
  __entity: Entity;
  __location: EntityLocation;

  constructor(world: World, entity: Entity, location: EntityLocation) {
    this.__world = world;
    this.__entity = entity;
    this.__location = location;
  }

  private panicDespawned(): never {
    throw new Error(`Entity ${this.__entity} does not exist in the world`);
  }

  private assertNotDespawned() {
    if (this.__location.archetypeId === INVALID_VALUE) {
      this.panicDespawned();
    }
  }

  asEntityCell(): EntityCell {
    this.assertNotDespawned();
    return new EntityCell(this.__world, this.__entity, this.__location);
  }

  get id() {
    return this.__entity;
  }

  get location() {
    this.assertNotDespawned();
    return this.__location;
  }

  get archetype(): Archetype {
    this.assertNotDespawned();
    return this.__world.archetypes.getUnchecked(this.__location.archetypeId);
  }

  contains(component: any): boolean {
    return this.containsTypeId(typeId(component));
  }

  containsId(componentId: ComponentId): boolean {
    this.assertNotDespawned();
    return this.asEntityCell().containsId(componentId);
  }

  containsTypeId(typeId: TypeId): boolean {
    this.assertNotDespawned();
    return this.asEntityCell().containsTypeId(typeId);
  }

  get<T extends object>(component: Constructor<T>): Option<T> {
    this.assertNotDespawned();
    return EntityCell.fromWorld(this).get(component);
  }

  components(query: any): any {
    return EntityCell.fromWorld(this).components(query);
  }

  getComponents(query: any): Option<any> {
    return EntityCell.fromWorld(this).getComponents(query);
  }

  getRef<T extends object>(component: Constructor<T>): Option<Ref<T>> {
    return EntityCell.fromWorld(this).getRef(component);
  }

  getMut<T extends object>(component: Constructor<T>): Option<Mut<T>> {
    return this.asEntityCell().getMutAssumeMutable(component);
  }

  getChangeTicks(component: any): Option<ComponentTicks> {
    return EntityCell.fromWorld(this).getChangeTicks(component);
  }

  getChangeTicksById(componentId: ComponentId): Option<ComponentTicks> {
    return EntityCell.fromWorld(this).getChangeTicksById(componentId);
  }

  getById(componentId: Iterable<ComponentId>): Result<any[], Error> {
    return EntityCell.fromWorld(this).fetchById(componentId);
  }

  insert<T extends object>(bundle: T, caller?: string): this {
    return this.insertWithCaller(bundle, InsertMode.Replace, caller);
  }

  insertIfNew<T extends object>(bundle: T, caller?: string): this {
    return this.insertWithCaller(bundle, InsertMode.Keep, caller);
  }

  insertWithCaller<T extends object>(b: T, mode: InsertMode, caller?: string): this {
    this.assertNotDespawned();
    const changeTick = this.__world.changeTick;
    const bundleInserter = BundleInserter.new(
      b,
      this.__world,
      this.__location.archetypeId,
      changeTick,
    );
    this.__location = bundleInserter.insert(this.__entity, this.__location, b, mode, caller);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  insertById(componentId: ComponentId, component: any, caller?: string): this {
    this.assertNotDespawned();
    const changeTick = this.__world.changeTick;
    const bundleId = this.__world.bundles.initComponentInfo(this.__world.components, componentId);
    const storageType = this.__world.bundles.getStorageUnchecked(bundleId);
    const bundleInserter = BundleInserter.newWithId(
      this.__world,
      this.__location.archetypeId,
      bundleId,
      changeTick,
    );
    this.__location = insertDynamicBundle(
      bundleInserter,
      this.__entity,
      this.__location,
      [component],
      [storageType],
      caller,
    );
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  insertByIds(
    componentIds: Iterable<ComponentId>,
    iterComponents: Iterable<any>,
    caller?: string,
  ): this {
    this.assertNotDespawned();
    const changeTick = this.__world.changeTick;
    const bundleId = this.__world.bundles.initDynamicInfo(
      this.__world.components,
      Vec.from(componentIds),
    );
    let storageTypes = this.__world.bundles.getStoragesUnchecked(bundleId);
    const bundleInserter = BundleInserter.newWithId(
      this.__world,
      this.__location.archetypeId,
      bundleId,
      changeTick,
    );
    this.__location = insertDynamicBundle(
      bundleInserter,
      this.__entity,
      this.__location,
      iterComponents,
      storageTypes,
      caller,
    );
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  take<T extends object>(bundle: Constructor<T>): Option<T> {
    this.assertNotDespawned();
    const world = this.__world;
    const bundleId = world.bundles.registerInfo(bundle, world.components, world.storages);
    const bundleInfo = world.bundles.getUnchecked(bundleId);
    const oldLocation = this.__location;
    const newArchetypeId = bundleInfo.removeBundleFromArchetype(
      world.archetypes,
      world.storages,
      world.components,
      world.observers,
      oldLocation.archetypeId,
      false,
    );

    if (newArchetypeId.isNone()) {
      return None;
    }

    if (newArchetypeId.unwrap() === oldLocation.archetypeId) {
      return None;
    }

    const entity = this.__entity;
    const oldArchetype = world.archetypes.getUnchecked(oldLocation.archetypeId);

    triggerOnReplaceAndOnRemoveHooksAndObservers(
      world.intoDeferred(),
      oldArchetype,
      entity,
      bundleInfo,
    );

    let bundleComponents = bundleInfo.iterExplicitComponents();
    const result = useTrait(bundle, Bundle)
      .staticBundleType()
      .fromComponents(world.storages, (storages) => {
        const componentId = bundleComponents.next().unwrap();
        return takeComponent(
          storages,
          world.components,
          world.removedComponents,
          componentId,
          entity,
          oldLocation,
        );
      });

    this.moveEntityFromRemove(
      entity,
      this.__location,
      oldLocation.archetypeId,
      oldLocation,
      world.entities,
      world.archetypes,
      world.storages,
      newArchetypeId.unwrap(),
    );

    world.flush();
    this.updateLocation();
    return Some(result);
  }

  private moveEntityFromRemove(
    entity: Entity,
    selfLocation: EntityLocation,
    oldArchetypeId: ArchetypeId,
    oldLocation: EntityLocation,
    entities: Entities,
    archetypes: Archetypes,
    storages: Storages,
    newArchetypeId: ArchetypeId,
  ) {
    const oldArchetype = archetypes.getUnchecked(oldArchetypeId);
    const removeResult = oldArchetype.swapRemove(oldLocation.archetypeRow);

    removeResult.swappedEntity.match({
      Some: (swappedEntity) => {
        const swappedLocation = entities.get(swappedEntity).unwrap();
        entities.set(
          swappedEntity.index,
          new EntityLocation(
            swappedLocation.archetypeId,
            oldLocation.archetypeRow,
            swappedLocation.tableId,
            swappedLocation.tableRow,
          ),
        );
      },
    });

    const oldTableRow = removeResult.tableRow;
    const oldTableId = oldArchetype.tableId;
    const newArchetype = archetypes.getUnchecked(newArchetypeId);

    let newLocation: EntityLocation;
    if (oldTableId === newArchetype.tableId) {
      newLocation = newArchetype.allocate(entity, oldTableRow);
    } else {
      const oldTable = storages.tables.getUnchecked(oldTableId);
      const newTable = storages.tables.getUnchecked(newArchetype.tableId);

      const moveResult = oldTable.moveToAndForgetMissing(oldTableRow, newTable);
      newLocation = newArchetype.allocate(entity, moveResult.newRow);

      moveResult.swappedEntity.match({
        Some: (swappedEntity) => {
          const swappedLocation = entities.get(swappedEntity).unwrap();
          entities.set(
            swappedEntity.index,
            new EntityLocation(
              swappedLocation.archetypeId,
              swappedLocation.archetypeRow,
              swappedLocation.tableId,
              oldLocation.tableRow,
            ),
          );
          archetypes
            .getUnchecked(swappedLocation.archetypeId)
            .setEntityTableRow(swappedLocation.archetypeRow, oldTableRow);
        },
      });
    }

    selfLocation = newLocation;
    entities.set(entity.index, newLocation);
  }

  private removeBundle(bundle: BundleId): EntityLocation {
    const entity = this.__entity;
    const world = this.__world;
    const location = this.__location;
    const bundleInfo = world.bundles.getUnchecked(bundle);
    const newArchetypeId = bundleInfo
      .removeBundleFromArchetype(
        world.archetypes,
        world.storages,
        world.components,
        world.observers,
        location.archetypeId,
        true,
      )
      .unwrap();

    if (newArchetypeId === location.archetypeId) {
      return location;
    }

    const oldArchetype = world.archetypes.getUnchecked(location.archetypeId);
    const deferredWorld = world.intoDeferred();

    triggerOnReplaceAndOnRemoveHooksAndObservers(deferredWorld, oldArchetype, entity, bundleInfo);

    for (const componentId of bundleInfo.iterExplicitComponents()) {
      if (oldArchetype.contains(componentId)) {
        world.removedComponents.send(componentId, entity);
        oldArchetype.getStorageType(componentId).match({
          Some: (storageType) => {
            if (storageType === StorageType.SparseSet) {
              world.storages.sparseSets.get(componentId).unwrap().remove(entity);
            }
          },
        });
      }
    }

    let newLocation = location;
    this.moveEntityFromRemove(
      entity,
      newLocation,
      location.archetypeId,
      location,
      world.entities,
      world.archetypes,
      world.storages,
      newArchetypeId,
    );

    return newLocation;
  }

  remove<T extends object>(bundle: T): this {
    this.assertNotDespawned();
    const storages = this.__world.storages;
    const components = this.__world.components;
    const bundleInfo = this.__world.bundles.registerInfo<T>(bundle, components, storages);
    this.__location = this.removeBundle(bundleInfo);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  removeWithRequires<T extends object>(bundle: T): this {
    this.assertNotDespawned();
    const storages = this.__world.storages;
    const components = this.__world.components;
    const bundles = this.__world.bundles;
    const bundleId = bundles.registerContributedBundleInfo<T>(bundle, components, storages);
    this.__location = this.removeBundle(bundleId);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  retain<T extends object>(bundle: T): this {
    this.assertNotDespawned();
    const archetypes = this.__world.archetypes;
    const storages = this.__world.storages;
    const components = this.__world.components;
    const retainedBundle = this.__world.bundles.registerInfo<T>(bundle, components, storages);
    const retainedBundleInfo = this.__world.bundles.getUnchecked(retainedBundle);
    const oldLocation = this.__location;
    const oldArchetype = archetypes.getUnchecked(oldLocation.archetypeId);
    const toRemove = oldArchetype.components
      .filter((c) => !Vec.from(retainedBundleInfo.contributedComponents()).contains(c))
      .collectInto((value) => Vec.from(value));
    const removeBundle = this.__world.bundles.initDynamicInfo(components, toRemove);
    this.__location = this.removeBundle(removeBundle);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  removeById(componentId: ComponentId): this {
    this.assertNotDespawned();
    const components = this.__world.components;
    const bundleId = this.__world.bundles.initComponentInfo(components, componentId);
    this.__location = this.removeBundle(bundleId);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  removeByIds(componentIds: Iterable<ComponentId>): this {
    this.assertNotDespawned();
    const components = this.__world.components;
    const bundleId = this.__world.bundles.initDynamicInfo(components, Vec.from(componentIds));
    this.__location = this.removeBundle(bundleId);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  clear(): this {
    this.assertNotDespawned();
    const componentIds = this.archetype.components;
    const components = this.__world.components;
    const bundleId = this.__world.bundles.initDynamicInfo(components, Vec.from(componentIds));
    this.__location = this.removeBundle(bundleId);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  despawn(): void {
    this.despawnWithCaller(getCaller());
  }

  protected despawnWithCaller(caller?: string): void {
    this.assertNotDespawned();
    const world = this.__world;
    const archetype = world.archetypes.getUnchecked(this.__location.archetypeId);
    const deferredWorld = world.intoDeferred();

    if (archetype.hasDespawnObserver()) {
      deferredWorld.triggerObservers(ON_DESPAWN, this.__entity, archetype.components);
    }
    deferredWorld.triggerOnDespawn(archetype, this.__entity, archetype.components);
    if (archetype.hasReplaceObserver()) {
      deferredWorld.triggerObservers(ON_REPLACE, this.__entity, archetype.components);
    }
    deferredWorld.triggerOnReplace(archetype, this.__entity, archetype.components);
    if (archetype.hasRemoveObserver()) {
      deferredWorld.triggerObservers(ON_REMOVE, this.__entity, archetype.components);
    }
    deferredWorld.triggerOnRemove(archetype, this.__entity, archetype.components);

    for (const componentId of archetype.components) {
      world.removedComponents.send(componentId, this.__entity);
    }

    world.flushEntities();

    const location = world.entities
      .free(this.__entity)
      .expect('Entity should exist at this point.');

    const removeResult = archetype.swapRemove(location.archetypeRow);

    removeResult.swappedEntity.match({
      Some: (swappedEntity) => {
        const swappedLocation = world.entities.get(swappedEntity).unwrap();
        world.entities.set(
          swappedEntity.index,
          new EntityLocation(
            swappedLocation.archetypeId,
            location.archetypeRow,
            swappedLocation.tableId,
            swappedLocation.tableRow,
          ),
        );
      },
    });

    for (const componentId of archetype.sparseSetComponents) {
      const sparseSet = world.storages.sparseSets.get(componentId).unwrap();
      sparseSet.removeAndForget(this.__entity);
    }

    const movedEntity = world.storages.tables
      .getUnchecked(archetype.tableId)
      .swapRemove(removeResult.tableRow);

    movedEntity.match({
      Some: (movedEntity) => {
        const movedLocation = world.entities.get(movedEntity).unwrap();
        world.entities.set(
          movedEntity.index,
          new EntityLocation(
            movedLocation.archetypeId,
            movedLocation.archetypeRow,
            movedLocation.tableId,
            removeResult.tableRow,
          ),
        );
        world.archetypes
          .getUnchecked(movedLocation.archetypeId)
          .setEntityTableRow(movedLocation.archetypeRow, removeResult.tableRow);
      },
    });

    world.flush();

    if (caller) {
      world.entities.setSpawnedOrDespawnedBy(this.__entity.index, caller);
    }
  }

  flush(): Entity {
    this.__world.flush();
    return this.__entity;
  }

  world(): World {
    return this.__world;
  }

  worldScope<U>(f: (world: World) => U): U {
    const result = f(this.__world);
    this.updateLocation();
    return result;
  }

  updateLocation() {
    this.__location = this.__world.entities.get(this.__entity).unwrapOr(EntityLocation.INVALID);
  }

  isDespawned(): boolean {
    return this.__location.archetypeId === INVALID_VALUE;
  }

  entry<T extends Constructor>(component: T): Entry<InstanceType<T>> {
    if (this.contains(component)) {
      return new Entry(component, new OccupiedEntry(component, this));
    } else {
      return new Entry(component, new VacantEntry(this));
    }
  }

  trigger<E extends object>(event: E): this {
    this.assertNotDespawned();
    this.__world.triggerTargets(event, this.__entity);
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  observe(eventType: Constructor, bundleType: any, observer: IntoObserverSystem): this {
    this.assertNotDespawned();
    this.__world.spawn(new Observer(eventType, bundleType, observer).withEntity(this.__entity));
    this.__world.flush();
    this.updateLocation();
    return this;
  }

  spawnedBy(): string | undefined {
    return this.__world.entities.entityGetSpawnedOrDespawnedBy(this.__entity).unwrapOr(undefined);
  }
}

/**
 * A view into a single entity and component in a world, which may either be vacant or occupied.
 */
export class Entry<T extends object> {
  constructor(
    private component: Constructor<T>,
    private entry: OccupiedEntry<T> | VacantEntry<T>,
  ) {}

  isVacant(): boolean {
    return this.entry instanceof VacantEntry;
  }

  isOccupied(): boolean {
    return this.entry instanceof OccupiedEntry;
  }

  /**
   * Provides in-place mutable access to an occupied entry.
   */
  andModify(f: (component: T) => void): this {
    if (this.entry instanceof OccupiedEntry) {
      f(this.entry.getMut());
    }
    return this;
  }

  /**
   * Replaces the component of the entry, and returns an OccupiedEntry.
   */
  insertEntry(component: T): OccupiedEntry<T> {
    if (this.entry instanceof OccupiedEntry) {
      this.entry.insert(component);
      return this.entry;
    } else {
      return this.entry.insert(component);
    }
  }

  /**
   * Ensures the entry has this component by inserting the given default if empty.
   */
  orInsert(defaultValue: T): OccupiedEntry<T> {
    if (this.entry instanceof OccupiedEntry) {
      return this.entry;
    } else {
      return this.entry.insert(defaultValue);
    }
  }

  /**
   * Ensures the entry has this component by inserting the result of the default function if empty.
   */
  orInsertWith(defaultFn: () => T): OccupiedEntry<T> {
    if (this.entry instanceof OccupiedEntry) {
      return this.entry;
    } else {
      return this.entry.insert(defaultFn());
    }
  }

  /**
   * Ensures the entry has this component by inserting the default value if empty.
   */
  orDefault(): OccupiedEntry<T> {
    if (this.entry instanceof OccupiedEntry) {
      return this.entry;
    } else {
      return this.entry.insert(defaultVal(this.component));
    }
  }
}

/**
 * A view into an occupied entry in a EntityWorldMut.
 */
export class OccupiedEntry<T extends object> {
  occupied = true;
  constructor(
    private type: Constructor<T>,
    private entityWorld: EntityWorld,
  ) {}

  /**
   * Gets a reference to the component in the entry.
   */
  get(): T {
    return this.entityWorld.get(this.type).unwrap();
  }

  /**
   * Gets a mutable reference to the component in the entry.
   */
  getMut(): T {
    return this.entityWorld.getMut(this.type).unwrap();
  }

  /**
   * Replaces the component of the entry.
   */
  insert(component: T): void {
    this.entityWorld.insert(component);
  }

  /**
   * Removes the component from the entry and returns it.
   */
  take(): T {
    return this.entityWorld.take(this.type).unwrap();
  }
}

/**
 * A view into a vacant entry in a EntityWorldMut.
 */
export class VacantEntry<T extends object> {
  vacant = true;
  constructor(private entityWorld: EntityWorld) {}

  /**
   * Inserts the component into the VacantEntry and returns an OccupiedEntry.
   */
  insert(component: T): OccupiedEntry<T> {
    this.entityWorld.insert(component);
    return new OccupiedEntry<T>(component.constructor as Constructor<T>, this.entityWorld);
  }
}

function triggerOnReplaceAndOnRemoveHooksAndObservers(
  deferredWorld: DeferredWorld,
  archetype: Archetype,
  entity: Entity,
  bundleInfo: BundleInfo,
) {
  if (archetype.hasReplaceObserver()) {
    deferredWorld.triggerObservers(ON_REPLACE, entity, bundleInfo.iterExplicitComponents());
  }
  deferredWorld.triggerOnReplace(archetype, entity, bundleInfo.iterExplicitComponents());

  if (archetype.hasRemoveObserver()) {
    deferredWorld.triggerObservers(ON_REMOVE, entity, bundleInfo.iterExplicitComponents());
  }
  deferredWorld.triggerOnRemove(archetype, entity, bundleInfo.iterExplicitComponents());
}
