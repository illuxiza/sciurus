/**
 * Checks if a target is of a specific type or inherits from it
 * @param target The target to check
 * @param type The type to check against
 * @returns True if target is of type or inherits from it
 */
export function isType(target: any, type: any) {
  if (target === type) {
    return true;
  }
  if (typeof target === 'object' && target instanceof type) {
    return true;
  }
  return typeof target === 'function' && target.prototype instanceof type;
}

/**
 * Checks if a target is an instance of a specific type
 * @param target The target to check
 * @param type The type to check against
 * @returns True if target is an instance of type
 */
export function isInstance(target: any, type: any) {
  return typeof target === 'object' && target instanceof type;
}

/**
 * Gets the constructor class of a target
 * @param target The target to get the class from
 * @returns The constructor class
 */
export function getClz(target: any) {
  if (typeof target === 'object') {
    return target.__proto__.constructor;
  }
  return target;
}

/**
 * Validates that a target matches a type, throws if not
 * @param target The target to validate
 * @param type The type to validate against
 * @param msg Optional custom error message
 * @throws Error if target doesn't match type
 */
export const matchType = (target: any, type: any, msg?: string) => {
  if (!isType(target, type)) {
    throw new Error(msg ?? target + ' not match ' + type.name);
  }
};

/**
 * Validates that a target is an instance of a type, throws if not
 * Also checks if target is a class that needs instantiation
 * @param target The target to validate
 * @param type The type to validate against
 * @param msg Optional custom error message
 * @throws Error if target isn't an instance of type
 */
export const matchInstance = (target: any, type: any, msg?: string) => {
  if (!isInstance(target, type)) {
    if (isType(target, type)) {
      throw new Error(msg ?? target.name + ' need to instantiate ');
    } else {
      throw new Error(msg ?? (JSON.stringify(target) ?? target) + ' not match ' + type.name);
    }
  }
};
// function inheritBase(targetType: any, parentType: any) {
//     Object.setPrototypeOf(targetType.prototype, parentType.prototype);
//     targetType.prototype.constructor = targetType;
// }

/**
 * Copies static properties from source type to target type
 * Excludes length, name, and prototype properties
 * @param targetType The type to copy to
 * @param sourceType The type to copy from
 */
function inheritStatic(targetType: any, sourceType: any) {
  Object.getOwnPropertyNames(sourceType).forEach((prop) => {
    if (prop === 'length' || prop === 'name' || prop === 'prototype') {
      return;
    }
    Object.defineProperty(
      targetType,
      prop,
      Object.getOwnPropertyDescriptor(sourceType, prop) || Object.create(null),
    );
  });
}

/**
 * Extends a target type's prototype with properties from a source type
 * Excludes constructor property
 * @param targetType The type to extend
 * @param sourceType The type to copy from
 */
function extendPrototype(targetType: any, sourceType: any) {
  Object.getOwnPropertyNames(sourceType).forEach((prop) => {
    if (prop === 'constructor') {
      return;
    }
    Object.defineProperty(
      targetType,
      prop,
      Object.getOwnPropertyDescriptor(sourceType, prop) || Object.create(null),
    );
  });
}

/**
 * Creates a new constructor that extends a parent type and copies properties from a target type
 * @param targetType The type to copy properties from
 * @param parentType The type to extend
 * @returns A new constructor class
 */
function createConstructor(targetType: any, parentType: any) {
  const SubClass = class extends parentType {
    constructor(...args: any) {
      super(...args);
      let targetType1 = new targetType(...args);
      Object.getOwnPropertyNames(targetType1).forEach((prop) => {
        Object.defineProperty(
          this,
          prop,
          Object.getOwnPropertyDescriptor(targetType1, prop) || Object.create(null),
        );
      });
    }
  };
  extendPrototype(SubClass.prototype, targetType.prototype);
  Object.defineProperty(SubClass, 'name', { value: targetType.name });
  return SubClass;
}

/**
 * Creates a new class that inherits from a parent type and copies properties from a target type
 * Combines prototype inheritance and static property copying
 * @param targetType The type to copy properties from
 * @param parentType The type to inherit from
 * @returns A new class that combines both types
 */
export function inherit(targetType: any, parentType: any): any {
  let constructor = createConstructor(targetType, parentType);
  inheritStatic(constructor, targetType);
  return constructor;
}

/**
 * Creates a new constructor from a function with methods
 * @template T The return type of the function
 * @param name Name of the new constructor
 * @param func Function to create constructor from
 * @param methods Methods to add to the prototype
 * @param parentType Parent type to extend
 * @returns A new constructor class
 */
function createConstructorFromFunction<T>(
  name: string,
  func: (...args: any) => T,
  methods: Methods<T>,
  parentType: new (...args: any) => any,
): new (...args: any) => T & MethodsReturn<T> {
  const SubClass = class extends parentType {
    constructor(...args: any) {
      super(...args);
      let obj = func(...args);
      Object.getOwnPropertyNames(obj).forEach((prop) => {
        Object.defineProperty(
          this,
          prop,
          Object.getOwnPropertyDescriptor(obj, prop) || Object.create(null),
        );
      });
    }
  };
  Object.keys(methods).forEach((prop) => {
    Object.defineProperty(SubClass.prototype, prop, {
      value: function (...args: any[]) {
        return methods[prop](this, ...args);
      },
      writable: false,
    });
  });
  Object.defineProperty(SubClass, 'name', { value: name });
  return SubClass as new (...args: any) => T & MethodsReturn<T>;
}

/**
 * Creates a new class from a function with options
 * @template T The return type of the function
 * @param options Options for creating the class
 * @param parentType Parent type to extend
 * @returns A creator for the new class
 */
export function inheritFunction<T>(options: DefineOptions<T>, parentType: any): Creator<T> {
  const { name, initialData, methods } = options;
  if (!name) {
    throw new Error('`name` is a required option');
  }
  if (!initialData) {
    throw new Error('`initialData` is a required option');
  }
  const initFn = (typeof initialData === 'function' ? initialData : () => initialData) as (
    ...args: any
  ) => T;
  const type = createConstructorFromFunction(name, initFn, methods || {}, parentType);
  return type;
}

/**
 * Interface for defining methods on a type
 * @template T The type to define methods for
 */
export interface Methods<T> {
  [key: string]: (self: T, ...args: any) => any;
}

/**
 * Interface for the return type of methods
 * @template T The type the methods operate on
 */
export type MethodsReturn<T> = { [Type in keyof Methods<T>]: (...args: any) => any };

/**
 * Interface for initial data of a type
 * @template T The type to initialize
 */
export type InitialData<T> = T | ((...args: any) => T);

/**
 * Interface for a type creator
 * @template T The type to create
 */
export interface Creator<T> {
  new (...args: any): T & MethodsReturn<T>;
  prototype: any;
}

/**
 * Options for defining a new type
 * @template T The type to define
 */
export interface DefineOptions<T> {
  /** Name of the new type */
  name: string;
  /** Initial data for the type */
  initialData: InitialData<T>;
  /** Optional methods to add to the type */
  methods?: Methods<T>;
}
