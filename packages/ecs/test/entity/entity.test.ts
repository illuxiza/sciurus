import { None } from 'rustable';
import { Entity } from '../../src/entity/base';
import { Entities } from '../../src/entity/collection';

describe('Entity', () => {
  test('entity bits roundtrip', () => {
    const e = Entity.fromRawAndGen(0xdeadbeef, 0x5aadf00d);
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
      expect(entities.reserveGenerations(entity.idx, 1)).toBe(true);
    });

    test('reserve generations and alloc', () => {
      const GENERATIONS = 10;
      const entity = entities.alloc();
      entities.free(entity);

      expect(entities.reserveGenerations(entity.idx, GENERATIONS)).toBe(true);

      const nextEntity = entities.alloc();
      expect(nextEntity.idx).toBe(entity.idx);
      expect(nextEntity.gen).toBeGreaterThan(entity.gen + GENERATIONS);
    });
  });

  describe('Entity Comparison', () => {
    test('entity comparison', () => {
      const e1 = Entity.fromRawAndGen(123, 456);
      const e2 = Entity.fromRawAndGen(123, 456);
      const e3 = Entity.fromRawAndGen(123, 789);
      const e4 = Entity.fromRawAndGen(456, 123);

      expect(e1).toEqual(e2);
      expect(e1).not.toEqual(e3);
      expect(e2).not.toEqual(e3);
      expect(e1).not.toEqual(e4);

      expect(e1.toBits() >= e2.toBits()).toBe(true);
      expect(e1.toBits() <= e2.toBits()).toBe(true);
      expect(e1.toBits() < e2.toBits()).toBe(false);
      expect(e1.toBits() > e2.toBits()).toBe(false);

      expect(Entity.fromRawAndGen(9, 1).toBits() < Entity.fromRawAndGen(1, 9).toBits()).toBe(true);
      expect(Entity.fromRawAndGen(1, 9).toBits() > Entity.fromRawAndGen(9, 1).toBits()).toBe(true);
      expect(Entity.fromRawAndGen(1, 1).toBits() < Entity.fromRawAndGen(2, 1).toBits()).toBe(true);
      expect(Entity.fromRawAndGen(1, 1).toBits() <= Entity.fromRawAndGen(2, 1).toBits()).toBe(true);
      expect(Entity.fromRawAndGen(2, 2).toBits() > Entity.fromRawAndGen(1, 2).toBits()).toBe(true);
      expect(Entity.fromRawAndGen(2, 2).toBits() >= Entity.fromRawAndGen(1, 2).toBits()).toBe(true);
    });
  });
});
