import { TraitValid } from '@sciurus/utils';
import {
  Constructor,
  Eq,
  implTrait,
  macroTrait,
  None,
  Option,
  Some,
  stringify,
  trait,
  typeId,
  TypeId,
  typeName,
} from 'rustable';

@trait
class ScheduleLabelTrait extends TraitValid {
  toString() {
    return typeName(this);
  }
}

implTrait(ScheduleLabelTrait, Eq, {
  eq(other: any): boolean {
    return typeId(this) === typeId(other) && stringify(this) === stringify(other);
  },
});

export const ScheduleLabel = macroTrait(ScheduleLabelTrait);

export interface ScheduleLabel extends ScheduleLabelTrait {}

@trait
class SystemSetTrait extends TraitValid {
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

implTrait(SystemTypeSet, Eq, {
  eq(this: SystemTypeSet, other: SystemTypeSet): boolean {
    return typeId(this.data) === typeId(other.data);
  },
});

export interface SystemTypeSet extends SystemSet {}

implTrait(SystemTypeSet, SystemSet, {
  systemType(): Option<TypeId> {
    return Some(typeId(this.data));
  },
});

export class AnonymousSet {
  constructor(public id: number) {}
}

export interface AnonymousSet extends SystemSet {}

implTrait(AnonymousSet, SystemSet, {
  isAnonymous(): boolean {
    return true;
  },
});

@trait
export class IntoSystemSet extends TraitValid {
  intoSystemSet(): SystemSet {
    throw new Error('Method not implemented.');
  }
}

export interface SystemSet extends IntoSystemSet {}

implTrait(SystemSet, IntoSystemSet, {
  intoSystemSet(): SystemSet {
    return this as SystemSet;
  },
});
