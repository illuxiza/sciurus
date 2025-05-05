import { Schedule, system } from '@sciurus/ecs';
import { Default, derive, Enum, variant } from 'rustable';
import { inState, stateChanged, stateExists } from '../src/condition';
import { states } from '../src/state/sub_states';

// Define a simple test state for our conditions
@states()
@derive([Default])
class TestState extends Enum<typeof TestState> {
  @variant
  static A(): TestState {
    return null!;
  }

  @variant
  static B(): TestState {
    return null!;
  }

  static default(): TestState {
    return TestState.A();
  }
}

describe('State condition tests', () => {
  // Simple test system that does nothing
  const testSystem = system([], () => {});

  test('distributive_run_if compiles with the common conditions', () => {
    // This test only verifies that the code compiles correctly
    // It doesn't actually run the systems or verify their behavior
    const schedule = new Schedule();

    schedule.addSystems(
      [testSystem, testSystem]
        .distributiveRunIf(stateExists(TestState))
        .distributiveRunIf(inState(TestState.A()).or(inState(TestState.B())))
        .distributiveRunIf(stateChanged(TestState)),
    );

    // If we got here without compilation errors, the test passes
    expect(true).toBe(true);
  });
});
