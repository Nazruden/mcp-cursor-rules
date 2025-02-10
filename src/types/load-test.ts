export interface LoadScenario {
  name: string;
  duration: number;
  concurrency: number;
  endpoint: string;
  method: string;
  payload?: unknown;
}

export interface LoadMetrics {
  latency: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p99: number;
  };
  throughput: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
  };
  concurrentRequests: {
    avg: number;
    max: number;
  };
  errors: number;
}

export interface LoadTestResult {
  scenario: LoadScenario;
  metrics: LoadMetrics;
  timestamp: Date;
}

export interface BaselineComparison {
  meetsBaseline: boolean;
  metrics: {
    latency: {
      avgDiff: number;
      p99Diff: number;
    };
    throughputDiff: number;
    errorDiff: number;
  };
}

export interface ChartData {
  labels: string[];
  data: number[];
}

export interface ErrorRateChart {
  value: number;
}

export interface LoadTestReport {
  summary: {
    scenario: LoadScenario;
    metrics: LoadMetrics;
    baselineComparison?: BaselineComparison;
  };
  charts: {
    latencyDistribution: ChartData;
    throughputOverTime: ChartData;
    errorRate: ErrorRateChart;
  };
  recommendations: string[];
}
