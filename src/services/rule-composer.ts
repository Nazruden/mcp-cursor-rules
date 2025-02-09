import { Rule } from "../types/rule";
import { v4 as uuidv4 } from "uuid";

export class RuleComposer {
  /**
   * Composes multiple rules into a single rule, handling priorities, conflicts, and metadata
   * @param rules Array of rules to compose
   * @returns Composed rule
   * @throws Error if no rules provided or invalid rule structure
   */
  async compose(rules: Rule[]): Promise<Rule> {
    // Validate input
    if (!rules.length) {
      throw new Error("No rules provided for composition");
    }

    // Validate rule structure
    this.validateRules(rules);

    // Handle single rule case
    if (rules.length === 1) {
      return {
        ...rules[0],
        id: `composed-rule-${uuidv4()}`,
        description: `Composed from 1 rule`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Check for circular dependencies
    this.checkCircularDependencies(rules);

    // Sort rules by priority (lower number = higher priority)
    const sortedRules = [...rules].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    // Detect and collect conflicts
    const conflicts = this.detectConflicts(sortedRules);

    // Compose content with conflict resolution
    const composedContent = this.composeContent(sortedRules, conflicts);

    // Create and return the composed rule
    return this.createComposedRule(sortedRules, composedContent, conflicts);
  }

  /**
   * Validates the structure of each rule
   * @param rules Rules to validate
   * @throws Error if any rule is invalid
   */
  private validateRules(rules: Rule[]): void {
    for (const rule of rules) {
      if (!rule.id || !rule.type || !rule.content || !rule.name) {
        throw new Error("Invalid rule structure");
      }
    }
  }

  /**
   * Checks for circular dependencies between rules
   * @param rules Rules to check
   * @throws Error if circular dependency detected
   */
  private checkCircularDependencies(rules: Rule[]): void {
    const dependencyGraph = new Map<string, Set<string>>();

    // Build dependency graph
    for (const rule of rules) {
      const dependencies = this.extractDependencies(rule.content);
      dependencyGraph.set(rule.id, dependencies);
    }

    // Check for cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (ruleId: string): boolean => {
      if (recursionStack.has(ruleId)) {
        return true;
      }
      if (visited.has(ruleId)) {
        return false;
      }

      visited.add(ruleId);
      recursionStack.add(ruleId);

      const dependencies = dependencyGraph.get(ruleId) || new Set();
      for (const dep of dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(ruleId);
      return false;
    };

    for (const rule of rules) {
      if (hasCycle(rule.id)) {
        throw new Error("Circular dependency detected");
      }
    }
  }

  /**
   * Extracts rule dependencies from content
   * @param content Rule content to analyze
   * @returns Set of rule IDs that this content depends on
   */
  private extractDependencies(content: string): Set<string> {
    const dependencies = new Set<string>();
    const matches = content.match(/depends-on:\s*([^\n]+)/g);

    if (matches) {
      for (const match of matches) {
        const ruleId = match.split(":")[1]?.trim();
        if (ruleId) {
          dependencies.add(ruleId);
        }
      }
    }

    return dependencies;
  }

  /**
   * Detects conflicts between rules
   * @param rules Sorted rules to check for conflicts
   * @returns Map of conflicting settings and their values
   */
  private detectConflicts(rules: Rule[]): Map<string, string[]> {
    const conflicts = new Map<string, string[]>();
    const settings = new Map<string, string[]>();

    // Extract settings from each rule
    for (const rule of rules) {
      const ruleSettings = this.extractSettings(rule.content);

      for (const [setting, value] of ruleSettings) {
        const existingValues = settings.get(setting) || [];
        settings.set(setting, [...existingValues, value]);

        // If we have multiple different values for the same setting, it's a conflict
        const uniqueValues = new Set(settings.get(setting));
        if (uniqueValues.size > 1) {
          conflicts.set(setting, settings.get(setting) || []);
        }
      }
    }

    return conflicts;
  }

  /**
   * Extracts settings from rule content
   * @param content Rule content to analyze
   * @returns Map of setting names to their values
   */
  private extractSettings(content: string): Map<string, string> {
    const settings = new Map<string, string>();
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match && match[1] && match[2]) {
        settings.set(match[1].trim(), match[2].trim());
      }
    }

    return settings;
  }

  /**
   * Composes the content of multiple rules
   * @param rules Sorted rules to compose
   * @param conflicts Detected conflicts between rules
   * @returns Composed content string
   */
  private composeContent(
    rules: Rule[],
    conflicts: Map<string, string[]>
  ): string {
    let content = "";

    // Add each rule's content in priority order (already sorted)
    for (const rule of rules) {
      content += `# From ${rule.id} (Priority: ${rule.priority || 0})\n${
        rule.content
      }\n\n`;
    }

    // Add conflict resolution section if needed
    if (conflicts.size > 0) {
      content += "# Conflict Resolution\n";
      for (const [setting, values] of conflicts) {
        content += `# Conflict in setting '${setting}':\n`;
        values.forEach((value, index) => {
          content += `# - Value ${index + 1}: ${value}\n`;
        });
        const finalValue = values[values.length - 1];
        content += `# Resolution: Using highest priority value: ${finalValue}\n\n`;
      }
    }

    return content.trim();
  }

  /**
   * Creates the final composed rule
   * @param rules Source rules
   * @param content Optional composed content
   * @param conflicts Optional conflicts map
   * @returns Composed rule
   */
  private createComposedRule(
    rules: Rule[],
    content?: string,
    conflicts?: Map<string, string[]>
  ): Rule {
    const now = new Date();
    const baseRule = rules[0];

    // Combine unique tags
    const uniqueTags = new Set<string>();
    rules.forEach((rule) => {
      if (rule.tags) {
        rule.tags.forEach((tag) => uniqueTags.add(tag));
      }
    });

    return {
      id: `composed-rule-${uuidv4()}`,
      name: `Composed Rule (${rules.length} rules)`,
      type: baseRule.type,
      description: `Composed from ${rules.length} rule${
        rules.length > 1 ? "s" : ""
      }${conflicts?.size ? ` with ${conflicts.size} resolved conflicts` : ""}`,
      tags: Array.from(uniqueTags),
      priority: Math.min(...rules.map((r) => r.priority || 0)),
      content: content || baseRule.content,
      createdAt: now,
      updatedAt: now,
    };
  }
}
