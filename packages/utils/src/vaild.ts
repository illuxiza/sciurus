import { Constructor, hasTrait, typeName } from 'rustable';

export class TraitValid {
  static is<T extends object>(this: Constructor<T>, val: any): boolean {
    return hasTrait(val, this);
  }
  static validType<T extends object>(this: Constructor<T>, val: any): void {
    if (!hasTrait(val, this)) {
      throw new Error(`${typeName(val)} is not a valid ${typeName(this)} type.`);
    }
  }
  static wrap<T extends object>(this: Constructor<T>, val: any): InstanceType<Constructor<T>> {
    if (!hasTrait(val, this)) {
      throw new Error(`${typeName(val)} is not a valid ${typeName(this)} type.`);
    }
    return val as InstanceType<Constructor<T>>;
  }
}
