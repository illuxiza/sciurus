# @sciurus/state

Finite state machines for the Sciurus Entity Component System framework.

## Overview

`@sciurus/state` provides a robust state management system for Sciurus applications. It enables you to define, transition between, and react to state changes in a type-safe and efficient manner. The package implements state-scoped entities and events, ensuring proper cleanup during state transitions.

## Architecture

The state package implements a comprehensive state management system with several key components:

### State System

The core state management system handles state transitions and lifecycle:

- **State**: Resource containing the current state value
- **NextState**: Resource for requesting state transitions
- **StateTransitionEvent**: Event triggered during state transitions
- **StatesPlugin**: Plugin that sets up the state transition infrastructure

### State Types

Different types of states for various use cases:

- **FreelyMutableState**: Basic states that can be changed directly
- **ComputedStates**: States that are computed based on other states
- **SubStates**: States with parent-child relationships

### State-Scoped Systems

Systems for managing entities and events tied to specific states:

- **State-Scoped Entities**: Entities that are automatically cleaned up when exiting a state
- **State-Scoped Events**: Events that are automatically cleared when exiting a state

### Schedule System

Schedules for controlling when state-related code executes:

- **StateTransition**: Main schedule for handling state transitions
- **OnEnter/OnExit**: Schedules that run when entering or exiting specific states
- **StateTransitionSteps**: Ordered steps for the state transition process

## Core Features

- **Type-Safe State Management**: Define states with full type safety using enums
- **Declarative Transitions**: Simple API for state transitions with automatic event dispatching
- **Automatic Cleanup**: State-scoped entities and events are automatically cleaned up during transitions
- **Hierarchical States**: Support for computed states and sub-states for complex state machines
- **Transition Hooks**: Run code when entering or exiting specific states
- **App Integration**: Seamless integration with the Sciurus App system

## License

MIT
