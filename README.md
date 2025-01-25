# Sciurus

A lightweight, TypeScript-based implementation of [Bevy](https://bevyengine.org/).

## Packages

### @sciurus/app

Core application framework providing:
- Application lifecycle management
- Plugin system for extensible functionality
- Schedule system with fixed timestep support
- Multiple worlds support
- Resource management

### @sciurus/ecs

High-performance Entity Component System (ECS) inspired by Bevy ECS:
- Archetype-based storage for efficient component access
- Change detection system
- Event system with type-safe dispatch
- Query system with parallel iteration support
- Resource management with change tracking

### @sciurus/utils

Collection of utilities supporting the engine:
- BitSet: Fixed-size bit operations
- Logger: Configurable logging system
- Cell: Generic value containers
- Inheritance: Advanced TypeScript class utilities
- Type validation tools

## Features

- **High Performance**: Archetype-based ECS with efficient component access
- **Plugin System**: Modular architecture for easy extension
- **Parallel Execution**: Systems can run concurrently
- **Type Safety**: Leverages TypeScript's type system
- **Fixed Timestep**: Consistent game loop timing
- **Resource Management**: Global state with change tracking

## Installation

```bash
npm install sciurus
```

## License

MIT
