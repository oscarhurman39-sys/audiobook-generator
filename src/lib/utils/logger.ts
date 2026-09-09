/**
 * Centralized logging utility for the audiobook generator
 * Provides configurable logging with levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerConfig {
  /** Minimum log level to display */
  level: LogLevel
  /** Whether to silence all logs (useful for tests) */
  silent: boolean
}

/** One entry in the in-memory buffer that the Diagnostics screen reads back. */
export interface LogEntry {
  time: string
  level: LogLevel
  text: string
}

/** How many entries the buffer keeps. Enough for a failed generation, small enough to share. */
const MAX_RECENT_LOGS = 300

function renderArgForBuffer(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}`
  if (typeof a === 'object' && a !== null) {
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  }
  return String(a)
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private config: LoggerConfig = {
    level: 'info',
    silent: false,
  }

  /**
   * Recent entries, kept regardless of level or `silent`, so a device with no
   * devtools (a phone) can still hand over what happened.
   */
  private recent: LogEntry[] = []

  constructor() {
    // Detect test environment and silence logs by default
    const isTestEnv =
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
      (globalThis as { __vitest__?: boolean }).__vitest__ === true

    if (isTestEnv) {
      this.config.silent = true
    }
  }

  /**
   * Configure the logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config }
  }

  private record(level: LogLevel, prefix: string, args: unknown[]): void {
    const text = [prefix, ...args.map(renderArgForBuffer)].join(' ')
    this.recent.push({ time: new Date().toISOString(), level, text })
    if (this.recent.length > MAX_RECENT_LOGS) {
      this.recent.splice(0, this.recent.length - MAX_RECENT_LOGS)
    }
  }

  /** A copy of the most recent log entries, oldest first. */
  getRecentLogs(): LogEntry[] {
    return this.recent.map((e) => ({ ...e }))
  }

  clearRecentLogs(): void {
    this.recent = []
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.config.silent) return false
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level]
  }

  private formatMessage(level: LogLevel, prefix: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString()
    const levelStr = level.toUpperCase().padEnd(5)
    const formattedArgs = args
      .map((a) => {
        if (typeof a === 'object' && a !== null) {
          try {
            return JSON.stringify(a, null, 2)
          } catch {
            return String(a)
          }
        }
        return String(a)
      })
      .join(' ')
    return `[${timestamp}] ${levelStr} ${prefix} ${formattedArgs}`
  }

  /**
   * Log a debug message
   */
  debug(prefix: string, ...args: unknown[]): void {
    this.record('debug', prefix, args)
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', prefix, ...args))
    }
  }

  /**
   * Log an info message
   */
  info(prefix: string, ...args: unknown[]): void {
    this.record('info', prefix, args)
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', prefix, ...args))
    }
  }

  /**
   * Log a warning message
   */
  warn(prefix: string, ...args: unknown[]): void {
    this.record('warn', prefix, args)
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', prefix, ...args))
    }
  }

  /**
   * Log an error message
   */
  error(prefix: string, ...args: unknown[]): void {
    this.record('error', prefix, args)
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', prefix, ...args))
    }
  }

  /**
   * Log a simple message (maps to info by default)
   */
  log(prefix: string, ...args: unknown[]): void {
    this.info(prefix, ...args)
  }
}

// Singleton instance
const logger = new Logger()

export default logger
