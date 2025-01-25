import { SingleThreadedExecutor } from './single_threaded';
import {
  ApplyDeferred,
  ExecutorKind,
  isApplyDeferred,
  SystemExecutor,
  SystemSchedule,
} from './types';

export function makeExecutor(kind: ExecutorKind): SystemExecutor {
  switch (kind) {
    case ExecutorKind.SingleThreaded:
      return new SingleThreadedExecutor();
    default:
      throw new Error(`Unsupported executor kind: ${kind}`);
  }
}

export {
  ApplyDeferred,
  ExecutorKind,
  isApplyDeferred,
  SingleThreadedExecutor,
  SystemExecutor,
  SystemSchedule,
};
