export interface MetricFilter {
  name?: string;
  tags?: Record<string, string>;
  timestamp?: {
    start?: Date;
    end?: Date;
  };
}
