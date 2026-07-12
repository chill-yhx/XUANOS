import { apiData } from '../api/apiClient'
import type { SnapshotDto } from '../api/dto'
import { snapshotMapper } from '../mappers/snapshotMapper'
import type { SystemSnapshot } from '../types'

export async function getCurrentSnapshot(): Promise<SystemSnapshot> {
  const dto = await apiData<SnapshotDto>('/api/users/demo-user/snapshot')
  return snapshotMapper(dto)
}
