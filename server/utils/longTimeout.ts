// @types/node types clearTimeout(Timeout | string | number | undefined), but the built-in also ignores null and clear() runs with timer still null when set() was never called. Widens the type for this file only; emits no code.
declare function clearTimeout(timeout: ReturnType<typeof setTimeout> | null): void

/**
 * Handle timeouts greater than 32-bit signed integer
 */
class LongTimeout {
  declare timeout: number
  declare timer: ReturnType<typeof setTimeout> | null

  constructor() {
    this.timeout = 0
    this.timer = null
  }

  clear(): void {
    clearTimeout(this.timer)
  }

  /**
   *
   * @param {Function} fn
   * @param {number} timeout
   */
  set(fn: () => void, timeout: number): void {
    const maxValue = 2147483647

    const handleTimeout = () => {
      if (this.timeout > 0) {
        let delay = Math.min(this.timeout, maxValue)
        this.timeout = this.timeout - delay
        this.timer = setTimeout(handleTimeout, delay)
        return
      }
      fn()
    }

    this.timeout = timeout
    handleTimeout()
  }
}
export = LongTimeout
