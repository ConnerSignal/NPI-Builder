// AI assistance layer for NPI Document Builder
// Uses OpenAI-compatible chat completions endpoint (works with OpenAI, xAI/Grok, Ollama /v1, LiteLLM, etc.)

import { useEffect, useReducer } from 'react';

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
  builtin?: boolean; // true = pre-configured, cannot delete
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'xai',
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-3-latest', 'grok-4-latest'],
    apiKeyPlaceholder: 'xai-...',
    builtin: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
    apiKeyPlaceholder: 'sk-...',
    builtin: true,
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot Endpoint',
    baseUrl: 'https://api.githubcopilot.com',
    models: ['gpt-5.5', 'gpt-5.3-codex', 'gpt-4.1'],
    apiKeyPlaceholder: 'github token / copilot token',
    builtin: true,
  },
  {
    id: 'ollama',
    label: 'Local Ollama (OpenAI-compatible)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.1', 'qwen2.5-coder:7b', 'mistral'],
    apiKeyPlaceholder: 'optional',
    builtin: true,
  },
  {
    id: 'custom',
    label: 'Custom Endpoint',
    baseUrl: '',
    models: [''],
    apiKeyPlaceholder: 'provider-specific key',
    builtin: true,
  }
];

const USER_PRESETS_KEY = 'npi-ai-presets';
const MAX_USER_PRESETS = 20;

/**
 * Presets live in localStorage, which React cannot observe. We keep a tiny
 * in-memory revision counter and notify subscribers whenever it changes, so
 * every dropdown in the app updates the moment a provider is added or removed.
 */
let presetRevision = 0;
const presetListeners = new Set<() => void>();

function notifyPresetsChanged() {
  presetRevision++;
  presetListeners.forEach(fn => fn());
}

export function subscribeToPresets(fn: () => void): () => void {
  presetListeners.add(fn);
  return () => { presetListeners.delete(fn); };
}

export function getPresetRevision(): number {
  return presetRevision;
}

/** User-created presets, oldest first. Never contains secrets. */
export function loadUserPresets(): AIProviderPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is AIProviderPreset =>
        !!p && typeof p.id === 'string' && typeof p.label === 'string' && Array.isArray(p.models)
    );
  } catch {
    return [];
  }
}

function persistUserPresets(presets: AIProviderPreset[]): void {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
  notifyPresetsChanged();
}

function slugify(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `user-${slug || 'custom'}`;
}

/**
 * All selectable presets: built-ins first, then user presets.
 * This is the single source of truth for every provider dropdown in the app.
 */
export function getMergedPresets(): AIProviderPreset[] {
  return [...AI_PROVIDER_PRESETS, ...loadUserPresets()];
}

export function getUserPreset(id: string): AIProviderPreset | undefined {
  return loadUserPresets().find(p => p.id === id);
}

/** Adds a user preset, assigning a unique id. Throws when the cap is reached. */
export function addUserPreset(input: Omit<AIProviderPreset, 'id' | 'builtin'>): AIProviderPreset {
  const existing = loadUserPresets();
  if (existing.length >= MAX_USER_PRESETS) {
    throw new Error(`You can store up to ${MAX_USER_PRESETS} custom providers. Delete one to add another.`);
  }

  let id = slugify(input.label);
  if (existing.some(p => p.id === id)) {
    let n = 2;
    while (existing.some(p => p.id === `${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }

  const preset: AIProviderPreset = { ...input, id, models: input.models.filter(Boolean) };
  persistUserPresets([...existing, preset]);
  return preset;
}

/** Updates a user preset. Built-in presets cannot be modified. */
export function updateUserPreset(id: string, updates: Partial<Omit<AIProviderPreset, 'id' | 'builtin'>>): void {
  const existing = loadUserPresets();
  const next = existing.map(p => (p.id === id ? { ...p, ...updates, id: p.id, models: (updates.models ?? p.models).filter(Boolean) } : p));
  persistUserPresets(next);
}

export function deleteUserPreset(id: string): void {
  persistUserPresets(loadUserPresets().filter(p => p.id !== id));
}

export function getProviderPreset(id?: string): AIProviderPreset {
  return getMergedPresets().find(p => p.id === id) || AI_PROVIDER_PRESETS[0];
}

/**
 * Subscribes to the preset store. Any component calling this re-renders the
 * moment a custom provider is added, edited, or deleted — no reload needed.
 */
export function usePresets(): AIProviderPreset[] {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeToPresets(forceUpdate), []);

  return getMergedPresets();
}

export function applyPrimaryPreset(config: AIConfig, presetId: string): AIConfig {
  const preset = getProviderPreset(presetId);
  const model = preset.models[0] || config.model;
  return {
    ...config,
    apiKey: presetId === config.providerPresetId ? config.apiKey : '',
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
    fallbackApiKey: presetId === config.fallbackPresetId ? config.fallbackApiKey : '',
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

export async function generateSection(config: AIConfig, req: GenerateRequest, onResponse?: (response: AIResponse) => void): Promise<string> {

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

  const result = await requestChat(config, body, true);
  onResponse?.(result);
  return result.content;
}

export interface AIResponse {
  content: string;
  endpoint: string;
  requestedModel: string;
  returnedModel?: string;
  keyLabel: string;
  usedFallback: boolean;
  elapsedMs: number;
}

export function keyLabel(key?: string): string {
  const trimmed = key?.trim();
  return trimmed ? (trimmed.length > 8 ? 'Key ending ' + trimmed.slice(-4) : 'Key entered') : 'No key';
}

export function allowsKeyless(config: AIConfig): boolean {
  try {
    const url = new URL(config.baseUrl.trim());
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export function chatEndpoint(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl.trim()); }
  catch { throw new Error('Enter a valid provider base URL, such as https://api.example.com/v1.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP(S) base URL without credentials, query parameters, or a fragment.');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Remote AI endpoints require HTTPS. HTTP is allowed only for local loopback endpoints.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.toString();
}

export function validateAIConfig(config: AIConfig): void {
  chatEndpoint(config.baseUrl);
  if (!config.model.trim()) throw new Error('Enter the model ID provided by your AI provider.');
  if (!config.apiKey.trim() && !allowsKeyless(config)) throw new Error('Paste an API key for this provider.');
}

export function responseSummary(result: AIResponse): string {
  return [
    result.usedFallback ? 'Fallback response' : 'Primary response',
    result.endpoint,
    'Requested: ' + result.requestedModel,
    result.returnedModel ? 'Provider reported: ' + result.returnedModel : 'Provider did not report a model ID',
    result.keyLabel,
    (result.elapsedMs / 1000).toFixed(1) + 's',
  ].join(' | ');
}

// A deliberate live test sends only a fixed greeting, never project data.
// Fallback is disabled so success verifies precisely this endpoint/key/model.
export function testConnection(config: AIConfig): Promise<AIResponse> {
  return requestChat(config, {
    model: config.model.trim(),
    messages: [{ role: 'user', content: 'Reply with OK to confirm this connection.' }],
  }, false, 30_000);
}

async function requestChat(config: AIConfig, body: Record<string, unknown>, allowFallback: boolean, timeoutMs = 90_000): Promise<AIResponse> {
  validateAIConfig(config);
  try {
    return await runChatRequest(config, body, false, timeoutMs);
  } catch (error) {
    const primaryError = error as AIRequestError;
    if (!allowFallback || !config.fallbackEnabled || !isFallbackEligible(primaryError.status, primaryError.bodyText)) throw error;
    const fallback: AIConfig = {
      ...config,
      baseUrl: config.fallbackBaseUrl?.trim() || config.baseUrl,
      model: config.fallbackModel?.trim() || '',
      apiKey: config.fallbackApiKey?.trim() || '',
    };
    // Reuse credentials only for the exact same endpoint, never another host.
    if (!fallback.apiKey && chatEndpoint(fallback.baseUrl) === chatEndpoint(config.baseUrl)) fallback.apiKey = config.apiKey;
    try {
      validateAIConfig(fallback);
      return await runChatRequest(fallback, { ...body, model: fallback.model }, true, timeoutMs);
    } catch (fallbackError) {
      throw new Error(primaryError.message + '\nFallback failed: ' + (fallbackError instanceof Error ? fallbackError.message : 'Unknown error'));
    }
  }
}

async function runChatRequest(config: AIConfig, body: Record<string, unknown>, usedFallback: boolean, timeoutMs: number): Promise<AIResponse> {
  const endpoint = chatEndpoint(config.baseUrl);
  const apiKey = config.apiKey.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
      },
      body: JSON.stringify({ ...body, model: config.model.trim() }),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!res.ok) {
      let detail = await res.text().catch(() => '');
      for (const secret of [config.apiKey, config.fallbackApiKey]) {
        if (secret?.trim()) detail = detail.split(secret.trim()).join('[redacted]');
      }
      const hints: Record<number, string> = {
        400: 'Check the model ID and supported request parameters.',
        401: 'The provider rejected this API key. Replace it and test again.',
        403: 'This key or account may not have access to the selected model.',
        404: 'Check the base URL and model ID.',
        429: 'Check provider quota, billing, or rate limits.',
      };
      const error = new Error('AI request failed (' + res.status + ') at ' + endpoint + '. ' + (hints[res.status] || 'The provider could not complete the request.') + ' ' + detail.slice(0, 600)) as AIRequestError;
      error.status = res.status;
      error.bodyText = detail;
      throw error;
    }
    const data = await res.json().catch(() => { throw new Error('The endpoint returned invalid JSON. Check that this is an OpenAI-compatible chat endpoint.'); });
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('The provider returned no text. Check model support or try another model.');
    return {
      content: content.trim(), endpoint, requestedModel: config.model.trim(),
      returnedModel: typeof data.model === 'string' ? data.model : undefined,
      keyLabel: keyLabel(apiKey), usedFallback, elapsedMs: Date.now() - started,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AI request timed out after ' + timeoutMs / 1000 + ' seconds at ' + endpoint + '. Check the endpoint and retry.');
    if (error instanceof TypeError) throw new Error('Could not reach ' + endpoint + '. Check the URL, internet connection, and whether this provider allows browser requests (CORS). A browser network failure does not verify or reject your key.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function stripStoredSecrets(config: Partial<AIConfig>): Partial<AIConfig> {
  const { apiKey: _apiKey, fallbackApiKey: _fallbackApiKey, ...rest } = config;
  return rest;
}

/**
 * Browser builds intentionally keep keys in memory only, so nothing secret is
 * written to disk. When the user explicitly opts in via "Remember my AI key on
 * this device", the key is written to its own storage slot instead of being
 * mixed into the general config blob. Electron never needs this: its keys live
 * in OS-backed secure storage.
 */
const REMEMBERED_KEYS_STORAGE = 'npi-ai-remembered-keys';

export function loadRememberedKeys(): { apiKey?: string; fallbackApiKey?: string } {
  try {
    const raw = localStorage.getItem(REMEMBERED_KEYS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { apiKey?: unknown; fallbackApiKey?: unknown };
    return {
      ...(typeof parsed.apiKey === 'string' ? { apiKey: parsed.apiKey } : {}),
      ...(typeof parsed.fallbackApiKey === 'string' ? { fallbackApiKey: parsed.fallbackApiKey } : {}),
    };
  } catch {
    return {};
  }
}

export function saveRememberedKeys(keys: { apiKey?: string; fallbackApiKey?: string }): boolean {
  try {
    localStorage.setItem(REMEMBERED_KEYS_STORAGE, JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

export function clearRememberedKeys(): void {
  localStorage.removeItem(REMEMBERED_KEYS_STORAGE);
}

export function hasSecureKeyStorage(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { npiSecureStore?: unknown }).npiSecureStore);
}

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem('npi-ai-config');
    if (raw) return { ...getDefaultAIConfig(), ...stripStoredSecrets(JSON.parse(raw)) };
  } catch {
    // Fall through to defaults when the stored blob is unreadable.
  }
  return getDefaultAIConfig();
}

export function saveAIConfig(cfg: Partial<AIConfig>, current: AIConfig) {
  const next = { ...current, ...cfg };
  localStorage.setItem('npi-ai-config', JSON.stringify(stripStoredSecrets(next)));
  return next;
}
