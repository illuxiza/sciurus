# @sciurus/ecs

A high-performance Entity Component System (ECS) for TypeScript, inspired by Bevy ECS.

## Overview

@sciurus/ecs is an archetype-based ECS implementation that follows the design principles of Rust's Bevy ECS. It provides a robust foundation for building complex, data-driven applications with excellent performance characteristics.

## Core Concepts

### World

The World is the central container that manages all ECS state:
- Entities and their components
- Resources (global state)
- Systems and their schedules
- Event dispatch and handling

### Components

Components are pure data containers that can be attached to entities. The system uses archetype-based storage for efficient component access and iteration.

### Systems

Systems are functions that operate on entities, components, and resources. They can:
- Query entities with specific component combinations
- Access and modify resources
- Handle events
- Execute in a defined order through the schedule system

### Queries

Efficient filters for accessing entities with specific component combinations. Queries support:
- Change detection
- Component filtering (With, Without, Added, Changed)
- Parallel iteration

### Resources

Global state that can be accessed by systems. Features include:
- Type-safe access
- Change detection
- Initialization on demand

## Features

- **High Performance**: Archetype-based storage for efficient component access
- **Change Detection**: Track component and resource modifications
- **Bundle System**: Group related components together
- **Event System**: Type-safe event dispatch and handling
- **Parallel Execution**: Systems can run concurrently when possible
- **Schedule System**: Fine-grained control over system execution order
- **Type Safety**: Leverages TypeScript's type system for compile-time safety

## License

MIT
