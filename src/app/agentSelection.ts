export class AgentSelectionController {
  private selectedId: string | null = null
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): string | null => this.selectedId

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  select(id: string | null): void {
    if (id === this.selectedId) return
    this.selectedId = id
    this.listeners.forEach((listener) => listener())
  }
}

export function createAgentSelectionController(): AgentSelectionController {
  return new AgentSelectionController()
}
