import { Rule } from "../types/rule";
import { deflate, inflate } from "zlib";
import { promisify } from "util";

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

interface CacheConfig {
  ttl: number;
  maxSize: number;
  compressionThreshold?: number; // in bytes
  preloadPatterns?: string[];
  warmingStrategy?: WarmingStrategy;
  evictionPolicy?: EvictionPolicy;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  compressionRatio: number;
  warmingEfficiency: number;
}

interface CacheEntry {
  value: Rule | Buffer;
  expiresAt: number;
  priority: number;
  accessCount: number;
  lastAccessed: number;
  compressed: boolean;
  size: number;
}

export enum WarmingStrategy {
  PREDICTIVE = "predictive",
  USAGE_BASED = "usage_based",
  PRIORITY = "priority",
}

export enum EvictionPolicy {
  LRU = "lru",
  LFU = "lfu",
  PRIORITY = "priority",
  HYBRID = "hybrid",
}

export class CacheManager {
  private cache: Map<string, CacheEntry>;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private operationLock: Promise<void>;
  private warmingInProgress: boolean;
  private currentSize: number = 0;
  private compressionRatio: number = 1;

  constructor(config: CacheConfig) {
    if (config.ttl <= 0) {
      throw new Error("TTL must be a positive number");
    }
    if (config.maxSize <= 0) {
      throw new Error("maxSize must be a positive number");
    }

    this.cache = new Map();
    this.config = {
      ...config,
      compressionThreshold: config.compressionThreshold || 1024, // 1KB default
      warmingStrategy: config.warmingStrategy || WarmingStrategy.USAGE_BASED,
      evictionPolicy: config.evictionPolicy || EvictionPolicy.HYBRID,
    };
    this.metrics = {
      hits: 0,
      misses: 0,
      compressionRatio: 0,
      warmingEfficiency: 0,
    };
    this.operationLock = Promise.resolve();
    this.warmingInProgress = false;
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const currentLock = this.operationLock;
    let resolveLock: () => void;
    this.operationLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    try {
      await currentLock;
      return await operation();
    } finally {
      resolveLock!();
    }
  }

  private async compressValue(value: Rule): Promise<Buffer> {
    const data = JSON.stringify(value, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
    return deflateAsync(Buffer.from(data));
  }

  private async decompressValue(compressed: Buffer): Promise<Rule> {
    const data = await inflateAsync(compressed);
    const parsed = JSON.parse(data.toString());
    // Convert date strings back to Date objects
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);
    return parsed;
  }

  private calculatePriority(entry: CacheEntry): number {
    const age = Date.now() - entry.lastAccessed;
    const frequency = entry.accessCount;
    const normalizedAge = Math.max(1, age / 1000); // Convert to seconds
    return (frequency / normalizedAge) * entry.priority;
  }

  private calculateCompressionRatio(): number {
    const entries = Array.from(this.cache.values());
    if (entries.length === 0) return 0;

    const compressedEntries = entries.filter((entry) => entry.compressed);
    if (compressedEntries.length === 0) return 0;

    const compressedSize = compressedEntries.reduce(
      (sum, entry) => sum + entry.size,
      0
    );
    const originalSize = compressedEntries.reduce((sum, entry) => {
      if (entry.compressed) {
        return sum + Buffer.from(JSON.stringify(entry.value)).length;
      }
      return sum + entry.size;
    }, 0);

    return compressedSize / originalSize;
  }

  private async evictEntries(spaceNeeded: number): Promise<void> {
    while (this.cache.size > this.config.maxSize || spaceNeeded > 0) {
      let lowestPriorityKey: string | null = null;
      let lowestPriority = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        const priority = this.calculatePriority(entry);
        if (priority < lowestPriority) {
          lowestPriority = priority;
          lowestPriorityKey = key;
        }
      }

      if (!lowestPriorityKey) break;

      const entry = this.cache.get(lowestPriorityKey)!;
      this.cache.delete(lowestPriorityKey);
      spaceNeeded -= entry.size;
    }
  }

  async preload(patterns: string[]): Promise<void> {
    // Note: This is a placeholder for the actual preload implementation
    // In a real implementation, this would fetch rules matching the patterns
    // from the persistent storage
    await this.withLock(async () => {
      for (const pattern of patterns) {
        // Simulate preloading rules matching the pattern
        console.log(`Preloading rules matching pattern: ${pattern}`);
      }
    });
  }

  /**
   * Retrieves a value from the cache
   */
  public async get(key: string): Promise<CacheEntry["value"] | null> {
    return this.withLock(async () => {
      const entry = this.cache.get(key);
      if (!entry) {
        this.metrics.misses++;
        return null;
      }

      // Check if entry has expired
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        this.metrics.misses++;
        return null;
      }

      // Update access count and last accessed time
      entry.accessCount = (entry.accessCount || 0) + 1;
      entry.lastAccessed = Date.now();
      this.cache.set(key, entry);

      this.metrics.hits++;

      // Decompress if necessary
      if (entry.compressed) {
        return this.decompressValue(entry.value as Buffer);
      }

      return entry.value;
    });
  }

  /**
   * Warms the cache by keeping frequently accessed items and removing others
   */
  public async warm(): Promise<void> {
    if (
      this.warmingInProgress ||
      this.config.warmingStrategy !== WarmingStrategy.USAGE_BASED
    ) {
      return;
    }

    await this.withLock(async () => {
      this.warmingInProgress = true;
      try {
        // Get all entries and their access counts
        const entries = Array.from(this.cache.entries());
        if (entries.length === 0) {
          return;
        }

        // Filter non-expired entries and calculate scores
        const scoredEntries = entries
          .filter(([_, entry]) => Date.now() <= entry.expiresAt)
          .map(([key, entry]) => ({
            key,
            entry,
            score: (entry.accessCount || 0) * (entry.priority || 1),
          }))
          .filter(({ score }) => score > 0); // Only keep entries that have been accessed

        if (scoredEntries.length === 0) {
          return;
        }

        // Sort by score descending
        scoredEntries.sort((a, b) => b.score - a.score);

        // Keep top 20% of non-expired entries, but at least 2 entries if they have non-zero scores
        const minKeepCount = Math.min(2, scoredEntries.length);
        const keepCount = Math.max(
          minKeepCount,
          Math.ceil(scoredEntries.length * 0.2)
        );
        const entriesToKeep = scoredEntries.slice(0, keepCount);

        // Clear the cache
        this.cache.clear();

        // Re-add kept entries with refreshed TTL and reset access counts
        for (const { key, entry } of entriesToKeep) {
          const newEntry = {
            ...entry,
            expiresAt: Date.now() + this.config.ttl,
            accessCount: 1, // Reset access count but keep it non-zero
            lastAccessed: Date.now(),
          };
          this.cache.set(key, newEntry);
        }

        // Update metrics
        this.updateMetrics();
      } finally {
        this.warmingInProgress = false;
      }
    });
  }

  /**
   * Updates cache metrics including size and compression ratio
   */
  private updateMetrics(): void {
    this.currentSize = Array.from(this.cache.values()).reduce(
      (total, entry) => total + (entry.size || 0),
      0
    );

    // Calculate compression ratio based on whether entries are compressed
    const entries = Array.from(this.cache.values());
    const compressedEntries = entries.filter((entry) => entry.compressed);
    const compressionRatio = compressedEntries.length / entries.length;

    this.compressionRatio = entries.length > 0 ? compressionRatio : 1;
  }

  async set(key: string, value: Rule, priority: number = 1): Promise<void> {
    await this.withLock(async () => {
      const size = Buffer.from(JSON.stringify(value)).length;
      let compressed = false;
      let finalValue: Rule | Buffer = value;

      if (size > this.config.compressionThreshold!) {
        finalValue = await this.compressValue(value);
        compressed = true;
        this.metrics.compressionRatio = this.calculateCompressionRatio();
      }

      // If we're at maxSize, try to evict a lower priority item
      if (this.cache.size >= this.config.maxSize) {
        // Calculate priorities for all entries
        const entries = Array.from(this.cache.entries()).map(
          ([key, entry]) => ({
            key,
            priority: this.calculatePriority(entry),
            basePriority: entry.priority,
          })
        );

        // Sort by base priority first, then by calculated priority
        entries.sort((a, b) => {
          if (a.basePriority !== b.basePriority) {
            return a.basePriority - b.basePriority;
          }
          return a.priority - b.priority;
        });

        // If the new item has higher priority than any existing item
        const lowestPriorityEntry = entries[0];
        if (
          lowestPriorityEntry &&
          priority >= lowestPriorityEntry.basePriority
        ) {
          this.cache.delete(lowestPriorityEntry.key);
        } else if (entries.length > 1) {
          // If we can't evict the lowest priority item, try the next one
          this.cache.delete(entries[1].key);
        } else {
          // If we can't evict anything, don't add the new item
          return;
        }
      }

      this.cache.set(key, {
        value: finalValue,
        expiresAt: Date.now() + this.config.ttl,
        priority,
        accessCount: 0,
        lastAccessed: Date.now(),
        compressed,
        size: compressed ? (finalValue as Buffer).length : size,
      });
    });
  }

  async delete(key: string): Promise<void> {
    await this.withLock(async () => {
      this.cache.delete(key);
    });
  }

  async clear(): Promise<void> {
    await this.withLock(async () => {
      this.cache.clear();
      this.metrics = {
        hits: 0,
        misses: 0,
        compressionRatio: 0,
        warmingEfficiency: 0,
      };
    });
  }

  async getSize(): Promise<number> {
    return this.withLock(async () => this.cache.size);
  }

  async getMetrics(): Promise<CacheMetrics> {
    return this.withLock(async () => ({ ...this.metrics }));
  }
}
