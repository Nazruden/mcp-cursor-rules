import { SmartFetchTool } from "../tools/smart_fetch";
import { DatabaseService } from "../database/database.service";
import { Rule } from "../types/rule";

jest.mock("../database/database.service");

describe("SmartFetchTool", () => {
  let smartFetchTool: SmartFetchTool;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    mockDatabaseService = new DatabaseService() as jest.Mocked<DatabaseService>;
    smartFetchTool = new SmartFetchTool(mockDatabaseService);
  });

  describe("execute", () => {
    it("should return one .cursorrules file and relevant .mdc files", async () => {
      const mockRules: Rule[] = [
        {
          id: "1",
          name: "base.cursorrules",
          content: "base rules content",
          type: ".cursorrules",
          tags: ["typescript", "testing"],
        },
        {
          id: "2",
          name: "test.mdc",
          content: "test rules content",
          type: ".mdc",
          tags: ["testing"],
        },
      ];

      mockDatabaseService.findRules.mockResolvedValue(mockRules);

      const result = await smartFetchTool.execute({
        tags: ["typescript", "testing"],
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.cursorrules).toBeDefined();
      expect(parsedResult.mdcFiles.length).toBeGreaterThan(0);
      expect(mockDatabaseService.findRules).toHaveBeenCalledWith([
        "typescript",
        "testing",
      ]);
    });

    it("should calculate relevance scores correctly", async () => {
      const mockRules: Rule[] = [
        {
          id: "1",
          name: "base.cursorrules",
          content: "base rules content",
          type: ".cursorrules",
          tags: ["typescript", "testing", "rules"],
        },
        {
          id: "2",
          name: "test1.mdc",
          content: "test rules content",
          type: ".mdc",
          tags: ["typescript", "testing"],
        },
        {
          id: "3",
          name: "test2.mdc",
          content: "more test rules",
          type: ".mdc",
          tags: ["typescript"],
        },
      ];

      mockDatabaseService.findRules.mockResolvedValue(mockRules);

      const result = await smartFetchTool.execute({
        tags: ["typescript", "testing"],
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.mdcFiles[0].score).toBeGreaterThan(
        parsedResult.mdcFiles[1].score
      );
    });

    it("should handle empty results gracefully", async () => {
      mockDatabaseService.findRules.mockResolvedValue([]);

      const result = await smartFetchTool.execute({
        tags: ["nonexistent"],
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.cursorrules).toBeNull();
      expect(parsedResult.mdcFiles).toHaveLength(0);
    });

    it("should throw error for invalid input", async () => {
      await expect(
        smartFetchTool.execute({
          tags: [],
        })
      ).rejects.toThrow("At least one tag is required");
    });
  });
});
