import { notifyChange } from './subscriptions'

export function emitDBChange(
    projectId: string,
    table: string
) {
    notifyChange({ projectId, table })
}
