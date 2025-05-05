import { Adapt } from '../adapt';
import { ReadonlySystem, System } from '../base';
import { CombinatorSystem, Combine } from '../combinator';
import { IntoReadonlySystem, IntoSystem } from '../into';

/**
 * Logical AND combinator for conditions
 */
export class AndMark {}

Combine.implFor(AndMark, {
  static: {
    combine(_input: any, a: (input: any) => boolean, b: (input: any) => boolean): boolean {
      // Short-circuit: only evaluate b if a is true
      const resultA = a(_input);
      if (!resultA) return false;
      return b(_input);
    },
  },
});

/**
 * Logical OR combinator for conditions
 */
export class OrMark {}

Combine.implFor(OrMark, {
  static: {
    combine(_input: any, a: (input: any) => boolean, b: (input: any) => boolean): boolean {
      // Short-circuit: only evaluate b if a is false
      const resultA = a(_input);
      if (resultA) return true;
      return b(_input);
    },
  },
});

/**
 * Logical NAND combinator for conditions
 */
export class NandMark {}

Combine.implFor(NandMark, {
  static: {
    combine(_input: any, a: (input: any) => boolean, b: (input: any) => boolean): boolean {
      // Short-circuit: only evaluate b if a is true
      const resultA = a(_input);
      if (!resultA) return true;
      return !b(_input);
    },
  },
});

/**
 * Logical NOR combinator for conditions
 */
export class NorMark {}

Combine.implFor(NorMark, {
  static: {
    combine(_input: any, a: (input: any) => boolean, b: (input: any) => boolean): boolean {
      // Short-circuit: only evaluate b if a is false
      const resultA = a(_input);
      if (resultA) return false;
      return !b(_input);
    },
  },
});

/**
 * Logical XOR combinator for conditions
 */
export class XorMark {}

Combine.implFor(XorMark, {
  static: {
    combine(_input: any, a: (input: any) => boolean, b: (input: any) => boolean): boolean {
      // XOR is (a || b) && !(a && b)
      const resultA = a(_input);
      const resultB = b(_input);
      return (resultA || resultB) && !(resultA && resultB);
    },
  },
});

/**
 * Logical XNOR combinator for conditions
 */
export class XnorMark {}

Combine.implFor(XnorMark, {
  static: {
    combine(_input: any, a: (input: any) => boolean, b: (input: any) => boolean): boolean {
      // XNOR is !(a ^ b) which is equivalent to (a && b) || (!a && !b)
      const resultA = a(_input);
      const resultB = b(_input);
      return (resultA && resultB) || (!resultA && !resultB);
    },
  },
});

/**
 * Logical NOT combinator for conditions
 */
export class NotMark {}

Adapt.implFor<typeof Adapt<any, boolean, boolean>, typeof NotMark>(NotMark, {
  adapt(this: NotMark, input: any, runSystem: (input: any) => boolean): boolean {
    // NOT only uses the first condition and negates it
    return !runSystem(input);
  },
});

/**
 * Creates a condition system using the AND combinator
 */
export function and<A extends ReadonlySystem<any, boolean>, B extends ReadonlySystem<any, boolean>>(
  a: A,
  b: B,
): Condition {
  const name = `${a.name?.() || 'unknown'} && ${b.name?.() || 'unknown'}`;
  const system = CombinatorSystem.new(AndMark, a, b, name);
  return system as unknown as Condition;
}

/**
 * Creates a condition system using the OR combinator
 */
export function or<A extends ReadonlySystem<any, boolean>, B extends ReadonlySystem<any, boolean>>(
  a: A,
  b: B,
): Condition {
  const name = `${a.name?.() || 'unknown'} || ${b.name?.() || 'unknown'}`;
  const system = CombinatorSystem.new(OrMark, a, b, name);
  return system as unknown as Condition;
}

/**
 * Creates a condition system using the NAND combinator
 */
export function nand<
  A extends ReadonlySystem<any, boolean>,
  B extends ReadonlySystem<any, boolean>,
>(a: A, b: B): Condition {
  const name = `!(${a.name?.() || 'unknown'} && ${b.name?.() || 'unknown'})`;
  const system = CombinatorSystem.new(NandMark, a, b, name);
  return system as unknown as Condition;
}

/**
 * Creates a condition system using the NOR combinator
 */
export function nor<A extends ReadonlySystem<any, boolean>, B extends ReadonlySystem<any, boolean>>(
  a: A,
  b: B,
): Condition {
  const name = `!(${a.name?.() || 'unknown'} || ${b.name?.() || 'unknown'})`;
  const system = CombinatorSystem.new(NorMark, a, b, name);
  return system as unknown as Condition;
}

/**
 * Creates a condition system using the XOR combinator
 */
export function xor<A extends ReadonlySystem<any, boolean>, B extends ReadonlySystem<any, boolean>>(
  a: A,
  b: B,
): Condition {
  const name = `${a.name?.() || 'unknown'} ^ ${b.name?.() || 'unknown'}`;
  const system = CombinatorSystem.new(XorMark, a, b, name);
  return system as unknown as Condition;
}

/**
 * Creates a condition system using the XNOR combinator
 */
export function xnor<
  A extends ReadonlySystem<any, boolean>,
  B extends ReadonlySystem<any, boolean>,
>(a: A, b: B): Condition {
  const name = `!(${a.name?.() || 'unknown'} ^ ${b.name?.() || 'unknown'})`;
  const system = CombinatorSystem.new(XnorMark, a, b, name);
  return system as unknown as Condition;
}

/**
 * Trait implementation for Condition
 */
export class Condition extends ReadonlySystem<any, boolean> {}

export class IntoCondition extends IntoReadonlySystem<any, boolean> {
  intoCondition(): Condition {
    return this.intoSystem() as Condition;
  }

  /**
   * Returns a new run condition that only returns `true`
   * if both this one and the passed `and` return `true`.
   *
   * The returned run condition is short-circuiting, meaning
   * `and` will only be invoked if `self` returns `true`.
   */
  and<C extends IntoReadonlySystem<any, boolean>>(other: C): Condition {
    return and(this.intoCondition(), other.intoReadonlySystem());
  }

  /**
   * Returns a new run condition that only returns `false`
   * if both this one and the passed `nand` return `true`.
   *
   * The returned run condition is short-circuiting, meaning
   * `nand` will only be invoked if `self` returns `true`.
   */
  nand<C extends IntoReadonlySystem<any, boolean>>(other: C): Condition {
    return nand(this.intoCondition(), other.intoReadonlySystem());
  }

  /**
   * Returns a new run condition that only returns `true`
   * if both this one and the passed `nor` return `false`.
   *
   * The returned run condition is short-circuiting, meaning
   * `nor` will only be invoked if `self` returns `false`.
   */
  nor<C extends IntoReadonlySystem<any, boolean>>(other: C): Condition {
    return nor(this.intoCondition(), other.intoReadonlySystem());
  }

  /**
   * Returns a new run condition that returns `true`
   * if either this one or the passed `or` return `true`.
   *
   * The returned run condition is short-circuiting, meaning
   * `or` will only be invoked if `self` returns `false`.
   */
  or<C extends IntoReadonlySystem<any, boolean>>(other: C): Condition {
    return or(this.intoCondition(), other.intoReadonlySystem());
  }

  /**
   * Returns a new run condition that only returns `true`
   * if `self` and `xnor` **both** return `false` or **both** return `true`.
   */
  xnor<C extends IntoReadonlySystem<any, boolean>>(other: C): Condition {
    return xnor(this.intoCondition(), other.intoReadonlySystem());
  }

  /**
   * Returns a new run condition that only returns `true`
   * if either `self` or `xor` return `true`, but not both.
   */
  xor<C extends IntoReadonlySystem<any, boolean>>(other: C): Condition {
    return xor(this.intoCondition(), other.intoReadonlySystem());
  }
}

IntoSystem.implFor<typeof IntoSystem<any, boolean>, typeof Condition>(Condition, {
  intoSystem(this: Condition) {
    return this as unknown as System<any, boolean>;
  },
});

IntoReadonlySystem.implFor(Condition);

IntoCondition.implFor(Condition);

export interface Condition extends IntoCondition {}
