import {
  PerformanceLogger,
  LogLevel,
  LogEntry,
} from "../../src/services/performance-logger";
import { Metric } from "../../src/services/monitoring";
import * as fs from "fs";
import * as path from "path";

describe("PerformanceLogger", () => {
  let logger: PerformanceLogger;
  let logDir: string;
  let logFile: string;

  beforeEach(() => {
    logDir = path.join(__dirname, "../../logs");
    logFile = path.join(logDir, "performance.log");

    // Clean up test logs before each test
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(logDir, file));
      });
      fs.rmdirSync(logDir);
    }

    logger = new PerformanceLogger({ logDir });
  });

  afterEach(() => {
    // Clean up test logs after each test
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(logDir, file));
      });
      fs.rmdirSync(logDir);
    }
  });

  describe("log", () => {
    it("should create log directory if it does not exist", () => {
      expect(fs.existsSync(logDir)).toBe(true);
    });

    it("should write log entry in correct format", () => {
      const timestamp = new Date("2024-01-01T12:00:00Z");
      const metric: Metric = {
        name: "response_time",
        value: 100,
        timestamp,
        tags: { endpoint: "/api/rules" },
      };

      logger.log(LogLevel.INFO, "Test message", metric);

      const logContent = fs.readFileSync(logFile, "utf-8");
      const logEntry = JSON.parse(logContent.split("\\n")[0]) as LogEntry;

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.message).toBe("Test message");
      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.metric).toEqual({
        ...metric,
        timestamp: timestamp.toISOString(),
      });
    });

    it("should handle multiple log entries", () => {
      for (let i = 0; i < 5; i++) {
        logger.log(LogLevel.INFO, `Message ${i}`);
      }

      const logContent = fs.readFileSync(logFile, "utf-8");
      const entries = logContent.split("\\n").filter(Boolean);

      expect(entries).toHaveLength(5);
      entries.forEach((entry, i) => {
        const parsed = JSON.parse(entry) as LogEntry;
        expect(parsed.message).toBe(`Message ${i}`);
      });
    });

    it("should respect minimum log level", () => {
      logger = new PerformanceLogger({ logDir, minLevel: LogLevel.WARN });

      logger.log(LogLevel.INFO, "Info message");
      logger.log(LogLevel.WARN, "Warning message");
      logger.log(LogLevel.ERROR, "Error message");

      const logContent = fs.readFileSync(logFile, "utf-8");
      const entries = logContent.split("\\n").filter(Boolean);

      expect(entries).toHaveLength(2); // Only WARN and ERROR
      entries.forEach((entry) => {
        const parsed = JSON.parse(entry) as LogEntry;
        expect(parsed.level).not.toBe("INFO");
      });
    });
  });

  describe("rotation", () => {
    it("should rotate log file when size limit is reached", async () => {
      logger = new PerformanceLogger({
        logDir,
        maxFileSize: 100, // Small size for testing
        maxFiles: 3,
      });

      // Write enough logs to trigger rotation
      for (let i = 0; i < 10; i++) {
        logger.log(LogLevel.INFO, "A".repeat(20)); // Each entry > 20 bytes
        // Small delay to ensure file system operations complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const files = fs.readdirSync(logDir);
      expect(files.length).toBeGreaterThan(1);
      expect(files.length).toBeLessThanOrEqual(3);
    });

    it("should maintain correct number of rotated files", async () => {
      logger = new PerformanceLogger({
        logDir,
        maxFileSize: 100,
        maxFiles: 2,
      });

      // Write enough logs to trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        logger.log(LogLevel.INFO, "A".repeat(20));
        // Small delay to ensure file system operations complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const files = fs.readdirSync(logDir);
      expect(files.length).toBeLessThanOrEqual(2);
    });
  });

  describe("error handling", () => {
    it("should handle write errors gracefully", () => {
      // Make log directory read-only
      fs.chmodSync(logDir, 0o444);

      expect(() => {
        logger.log(LogLevel.INFO, "Test message");
      }).not.toThrow();

      // Restore permissions
      fs.chmodSync(logDir, 0o777);
    });

    it("should handle invalid JSON in log file during rotation", () => {
      // Write invalid JSON to log file
      fs.writeFileSync(logFile, "invalid json\\n");

      expect(() => {
        logger.log(LogLevel.INFO, "Test message");
      }).not.toThrow();
    });
  });
});
