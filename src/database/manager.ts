import Database from "better-sqlite3";
import { Rule } from "../types/rule";

interface PriorityRange {
  min?: number;
  max?: number;
}

interface SortOptions {
  field: "priority" | "createdAt" | "updatedAt";
  order: "asc" | "desc";
}

interface PaginationOptions {
  page: number;
  pageSize: number;
}

interface RuleFilters {
  type?: string;
  types?: string[];
  tags?: string[];
  priority?: number;
  priorityRange?: PriorityRange;
  sortBy?: SortOptions;
  pagination?: PaginationOptions;
}

export class DatabaseManager {
  private db: Database.Database;
  private static readonly CREATE_RULES_TABLE = `
        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            tags TEXT,
            priority INTEGER DEFAULT 0,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )
    `;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(DatabaseManager.CREATE_RULES_TABLE);
  }

  /**
   * Lists all tables in the database
   */
  public listTables(): string[] {
    const result = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    return result.map((row: any) => row.name);
  }

  /**
   * Gets the schema for a specific table
   */
  public getTableSchema(tableName: string): string {
    interface TableInfo {
      sql: string;
    }

    const result = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(tableName) as TableInfo | undefined;

    return result?.sql || "";
  }

  /**
   * Creates a new rule in the database
   */
  public async createRule(rule: Rule): Promise<Rule> {
    const stmt = this.db.prepare(`
            INSERT INTO rules (id, name, type, description, tags, priority, content, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    try {
      stmt.run(
        rule.id,
        rule.name,
        rule.type,
        rule.description || "",
        rule.tags ? JSON.stringify(rule.tags) : "[]",
        rule.priority || 0,
        rule.content,
        rule.createdAt.toISOString(),
        rule.updatedAt.toISOString()
      );
      return rule;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to create rule: ${error.message}`);
      }
      throw new Error("Failed to create rule: Unknown error");
    }
  }

  /**
   * Retrieves a rule by its ID
   */
  public async getRule(id: string): Promise<Rule | null> {
    const stmt = this.db.prepare("SELECT * FROM rules WHERE id = ?");
    const result = stmt.get(id);

    if (!result) {
      return null;
    }

    return this.mapRowToRule(result);
  }

  /**
   * Updates an existing rule
   */
  public async updateRule(rule: Rule): Promise<Rule> {
    const existing = await this.getRule(rule.id);
    if (!existing) {
      throw new Error(`Rule with id ${rule.id} not found`);
    }

    const stmt = this.db.prepare(`
            UPDATE rules 
            SET name = ?, type = ?, description = ?, tags = ?, priority = ?, content = ?, updatedAt = ?
            WHERE id = ?
        `);

    try {
      stmt.run(
        rule.name,
        rule.type,
        rule.description || "",
        rule.tags ? JSON.stringify(rule.tags) : "[]",
        rule.priority || 0,
        rule.content,
        rule.updatedAt.toISOString(),
        rule.id
      );
      return rule;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to update rule: ${error.message}`);
      }
      throw new Error("Failed to update rule: Unknown error");
    }
  }

  /**
   * Deletes a rule by its ID
   */
  public async deleteRule(id: string): Promise<void> {
    const existing = await this.getRule(id);
    if (!existing) {
      throw new Error(`Rule with id ${id} not found`);
    }

    const stmt = this.db.prepare("DELETE FROM rules WHERE id = ?");
    stmt.run(id);
  }

  /**
   * Lists all rules with advanced filtering options
   */
  public async listRules(filters?: RuleFilters): Promise<Rule[]> {
    let query = "SELECT * FROM rules";
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters) {
      // Validate pagination parameters
      if (filters.pagination) {
        if (filters.pagination.page < 1 || filters.pagination.pageSize < 1) {
          return [];
        }
      }

      // Type filtering
      if (filters.type) {
        conditions.push("LOWER(type) = LOWER(?)");
        params.push(filters.type);
      }
      if (filters.types && filters.types.length > 0) {
        const typeConditions = filters.types.map(
          () => "LOWER(type) = LOWER(?)"
        );
        conditions.push(`(${typeConditions.join(" OR ")})`);
        params.push(...filters.types);
      }

      // Tag filtering
      if (filters.tags && filters.tags.length > 0) {
        const tagConditions = filters.tags.map(
          () => `
            EXISTS (
              SELECT 1 FROM json_each(tags)
              WHERE LOWER(json_each.value) = LOWER(?)
            )`
        );
        conditions.push(
          `tags IS NOT NULL AND (${tagConditions.join(" AND ")})`
        );
        params.push(...filters.tags);
      }

      // Priority filtering
      if (filters.priority !== undefined) {
        conditions.push("priority = ?");
        params.push(filters.priority);
      }
      if (filters.priorityRange) {
        if (filters.priorityRange.min !== undefined) {
          conditions.push("priority >= ?");
          params.push(filters.priorityRange.min);
        }
        if (filters.priorityRange.max !== undefined) {
          conditions.push("priority <= ?");
          params.push(filters.priorityRange.max);
        }
      }

      // Add WHERE clause if there are conditions
      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      // Add sorting
      if (filters.sortBy) {
        const field =
          filters.sortBy.field === "priority"
            ? "priority"
            : filters.sortBy.field === "createdAt"
            ? "createdAt"
            : "updatedAt";
        const order = filters.sortBy.order === "asc" ? "ASC" : "DESC";
        query += ` ORDER BY ${field} ${order}`;
      }

      // Add pagination
      if (filters.pagination) {
        const offset =
          (filters.pagination.page - 1) * filters.pagination.pageSize;
        query += " LIMIT ? OFFSET ?";
        params.push(filters.pagination.pageSize, offset);
      }
    }

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(...params);
      return results.map(this.mapRowToRule);
    } catch (error) {
      console.error("Error executing query:", error);
      return [];
    }
  }

  private mapRowToRule(row: any): Rule {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description || "",
      tags: row.tags ? JSON.parse(row.tags) : [],
      priority: row.priority || 0,
      content: row.content,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
