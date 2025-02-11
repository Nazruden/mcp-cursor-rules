export interface Rule {
  id: string;
  name: string;
  content: string;
  type: ".cursorrules" | ".mdc";
  tags: string[];
}

export interface RuleWithScore extends Rule {
  score: number;
}

export interface SmartFetchResult {
  cursorrules: Rule | null;
  mdcFiles: RuleWithScore[];
}
