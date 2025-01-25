import { EnumInstance, Enums } from 'rustable';
import { EntityLocation } from './location';

export type EntityIndex = number;

const params = {
  Exists: (_location: EntityLocation) => {},
  DidNotExist: () => {},
  ExistsWithWrongGeneration: () => {},
};
export const AllocAtWithoutReplacement = Enums.create('AllocAtWithoutReplacement', params);

export type AllocAtWithoutReplacement = EnumInstance<typeof params>;
