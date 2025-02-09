import { MetricFilter } from "../types/metric";

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface AggregatedMetric {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export type AggregatedMetrics = Record<string, AggregatedMetric>;

export class MonitoringService {
  private metrics: Metric[] = [];

  constructor() {}

  public recordMetric(metric: Metric): void {
    this.metrics.push({
      ...metric,
      timestamp:
        metric.timestamp instanceof Date
          ? metric.timestamp
          : new Date(metric.timestamp),
    });
  }

  public clearMetrics(): void {
    this.metrics = [];
  }

  public getMetrics(filter?: MetricFilter): Metric[] {
    let filteredMetrics = [...this.metrics];

    if (filter?.name) {
      filteredMetrics = filteredMetrics.filter((m) => m.name === filter.name);
    }

    if (filter?.tags) {
      filteredMetrics = filteredMetrics.filter((m) => {
        return Object.entries(filter.tags!).every(
          ([key, value]) => m.tags?.[key] === value
        );
      });
    }

    if (filter?.timestamp?.start) {
      filteredMetrics = filteredMetrics.filter(
        (m) => m.timestamp >= filter.timestamp!.start!
      );
    }

    if (filter?.timestamp?.end) {
      filteredMetrics = filteredMetrics.filter(
        (m) => m.timestamp <= filter.timestamp!.end!
      );
    }

    return filteredMetrics;
  }

  public aggregateMetrics(
    filter: MetricFilter,
    dimensions: string[]
  ): AggregatedMetrics {
    const metrics = this.getMetrics(filter);
    const aggregations: AggregatedMetrics = {};

    if (dimensions.length === 0) {
      return {};
    }

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

    return aggregations;
  }
}
