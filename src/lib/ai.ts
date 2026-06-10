// AI assistance layer for NPI Document Builder
// Uses OpenAI-compatible chat completions endpoint (works with OpenAI, xAI/Grok, Ollama /v1, LiteLLM, etc.)

export interface AIConfig {
  baseUrl: string; // e.g. https://api.openai.com/v1  or https://api.x.ai/v1  or http://localhost:11434/v1
  apiKey: string;
  model: string;   // e.g. gpt-4o-mini, gpt-4o, grok-3-latest, llama3.1 etc.
  temperature?: number;
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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  if (!content.trim()) {
    throw new Error('AI returned empty content. Try a different model or adjust the request.');
  }

  return content.trim();
}

export function getDefaultAIConfig(): AIConfig {
  return {
    baseUrl: 'https://api.x.ai/v1', // Good default for Grok - change in settings as needed
    apiKey: '',
    model: 'grok-3-latest',
    temperature: 0.7,
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
