import {
  Constructor,
  defaultVal,
  derive,
  Eq,
  macroTrait,
  named,
  None,
  NotImplementedError,
  Option,
  Some,
  Trait,
  typeId,
  TypeId,
  typeName,
} from 'rustable';

@named('ScheduleLabel')
@derive([Eq])
class ScheduleLabelImpl extends Trait {
  toString() {
    return typeName(this);
  }

  static label(val: any): ScheduleLabelImpl {
    ScheduleLabelImpl.validFor(val);
    if (typeof val === 'function') {
      return defaultVal(val);
    } else {
      return val as ScheduleLabelImpl;
    }
  }
}

export const ScheduleLabel = macroTrait(ScheduleLabelImpl);

export interface ScheduleLabel extends ScheduleLabelImpl {}

@named('SystemSet')
class SystemSetTrait extends Trait {
  systemType(): Option<TypeId> {
    return None;
  }

  isAnonymous(): boolean {
    return false;
  }
}

export const SystemSet = macroTrait(SystemSetTrait);

export interface SystemSet extends SystemSetTrait {}

export class SystemTypeSet {
  constructor(public data: Constructor) {}
}

Eq.implFor(SystemTypeSet, {
  eq(this: SystemTypeSet, other: SystemTypeSet): boolean {
    return typeId(this.data) === typeId(other.data);
  },
});

export interface SystemTypeSet extends SystemSet {}

SystemSet.implFor(SystemTypeSet, {
  systemType(): Option<TypeId> {
    return Some(typeId(this.data));
  },
});

export class AnonymousSet {
  constructor(public id: number) {}
}

export interface AnonymousSet extends SystemSet {}

SystemSet.implFor(AnonymousSet, {
  isAnonymous(): boolean {
    return true;
  },
});

export class IntoSystemSet extends Trait {
  intoSystemSet(): SystemSet {
    throw new NotImplementedError();
  }
}

export interface SystemSet extends IntoSystemSet {}

IntoSystemSet.implFor(SystemSet, {
  intoSystemSet(): SystemSet {
    return this as SystemSet;
  },
});
