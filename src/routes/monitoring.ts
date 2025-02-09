import { Router, Request, Response, RequestHandler } from "express";
import { MonitoringService, Metric } from "../services/monitoring-service";
import { MetricFilter } from "../types/metric";
import { PerformanceLogger, LogLevel } from "../services/performance-logger";
import * as os from "os";

const router = Router();
const monitoringService = new MonitoringService();
const performanceLogger = new PerformanceLogger({ logDir: "./logs" });

/**
 * Parse tags from query string
 * @param tagsStr Tags string in format "key1:value1,key2:value2"
 */
const parseTags = (tagsQuery: string | undefined): Record<string, string> => {
  if (!tagsQuery) return {};
  try {
    return JSON.parse(tagsQuery);
  } catch (err) {
    throw new Error("Invalid tags format");
  }
};

/**
 * Get system metrics
 */
const getSystemMetrics = () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;

  const cpuUsage = os.loadavg()[0]; // 1 minute load average

  return {
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      usagePercentage: memoryUsage,
    },
    cpu: {
      loadAverage: cpuUsage,
    },
  };
};

// Get metrics with optional filtering
const getMetrics: RequestHandler = (req: Request, res: Response) => {
  try {
    const name = req.query.name as string | undefined;
    const tags = parseTags(req.query.tags as string);

    const filter: MetricFilter = {
      name,
      tags,
    };

    const metrics = monitoringService.getMetrics(filter);
    res.json(metrics);
  } catch (err) {
    performanceLogger.log(LogLevel.ERROR, "Error retrieving metrics", {
      name: "metrics_error",
      value: 1,
      timestamp: new Date(),
      tags: { error: (err as Error).message },
    });
    res.status(500).json({ error: "Failed to retrieve metrics" });
  }
};

// Aggregate metrics by dimensions
const aggregateMetrics: RequestHandler = (req: Request, res: Response) => {
  try {
    const dimensions = ((req.query.dimensions as string) || "")
      .split(",")
      .filter(Boolean);
    const name = req.query.name as string | undefined;
    const tags = parseTags(req.query.tags as string);

    const filter: MetricFilter = {
      name,
      tags,
    };

    const aggregatedMetrics = monitoringService.aggregateMetrics(
      filter,
      dimensions
    );
    res.json(aggregatedMetrics);
  } catch (err) {
    performanceLogger.log(LogLevel.ERROR, "Error aggregating metrics", {
      name: "aggregation_error",
      value: 1,
      timestamp: new Date(),
      tags: { error: (err as Error).message },
    });
    res.status(500).json({ error: "Failed to aggregate metrics" });
  }
};

// Health check endpoint
const healthCheck: RequestHandler = (_req: Request, res: Response) => {
  try {
    const systemMetrics = getSystemMetrics();
    const status = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      metrics: systemMetrics,
    };

    res.json(status);
  } catch (err) {
    performanceLogger.log(LogLevel.ERROR, "Error checking health status", {
      name: "health_check_error",
      value: 1,
      timestamp: new Date(),
      tags: { error: (err as Error).message },
    });
    res.status(500).json({ error: "Health check failed" });
  }
};

// Detailed performance status
const performanceStatus: RequestHandler = (_req: Request, res: Response) => {
  try {
    const systemMetrics = getSystemMetrics();
    const recentMetrics = monitoringService.getMetrics({
      timestamp: {
        start: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
      },
    });

    const status = {
      system: systemMetrics,
      metrics: recentMetrics,
      timestamp: new Date().toISOString(),
    };

    res.json(status);
  } catch (err) {
    performanceLogger.log(
      LogLevel.ERROR,
      "Error retrieving performance status",
      {
        name: "status_error",
        value: 1,
        timestamp: new Date(),
        tags: { error: (err as Error).message },
      }
    );
    res.status(500).json({ error: "Failed to retrieve performance status" });
  }
};

router.get("/metrics", getMetrics);
router.get("/metrics/aggregate", aggregateMetrics);
router.get("/health", healthCheck);
router.get("/status", performanceStatus);

export default router;
