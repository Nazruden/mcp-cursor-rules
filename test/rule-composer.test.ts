import { RuleComposer } from "../src/services/rule-composer";
import { Rule } from "../src/types/rule";
import { describe, expect, it, beforeEach } from "@jest/globals";

describe("RuleComposer", () => {
  let ruleComposer: RuleComposer;

  beforeEach(() => {
    ruleComposer = new RuleComposer();
  });

  const mockRules: Rule[] = [
    {
      id: "rule-1",
      name: "Base Rule",
      type: "typescript-style",
      description: "Base TypeScript rule",
      tags: ["typescript", "style"],
      priority: 1,
      content: "base-content",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "rule-2",
      name: "Override Rule",
      type: "typescript-style",
      description: "Override TypeScript rule",
      tags: ["typescript", "style"],
      priority: 2,
      content: "override-content",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  describe("basic composition", () => {
    it("should compose multiple rules into a single rule", async () => {
      const composed = await ruleComposer.compose(mockRules);

      expect(composed).toBeDefined();
      expect(composed.type).toBe("typescript-style");
      expect(composed.tags).toEqual(
        expect.arrayContaining(["typescript", "style"])
      );
      expect(composed.content).toContain("base-content");
      expect(composed.content).toContain("override-content");
    });

    it("should handle empty rule array", async () => {
      await expect(ruleComposer.compose([])).rejects.toThrow(
        "No rules provided for composition"
      );
    });

    it("should handle single rule", async () => {
      const composed = await ruleComposer.compose([mockRules[0]]);
      expect(composed).toEqual({
        ...mockRules[0],
        id: expect.stringMatching(/^composed-rule-/),
        description: "Composed from 1 rule",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should handle rules without optional fields", async () => {
      const minimalRule: Rule = {
        id: "minimal-rule",
        name: "Minimal Rule",
        type: "minimal",
        description: "",
        tags: [],
        priority: 0,
        content: "minimal-content",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const composed = await ruleComposer.compose([minimalRule]);
      expect(composed.tags).toEqual([]);
      expect(composed.priority).toBe(0);
    });
  });

  describe("priority handling", () => {
    it("should apply rules in priority order (lower number = higher priority)", async () => {
      const highPriority: Rule = {
        ...mockRules[0],
        priority: 1,
        content: "high-priority-content",
      };

      const lowPriority: Rule = {
        ...mockRules[1],
        priority: 2,
        content: "low-priority-content",
      };

      const composed = await ruleComposer.compose([lowPriority, highPriority]);

      // High priority content should come after low priority in the final composition
      const contentIndex = composed.content.indexOf("high-priority-content");
      const lowPriorityIndex = composed.content.indexOf("low-priority-content");

      expect(contentIndex).toBeGreaterThan(lowPriorityIndex);
    });

    it("should handle rules with same priority", async () => {
      const rule1: Rule = {
        ...mockRules[0],
        priority: 1,
        content: "content-1",
      };

      const rule2: Rule = {
        ...mockRules[1],
        priority: 1,
        content: "content-2",
      };

      const composed = await ruleComposer.compose([rule1, rule2]);

      expect(composed.content).toContain("content-1");
      expect(composed.content).toContain("content-2");
    });

    it("should handle rules without explicit priority", async () => {
      const rule1: Rule = {
        ...mockRules[0],
        priority: 0,
        content: "content-1",
      };

      const rule2: Rule = {
        ...mockRules[1],
        priority: 0,
        content: "content-2",
      };

      const composed = await ruleComposer.compose([rule1, rule2]);
      expect(composed.priority).toBe(0);
    });
  });

  describe("conflict resolution", () => {
    it("should detect and resolve conflicting rules", async () => {
      const rule1: Rule = {
        ...mockRules[0],
        content: "conflicting-setting: value1",
      };

      const rule2: Rule = {
        ...mockRules[1],
        content: "conflicting-setting: value2",
      };

      const composed = await ruleComposer.compose([rule1, rule2]);

      // Should contain conflict resolution header
      expect(composed.content).toContain("# Conflict Resolution");
      // Should mention the conflicting rules
      expect(composed.content).toContain(rule1.id);
      expect(composed.content).toContain(rule2.id);
    });

    it("should handle circular dependencies", async () => {
      const rules = [
        { ...mockRules[0], content: "depends-on: rule-2" },
        { ...mockRules[1], content: "depends-on: rule-1" },
      ];

      await expect(ruleComposer.compose(rules)).rejects.toThrow(
        "Circular dependency detected"
      );
    });

    it("should handle malformed dependency declarations", async () => {
      const rules = [
        { ...mockRules[0], content: "depends-on:" },
        { ...mockRules[1], content: "depends-on: \n" },
      ];

      const composed = await ruleComposer.compose(rules);
      expect(composed).toBeDefined();
    });

    it("should handle malformed settings", async () => {
      const rules = [
        { ...mockRules[0], content: "setting1:\nsetting2" },
        { ...mockRules[1], content: "setting3: value3" },
      ];

      const composed = await ruleComposer.compose(rules);
      expect(composed).toBeDefined();
    });
  });

  describe("metadata handling", () => {
    it("should generate appropriate metadata for composed rule", async () => {
      const composed = await ruleComposer.compose(mockRules);

      expect(composed.id).toMatch(/composed-rule-[\w-]+/);
      expect(composed.description).toContain("Composed from");
      expect(composed.tags).toEqual(expect.arrayContaining(mockRules[0].tags));
      expect(composed.createdAt).toBeInstanceOf(Date);
      expect(composed.updatedAt).toBeInstanceOf(Date);
    });

    it("should combine unique tags from all rules", async () => {
      const rule1: Rule = {
        ...mockRules[0],
        tags: ["tag1", "common"],
      };

      const rule2: Rule = {
        ...mockRules[1],
        tags: ["tag2", "common"],
      };

      const composed = await ruleComposer.compose([rule1, rule2]);

      expect(composed.tags).toContain("tag1");
      expect(composed.tags).toContain("tag2");
      expect(composed.tags).toContain("common");
      // Should not duplicate common tags
      expect(
        composed.tags.filter((tag: string) => tag === "common")
      ).toHaveLength(1);
    });

    it("should handle rules with empty tags", async () => {
      const rule1: Rule = {
        ...mockRules[0],
        tags: [],
      };

      const rule2: Rule = {
        ...mockRules[1],
        tags: ["tag2"],
      };

      const composed = await ruleComposer.compose([rule1, rule2]);
      expect(composed.tags).toEqual(["tag2"]);
    });
  });

  describe("validation", () => {
    it("should validate rule structure before composition", async () => {
      const invalidRule = {
        id: "invalid-rule",
        name: "Invalid Rule",
        description: "Invalid rule for testing",
        tags: ["test"],
        priority: 1,
        content: "test content",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(ruleComposer.compose([invalidRule as Rule])).rejects.toThrow(
        "Invalid rule structure"
      );
    });

    it("should validate composed rule meets MCP specifications", async () => {
      const composed = await ruleComposer.compose(mockRules);

      expect(composed).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          type: expect.any(String),
          content: expect.any(String),
          tags: expect.any(Array),
          priority: expect.any(Number),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });

    it("should handle missing required fields", async () => {
      const invalidRules = [
        { ...mockRules[0], id: "" },
        { ...mockRules[0], type: "" },
        { ...mockRules[0], content: "" },
        { ...mockRules[0], name: "" },
      ];

      for (const rule of invalidRules) {
        await expect(ruleComposer.compose([rule])).rejects.toThrow(
          "Invalid rule structure"
        );
      }
    });
  });
});
