import { EnumInstance, Enums } from 'rustable';
import { Entity } from '../entity/base';
import { World } from '../world';

const queryEntityErrorVars = {
  QueryDoesNotMatch: (_entity: Entity, _world: World) => {},
  NoSuchEntity: (_entity: Entity, _world: World) => {},
  AliasedMutability: (_entity: Entity) => {},
};

export const QueryEntityError = Enums.create('QueryEntityError', queryEntityErrorVars);

export type QueryEntityError = EnumInstance<typeof queryEntityErrorVars>;

export class QuerySingleError extends Error {
  static NoEntities(str: string) {
    return new QuerySingleError(`No entities fit the query ${str}`);
  }

  static MultipleEntities(str: string) {
    return new QuerySingleError(`Multiple entities fit the query ${str}`);
  }

  constructor(message: string) {
    super(message);
  }
}
