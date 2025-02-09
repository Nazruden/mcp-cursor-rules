/**
 * Represents a rule in the system
 */
export interface Rule {
  /** Unique identifier for the rule */
  id: string;
  /** Name of the rule */
  name: string;
  /** Type of the rule (e.g. typescript-style, documentation, etc.) */
  type: string;
  /** Description of what the rule does */
  description: string;
  /** Tags for categorizing and filtering rules */
  tags: string[];
  /** Priority of the rule (lower numbers = higher priority) */
  priority: number;
  /** The actual content of the rule */
  content: string;
  /** Date the rule was created */
  createdAt: Date;
  /** Date the rule was last updated */
  updatedAt: Date;
}
