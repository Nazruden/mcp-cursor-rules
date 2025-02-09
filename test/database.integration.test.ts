import { DatabaseManager } from "../src/database/manager";
import { Rule } from "../src/types/rule";
import { beforeEach, afterEach, describe, expect, it } from "@jest/globals";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("DatabaseManager Integration Tests", () => {
  const TEST_DB_PATH = join(tmpdir(), "test-rules.db");
  let dbManager: DatabaseManager;

  const testRule: Rule = {
    id: "integration-test-rule",
    type: "typescript-style",
    description: "Integration test rule",
    tags: ["test", "integration"],
    priority: 1,
    content: "Test rule content",
  };

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    dbManager = new DatabaseManager(TEST_DB_PATH);
  });

  afterEach(() => {
    // Ensure database connection is closed
    if (dbManager) {
      (dbManager as any).db.close();
    }
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("persistence between server restarts", () => {
    it("should persist data after database connection is closed and reopened", async () => {
      // Create initial data
      await dbManager.createRule(testRule);

      // Close the connection (simulating server shutdown)
      (dbManager as any).db.close();

      // Create new connection (simulating server restart)
      dbManager = new DatabaseManager(TEST_DB_PATH);

      // Verify data persists
      const retrievedRule = await dbManager.getRule(testRule.id);
      expect(retrievedRule).toEqual(testRule);
    });

    it("should handle multiple server restarts while maintaining data integrity", async () => {
      // Initial data creation
      await dbManager.createRule(testRule);

      // First restart
      (dbManager as any).db.close();
      dbManager = new DatabaseManager(TEST_DB_PATH);

      // Modify data
      const updatedRule = {
        ...testRule,
        description: "Updated after first restart",
      };
      await dbManager.updateRule(updatedRule);

      // Second restart
      (dbManager as any).db.close();
      dbManager = new DatabaseManager(TEST_DB_PATH);

      // Verify data integrity
      const retrievedRule = await dbManager.getRule(testRule.id);
      expect(retrievedRule).toEqual(updatedRule);
    });

    it("should maintain data consistency with concurrent operations", async () => {
      // Create multiple database connections (simulating concurrent access)
      const dbManager2 = new DatabaseManager(TEST_DB_PATH);

      // Perform concurrent operations
      await Promise.all([
        dbManager.createRule(testRule),
        dbManager2.createRule({
          ...testRule,
          id: "concurrent-rule",
          description: "Concurrent test rule",
        }),
      ]);

      // Verify both operations succeeded
      const rules = await dbManager.listRules();
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toContain(testRule.id);
      expect(rules.map((r) => r.id)).toContain("concurrent-rule");

      // Close second connection
      (dbManager2 as any).db.close();
    });

    it("should handle large datasets efficiently", async () => {
      const startTime = Date.now();
      const BATCH_SIZE = 100;

      // Create multiple rules
      const promises = Array.from({ length: BATCH_SIZE }, (_, i) => ({
        ...testRule,
        id: `batch-rule-${i}`,
        description: `Batch rule ${i}`,
      })).map((rule) => dbManager.createRule(rule));

      await Promise.all(promises);

      // Simulate restart
      (dbManager as any).db.close();
      dbManager = new DatabaseManager(TEST_DB_PATH);

      // Verify all data persisted
      const rules = await dbManager.listRules();
      expect(rules).toHaveLength(BATCH_SIZE);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify performance meets requirements (sub-100ms per operation)
      expect(duration / BATCH_SIZE).toBeLessThan(100);
    });

    it("should handle edge cases with optional fields", async () => {
      const minimalRule: Rule = {
        id: "minimal-rule",
        type: "test",
        content: "Minimal content",
      };

      await dbManager.createRule(minimalRule);
      (dbManager as any).db.close();
      dbManager = new DatabaseManager(TEST_DB_PATH);

      const retrieved = await dbManager.getRule(minimalRule.id);
      expect(retrieved).toEqual(minimalRule);
    });

    it("should handle complex tag filtering after restart", async () => {
      const rules = [
        { ...testRule, id: "rule1", tags: ["typescript", "style"] },
        { ...testRule, id: "rule2", tags: ["typescript", "testing"] },
        { ...testRule, id: "rule3", tags: ["documentation"] },
      ];

      // Create rules
      await Promise.all(rules.map((rule) => dbManager.createRule(rule)));

      // Restart database
      (dbManager as any).db.close();
      dbManager = new DatabaseManager(TEST_DB_PATH);

      // Test different tag combinations
      const typescriptRules = await dbManager.listRules({
        tags: ["typescript"],
      });
      expect(typescriptRules).toHaveLength(2);

      const styleRules = await dbManager.listRules({ tags: ["style"] });
      expect(styleRules).toHaveLength(1);

      const docRules = await dbManager.listRules({ tags: ["documentation"] });
      expect(docRules).toHaveLength(1);
    });

    it("should handle error conditions gracefully", async () => {
      // Test duplicate rule creation
      await dbManager.createRule(testRule);
      await expect(dbManager.createRule(testRule)).rejects.toThrow();

      // Test updating non-existent rule
      const nonExistentRule = { ...testRule, id: "non-existent" };
      await expect(dbManager.updateRule(nonExistentRule)).rejects.toThrow();

      // Test deleting non-existent rule
      await expect(dbManager.deleteRule("non-existent")).rejects.toThrow();

      // Test invalid database operations after connection close
      (dbManager as any).db.close();
      await expect(dbManager.createRule(testRule)).rejects.toThrow();
    });
  });
});
