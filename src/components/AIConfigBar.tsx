import { useState, useEffect, useRef } from 'react';
import {
  applyPrimaryPreset,
  allowsKeyless,
  keyLabel,
  usePresets,
  type AIConfig,
} from '../lib/ai';

interface Props {
  aiConfig: AIConfig;
  saveAIConfigLocal: (p: Partial<AIConfig>) => void;
  onOpenProviderManager: () => void;
  aiError: string | null;
  aiBusy: string | null;
  transfersAllowed: boolean;
  keyIsPersisted: boolean;
  verified: boolean;
}

type Status = 'ready' | 'verified' | 'needs-key' | 'blocked' | 'error';

function resolveStatus(aiConfig: AIConfig, aiError: string | null, transfersAllowed: boolean, verified: boolean): Status {
  if (aiError) return 'error';
  if (!transfersAllowed) return 'blocked';
  if (!aiConfig.apiKey.trim() && !allowsKeyless(aiConfig)) return 'needs-key';
  if (verified) return 'verified';
  return 'ready';
}

const STATUS_META: Record<Status, { color: string; label: string; hint: string }> = {
  ready: { color: 'var(--muted)', label: 'Not tested', hint: 'Settings entered. Test the connection to verify them.' },
  verified: { color: 'var(--good)', label: 'Verified', hint: 'The current primary settings received a live response.' },
  'needs-key': { color: 'var(--warn)', label: 'Add key', hint: 'Paste an API key to start using AI features.' },
  blocked: { color: 'var(--muted)', label: 'AI off', hint: 'AI transfers are disabled in Privacy Controls.' },
  error: { color: 'var(--bad)', label: 'Error', hint: 'The last AI request failed. Check the key or switch provider.' },
};

export function AIConfigBar({ aiConfig, saveAIConfigLocal, onOpenProviderManager, aiError, aiBusy, transfersAllowed, keyIsPersisted, verified }: Props) {
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Live preset list — updates instantly when a custom provider is added.
  const presets = usePresets();

  // Close the inline editor on outside click so it never covers content the user needs.
  useEffect(() => {
    if (!expanded) return undefined;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setExpanded(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const status = resolveStatus(aiConfig, aiError, transfersAllowed, verified);
  const meta = STATUS_META[status];
  const activePreset = presets.find(p => p.id === aiConfig.providerPresetId);

  return (
    <div className="ai-bar" ref={wrapperRef}>
      <div className="ai-bar-row">
        <span className="status-dot" style={{ background: meta.color }} aria-hidden="true" />

        <span className="ai-status-label" style={{ color: meta.color }} title={meta.hint}>
          {aiBusy ? 'Working…' : meta.label}
        </span>

        {/* Provider switch — one tap, no scrolling */}
        <select
          className="input ai-bar-select"
          value={aiConfig.providerPresetId || 'xai'}
          onChange={e => saveAIConfigLocal(applyPrimaryPreset(aiConfig, e.target.value))}
          aria-label="AI provider"
          title="Switch AI provider"
        >
          {presets.map(p => (
            <option key={p.id} value={p.id}>{p.label}{p.builtin ? '' : ' *'}</option>
          ))}
        </select>

        {/* Model switch */}
        <input
          className="input ai-bar-model"
          list="npi-bar-models"
          value={aiConfig.model}
          onChange={e => saveAIConfigLocal({ model: e.target.value })}
          aria-label="Model"
          placeholder="model"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <datalist id="npi-bar-models">
          {(activePreset?.models ?? []).map(m => <option key={m} value={m} />)}
        </datalist>

        {/* Key state — click to open the editor */}
        <button
          className="ai-key-chip"
          data-state={aiConfig.apiKey ? 'set' : 'missing'}
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          title={aiConfig.apiKey
            ? (keyIsPersisted
                ? 'API key is set and will survive a restart.'
                : 'API key is set for this session only. Turn on "Remember my AI key" in Privacy Controls to keep it.')
            : 'No API key set. Click to add one.'}
        >
          {aiConfig.apiKey ? keyLabel(aiConfig.apiKey) : 'No key'}
        </button>

        <button
          className="btn small"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-label="AI settings"
        >
          {expanded ? 'Close' : 'Settings'}
        </button>
      </div>

      {expanded && (
        <div className="ai-bar-panel">
          <div className="ai-bar-field">
            <label htmlFor="ai-bar-key">API key</label>
            <input
              id="ai-bar-key"
              className="input"
              type="password"
              value={aiConfig.apiKey}
              onChange={e => saveAIConfigLocal({ apiKey: e.target.value })}
              placeholder={activePreset?.apiKeyPlaceholder || 'Paste your key'}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="ai-bar-hint">
              {aiConfig.apiKey
                ? (keyIsPersisted
                    ? 'Saved on this device. Paste a new key any time to replace it.'
                    : 'Set for this session. Turn on "Remember my AI key" in Privacy Controls to keep it after a restart.')
                : 'Your key is only sent to the provider you pick above.'}
            </p>
          </div>

          <div className="ai-bar-field">
            <label htmlFor="ai-bar-url">Base URL</label>
            <input
              id="ai-bar-url"
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

          <div className="ai-bar-actions">
            <button className="btn small" onClick={onOpenProviderManager}>
              Providers / Test connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIConfigBar;
