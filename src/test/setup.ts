/**
 * Test environment setup.
 *
 * Node 22+ exposes `localStorage` / `sessionStorage` globals that stay
 * `undefined` unless the process is started with `--localstorage-file`.
 * Vitest's jsdom environment only copies jsdom properties onto `globalThis`
 * when the key is missing, so those Node stubs win and web storage is
 * undefined for every test.
 *
 * Install a small spec-compliant in-memory `Storage` instead.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    const value = this.store.get(String(key))
    return value === undefined ? null : value
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return index >= 0 && index < keys.length ? keys[index] : null
  }

  removeItem(key: string): void {
    this.store.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value))
  }
}

function installStorage(key: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as Record<string, unknown>)[key]
  if (existing && typeof (existing as Storage).getItem === 'function') return

  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: storage,
  })
}

installStorage('localStorage')
installStorage('sessionStorage')

export {}
