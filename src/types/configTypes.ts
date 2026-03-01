export type ConfigNodeType = 'container' | 'module' | 'group' | 'option';

export interface ConfigNodeData {
  label: string;
  type: ConfigNodeType;
  description?: string;
  properties: Record<string, unknown>;
  visible: boolean;
  visibilityRule?: string;
  validationRules?: ValidationRule[];
}

export interface ValidationRule {
  id: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'required';
  value: string;
  message: string;
}

export const NODE_HIERARCHY: Record<ConfigNodeType, ConfigNodeType | null> = {
  container: null,
  module: 'container',
  group: 'module',
  option: 'group',
};

export const NODE_CHILDREN: Record<ConfigNodeType, ConfigNodeType | null> = {
  container: 'module',
  module: 'group',
  group: 'option',
  option: null,
};

export const NODE_COLORS: Record<ConfigNodeType, string> = {
  container: 'var(--node-container)',
  module: 'var(--node-module)',
  group: 'var(--node-group)',
  option: 'var(--node-option)',
};

export const NODE_LABELS: Record<ConfigNodeType, string> = {
  container: 'Container',
  module: 'Module',
  group: 'Group',
  option: 'Option',
};
