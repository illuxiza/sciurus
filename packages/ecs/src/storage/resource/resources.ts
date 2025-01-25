import { Option, Ptr } from 'rustable';
import { ArchetypeComponentId } from '../../archetype/types';
import { Tick } from '../../change_detection/tick';
import { Components } from '../../component/collection';
import { ComponentId } from '../../component/types';
import { BlobArray } from '../data_array';
import { SparseSet } from '../sparse_set';
import { ResourceData } from './data';

export class Resources {
  private resources: SparseSet<ComponentId, ResourceData> = new SparseSet<
    ComponentId,
    ResourceData
  >();

  len(): number {
    return this.resources.len();
  }

  iter(): Iterable<[ComponentId, ResourceData]> {
    return this.resources.iter();
  }

  isEmpty(): boolean {
    return this.resources.isEmpty();
  }

  get(componentId: ComponentId): Option<ResourceData> {
    return this.resources.get(componentId);
  }

  clear(): void {
    this.resources.clear();
  }

  getMut(componentId: ComponentId): Option<Ptr<ResourceData>> {
    return this.resources.getMut(componentId);
  }

  initializeWith(
    componentId: ComponentId,
    components: Components,
    f: () => ArchetypeComponentId,
    caller?: string,
  ): ResourceData {
    return this.resources.getOrInsertWith(componentId, () => {
      const componentInfo = components.getInfo(componentId).unwrap();
      const data = new BlobArray(componentInfo.drop);
      return new ResourceData(data, new Tick(0), new Tick(0), componentInfo.name, f(), caller);
    });
  }

  checkChangeTicks(changeTick: Tick): void {
    for (const info of this.resources.values()) {
      info.checkChangeTicks(changeTick);
    }
  }
}
