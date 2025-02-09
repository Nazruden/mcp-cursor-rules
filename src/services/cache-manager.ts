import { Rule } from "../types/rule";

interface CacheConfig {
  ttl: number;
  maxSize: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
}

interface CacheEntry {
  value: Rule;
  expiresAt: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry>;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private operationLock: Promise<void>;

  constructor(config: CacheConfig) {
    if (config.ttl <= 0) {
      throw new Error("TTL must be a positive number");
    }
    if (config.maxSize <= 0) {
      throw new Error("maxSize must be a positive number");
    }

    this.cache = new Map();
    this.config = config;
    this.metrics = {
      hits: 0,
      misses: 0,
    };
    this.operationLock = Promise.resolve();
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

  async set(key: string, value: Rule): Promise<void> {
    await this.withLock(async () => {
      // Ensure we don't exceed maxSize by removing oldest entries if necessary
      while (this.cache.size >= this.config.maxSize) {
        const iterator = this.cache.keys();
        const firstKey = iterator.next().value;
        if (!firstKey) break; // Handle the case where the iterator is empty
        this.cache.delete(firstKey);
      }

      this.cache.set(key, {
        value,
        expiresAt: Date.now() + this.config.ttl,
      });
    });
  }

  async get(key: string): Promise<Rule | null> {
    return this.withLock(async () => {
      const entry = this.cache.get(key);

      if (!entry) {
        this.metrics.misses++;
        return null;
      }

      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        this.metrics.misses++;
        return null;
      }

      this.metrics.hits++;
      return entry.value;
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
