import { None } from 'rustable';
import { Entity } from '../../src/entity/base';
import { Entities } from '../../src/entity/collection';

describe('Entity', () => {
  test('entity bits roundtrip', () => {
    const e = Entity.fromRawAndGeneration(0xdeadbeef, 0x5aadf00d);
    expect(Entity.fromBits(e.toBits())).toEqual(e);
  });

  describe('Entities Collection', () => {
    let entities: Entities;

    beforeEach(() => {
      entities = new Entities();
    });

    test('reserve entity length', () => {
      entities.reserveEntity();
      entities.flush(() => {});
      expect(entities.len()).toBe(1);
    });

    test('get reserved and invalid', () => {
      const e = entities.reserveEntity();
      expect(entities.contains(e)).toBe(true);
      expect(entities.get(e)).toBe(None);

      entities.flush(() => {});
      expect(entities.contains(e)).toBe(true);
      expect(entities.get(e)).toBe(None);
    });

    test('reserve generations', () => {
      const entity = entities.alloc();
      entities.free(entity);
      expect(entities.reserveGenerations(entity.index, 1)).toBe(true);
    });

    test('reserve generations and alloc', () => {
      const GENERATIONS = 10;
      const entity = entities.alloc();
      entities.free(entity);

      expect(entities.reserveGenerations(entity.index, GENERATIONS)).toBe(true);

      const nextEntity = entities.alloc();
      expect(nextEntity.index).toBe(entity.index);
      expect(nextEntity.generation).toBeGreaterThan(entity.generation + GENERATIONS);
    });
  });

  describe('Entity Comparison', () => {
    test('entity comparison', () => {
      const e1 = Entity.fromRawAndGeneration(123, 456);
      const e2 = Entity.fromRawAndGeneration(123, 456);
      const e3 = Entity.fromRawAndGeneration(123, 789);
      const e4 = Entity.fromRawAndGeneration(456, 123);

      expect(e1).toEqual(e2);
      expect(e1).not.toEqual(e3);
      expect(e2).not.toEqual(e3);
      expect(e1).not.toEqual(e4);

      expect(e1.toBits() >= e2.toBits()).toBe(true);
      expect(e1.toBits() <= e2.toBits()).toBe(true);
      expect(e1.toBits() < e2.toBits()).toBe(false);
      expect(e1.toBits() > e2.toBits()).toBe(false);

      expect(
        Entity.fromRawAndGeneration(9, 1).toBits() < Entity.fromRawAndGeneration(1, 9).toBits(),
      ).toBe(true);
      expect(
        Entity.fromRawAndGeneration(1, 9).toBits() > Entity.fromRawAndGeneration(9, 1).toBits(),
      ).toBe(true);
      expect(
        Entity.fromRawAndGeneration(1, 1).toBits() < Entity.fromRawAndGeneration(2, 1).toBits(),
      ).toBe(true);
      expect(
        Entity.fromRawAndGeneration(1, 1).toBits() <= Entity.fromRawAndGeneration(2, 1).toBits(),
      ).toBe(true);
      expect(
        Entity.fromRawAndGeneration(2, 2).toBits() > Entity.fromRawAndGeneration(1, 2).toBits(),
      ).toBe(true);
      expect(
        Entity.fromRawAndGeneration(2, 2).toBits() >= Entity.fromRawAndGeneration(1, 2).toBits(),
      ).toBe(true);
    });
  });
});
