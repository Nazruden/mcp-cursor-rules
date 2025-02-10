import {
  MonitoringService,
  Metric,
  AggregatedMetrics,
} from "../../src/services/monitoring-service";
import type { MetricFilter } from "../../src/types/metric";

describe("MonitoringService", () => {
  let monitoringService: MonitoringService;
  let now: Date;

  beforeEach(() => {
    jest.useFakeTimers();
    now = new Date();
    jest.setSystemTime(now);
    monitoringService = new MonitoringService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("recordMetric", () => {
    it("should record a metric correctly", () => {
      const metric: Metric = {
        name: "response_time",
        value: 100,
        timestamp: now,
        tags: { endpoint: "/api/rules" },
      };

      monitoringService.recordMetric(metric);
      const metrics = monitoringService.getMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual(metric);
    });

    it("should handle string timestamps", () => {
      const timestamp = new Date();
      const metric: Metric = {
        name: "test_metric",
        value: 42,
        timestamp: timestamp.toISOString() as any,
        tags: { service: "test" },
      };

      monitoringService.recordMetric(metric);
      const metrics = monitoringService.getMetrics();

      expect(metrics[0].timestamp).toBeInstanceOf(Date);
      expect(metrics[0].timestamp.getTime()).toBe(timestamp.getTime());
    });

    it("should handle concurrent metric recording", async () => {
      const metrics: Metric[] = Array.from({ length: 100 }, (_, i) => ({
        name: "concurrent_test",
        value: i,
        timestamp: now,
        tags: { test: "concurrent" },
      }));

      await Promise.all(
        metrics.map((m) => Promise.resolve(monitoringService.recordMetric(m)))
      );
      const recorded = monitoringService.getMetrics();

      expect(recorded).toHaveLength(metrics.length);
    });
  });

  describe("getMetrics", () => {
    beforeEach(() => {
      const testMetrics: Metric[] = [
        {
          name: "response_time",
          value: 100,
          timestamp: new Date(now.getTime() - 2000), // 2 seconds ago
          tags: { endpoint: "/api/rules", type: "request" },
        },
        {
          name: "cache_hit",
          value: 1,
          timestamp: new Date(now.getTime() - 2000), // 2 seconds ago
          tags: { cache: "rules", type: "cache" },
        },
        {
          name: "response_time",
          value: 150,
          timestamp: new Date(now.getTime() - 3000), // 3 seconds ago
          tags: { endpoint: "/api/compose", type: "request" },
        },
      ];

      testMetrics.forEach((m) => monitoringService.recordMetric(m));
    });

    it("should retrieve all metrics when no filter is provided", () => {
      const metrics = monitoringService.getMetrics();
      expect(metrics).toHaveLength(3);
    });

    it("should filter metrics by name", () => {
      const filter: MetricFilter = { name: "response_time" };
      const metrics = monitoringService.getMetrics(filter);

      expect(metrics).toHaveLength(2);
      metrics.forEach((m) => expect(m.name).toBe("response_time"));
    });

    it("should filter metrics by tags", () => {
      const filter: MetricFilter = { tags: { endpoint: "/api/rules" } };
      const metrics = monitoringService.getMetrics(filter);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].tags?.endpoint).toBe("/api/rules");
    });

    it("should filter metrics by timestamp start", () => {
      const filter: MetricFilter = {
        timestamp: {
          start: new Date(now.getTime() - 2500), // Between first and second metric
        },
      };
      const metrics = monitoringService.getMetrics(filter);

      expect(metrics).toHaveLength(2);
      metrics.forEach((metric) => {
        expect(metric.timestamp.getTime()).toBeGreaterThanOrEqual(
          filter.timestamp!.start!.getTime()
        );
      });
    });

    it("should filter metrics by timestamp end", () => {
      const filter: MetricFilter = {
        timestamp: {
          end: new Date(now.getTime() - 1500), // Between first and second metric
        },
      };
      const metrics = monitoringService.getMetrics(filter);

      expect(metrics).toHaveLength(3); // All metrics are before the end time
      metrics.forEach((metric) => {
        expect(metric.timestamp.getTime()).toBeLessThanOrEqual(
          filter.timestamp!.end!.getTime()
        );
      });
    });

    it("should filter metrics by timestamp range", () => {
      const filter: MetricFilter = {
        timestamp: {
          start: new Date(now.getTime() - 2500), // Between 2 and 3 seconds ago
          end: new Date(now.getTime() - 1500), // Between 1 and 2 seconds ago
        },
      };
      const metrics = monitoringService.getMetrics(filter);

      expect(metrics).toHaveLength(2);
      metrics.forEach((metric) => {
        expect(metric.timestamp.getTime()).toBeGreaterThanOrEqual(
          filter.timestamp!.start!.getTime()
        );
        expect(metric.timestamp.getTime()).toBeLessThanOrEqual(
          filter.timestamp!.end!.getTime()
        );
      });
    });

    it("should handle empty timestamp filter", () => {
      const filter: MetricFilter = {
        timestamp: {},
      };
      const metrics = monitoringService.getMetrics(filter);

      expect(metrics).toHaveLength(3); // Should return all metrics
    });
  });

  describe("aggregateMetrics", () => {
    beforeEach(() => {
      const testMetrics: Metric[] = [
        {
          name: "response_time",
          value: 100,
          timestamp: now,
          tags: { endpoint: "/api/rules", method: "GET", type: "request" },
        },
        {
          name: "response_time",
          value: 150,
          timestamp: now,
          tags: { endpoint: "/api/rules", method: "GET", type: "request" },
        },
        {
          name: "response_time",
          value: 200,
          timestamp: now,
          tags: { endpoint: "/api/compose", method: "POST", type: "request" },
        },
        {
          name: "cache_hit",
          value: 1,
          timestamp: now,
          tags: { cache: "rules", operation: "get" },
        },
      ];

      testMetrics.forEach((m) => monitoringService.recordMetric(m));
    });

    it("should aggregate metrics by endpoint", () => {
      const aggregated = monitoringService.aggregateMetrics({}, ["endpoint"]);

      expect(Object.keys(aggregated)).toHaveLength(3); // Including "unknown" endpoint
      expect(aggregated["/api/rules"].avg).toBe(125);
      expect(aggregated["/api/compose"].avg).toBe(200);
      expect(aggregated["unknown"]).toBeDefined();
    });

    it("should aggregate metrics by multiple dimensions", () => {
      const aggregated = monitoringService.aggregateMetrics({}, [
        "endpoint",
        "method",
      ]);

      expect(Object.keys(aggregated)).toHaveLength(3); // Including "unknown:unknown"
      expect(aggregated["/api/rules:GET"].count).toBe(2);
      expect(aggregated["/api/compose:POST"].count).toBe(1);
      expect(aggregated["unknown:unknown"]).toBeDefined();
    });

    it("should handle empty dimensions array", () => {
      const aggregated = monitoringService.aggregateMetrics({}, []);
      expect(Object.keys(aggregated)).toHaveLength(0);
    });

    it("should aggregate metrics with name dimension", () => {
      const filter: MetricFilter = { name: "response_time" };
      const dimensions = ["method"];
      const aggregated = monitoringService.aggregateMetrics(filter, dimensions);

      expect(Object.keys(aggregated)).toHaveLength(2);
      expect(aggregated["GET"]).toBeDefined();
      expect(aggregated["POST"]).toBeDefined();
      expect(aggregated["GET"].count).toBe(2);
      expect(aggregated["GET"].avg).toBe(125);
    });

    it("should handle metrics without specified dimension tags", () => {
      const filter: MetricFilter = {};
      const dimensions = ["missing_dimension"];
      const aggregated = monitoringService.aggregateMetrics(filter, dimensions);

      expect(Object.keys(aggregated)).toHaveLength(1);
      expect(aggregated["unknown"]).toBeDefined();
      expect(aggregated["unknown"].count).toBe(4);
    });

    it("should handle filtering and aggregation together", () => {
      const filter: MetricFilter = {
        name: "response_time",
        tags: { type: "request" },
      };
      const dimensions = ["endpoint"];
      const aggregated = monitoringService.aggregateMetrics(filter, dimensions);

      expect(Object.keys(aggregated)).toHaveLength(2);
      expect(aggregated["/api/rules"]).toBeDefined();
      expect(aggregated["/api/compose"]).toBeDefined();
      expect(aggregated["/api/rules"].count).toBe(2);
      expect(aggregated["/api/rules"].avg).toBe(125);
    });

    it("should handle non-existent dimensions", () => {
      const aggregated = monitoringService.aggregateMetrics(
        { name: "response_time" },
        ["nonexistent"]
      );
      expect(Object.keys(aggregated)).toHaveLength(1);
      expect(aggregated["unknown"]).toBeDefined();
    });
  });
});
