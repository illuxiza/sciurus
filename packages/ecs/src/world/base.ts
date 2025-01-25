import { getCaller, logger } from '@sciurus/utils';
import {
  Constructor,
  defaultVal,
  Enum,
  Err,
  HashMap,
  implTrait,
  None,
  Ok,
  Option,
  Ptr,
  Result,
  Some,
  stringify,
  typeId,
  useTrait,
  variant,
} from 'rustable';
import { ArchetypeId } from '../archetype';
import { Archetype } from '../archetype/base';
import { Archetypes } from '../archetype/collection';
import { Bundles } from '../bundle/collection';
import { BundleInserter } from '../bundle/insert';
import { BundleSpawner } from '../bundle/spawner';
import { InsertMode } from '../bundle/types';
import { CHECK_TICK_THRESHOLD } from '../change_detection/constants';
import { Mut, MutUntyped } from '../change_detection/mut';
import { ComponentTicks, Tick, Ticks } from '../change_detection/tick';
import { Components } from '../component/collection';
import { ComponentHooks } from '../component/hooks';
import { ComponentInfo } from '../component/info';
import { RequiredComponents } from '../component/required_components';
import { ComponentDescriptor, ComponentId, RequiredComponentsError } from '../component/types';
import { Entity } from '../entity/base';
import { Entities } from '../entity/collection';
import { EntityLocation } from '../entity/location';
import { Event, EventId, Events, SendBatchIds } from '../event';
import { Observers } from '../observer/collection';
import { ObservedBy } from '../observer/entity';
import { Observer, ObserverState } from '../observer/runner';
import { CachedComponentObservers, ObserverDescriptor, TriggerTargets } from '../observer/types';
import { QueryData } from '../query/fetch';
import { QueryFilter } from '../query/filter/base';
import { QueryState } from '../query/state';
import { RemovedComponentEvents } from '../removal_detection';
import { Schedule, Schedules } from '../schedule/base';
import { ResourceData } from '../storage/resource/data';
import { Storages } from '../storage/storages';
import { IntoSystem, SystemParam } from '../system';
import { RunSystemOnce, System } from '../system/base';
import { Commands } from '../system/commands';
import { IntoObserverSystem } from '../system/observer';
import { IntoSystemParam } from '../system/param/base';
import { ExclusiveSystemParam } from '../system/param/exclusive';
import {
  CachedSystemId,
  RegisteredSystem,
  RegisteredSystemError,
  RemovedSystem,
  SystemId,
} from '../system/registry';
import { SystemMeta } from '../system/types';
import { WorldCell } from './cell';
import { CommandQueue } from './command_queue';
import {
  ON_ADD,
  ON_DESPAWN,
  ON_INSERT,
  ON_REMOVE,
  ON_REPLACE,
  OnAdd,
  OnDespawn,
  OnInsert,
  OnRemove,
  OnReplace,
} from './component_constants';
import { DeferredWorld } from './deferred';
import { EntityCell } from './entity_ref/cell';
import { EntityMut } from './entity_ref/mut';
import { EntityRef } from './entity_ref/ref';
import { EntityWorld } from './entity_ref/world';
import { EntityFetchError, intoEntityFetch } from './entry_fetch';
import { fromWorld } from './from';
import { SpawnBatchIter } from './spawn_batch';

let wordId = 0;

export class World {
  id: number;
  entities: Entities;
  components: Components;
  archetypes: Archetypes;
  storages: Storages;
  bundles: Bundles;
  observers: Observers;
  removedComponents: RemovedComponentEvents;

  __changeTick: number;
  __lastChangeTick: Tick;
  __lastCheckTick: Tick;
  __lastTriggerId: number;

  __command_queue: CommandQueue;

  static new() {
    return new World();
  }

  constructor() {
    this.id = wordId++;
    this.entities = new Entities();
    this.components = new Components();
    this.archetypes = new Archetypes();
    this.storages = new Storages();
    this.bundles = new Bundles();
    this.observers = new Observers();
    this.removedComponents = new RemovedComponentEvents();

    this.__changeTick = 1;
    this.__lastChangeTick = new Tick(0);
    this.__lastCheckTick = new Tick(0);
    this.__lastTriggerId = 0;

    this.__command_queue = new CommandQueue();

    this.bootstrap();
  }

  bootstrap(): void {
    if (ON_ADD !== OnAdd.registerComponentId(this)) {
      throw new Error('ON_ADD should be 0');
    }
    if (ON_INSERT !== OnInsert.registerComponentId(this)) {
      throw new Error('ON_INSERT should be 1');
    }
    if (ON_REPLACE !== OnReplace.registerComponentId(this)) {
      throw new Error('ON_REPLACE should be 2');
    }
    if (ON_REMOVE !== OnRemove.registerComponentId(this)) {
      throw new Error('ON_REMOVE should be 3');
    }
    if (ON_DESPAWN !== OnDespawn.registerComponentId(this)) {
      throw new Error('ON_DESPAWN should be 4');
    }
  }

  get changeTick() {
    return new Tick(this.__changeTick);
  }

  set changeTick(t: Tick) {
    this.__changeTick = t.tick;
  }

  get lastChangeTick() {
    return this.__lastChangeTick;
  }

  get lastTriggerId() {
    return this.__lastTriggerId;
  }

  get commands() {
    return new Commands(this.__command_queue, this.entities);
  }

  registerComponent<T extends object>(component: Constructor<T>): ComponentId {
    return this.components.registerComponent(component, this.storages);
  }

  registerComponentHooks<T extends object>(component: Constructor<T>): ComponentHooks {
    const index = this.registerComponent(component);
    if (this.archetypes.archetypes.iter().any((a) => a.contains(index))) {
      throw new Error(
        `Components hooks cannot be modified if the component already exists in an archetype, use registerComponent if ${component.name} may already be in use`,
      );
    }
    return this.components.getHooks(index).unwrap();
  }

  registerComponentHooksById(id: ComponentId): Option<ComponentHooks> {
    if (this.archetypes.archetypes.iter().any((a) => a.contains(id))) {
      throw new Error(
        `Components hooks cannot be modified if the component already exists in an archetype, use registerComponent if the component with id ${id} may already be in use`,
      );
    }
    return this.components.getHooks(id);
  }

  registerRequiredComponents<T extends object, R extends object>(
    component: Constructor<T>,
    requiredComponent: Constructor<R>,
  ): void {
    this.tryRegisterRequiredComponents<T, R>(component, requiredComponent).unwrap();
  }

  registerRequiredComponentsWith<T extends object, R extends object>(
    component: Constructor<T>,
    requiredComponent: Constructor<R>,
    requiredComponentFn: () => R,
  ): void {
    this.tryRegisterRequiredComponentsWith<T, R>(
      component,
      requiredComponent,
      requiredComponentFn,
    ).unwrap();
  }

  tryRegisterRequiredComponents<T extends object, R extends object>(
    component: Constructor<T>,
    requiredComponent: Constructor<R>,
  ): Result<void, RequiredComponentsError> {
    return this.tryRegisterRequiredComponentsWith<T, R>(
      component,
      requiredComponent,
      () => new requiredComponent(),
    );
  }

  tryRegisterRequiredComponentsWith<T extends object, R extends object>(
    component: Constructor<T>,
    requiredComponent: Constructor<R>,
    constructor: () => R,
  ): Result<void, RequiredComponentsError> {
    const requiree = this.registerComponent(component);
    if (this.archetypes.componentIndex().containsKey(requiree)) {
      return Result.Err(RequiredComponentsError.ArchetypeExists(requiree));
    }
    const required = this.registerComponent(requiredComponent);
    this.components.registerRequiredComponents(requiree, required, constructor);
    return Result.Ok(undefined);
  }

  getRequiredComponents<C extends object>(component: Constructor<C>): Option<RequiredComponents> {
    return this.components
      .componentId(component)
      .andThen((id) => this.components.getInfo(id))
      .map((info) => info.requiredComponents);
  }

  getRequiredComponentsById(id: ComponentId): Option<RequiredComponents> {
    return this.components.getInfo(id).map((info) => info.requiredComponents);
  }

  registerComponentWithDescriptor(descriptor: ComponentDescriptor): ComponentId {
    return this.components.registerComponentWithDescriptor(this.storages, descriptor);
  }

  componentId<T extends object>(component: Constructor<T>): Option<ComponentId> {
    return this.components.componentId(typeId(component));
  }

  registerResource<R extends object>(resource: Constructor<R>): ComponentId {
    return this.components.registerResource(resource);
  }

  resourceId<T extends object>(resource: Constructor<T>): Option<ComponentId> {
    return this.components.getResourceId(typeId(resource));
  }

  entity(entity: Entity): EntityWorld {
    return this.getEntityMut(entity).unwrap();
  }

  inspectEntity(entity: Entity): Iterable<ComponentInfo> {
    const entityLocation = this.entities.get(entity).unwrapOrElse<EntityLocation>(() => {
      throw new Error(`Entity ${entity} does not exist`);
    });

    const archetype = this.archetypes
      .get(entityLocation.archetypeId)
      .unwrapOrElse<Archetype>(() => {
        throw new Error(`Archetype ${entityLocation.archetypeId} does not exist`);
      });

    return archetype.components.filterMap((id) => this.components.getInfo(id));
  }

  getOrSpawn(entity: Entity, caller?: string): Option<EntityWorld> {
    return this.getOrSpawnWithCaller(entity, caller || getCaller());
  }

  protected getOrSpawnWithCaller(entity: Entity, caller?: string): Option<EntityWorld> {
    this.flush();
    const result = this.entities.allocAtWithoutReplacement(entity);
    return result.match({
      Exists: (location) => Some(new EntityWorld(this, entity, location)),
      DidNotExist: () => Some(this.spawnAtEmptyInternal(entity, caller)),
      ExistsWithWrongGeneration: () => None,
    });
  }

  getEntity<T>(entity: T): Result<any, Error> {
    const fetch = intoEntityFetch(entity);
    return fetch.fetchRef(this.asWorldCell());
  }

  getEntityMut<T>(entity: T): Result<any, Error> {
    const fetch = intoEntityFetch(entity);
    return fetch.fetchMut(this.asWorldCell());
  }

  iterEntities(): Iterable<EntityRef> {
    const worldCell = this.asWorldCell();
    return this.archetypes.archetypes.iter().flatMap((archetype) => {
      return archetype.entities.enumerate().map(([archetypeRow, archetypeEntity]) => {
        const entity = archetypeEntity.id;
        const location: EntityLocation = {
          archetypeId: archetype.id,
          archetypeRow: archetypeRow,
          tableId: archetype.tableId,
          tableRow: archetypeEntity.tableRow,
        };
        const cell = new EntityCell(worldCell, entity, location);
        return EntityRef.new(cell);
      });
    });
  }

  iterEntitiesMut(): Iterable<EntityMut> {
    const worldCell = this.asWorldCell();
    return this.archetypes.archetypes.iter().flatMap((archetype) => {
      return archetype.entities.enumerate().map(([archetypeRow, archetypeEntity]) => {
        const entity = archetypeEntity.id;
        const location: EntityLocation = {
          archetypeId: archetype.id,
          archetypeRow: archetypeRow,
          tableId: archetype.tableId,
          tableRow: archetypeEntity.tableRow,
        };
        const cell = new EntityCell(worldCell, entity, location);
        return new EntityMut(cell);
      });
    });
  }

  spawnEmpty(): EntityWorld {
    this.flush();
    const entity = this.entities.alloc();
    // SAFETY: entity was just allocated
    return this.spawnAtEmptyInternal(entity, getCaller());
  }

  spawn<B extends object>(bundle: B): EntityWorld {
    this.flush();
    const changeTick = this.changeTick;
    const entity = this.entities.alloc();
    const bundleSpawner = BundleSpawner.new(bundle, this, changeTick);
    let entityLocation = bundleSpawner.spawnNonExistent(entity, bundle, getCaller());

    if (!this.__command_queue.isEmpty()) {
      this.flushCommands();
      entityLocation = this.entities.get(entity).unwrapOr(EntityLocation.INVALID);
    }
    this.entities.setSpawnedOrDespawnedBy(entity.index, getCaller());
    return new EntityWorld(this, entity, entityLocation);
  }

  private spawnAtEmptyInternal(entity: Entity, caller?: string): EntityWorld {
    const archetype = this.archetypes.empty();
    const tableRow = this.storages.tables.getUnchecked(archetype.tableId).allocate(entity);
    const location = archetype.allocate(entity, tableRow);
    this.entities.set(entity.index, location);
    this.entities.setSpawnedOrDespawnedBy(entity.index, caller ?? getCaller(1));
    return new EntityWorld(this, entity, location);
  }

  spawnBatch<I extends IterableIterator<any>>(iter: I): SpawnBatchIter<I> {
    this.flush();
    return SpawnBatchIter.new(this, iter, 'spawnBatch');
  }

  get<T extends object>(component: Constructor<T>, entity: Entity): Option<T> {
    return this.getEntity(entity).match({
      Ok: (entityRef: EntityRef) => entityRef.get(component),
      Err: () => None,
    });
  }

  query<D extends QueryData>(data: D): QueryState<D> {
    return this.queryFiltered<D>(data, []);
  }

  queryFiltered<D extends QueryData, F extends QueryFilter = any>(
    data: D,
    filter: F,
  ): QueryState<D, F> {
    return QueryState.new(data, filter, this);
  }

  tryQuery<D extends QueryData>(data: D): Option<QueryState<D, any>> {
    return this.tryQueryFiltered<D, any>(data, []);
  }

  tryQueryFiltered<D extends QueryData, F extends QueryFilter = any>(
    data: D,
    filter: F,
  ): Option<QueryState<D, F>> {
    return QueryState.tryNew(data, filter, this);
  }

  despawn(entity: Entity): boolean {
    return this.despawnWithCaller(entity, getCaller(), true);
  }

  tryDespawn(entity: Entity): boolean {
    return this.despawnWithCaller(entity, getCaller(), false);
  }

  protected despawnWithCaller(entity: Entity, caller: string, logWarning: boolean): boolean {
    this.flush();
    const entityResult = this.getEntityMut(entity);
    return entityResult.match({
      Ok: (entityMut: EntityWorld) => {
        entityMut['despawnWithCaller'](caller);
        return true;
      },
      Err: () => {
        if (logWarning) {
          logger.warn(`error: ${caller}: Could not despawn entity ${stringify(entity)}`);
        }
        return false;
      },
    });
  }

  clearTrackers(): void {
    this.removedComponents.update();
    this.__lastChangeTick = this.incrementChangeTick();
  }

  removedWithId(componentId: ComponentId): Iterable<Entity> {
    return this.removedComponents.get(componentId).match({
      Some: (removed) =>
        removed
          .iterCurrentUpdateEvents()
          .map((event) => event.entity)
          .collect(),
      None: () => [],
    });
  }

  registerResourceWithDescriptor(descriptor: ComponentDescriptor): ComponentId {
    return this.components.registerResourceWithDescriptor(descriptor);
  }

  initResource<R extends object>(res: Constructor<R>, caller?: string): ComponentId {
    const componentId = this.components.registerResource(res);
    if (this.storages.resources.get(componentId).mapOr(true, (v) => v.isPresent())) {
      const value = fromWorld(this, res);
      this.insertResourceById(componentId, value, caller);
    }
    return componentId;
  }

  insertResource<R extends object>(value: R, caller?: string) {
    this.insertResourceWithCaller(value, caller);
  }

  insertResourceWithCaller<R extends object>(value: R, caller?: string) {
    const componentId = this.components.registerResource(value.constructor as Constructor<R>);
    this.insertResourceById(componentId, value, caller);
  }

  removeResource<R extends object>(res: Constructor<R>): Option<R> {
    const componentId = this.components.getResourceId(typeId(res));
    if (componentId.isNone()) {
      return None;
    }
    return this.storages.resources
      .get(componentId.unwrap())
      .andThen((v) => v.remove())
      .map((v) => v[0]);
  }

  containsResource<R extends object>(res: Constructor<R>): boolean {
    return this.components
      .getResourceId(typeId(res))
      .andThen((componentId) => this.storages.resources.get(componentId))
      .map((v) => v.isPresent())
      .unwrapOr(false);
  }

  containsResourceById(componentId: ComponentId): boolean {
    return this.storages.resources
      .get(componentId)
      .isSomeAnd((resourceData) => resourceData.isPresent());
  }

  isResourceAdded<R extends object>(resource: Constructor<R>): boolean {
    return this.components
      .getResourceId(typeId(resource))
      .isSomeAnd((componentId) => this.isResourceAddedById(componentId));
  }

  isResourceAddedById(componentId: ComponentId): boolean {
    return this.storages.resources
      .get(componentId)
      .andThen((resource) =>
        resource.getTicks().map((ticks) => ticks.isAdded(this.lastChangeTick, this.changeTick)),
      )
      .unwrapOr(false);
  }

  isResourceChanged<R extends object>(resource: Constructor<R>): boolean {
    return this.components
      .getResourceId(typeId(resource))
      .map((componentId) => this.isResourceChangedById(componentId))
      .unwrapOr(false);
  }

  isResourceChangedById(componentId: ComponentId): boolean {
    return this.storages.resources
      .get(componentId)
      .andThen((res) =>
        res.getTicks().map((ticks) => ticks.isChanged(this.__lastChangeTick, this.changeTick)),
      )
      .unwrapOr(false);
  }

  getResourceChangeTicks<R>(resource: Constructor<R>): Option<ComponentTicks> {
    return this.components
      .getResourceId(typeId(resource))
      .andThen((componentId) => this.getResourceChangeTicksById(componentId));
  }

  getResourceChangeTicksById(componentId: ComponentId): Option<ComponentTicks> {
    return this.storages.resources.get(componentId).andThen((v) => v.getTicks());
  }

  resource<R extends object>(resource: Constructor<R>): R {
    const res = this.getResource(resource);
    if (res.isSome()) {
      return res.unwrap();
    }
    throw new Error(
      `Requested resource ${resource.name} does not exist in the 'World'. ` +
        `Did you forget to add it using 'app.insertResource' / 'app.initResource'? ` +
        `Resources are also implicitly added via 'app.addEvent', ` +
        `and can be added by plugins.`,
    );
  }
  /**
   * Returns a mutable reference to the resource `R`.
   *
   * Will panic if the resource does not exist in the `World`.
   * Resources are also implicitly added via `app.add_event`, and can be added by plugins.
   */
  resourceMut<R extends object>(resource: Constructor<R>): Mut<R> {
    return this.getResourceMut(resource).match({
      Some: (x) => x,
      None: () => {
        throw new Error(
          `Requested resource ${resource.name} does not exist in the 'World'. \
        Did you forget to add it using 'app.insertResource' / 'app.initResource'? \
        Resources are also implicitly added via 'app.addEvent', \
        and can be added by plugins.`,
        );
      },
    });
  }

  getResourceMut<R extends object>(resource: Constructor<R>): Option<Mut<R>> {
    return new WorldCell(this).getResourceMut(resource);
  }

  getResource<R extends object>(resource: Constructor<R>): Option<R> {
    return new WorldCell(this).getResource(resource);
  }

  initializeResourceInternal(componentId: ComponentId): ResourceData {
    const archetypes = this.archetypes;
    return this.storages.resources.initializeWith(componentId, this.components, () => {
      return archetypes.newArchetypeComponentId();
    });
  }

  insertResourceById<T extends object>(id: ComponentId, value: T, caller?: string) {
    const changeTick = this.changeTick;
    const data = this.initializeResourceInternal(id);
    data.insert(value, changeTick, caller);
    return id;
  }

  checkChangeTicks() {
    const changeTick = this.changeTick;
    if (changeTick.relativeTo(this.__lastCheckTick).get() < CHECK_TICK_THRESHOLD) {
      return;
    }
    const { tables, sparseSets, resources } = this.storages;
    tables.checkChangeTicks(changeTick);
    sparseSets.checkChangeTicks(changeTick);
    resources.checkChangeTicks(changeTick);

    const schedules = this.getResource(Schedules);
    schedules.match({
      Some: (schedules) => {
        schedules.checkChangeTicks(changeTick);
      },
    });

    this.__lastCheckTick = changeTick;
  }

  incrementChangeTick() {
    const prevTick = this.__changeTick;
    this.__changeTick += 1;
    return new Tick(prevTick);
  }

  lastChangeTickScope<T>(lastChangeTick: Tick, f: (world: World) => T): T {
    const guard = new LastTickGuard(this, this.__lastChangeTick);
    guard.world.__lastChangeTick = lastChangeTick;
    const ret = f(this);
    guard.drop();
    return ret;
  }

  addSchedule(schedule: Schedule) {
    const schedules = this.getResourceOrInit(Schedules);
    schedules.insert(schedule);
  }

  tryScheduleScope(label: any, f: (world: World, schedule: Schedule) => any) {
    const schedule = this.getResource(Schedules).andThen((s) => s.remove(label));
    if (schedule.isNone()) {
      return Err(`The schedule with the label ${label} was not found.`);
    }
    const value = f(this, schedule.unwrap());
    const old = this.resource(Schedules).insert(schedule.unwrap());
    if (old.isSome()) {
      logger.warn(
        `Schedule ${label} was inserted during a call to World.schedule_scope its value has been overwritten`,
      );
    }
    return Ok(value);
  }

  scheduleScope(label: any, f: (world: World, schedule: Schedule) => any) {
    return this.tryScheduleScope(label, f).unwrap();
  }

  tryRunSchedule(label: any) {
    return this.tryScheduleScope(label, (world, schedule) => {
      schedule.run(world);
    });
  }

  runSchedule(label: any) {
    this.scheduleScope(label, (world, schedule) => {
      schedule.run(world);
    });
  }

  allowAmbiguousComponent<T extends object>(component: Constructor<T>) {
    const schedules = this.removeResource<Schedules>(Schedules).unwrapOrElse(() => new Schedules());
    schedules.allowAmbiguousComponent(component, this);
    this.insertResource(schedules);
  }

  allowAmbiguousResource<T extends object>(res: Constructor<T>) {
    const schedules = this.removeResource<Schedules>(Schedules).unwrapOrElse(() => new Schedules());
    schedules.allowAmbiguousResource(res, this);
    this.insertResource(schedules);
  }

  getResourceById(id: ComponentId): Option<any> {
    return this.storages.resources.get(id).andThen((v) => v.getData());
  }

  getResourceMutById(id: ComponentId): Option<MutUntyped> {
    return this.asWorldCell().getResourceMutById(id);
  }

  getResourceOrInsertWith<R extends object>(
    resType: Constructor<R>,
    func: () => R,
    caller?: string,
  ): Mut<R> {
    const changeTick = this.changeTick;
    const lastChangeTick = this.__lastChangeTick;
    const componentId = this.components.registerResource(resType);
    let data = this.initializeResourceInternal(componentId);
    if (!data.isPresent()) {
      data.insert(func(), changeTick, caller);
    }
    const value = data.getMut(lastChangeTick, changeTick).unwrap();
    return value.withType();
  }

  getResourceOrInit<R extends object>(resType: Constructor<R>, caller?: string): Mut<R> {
    const changeTick = this.changeTick;
    const lastChangeTick = this.__lastChangeTick;
    const componentId = this.components.registerResource(resType);
    let data = this.initializeResourceInternal(componentId);
    if (!data.isPresent()) {
      const value = fromWorld(this, resType);
      data.insert(value, changeTick, caller);
    }
    const value = data.getMut(lastChangeTick, changeTick).unwrap();
    return value.withType();
  }

  resourceScope<R extends object, U>(
    resource: Constructor<R>,
    f: (world: World, value: Mut<R>) => U,
  ): U {
    return this.tryResourceScope<R, U>(resource, (world, value) =>
      f(world, value.withType()),
    ).unwrapOrElse(() => {
      throw new Error(`Resource does not exist: ${resource.name}`);
    });
  }

  tryResourceScope<R extends object, U>(
    resource: Constructor<R>,
    f: (world: World, value: MutUntyped) => U,
  ): Option<U> {
    const lastChangeTick = this.lastChangeTick;
    const changeTick = this.changeTick;
    const componentId = this.components.getResourceId(typeId(resource));
    if (componentId.isNone()) {
      return None;
    }
    const resourceData = this.storages.resources.get(componentId.unwrap());
    if (resourceData.isNone() || !resourceData.unwrap().isPresent()) {
      return None;
    }
    const op = resourceData.unwrap().remove();
    if (op.isNone()) {
      return None;
    }
    let [value, ticks, caller] = op.unwrap();
    const mutValue = new MutUntyped(
      Ptr({
        get: () => value,
        set: (v) => {
          value = v;
        },
      }),
      new Ticks(ticks.added, ticks.changed, lastChangeTick, changeTick),
      caller,
    );
    const result = f(this, mutValue);
    if (this.containsResource(resource)) {
      throw new Error(
        `Resource ${resource.name} was inserted during a call to World::resourceScope. This is not allowed as the original resource is reinserted to the world after the closure is invoked.`,
      );
    }
    this.storages.resources
      .get(componentId.unwrap())
      .map((info) => info.insertWithTicks(value, ticks, caller));
    return Some(result);
  }

  insertOrSpawnBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
    iter: I,
    caller?: string,
  ): Result<void, Entity[]> {
    this.flush();
    const changeTick = this.changeTick;
    const bundleId = this.bundles.registerInfo(
      iter.next().value[1],
      this.components,
      this.storages,
    );

    class SpawnOrInsert extends Enum {
      @variant
      static Spawn(_spawner: BundleSpawner): SpawnOrInsert {
        throw new Error();
      }

      @variant
      static Insert(_inserter: BundleInserter, _archetypeId: ArchetypeId): SpawnOrInsert {
        throw new Error();
      }

      entities(): Entities {
        return this.match({
          Spawn: (spawner: BundleSpawner) => spawner.entities(),
          Insert: (inserter: BundleInserter) => inserter.entities(),
        });
      }
    }

    let spawnOrInsert = SpawnOrInsert.Spawn(BundleSpawner.newWithId(this, bundleId, changeTick));

    const invalidEntities: Entity[] = [];

    for (const [entity, bundle] of iter) {
      const allocResult = spawnOrInsert.entities().allocAtWithoutReplacement(entity);

      allocResult.match({
        Exists: (location) => {
          spawnOrInsert.match({
            Spawn: () => {
              const newInserter = BundleInserter.newWithId(
                this,
                location.archetypeId,
                bundleId,
                changeTick,
              );
              newInserter.insert(entity, location, bundle, InsertMode.Replace, caller);
              spawnOrInsert = SpawnOrInsert.Insert(newInserter, location.archetypeId);
            },
            Insert: (inserter, archetypeId) => {
              if (location.archetypeId === archetypeId) {
                inserter.insert(entity, location, bundle, InsertMode.Replace, caller);
              } else {
                const newInserter = BundleInserter.newWithId(
                  this,
                  location.archetypeId,
                  bundleId,
                  changeTick,
                );
                newInserter.insert(entity, location, bundle, InsertMode.Replace, caller);
                spawnOrInsert = SpawnOrInsert.Insert(newInserter, location.archetypeId);
              }
            },
          });
        },
        DidNotExist: () => {
          spawnOrInsert.match({
            Spawn: (spawner) => {
              const newSpawner = spawner.spawnNonExistent(entity, bundle, caller);
              spawnOrInsert = SpawnOrInsert.Spawn(newSpawner);
            },
            Insert: () => {
              const spawner = BundleSpawner.newWithId(this, bundleId, changeTick);
              spawner.spawnNonExistent(entity, bundle, caller);
              spawnOrInsert = SpawnOrInsert.Spawn(spawner);
            },
          });
        },
        ExistsWithWrongGeneration: () => {
          invalidEntities.push(entity);
        },
      });
    }

    return invalidEntities.length === 0 ? Ok(undefined) : Err(invalidEntities);
  }

  insertBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.insertBatchWithCaller(batch, InsertMode.Replace, caller);
  }

  insertBatchIfNew<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.insertBatchWithCaller(batch, InsertMode.Keep, caller);
  }

  insertBatchWithCaller<I extends IterableIterator<[Entity, B]>, B extends object>(
    iter: I,
    insertMode: InsertMode,
    caller?: string,
  ): void {
    this.flush();
    const changeTick = this.changeTick;

    const batch = iter[Symbol.iterator]();
    const firstItem = batch.next();
    if (!firstItem.done) {
      const [firstEntity, firstBundle] = firstItem.value;
      const firstLocation = this.entities.get(firstEntity);
      if (firstLocation.isSome()) {
        const bundleId = this.bundles.registerInfo(firstBundle, this.components, this.storages);
        let cache = {
          inserter: BundleInserter.newWithId(
            this,
            firstLocation.unwrap().archetypeId,
            bundleId,
            changeTick,
          ),
          archetypeId: firstLocation.unwrap().archetypeId,
        };

        cache.inserter.insert(firstEntity, firstLocation.unwrap(), firstBundle, insertMode, caller);

        for (const [entity, bundle] of batch) {
          const location = cache.inserter.entities().get(entity);
          if (location.isSome()) {
            if (location.unwrap().archetypeId !== cache.archetypeId) {
              cache = {
                inserter: BundleInserter.newWithId(
                  this,
                  location.unwrap().archetypeId,
                  bundleId,
                  changeTick,
                ),
                archetypeId: location.unwrap().archetypeId,
              };
            }
            cache.inserter.insert(entity, location.unwrap(), bundle, insertMode, caller);
          } else {
            throw new Error(
              `Could not insert a bundle for entity ${entity}, which does not exist.`,
            );
          }
        }
      } else {
        throw new Error(
          `Could not insert a bundle for entity ${firstEntity}, which does not exist.`,
        );
      }
    }
  }

  tryInsertBatch<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.tryInsertBatchWithCaller(batch, InsertMode.Replace, caller);
  }

  tryInsertBatchIfNew<I extends IterableIterator<[Entity, B]>, B extends object>(
    batch: I,
    caller?: string,
  ): void {
    this.tryInsertBatchWithCaller(batch, InsertMode.Keep, caller);
  }

  tryInsertBatchWithCaller<I extends IterableIterator<[Entity, B]>, B extends object>(
    iter: I,
    insertMode: InsertMode,
    caller?: string,
  ): void {
    this.flush();
    const changeTick = this.changeTick;

    const batch = iter[Symbol.iterator]();
    const firstItem = batch.next();
    if (!firstItem.done) {
      const [firstEntity, firstBundle] = firstItem.value;
      const firstLocation = this.entities.get(firstEntity);
      if (firstLocation.isSome()) {
        const bundleId = this.bundles.registerInfo(firstBundle, this.components, this.storages);
        let cache = {
          inserter: BundleInserter.newWithId(
            this,
            firstLocation.unwrap().archetypeId,
            bundleId,
            changeTick,
          ),
          archetypeId: firstLocation.unwrap().archetypeId,
        };

        cache.inserter.insert(firstEntity, firstLocation.unwrap(), firstBundle, insertMode, caller);

        for (const [entity, bundle] of batch) {
          const location = cache.inserter.entities().get(entity);
          if (location.isSome()) {
            if (location.unwrap().archetypeId !== cache.archetypeId) {
              cache = {
                inserter: BundleInserter.newWithId(
                  this,
                  location.unwrap().archetypeId,
                  bundleId,
                  changeTick,
                ),
                archetypeId: location.unwrap().archetypeId,
              };
            }
            cache.inserter.insert(entity, location.unwrap(), bundle, insertMode, caller);
          }
        }
      }
    }
  }

  sendEvent<E extends object>(event: E): Option<EventId> {
    return this.sendEventBatch(event.constructor as Constructor<E>, [event]).andThen((ids) =>
      ids.next().done ? None : Some(ids.next().value),
    );
  }

  sendEventDefault<E extends object>(eventType: Constructor<E>): Option<EventId> {
    return this.sendEvent(defaultVal(eventType));
  }

  sendEventBatch<E extends object>(
    eventType: Constructor<E>,
    events: Iterable<E>,
  ): Option<SendBatchIds> {
    const eventsResource = this.getResourceMut(Events(eventType));
    if (eventsResource.isNone()) {
      logger.error(
        `Unable to send event \`${typeId(eventType)}\`\tEvent must be added to the app with \`addEvent()\`\thttps://docs.rs/bevy/*/bevy/app/struct.App.html#method.add_event`,
      );
      return None;
    }
    return Some(eventsResource.unwrap().sendBatch(events));
  }

  registerSystem<I, O>(system: IntoSystem<I, O>): SystemId<I, O> {
    return this.registerBoxedSystem(system.intoSystem());
  }

  registerBoxedSystem<I, O>(system: System<I, O>): SystemId<I, O> {
    const entity = this.spawn(new RegisteredSystem(system)).id;
    return new SystemId(entity);
  }

  unregisterSystem<I, O>(id: SystemId<I, O>): Result<RemovedSystem<I, O>, RegisteredSystemError> {
    const entityMut = this.getEntityMut(id.entity);
    if (entityMut.isOk()) {
      const entity = entityMut.unwrap();
      const registeredSystem = entity.take(RegisteredSystem);
      if (registeredSystem.isSome()) {
        entity.despawn();
        const system = registeredSystem.unwrap();
        return Ok(new RemovedSystem(system.system, system.initialized));
      }
      return Err(RegisteredSystemError.SelfRemove(id));
    }
    return Err(RegisteredSystemError.SystemIdNotRegistered(id));
  }

  runSystem<I, O>(id: SystemId<I, O>): Result<O, RegisteredSystemError> {
    return this.runSystemWith(id, undefined);
  }

  runSystemWith<I, O>(id: SystemId<I, O>, input: I): Result<O, RegisteredSystemError> {
    const entityMut = this.getEntityMut(id.entity);
    if (entityMut.isErr()) {
      return Err(RegisteredSystemError.SystemIdNotRegistered(id));
    }

    const entity = entityMut.unwrap() as EntityWorld;
    const registeredSystem = entity.take(RegisteredSystem);
    if (registeredSystem.isNone()) {
      return Err(RegisteredSystemError.Recursive(id));
    }

    const system = registeredSystem.unwrap();
    if (!system.initialized) {
      system.system.initialize(this);
      system.initialized = true;
    }

    let result: Result<O, RegisteredSystemError>;
    if (system.system.validateParam(this)) {
      result = Ok(system.system.run(input, this) as O);
    } else {
      result = Err(RegisteredSystemError.InvalidParams(id));
    }

    const updatedEntity = this.getEntityMut(id.entity) as Result<EntityWorld, EntityFetchError>;
    if (updatedEntity.isOk()) {
      updatedEntity.unwrap().insert(new RegisteredSystem(system.system, system.initialized));
    }

    return result;
  }

  registerSystemCached<I, O>(system: IntoSystem<I, O>): SystemId<I, O> {
    const CachedType = CachedSystemId(system.intoSystem().type());
    if (!this.containsResource(CachedType)) {
      const id = this.registerSystem(system);
      this.insertResource(new CachedType(id));
      return id;
    }

    return this.resourceScope(CachedType, (world, id: Mut<CachedSystemId>) => {
      const entity: Result<EntityWorld, EntityFetchError> = world.getEntityMut(id.systemId.entity);
      if (entity.isOk()) {
        if (!entity.unwrap().contains(RegisteredSystem)) {
          entity.unwrap().insert(RegisteredSystem.new(system.intoSystem()));
        }
      } else {
        id.systemId = world.registerSystem(system);
      }
      return id.systemId;
    });
  }

  unregisterSystemCached<I, O>(
    system: IntoSystem<I, O>,
  ): Result<RemovedSystem, RegisteredSystemError> {
    const id = this.removeResource(CachedSystemId(system.intoSystem().type()));
    if (id.isNone()) {
      return Err(RegisteredSystemError.SystemNotCached());
    }
    return this.unregisterSystem(id.unwrap().systemId);
  }

  runSystemCached<O>(system: IntoSystem): Result<O, RegisteredSystemError> {
    return this.runSystemCachedWith(system, undefined);
  }

  runSystemCachedWith<O>(system: IntoSystem, input: any): Result<O, RegisteredSystemError> {
    const id = this.registerSystemCached(system);
    return this.runSystemWith(id, input);
  }

  addObserver<E extends object, B extends object>(
    eventType: Constructor<E>,
    bundleType: any,
    system: IntoObserverSystem<E, B>,
  ): EntityWorld {
    return this.spawn(new Observer(eventType, bundleType, system));
  }

  trigger<E extends object>(event: E) {
    const eventId = useTrait(event.constructor as Constructor<E>, Event).registerComponentId(this);
    this.triggerTargetsDynamicRef(eventId, event, []);
  }

  triggerTargets<E extends object, T>(event: E, targets: T) {
    const eventId = useTrait(event.constructor as Constructor<E>, Event).registerComponentId(this);
    // SAFETY: We just registered `eventId` with the type of `event`
    this.triggerTargetsDynamicRef(eventId, event, targets);
  }

  triggerTargetsDynamic<E extends object, T>(eventId: ComponentId, eventData: E, targets: T): void {
    // SAFETY: `eventData` is accessible as the type represented by `eventId`
    this.triggerTargetsDynamicRef(eventId, eventData, targets);
  }

  triggerTargetsDynamicRef<E extends object, T>(
    eventId: ComponentId,
    eventData: E,
    targets: T,
  ): void {
    const world = new DeferredWorld(this.asWorldCell());
    const t = TriggerTargets.wrap(targets);
    const eventType = eventData.constructor as Constructor<E>;
    if (t.entities().isEmpty()) {
      world.triggerObserversWithData(
        useTrait(eventType, Event).traversal(),
        eventId,
        Entity.PLACEHOLDER,
        t.components(),
        eventData,
        false,
      );
    } else {
      for (const target of t.entities()) {
        world.triggerObserversWithData(
          useTrait(eventType, Event).traversal(),
          eventId,
          target,
          t.components(),
          eventData,
          useTrait(eventType, Event).autoPropagate(),
        );
      }
    }
  }

  registerObserver(observerEntity: Entity) {
    const observerState = this.get(ObserverState, observerEntity).unwrap();

    for (const watchedEntity of observerState.descriptor.entities) {
      const entityMut = this.entity(watchedEntity);
      const observedBy = entityMut.entry(ObservedBy).orDefault().get();
      observedBy.entities.push(observerEntity);
    }

    const descriptor = observerState.descriptor;
    for (const eventType of descriptor.events) {
      const cache = this.observers.getObservers(eventType);
      if (descriptor.components.isEmpty() && descriptor.entities.isEmpty()) {
        cache.map.insert(observerEntity, observerState.runner);
      } else if (descriptor.components.isEmpty()) {
        for (const watchedEntity of observerState.descriptor.entities) {
          const map = cache.entityObservers.entry(watchedEntity).orInsertWith(() => new HashMap());
          map.insert(observerEntity, observerState.runner);
        }
      } else {
        for (const component of descriptor.components) {
          const observers = cache.componentObservers.entry(component).orInsertWith(() => {
            const op = Observers.isArchetypeCached(eventType);
            if (op.isSome()) {
              this.archetypes.updateFlags(component, op.unwrap(), true);
            }
            return new CachedComponentObservers();
          });
          if (descriptor.entities.isEmpty()) {
            observers.map.insert(observerEntity, observerState.runner);
          } else {
            for (const watchedEntity of descriptor.entities) {
              const map = observers.entityMap
                .entry(watchedEntity)
                .orInsertWith(() => new HashMap());
              map.insert(observerEntity, observerState.runner);
            }
          }
        }
      }
    }
  }

  unregisterObserver(entity: Entity, descriptor: ObserverDescriptor) {
    for (const eventType of descriptor.events) {
      const cache = this.observers.getObservers(eventType);
      if (descriptor.components.isEmpty() && descriptor.entities.isEmpty()) {
        cache.map.remove(entity);
      } else if (descriptor.components.isEmpty()) {
        for (const watchedEntity of descriptor.entities) {
          const observers = cache.entityObservers.get(watchedEntity);
          if (observers.isNone()) continue;
          observers.unwrap().remove(entity);
          if (observers.unwrap().isEmpty()) {
            cache.entityObservers.remove(watchedEntity);
          }
        }
      } else {
        for (const component of descriptor.components) {
          const observersOp = cache.componentObservers.get(component);
          if (observersOp.isNone()) continue;
          const observers = observersOp.unwrap();
          if (descriptor.entities.isEmpty()) {
            observers.map.remove(entity);
          } else {
            for (const watchedEntity of descriptor.entities) {
              const map = observers.entityMap.get(watchedEntity);
              if (map.isNone()) continue;
              map.unwrap().remove(entity);
              if (map.unwrap().isEmpty()) {
                observers.entityMap.remove(watchedEntity);
              }
            }
          }
          if (observers.map.isEmpty() && observers.entityMap.isEmpty()) {
            cache.componentObservers.remove(component);
            const flagsOp = Observers.isArchetypeCached(eventType);
            if (flagsOp.isSome()) {
              const flags = flagsOp.unwrap();
              const byComponent = this.archetypes.byComponent.get(component);
              if (byComponent.isSome()) {
                for (const [archetype] of byComponent.unwrap()) {
                  const archetypeObj = this.archetypes.archetypes[archetype];
                  if (archetypeObj.contains(component)) {
                    const noLongerObserved = archetypeObj.components.all(
                      (id) => !cache.componentObservers.containsKey(id),
                    );
                    if (noLongerObserved) {
                      archetypeObj.flags.set(flags, false);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  clearAll() {
    this.clearEntities();
    this.clearResources();
  }

  clearEntities() {
    this.storages.tables.clear();
    this.storages.sparseSets.clearEntities();
    this.archetypes.clearEntities();
    this.entities.clear();
  }

  clearResources() {
    this.storages.resources.clear();
  }

  toString() {
    return (
      `World id: ${this.id} ` +
      `entity_count: ${this.entities.len()} ` +
      `archetype_count: ${this.archetypes.len()} ` +
      `component_count: ${this.components.len()} ` +
      `resource_count: ${this.storages.resources.len()}`
    );
  }

  fetchTable(location: EntityLocation, componentId: ComponentId) {
    return this.storages.tables.getUnchecked(location.tableId).getColumn(componentId);
  }

  fetchSparseSet(componentId: ComponentId) {
    return this.storages.sparseSets.get(componentId);
  }

  flush() {
    this.flushEntities();
    this.flushCommands();
  }

  intoDeferred(): DeferredWorld {
    return new DeferredWorld(this.asWorldCell());
  }

  flushEntities() {
    const emptyArchetype = this.archetypes.emptyMut();
    const table = this.storages.tables.getUnchecked(emptyArchetype.tableId);
    // PERF: consider pre-allocating space for flushed entities
    this.entities.flush((entity, location) => {
      location[Ptr.ptr] = emptyArchetype.allocate(entity, table.allocate(entity));
    });
  }

  flushCommands() {
    if (!this.__command_queue.isEmpty()) {
      this.__command_queue.applyOrDropQueued(Some(this));
    }
  }

  asWorldCell(): WorldCell {
    return new WorldCell(this);
  }
}

class LastTickGuard {
  lastTick: Tick;
  world: World;

  constructor(world: World, lastTick: Tick) {
    this.world = world;
    this.lastTick = lastTick;
  }

  drop() {
    this.world.__lastChangeTick = this.lastTick;
  }
}

implTrait(World, RunSystemOnce, {
  runSystemOnceWith(this: World, system: any, input: any): Result<any, Error> {
    if (!IntoSystem.is(system)) {
      throw new Error('System must implement IntoSystem.');
    }
    const into = IntoSystem.wrap(system).intoSystem();
    into.initialize(this);
    if (into.validateParam(this)) {
      return Ok(into.run(input, this));
    } else {
      return Err(new Error(into.name() + 'InvalidParam'));
    }
  },
});

export interface World extends RunSystemOnce {}

class WorldSystemParam {
  initParamState(_world: World, _systemMeta: SystemMeta): void {}
  getParam(_state: void, _systemMeta: SystemMeta, world: WorldCell, _changeTick: Tick): World {
    return world.world;
  }
}

implTrait(WorldSystemParam, SystemParam);
implTrait(WorldSystemParam, ExclusiveSystemParam);

interface WorldSystemParam extends SystemParam<void, World> {}

implTrait(World, IntoSystemParam, {
  static: {
    intoSystemParam(): WorldSystemParam {
      return new WorldSystemParam();
    },
  },
});

export interface World extends IntoSystemParam<World> {}
