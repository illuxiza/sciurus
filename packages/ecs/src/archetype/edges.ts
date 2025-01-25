import { Option, Vec } from 'rustable';
import { type BundleId } from '../bundle/types';
import { type RequiredComponentConstructor } from '../component/required_components';
import { type ComponentId } from '../component/types';
import { SparseArray } from '../storage/sparse_set/sparse_array';
import { ArchetypeAfterBundleInsert, type ArchetypeId, type ComponentStatus } from './types';

export class Edges {
  constructor(
    public addBundle: SparseArray<BundleId, ArchetypeAfterBundleInsert> = new SparseArray<
      BundleId,
      ArchetypeAfterBundleInsert
    >(),
    public removeBundle = new SparseArray<BundleId, Option<ArchetypeId>>(),
    public takeBundle = new SparseArray<BundleId, Option<ArchetypeId>>(),
  ) {}
  getArchetypeAfterBundleInsert(bundleId: BundleId): Option<ArchetypeId> {
    return this.getArchetypeAfterBundleInsertInternal(bundleId).map((bundle) => bundle.archetypeId);
  }

  getArchetypeAfterBundleInsertInternal(bundleId: BundleId): Option<ArchetypeAfterBundleInsert> {
    return this.addBundle.get(bundleId);
  }

  cacheArchetypeAfterBundleInsert(
    bundleId: BundleId,
    archetypeId: ArchetypeId,
    bundleStatus: Vec<ComponentStatus>,
    requiredComponents: Vec<RequiredComponentConstructor>,
    added: Vec<ComponentId>,
    existing: Vec<ComponentId>,
  ) {
    this.addBundle.insert(
      bundleId,
      new ArchetypeAfterBundleInsert(
        archetypeId,
        bundleStatus,
        requiredComponents,
        added,
        existing,
      ),
    );
  }

  getArchetypeAfterBundleRemove(bundleId: BundleId): Option<Option<ArchetypeId>> {
    return this.removeBundle.get(bundleId);
  }

  cacheArchetypeAfterBundleRemove(bundleId: BundleId, archetypeId: Option<ArchetypeId>) {
    this.removeBundle.insert(bundleId, archetypeId);
  }

  getArchetypeAfterBundleTake(bundleId: BundleId): Option<Option<ArchetypeId>> {
    return this.takeBundle.get(bundleId);
  }

  cacheArchetypeAfterBundleTake(bundleId: BundleId, archetypeId: Option<ArchetypeId>) {
    this.takeBundle.insert(bundleId, archetypeId);
  }
}
