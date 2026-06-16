// AI assistance layer for NPI Document Builder
// Uses OpenAI-compatible chat completions endpoint (works with OpenAI, xAI/Grok, Ollama /v1, LiteLLM, etc.)

export interface AIConfig {
  providerPresetId?: string;
  baseUrl: string; // e.g. https://api.openai.com/v1  or https://api.x.ai/v1  or http://localhost:11434/v1
  apiKey: string;
  model: string;   // e.g. gpt-4o-mini, gpt-4o, grok-3-latest, llama3.1 etc.
  temperature?: number;
  fallbackEnabled?: boolean;
  fallbackPresetId?: string;
  fallbackBaseUrl?: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
}

export interface AIProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
  apiKeyPlaceholder: string;
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'xai',
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-3-latest', 'grok-4-latest'],
    apiKeyPlaceholder: 'xai-...'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
    apiKeyPlaceholder: 'sk-...'
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot Endpoint',
    baseUrl: 'https://api.githubcopilot.com',
    models: ['gpt-5.5', 'gpt-5.3-codex', 'gpt-4.1'],
    apiKeyPlaceholder: 'github token / copilot token'
  },
  {
    id: 'ollama',
    label: 'Local Ollama (OpenAI-compatible)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.1', 'qwen2.5-coder:7b', 'mistral'],
    apiKeyPlaceholder: 'optional'
  },
  {
    id: 'custom',
    label: 'Custom Endpoint',
    baseUrl: '',
    models: [''],
    apiKeyPlaceholder: 'provider-specific key'
  }
];

export function getProviderPreset(id?: string): AIProviderPreset {
  return AI_PROVIDER_PRESETS.find(p => p.id === id) || AI_PROVIDER_PRESETS[0];
}

export function applyPrimaryPreset(config: AIConfig, presetId: string): AIConfig {
  const preset = getProviderPreset(presetId);
  const model = preset.models[0] || config.model;
  return {
    ...config,
    providerPresetId: presetId,
    baseUrl: preset.baseUrl || config.baseUrl,
    model,
  };
}

export function applyFallbackPreset(config: AIConfig, presetId: string): AIConfig {
  const preset = getProviderPreset(presetId);
  const model = preset.models[0] || config.fallbackModel || config.model;
  return {
    ...config,
    fallbackPresetId: presetId,
    fallbackBaseUrl: preset.baseUrl || config.fallbackBaseUrl || config.baseUrl,
    fallbackModel: model,
  };
}

export interface GenerateRequest {
  artifactName: string;
  shortName: string;
  fieldKey: string;
  fieldGuidance: string;
  currentValue: string;
  projectContext: string;
  otherContext?: string; // summary of related filled sections
  mode: 'generate' | 'refine' | 'critique';
  userInstruction?: string;
}

type AIRequestError = Error & { status?: number; bodyText?: string };

const SYSTEM_BASE = `You are an expert product management and technical writing assistant specialized in New Product Introduction (NPI) artifacts.

Core principles you MUST follow:
- Be evidence-based and specific. Avoid vague claims.
- Follow the exact structure and intent of the requested NPI artifact section.
- Incorporate the user's project context and any provided related sections for consistency.
- Explicitly avoid common mistakes for the artifact type.
- Output ONLY the content for the requested field unless asked for critique. No meta commentary, no "Here is the improved version:", no wrapping in code fences.
- Use clear, professional language suitable for stakeholders and engineers.
- When appropriate, include measurable outcomes, owners, or concrete examples drawn from context.`;

const MODE_INSTRUCTIONS: Record<GenerateRequest['mode'], string> = {
  generate: 'Generate a complete, high-quality draft for this section from scratch using the guidance and context.',
  refine: 'Take the current value and improve it: make it more specific, add missing evidence or metrics, fix ambiguity, align to best practices, and keep the author\'s voice where strong.',
  critique: 'Provide a short, structured critique (3-6 bullets) of the current value against the guidance, best practices, and common mistakes. Highlight gaps and suggest concrete fixes. Do not rewrite the full section unless the user later asks.',
};

export async function generateSection(config: AIConfig, req: GenerateRequest): Promise<string> {
  if (!config.apiKey || !config.baseUrl) {
    throw new Error('AI provider not configured. Open settings and provide base URL, model, and API key.');
  }

  const url = config.baseUrl.replace(/\/$/, '') + '/chat/completions';

  const system = [
    SYSTEM_BASE,
    `Artifact: ${req.artifactName} (${req.shortName})`,
    `Field: ${req.fieldKey}`,
    `Guidance for this field: ${req.fieldGuidance}`,
    `Mode: ${MODE_INSTRUCTIONS[req.mode]}`,
  ].join('\n\n');

  const userParts: string[] = [];

  if (req.projectContext?.trim()) {
    userParts.push(`PROJECT CONTEXT / ADDITIONAL INSTRUCTIONS:\n${req.projectContext.trim()}`);
  }
  if (req.otherContext?.trim()) {
    userParts.push(`RELATED SECTIONS / OTHER DOCS (use for consistency):\n${req.otherContext.trim()}`);
  }
  if (req.currentValue?.trim() && (req.mode === 'refine' || req.mode === 'critique')) {
    userParts.push(`CURRENT VALUE FOR THIS FIELD:\n${req.currentValue.trim()}`);
  }
  if (req.userInstruction?.trim()) {
    userParts.push(`USER INSTRUCTION FOR THIS REQUEST:\n${req.userInstruction.trim()}`);
  }

  const user = userParts.length
    ? userParts.join('\n\n---\n\n')
    : 'No additional context provided. Generate the strongest possible section using only the artifact guidance and general NPI best practices.';

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: config.temperature ?? (req.mode === 'critique' ? 0.3 : 0.7),
    max_tokens: 1800,
  };

  try {
    return await runChatRequest(url, config.apiKey, body);
  } catch (err: any) {
    const primaryError = err as AIRequestError;
    const shouldTryFallback =
      !!config.fallbackEnabled &&
      !!config.fallbackBaseUrl &&
      !!config.fallbackModel &&
      !!(config.fallbackApiKey || config.apiKey) &&
      isFallbackEligible(primaryError.status, primaryError.bodyText);

    if (!shouldTryFallback) {
      throw primaryError;
    }

    const fallbackBody = {
      ...body,
      model: config.fallbackModel,
    };

    const fallbackUrl = config.fallbackBaseUrl!.replace(/\/$/, '') + '/chat/completions';
    const fallbackKey = config.fallbackApiKey || config.apiKey;

    try {
      return await runChatRequest(fallbackUrl, fallbackKey, fallbackBody);
    } catch (fallbackErr: any) {
      const fallbackMessage = fallbackErr?.message || String(fallbackErr);
      throw new Error(`${primaryError.message}\nFallback failed: ${fallbackMessage}`);
    }
  }
}

async function runChatRequest(url: string, apiKey: string, body: Record<string, any>): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`AI request failed (${res.status}): ${text || res.statusText}`) as AIRequestError;
    err.status = res.status;
    err.bodyText = text;
    throw err;
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  if (!content.trim()) {
    throw new Error('AI returned empty content. Try a different model or adjust the request.');
  }

  return content.trim();
}

function isFallbackEligible(status?: number, bodyText?: string): boolean {
  const body = (bodyText || '').toLowerCase();
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  if (body.includes('insufficient_quota')) return true;
  if (body.includes('rate limit')) return true;
  if (body.includes('overload')) return true;
  if (body.includes('temporar')) return true;
  return false;
}

export function getDefaultAIConfig(): AIConfig {
  return {
    providerPresetId: 'xai',
    baseUrl: 'https://api.x.ai/v1', // Good default for Grok - change in settings as needed
    apiKey: '',
    model: 'grok-3-latest',
    temperature: 0.7,
    fallbackEnabled: false,
    fallbackPresetId: 'copilot',
    fallbackBaseUrl: 'https://api.githubcopilot.com',
    fallbackApiKey: '',
    fallbackModel: 'gpt-5.5',
  };
}

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem('npi-ai-config');
    if (raw) return { ...getDefaultAIConfig(), ...JSON.parse(raw) };
  } catch {}
  return getDefaultAIConfig();
}

export function saveAIConfig(cfg: Partial<AIConfig>) {
  const current = loadAIConfig();
  const next = { ...current, ...cfg };
  localStorage.setItem('npi-ai-config', JSON.stringify(next));
  return next;
}
