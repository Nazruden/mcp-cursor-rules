import autocannon, { Instance, Client, Result } from "autocannon";
import { MonitoringService } from "./monitoring-service";
import { PerformanceLogger, LogLevel } from "./performance-logger";
import {
  LoadScenario,
  LoadMetrics,
  LoadTestResult,
  BaselineComparison,
  LoadTestReport,
} from "../types/load-test";

export class LoadTestService {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly performanceLogger: PerformanceLogger
  ) {}

  public async createScenario(config: LoadScenario): Promise<LoadScenario> {
    // Validate scenario configuration
    if (config.duration <= 0) throw new Error("Duration must be positive");
    if (config.concurrency <= 0)
      throw new Error("Concurrency must be positive");
    if (!config.endpoint) throw new Error("Endpoint is required");
    if (!config.method) throw new Error("HTTP method is required");

    return { ...config };
  }

  public async runScenario(scenario: LoadScenario): Promise<LoadTestResult> {
    return new Promise((resolve, reject) => {
      const result: LoadTestResult = {
        scenario,
        metrics: {
          latency: {
            avg: 0,
            min: 0,
            max: 0,
            p50: 0,
            p90: 0,
            p99: 0,
          },
          throughput: 0,
          requests: {
            total: 0,
            successful: 0,
            failed: 0,
          },
          concurrentRequests: {
            avg: 0,
            max: 0,
          },
          errors: 0,
        },
        timestamp: new Date(),
      };

      const instance: Instance = autocannon(
        {
          url: scenario.endpoint,
          connections: scenario.concurrency,
          duration: scenario.duration,
          method: scenario.method as "GET" | "POST" | "PUT" | "DELETE",
          body: scenario.payload ? JSON.stringify(scenario.payload) : undefined,
          headers: {
            "content-type": "application/json",
          },
        },
        (err: Error | null, stats: Result) => {
          if (err) {
            this.performanceLogger.error("Load test error", {
              name: "load_test_error",
              value: 1,
              timestamp: new Date(),
              tags: {
                scenario: scenario.name,
                error: err.message,
              },
            });
            reject(err);
            return;
          }

          result.metrics = {
            latency: {
              avg: stats.latency.mean,
              min: stats.latency.min,
              max: stats.latency.max,
              p50: stats.latency.p50,
              p90: stats.latency.p90,
              p99: stats.latency.p99,
            },
            throughput: stats.throughput.mean,
            requests: {
              total: stats.requests.total,
              successful: stats.requests.total - stats.errors,
              failed: stats.errors,
            },
            concurrentRequests: {
              avg: stats.connections,
              max: scenario.concurrency,
            },
            errors: stats.errors,
          };

          // Log the results
          this.performanceLogger.info("Load test completed", {
            name: "load_test_result",
            value: result.metrics.throughput,
            timestamp: result.timestamp,
            tags: {
              scenario: scenario.name,
              endpoint: scenario.endpoint,
            },
          });

          resolve(result);
        }
      );

      // Track 4xx/5xx responses
      instance.on("response", (_client: Client, statusCode: number) => {
        if (statusCode >= 400) {
          result.metrics.errors++;
        }
      });
    });
  }

  public async compareWithBaseline(
    result: LoadTestResult,
    baseline: {
      latency: { avg: number; p99: number };
      throughput: number;
      errors: number;
    }
  ): Promise<BaselineComparison> {
    const comparison: BaselineComparison = {
      meetsBaseline: true,
      metrics: {
        latency: {
          avgDiff: result.metrics.latency.avg - baseline.latency.avg,
          p99Diff: result.metrics.latency.p99 - baseline.latency.p99,
        },
        throughputDiff: result.metrics.throughput - baseline.throughput,
        errorDiff: result.metrics.errors - baseline.errors,
      },
    };

    // Define thresholds for acceptable differences
    const LATENCY_THRESHOLD = 0.1; // 10% degradation
    const THROUGHPUT_THRESHOLD = 0.1; // 10% degradation
    const ERROR_THRESHOLD = 0; // No additional errors allowed

    comparison.meetsBaseline =
      comparison.metrics.latency.avgDiff / baseline.latency.avg <=
        LATENCY_THRESHOLD &&
      comparison.metrics.latency.p99Diff / baseline.latency.p99 <=
        LATENCY_THRESHOLD &&
      comparison.metrics.throughputDiff / baseline.throughput >=
        -THROUGHPUT_THRESHOLD &&
      comparison.metrics.errorDiff <= ERROR_THRESHOLD;

    return comparison;
  }

  public async generateReport(result: LoadTestResult): Promise<LoadTestReport> {
    const report: LoadTestReport = {
      summary: {
        scenario: result.scenario,
        metrics: result.metrics,
      },
      charts: {
        latencyDistribution: {
          labels: ["p50", "p90", "p99"],
          data: [
            result.metrics.latency.p50,
            result.metrics.latency.p90,
            result.metrics.latency.p99,
          ],
        },
        throughputOverTime: {
          // This would be populated with time series data in a real implementation
          labels: [],
          data: [],
        },
        errorRate: {
          value: result.metrics.errors / result.metrics.requests.total,
        },
      },
      recommendations: [],
    };

    // Generate recommendations based on metrics
    if (result.metrics.latency.p99 > 1000) {
      report.recommendations.push(
        "High p99 latency detected. Consider optimizing endpoint performance."
      );
    }
    if (result.metrics.errors > 0) {
      report.recommendations.push(
        "Errors detected during load test. Investigate error responses."
      );
    }
    if (
      result.metrics.concurrentRequests.avg <
      result.scenario.concurrency * 0.8
    ) {
      report.recommendations.push(
        "Lower than expected concurrency. Check for connection bottlenecks."
      );
    }

    return report;
  }
}
