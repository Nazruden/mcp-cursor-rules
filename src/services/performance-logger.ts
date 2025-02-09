import * as fs from "fs";
import * as path from "path";
import { Metric } from "./monitoring";

/**
 * Log levels for performance logging
 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * Configuration options for the performance logger
 */
export interface LoggerConfig {
  logDir: string;
  minLevel?: LogLevel;
  maxFileSize?: number;
  maxFiles?: number;
}

/**
 * Structure of a log entry
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metric?: Metric;
}

/**
 * Service for logging performance metrics and related information
 */
export class PerformanceLogger {
  private readonly logDir: string;
  private readonly logFile: string;
  private readonly minLevel: LogLevel;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;

  /**
   * Creates a new PerformanceLogger instance
   * @param config Logger configuration
   */
  constructor(config: LoggerConfig) {
    this.logDir = config.logDir;
    this.logFile = path.join(this.logDir, "performance.log");
    this.minLevel = config.minLevel ?? LogLevel.INFO;
    this.maxFileSize = config.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxFiles = config.maxFiles ?? 5;

    this.ensureLogDirectory();
  }

  /**
   * Logs a message with optional metric data
   * @param level Log level
   * @param message Message to log
   * @param metric Optional metric data
   */
  public log(level: LogLevel, message: string, metric?: Metric): void {
    if (this.shouldLog(level)) {
      try {
        this.checkRotation();
        this.writeLog(this.createLogEntry(level, message, metric));
      } catch (error) {
        // Silently handle errors to prevent disrupting the application
        console.error("Error writing to performance log:", error);
      }
    }
  }

  /**
   * Creates a formatted log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    metric?: Metric
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: level.toString(),
      message,
      metric: metric ? this.prepareMetricForSerialization(metric) : undefined,
    };
  }

  /**
   * Prepares a metric for JSON serialization by converting Date objects to ISO strings
   */
  private prepareMetricForSerialization(metric: Metric): Metric {
    return {
      ...metric,
      timestamp:
        metric.timestamp instanceof Date
          ? metric.timestamp.toISOString()
          : metric.timestamp,
    };
  }

  /**
   * Checks if the message should be logged based on minimum log level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  /**
   * Ensures the log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Writes a log entry to the log file
   */
  private writeLog(entry: LogEntry): void {
    const line = JSON.stringify(entry) + "\\n";
    fs.appendFileSync(this.logFile, line);
  }

  /**
   * Checks if log rotation is needed and performs rotation if necessary
   */
  private checkRotation(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      if (stats.size >= this.maxFileSize) {
        this.rotateLog();
      }
    } catch (error) {
      console.error("Error checking log rotation:", error);
    }
  }

  /**
   * Performs log file rotation
   */
  private rotateLog(): void {
    for (let i = this.maxFiles - 1; i >= 0; i--) {
      const source = i === 0 ? this.logFile : `${this.logFile}.${i}`;
      const target = `${this.logFile}.${i + 1}`;

      try {
        if (fs.existsSync(source)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(source);
          } else {
            fs.renameSync(source, target);
          }
        }
      } catch (error) {
        console.error(`Error rotating log file ${source}:`, error);
      }
    }
  }
}
