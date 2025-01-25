import { Schedule, Schedules } from '../../../ecs/src/schedule/base';
import { Resource } from '../../src/component';
import { World } from '../../src/world/base';

import { derive, Eq } from 'rustable';
import { condition, OptionRes, Res, system } from '../../../ecs/src';
import { ScheduleLabel, SystemSet } from '../../../ecs/src/schedule/set';
import { LogLevel, ScheduleBuildSettings } from '../../../ecs/src/schedule/types';
import { Commands } from '../../../ecs/src/system/commands';

@derive(Resource)
class Resource1 {}

@derive(Resource)
class Resource2 {}

test('ambiguous_with_not_breaking_run_conditions', () => {
  @derive([SystemSet, Eq])
  class Set {}

  @derive([SystemSet, Eq])
  class EmptySet {}

  interface EmptySet extends SystemSet {}

  interface Set extends SystemSet {}

  const world = new World();
  const schedule = new Schedule();

  const sys = system([], () => {
    throw new Error('This system must not run');
  });

  schedule.configureSets(new Set().runIf(condition([], () => false)));
  schedule.addSystems(sys.ambiguousWith(new EmptySet()).inSet(new Set()));
  schedule.run(world);
});

test('inserts_a_sync_point', () => {
  const schedule = new Schedule();
  const world = new World();
  schedule.addSystems(
    [
      system([Commands], (commands: Commands) => commands.insertResource(new Resource1())),
      system([Res(Resource1)], (_: Res<Resource1>) => {}),
    ].chain(),
  );
  schedule.run(world);

  // inserted a sync point
  expect(schedule.executable.systems.len()).toBe(3);
});

test('merges_sync_points_into_one', () => {
  const schedule = new Schedule();
  const world = new World();
  // insert two parallel command systems, it should only create one sync point
  schedule.addSystems(
    [
      [
        system([Commands], (commands: Commands) => commands.insertResource(new Resource1())),
        system([Commands], (commands: Commands) => commands.insertResource(new Resource2())),
      ],
      system([Res(Resource1), Res(Resource2)], (_: Res<Resource1>, __: Res<Resource2>) => {}),
    ].chain(),
  );
  schedule.run(world);

  // inserted sync points
  expect(schedule.executable.systems.len()).toBe(4);

  // merges sync points on rebuild
  schedule.addSystems(
    [
      [
        system([Commands], (commands: Commands) => commands.insertResource(new Resource1())),
        system([Commands], (commands: Commands) => commands.insertResource(new Resource2())),
      ],
      system([Res(Resource1), Res(Resource2)], (_: Res<Resource1>, __: Res<Resource2>) => {}),
    ].chain(),
  );
  schedule.run(world);

  expect(schedule.executable.systems.len()).toBe(7);
});

test('adds_multiple_consecutive_syncs', () => {
  const schedule = new Schedule();
  const world = new World();
  // insert two consecutive command systems, it should create two sync points
  schedule.addSystems(
    [
      system([Commands], (commands: Commands) => commands.insertResource(new Resource1())),
      system([Commands], (commands: Commands) => commands.insertResource(new Resource2())),
      system([Res(Resource1), Res(Resource2)], (_: Res<Resource1>, __: Res<Resource2>) => {}),
    ].chain(),
  );
  schedule.run(world);

  expect(schedule.executable.systems.len()).toBe(5);
});

test('disable_auto_sync_points', () => {
  const schedule = new Schedule();
  schedule.setBuildSettings(new ScheduleBuildSettings(LogLevel.Ignore, LogLevel.Warn, false));
  const world = new World();
  schedule.addSystems(
    [
      system([Commands], (commands: Commands) => commands.insertResource(new Resource1())),
      system([OptionRes(Resource1)], (res1: OptionRes<Resource1>) => {
        expect(res1.isNone()).toBeTruthy();
      }),
    ].chain(),
  );
  schedule.run(world);

  expect(schedule.executable.systems.len()).toBe(2);
});

describe('no_sync_edges', () => {
  const insertResource = system([Commands], function insertResource(commands: Commands) {
    commands.insertResource(new Resource1());
  });

  const resourceDoesNotExist = system(
    [OptionRes(Resource1)],
    function resourceDoesNotExist(res: OptionRes<Resource1>) {
      expect(res.isNone()).toBeTruthy();
    },
  );

  @derive(SystemSet)
  class Sets {
    constructor(public value: number) {}
    static A = new Sets(1);
    static B = new Sets(2);
  }

  interface Sets extends SystemSet {}

  function checkNoSyncEdges(addSystems: (schedule: Schedule) => void) {
    const schedule = new Schedule();
    const world = new World();
    addSystems(schedule);

    schedule.run(world);

    expect(schedule.executable.systems.len()).toBe(2);
  }

  test('system_to_system_after', () => {
    checkNoSyncEdges((schedule) => {
      schedule.addSystems([
        insertResource,
        resourceDoesNotExist.afterIgnoreDeferred(insertResource),
      ]);
    });
  });

  test('system_to_system_before', () => {
    checkNoSyncEdges((schedule) => {
      schedule.addSystems([
        insertResource.beforeIgnoreDeferred(resourceDoesNotExist),
        resourceDoesNotExist,
      ]);
    });
  });

  test('set_to_system_after', () => {
    checkNoSyncEdges((schedule) => {
      schedule
        .addSystems([insertResource, resourceDoesNotExist.inSet(Sets.A)])
        .configureSets(Sets.A.afterIgnoreDeferred(insertResource));
    });
  });

  test('set_to_system_before', () => {
    checkNoSyncEdges((schedule) => {
      schedule
        .addSystems([insertResource.inSet(Sets.A), resourceDoesNotExist])
        .configureSets(Sets.A.beforeIgnoreDeferred(resourceDoesNotExist));
    });
  });

  test('set_to_set_after', () => {
    checkNoSyncEdges((schedule) => {
      schedule
        .addSystems([insertResource.inSet(Sets.A), resourceDoesNotExist.inSet(Sets.B)])
        .configureSets(Sets.B.afterIgnoreDeferred(Sets.A));
    });
  });

  test('set_to_set_before', () => {
    checkNoSyncEdges((schedule) => {
      schedule
        .addSystems([insertResource.inSet(Sets.A), resourceDoesNotExist.inSet(Sets.B)])
        .configureSets(Sets.A.beforeIgnoreDeferred(Sets.B));
    });
  });
});

describe('no_sync_chain', () => {
  @derive(Resource)
  class Ra {}

  @derive(Resource)
  class Rb {}

  @derive(Resource)
  class Rc {}

  function runSchedule(expectedNumSystems: number, addSystems: (schedule: Schedule) => void) {
    const schedule = new Schedule();
    const world = new World();
    addSystems(schedule);

    schedule.run(world);

    expect(schedule.executable.systems.len()).toBe(expectedNumSystems);
  }

  test('only_chain_outside', () => {
    runSchedule(5, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => {
              commands.insertResource(new Ra());
            }),
            system([Commands], (commands: Commands) => commands.insertResource(new Rb())),
          ],
          [
            system([OptionRes(Ra), OptionRes(Rb)], (resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
              expect(resA.isSome()).toBeTruthy();
              expect(resB.isSome()).toBeTruthy();
            }),
            system([OptionRes(Ra), OptionRes(Rb)], (resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
              expect(resA.isSome()).toBeTruthy();
              expect(resB.isSome()).toBeTruthy();
            }),
          ],
        ].chain(),
      );
    });

    runSchedule(4, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands], (commands: Commands) => commands.insertResource(new Rb())),
          ],
          [
            system([OptionRes(Ra), OptionRes(Rb)], (resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
              expect(resA.isNone()).toBeTruthy();
              expect(resB.isNone()).toBeTruthy();
            }),
            system([OptionRes(Ra), OptionRes(Rb)], (resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
              expect(resA.isNone()).toBeTruthy();
              expect(resB.isNone()).toBeTruthy();
            }),
          ],
        ].chainIgnoreDeferred(),
      );
    });
  });

  test('chain_first', () => {
    runSchedule(6, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands, OptionRes(Ra)], (commands: Commands, resA: OptionRes<Ra>) => {
              commands.insertResource(new Rb());
              expect(resA).toBeDefined();
            }),
          ].chain(),
          [
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                expect(resA).toBeDefined();
                expect(resB).toBeDefined();
              },
            ),
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                expect(resA).toBeDefined();
                expect(resB).toBeDefined();
              },
            ),
          ],
        ].chain(),
      );
    });

    runSchedule(5, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands, OptionRes(Ra)], (commands: Commands, resA: OptionRes<Ra>) => {
              commands.insertResource(new Rb());
              expect(resA).toBeDefined();
            }),
          ].chain(),
          [
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isNone()).toBeTruthy();
              },
            ),
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isNone()).toBeTruthy();
              },
            ),
          ],
        ].chainIgnoreDeferred(),
      );
    });
  });

  test('chain_second', () => {
    runSchedule(6, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands], (commands: Commands) => commands.insertResource(new Rb())),
          ],
          [
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                commands.insertResource(new Rc());
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isSome()).toBeTruthy();
              },
            ),
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb), OptionRes(Rc)],
              (
                commands: Commands,
                resA: OptionRes<Ra>,
                resB: OptionRes<Rb>,
                resC: OptionRes<Rc>,
              ) => {
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isSome()).toBeTruthy();
                expect(resC.isSome()).toBeTruthy();
              },
            ),
          ].chain(),
        ].chain(),
      );
    });

    runSchedule(5, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands], (commands: Commands) => commands.insertResource(new Rb())),
          ],
          [
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                commands.insertResource(new Rc());
                expect(resA.isNone()).toBeTruthy();
                expect(resB.isNone()).toBeTruthy();
              },
            ),
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb), OptionRes(Rc)],
              (
                commands: Commands,
                resA: OptionRes<Ra>,
                resB: OptionRes<Rb>,
                resC: OptionRes<Rc>,
              ) => {
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isSome()).toBeTruthy();
                expect(resC.isSome()).toBeTruthy();
              },
            ),
          ].chain(),
        ].chainIgnoreDeferred(),
      );
    });
  });

  test('chain_all', () => {
    runSchedule(7, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands, OptionRes(Ra)], (commands: Commands, resA: OptionRes<Ra>) => {
              commands.insertResource(new Rb());
              expect(resA.isSome()).toBeTruthy();
            }),
          ].chain(),
          [
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                commands.insertResource(new Rc());
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isSome()).toBeTruthy();
              },
            ),
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb), OptionRes(Rc)],
              (
                commands: Commands,
                resA: OptionRes<Ra>,
                resB: OptionRes<Rb>,
                resC: OptionRes<Rc>,
              ) => {
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isSome()).toBeTruthy();
                expect(resC.isSome()).toBeTruthy();
              },
            ),
          ].chain(),
        ].chain(),
      );
    });

    runSchedule(6, (schedule) => {
      schedule.addSystems(
        [
          [
            system([Commands], (commands: Commands) => commands.insertResource(new Ra())),
            system([Commands, OptionRes(Ra)], (commands: Commands, resA: OptionRes<Ra>) => {
              commands.insertResource(new Rb());
              expect(resA.isSome()).toBeTruthy();
            }),
          ].chain(),
          [
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb)],
              (commands: Commands, resA: OptionRes<Ra>, resB: OptionRes<Rb>) => {
                commands.insertResource(new Rc());
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isNone()).toBeTruthy();
              },
            ),
            system(
              [Commands, OptionRes(Ra), OptionRes(Rb), OptionRes(Rc)],
              (
                commands: Commands,
                resA: OptionRes<Ra>,
                resB: OptionRes<Rb>,
                resC: OptionRes<Rc>,
              ) => {
                expect(resA.isSome()).toBeTruthy();
                expect(resB.isSome()).toBeTruthy();
                expect(resC.isSome()).toBeTruthy();
              },
            ),
          ].chain(),
        ].chainIgnoreDeferred(),
      );
    });
  });
});

@derive(ScheduleLabel)
class TestSchedule {
  static hash() {
    return 'TestSchedule';
  }

  static equals(other: any) {
    return other instanceof TestSchedule;
  }

  static clone() {
    return new TestSchedule();
  }
}

@derive(Resource)
class CheckSystemRan {
  constructor(public value: number = 0) {}
}

test('add_systems_to_existing_schedule', () => {
  const schedules = new Schedules();
  const schedule = new Schedule(new TestSchedule());

  schedules.insert(schedule);
  schedules.addSystems(
    new TestSchedule(),
    system(
      [Commands, Res(CheckSystemRan)],
      (commands: Commands, ran: CheckSystemRan) => ran.value++,
    ),
  );

  const world = new World();

  world.insertResource(new CheckSystemRan(0));
  world.insertResource(schedules);
  world.runSchedule(new TestSchedule());

  const value = world.getResource(CheckSystemRan);
  expect(value.isSome()).toBe(true);
  expect(value.unwrap().value).toBe(1);
});

test('add_systems_to_non_existing_schedule', () => {
  const schedules = new Schedules();

  schedules.addSystems(
    new TestSchedule(),
    system(
      [Commands, Res(CheckSystemRan)],
      (commands: Commands, ran: CheckSystemRan) => ran.value++,
    ),
  );

  const world = new World();

  world.insertResource(new CheckSystemRan(0));
  world.insertResource(schedules);
  world.runSchedule(new TestSchedule());

  const value = world.getResource(CheckSystemRan);
  expect(value.isSome()).toBe(true);
  expect(value.unwrap().value).toBe(1);
});

@derive(SystemSet)
class TestSet {
  constructor(public id: number) {}
  static First = new TestSet(0);
  static Second = new TestSet(1);
}

interface TestSet extends SystemSet {}

test('configure_set_on_existing_schedule', () => {
  const schedules = new Schedules();
  const schedule = new Schedule(new TestSchedule());

  schedules.insert(schedule);

  schedules.configureSets(new TestSchedule(), [TestSet.First, TestSet.Second].chain());
  schedules.addSystems(
    new TestSchedule(),
    system([Commands, Res(CheckSystemRan)], (commands: Commands, ran: CheckSystemRan) => {
      expect(ran.value).toBe(0);
      ran.value++;
    }).inSet(TestSet.First),
  );

  schedules.addSystems(
    new TestSchedule(),
    system([Commands, Res(CheckSystemRan)], (commands: Commands, ran: CheckSystemRan) => {
      expect(ran.value).toBe(1);
      ran.value++;
    }).inSet(TestSet.Second),
  );

  const world = new World();

  world.insertResource(new CheckSystemRan(0));
  world.insertResource(schedules);
  world.runSchedule(new TestSchedule());

  const value = world.getResource(CheckSystemRan);
  expect(value.isSome()).toBe(true);
  expect(value.unwrap().value).toBe(2);
});

test('configure_set_on_new_schedule', () => {
  const schedules = new Schedules();

  schedules.configureSets(new TestSchedule(), [TestSet.First, TestSet.Second].chain());
  schedules.addSystems(
    new TestSchedule(),
    system([Commands, Res(CheckSystemRan)], (commands: Commands, ran: CheckSystemRan) => {
      expect(ran.value).toBe(0);
      ran.value++;
    }).inSet(TestSet.First),
  );

  schedules.addSystems(
    new TestSchedule(),
    system([Commands, Res(CheckSystemRan)], (commands: Commands, ran: CheckSystemRan) => {
      expect(ran.value).toBe(1);
      ran.value++;
    }).inSet(TestSet.Second),
  );

  const world = new World();

  world.insertResource(new CheckSystemRan(0));
  world.insertResource(schedules);
  world.runSchedule(new TestSchedule());

  const value = world.getResource(CheckSystemRan);
  expect(value.isSome()).toBe(true);
  expect(value.unwrap().value).toBe(2);
});
