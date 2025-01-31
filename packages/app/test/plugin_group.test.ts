import { derive, typeId, TypeId } from 'rustable';
import { App } from '../src/app';
import { Plugin } from '../src/plugin';
import { NoopPluginGroup, PluginGroupBuilder } from '../src/plugin_group';

// Test plugins
@derive([Plugin])
class PluginA {
  build(_app: App): void {}
  name(): string {
    return this.constructor.name;
  }
}

@derive([Plugin])
class PluginB {
  build(_app: App): void {}
  name(): string {
    return this.constructor.name;
  }
}

@derive([Plugin])
class PluginC {
  build(_app: App): void {}
  name(): string {
    return this.constructor.name;
  }
}

@derive([Plugin])
class PluginWithData {
  constructor(public value: number) {}
  build(_app: App): void {}
  name(): string {
    return this.constructor.name;
  }
}

// Helper function to get plugin from group
function getPlugin<T>(group: PluginGroupBuilder, id: TypeId): T {
  const entry = group.plugins.getUnchecked(id);
  return entry.plugin as T;
}

describe('PluginGroup', () => {
  test('contains and enabled status', () => {
    let group = PluginGroupBuilder.start(NoopPluginGroup).add(new PluginA()).add(new PluginB());

    expect(group.contains(PluginA)).toBe(true);
    expect(group.contains(PluginC)).toBe(false);

    group = group.disable(PluginA);

    expect(group.enabled(PluginB)).toBe(true);
    expect(group.enabled(PluginA)).toBe(false);
  });

  test('basic ordering', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginB())
      .add(new PluginC());

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginB), typeId(PluginC)]);
  });

  test('add before', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginB())
      .addBefore(PluginB, new PluginC());

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginC), typeId(PluginB)]);
  });

  test('try add before', () => {
    let group = PluginGroupBuilder.start(NoopPluginGroup).add(new PluginA());

    const result = group.tryAddBefore(PluginA, new PluginC());
    expect(result.isOk()).toBe(true);
    group = result.unwrap();

    expect(group.order.asSlice()).toEqual([typeId(PluginC), typeId(PluginA)]);

    expect(group.tryAddBefore(PluginA, new PluginC()).isErr()).toBe(true);
  });

  test('add before nonexistent throws', () => {
    expect(() => {
      PluginGroupBuilder.start(NoopPluginGroup)
        .add(new PluginA())
        .addBefore(PluginB, new PluginC());
    }).toThrow('Plugin does not exist in group: PluginB');
  });

  test('add after', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginB())
      .addAfter(PluginA, new PluginC());

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginC), typeId(PluginB)]);
  });

  test('try add after', () => {
    let group = PluginGroupBuilder.start(NoopPluginGroup).add(new PluginA()).add(new PluginB());

    const result = group.tryAddAfter(PluginA, new PluginC());
    expect(result.isOk()).toBe(true);
    group = result.unwrap();

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginC), typeId(PluginB)]);

    expect(group.tryAddAfter(PluginA, new PluginC()).isErr()).toBe(true);
  });

  test('add after nonexistent throws', () => {
    expect(() => {
      PluginGroupBuilder.start(NoopPluginGroup).add(new PluginA()).addAfter(PluginB, new PluginC());
    }).toThrow('Plugin does not exist in group: PluginB');
  });

  test('add overwrite', () => {
    let group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginWithData(0x0f))
      .add(new PluginC());

    const id = typeId(PluginWithData);
    expect(getPlugin<PluginWithData>(group, id).value).toBe(0x0f);

    group = group.add(new PluginWithData(0xa0));

    expect(getPlugin<PluginWithData>(group, id).value).toBe(0xa0);
    expect(group.order.asSlice()).toEqual([
      typeId(PluginA),
      typeId(PluginC),
      typeId(PluginWithData),
    ]);

    const beforeResult = group.tryAddBeforeOverwrite(PluginA, new PluginWithData(0x01));
    expect(beforeResult.isOk()).toBe(true);
    group = beforeResult.unwrap();

    expect(getPlugin<PluginWithData>(group, id).value).toBe(0x01);
    expect(group.order.asSlice()).toEqual([
      typeId(PluginWithData),
      typeId(PluginA),
      typeId(PluginC),
    ]);

    const afterResult = group.tryAddAfterOverwrite(PluginA, new PluginWithData(0xdeadbeef));
    expect(afterResult.isOk()).toBe(true);
    group = afterResult.unwrap();

    expect(getPlugin<PluginWithData>(group, id).value).toBe(0xdeadbeef);
    expect(group.order.asSlice()).toEqual([
      typeId(PluginA),
      typeId(PluginWithData),
      typeId(PluginC),
    ]);
  });

  test('readd', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginB())
      .add(new PluginC())
      .add(new PluginB());

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginC), typeId(PluginB)]);
  });

  test('readd before', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginB())
      .add(new PluginC())
      .addBefore(PluginB, new PluginC());

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginC), typeId(PluginB)]);
  });

  test('readd after', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
      .add(new PluginA())
      .add(new PluginB())
      .add(new PluginC())
      .addAfter(PluginA, new PluginC());

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginC), typeId(PluginB)]);
  });

  test('add basic subgroup', () => {
    const groupA = PluginGroupBuilder.start(NoopPluginGroup).add(new PluginA()).add(new PluginB());

    const groupB = PluginGroupBuilder.start(NoopPluginGroup).addGroup(groupA).add(new PluginC());

    expect(groupB.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginB), typeId(PluginC)]);
  });

  test('add conflicting subgroup', () => {
    const groupA = PluginGroupBuilder.start(NoopPluginGroup).add(new PluginA()).add(new PluginC());

    const groupB = PluginGroupBuilder.start(NoopPluginGroup).add(new PluginB()).add(new PluginC());

    const group = PluginGroupBuilder.start(NoopPluginGroup).addGroup(groupA).addGroup(groupB);

    expect(group.order.asSlice()).toEqual([typeId(PluginA), typeId(PluginB), typeId(PluginC)]);
  });
});
