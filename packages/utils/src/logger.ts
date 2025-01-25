/* eslint-disable no-undef, no-console */
/**
 * Log levels enum
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log output interface
 */
export interface LogOutput {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Console implementation of LogOutput
 */
export class ConsoleOutput implements LogOutput {
  private colors: boolean;

  constructor(useColors: boolean = true) {
    this.colors = useColors;
  }

  private colorize(message: string, color: string): string {
    return this.colors ? `${color}${message}${COLORS.reset}` : message;
  }

  debug(message: string): void {
    console.log(this.colorize(message, COLORS.debug));
  }

  info(message: string): void {
    console.log(this.colorize(message, COLORS.info));
  }

  warn(message: string): void {
    console.warn(this.colorize(message, COLORS.warn));
  }

  error(message: string): void {
    console.error(this.colorize(message, COLORS.error));
  }
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  useTimestamp?: boolean;
  output?: LogOutput;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  prefix: '',
  useTimestamp: true,
  output: new ConsoleOutput(),
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  reset: '\x1b[0m',
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};

/**
 * Logger class for handling application logging
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Format message with timestamp and prefix
   */
  private formatMessage(level: string, message: any): string {
    const parts: string[] = [];

    if (this.config.useTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);
    parts.push(typeof message === 'string' ? message : JSON.stringify(message));

    return parts.join(' ');
  }

  /**
   * Log a debug message
   */
  debug(message: any): void {
    if (this.config.level <= LogLevel.DEBUG) {
      const formattedMessage = this.formatMessage('debug', message);
      this.config.output?.debug(formattedMessage);
    }
  }

  /**
   * Log an info message
   */
  info(message: any): void {
    if (this.config.level <= LogLevel.INFO) {
      const formattedMessage = this.formatMessage('info', message);
      this.config.output?.info(formattedMessage);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: any): void {
    if (this.config.level <= LogLevel.WARN) {
      const formattedMessage = this.formatMessage('warn', message);
      this.config.output?.warn(formattedMessage);
    }
  }

  /**
   * Log an error message
   */
  error(message: any): void {
    if (this.config.level <= LogLevel.ERROR) {
      const formattedMessage = this.formatMessage('error', message);
      this.config.output?.error(formattedMessage);
    }
  }

  /**
   * Create a new logger instance with a specific prefix
   */
  createChild(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }

  /**
   * Update logger configuration
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set logger output
   */
  setOutput(output: LogOutput): void {
    this.config.output = output;
  }
}

// Create default logger instance
export const logger = new Logger();
