import { Constructor, None, Option, Ptr, Some, typeId } from 'rustable';
import { ComponentTicks, Tick, Ticks } from '../change_detection/tick';
import { ComponentId } from '../component/types';
import { Entity } from '../entity/base';
import { EntityLocation } from '../entity/location';
import { ComponentSparseSet } from '../storage/sparse_set';
import { Table } from '../storage/table/base';
import { World } from './base';
import { EntityCell } from './entity_ref/cell';
import { Mut, MutUntyped } from '../change_detection/mut';

export class WorldCell {
  constructor(public world: World) {}

  get id() {
    return this.world.id;
  }

  get components() {
    return this.world.components;
  }

  get bundles() {
    return this.world.bundles;
  }

  get entities() {
    return this.world.entities;
  }

  get archetypes() {
    return this.world.archetypes;
  }

  get storages() {
    return this.world.storages;
  }

  get lastChangeTick() {
    return this.world.lastChangeTick;
  }

  get changeTick() {
    return this.world.changeTick;
  }

  get commands() {
    return this.world.commands;
  }

  get observers() {
    return this.world.observers;
  }

  get removedComponents() {
    return this.world.removedComponents;
  }

  incrementChangeTick() {
    const changeTick = this.world.changeTick;
    const old = changeTick.get();
    changeTick.set(old + 1);
    this.world.changeTick = changeTick;
    return new Tick(old);
  }

  incrementTriggerId() {
    this.world._lastTriggerId += 1;
  }

  lastTriggerId() {
    return this.world.lastTriggerId;
  }

  fetchSparseSet(componentId: number): Option<ComponentSparseSet> {
    return this.world.storages.sparseSets.get(componentId);
  }
  fetchTable(location: EntityLocation): Option<Table> {
    return this.world.storages.tables.get(location.tableId);
  }
  getEntity(entity: Entity): Option<EntityCell> {
    const location = this.entities.get(entity);
    return location.map((loc) => new EntityCell(this, entity, loc));
  }
  getResource<R extends object>(resource: Constructor<R>): Option<R> {
    return this.components
      .getResourceId(typeId(resource))
      .andThen((id) => this.getResourceById(id));
  }

  getResourceMut<R extends object>(resource: Constructor<R>): Option<Mut<R>> {
    const opId = this.components.getResourceId(typeId(resource));
    if (opId.isNone()) {
      return None;
    }
    return this.getResourceMutById(opId.unwrap()).map((data) => data.withType<R>());
  }

  getResourceMutById(componentId: ComponentId): Option<MutUntyped> {
    return this.world.storages.resources
      .get(componentId)
      .andThen((resource) => resource.getWithTicks())
      .andThen(([data, ticks, caller]) =>
        Some(
          MutUntyped.new(
            data,
            Ticks.fromTickCells(ticks, this.lastChangeTick, this.changeTick),
            caller,
          ),
        ),
      );
  }

  getResourceById(componentId: ComponentId): Option<any> {
    return this.world.storages.resources.get(componentId).andThen((resource) => resource.getData());
  }
  getResourceWithTicks(
    componentId: ComponentId,
  ): Option<[ptr: any, ticks: ComponentTicks, caller: Ptr<string>]> {
    return this.world.storages.resources
      .get(componentId)
      .andThen((resource) => resource.getWithTicks());
  }
}
