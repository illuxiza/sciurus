# @sciurus/app

Core application framework for the Sciurus Engine, providing application lifecycle management and plugin system.

## Architecture

The app package implements a modular application framework with three main components:

### App System

The core application system manages the game engine lifecycle:

- **App**: Main application container that coordinates the entire system
- **SubApp**: Independent sub-applications with their own worlds and plugins
- **World Integration**: Seamless integration with the ECS system

### Plugin System

Extensible plugin architecture for modular functionality:

- **Plugin**: Base interface for all plugins
- **PluginGroup**: Organizes multiple plugins into cohesive units
- **Plugin Builder**: Fluent API for configuring plugin groups and dependencies

### Schedule System

Manages the application update loop with ordered execution phases:

- **Main Schedule**: Core update loop with fixed timestep support
- **Schedule Phases**:
  - PreStartup → Startup → PostStartup (initialization)
  - First → PreUpdate → StateTransition → Update → PostUpdate → Last (main loop)
- **Fixed Update**: Time-based update system for consistent simulation

## Core Features

- **Game Engine Foundation**: Built for game development with ECS architecture
- **Plugin System**: Modular design for extensible functionality
- **Fixed Timestep**: Consistent update loop for game logic
- **Multiple Worlds**: Support for multiple independent ECS worlds
- **Resource Management**: Global state and resource handling

## License

MIT
