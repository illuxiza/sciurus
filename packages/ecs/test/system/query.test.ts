import { Default, derive } from 'rustable';
import { World } from '../../../ecs/src';
import { Component } from '../../../ecs/src/component';
import { Entity } from '../../../ecs/src/entity';
import { With } from '../../../ecs/src/query/filter/with';
import { Without } from '../../../ecs/src/query/filter/without';
import { Commands } from '../../../ecs/src/system/commands';
import { Local } from '../../../ecs/src/system/param';
import { Query } from '../../../ecs/src/system/param/query';
import { system } from '../../src/system/function/fn';

it('should run system once', () => {
  @derive([Component, Default])
  class T {
    constructor(public value: number) {}
  }

  @derive(Component)
  class B {
    constructor(public v: number) {}
  }

  let init = false;
  const test = system(
    [Query([T, Entity], With(B)), Query(T, Without(B)), Commands, Local(T)],
    (t1, t2, _c, l): number => {
      if (!init) {
        init = true;
        expect(l.value).toBe(undefined);
      } else {
        expect(l.value).toBe(5);
      }
      l.value = 5;
      const [t, _e] = t1.single();
      expect(t.value).toBe(1);
      const tt = t2.single();
      expect(tt.value).toBe(3);
      return 1;
    },
  ).intoSystem();

  const test2 = system([Query(T), Local(T)], (t, l): number => {
    expect(
      t
        .iter()
        .map((x) => x.value)
        .collect(),
    ).toEqual([3, 1]);
    expect(l.value).toBe(undefined);
    return 1;
  }).intoSystem();

  const world = new World();
  world.spawn(new T(3)).flush();
  world.spawn([new T(1), new B(2)]).flush();
  world.runSystemOnceWith(test, 1).unwrap();
  world.runSystemOnceWith(test, 1).unwrap();
  world.flush();
  world.runSystemOnceWith(test2, 1).unwrap();
});
