import {
  CacheManager,
  WarmingStrategy,
  EvictionPolicy,
} from "../../src/services/cache-manager";
import { Rule } from "../../src/types/rule";

describe("CacheManager", () => {
  let cacheManager: CacheManager;

  // Increase the default timeout for all tests
  jest.setTimeout(30000);

  beforeEach(() => {
    cacheManager = new CacheManager({
      ttl: 1000,
      maxSize: 3,
      compressionThreshold: 100,
      warmingStrategy: WarmingStrategy.USAGE_BASED,
      evictionPolicy: EvictionPolicy.HYBRID,
    });
  });

  afterEach(() => {
    cacheManager.clear();
  });

  const createMockRule = (id: string, content: string = "test"): Rule => ({
    id,
    name: id,
    type: "test",
    description: "Test rule",
    tags: ["test"],
    content,
    priority: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe("Configuration", () => {
    it("should throw error for invalid TTL", () => {
      expect(() => new CacheManager({ ttl: -1, maxSize: 1 })).toThrow(
        "TTL must be a positive number"
      );
    });

    it("should throw error for zero TTL", () => {
      expect(() => new CacheManager({ ttl: 0, maxSize: 1 })).toThrow(
        "TTL must be a positive number"
      );
    });

    it("should throw error for invalid maxSize", () => {
      expect(() => new CacheManager({ ttl: 1000, maxSize: -1 })).toThrow(
        "maxSize must be a positive number"
      );
    });

    it("should throw error for zero maxSize", () => {
      expect(() => new CacheManager({ ttl: 1000, maxSize: 0 })).toThrow(
        "maxSize must be a positive number"
      );
    });
  });

  describe("Basic Operations", () => {
    it("should store and retrieve a rule", async () => {
      const mockRule = createMockRule("test-rule");
      await cacheManager.set(mockRule.id, mockRule);
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toEqual(mockRule);
    });

    it("should return null for non-existent rule", async () => {
      const cachedRule = await cacheManager.get("non-existent");
      expect(cachedRule).toBeNull();
    });

    it("should delete a rule", async () => {
      const mockRule = createMockRule("test-rule");
      await cacheManager.set(mockRule.id, mockRule);
      await cacheManager.delete(mockRule.id);
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toBeNull();
    });

    it("should handle deleting non-existent rule", async () => {
      await cacheManager.delete("non-existent");
      expect(await cacheManager.getSize()).toBe(0);
    });
  });

  describe("Cache Expiration", () => {
    it("should expire rules after TTL", async () => {
      const mockRule = createMockRule("test-rule");
      await cacheManager.set(mockRule.id, mockRule);
      await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait for TTL
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toBeNull();
    });

    it("should not expire rules before TTL", async () => {
      const mockRule = createMockRule("test-rule");
      await cacheManager.set(mockRule.id, mockRule);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait less than TTL
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toEqual(mockRule);
    });
  });

  describe("Cache Size Management", () => {
    it("should evict items when cache is full", async () => {
      // Fill the cache to its maximum
      for (let i = 0; i < 3; i++) {
        const rule = createMockRule(`test-rule-${i}`);
        await cacheManager.set(rule.id, rule);
      }
      expect(await cacheManager.getSize()).toBe(3);

      // Add one more item
      const newRule = createMockRule("test-rule-new");
      await cacheManager.set(newRule.id, newRule);

      expect(await cacheManager.getSize()).toBe(3);
      expect(await cacheManager.get("test-rule-0")).toBeNull(); // Oldest item should be evicted
      expect(await cacheManager.get("test-rule-new")).toEqual(newRule);
    });
  });

  describe("Cache Compression", () => {
    it("should compress large rules", async () => {
      const largeContent = "x".repeat(200); // Larger than compressionThreshold
      const mockRule = createMockRule("test-rule", largeContent);
      await cacheManager.set(mockRule.id, mockRule);
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toEqual(mockRule);

      const metrics = await cacheManager.getMetrics();
      expect(metrics.compressionRatio).toBeLessThan(1); // Compressed size should be smaller
    });

    it("should not compress small rules", async () => {
      const smallContent = "x".repeat(50); // Smaller than compressionThreshold
      const mockRule = createMockRule("test-rule", smallContent);
      await cacheManager.set(mockRule.id, mockRule);
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toEqual(mockRule);

      // For uncompressed rules, we don't update the compression ratio
      const metrics = await cacheManager.getMetrics();
      expect(metrics.compressionRatio).toBe(0); // No compression metrics
    });
  });

  describe("Cache Warming", () => {
    let warmingCache: CacheManager;

    beforeEach(() => {
      warmingCache = new CacheManager({
        ttl: 200, // Short TTL for testing
        maxSize: 3,
        compressionThreshold: 100,
        warmingStrategy: WarmingStrategy.USAGE_BASED,
        evictionPolicy: EvictionPolicy.HYBRID,
      });
    });

    afterEach(async () => {
      await warmingCache.clear();
    });

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    it("should warm cache based on usage", async () => {
      // Add some rules with different access patterns
      const rules = [
        { id: "test-rule-0", accesses: 3 },
        { id: "test-rule-1", accesses: 2 },
        { id: "test-rule-2", accesses: 0 },
      ];

      // Add rules and simulate access patterns
      for (const rule of rules) {
        await warmingCache.set(rule.id, createMockRule(rule.id));
        for (let i = 0; i < rule.accesses; i++) {
          await warmingCache.get(rule.id);
        }
      }

      // Wait for a bit to simulate aging
      await sleep(50);

      // Warm the cache
      await warmingCache.warm();

      // Verify cache state
      const results = await Promise.all(
        rules.map((rule) => warmingCache.get(rule.id))
      );

      // Most frequently accessed items should be kept
      expect(results[0]).not.toBeNull(); // 3 accesses
      expect(results[1]).not.toBeNull(); // 2 accesses
      // Least accessed item should be removed
      expect(results[2]).toBeNull(); // 0 accesses
    });
  });

  describe("Cache Preloading", () => {
    it("should handle preloading patterns", async () => {
      const patterns = ["test-*", "prod-*"];
      await cacheManager.preload(patterns);
      // Since preload is a placeholder, we just verify it doesn't throw
      expect(await cacheManager.getSize()).toBe(0);
    });
  });

  describe("Priority-based Eviction", () => {
    it("should respect priorities during eviction", async () => {
      // Add high-priority item
      const highPriorityRule = createMockRule("high-priority");
      await cacheManager.set(highPriorityRule.id, highPriorityRule, 10);

      // Fill cache with lower priority items
      for (let i = 0; i < 3; i++) {
        const rule = createMockRule(`test-rule-${i}`);
        await cacheManager.set(rule.id, rule, 1);
      }

      // Verify cache state
      const results = await Promise.all([
        cacheManager.get("high-priority"),
        cacheManager.get("test-rule-0"),
        cacheManager.get("test-rule-1"),
        cacheManager.get("test-rule-2"),
      ]);

      // High priority item should still be in cache
      expect(results[0]).toEqual(highPriorityRule);

      // At least one low priority item should have been evicted
      const lowPriorityItems = results.slice(1).filter((item) => item !== null);
      expect(lowPriorityItems.length).toBeLessThan(3);
    });
  });

  describe("Metrics", () => {
    it("should track cache hits and misses", async () => {
      const mockRule = createMockRule("test-rule");
      await cacheManager.set(mockRule.id, mockRule);
      await cacheManager.get(mockRule.id); // Hit
      await cacheManager.get("non-existent"); // Miss

      const metrics = await cacheManager.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
    });

    it("should track compression ratio", async () => {
      const largeContent = "x".repeat(200);
      const mockRule = createMockRule("test-rule", largeContent);
      await cacheManager.set(mockRule.id, mockRule);

      const metrics = await cacheManager.getMetrics();
      expect(metrics.compressionRatio).toBeLessThan(1);
    });
  });
});
