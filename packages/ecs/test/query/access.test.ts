import { FixedBitSet } from '@sciurus/utils';
import { Vec } from 'rustable';
import { Access, AccessConflicts, AccessFilters, FilteredAccess } from '../../src/query/access';

function createBitSetFromIndices(indices: number[]): FixedBitSet {
  const maxIndex = Math.max(...indices, 0);
  const bitSet = new FixedBitSet();
  for (const index of indices) {
    bitSet.growAndInsert(index);
  }
  // Ensure the bitset has the exact size needed
  if (bitSet.len() > maxIndex + 1) {
    const temp = new FixedBitSet();
    temp.grow(maxIndex + 1);
    for (const index of indices) {
      temp.growAndInsert(index);
    }
    return temp;
  }
  return bitSet;
}

function createSampleAccess(): Access {
  const access = new Access();

  access.addComponentRead(1);
  access.addComponentRead(2);
  access.addComponentWrite(3);
  access.addArchetypal(5);
  access.readAll();

  return access;
}

function createSampleFilteredAccess(): FilteredAccess {
  const filteredAccess = new FilteredAccess();

  filteredAccess.addComponentWrite(1);
  filteredAccess.addComponentRead(2);
  filteredAccess.addRequired(3);
  filteredAccess.andWith(4);

  return filteredAccess;
}

function createSampleAccessFilters(): AccessFilters {
  const accessFilters = new AccessFilters();

  accessFilters.with.growAndInsert(3);
  accessFilters.without.growAndInsert(5);

  return accessFilters;
}

describe('Access', () => {
  test('access_clone', () => {
    const original = createSampleAccess();
    const cloned = original.clone();

    expect(cloned.hasComponentRead(1)).toBe(original.hasComponentRead(1));
    expect(cloned.hasComponentRead(2)).toBe(original.hasComponentRead(2));
    expect(cloned.hasComponentWrite(3)).toBe(original.hasComponentWrite(3));
    expect(cloned.hasArchetypal(5)).toBe(original.hasArchetypal(5));
    expect(cloned.hasReadAll()).toBe(original.hasReadAll());
  });

  test('filtered_access_clone', () => {
    const original = createSampleFilteredAccess();
    const cloned = original.clone();

    expect(cloned.hasComponentWrite(1)).toBe(original.hasComponentWrite(1));
    expect(cloned.hasComponentRead(2)).toBe(original.hasComponentRead(2));
    expect(cloned.required.contains(3)).toBe(original.required.contains(3));
    expect(cloned.filterSets.getUnchecked(0).with.contains(4)).toBe(original.filterSets.getUnchecked(0).with.contains(4));
  });

  test('access_filters_clone', () => {
    const original = createSampleAccessFilters();
    const cloned = original.clone();

    expect(cloned.with.contains(3)).toBe(original.with.contains(3));
    expect(cloned.without.contains(5)).toBe(original.without.contains(5));
  });

  test('filtered_access_clone_from', () => {
    const original = createSampleFilteredAccess();
    const cloned = new FilteredAccess();
    cloned.addComponentWrite(1);
    cloned.addComponentRead(2);
    Object.assign(cloned, original);

    expect(cloned.hasComponentWrite(1)).toBe(original.hasComponentWrite(1));
    expect(cloned.hasComponentRead(2)).toBe(original.hasComponentRead(2));
    expect(cloned.required.contains(3)).toBe(original.required.contains(3));
    expect(cloned.filterSets.getUnchecked(0).with.contains(4)).toBe(original.filterSets.getUnchecked(0).with.contains(4));
  });

  test('read_all_access_conflicts', () => {
    // read_all / single write
    let accessA = new Access();
    accessA.addComponentWrite(0);

    let accessB = new Access();
    accessB.readAllComponents();

    expect(accessB.isCompatible(accessA)).toBe(false);

    // read_all / read_all
    accessA = new Access();
    accessA.readAllComponents();

    accessB = new Access();
    accessB.readAllComponents();

    expect(accessB.isCompatible(accessA)).toBe(true);
  });

  test('access_get_conflicts', () => {
    const accessA = new Access();
    accessA.addComponentRead(0);
    accessA.addComponentRead(1);

    const accessB = new Access();
    accessB.addComponentRead(0);
    accessB.addComponentWrite(1);

    expect(accessA.getConflicts(accessB)).toEqual(
      AccessConflicts.Individual(createBitSetFromIndices([1])),
    );

    const accessC = new Access();
    accessC.addComponentWrite(0);
    accessC.addComponentWrite(1);

    expect(accessA.getConflicts(accessC)).toEqual(
      AccessConflicts.Individual(createBitSetFromIndices([0, 1])),
    );
    expect(accessB.getConflicts(accessC)).toEqual(
      AccessConflicts.Individual(createBitSetFromIndices([0, 1])),
    );

    const accessD = new Access();
    accessD.addComponentRead(0);

    expect(accessD.clone().getConflicts(accessA)).toEqual(AccessConflicts.empty());
    expect(accessD.clone().getConflicts(accessB)).toEqual(AccessConflicts.empty());
    expect(accessD.clone().getConflicts(accessC)).toEqual(
      AccessConflicts.Individual(createBitSetFromIndices([0])),
    );
  });

  test('filtered_combined_access', () => {
    const accessA = new FilteredAccess();
    accessA.addResourceRead(1);

    const filterB = new FilteredAccess();
    filterB.addResourceWrite(1);

    const conflicts = accessA.getConflicts(filterB);
    expect(conflicts).toEqual(AccessConflicts.Individual(createBitSetFromIndices([1])));
  });

  test('filtered_access_extend', () => {
    const accessA = createSampleFilteredAccess();
    const accessB = new FilteredAccess();
    accessB.addComponentRead(0);
    accessB.addComponentWrite(3);
    accessB.andWithout(4);

    accessA.extend(accessB);

    const expected = new FilteredAccess();
    expected.addComponentWrite(1);
    expected.addComponentRead(2);
    expected.addRequired(3);
    expected.andWith(4);
    expected.addComponentRead(0);
    expected.addComponentWrite(3);
    expected.andWithout(4);

    expect(accessA.isCompatible(expected)).toBe(true);
    expect(expected.isCompatible(accessA)).toBe(true);
  });

  test('filtered_access_extend_or', () => {
    const accessA = new FilteredAccess();
    // Exclusive access to `(&mut A, &mut B)`.
    accessA.addComponentWrite(0);
    accessA.addComponentWrite(1);

    // Filter by `With<C>`.
    const accessB = new FilteredAccess();
    accessB.andWith(2);

    // Filter by `(With<D>, Without<E>)`.
    const accessC = new FilteredAccess();
    accessC.andWith(3);
    accessC.andWithout(4);

    // Turns `accessB` into `Or<(With<C>, (With<D>, Without<D>))>`.
    accessB.appendOr(accessC);
    // Applies the filters to the initial query, which corresponds to the FilteredAccess'
    // representation of `Query<(&mut A, &mut B), Or<(With<C>, (With<D>, Without<E>))>>`.
    accessA.extend(accessB);

    // Construct the expected FilteredAccess struct.
    // The intention here is to test that exclusive access implied by `add_write`
    // forms correct normalized access structs when extended with `Or` filters.
    const expected = new FilteredAccess();
    expected.addComponentWrite(0);
    expected.addComponentWrite(1);
    // The resulted access is expected to represent `Or<((With<A>, With<B>, With<C>), (With<A>, With<B>, With<D>, Without<E>))>`.
    expected.filterSets = Vec.from([
      (() => {
        const filter = new AccessFilters();
        filter.with = createBitSetFromIndices([0, 1, 2]);
        return filter;
      })(),
      (() => {
        const filter = new AccessFilters();
        filter.with = createBitSetFromIndices([0, 1, 3]);
        filter.without = createBitSetFromIndices([4]);
        return filter;
      })(),
    ]);

    // Compare the filter sets individually to avoid size mismatches
    expect(accessA.filterSets.len()).toBe(expected.filterSets.len());
    for (let i = 0; i < accessA.filterSets.len(); i++) {
      const actualFilter = accessA.filterSets.getUnchecked(i);
      const expectedFilter = expected.filterSets.getUnchecked(i);

      // Compare with bits
      for (
        let j = 0;
        j <= Math.max(...[...actualFilter.with.ones(), ...expectedFilter.with.ones()]);
        j++
      ) {
        expect(actualFilter.with.contains(j)).toBe(expectedFilter.with.contains(j));
      }

      // Compare without bits
      for (
        let j = 0;
        j <= Math.max(...[...actualFilter.without.ones(), ...expectedFilter.without.ones()]);
        j++
      ) {
        expect(actualFilter.without.contains(j)).toBe(expectedFilter.without.contains(j));
      }
    }
  });

  test('access_filters_is_ruled_out_by', () => {
    const filterA = createSampleAccessFilters();
    const filterB = new AccessFilters();
    filterB.without = createBitSetFromIndices([3]);
    filterB.with = createBitSetFromIndices([5]);

    expect(filterA.isRuledOutBy(filterB)).toBe(true);
    expect(filterB.isRuledOutBy(filterA)).toBe(true);

    const filterC = new AccessFilters();
    filterC.with = createBitSetFromIndices([1]);

    expect(filterA.isRuledOutBy(filterC)).toBe(false);
    expect(filterC.isRuledOutBy(filterA)).toBe(false);

    const filterD = new AccessFilters();
    filterD.without = createBitSetFromIndices([1]);

    expect(filterB.isRuledOutBy(filterD)).toBe(false);
    expect(filterD.isRuledOutBy(filterB)).toBe(false);
  });
});
