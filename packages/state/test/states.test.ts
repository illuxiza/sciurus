import {
  EventRegistry,
  Events,
  Res,
  Resource,
  Schedule,
  Schedules,
  World,
  system,
} from '@sciurus/ecs';
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
  hash,
  stringify,
  variant,
} from 'rustable';
import {
  ComputedStates,
  EnterSchedules,
  ExitSchedules,
  FreelyMutableState,
  NextState,
  OnEnter,
  OnExit,
  OnTransition,
  State,
  StateSet,
  StateTransition,
  StateTransitionEvent,
  SubStates,
  TransitionSchedules,
  setupStateTransitionsInWorld,
} from '../src/state';
import { states } from '../src/state/sub_states';

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

  // Define ComputedStateTransitionCounter resource
  @derive([Resource, Default])
  class ComputedStateTransitionCounter {
    enter: number = 0;
    exit: number = 0;
  }

  // Define SimpleState2 class
  @states()
  class SimpleState2 extends Enum<typeof SimpleState2> {
    @variant
    static A1(): SimpleState2 {
      return null!;
    }

    @variant
    static B2(): SimpleState2 {
      return null!;
    }
  }

  Default.implFor(SimpleState2, {
    static: {
      default(): SimpleState2 {
        return SimpleState2.A1();
      },
    },
  });

  // Define TestNewcomputedState class
  @derive([Eq])
  class TestNewcomputedState extends Enum<typeof TestNewcomputedState> {
    @variant
    static A1(): TestNewcomputedState {
      return null!;
    }

    @variant
    static B2(): TestNewcomputedState {
      return null!;
    }

    @variant
    static B1(): TestNewcomputedState {
      return null!;
    }
  }

  ComputedStates.implFor(TestNewcomputedState, {
    static: {
      sourceStates(): Constructor<any> {
        return Type(Array, [Type(Option, [SimpleState]), Type(Option, [SimpleState2])]);
      },
      compute(sources: [Option<SimpleState>, Option<SimpleState2>]): Option<TestNewcomputedState> {
        const [s1, s2] = sources;

        if (
          s1.isSome() &&
          s2.isSome() &&
          s1.unwrap().eq(SimpleState.A()) &&
          s2.unwrap().eq(SimpleState2.A1())
        ) {
          return Some(TestNewcomputedState.A1());
        } else if (
          s1.isSome() &&
          s2.isSome() &&
          s1.unwrap().eq(SimpleState.B(true)) &&
          s2.unwrap().eq(SimpleState2.B2())
        ) {
          return Some(TestNewcomputedState.B2());
        } else if (s1.isSome() && s1.unwrap().eq(SimpleState.B(true))) {
          return Some(TestNewcomputedState.B1());
        } else {
          return None;
        }
      },
    },
  });

  test('computed state transitions are produced correctly', () => {
    const world = new World();

    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState2]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [TestNewcomputedState]), world);

    // Initialize state
    const simpleStateType = Type(State, [SimpleState]);
    world.initResource(simpleStateType);
    // Initialize states
    const simpleState2Type = Type(State, [SimpleState2]);
    world.initResource(simpleState2Type);
    world.initResource(Schedules);

    setupStateTransitionsInWorld(world);

    const schedules = world.getResource(Schedules).expect("Schedules don't exist in world");
    let applyChanges = schedules
      .get(StateTransition)
      .expect("State Transition Schedule Doesn't Exist");

    // Register state systems
    ComputedStates.staticWrap(TestNewcomputedState).regSystems(applyChanges);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    FreelyMutableState.staticWrap(SimpleState2).regState(applyChanges);

    // Add OnEnter and OnExit schedules for TestNewcomputedState states
    schedules.insert(new Schedule(new OnEnter(TestNewcomputedState.A1())));
    schedules
      .get(new OnEnter(TestNewcomputedState.A1()))
      .unwrap()
      .addSystems(
        system(
          [Res(ComputedStateTransitionCounter)],
          (counter: Res<ComputedStateTransitionCounter>) => {
            counter.get().enter += 1;
          },
        ),
      );

    schedules.insert(new Schedule(new OnExit(TestNewcomputedState.A1())));
    schedules
      .get(new OnExit(TestNewcomputedState.A1()))
      .unwrap()
      .addSystems(
        system(
          [Res(ComputedStateTransitionCounter)],
          (counter: Res<ComputedStateTransitionCounter>) => {
            counter.get().exit += 1;
          },
        ),
      );

    schedules.insert(new Schedule(new OnEnter(TestNewcomputedState.B1())));
    schedules
      .get(new OnEnter(TestNewcomputedState.B1()))
      .unwrap()
      .addSystems(
        system(
          [Res(ComputedStateTransitionCounter)],
          (counter: Res<ComputedStateTransitionCounter>) => {
            counter.get().enter += 1;
          },
        ),
      );

    schedules.insert(new Schedule(new OnExit(TestNewcomputedState.B1())));
    schedules
      .get(new OnExit(TestNewcomputedState.B1()))
      .unwrap()
      .addSystems(
        system(
          [Res(ComputedStateTransitionCounter)],
          (counter: Res<ComputedStateTransitionCounter>) => {
            counter.get().exit += 1;
          },
        ),
      );

    schedules.insert(new Schedule(new OnEnter(TestNewcomputedState.B2())));
    schedules
      .get(new OnEnter(TestNewcomputedState.B2()))
      .unwrap()
      .addSystems(
        system(
          [Res(ComputedStateTransitionCounter)],
          (counter: Res<ComputedStateTransitionCounter>) => {
            counter.get().enter += 1;
          },
        ),
      );

    schedules.insert(new Schedule(new OnExit(TestNewcomputedState.B2())));
    schedules
      .get(new OnExit(TestNewcomputedState.B2()))
      .unwrap()
      .addSystems(
        system(
          [Res(ComputedStateTransitionCounter)],
          (counter: Res<ComputedStateTransitionCounter>) => {
            counter.get().exit += 1;
          },
        ),
      );

    world.initResource(ComputedStateTransitionCounter);

    setupStateTransitionsInWorld(world);
    // Run initial schedule
    world.runSchedule(StateTransition);

    // Check initial states
    const computedStateType = Type(State, [TestNewcomputedState]);

    expect(world.resource(simpleStateType).val).toEqual(SimpleState.A());
    expect(world.resource(simpleState2Type).val).toEqual(SimpleState2.A1());
    expect(world.containsResource(computedStateType)).toBe(false);

    // Transition to B(true) and B2
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.insertResource(NextState(SimpleState2).Pending(SimpleState2.B2()));
    world.runSchedule(StateTransition);

    // Check states
    expect(world.resource(computedStateType).val).toEqual(TestNewcomputedState.B2());
    expect(world.resource(ComputedStateTransitionCounter).enter).toBe(1);
    expect(world.resource(ComputedStateTransitionCounter).exit).toBe(0);

    // Transition to A and A1
    world.insertResource(NextState(SimpleState2).Pending(SimpleState2.A1()));
    world.insertResource(NextState(SimpleState).Pending(SimpleState.A()));
    world.runSchedule(StateTransition);

    // Check states
    expect(world.resource(computedStateType).val).toEqual(TestNewcomputedState.A1());
    expect(world.resource(ComputedStateTransitionCounter).enter).toBe(2);
    expect(world.resource(ComputedStateTransitionCounter).exit).toBe(1);

    // Transition back to B(true) and B2
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.insertResource(NextState(SimpleState2).Pending(SimpleState2.B2()));
    world.runSchedule(StateTransition);

    // Check states
    expect(world.resource(computedStateType).val).toEqual(TestNewcomputedState.B2());
    expect(world.resource(ComputedStateTransitionCounter).enter).toBe(3);
    expect(world.resource(ComputedStateTransitionCounter).exit).toBe(2);

    // Transition to A
    world.insertResource(NextState(SimpleState).Pending(SimpleState.A()));
    world.runSchedule(StateTransition);

    // Check states - should have no computed state
    expect(world.containsResource(computedStateType)).toBe(false);
    expect(world.resource(ComputedStateTransitionCounter).enter).toBe(3);
    expect(world.resource(ComputedStateTransitionCounter).exit).toBe(3);
  });

  // Define TransitionCounter resource
  @derive([Resource, Default])
  class TransitionCounter {
    exit: number = 0;
    transition: number = 0;
    enter: number = 0;
  }

  test('same state transition should emit event and not run schedules', () => {
    const world = new World();
    setupStateTransitionsInWorld(world);
    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);

    // Initialize state
    world.initResource(Type(State, [SimpleState]));
    // Initialize counter
    world.initResource(TransitionCounter);

    const schedules = world.resource(Schedules);
    const applyChanges = schedules.get(StateTransition).unwrap();
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);

    // Add OnEnter, OnExit, and OnTransition schedules
    const onExitA = new Schedule(new OnExit(SimpleState.A()));
    onExitA.addSystems(
      system([Res(TransitionCounter)], (counter: Res<TransitionCounter>) => {
        counter.get().exit += 1;
      }),
    );
    schedules.insert(onExitA);

    const onTransitionAA = new Schedule(new OnTransition(SimpleState.A(), SimpleState.A()));
    onTransitionAA.addSystems(
      system([Res(TransitionCounter)], (counter: Res<TransitionCounter>) => {
        counter.get().transition += 1;
      }),
    );
    schedules.insert(onTransitionAA);

    const onEnterA = new Schedule(new OnEnter(SimpleState.A()));
    onEnterA.addSystems(
      system([Res(TransitionCounter)], (counter: Res<TransitionCounter>) => {
        counter.get().enter += 1;
      }),
    );
    schedules.insert(onEnterA);
    world.insertResource(new TransitionCounter());

    // Run initial schedule
    world.runSchedule(StateTransition);

    // Check initial state
    const simpleStateType = Type(State, [SimpleState]);
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.A());

    const eventsType = Type(Events, [Type(StateTransitionEvent, [SimpleState])]);
    expect(world.resource(eventsType).isEmpty()).toBe(true);

    world.insertResource(new TransitionCounter());
    // Transition to same state
    world.insertResource(NextState(SimpleState).Pending(SimpleState.A()));
    world.runSchedule(StateTransition);

    // Check state and events
    expect(world.resource(simpleStateType).val).toEqual(SimpleState.A());

    const counter = world.resource(TransitionCounter);
    expect(counter.exit).toBe(0);
    expect(counter.transition).toBe(1); // Same state transitions are allowed
    expect(counter.enter).toBe(0);

    expect(world.resource(eventsType).len()).toBe(1);
  });

  test('same state transition should propagate to sub state', () => {
    const world = new World();

    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SubState]), world);

    const simpleStateType = Type(State, [SimpleState]);
    const subStateType = Type(State, [SubState]);

    // Initialize state
    world.insertResource(new simpleStateType(SimpleState.B(true)));
    world.initResource(subStateType);

    // Initialize NextState resource
    world.initResource(Type(NextState, [SimpleState]));

    // Create schedule
    const schedules = new Schedules();
    const applyChanges = new Schedule(StateTransition);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    SubStates.staticWrap(SubState).regSubSystems(applyChanges);
    schedules.insert(applyChanges);

    world.insertResource(schedules);
    setupStateTransitionsInWorld(world);

    // Transition to same state
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.runSchedule(StateTransition);

    // Check events
    const simpleEventsType = Type(Events, [Type(StateTransitionEvent, [SimpleState])]);
    const subEventsType = Type(Events, [Type(StateTransitionEvent, [SubState])]);

    expect(world.resource(simpleEventsType).len()).toBe(1);
    expect(world.resource(subEventsType).len()).toBe(1);
  });

  test('same state transition should propagate to computed state', () => {
    const world = new World();

    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [TestComputedState]), world);

    const simpleStateType = Type(State, [SimpleState]);
    const computedStateType = Type(State, [TestComputedState]);

    // Initialize state
    world.insertResource(new simpleStateType(SimpleState.B(true)));
    world.insertResource(new computedStateType(TestComputedState.BisTrue()));

    // Create schedule
    const schedules = new Schedules();
    const applyChanges = new Schedule(StateTransition);
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    ComputedStates.staticWrap(TestComputedState).regSystems(applyChanges);
    schedules.insert(applyChanges);

    world.insertResource(schedules);
    setupStateTransitionsInWorld(world);

    // Run initial schedule
    world.runSchedule(StateTransition);

    // Transition to same state
    world.insertResource(NextState(SimpleState).Pending(SimpleState.B(true)));
    world.runSchedule(StateTransition);

    // Check events
    const simpleEventsType = Type(Events, [Type(StateTransitionEvent, [SimpleState])]);
    const computedEventsType = Type(Events, [Type(StateTransitionEvent, [TestComputedState])]);

    expect(world.resource(simpleEventsType).len()).toBe(1);
    expect(world.resource(computedEventsType).len()).toBe(1);
  });

  // Define TransitionTracker resource
  @derive([Resource, Default])
  class TransitionTracker {
    transitions: string[] = [];
  }

  // Define TransitionTestingComputedState class
  @derive([Eq])
  class TransitionTestingComputedState extends Enum<typeof TransitionTestingComputedState> {
    @variant
    static IsA(): TransitionTestingComputedState {
      return null!;
    }

    @variant
    static IsBAndEven(): TransitionTestingComputedState {
      return null!;
    }

    @variant
    static IsBAndOdd(): TransitionTestingComputedState {
      return null!;
    }
  }

  ComputedStates.implFor(TransitionTestingComputedState, {
    static: {
      sourceStates(): Constructor<any> {
        return Type(Array, [Type(Option, [SimpleState]), Type(Option, [SubState])]);
      },
      compute(
        sources: [Option<SimpleState>, Option<SubState>],
      ): Option<TransitionTestingComputedState> {
        const [simple, sub] = sources;

        if (simple.isSome() && simple.unwrap().eq(SimpleState.A())) {
          return Some(TransitionTestingComputedState.IsA());
        } else if (sub.isSome() && sub.unwrap().eq(SubState.One())) {
          return Some(TransitionTestingComputedState.IsBAndOdd());
        } else if (sub.isSome() && sub.unwrap().eq(SubState.Two())) {
          return Some(TransitionTestingComputedState.IsBAndEven());
        } else {
          return None;
        }
      },
    },
  });

  test('check transition orders', () => {
    const world = new World();
    setupStateTransitionsInWorld(world);
    // Register events
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SimpleState]), world);
    EventRegistry.registerEvent(Type(StateTransitionEvent, [SubState]), world);
    EventRegistry.registerEvent(
      Type(StateTransitionEvent, [TransitionTestingComputedState]),
      world,
    );

    const simpleStateType = Type(State, [SimpleState]);
    const subStateType = Type(State, [SubState]);
    const computedStateType = Type(State, [TransitionTestingComputedState]);

    // Initialize states
    world.insertResource(new simpleStateType(SimpleState.B(true)));
    world.initResource(subStateType);
    world.insertResource(new computedStateType(TransitionTestingComputedState.IsA()));

    // Create schedule
    const schedules = world.removeResource(Schedules).unwrap();
    const applyChanges = schedules.get(StateTransition).unwrap();
    FreelyMutableState.staticWrap(SimpleState).regState(applyChanges);
    SubStates.staticWrap(SubState).regSubSystems(applyChanges);
    ComputedStates.staticWrap(TransitionTestingComputedState).regSystems(applyChanges);

    world.initResource(TransitionTracker);
    // Helper function to register transition
    const registerTransition = (str: string) => {
      return system([Res(TransitionTracker)], (tracker: Res<TransitionTracker>) => {
        tracker.get().transitions.push(str);
      });
    };

    // Add systems to track transition order
    schedules.addSystems(
      StateTransition,
      registerTransition('simple exit').inSet(new ExitSchedules(SimpleState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('simple transition').inSet(new TransitionSchedules(SimpleState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('simple enter').inSet(new EnterSchedules(SimpleState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('sub exit').inSet(new ExitSchedules(SubState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('sub transition').inSet(new TransitionSchedules(SubState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('sub enter').inSet(new EnterSchedules(SubState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('computed exit').inSet(new ExitSchedules(TransitionTestingComputedState)),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('computed transition').inSet(
        new TransitionSchedules(TransitionTestingComputedState),
      ),
    );

    schedules.addSystems(
      StateTransition,
      registerTransition('computed enter').inSet(
        new EnterSchedules(TransitionTestingComputedState),
      ),
    );

    world.insertResource(schedules);
    // Run schedule
    world.runSchedule(StateTransition);

    // Check transition order
    const transitions = world.resource(TransitionTracker).transitions;

    expect(transitions.length).toBe(9);
    expect(transitions[0]).toBe('computed exit');
    expect(transitions[1]).toBe('sub exit');
    expect(transitions[2]).toBe('simple exit');
    // Transition order is arbitrary and doesn't need testing
    expect(transitions[6]).toBe('simple enter');
    expect(transitions[7]).toBe('sub enter');
    expect(transitions[8]).toBe('computed enter');
  });
});
