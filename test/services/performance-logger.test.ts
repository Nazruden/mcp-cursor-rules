import {
  PerformanceLogger,
  LogLevel,
} from "../../src/services/performance-logger";
import { Metric } from "../../src/services/monitoring";
import * as fs from "fs";
import * as path from "path";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  appendFileSync: jest.fn(),
  renameSync: jest.fn(),
}));

describe("PerformanceLogger", () => {
  const testLogDir = "/test/logs";
  const defaultLogFile = path.join(testLogDir, "performance.log");
  let logger: PerformanceLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.statSync as jest.Mock).mockReturnValue({ size: 0 });
  });

  describe("Initialization", () => {
    it("should create log directory if it doesn't exist", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      logger = new PerformanceLogger({ logDir: testLogDir });

      expect(fs.mkdirSync).toHaveBeenCalledWith(testLogDir, {
        recursive: true,
      });
    });

    it("should not create log directory if it exists", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      logger = new PerformanceLogger({ logDir: testLogDir });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it("should initialize with default values", () => {
      logger = new PerformanceLogger({ logDir: testLogDir });

      expect(logger["maxFileSize"]).toBe(10 * 1024 * 1024); // 10MB
      expect(logger["maxFiles"]).toBe(5);
    });

    it("should initialize with custom values", () => {
      const customMaxSize = 5 * 1024 * 1024;
      const customMaxFiles = 3;

      logger = new PerformanceLogger({
        logDir: testLogDir,
        maxFileSize: customMaxSize,
        maxFiles: customMaxFiles,
      });

      expect(logger["maxFileSize"]).toBe(customMaxSize);
      expect(logger["maxFiles"]).toBe(customMaxFiles);
    });
  });

  describe("Log File Management", () => {
    beforeEach(() => {
      logger = new PerformanceLogger({ logDir: testLogDir });
    });

    it("should rotate log files when size limit is reached", () => {
      // Mock file existence checks
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // For size check
        .mockReturnValueOnce(true); // For rotation

      const metric = {
        name: "test_metric",
        value: 42,
        timestamp: new Date(),
      };

      // Set current file size to just below the limit
      logger["currentFileSize"] = logger["maxFileSize"] - 10;

      // Mock appendFileSync to simulate writing a large entry
      (fs.appendFileSync as jest.Mock).mockImplementationOnce(() => {
        logger["currentFileSize"] += 100; // Simulate size increase
      });

      logger.info("Test message", metric);

      // Verify rotation was attempted
      expect(fs.renameSync).toHaveBeenCalledWith(
        defaultLogFile,
        path.join(testLogDir, "performance.1.log")
      );
    });

    it("should handle multiple log rotations", () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // For current log file
        .mockReturnValueOnce(true) // For performance.1.log
        .mockReturnValueOnce(true); // For performance.2.log

      logger["rotateLogFile"]();

      expect(fs.renameSync).toHaveBeenCalledTimes(3);
    });
  });

  describe("Logging Operations", () => {
    beforeEach(() => {
      logger = new PerformanceLogger({ logDir: testLogDir });
    });

    it("should log messages with different levels", () => {
      const metric = {
        name: "test_metric",
        value: 42,
        timestamp: new Date(),
      };

      logger.debug("Debug message", metric);
      logger.info("Info message", metric);
      logger.warn("Warning message", metric);
      logger.error("Error message", metric);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(4);

      const calls = (fs.appendFileSync as jest.Mock).mock.calls;
      expect(calls[0][1]).toContain(LogLevel.DEBUG);
      expect(calls[1][1]).toContain(LogLevel.INFO);
      expect(calls[2][1]).toContain(LogLevel.WARN);
      expect(calls[3][1]).toContain(LogLevel.ERROR);
    });

    it("should format log entries correctly", () => {
      const metric = {
        name: "test_metric",
        value: 42,
        timestamp: new Date(),
      };

      logger.info("Test message", metric);

      const logCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      const logEntry = JSON.parse(logCall[1] as string);

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        message: "Test message",
        metric: expect.objectContaining({
          name: "test_metric",
          value: 42,
        }),
      });
      expect(logEntry.timestamp).toBeDefined();
    });

    it("should handle large log entries", () => {
      const largeMetric = {
        name: "large_metric",
        value: 42,
        timestamp: new Date(),
        tags: {
          longTag: "x".repeat(1000), // Create a large tag
        },
      };

      logger.info("Large message", largeMetric);

      expect(fs.appendFileSync).toHaveBeenCalled();
      const logCall = (fs.appendFileSync as jest.Mock).mock.calls[0];
      expect(logCall[1]).toContain("large_metric");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      logger = new PerformanceLogger({ logDir: testLogDir });
    });

    it("should handle file system errors gracefully", () => {
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("File system error");
      });

      const metric = {
        name: "test_metric",
        value: 42,
        timestamp: new Date(),
      };

      expect(() => logger.info("Test message", metric)).not.toThrow();
    });

    it("should handle rotation errors gracefully", () => {
      (fs.renameSync as jest.Mock).mockImplementation(() => {
        throw new Error("Rename error");
      });

      logger["currentFileSize"] = logger["maxFileSize"] + 1;
      const metric = {
        name: "test_metric",
        value: 42,
        timestamp: new Date(),
      };

      expect(() => logger.info("Test message", metric)).not.toThrow();
    });
  });
});
