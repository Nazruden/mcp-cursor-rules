import { CacheManager } from "../src/services/cache-manager";
import { Rule } from "../src/types/rule";

describe("CacheManager", () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      ttl: 1000, // 1 second TTL for testing
      maxSize: 3, // Small size for testing eviction
    });
  });

  afterEach(() => {
    cacheManager.clear();
  });

  const mockRule: Rule = {
    id: "test-rule-1",
    name: "Test Rule",
    type: "test",
    description: "A test rule",
    tags: ["test"],
    priority: 1,
    content: "Test rule content",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("constructor validation", () => {
    it("should throw error for negative TTL", () => {
      expect(() => new CacheManager({ ttl: -1, maxSize: 1 })).toThrow(
        "TTL must be a positive number"
      );
    });

    it("should throw error for zero TTL", () => {
      expect(() => new CacheManager({ ttl: 0, maxSize: 1 })).toThrow(
        "TTL must be a positive number"
      );
    });

    it("should throw error for negative maxSize", () => {
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

  describe("basic operations", () => {
    it("should set and get a rule", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toEqual(mockRule);
    });

    it("should return null for non-existent rule", async () => {
      const cachedRule = await cacheManager.get("non-existent");
      expect(cachedRule).toBeNull();
    });

    it("should delete a rule", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      await cacheManager.delete(mockRule.id);
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toBeNull();
    });

    it("should handle deletion of non-existent rule", async () => {
      await cacheManager.delete("non-existent");
      expect(await cacheManager.getSize()).toBe(0);
    });
  });

  describe("TTL behavior", () => {
    it("should expire items after TTL", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait longer than TTL
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toBeNull();
    });

    it("should not expire items before TTL", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait less than TTL
      const cachedRule = await cacheManager.get(mockRule.id);
      expect(cachedRule).toEqual(mockRule);
    });
  });

  describe("size limits", () => {
    it("should respect max size limit and evict oldest items", async () => {
      // Fill the cache to its maximum
      for (let i = 0; i < 3; i++) {
        const rule = { ...mockRule, id: `test-rule-${i}` };
        await cacheManager.set(rule.id, rule);
      }
      expect(await cacheManager.getSize()).toBe(3);

      // Add one more item, should evict the oldest
      const newRule = { ...mockRule, id: "test-rule-new" };
      await cacheManager.set(newRule.id, newRule);

      expect(await cacheManager.getSize()).toBe(3);
      expect(await cacheManager.get("test-rule-0")).toBeNull(); // Oldest item should be evicted
      expect(await cacheManager.get("test-rule-new")).toEqual(newRule);
    });

    it("should handle empty cache edge case", async () => {
      const cacheSize = await cacheManager.getSize();
      expect(cacheSize).toBe(0);

      // Add and remove a rule to test edge case handling
      await cacheManager.set(mockRule.id, mockRule);
      await cacheManager.delete(mockRule.id);

      expect(await cacheManager.getSize()).toBe(0);
    });

    it("should handle empty iterator during eviction", async () => {
      // Create a cache with size 1 to force immediate eviction
      const tinyCache = new CacheManager({
        ttl: 1000,
        maxSize: 1,
      });

      // Test that setting an item works when cache is empty
      await tinyCache.set("first", mockRule);
      expect(await tinyCache.getSize()).toBe(1);
      expect(await tinyCache.get("first")).toEqual(mockRule);
    });

    it("should handle concurrent clear and set operations", async () => {
      // Create a cache with size 1
      const tinyCache = new CacheManager({
        ttl: 1000,
        maxSize: 1,
      });

      // Set up concurrent operations
      const setOperation = tinyCache.set("item", mockRule);
      const clearOperation = tinyCache.clear();

      // Wait for both operations to complete
      await Promise.all([setOperation, clearOperation]);

      // The final state should be consistent
      const size = await tinyCache.getSize();
      expect(size).toBeLessThanOrEqual(1);
    });

    it("should handle iterator returning undefined during eviction", async () => {
      // Create a cache with size 1
      const tinyCache = new CacheManager({
        ttl: 1000,
        maxSize: 1,
      });

      // Fill the cache and clear it while setting a new item
      await tinyCache.set("first", mockRule);
      const setPromise = tinyCache.set("second", mockRule);
      await tinyCache.delete("first"); // This will make the iterator return undefined

      await setPromise;
      expect(await tinyCache.getSize()).toBe(1);
      expect(await tinyCache.get("second")).toEqual(mockRule);
    });
  });

  describe("metrics", () => {
    it("should track cache hits and misses", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      await cacheManager.get(mockRule.id); // Hit
      await cacheManager.get("non-existent"); // Miss

      const metrics = await cacheManager.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
    });

    it("should track expired items as misses", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait longer than TTL
      await cacheManager.get(mockRule.id); // Should count as miss due to expiration

      const metrics = await cacheManager.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(1);
    });

    it("should reset metrics on clear", async () => {
      await cacheManager.set(mockRule.id, mockRule);
      await cacheManager.get(mockRule.id); // Hit
      await cacheManager.clear();

      const metrics = await cacheManager.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });

  describe("concurrent operations", () => {
    let largeCacheManager: CacheManager;

    beforeEach(() => {
      largeCacheManager = new CacheManager({
        ttl: 1000,
        maxSize: 200, // Larger size for concurrent operations
      });
    });

    afterEach(() => {
      largeCacheManager.clear();
    });

    it("should handle concurrent access safely", async () => {
      const operations = Array.from({ length: 100 }, async (_, i) => {
        const rule = { ...mockRule, id: `concurrent-rule-${i}` };
        await largeCacheManager.set(rule.id, rule);
        return largeCacheManager.get(rule.id);
      });

      const results = await Promise.all(operations);
      expect(results.filter(Boolean).length).toBe(100);
    });
  });
});
