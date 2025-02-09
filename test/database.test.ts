import { Database } from "better-sqlite3";
import { DatabaseManager } from "../src/database/manager";
import { Rule } from "../src/types/rule";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { unlinkSync } from "fs";

describe("DatabaseManager", () => {
  let dbManager: DatabaseManager;
  const TEST_DB_PATH = ":memory:"; // Use in-memory database for tests

  beforeEach(() => {
    dbManager = new DatabaseManager(TEST_DB_PATH);
  });

  describe("initialization", () => {
    it("should create required tables on initialization", () => {
      const tables = dbManager.listTables();
      expect(tables).toContain("rules");
    });

    it("should have correct schema for rules table", () => {
      const schema = dbManager.getTableSchema("rules");
      expect(schema).toContain("id TEXT PRIMARY KEY");
      expect(schema).toContain("type TEXT NOT NULL");
      expect(schema).toContain("description TEXT");
      expect(schema).toContain("tags TEXT");
      expect(schema).toContain("priority INTEGER");
      expect(schema).toContain("content TEXT NOT NULL");
    });
  });

  describe("CRUD operations", () => {
    const testRule: Rule = {
      id: "test-rule-1",
      name: "Test Rule",
      type: "typescript-style",
      description: "Test rule for TypeScript",
      tags: ["typescript", "style"],
      priority: 1,
      content: "Test rule content",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should create a new rule", async () => {
      const created = await dbManager.createRule(testRule);
      expect(created).toEqual(testRule);
    });

    it("should read a rule by id", async () => {
      await dbManager.createRule(testRule);
      const retrieved = await dbManager.getRule(testRule.id);
      expect(retrieved).toEqual(testRule);
    });

    it("should update an existing rule", async () => {
      await dbManager.createRule(testRule);
      const updatedRule = { ...testRule, description: "Updated description" };
      const updated = await dbManager.updateRule(updatedRule);
      expect(updated).toEqual(updatedRule);
    });

    it("should delete a rule", async () => {
      await dbManager.createRule(testRule);
      await dbManager.deleteRule(testRule.id);
      const retrieved = await dbManager.getRule(testRule.id);
      expect(retrieved).toBeNull();
    });

    it("should list all rules", async () => {
      await dbManager.createRule(testRule);
      const rules = await dbManager.listRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(testRule);
    });

    it("should filter rules by type", async () => {
      await dbManager.createRule(testRule);
      const rules = await dbManager.listRules({ type: "typescript-style" });
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(testRule);
    });

    it("should filter rules by tags", async () => {
      await dbManager.createRule(testRule);
      const rules = await dbManager.listRules({ tags: ["typescript"] });
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(testRule);
    });
  });

  describe("error handling", () => {
    const testRule: Rule = {
      id: "test-rule-1",
      name: "Test Rule",
      type: "typescript-style",
      description: "Test rule for TypeScript",
      tags: ["typescript", "style"],
      priority: 1,
      content: "Test rule content",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should throw error when creating rule with duplicate id", async () => {
      await dbManager.createRule(testRule);
      await expect(dbManager.createRule(testRule)).rejects.toThrow();
    });

    it("should throw error when updating non-existent rule", async () => {
      await expect(dbManager.updateRule(testRule)).rejects.toThrow();
    });

    it("should throw error when deleting non-existent rule", async () => {
      await expect(dbManager.deleteRule("non-existent")).rejects.toThrow();
    });
  });
});
