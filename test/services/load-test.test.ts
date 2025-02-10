import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { LoadTestService } from "../../src/services/load-test";
import { MonitoringService } from "../../src/services/monitoring-service";
import { PerformanceLogger } from "../../src/services/performance-logger";
import express from "express";
import http from "http";

describe("LoadTestService", () => {
  let loadTestService: LoadTestService;
  let monitoringService: MonitoringService;
  let performanceLogger: PerformanceLogger;
  let server: http.Server;
  let mockServerUrl: string;

  beforeEach((done) => {
    // Set up mock server
    const app = express();
    app.use(express.json());

    // Mock endpoints
    app.get("/api/rules", (req, res) => {
      setTimeout(() => res.json({ rules: [] }), 10); // Add small delay to simulate processing
    });

    app.post("/api/rules", (req, res) => {
      res.status(201).json({ created: true });
    });

    app.put("/api/rules/:id", (req, res) => {
      res.json({ updated: true });
    });

    // Start server on random port
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        mockServerUrl = `http://localhost:${addr.port}`;
        monitoringService = new MonitoringService();
        performanceLogger = new PerformanceLogger({ logDir: "./logs" });
        loadTestService = new LoadTestService(
          monitoringService,
          performanceLogger
        );
        done();
      }
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  describe("Benchmark Suite", () => {
    it("should create a benchmark scenario", async () => {
      const scenario = await loadTestService.createScenario({
        name: "test-scenario",
        duration: 10,
        concurrency: 5,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      expect(scenario).toBeDefined();
      expect(scenario.name).toBe("test-scenario");
      expect(scenario.duration).toBe(10);
      expect(scenario.concurrency).toBe(5);
    });

    it("should throw error for invalid scenario parameters", async () => {
      await expect(
        loadTestService.createScenario({
          name: "invalid-duration",
          duration: -1,
          concurrency: 5,
          endpoint: `${mockServerUrl}/api/rules`,
          method: "GET",
        })
      ).rejects.toThrow("Duration must be positive");

      await expect(
        loadTestService.createScenario({
          name: "invalid-concurrency",
          duration: 10,
          concurrency: -1,
          endpoint: `${mockServerUrl}/api/rules`,
          method: "GET",
        })
      ).rejects.toThrow("Concurrency must be positive");

      await expect(
        loadTestService.createScenario({
          name: "missing-endpoint",
          duration: 10,
          concurrency: 5,
          endpoint: "",
          method: "GET",
        })
      ).rejects.toThrow("Endpoint is required");

      await expect(
        loadTestService.createScenario({
          name: "missing-method",
          duration: 10,
          concurrency: 5,
          endpoint: `${mockServerUrl}/api/rules`,
          method: "",
        })
      ).rejects.toThrow("HTTP method is required");
    });

    it("should execute scenario within specified duration", async () => {
      const startTime = Date.now();
      const duration = 5;

      await loadTestService.runScenario({
        name: "duration-test",
        duration,
        concurrency: 1,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      const executionTime = (Date.now() - startTime) / 1000;
      expect(executionTime).toBeGreaterThanOrEqual(duration);
      expect(executionTime).toBeLessThan(duration + 1);
    });

    it("should maintain specified concurrency", async () => {
      const concurrency = 5;
      const scenario = {
        name: "concurrency-test",
        duration: 5,
        concurrency,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      };

      const result = await loadTestService.runScenario(scenario);
      expect(result.metrics.concurrentRequests.max).toBeLessThanOrEqual(
        concurrency
      );
      expect(result.metrics.concurrentRequests.avg).toBeGreaterThan(
        concurrency * 0.8
      );
    });

    it("should handle different HTTP methods and payloads", async () => {
      const postResult = await loadTestService.runScenario({
        name: "post-test",
        duration: 1,
        concurrency: 1,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "POST",
        payload: { test: "data" },
      });

      expect(postResult.metrics).toBeDefined();
      expect(postResult.scenario.payload).toEqual({ test: "data" });

      const putResult = await loadTestService.runScenario({
        name: "put-test",
        duration: 1,
        concurrency: 1,
        endpoint: `${mockServerUrl}/api/rules/1`,
        method: "PUT",
        payload: { updated: true },
      });

      expect(putResult.metrics).toBeDefined();
      expect(putResult.scenario.payload).toEqual({ updated: true });
    });
  });

  describe("Load Test Implementation", () => {
    it("should handle concurrent requests without errors", async () => {
      const result = await loadTestService.runScenario({
        name: "concurrent-test",
        duration: 5,
        concurrency: 10,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      expect(result.metrics.errors).toBe(0);
      expect(result.metrics.requests.total).toBeGreaterThan(0);
    });

    it("should measure latency correctly", async () => {
      const result = await loadTestService.runScenario({
        name: "latency-test",
        duration: 5,
        concurrency: 1,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      expect(result.metrics.latency).toBeDefined();
      expect(result.metrics.latency.p99).toBeDefined();
      expect(result.metrics.latency.avg).toBeGreaterThan(0);
    });
  });

  describe("Performance Baselines", () => {
    it("should compare with baseline", async () => {
      const baseline = {
        latency: { avg: 100, p99: 200 },
        throughput: 1000,
        errors: 0,
      };

      const result = await loadTestService.runScenario({
        name: "baseline-test",
        duration: 5,
        concurrency: 5,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      const comparison = await loadTestService.compareWithBaseline(
        result,
        baseline
      );
      expect(comparison.meetsBaseline).toBeDefined();
      expect(comparison.metrics).toBeDefined();
    });

    it("should handle edge cases in baseline comparison", async () => {
      const result = await loadTestService.runScenario({
        name: "edge-case-test",
        duration: 1,
        concurrency: 1,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      const zeroBaseline = {
        latency: { avg: 0, p99: 0 },
        throughput: 0,
        errors: 0,
      };

      const zeroComparison = await loadTestService.compareWithBaseline(
        result,
        zeroBaseline
      );
      expect(zeroComparison.meetsBaseline).toBeDefined();

      const highBaseline = {
        latency: { avg: 1, p99: 1 },
        throughput: 100000,
        errors: 0,
      };

      const highComparison = await loadTestService.compareWithBaseline(
        result,
        highBaseline
      );
      expect(highComparison.meetsBaseline).toBe(false);
    });

    it("should generate detailed report", async () => {
      const result = await loadTestService.runScenario({
        name: "report-test",
        duration: 5,
        concurrency: 5,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      const report = await loadTestService.generateReport(result);
      expect(report.summary).toBeDefined();
      expect(report.charts).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it("should handle edge cases in report generation", async () => {
      const result = await loadTestService.runScenario({
        name: "edge-report-test",
        duration: 1,
        concurrency: 1,
        endpoint: `${mockServerUrl}/api/rules`,
        method: "GET",
      });

      result.metrics.latency.p99 = 2000;
      result.metrics.errors = 5;
      result.metrics.concurrentRequests.avg = 0;

      const report = await loadTestService.generateReport(result);

      expect(report.recommendations).toContain(
        "High p99 latency detected. Consider optimizing endpoint performance."
      );
      expect(report.recommendations).toContain(
        "Errors detected during load test. Investigate error responses."
      );
      expect(report.recommendations).toContain(
        "Lower than expected concurrency. Check for connection bottlenecks."
      );

      expect(report.charts.latencyDistribution.data).toHaveLength(3);
      expect(report.charts.errorRate.value).toBe(
        5 / result.metrics.requests.total
      );
    });
  });
});
