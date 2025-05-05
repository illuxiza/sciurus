import { App } from '@sciurus/app';
import { Events } from '@sciurus/ecs';
import { Default, Enum, Option, Type, variant } from 'rustable';
import { State, StatesPlugin, StateTransition, StateTransitionEvent } from '../src';
import { states } from '../src/state/sub_states';

/**
 * Test state enum
 */
@states()
class TestState extends Enum<typeof TestState> {
  @variant
  static A(): TestState {
    return null!;
  }

  @variant
  static B(): TestState {
    return null!;
  }

  @variant
  static C(): TestState {
    return null!;
  }
}

Default.implFor(TestState, {
  static: {
    default(): TestState {
      return TestState.A();
    },
  },
});

describe('AppExtStates', () => {
  test('insert_state can overwrite init_state', () => {
    const app = App.new();
    app.addPlugins(new StatesPlugin());

    app.initState(TestState);
    app.insertState(TestState.B());

    const world = app.world();
    world.runSchedule(StateTransition);

    const state = world.resource(State(TestState)).get();
    expect(state.eq(TestState.B())).toBe(true);

    const events = world.resource(Events(Type(StateTransitionEvent<TestState>, [TestState])));
    expect(events.len()).toBe(1);

    const reader = events.getCursor();
    const last = reader.read(events).iter().last().unwrap();
    expect(last.exit instanceof Option).toBe(true);
    expect(last.exit.isNone()).toBe(true);
    expect(last.enter instanceof Option).toBe(true);
    expect(last.enter.isSome()).toBe(true);
    expect(last.enter.unwrap().eq(TestState.B())).toBe(true);
  });

  test('insert_state can overwrite insert_state', () => {
    const app = App.new();
    app.addPlugins(new StatesPlugin());

    app.insertState(TestState.B());
    app.insertState(TestState.C());

    const world = app.world();
    world.runSchedule(StateTransition);

    const state = world.resource(State(TestState)).get();
    expect(state.eq(TestState.C())).toBe(true);

    const events = world.resource(Events(Type(StateTransitionEvent<TestState>, [TestState])));
    expect(events.len()).toBe(1);

    const reader = events.getCursor();
    const last = reader.read(events).iter().last().unwrap();
    expect(last.exit instanceof Option).toBe(true);
    expect(last.exit.isNone()).toBe(true);
    expect(last.enter instanceof Option).toBe(true);
    expect(last.enter.isSome()).toBe(true);
    expect(last.enter.unwrap().eq(TestState.C())).toBe(true);
  });
});
