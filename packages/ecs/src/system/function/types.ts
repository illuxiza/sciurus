export const ERROR_UNINITIALIZED =
  "System's state was not found. Did you forget to initialize this system before running it?";

/**
 * The state of a FunctionSystem
 */
export interface FunctionSystemState<P> {
  param: P;
  worldId: number;
}
