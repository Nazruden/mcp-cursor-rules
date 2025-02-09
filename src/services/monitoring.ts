/**
 * Interfaces for the monitoring service
 */
export interface Metric {
  name: string;
  value: number;
  timestamp: Date | string;
  tags?: Record<string, string>;
}

export interface MetricFilter {
  name?: string;
  tags?: Record<string, string>;
}

export interface MetricStats {
  min: number;
  max: number;
  avg: number;
  count: number;
  sum: number;
}

export type AggregatedMetrics = Record<string, MetricStats>;

/**
 * Service for collecting and analyzing performance metrics
 */
export class MonitoringService {
  private metrics: Metric[] = [];

  /**
   * Records a new metric
   * @param metric The metric to record
   */
  public recordMetric(metric: Metric): void {
    this.metrics.push({
      ...metric,
      timestamp:
        metric.timestamp instanceof Date
          ? metric.timestamp
          : new Date(metric.timestamp),
    });
  }

  /**
   * Retrieves metrics based on optional filters
   * @param filter Optional filters to apply
   * @returns Filtered metrics
   */
  public getMetrics(filter?: MetricFilter): Metric[] {
    return this.metrics.filter((metric) => {
      if (filter?.name && metric.name !== filter.name) {
        return false;
      }

      if (filter?.tags) {
        return Object.entries(filter.tags).every(
          ([key, value]) => metric.tags?.[key] === value
        );
      }

      return true;
    });
  }

  /**
   * Aggregates metrics by specified dimensions
   * @param groupBy Dimensions to group by
   * @returns Aggregated metrics
   */
  public aggregateMetrics(groupBy: string[]): AggregatedMetrics {
    const groups = new Map<string, number[]>();

    this.metrics.forEach((metric) => {
      if (!metric.tags) return;

      const key = groupBy
        .map((dim) => metric.tags?.[dim])
        .filter(Boolean)
        .join("|");

      if (!key) return;

      const values = groups.get(key) || [];
      values.push(metric.value);
      groups.set(key, values);
    });

    const result: AggregatedMetrics = {};

    groups.forEach((values, key) => {
      const sum = values.reduce((a, b) => a + b, 0);
      result[key] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
        count: values.length,
        sum,
      };
    });

    return result;
  }
}
