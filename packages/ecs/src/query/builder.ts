import { Constructor, iter, Ptr } from 'rustable';
import { ComponentId } from '../component/types';
import { StorageType } from '../storage';
import { World } from '../world/base';
import { FilteredAccess } from './access';
import { QueryData } from './fetch';
import { QueryFilter } from './filter/base';
import { With } from './filter/with';
import { Without } from './filter/without';
import { QueryState } from './state';

/**
 * A builder for constructing queries.
 */
export class QueryBuilder {
  constructor(
    public queryData: QueryData,
    public queryFilter: QueryFilter,
    private __access: FilteredAccess,
    public world: World,
    private __or: boolean = false,
    public first: boolean = true,
  ) {}

  static new(data: QueryData, filter: QueryFilter, world: World) {
    const fetchState = data.initState(world);
    const filterState = filter.initState(world);

    let access = new FilteredAccess();
    const mutAccess = Ptr({
      get: () => access,
      set: (a) => (access = a),
    });
    data.updateComponentAccess(fetchState, mutAccess);

    let filterAccess = new FilteredAccess();
    const mutFilterAccess = Ptr({
      get: () => filterAccess,
      set: (a) => (filterAccess = a),
    });

    filter.updateComponentAccess(filterState, mutFilterAccess);

    access.extend(filterAccess);

    return new QueryBuilder(data, filter, access, world);
  }

  isDense(): boolean {
    const isDense = (componentId: ComponentId) => {
      return this.world.components
        .getInfo(componentId)
        .isSomeAnd((info) => info.storageType === StorageType.Table);
    };

    const [componentReadsAndWrites, componentReadsAndWritesInverted] = this.__access
      .access()
      .componentReadsAndWrites();
    if (componentReadsAndWritesInverted) {
      return false;
    }

    return (
      iter(componentReadsAndWrites).all(isDense) &&
      iter(this.__access.access().archetypal()).all(isDense) &&
      !this.__access.access().hasReadAllComponents() &&
      iter(this.__access.withFilters()).all(isDense) &&
      iter(this.__access.withoutFilters()).all(isDense)
    );
  }

  extend_access(access: FilteredAccess): void {
    if (this.__or) {
      if (this.first) {
        access.required.clear();
        this.__access.extend(access);
        this.first = false;
      } else {
        this.__access.appendOr(access);
      }
    } else {
      this.__access.extend(access);
    }
  }

  data<T extends QueryData>(data: T): QueryBuilder {
    const state = data.initState(this.world);
    let access = new FilteredAccess();
    data.updateComponentAccess(
      state,
      Ptr({
        get: () => access,
        set: (a) => (access = a),
      }),
    );
    this.extend_access(access);
    return this;
  }

  filter<T extends QueryFilter>(data: T): QueryBuilder {
    const state = data.initState(this.world);
    let access = new FilteredAccess();
    data.updateComponentAccess(
      state,
      Ptr({
        get: () => access,
        set: (a) => (access = a),
      }),
    );
    this.extend_access(access);
    return this;
  }

  with<T extends object>(component: Constructor<T>): QueryBuilder {
    return this.filter(With(component));
  }

  withId(id: ComponentId): QueryBuilder {
    const access = new FilteredAccess();
    access.andWith(id);
    this.extend_access(access);
    return this;
  }

  without<T extends object>(component: Constructor<T>): QueryBuilder {
    return this.filter(Without(component));
  }

  withoutId(id: ComponentId): QueryBuilder {
    const access = new FilteredAccess();
    access.andWithout(id);
    this.extend_access(access);
    return this;
  }

  refId(id: ComponentId): QueryBuilder {
    this.withId(id);
    this.__access.addComponentRead(id);
    return this;
  }

  mutId(id: ComponentId): QueryBuilder {
    this.withId(id);
    this.__access.addComponentWrite(id);
    return this;
  }

  optional(f: (builder: QueryBuilder) => void): QueryBuilder {
    const builder = QueryBuilder.new(this.queryData, this.queryFilter, this.world);
    f(builder);
    this.__access.extendAccess(builder.__access);
    return this;
  }

  and(f: (builder: QueryBuilder) => void): QueryBuilder {
    const builder = QueryBuilder.new(this.queryData, this.queryFilter, this.world);
    f(builder);
    this.extend_access(builder.__access);
    return this;
  }

  or(f: (builder: QueryBuilder) => void): QueryBuilder {
    const builder = QueryBuilder.new(this.queryData, this.queryFilter, this.world);
    builder.__or = true;
    builder.first = true;
    f(builder);
    this.__access.extend(builder.__access);
    return this;
  }

  access(): FilteredAccess {
    return this.__access;
  }

  transmute(newD: QueryData): QueryBuilder {
    return this.transmuteFiltered(newD, []);
  }

  transmuteFiltered(newD: QueryData, newF: QueryFilter): QueryBuilder {
    const fetchState = newD.initState(this.world);
    const filterState = newF.initState(this.world);
    newD.setAccess(fetchState, this.__access);
    let access = new FilteredAccess();
    const mutAccess = Ptr({
      get: () => access,
      set: (a) => (access = a),
    });
    newD.updateComponentAccess(fetchState, mutAccess);
    newF.updateComponentAccess(filterState, mutAccess);
    this.extend_access(access);
    return this;
  }

  build(): QueryState {
    return QueryState.fromBuilder(this);
  }
}
