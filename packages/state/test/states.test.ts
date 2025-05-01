import { EventRegistry, Schedule, Schedules, World } from '@sciurus/ecs';
import {
  Constructor,
  Default,
  Enum,
  Eq,
  None,
  Option,
  Some,
  Type,
  derive,
  variant,
} from 'rustable';
import {
  ComputedStates,
  FreelyMutableState,
  NextState,
  State,
  StateSet,
  StateTransition,
  StateTransitionEvent,
  SubStates,
  setupStateTransitionsInWorld,
} from '../src/state';
import { states } from '../src/state/sub_states';

// Test helper function to setup state transitions in a world
function setupTestWorld(): World {
  const world = new World();
  setupStateTransitionsInWorld(world);
  return world;
}

describe('State management tests', () => {
  @states()
  class SimpleState extends Enum<typeof SimpleState> {
    @variant
    static A(): SimpleState {
      return null!;
    }
    @variant
    static B(_value: boolean): SimpleState {
      return null!;
    }
  }

  Default.implFor(SimpleState, {
    static: {
      default(): SimpleState {
        return SimpleState.A();
      },
    },
  });

  // Define a test computed state
  class TestComputedState extends Enum<typeof TestComputedState> {
    @variant
    static BisTrue(): TestComputedState {
      return null!;
    }

    @variant
    static BisFalse(): TestComputedState {
      return null!;
    }
  }

  const OptionSimpleState = Type(Option, [SimpleState]);

  interface OptionSimpleState extends Option<SimpleState> {}

  ComputedStates.implFor(TestComputedState, {
    static: {
      sourceStates(): Constructor<StateSet> {
        return OptionSimpleState;
      },
      compute(sources: Option<SimpleState>): Option<TestComputedState> {
        return sources.andThen((v) =>
          v.match({
            A: () => None,
            B: (value) => Some(value ? TestComputedState.BisTrue() : TestComputedState.BisFalse()),
          }),
        );
      },
    },
  });

  test('computed state with a single source is correctly derived', () => {
    const world = new World();
    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [TestComputedState]), world);

    // Initialize state
    const simpleStateType = Type(State, [SimpleState]);
    world.initResource(simpleStateType);
    const schedules = new Schedules();
    let applyChanges = new Schedule(StateTransition);
    ComputedStates.staticWrap(TestComputedState).regSystems(applyChanges);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    schedules.insert(applyChanges);

    world.insertResource(schedules);

    setupStateTransitionsInWorld(world);

    // Check initial state
    const computedStateType = Type(State, [TestComputedState]);

    world.runSchedule(StateTransition);
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.A());
    expect(world.containsResource(computedStateType)).toBe(false);

    // Transition to B(true)
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.B(true));
    expect(world.containsResource(computedStateType)).toBe(true);
    expect(world.getResource(computedStateType).unwrap().val).toEqual(TestComputedState.BisTrue());

    // Transition to B(false)
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(false)));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.B(false));
    expect(world.containsResource(computedStateType)).toBe(true);
    expect(world.getResource(computedStateType).unwrap().val).toEqual(TestComputedState.BisFalse());

    // Transition back to A
    world.insertResource(NextState(SimpleState).Pending(SimpleState.A()));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.A());
    expect(world.containsResource(computedStateType)).toBe(false);
  });

  // Define a SubState class
  @states({
    source: SimpleState.B(true),
  })
  class SubState extends Enum<typeof SubState> {
    @variant
    static One(): SubState {
      return null!;
    }

    @variant
    static Two(): SubState {
      return null!;
    }
  }

  Default.implFor(SubState, {
    static: {
      default() {
        return SubState.One();
      },
    },
  });

  test('sub state exists only when allowed but can be modified freely', () => {
    const world = new World();

    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SubState]), world);
    // Initialize state
    const simpleStateType = State(SimpleState);
    world.initResource(simpleStateType);

    // Create schedule
    const schedules = new Schedules();
    let applyChanges = new Schedule(StateTransition);
    SubStates.staticWrap(SubState).regSubSystems(applyChanges);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);

    schedules.insert(applyChanges);

    world.insertResource(schedules);

    setupStateTransitionsInWorld(world);

    // Run initial schedule
    world.runSchedule(StateTransition);

    // Check initial state
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.A());

    const subStateType = Type(State, [SubState]);
    expect(world.containsResource(subStateType)).toBe(false);

    // Try to transition to SubState::Two
    world.insertResource(NextState(SubState).Pending(SubState.Two()));
    world.runSchedule(StateTransition);

    // Check states after transition - should still be in SimpleState::A with no SubState
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.A());
    expect(world.containsResource(subStateType)).toBe(false);

    // Transition to B(true) which should allow SubState
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.B(true));
    expect(world.containsResource(subStateType)).toBe(true);
    expect(world.getResource(subStateType).unwrap().val).toEqual(SubState.One());

    // Transition SubState to Two
    world.insertResource(NextState(SubState).Pending(SubState.Two()));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.B(true));
    expect(world.containsResource(subStateType)).toBe(true);
    expect(world.getResource(subStateType).unwrap().val).toEqual(SubState.Two());

    // Transition to B(false) which should not allow SubState
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(false)));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.getResource(simpleStateType).unwrap().val).toEqual(SimpleState.B(false));
    expect(world.containsResource(subStateType)).toBe(false);
  });

  // Define a SubStateOfComputed class
  @states({
    source: TestComputedState.BisTrue(),
  })
  class SubStateOfComputed extends Enum<typeof SubStateOfComputed> {
    @variant
    static One(): SubStateOfComputed {
      return null!;
    }

    @variant
    static Two(): SubStateOfComputed {
      return null!;
    }
  }

  Default.implFor(SubStateOfComputed, {
    static: {
      default() {
        return SubStateOfComputed.One();
      },
    },
  });

  test('substate of computed states works appropriately', () => {
    const world = new World();

    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [TestComputedState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SubStateOfComputed]), world);

    // Initialize state
    const simpleStateType = Type(State, [SimpleState]);
    world.initResource(simpleStateType);

    const schedules = new Schedules();
    let applyChanges = new Schedule(StateTransition);
    // Register state systems
    ComputedStates.staticWrap(TestComputedState).regSystems(applyChanges);
    SubStates.staticWrap(SubStateOfComputed).regSubSystems(applyChanges);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    schedules.insert(applyChanges);

    world.insertResource(schedules);

    setupStateTransitionsInWorld(world);

    // Run initial schedule
    world.runSchedule(StateTransition);
    // Check initial state
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.A());
    const subStateType = Type(State, [SubStateOfComputed]);
    expect(world.containsResource(subStateType)).toBe(false);

    // Try to transition to SubStateOfComputed::Two
    world.insertResource(NextState(SubStateOfComputed).Pending(SubStateOfComputed.Two()));
    world.runSchedule(StateTransition);

    // Check states after transition - should still be in SimpleState::A with no SubStateOfComputed
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.A());
    expect(world.containsResource(subStateType)).toBe(false);

    // Transition to B(true) which should allow SubStateOfComputed via TestComputedState
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.B(true));
    expect(world.resource(subStateType).val).toEqual(SubStateOfComputed.One());

    // Transition SubStateOfComputed to Two
    world.insertResource(NextState(SubStateOfComputed).Pending(SubStateOfComputed.Two()));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.B(true));
    expect(world.resource(subStateType).val).toEqual(SubStateOfComputed.Two());

    // Transition to B(false) which should not allow SubStateOfComputed
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(false)));
    world.runSchedule(StateTransition);

    // Check states after transition
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.B(false));
    expect(world.containsResource(subStateType)).toBe(false);
  });

  // // Define OtherState class
  @derive([Eq, Default])
  @states()
  class OtherState {
    constructor(
      public a_flexible_value: string = '',
      public another_value: number = 0,
    ) {}
  }

  // Define ComplexComputedState class
  class ComplexComputedState extends Enum<typeof ComplexComputedState> {
    @variant
    static InAAndStrIsBobOrJane(): ComplexComputedState {
      return null!;
    }

    @variant
    static InTrueBAndUsizeAbove8(): ComplexComputedState {
      return null!;
    }
  }

  ComputedStates.implFor(ComplexComputedState, {
    static: {
      sourceStates(): Constructor<any> {
        return Type(Array, [Type(Option, [SimpleState]), Type(Option, [OtherState])]);
      },
      compute(sources: [Option<SimpleState>, Option<OtherState>]): Option<ComplexComputedState> {
        const [simple, complex] = sources;

        if (
          simple.isSome() &&
          complex.isSome() &&
          simple.unwrap().eq(SimpleState.A()) &&
          (complex.unwrap().a_flexible_value === 'bob' ||
            complex.unwrap().a_flexible_value === 'jane')
        ) {
          return Some(ComplexComputedState.InAAndStrIsBobOrJane());
        } else if (
          simple.isSome() &&
          complex.isSome() &&
          simple.unwrap().eq(SimpleState.B(true)) &&
          complex.unwrap().another_value > 8
        ) {
          return Some(ComplexComputedState.InTrueBAndUsizeAbove8());
        } else {
          return None;
        }
      },
    },
  });

  test('complex computed state gets derived correctly', () => {
    const world = new World();
    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [OtherState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [ComplexComputedState]), world);

    // Initialize state
    const simpleStateType = Type(State, [SimpleState]);
    world.initResource(simpleStateType);
    // Initialize states
    const otherStateType = Type(State, [OtherState]);
    world.initResource(otherStateType);

    const schedules = new Schedules();
    let applyChanges = new Schedule(StateTransition);
    // Create schedule
    // Register state systems
    ComputedStates.staticWrap(ComplexComputedState).regSystems(applyChanges);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    FreelyMutableState.staticWrap(OtherState).regState(applyChanges);

    schedules.insert(applyChanges);

    world.insertResource(schedules);

    setupStateTransitionsInWorld(world);

    // Run initial schedule
    world.runSchedule(StateTransition);

    // Check initial states
    const complexStateType = Type(State, [ComplexComputedState]);

    expect(world.resource(simpleStateType).val).toEqual(SimpleState.A());
    expect(world.resource(otherStateType).val).toEqual(new OtherState());
    expect(world.containsResource(complexStateType)).toBe(false);

    // Transition to B(true)
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.runSchedule(StateTransition);

    // Check states - still no complex state
    expect(world.containsResource(complexStateType)).toBe(false);

    // Transition OtherState to have a high value
    world.insertResource(NextState(OtherState).Pending(new OtherState('felix', 13)));
    world.runSchedule(StateTransition);

    // Check states - should now have complex state
    expect(world.resource(complexStateType).val).toEqual(
      ComplexComputedState.InTrueBAndUsizeAbove8(),
    );

    // Transition to A and "jane"
    world.insertResource(NextState(SimpleState).Pending(SimpleState.A()));
    world.insertResource(NextState(OtherState).Pending(new OtherState('jane', 13)));
    world.runSchedule(StateTransition);

    // Check states - should have different complex state
    expect(world.resource(complexStateType).val).toEqual(
      ComplexComputedState.InAAndStrIsBobOrJane(),
    );

    // Transition to B(false) and "jane"
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(false)));
    world.insertResource(NextState(OtherState).Pending(new OtherState('jane', 13)));
    world.runSchedule(StateTransition);

    // Check states - should have no complex state
    expect(world.containsResource(complexStateType)).toBe(false);
  });

});
