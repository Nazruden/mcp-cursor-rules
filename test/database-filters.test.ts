import { DatabaseManager } from "../src/database/manager";
import { Rule } from "../src/types/rule";
import { beforeEach, describe, expect, it } from "@jest/globals";

describe("DatabaseManager Advanced Filtering", () => {
  let dbManager: DatabaseManager;
  const TEST_DB_PATH = ":memory:";

  const testRules: Rule[] = [
    {
      id: "rule-1",
      name: "TypeScript Rule",
      type: "typescript-style",
      description: "A TypeScript style rule",
      tags: ["typescript", "style", "formatting"],
      priority: 1,
      content: "TypeScript rule content",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    },
    {
      id: "rule-2",
      name: "Documentation Rule",
      type: "documentation",
      description: "A documentation rule",
      tags: ["docs", "style"],
      priority: 2,
      content: "Documentation rule content",
      createdAt: new Date("2024-01-02"),
      updatedAt: new Date("2024-01-02"),
    },
    {
      id: "rule-3",
      name: "Testing Rule",
      type: "unit-testing",
      description: "A testing rule",
      tags: ["testing", "typescript"],
      priority: 1,
      content: "Testing rule content",
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
    },
  ];

  beforeEach(async () => {
    dbManager = new DatabaseManager(TEST_DB_PATH);
    // Initialize test data
    for (const rule of testRules) {
      await dbManager.createRule(rule);
    }
  });

  describe("database initialization", () => {
    it("should create tables with correct schema", () => {
      const tables = dbManager.listTables();
      expect(tables).toContain("rules");

      const schema = dbManager.getTableSchema("rules");
      expect(schema).toContain("id TEXT PRIMARY KEY");
      expect(schema).toContain("name TEXT NOT NULL");
      expect(schema).toContain("type TEXT NOT NULL");
      expect(schema).toContain("description TEXT");
      expect(schema).toContain("tags TEXT");
      expect(schema).toContain("priority INTEGER");
      expect(schema).toContain("content TEXT NOT NULL");
      expect(schema).toContain("createdAt TEXT");
      expect(schema).toContain("updatedAt TEXT");
    });

    it("should handle non-existent table schema", () => {
      const schema = dbManager.getTableSchema("non_existent");
      expect(schema).toBe("");
    });
  });

  describe("basic CRUD operations", () => {
    it("should create and retrieve a rule", async () => {
      const newRule: Rule = {
        id: "new-rule",
        name: "New Rule",
        type: "test",
        description: "Test rule",
        tags: ["test"],
        priority: 1,
        content: "Test content",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await dbManager.createRule(newRule);
      const retrieved = await dbManager.getRule(newRule.id);
      expect(retrieved).toEqual(newRule);
    });

    it("should update a rule", async () => {
      const updatedRule = {
        ...testRules[0],
        description: "Updated description",
        tags: ["updated"],
        priority: 3,
      };

      await dbManager.updateRule(updatedRule);
      const retrieved = await dbManager.getRule(updatedRule.id);
      expect(retrieved).toEqual(updatedRule);
    });

    it("should delete a rule", async () => {
      await dbManager.deleteRule(testRules[0].id);
      const retrieved = await dbManager.getRule(testRules[0].id);
      expect(retrieved).toBeNull();
    });

    it("should handle unknown rule ID", async () => {
      const retrieved = await dbManager.getRule("unknown");
      expect(retrieved).toBeNull();
    });

    it("should handle update of non-existent rule", async () => {
      const nonExistentRule = {
        ...testRules[0],
        id: "non-existent",
      };

      await expect(dbManager.updateRule(nonExistentRule)).rejects.toThrow(
        "not found"
      );
    });

    it("should handle delete of non-existent rule", async () => {
      await expect(dbManager.deleteRule("non-existent")).rejects.toThrow(
        "not found"
      );
    });
  });

  describe("tag filtering", () => {
    it("should filter rules by single tag", async () => {
      const rules = await dbManager.listRules({ tags: ["typescript"] });
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toContain("rule-1");
      expect(rules.map((r) => r.id)).toContain("rule-3");
    });

    it("should filter rules by multiple tags (AND condition)", async () => {
      const rules = await dbManager.listRules({
        tags: ["typescript", "style"],
      });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });

    it("should handle non-existent tags", async () => {
      const rules = await dbManager.listRules({ tags: ["non-existent"] });
      expect(rules).toHaveLength(0);
    });

    it("should handle case-insensitive tag matching", async () => {
      const rules = await dbManager.listRules({
        tags: ["TYPESCRIPT", "Style"],
      });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });

    it("should handle null tags in database", async () => {
      const ruleWithoutTags: Rule = {
        ...testRules[0],
        id: "no-tags",
        tags: [],
      };
      await dbManager.createRule(ruleWithoutTags);

      const rules = await dbManager.listRules({ tags: ["typescript"] });
      expect(rules).toHaveLength(2);
    });

    it("should handle malformed JSON in tags", async () => {
      // Directly insert malformed data
      const stmt = (dbManager as any).db.prepare(`
        INSERT INTO rules (id, name, type, description, tags, priority, content, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        "malformed-tags",
        "Test Rule",
        "test",
        "",
        "{malformed-json",
        0,
        "content",
        new Date().toISOString(),
        new Date().toISOString()
      );

      const rules = await dbManager.listRules({ tags: ["test"] });
      expect(rules).toBeDefined();
    });
  });

  describe("domain filtering", () => {
    it("should filter rules by type (domain)", async () => {
      const rules = await dbManager.listRules({ type: "typescript-style" });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });

    it("should handle multiple domains (OR condition)", async () => {
      const rules = await dbManager.listRules({
        types: ["typescript-style", "documentation"],
      });
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toContain("rule-1");
      expect(rules.map((r) => r.id)).toContain("rule-2");
    });

    it("should handle non-existent domains", async () => {
      const rules = await dbManager.listRules({ type: "non-existent" });
      expect(rules).toHaveLength(0);
    });

    it("should handle case-insensitive domain matching", async () => {
      const rules = await dbManager.listRules({ type: "TYPESCRIPT-STYLE" });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });
  });

  describe("priority filtering", () => {
    it("should filter rules by exact priority", async () => {
      const rules = await dbManager.listRules({ priority: 1 });
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toContain("rule-1");
      expect(rules.map((r) => r.id)).toContain("rule-3");
    });

    it("should filter rules by priority range", async () => {
      const rules = await dbManager.listRules({
        priorityRange: { min: 1, max: 1 },
      });
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toContain("rule-1");
      expect(rules.map((r) => r.id)).toContain("rule-3");
    });

    it("should handle priority less than", async () => {
      const rules = await dbManager.listRules({ priorityRange: { max: 1 } });
      expect(rules).toHaveLength(2);
    });

    it("should handle priority greater than", async () => {
      const rules = await dbManager.listRules({ priorityRange: { min: 2 } });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-2");
    });

    it("should handle null priority in database", async () => {
      const ruleWithoutPriority: Rule = {
        ...testRules[0],
        id: "no-priority",
        priority: 0,
      };
      await dbManager.createRule(ruleWithoutPriority);

      const rules = await dbManager.listRules({ priority: 0 });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("no-priority");
    });
  });

  describe("combined filtering", () => {
    it("should combine type and tag filters", async () => {
      const rules = await dbManager.listRules({
        type: "typescript-style",
        tags: ["style"],
      });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });

    it("should combine type and priority filters", async () => {
      const rules = await dbManager.listRules({
        type: "typescript-style",
        priority: 1,
      });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });

    it("should combine tag and priority filters", async () => {
      const rules = await dbManager.listRules({
        tags: ["typescript"],
        priority: 1,
      });
      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.id)).toContain("rule-1");
      expect(rules.map((r) => r.id)).toContain("rule-3");
    });

    it("should combine all filter types", async () => {
      const rules = await dbManager.listRules({
        type: "typescript-style",
        tags: ["style", "typescript"],
        priority: 1,
      });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("rule-1");
    });

    it("should handle no matching results with combined filters", async () => {
      const rules = await dbManager.listRules({
        type: "typescript-style",
        tags: ["docs"],
        priority: 1,
      });
      expect(rules).toHaveLength(0);
    });
  });

  describe("sorting and pagination", () => {
    it("should sort results by priority ascending", async () => {
      const rules = await dbManager.listRules({
        sortBy: { field: "priority", order: "asc" },
      });
      expect(rules).toHaveLength(3);
      expect(rules[0].priority).toBeLessThanOrEqual(rules[1].priority);
      expect(rules[1].priority).toBeLessThanOrEqual(rules[2].priority);
    });

    it("should sort results by priority descending", async () => {
      const rules = await dbManager.listRules({
        sortBy: { field: "priority", order: "desc" },
      });
      expect(rules).toHaveLength(3);
      expect(rules[0].priority).toBeGreaterThanOrEqual(rules[1].priority);
      expect(rules[1].priority).toBeGreaterThanOrEqual(rules[2].priority);
    });

    it("should sort by creation date", async () => {
      const rules = await dbManager.listRules({
        sortBy: { field: "createdAt", order: "desc" },
      });
      expect(rules).toHaveLength(3);
      expect(new Date(rules[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(rules[1].createdAt).getTime()
      );
    });

    it("should sort by update date", async () => {
      const rules = await dbManager.listRules({
        sortBy: { field: "updatedAt", order: "asc" },
      });
      expect(rules).toHaveLength(3);
      expect(new Date(rules[0].updatedAt).getTime()).toBeLessThanOrEqual(
        new Date(rules[1].updatedAt).getTime()
      );
    });

    it("should paginate results", async () => {
      const page1 = await dbManager.listRules({
        pagination: { page: 1, pageSize: 2 },
      });
      expect(page1).toHaveLength(2);

      const page2 = await dbManager.listRules({
        pagination: { page: 2, pageSize: 2 },
      });
      expect(page2).toHaveLength(1);

      const allIds = [...page1.map((r) => r.id), ...page2.map((r) => r.id)];
      expect(allIds).toHaveLength(3);
      expect([...new Set(allIds)]).toHaveLength(3); // All IDs should be unique
    });

    it("should handle empty pages", async () => {
      const emptyPage = await dbManager.listRules({
        pagination: { page: 3, pageSize: 2 },
      });
      expect(emptyPage).toHaveLength(0);
    });

    it("should handle invalid pagination parameters", async () => {
      const invalidPage = await dbManager.listRules({
        pagination: { page: 0, pageSize: 2 },
      });
      expect(invalidPage).toHaveLength(0);

      const invalidPageSize = await dbManager.listRules({
        pagination: { page: 1, pageSize: 0 },
      });
      expect(invalidPageSize).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("should handle database errors gracefully", async () => {
      const invalidRule: Rule = {
        ...testRules[0],
        id: "rule-1", // Duplicate ID should cause an error
      };
      await expect(dbManager.createRule(invalidRule)).rejects.toThrow(
        "Failed to create rule"
      );
    });

    it("should handle invalid SQL injection attempts", async () => {
      const rules = await dbManager.listRules({
        type: "'; DROP TABLE rules; --",
      });
      expect(rules).toHaveLength(0);

      // Verify table still exists
      const tables = dbManager.listTables();
      expect(tables).toContain("rules");
    });

    it("should handle malformed date strings", async () => {
      // Directly insert malformed data
      const stmt = (dbManager as any).db.prepare(`
        INSERT INTO rules (id, name, type, description, tags, priority, content, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        "malformed-dates",
        "Test Rule",
        "test",
        "",
        "[]",
        0,
        "content",
        "invalid-date",
        "invalid-date"
      );

      const rules = await dbManager.listRules();
      const malformedRule = rules.find((r) => r.id === "malformed-dates");
      expect(malformedRule).toBeDefined();
      expect(malformedRule?.createdAt).toBeInstanceOf(Date);
      expect(malformedRule?.updatedAt).toBeInstanceOf(Date);
    });
  });
});
