import { Constructor, Default, derive, hasTrait, implTrait } from 'rustable';
import { Resource } from '../../../ecs/src/component';
import { Commands } from '../../../ecs/src/system/commands';
import { System } from '../../src/system/base';
import { World } from '../../src/world/base';

@derive([Resource, Default])
class Counter {
  constructor(public value: number = 0) {}
}

class FnSystem<T extends (...args: any[]) => any> {
  params: Function[] = [];
  constructor(
    public func: T,
    public paramTypes: Constructor<any>[],
  ) {}

  name(): string {
    return this.func.name || 'anonymous_system';
  }

  run(_input: any, world: World): any {
    const ret = this.func(world.commands, ...this.params.map((p) => p()), _input);
    world.flush();
    return ret;
  }

  validateParam(_world: World): boolean {
    for (let i = 0; i < this.paramTypes.length; i++) {
      if (hasTrait(this.paramTypes[i], Resource)) {
        if (_world.getResource(this.paramTypes[i]).isNone()) {
          return false;
        }
      }
    }
    return true;
  }

  initialize(_world: World): void {
    for (let i = 0; i < this.paramTypes.length; i++) {
      if (hasTrait(this.paramTypes[i], Resource)) {
        this.params[i] = () => _world.resource(this.paramTypes[i]);
      }
    }
  }
}

const systemFn = (paramtypes: Constructor<any>[], func: (...args: any[]) => any) =>
  new FnSystem(func, paramtypes);

implTrait(FnSystem, System);
describe('System', () => {
  it('should run system once', () => {
    @derive(Resource)
    class T {
      constructor(public value: number) {}
    }

    const system = systemFn([], (commonds: Commands, input: number): number => {
      commonds.insertResource(new T(input));
      return input + 1;
    });

    const world = new World();
    const result = world.runSystemOnceWith(system, 1).unwrap();
    expect(result).toBe(2);
    expect(world.resource(T).value).toBe(1);
  });

  it('should run two systems', () => {
    const countUp = systemFn([Counter], (_: Commands, counter: Counter) => {
      if (counter) {
        counter.value += 1;
      }
    });

    const world = new World();
    world.initResource(Counter);
    expect(world.resource(Counter).value).toBe(0);

    world.runSystemOnce(countUp);
    expect(world.resource(Counter).value).toBe(1);

    world.runSystemOnce(countUp);
    expect(world.resource(Counter).value).toBe(2);
  });

  it('should process commands', () => {
    const spawnEntity = systemFn([], (commonds: Commands) => {
      commonds.spawnEmpty();
    });

    const world = new World();
    expect(world.entities.length).toBe(0);

    world.runSystemOnce(spawnEntity);
    expect(world.entities.length).toBe(1);
  });

  it('should handle non-send resources', () => {
    const nonSendCountDown = systemFn([Counter], (_commonds: Commands, counter: Counter) => {
      if (counter) {
        counter.value -= 1;
      }
    });

    const world = new World();
    world.insertResource(new Counter(10));
    expect(world.resource(Counter).value).toBe(10);

    world.runSystemOnce(nonSendCountDown);
    expect(world.resource(Counter).value).toBe(9);
  });

  it('should handle invalid params in run system once', () => {
    @derive(Resource)
    class T {}

    const system = systemFn([T], (_commonds: Commands, t: T) => {
      return t;
    });

    const world = new World();
    const result = world.runSystemOnce(system);
    expect(result.isErr()).toBe(true);
  });
});
