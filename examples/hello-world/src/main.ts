import { App, Update } from '@sciurus/app';
import { system } from '@sciurus/ecs';

const bar = system([], () => {
  document.getElementById('app')!.innerHTML = 'Hello, Sciurus!';
});
App.new().addSystems(Update, bar).run();
