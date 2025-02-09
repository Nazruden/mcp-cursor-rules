import {
  MonitoringService,
  Metric,
  MetricFilter,
  AggregatedMetrics,
} from "../../src/services/monitoring";

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
          timestamp: now,
          tags: { endpoint: "/api/rules", type: "request" },
        },
        {
          name: "cache_hit",
          value: 1,
          timestamp: now,
          tags: { cache: "rules", type: "cache" },
        },
        {
          name: "response_time",
          value: 150,
          timestamp: now,
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
      ];

      testMetrics.forEach((m) => monitoringService.recordMetric(m));
    });

    it("should aggregate metrics by endpoint", () => {
      const aggregated = monitoringService.aggregateMetrics(["endpoint"]);

      expect(Object.keys(aggregated)).toHaveLength(2);
      expect(aggregated["/api/rules"].avg).toBe(125);
      expect(aggregated["/api/compose"].avg).toBe(200);
    });

    it("should aggregate metrics by multiple dimensions", () => {
      const aggregated = monitoringService.aggregateMetrics([
        "endpoint",
        "method",
      ]);

      expect(Object.keys(aggregated)).toHaveLength(2);
      expect(aggregated["/api/rules|GET"].count).toBe(2);
      expect(aggregated["/api/compose|POST"].count).toBe(1);
    });
  });
});
