import { FastMCP } from "fastmcp";
import { DatabaseService } from "../database/database.service";
import { Rule, RuleWithScore } from "../types/rule";

interface SmartFetchParams {
  tags: string[];
}

export class SmartFetchTool {
  constructor(private readonly databaseService: DatabaseService) {}

  static readonly definition = {
    name: "smart_fetch",
    description:
      "Intelligently fetch the most relevant rules based on search criteria",
    parameters: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to search for",
        },
      },
      required: ["tags"],
    },
  } as const;

  async execute(params: SmartFetchParams): Promise<string> {
    if (!params.tags.length) {
      throw new Error("At least one tag is required");
    }

    const rules = await this.databaseService.findRules(params.tags);

    // Find the base .cursorrules file
    const cursorrules =
      rules.find((rule) => rule.type === ".cursorrules") || null;

    // Calculate scores for .mdc files
    const mdcFiles = rules
      .filter((rule) => rule.type === ".mdc")
      .map((rule) => ({
        ...rule,
        score: this.calculateScore(rule, params.tags),
      }))
      .sort((a, b) => b.score - a.score);

    return JSON.stringify({
      cursorrules,
      mdcFiles,
    });
  }

  private calculateScore(rule: Rule, searchTags: string[]): number {
    // Calculate tag match ratio
    const matchingTags = rule.tags.filter((tag) => searchTags.includes(tag));
    const tagScore = matchingTags.length / searchTags.length;

    // Add more scoring factors here if needed
    // For now, we'll just use tag matching
    return tagScore;
  }
}
