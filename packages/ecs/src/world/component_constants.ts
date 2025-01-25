import { derive } from 'rustable';
import { ComponentId } from '../component';
import { Event } from '../event';
import { type World } from './base';

export const ON_ADD: ComponentId = 0;
export const ON_INSERT: ComponentId = 1;
export const ON_REPLACE: ComponentId = 2;
export const ON_REMOVE: ComponentId = 3;
export const ON_DESPAWN: ComponentId = 4;

@derive([Event])
export class OnAdd {}

export interface OnAdd extends Event {}

export declare namespace OnAdd {
  export function registerComponentId(world: World): ComponentId;
}

@derive([Event])
export class OnInsert {}

export interface OnInsert extends Event {}

export declare namespace OnInsert {
  export function registerComponentId(world: World): ComponentId;
}

@derive([Event])
export class OnReplace {}

export interface OnReplace extends Event {}

export declare namespace OnReplace {
  export function registerComponentId(world: World): ComponentId;
}

@derive([Event])
export class OnRemove {}

export interface OnRemove extends Event {}

export declare namespace OnRemove {
  export function registerComponentId(world: World): ComponentId;
}

@derive([Event])
export class OnDespawn {}

export interface OnDespawn extends Event {}

export declare namespace OnDespawn {
  export function registerComponentId(world: World): ComponentId;
}
