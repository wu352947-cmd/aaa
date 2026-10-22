/** 键鼠与触屏输入汇总到同一份状态 */
export const input = {
  keys: new Set<string>(),
  /** 触屏摇杆：x 右为正，y 前为正，-1..1 */
  stick: { x: 0, y: 0 },
  lookDX: 0,
  lookDY: 0,
  sprintTouch: false,
  interact: false,
}

export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    input.keys.add(e.code)
    if (e.code === 'KeyE') input.interact = true
  }
  const up = (e: KeyboardEvent) => input.keys.delete(e.code)
  const blur = () => input.keys.clear()
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}

export function moveAxes() {
  const k = input.keys
  let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
  let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
  x += input.stick.x
  y += input.stick.y
  const len = Math.hypot(x, y)
  if (len > 1) {
    x /= len
    y /= len
  }
  return { x, y }
}

export const sprintHeld = () => input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || input.sprintTouch
