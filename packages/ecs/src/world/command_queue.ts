import { Default, derive, Err, Option, Result, Some, Trait, Vec } from 'rustable';
import { SystemBuffer } from '../system/buffer';
import { SystemMeta } from '../system/types';
import { World } from './base';
import { DeferredWorld } from './deferred';

/**
 * Interface for commands that can be queued and executed later
 */
export class Command extends Trait {
  apply(_world: World): void {
    throw new Error('Command.apply must be implemented');
  }
}

/**
 * Metadata for a command, containing function to consume and execute/drop the command
 */
interface CommandMeta<T extends object> {
  /**
   * Function to consume the command and get its size
   * @param command The command to consume
   * @param world Optional world to apply the command to
   */
  consumeCommandAndGetSize(command: T, world: Option<World>): void;
}

/**
 * A queue of heterogeneous commands that can be executed later
 */
@derive([Default])
export class CommandQueue {
  private __bytes: Vec<{ meta: CommandMeta<any>; command: object }> = Vec.new();
  private __cursor: number = 0;
  private __panicRecovery: Array<{
    meta: CommandMeta<any>;
    command: object;
  }> = [];
  resume?: (error: Error) => Result<any, Error> = (error) => Err(error);

  /**
   * Push a command onto the queue
   */
  push<C extends object>(command: C): void {
    const meta: CommandMeta<C> = {
      consumeCommandAndGetSize: (cmd: C, world: Option<World>) => {
        world.match({
          Some: (w) => {
            (cmd as Command).apply(w);
            // The command may have queued up world commands, which we flush here
            w.flush();
          },
          None: () => {
            drop(cmd);
          },
        });
      },
    };

    this.__bytes.push({ meta, command });
  }

  /**
   * Execute all queued commands in the world
   */
  apply(world: World): void {
    // Flush any previously queued entities
    world.flushEntities();

    // Flush the world's internal queue
    world.flushCommands();

    this.applyOrDropQueued(Some(world));
  }

  /**
   * Take all commands from other and append them to self
   */
  append(other: CommandQueue): void {
    this.__bytes.append(other.__bytes);
  }

  /**
   * Returns true if there are no commands in the queue
   */
  isEmpty(): boolean {
    return this.__cursor >= this.__bytes.len();
  }

  /**
   * Apply or drop all queued commands
   */
  applyOrDropQueued(world: Option<World>): void {
    const start = this.__cursor;
    const stop = this.__bytes.len();
    let localCursor = start;
    this.__cursor = stop;

    try {
      while (localCursor < stop) {
        const { meta, command } = this.__bytes.getUnchecked(localCursor);
        localCursor++;
        try {
          meta.consumeCommandAndGetSize(command, world);
        } catch (error) {
          let result: Result<any, Error>;
          if (this.resume) {
            result = this.resume(error as Error);
          } else {
            result = Err(error as Error);
          }
          if (result.isErr()) {
            // Handle panic recovery
            const currentStop = this.__bytes.len();
            this.__panicRecovery.push(...this.__bytes.slice(localCursor, currentStop));
            this.__bytes.truncate(start);
            this.__cursor = start;

            if (start === 0) {
              this.__bytes.extend(this.__panicRecovery);
            }
            throw result.unwrapErr();
          }
        }
      }
    } finally {
      // Reset the buffer
      this.__bytes.truncate(start);
      this.__cursor = start;
    }
  }
}

export class FunctionCommand {
  constructor(public fn: (world: World) => void) {}
}

Command.implFor(FunctionCommand, {
  apply(world: World): void {
    this.fn(world);
  },
});

export interface FunctionCommand extends Command {}

export function commandFn(command: (world: World) => void) {
  return new FunctionCommand(command);
}

function drop<T extends object>(t: T): void {
  if ('drop' in t) {
    (t as any).drop();
  }
}

SystemBuffer.implFor(CommandQueue, {
  applyBuffer(_systemMeta: SystemMeta, world: World): void {
    this.apply(world);
  },
  queueBuffer(_systemMeta: SystemMeta, world: DeferredWorld): void {
    world.commands.append(this);
  },
});

export interface CommandQueue extends SystemBuffer {}
