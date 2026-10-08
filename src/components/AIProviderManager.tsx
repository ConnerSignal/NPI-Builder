import { useState } from 'react';
import {
  AI_PROVIDER_PRESETS,
  allowsKeyless,
  keyLabel,
  responseSummary,
  type AIResponse,
  addUserPreset,
  applyFallbackPreset,
  applyPrimaryPreset,
  deleteUserPreset,
  updateUserPreset,
  usePresets,
  type AIConfig,
  type AIProviderPreset,
} from '../lib/ai';

interface Props {
  aiConfig: AIConfig;
  saveAIConfigLocal: (p: Partial<AIConfig>) => void;
  onTest: () => void;
  testBusy: boolean;
  testError: string | null;
  testResult: AIResponse | null;
  keyStorageMessage: string;
  transfersAllowed: boolean;
  onTransfersChange: (allowed: boolean) => void;
}

const LAB: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 };

const EMPTY_DRAFT = { label: '', baseUrl: '', models: '', apiKeyPlaceholder: '' };

/** Split a comma or newline separated model list into a clean array. */
function parseModels(raw: string): string[] {
  return raw.split(/[,\n]/).map(m => m.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  Add / edit a custom provider preset                                */
/* ------------------------------------------------------------------ */

function PresetEditor({
  editing,
  onDone,
}: {
  editing: AIProviderPreset | null;
  onDone: () => void;
}) {
  // Seeded once per mount. The parent supplies a `key`, so switching between
  // presets remounts this with the right values instead of syncing via effect.
  const [draft, setDraft] = useState(() => (editing
    ? {
        label: editing.label,
        baseUrl: editing.baseUrl,
        models: editing.models.join(', '),
        apiKeyPlaceholder: editing.apiKeyPlaceholder,
      }
    : EMPTY_DRAFT));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const label = draft.label.trim();
    const baseUrl = draft.baseUrl.trim();

    if (!label) return setError('Give the provider a name.');
    if (!baseUrl) return setError('A base URL is required.');
    if (!/^https?:\/\//i.test(baseUrl)) return setError('Base URL must start with http:// or https://');

    const models = parseModels(draft.models);
    if (models.length === 0) return setError('Add at least one model so it can be picked from the dropdown.');
    if (models.length > 40) return setError('Keep it to 40 models or fewer.');

    const payload = { label, baseUrl, models, apiKeyPlaceholder: draft.apiKeyPlaceholder.trim() || 'API key' };

    try {
      if (editing) updateUserPreset(editing.id, payload);
      else addUserPreset(payload);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    return undefined;
  }

  return (
    <form className="preset-editor" onSubmit={handleSubmit}>
      <div className="preset-editor-grid">
        <div>
          <label style={LAB}>Name</label>
          <input
            className="input"
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            placeholder="My Gateway"
          />
        </div>
        <div>
          <label style={LAB}>Base URL</label>
          <input
            className="input"
            value={draft.baseUrl}
            onChange={e => setDraft({ ...draft, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="span-2">
          <label style={LAB}>Models (comma separated)</label>
          <input
            className="input"
            value={draft.models}
            onChange={e => setDraft({ ...draft, models: e.target.value })}
            placeholder="model-a, model-b"
          />
        </div>
        <div className="span-2">
          <label style={LAB}>API key hint (optional)</label>
          <input
            className="input"
            value={draft.apiKeyPlaceholder}
            onChange={e => setDraft({ ...draft, apiKeyPlaceholder: e.target.value })}
            placeholder="sk-..."
          />
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="row">
        <button type="submit" className="btn primary">{editing ? 'Save changes' : 'Add provider'}</button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                         */
/* ------------------------------------------------------------------ */

export function AIProviderManager({ aiConfig, saveAIConfigLocal, onTest, testBusy, testError, testResult, keyStorageMessage, transfersAllowed, onTransfersChange }: Props) {
  const [editing, setEditing] = useState<AIProviderPreset | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [adding, setAdding] = useState(false);

  // Live preset list — reflects adds/edits/deletes immediately.
  const presets = usePresets();

  const userPresets = presets.filter(p => !p.builtin);
  const hasKey = Boolean(aiConfig.apiKey.trim());

  function handleDelete(preset: AIProviderPreset) {
    if (!confirm(`Delete the "${preset.label}" provider?`)) return;
    deleteUserPreset(preset.id);

    // If the active provider was the one deleted, fall back to the default preset.
    if (aiConfig.providerPresetId === preset.id) {
      saveAIConfigLocal(applyPrimaryPreset(aiConfig, AI_PROVIDER_PRESETS[0].id));
    }
    if (aiConfig.fallbackPresetId === preset.id) {
      saveAIConfigLocal({ fallbackPresetId: AI_PROVIDER_PRESETS[0].id });
    }
  }

  return (
    <div className="provider-manager">
      <div className="provider-grid">
        {/* Primary */}
        <section className="provider-block">
          <h4>Primary provider</h4>

          <div>
            <label style={LAB}>Provider</label>
            <select
              className="input"
              value={aiConfig.providerPresetId || 'xai'}
              onChange={e => saveAIConfigLocal(applyPrimaryPreset(aiConfig, e.target.value))}
            >
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.label}{p.builtin ? '' : ' (custom)'}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={LAB}>Model</label>
            <input
              className="input"
              list="npi-model-options"
              value={aiConfig.model}
              onChange={e => saveAIConfigLocal({ model: e.target.value })}
              placeholder="gpt-4.1-mini"
            />
            <datalist id="npi-model-options">
              {(presets.find(p => p.id === aiConfig.providerPresetId)?.models ?? []).map(m => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="span-2">
            <label style={LAB}>Base URL</label>
            <input
              className="input"
              value={aiConfig.baseUrl}
              onChange={e => saveAIConfigLocal({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="span-2">
            <label style={LAB}>
              API key
            </label>
            <input
              className="input"
              type={showKey ? "text" : "password"}
              value={aiConfig.apiKey}
              onChange={e => saveAIConfigLocal({ apiKey: e.target.value })}
              aria-label="Primary API key"
              placeholder="Paste a new key any time"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn small" onClick={() => setShowKey(v => !v)}>{showKey ? 'Hide keys' : 'Show keys'}</button>
              <span className="stat">{keyLabel(aiConfig.apiKey)}</span>
            </div>
            <p className="ai-connection-detail">{keyStorageMessage}</p>
          </div>
        </section>

        {/* Fallback */}
        <section className="provider-block">
          <h4>Fallback provider</h4>

          <label className="check-row span-2">
            <input
              type="checkbox"
              checked={!!aiConfig.fallbackEnabled}
              onChange={e => saveAIConfigLocal({ fallbackEnabled: e.target.checked })}
            />
            <span>Use a fallback when the primary hits a quota, rate limit, or outage</span>
          </label>

          {aiConfig.fallbackEnabled && (
            <>
              <div>
                <label style={LAB}>Provider</label>
                <select
                  className="input"
                  value={aiConfig.fallbackPresetId || 'copilot'}
                  onChange={e => saveAIConfigLocal(applyFallbackPreset(aiConfig, e.target.value))}
                >
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.label}{p.builtin ? '' : ' (custom)'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={LAB}>Model</label>
                <input
                  className="input"
                  list="npi-fallback-model-options"
                  value={aiConfig.fallbackModel || ''}
                  onChange={e => saveAIConfigLocal({ fallbackModel: e.target.value })}
                  placeholder="gpt-5.5"
                />
                <datalist id="npi-fallback-model-options">
                  {(presets.find(p => p.id === aiConfig.fallbackPresetId)?.models ?? []).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div className="span-2">
                <label style={LAB}>Base URL</label>
                <input
                  className="input"
                  value={aiConfig.fallbackBaseUrl || ''}
                  onChange={e => saveAIConfigLocal({ fallbackBaseUrl: e.target.value })}
                  placeholder="Leave blank to reuse the primary URL"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>

              <div className="span-2">
                <label style={LAB}>Fallback API key</label>
                <input
                  className="input"
                  type="password"
                  value={aiConfig.fallbackApiKey || ''}
                  onChange={e => saveAIConfigLocal({ fallbackApiKey: e.target.value })}
                  placeholder="Required for another provider; optional for the same endpoint"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </>
          )}
        </section>
      </div>

      <div className="ai-connection-detail">
        <strong>Active connection</strong><br />
        {aiConfig.baseUrl} | {aiConfig.model || 'No model selected'} | {keyLabel(aiConfig.apiKey)}
      </div>
      <label className="check-row">
        <input type="checkbox" checked={transfersAllowed} onChange={e => onTransfersChange(e.target.checked)} />
        <span>Allow ProdBot and AI tools to send messages and project context to my configured providers</span>
      </label>
      <p className="stat">Test sends only a fixed greeting to the primary provider using the current key and model. It can run with project transfers off. Fallback is never used for this test.</p>
      {/* Connection test */}
      <div className="test-row">
        <button className="btn" onClick={onTest} disabled={testBusy || (!hasKey && !allowsKeyless(aiConfig))}>
          {testBusy ? 'Testing…' : 'Test connection'}
        </button>
        {!hasKey && !allowsKeyless(aiConfig) && <span className="stat">Add an API key to test.</span>}
        {testResult && <div className="ai-test-success" role="status">
          <strong>Connection verified</strong>
          <div>{responseSummary(testResult)}</div>
          <div>Reply: {testResult.content.slice(0, 160)}</div>
        </div>}
        {!testResult && !testError && !testBusy && <span className="stat">Current settings have not been verified.</span>}
        {testError && <span className="test-error" role="alert">{testError}</span>}
      </div>

      {/* Preset management */}
      <div className="preset-manager">
        <div className="section-head">
          <strong>Custom providers</strong>
          <button className="btn small" onClick={() => { setEditing(null); setAdding(a => !a); }}>
            {adding ? 'Cancel' : '+ Add provider'}
          </button>
        </div>

        {adding && <PresetEditor key="new" editing={null} onDone={() => setAdding(false)} />}

        {userPresets.length === 0 ? (
          <p className="stat">
            None yet. Add one to switch between your own gateways and models without editing any files.
          </p>
        ) : (
          <ul className="preset-list">
            {userPresets.map(p => (
              <li key={p.id} className="preset-row">
                <div className="preset-meta">
                  <span className="preset-name">{p.label}</span>
                  <span className="preset-url">{p.baseUrl}</span>
                  <span className="preset-models">{p.models.length} model{p.models.length === 1 ? '' : 's'}</span>
                </div>
                <div className="row">
                  {aiConfig.providerPresetId === p.id && <span className="chip">active</span>}
                  <button className="btn small" onClick={() => { setAdding(false); setEditing(p); }}>Edit</button>
                  <button className="btn small danger" onClick={() => handleDelete(p)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing && <PresetEditor key={editing.id} editing={editing} onDone={() => setEditing(null)} />}
      </div>
    </div>
  );
}

export default AIProviderManager;
