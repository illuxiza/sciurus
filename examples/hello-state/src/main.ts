import { App, Update } from '@sciurus/app';
import { Res, system } from '@sciurus/ecs';
import { inState, NextState, OnEnter, states, StatesPlugin } from '@sciurus/state';
import { Default, derive, Enum, variant } from 'rustable';

@derive([Default])
@states()
class GameState extends Enum<typeof GameState> {
  @variant
  static Start(): GameState {
    return null!;
  }
  @variant
  static InGame(): GameState {
    return null!;
  }
  @variant
  static End(): GameState {
    return null!;
  }
  static default(): GameState {
    return GameState.Start();
  }
}

const start = system([Res(NextState(GameState))], (nextState) => {
  nextState.to(GameState.InGame());
  console.log('start');
});

const inGame = system([], () => {
  document.getElementById('app')!.innerHTML = 'Hello, Sciurus!';
});

const run = system([], () => {
  console.log('run');
});

const app = App.new()
  .addPlugins(new StatesPlugin())
  .initState(GameState)
  .addSystems(Update, [
    start.runIf(inState(GameState.Start())),
    run.runIf(inState(GameState.InGame())),
  ])
  .addSystems(new OnEnter(GameState.InGame()), inGame);

app.run();
app.run();
app.run();
