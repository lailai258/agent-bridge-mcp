export const CLAUDE_MODELS = [
  'sonnet',
  'sonnet[1m]',
  'deepseek-v4-pro[1m]',
  'deepseek-v4-flash[1m]',
  'glm-5.1',
  'opus',
  'opusplan',
  'haiku',
] as const;
export const CODEX_MODELS = [
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2',
] as const;
export const FORGE_MODELS = ['forge'] as const;
export const OPENCODE_MODELS = ['opencode'] as const;
export const ANTIGRAVITY_MODELS = ['antigravity'] as const;

export const MODEL_ALIASES: Record<string, string> = {
  'claude-ultra': 'opus',
  'codex-ultra': 'gpt-5.5',
};

export const MODEL_ALIAS_DETAILS = [
  { name: 'claude-ultra', resolvesTo: 'opus', agent: 'claude', defaultReasoningEffort: 'max' },
  { name: 'codex-ultra', resolvesTo: 'gpt-5.5', agent: 'codex', defaultReasoningEffort: 'xhigh' },
] as const;

export interface DynamicModelBackendDescription {
  explicitPrefix: string;
  explicitPattern: string;
  discoveryCommand: string;
  modelsAreDynamic: boolean;
}

export function getSupportedModelsDescription(): string {
  return [
    '"claude-ultra", "codex-ultra"',
    ...CLAUDE_MODELS.map((model) => `"${model}"`),
    ...CODEX_MODELS.map((model) => `"${model}"`),
    ...FORGE_MODELS.map((model) => `"${model}"`),
    ...OPENCODE_MODELS.map((model) => `"${model}"`),
    ...ANTIGRAVITY_MODELS.map((model) => `"${model}"`),
    '"oc-<provider/model>"',
  ].join(', ');
}

export function getModelParameterDescription(): string {
  return `The model to use. Aliases: "claude-ultra" (auto max effort), "codex-ultra" (auto xhigh reasoning). Standard: ${[...CLAUDE_MODELS, ...CODEX_MODELS, ...FORGE_MODELS, ...OPENCODE_MODELS, ...ANTIGRAVITY_MODELS].map((model) => `"${model}"`).join(', ')}. OpenCode also accepts explicit dynamic models using "oc-<provider/model>", for example "oc-opencode-go/deepseek-v4-pro". "forge" is a provider key, not a Forge model family selector. "antigravity" selects the Antigravity CLI agent and does not expose a model flag in this integration.`;
}

export function getModelsPayload(): {
  aliases: ReadonlyArray<(typeof MODEL_ALIAS_DETAILS)[number]>;
  claude: ReadonlyArray<string>;
  codex: ReadonlyArray<string>;
  forge: ReadonlyArray<string>;
  opencode: ReadonlyArray<string>;
  antigravity: ReadonlyArray<string>;
  dynamicModelBackends: {
    opencode: DynamicModelBackendDescription;
  };
} {
  return {
    aliases: MODEL_ALIAS_DETAILS,
    claude: CLAUDE_MODELS,
    codex: CODEX_MODELS,
    forge: FORGE_MODELS,
    opencode: OPENCODE_MODELS,
    antigravity: ANTIGRAVITY_MODELS,
    dynamicModelBackends: {
      opencode: {
        explicitPrefix: 'oc-',
        explicitPattern: 'oc-<provider/model>',
        discoveryCommand: 'opencode models',
        modelsAreDynamic: true,
      },
    },
  };
}
