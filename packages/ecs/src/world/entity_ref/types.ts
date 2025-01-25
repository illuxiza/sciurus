export enum GetEntityMutByIdError {
  /** The ComponentInfo could not be found. */
  InfoNotFound = 'the ComponentInfo could not be found',

  /** The Component is immutable. Creating a mutable reference violates its invariants. */
  ComponentIsImmutable = 'the Component is immutable',

  /** This Entity does not have the desired Component. */
  ComponentNotFound = 'the Component could not be found',
}

export const QUERY_MISMATCH_ERROR = 'Query does not match the current entity';
