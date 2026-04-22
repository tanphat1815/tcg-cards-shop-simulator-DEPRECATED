// StateMachine.ts — Base class FSM, mọi AI đều kế thừa từ đây
// Pattern: State Pattern với onEnter/onUpdate/onExit bắt buộc

export interface IState<TOwner> {
  name: string
  onEnter(owner: TOwner): void
  onUpdate(owner: TOwner, time: number, delta: number): void
  onExit(owner: TOwner): void
}

export class StateMachine<TOwner> {
  private states: Map<string, IState<TOwner>> = new Map()
  private currentState: IState<TOwner> | null = null
  private owner: TOwner

  constructor(owner: TOwner) {
    this.owner = owner
  }

  // Đăng ký một state vào FSM
  addState(state: IState<TOwner>) {
    this.states.set(state.name, state)
  }

  // Chuyển trạng thái — gọi onExit cũ, onEnter mới
  transition(stateName: string) {
    const nextState = this.states.get(stateName)
    if (!nextState) {
      console.warn(`[FSM] State "${stateName}" không tồn tại`)
      return
    }
    // Nếu đang ở cùng state thì không làm gì
    if (this.currentState?.name === stateName) return

    this.currentState?.onExit(this.owner)
    this.currentState = nextState
    this.currentState.onEnter(this.owner)
  }

  // Gọi mỗi frame từ update()
  update(time: number, delta: number) {
    this.currentState?.onUpdate(this.owner, time, delta)
  }

  get current(): string {
    return this.currentState?.name ?? 'NONE'
  }
}
