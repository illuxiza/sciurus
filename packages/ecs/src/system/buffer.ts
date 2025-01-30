import { World } from '../world/base';
import { DeferredWorld } from '../world/deferred';
import { FromWorld } from '../world/from';
import { SystemMeta } from './types';

/**
 * A trait for system buffers that can defer mutations to the World.
 */
export class SystemBuffer extends FromWorld {
  /**
   * Applies any deferred mutations to the World.
   */
  applyBuffer(_systemMeta: SystemMeta, _world: World): void {}

  /**
   * Queues any deferred mutations to be applied at the next ApplyDeferred.
   */
  queueBuffer(_systemMeta: SystemMeta, _world: DeferredWorld): void {}
}
