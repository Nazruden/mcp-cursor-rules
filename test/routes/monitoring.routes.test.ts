import { Router, Request, Response } from "express";
import request from "supertest";
import express from "express";
import { MonitoringService } from "../../src/services/monitoring-service";
import { PerformanceLogger } from "../../src/services/performance-logger";
import * as os from "os";

// Mock dependencies
jest.mock("os", () => ({
  totalmem: jest.fn(),
  freemem: jest.fn(),
  loadavg: jest.fn(),
}));

// Create mock instances
const mockGetMetrics = jest.fn();
const mockAggregateMetrics = jest.fn();
const mockLog = jest.fn();

// Mock the MonitoringService class
jest.mock("../../src/services/monitoring-service", () => {
  return {
    MonitoringService: jest.fn().mockImplementation(() => ({
      getMetrics: mockGetMetrics,
      aggregateMetrics: mockAggregateMetrics,
    })),
  };
});

// Mock the PerformanceLogger class
jest.mock("../../src/services/performance-logger", () => {
  return {
    PerformanceLogger: jest.fn().mockImplementation(() => ({
      log: mockLog,
      error: mockLog,
      info: mockLog,
      warn: mockLog,
      debug: mockLog,
    })),
    LogLevel: {
      ERROR: "ERROR",
      INFO: "INFO",
      WARN: "WARN",
      DEBUG: "DEBUG",
    },
  };
});

describe("Monitoring Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock returns
    mockGetMetrics.mockReturnValue([]);
    mockAggregateMetrics.mockReturnValue({});

    // Mock OS methods
    (os.totalmem as jest.Mock).mockReturnValue(16000000000); // 16GB
    (os.freemem as jest.Mock).mockReturnValue(8000000000); // 8GB
    (os.loadavg as jest.Mock).mockReturnValue([1.5, 1.0, 0.5]);

    // Setup express app
    app = express();
    app.use(express.json());

    // Setup monitoring routes
    const monitoringRoutes = require("../../src/routes/monitoring").default;
    app.use("/monitoring", monitoringRoutes);
  });

  describe("Utility Functions", () => {
    describe("parseTags", () => {
      it("should parse valid JSON tags", async () => {
        const tags = { service: "test", env: "prod" };
        const response = await request(app)
          .get("/monitoring/metrics")
          .query({ tags: JSON.stringify(tags) });

        expect(response.status).toBe(200);
      });

      it("should handle empty tags", async () => {
        const response = await request(app).get("/monitoring/metrics");

        expect(response.status).toBe(200);
      });

      it("should handle invalid tags format", async () => {
        const response = await request(app)
          .get("/monitoring/metrics")
          .query({ tags: "invalid-json" });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Failed to retrieve metrics");
      });
    });

    describe("getSystemMetrics", () => {
      it("should return correct system metrics format", async () => {
        const response = await request(app).get("/monitoring/health");

        expect(response.status).toBe(200);
        expect(response.body.metrics).toEqual({
          memory: {
            total: 16000000000,
            free: 8000000000,
            used: 8000000000,
            usagePercentage: 50,
          },
          cpu: {
            loadAverage: 1.5,
          },
        });
      });

      it("should handle OS errors", async () => {
        (os.totalmem as jest.Mock).mockImplementation(() => {
          throw new Error("OS error");
        });

        const response = await request(app).get("/monitoring/health");

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Health check failed");
      });
    });
  });

  describe("Route Handlers", () => {
    describe("GET /metrics", () => {
      it("should handle successful metrics retrieval", async () => {
        mockGetMetrics.mockReturnValue([
          { name: "test_metric", value: 42, timestamp: new Date() },
        ]);

        const response = await request(app)
          .get("/monitoring/metrics")
          .query({
            name: "test_metric",
            tags: JSON.stringify({ service: "test" }),
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
      });

      it("should handle service errors", async () => {
        mockGetMetrics.mockImplementation(() => {
          throw new Error("Service error");
        });

        const response = await request(app).get("/monitoring/metrics");

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Failed to retrieve metrics");
      });
    });

    describe("GET /metrics/aggregate", () => {
      it("should handle successful aggregation", async () => {
        mockAggregateMetrics.mockReturnValue({
          "test:prod": { count: 2, avg: 42 },
        });

        const response = await request(app)
          .get("/monitoring/metrics/aggregate")
          .query({
            dimensions: "service,env",
            name: "test_metric",
            tags: JSON.stringify({ service: "test" }),
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("test:prod");
      });

      it("should handle empty dimensions", async () => {
        const response = await request(app).get(
          "/monitoring/metrics/aggregate"
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      });

      it("should handle service errors", async () => {
        mockAggregateMetrics.mockImplementation(() => {
          throw new Error("Service error");
        });

        const response = await request(app).get(
          "/monitoring/metrics/aggregate"
        );

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Failed to aggregate metrics");
      });
    });

    describe("GET /health", () => {
      it("should return health status with system metrics", async () => {
        const response = await request(app).get("/monitoring/health");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: "healthy",
          timestamp: expect.any(String),
          version: expect.any(String),
          metrics: expect.any(Object),
        });
      });

      it("should include memory and CPU metrics", async () => {
        const response = await request(app).get("/monitoring/health");

        expect(response.body.metrics).toMatchObject({
          memory: {
            total: expect.any(Number),
            free: expect.any(Number),
            used: expect.any(Number),
            usagePercentage: expect.any(Number),
          },
          cpu: {
            loadAverage: expect.any(Number),
          },
        });
      });
    });

    describe("GET /status", () => {
      beforeEach(() => {
        mockGetMetrics.mockReturnValue([
          {
            name: "test_metric",
            value: 42,
            timestamp: new Date(),
            tags: { service: "test" },
          },
        ]);
      });

      it("should return detailed performance status", async () => {
        const response = await request(app).get("/monitoring/status");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          system: expect.any(Object),
          metrics: expect.any(Array),
          timestamp: expect.any(String),
        });
      });

      it("should handle service errors", async () => {
        mockGetMetrics.mockImplementation(() => {
          throw new Error("Service error");
        });

        const response = await request(app).get("/monitoring/status");

        expect(response.status).toBe(500);
        expect(response.body.error).toBe(
          "Failed to retrieve performance status"
        );
      });

      it("should include recent metrics", async () => {
        const response = await request(app).get("/monitoring/status");

        expect(response.status).toBe(200);
        expect(response.body.metrics).toHaveLength(1);
        expect(response.body.metrics[0]).toMatchObject({
          name: "test_metric",
          value: 42,
        });
      });
    });
  });
});
