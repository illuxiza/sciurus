import { Type } from 'rustable';
import { Trigger } from '../../observer/types';
import { System } from '../base';
import { FunctionSystem } from './function';

export class ObserverFunctionSystem extends FunctionSystem {}

Type(System, [Trigger]).implFor(ObserverFunctionSystem);
