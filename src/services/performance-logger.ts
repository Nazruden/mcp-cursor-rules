import * as fs from "fs";
import * as path from "path";
import { Metric } from "./monitoring-service";

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
  maxFileSize?: number; // in bytes
  maxFiles?: number;
}

/**
 * Service for logging performance metrics and related information
 */
export class PerformanceLogger {
  private readonly logDir: string;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;
  private currentLogFile: string;
  private currentFileSize: number;

  /**
   * Creates a new PerformanceLogger instance
   * @param config Logger configuration
   */
  constructor(config: LoggerConfig) {
    this.logDir = config.logDir;
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.maxFiles = config.maxFiles || 5;
    this.currentLogFile = path.join(this.logDir, "performance.log");
    this.currentFileSize = 0;

    this.initializeLogger();
  }

  private initializeLogger(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    if (fs.existsSync(this.currentLogFile)) {
      this.currentFileSize = fs.statSync(this.currentLogFile).size;
    }
  }

  private rotateLogFile(): void {
    if (!fs.existsSync(this.currentLogFile)) {
      return;
    }

    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = path.join(this.logDir, `performance.${i}.log`);
      const newFile = path.join(this.logDir, `performance.${i + 1}.log`);

      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }

    fs.renameSync(
      this.currentLogFile,
      path.join(this.logDir, "performance.1.log")
    );
    this.currentFileSize = 0;
  }

  /**
   * Logs a message with optional metric data
   * @param level Log level
   * @param message Message to log
   * @param metric Optional metric data
   */
  public log(level: LogLevel, message: string, metric: Metric): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metric,
    };

    const logLine = JSON.stringify(logEntry) + "\n";
    const lineSize = Buffer.from(logLine).length;

    if (this.currentFileSize + lineSize > this.maxFileSize) {
      this.rotateLogFile();
    }

    fs.appendFileSync(this.currentLogFile, logLine);
    this.currentFileSize += lineSize;
  }

  public debug(message: string, metric: Metric): void {
    this.log(LogLevel.DEBUG, message, metric);
  }

  public info(message: string, metric: Metric): void {
    this.log(LogLevel.INFO, message, metric);
  }

  public warn(message: string, metric: Metric): void {
    this.log(LogLevel.WARN, message, metric);
  }

  public error(message: string, metric: Metric): void {
    this.log(LogLevel.ERROR, message, metric);
  }
}
