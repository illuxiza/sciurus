import {
  Commands,
  Component,
  Entity,
  Event,
  Events,
  EventWriter,
  Query,
  RemovedComponents,
  Res,
  Resource,
  ScheduleLabel,
  system,
  With,
  World,
} from '@sciurus/ecs';
import { Default, derive, Type } from 'rustable';
import { App, AppExit, SubApp } from '../src/app';
import { PreUpdate, Update } from '../src/main_schedule';
import { Plugin } from '../src/plugin';

@derive([Plugin])
class PluginA {
  build(_app: App): void {}
}

@derive([Plugin])
class PluginB {
  build(_app: App): void {}
}

@derive([Plugin])
class PluginC<T> {
  constructor(private value: T) {}
  build(_app: App): void {}
}

@derive([Plugin])
class PluginD {
  build(_app: App): void {}
  isUnique(): boolean {
    return false;
  }
}

@derive([Plugin])
class PluginE {
  build(_app: App): void {}
  finish(app: App): void {
    if (app.isPluginAdded<PluginA>(PluginA)) {
      throw new Error('cannot run if PluginA is already registered');
    }
  }
}

describe('app tests', () => {
  test('can_add_two_plugins', () => {
    App.new().addPlugins(new PluginA()).addPlugins(new PluginB());
  });

  test('cant_add_twice_the_same_plugin', () => {
    expect(() => {
      App.new().addPlugins(new PluginA()).addPlugins(new PluginA());
    }).toThrow();
  });

  test('can_add_twice_the_same_plugin_with_different_type_param', () => {
    const NumberPluginC = Type(PluginC, [Number]);
    const BooleanPluginC = Type(PluginC, [Boolean]);
    App.new().addPlugins(new NumberPluginC(0)).addPlugins(new BooleanPluginC(true));
  });

  test('can_add_twice_the_same_plugin_not_unique', () => {
    App.new().addPlugins(new PluginD()).addPlugins(new PluginD());
  });

  test('cant_call_app_run_from_plugin_build', () => {
    @derive([Plugin])
    class PluginRun {
      build(app: App): void {
        app.addPlugins(new InnerPlugin()).run();
      }
    }

    @derive([Plugin])
    class InnerPlugin {
      build(_app: App): void {}
    }

    expect(() => {
      App.new().addPlugins(new PluginRun());
    }).toThrow();
  });

  @derive([Default, ScheduleLabel])
  class EnterMainMenu {}

  const bar = system([Commands], (commands: Commands) => {
    commands.spawnEmpty();
  });

  const foo = system([Commands], (commands: Commands) => {
    commands.spawnEmpty();
  });

  test('add_systems_should_create_schedule_if_it_does_not_exist', () => {
    const app = App.new();
    app.addSystems(EnterMainMenu, [foo, bar]);

    app.world().runSchedule(EnterMainMenu);
    expect(app.world().entities.len()).toBe(2);
  });

  test('test_is_plugin_added_works_during_finish', () => {
    const app = App.new();
    app.addPlugins(new PluginA());
    app.addPlugins(new PluginE());
    expect(() => {
      app.finish();
    }).toThrow();
  });

  test('test_derive_app_label', () => {
    @derive([ScheduleLabel])
    class UnitLabel {}

    @derive([ScheduleLabel])
    class TupleLabel {
      constructor(
        public a: number,
        public b: number,
      ) {}
    }

    @derive([ScheduleLabel])
    class StructLabel {
      constructor(
        public a: number,
        public b: number,
      ) {}
    }

    const unitLabel1 = new UnitLabel();
    const unitLabel2 = new UnitLabel();
    const tupleLabel1 = new TupleLabel(0, 0);
    const tupleLabel2 = new TupleLabel(0, 0);
    const tupleLabel3 = new TupleLabel(0, 1);
    const structLabel1 = new StructLabel(0, 0);
    const structLabel2 = new StructLabel(0, 0);
    const structLabel3 = new StructLabel(0, 1);

    expect(unitLabel1.eq(unitLabel2)).toBeTruthy();
    expect(tupleLabel1.eq(tupleLabel2)).toBeTruthy();
    expect(tupleLabel1.eq(tupleLabel3)).toBeFalsy();
    expect(structLabel1.eq(structLabel2)).toBeTruthy();
    expect(structLabel1.eq(structLabel3)).toBeFalsy();
    expect(unitLabel1.eq(tupleLabel1)).toBeFalsy();
    expect(tupleLabel1.eq(structLabel1)).toBeFalsy();
  });

  test('test_update_clears_trackers_once', () => {
    @derive([Component])
    class Foo {}

    const app = App.new();
    const bundle = Array(5).fill(new Foo());
    {
      using _ = app.world().spawnBatch(bundle[Symbol.iterator]());
    }
    const despawnOneFoo = system(
      [Commands, Query(Entity, With(Foo))],
      (commands: Commands, foos: Query<Entity>) => {
        const entity = foos.iter().next();
        if (entity.isSome()) {
          commands.entity(entity.unwrap()).despawn();
        }
      },
    );

    const checkDespawns = system([RemovedComponents(Foo)], (removed: RemovedComponents<Foo>) => {
      let despawnCount = 0;
      for (const _ of removed.read()) {
        despawnCount++;
      }
      expect(despawnCount).toBe(2);
    });

    app.addSystems(Update, despawnOneFoo);
    app.update(); // Frame 0
    app.update(); // Frame 1
    app.addSystems(Update, checkDespawns.after(despawnOneFoo));
    app.update(); // Should see despawns from frames 1 & 2, but not frame 0
  });

  test('test_extract_sees_changes', () => {
    @derive([Resource])
    class Foo {
      constructor(public value: number = 0) {}
    }

    const app = App.new();
    app.world().insertResource(new Foo(0));

    const incrementFoo = system([Res(Foo)], (foo: Res<Foo>) => {
      foo.value++;
    });

    app.addSystems(Update, incrementFoo);

    const subApp = SubApp.new();
    subApp.setExtract((mainWorld: World, _subWorld: World) => {
      expect(mainWorld.getResourceMut<Foo>(Foo).unwrap().isChanged()).toBeTruthy();
    });

    app.insertSubApp('test', subApp);
    app.update();
  });

  test('runner_returns_correct_exit_code', () => {
    const raiseExits = system([EventWriter(AppExit)], (exits: EventWriter<AppExit>) => {
      exits.send(AppExit.Success());
      exits.send(AppExit.Error(4));
      exits.send(AppExit.Error(73));
    });

    const exit = App.new().addSystems(Update, raiseExits).run();

    expect(exit).toEqual(AppExit.Error(4));
  });

  test('regression_test_10385', () => {
    @derive([Resource])
    class MyState {}

    function myRunner(app: App): AppExit {
      const myState = new MyState();
      app.world().insertResource(myState);

      for (let i = 0; i < 5; i++) {
        app.update();
      }

      return AppExit.Success();
    }

    const mySystem = system([Res(MyState)], (_state: Res<MyState>) => {
      // access state during app update
    });

    // Should not panic due to missing resource
    App.new().setRunner(myRunner).addSystems(PreUpdate, mySystem).run();
  });

  test('initializing_resources_from_world', () => {
    @derive([Resource, Default])
    class TestResource {
      static fromWorld(_world: World): TestResource {
        return new TestResource();
      }
    }

    @derive([Resource, Default])
    class NonSendTestResource {
      private _marker: any;
      static fromWorld(_world: World): NonSendTestResource {
        return new NonSendTestResource();
      }
    }

    App.new()
      .initResource<NonSendTestResource>(NonSendTestResource)
      .initResource<TestResource>(TestResource);
  });

  test('plugin_should_not_be_added_during_build_time', () => {
    @derive([Plugin])
    class Foo {
      build(app: App): void {
        expect(app.isPluginAdded<Foo>(Foo)).toBeFalsy();
      }
    }

    App.new().addPlugins(new Foo());
  });

  test('events_should_be_updated_once_per_update', () => {
    @derive([Event])
    class TestEvent {}

    const app = App.new();
    app.addEvent(TestEvent);

    // Starts empty
    let testEvents = app.world().resource<Events<TestEvent>>(Events(TestEvent));
    expect(testEvents.len()).toBe(0);
    expect(testEvents.iterCurrentUpdateEvents().count()).toBe(0);
    app.update();

    // Sending one event
    app.world().sendEvent(new TestEvent());

    testEvents = app.world().resource<Events<TestEvent>>(Events(TestEvent));
    expect(testEvents.len()).toBe(1);
    expect(testEvents.iterCurrentUpdateEvents().count()).toBe(1);
    app.update();

    // Sending two events on the next frame
    app.world().sendEvent(new TestEvent());
    app.world().sendEvent(new TestEvent());

    testEvents = app.world().resource<Events<TestEvent>>(Events(TestEvent));
    expect(testEvents.len()).toBe(3); // Events are double-buffered, so we see 1 + 2 = 3
    expect(testEvents.iterCurrentUpdateEvents().count()).toBe(2);
    app.update();

    // Sending zero events
    testEvents = app.world().resource<Events<TestEvent>>(Events(TestEvent));
    expect(testEvents.len()).toBe(2); // Events are double-buffered, so we see 2 + 0 = 2
    expect(testEvents.iterCurrentUpdateEvents().count()).toBe(0);
  });
});
