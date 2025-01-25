import { implTrait, Type } from 'rustable';
import { Trigger } from '../../observer/types';
import { System } from '../base';
import { IntoSystem } from '../into';
import { FunctionSystem } from './function';

export class ObserverFunctionSystem extends FunctionSystem {
  // This is a marker trait in TypeScript
  // The actual implementation is done through the System trait
}

implTrait(ObserverFunctionSystem, Type(System, [Trigger]));

implTrait(Type(System, [Trigger]), Type(IntoSystem, [Trigger]));
