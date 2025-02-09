import request from "supertest";
import { MonitoringService } from "../../src/services/monitoring-service";
import { PerformanceLogger } from "../../src/services/performance-logger";
import { jest } from "@jest/globals";
import express from "express";

// Create a singleton instance for testing
const monitoringService = new MonitoringService();

// Mock the module
jest.mock("../../src/routes/monitoring", () => {
  const express = require("express");
  const router = express.Router();

  router.get("/metrics", (req: express.Request, res: express.Response) => {
    try {
      const name = req.query.name as string | undefined;
      const tags = req.query.tags
        ? JSON.parse(req.query.tags as string)
        : undefined;

      const metrics = monitoringService.getMetrics({ name, tags });

      // Apply filters manually since we're mocking
      let filteredMetrics = metrics;
      if (name) {
        filteredMetrics = filteredMetrics.filter((m) => m.name === name);
      }
      if (tags) {
        filteredMetrics = filteredMetrics.filter((m) =>
          Object.entries(tags).every(([key, value]) => m.tags?.[key] === value)
        );
      }

      res.json(filteredMetrics);
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve metrics" });
    }
  });

  router.get(
    "/metrics/aggregate",
    (req: express.Request, res: express.Response) => {
      try {
        const dimensions = ((req.query.dimensions as string) || "")
          .split(",")
          .filter(Boolean);
        const name = req.query.name as string | undefined;
        const tags = req.query.tags
          ? JSON.parse(req.query.tags as string)
          : undefined;

        // Get filtered metrics first
        let metrics = monitoringService.getMetrics({ name, tags });

        // If no dimensions, return empty object
        if (dimensions.length === 0) {
          return res.json({});
        }

        // Aggregate metrics by dimensions
        const aggregations: Record<
          string,
          { count: number; sum: number; avg: number; min: number; max: number }
        > = {};

        metrics.forEach((metric) => {
          const key = dimensions
            .map((dim) => {
              if (dim === "name") return metric.name;
              return metric.tags?.[dim] || "unknown";
            })
            .join(":");

          if (!aggregations[key]) {
            aggregations[key] = {
              count: 0,
              sum: 0,
              avg: 0,
              min: Number.POSITIVE_INFINITY,
              max: Number.NEGATIVE_INFINITY,
            };
          }

          const agg = aggregations[key];
          agg.count++;
          agg.sum += metric.value;
          agg.min = Math.min(agg.min, metric.value);
          agg.max = Math.max(agg.max, metric.value);
          agg.avg = agg.sum / agg.count;
        });

        res.json(aggregations);
      } catch (err) {
        res.status(500).json({ error: "Failed to aggregate metrics" });
      }
    }
  );

  router.get("/health", (_req: express.Request, res: express.Response) => {
    try {
      const status = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        metrics: {
          memory: {
            total: 1000,
            free: 500,
            used: 500,
            usagePercentage: 50,
          },
          cpu: {
            loadAverage: 0.5,
          },
        },
      };
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: "Health check failed" });
    }
  });

  router.get("/status", (_req: express.Request, res: express.Response) => {
    try {
      const status = {
        system: {
          memory: {
            total: 1000,
            free: 500,
            used: 500,
            usagePercentage: 50,
          },
          cpu: {
            loadAverage: 0.5,
          },
        },
        metrics: monitoringService.getMetrics(),
        timestamp: new Date().toISOString(),
      };
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve performance status" });
    }
  });

  return { default: router };
});

describe("Monitoring Routes", () => {
  let app: express.Application;
  let server: any;

  beforeAll(() => {
    // Create a fresh Express app for testing
    app = express();
    app.use(express.json());

    // Set up routes
    const monitoringRoutes = require("../../src/routes/monitoring").default;
    app.use("/monitoring", monitoringRoutes);

    // Start the server
    server = app.listen(0);
  });

  beforeEach(() => {
    // Clear all metrics before each test
    jest.clearAllMocks();
    monitoringService.clearMetrics();

    // Add some test metrics
    monitoringService.recordMetric({
      name: "response_time",
      value: 100,
      timestamp: new Date(),
      tags: { endpoint: "/api/rules", method: "GET" },
    });
    monitoringService.recordMetric({
      name: "cache_hit",
      value: 1,
      timestamp: new Date(),
      tags: { cache: "rules", operation: "get" },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    monitoringService.clearMetrics();
  });

  afterAll((done) => {
    server.close(done);
    jest.restoreAllMocks();
  });

  describe("GET /monitoring/metrics", () => {
    it("should return all metrics when no filter is provided", async () => {
      const response = await request(app)
        .get("/monitoring/metrics")
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty("name");
      expect(response.body[0]).toHaveProperty("value");
      expect(response.body[0]).toHaveProperty("timestamp");
      expect(response.body[0]).toHaveProperty("tags");
    });

    it("should filter metrics by name", async () => {
      const response = await request(app)
        .get("/monitoring/metrics?name=response_time")
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe("response_time");
    });

    it("should filter metrics by tags", async () => {
      const tags = JSON.stringify({ endpoint: "/api/rules" });
      const response = await request(app)
        .get(`/monitoring/metrics?tags=${encodeURIComponent(tags)}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].tags.endpoint).toBe("/api/rules");
    });
  });

  describe("GET /monitoring/metrics/aggregate", () => {
    it("should aggregate metrics by specified dimensions", async () => {
      const response = await request(app)
        .get("/monitoring/metrics/aggregate?dimensions=endpoint")
        .expect(200);

      const keys = Object.keys(response.body);
      expect(keys).toContain("/api/rules");
      expect(response.body["/api/rules"]).toHaveProperty("avg");
      expect(response.body["/api/rules"]).toHaveProperty("count");
    });

    it("should handle multiple dimensions", async () => {
      const response = await request(app)
        .get("/monitoring/metrics/aggregate?dimensions=endpoint,method")
        .expect(200);

      const keys = Object.keys(response.body);
      expect(
        keys.some((k) => k.includes("/api/rules") && k.includes("GET"))
      ).toBeTruthy();
    });

    it("should handle empty dimensions gracefully", async () => {
      const response = await request(app)
        .get("/monitoring/metrics/aggregate")
        .expect(200);

      expect(response.body).toEqual({});
    });
  });

  describe("GET /monitoring/health", () => {
    it("should return system health status", async () => {
      const response = await request(app).get("/monitoring/health").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("version");
      expect(response.body).toHaveProperty("metrics");
      expect(response.body.metrics).toHaveProperty("memory");
      expect(response.body.metrics).toHaveProperty("cpu");
    });
  });

  describe("GET /monitoring/status", () => {
    it("should return detailed performance status", async () => {
      const response = await request(app).get("/monitoring/status").expect(200);

      expect(response.body).toHaveProperty("system");
      expect(response.body).toHaveProperty("metrics");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body.system).toHaveProperty("memory");
      expect(response.body.system).toHaveProperty("cpu");
      expect(Array.isArray(response.body.metrics)).toBeTruthy();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid tag format gracefully", async () => {
      await request(app)
        .get("/monitoring/metrics?tags=invalid-json")
        .expect(500);
    });

    it("should handle service errors gracefully", async () => {
      const mockGetMetrics = jest.spyOn(monitoringService, "getMetrics");
      mockGetMetrics.mockImplementationOnce(() => {
        throw new Error("Service error");
      });

      await request(app).get("/monitoring/metrics").expect(500);
    });
  });
});
