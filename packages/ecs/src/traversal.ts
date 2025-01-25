import { NOT_IMPLEMENTED } from '@sciurus/utils';
import { implTrait, None, Option, trait } from 'rustable';
import { Entity } from './entity/base';

@trait
export class Traversal {
  static traverse<D>(_item: any, _data: D): Option<Entity> {
    throw NOT_IMPLEMENTED;
  }
}

export class EmptyTraversal {
  static traverse<D>(_item: any, _data: D): Option<Entity> {
    return None;
  }
}

implTrait(EmptyTraversal, Traversal);

export interface EmptyTraversal extends Traversal {}
