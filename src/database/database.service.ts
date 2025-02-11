import { Pool, PoolClient } from "pg";
import { Rule } from "../types/rule";

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      database: process.env.POSTGRES_DB || "mcp_rules",
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.createTables(client);
    } finally {
      client.release();
    }
  }

  private async createTables(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        tags TEXT[] NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_rules_tags ON rules USING GIN (tags);
      CREATE INDEX IF NOT EXISTS idx_rules_type ON rules (type);
    `);
  }

  async findRules(tags: string[]): Promise<Rule[]> {
    const query = `
      SELECT id, name, content, type, tags
      FROM rules
      WHERE tags && $1
      ORDER BY array_length(ARRAY(
        SELECT UNNEST(tags)
        INTERSECT
        SELECT UNNEST($1::text[])
      ), 1) DESC;
    `;

    const result = await this.pool.query(query, [tags]);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      content: row.content,
      type: row.type as ".cursorrules" | ".mdc",
      tags: row.tags,
    }));
  }

  async addRule(rule: Omit<Rule, "id">): Promise<Rule> {
    const query = `
      INSERT INTO rules (name, content, type, tags)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, content, type, tags;
    `;

    const result = await this.pool.query(query, [
      rule.name,
      rule.content,
      rule.type,
      rule.tags,
    ]);

    return result.rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
