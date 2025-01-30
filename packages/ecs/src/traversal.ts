import { None, NotImplementedError, Option, Trait } from 'rustable';
import { Entity } from './entity/base';

export class Traversal extends Trait {
  static traverse<D>(_item: any, _data: D): Option<Entity> {
    throw new NotImplementedError();
  }
}

export class EmptyTraversal {}

Traversal.implFor(EmptyTraversal, {
  static: {
    traverse<D>(_item: any, _data: D): Option<Entity> {
      return None;
    },
  },
});

export interface EmptyTraversal extends Traversal {}
