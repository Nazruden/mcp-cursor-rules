import { DatabaseService } from "../database/database.service";
import { Pool, PoolClient } from "pg";
import { Rule } from "../types/rule";

jest.mock("pg", () => {
  const mPool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };

  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  return {
    Pool: jest.fn(() => mPool),
    PoolClient: jest.fn(() => mClient),
  };
});

describe("DatabaseService", () => {
  let databaseService: DatabaseService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    databaseService = new DatabaseService();
    mockPool = (databaseService as any).pool;
    mockClient = new (jest.requireMock("pg").PoolClient)();
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  describe("init", () => {
    it("should create tables and indices", async () => {
      await databaseService.init();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("CREATE TABLE IF NOT EXISTS rules")
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should handle initialization errors", async () => {
      const error = new Error("Database error");
      (mockClient.query as jest.Mock).mockRejectedValue(error);

      await expect(databaseService.init()).rejects.toThrow("Database error");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("findRules", () => {
    it("should find rules by tags", async () => {
      const mockRules = [
        {
          id: "1",
          name: "test.cursorrules",
          content: "content",
          type: ".cursorrules" as const,
          tags: ["typescript"],
        },
      ];

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockRules });

      const result = await databaseService.findRules(["typescript"]);

      expect(result).toEqual(mockRules);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        [["typescript"]]
      );
    });
  });

  describe("addRule", () => {
    it("should add a new rule", async () => {
      const newRule: Omit<Rule, "id"> = {
        name: "test.mdc",
        content: "content",
        type: ".mdc",
        tags: ["typescript"],
      };

      const mockResult = {
        id: "1",
        ...newRule,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockResult] });

      const result = await databaseService.addRule(newRule);

      expect(result).toEqual(mockResult);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO rules"),
        [newRule.name, newRule.content, newRule.type, newRule.tags]
      );
    });
  });

  describe("close", () => {
    it("should close the database connection", async () => {
      await databaseService.close();
      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
