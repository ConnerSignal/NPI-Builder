import { useEffect, useMemo, useState, useRef } from 'react';
import { artifacts, getArtifact } from './data/artifacts';
import { SMART_OPS_EXAMPLES } from './data/smartOpsExamples';
import { generateSection, loadAIConfig, saveAIConfig, type AIConfig } from './lib/ai';
import type { Project, ProjectVersion } from './lib/export';
import { exportMinimalistPdf, exportMinimalistDocx, exportProjectZip } from './lib/export';
import { Download, FolderOpen, History, RefreshCw, Save, Settings, Zap } from 'lucide-react';
import npiLogo from './assets/npi-builder-logo.jpg';

const STORAGE_KEY = 'npi-document-builder-project';

// Logical NPI document flow order for guided, low-friction experience
const WORKFLOW_ORDER = ['pcd', 'prd', 'pdd', 'sdd', 'hld', 'lld', 'risk-register', 'launch-checklist', 'post-launch-review'] as const;

function createEmptyProject(name = 'New Initiative'): Project {
  const docs: Record<string, Record<string, string>> = {};
  for (const a of artifacts) {
    docs[a.id] = {};
    for (const key of Object.keys(a.template)) docs[a.id][key] = '';
  }
  return {
    id: crypto.randomUUID(),
    name,
    context: '',
    documents: docs,
    updatedAt: new Date().toISOString(),
    history: [],
  };
}

function saveSnapshot(p: Project, label?: string): Project {
  const snapshot: ProjectVersion = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    label: label || `Checkpoint ${new Date().toLocaleTimeString()}`,
    snapshot: {
      name: p.name,
      context: p.context,
      documents: JSON.parse(JSON.stringify(p.documents)),
    },
  };
  const history = [...(p.history || [])];
  history.unshift(snapshot);
  // Keep last 12 versions
  if (history.length > 12) history.length = 12;
  return { ...p, history };
}

function restoreVersion(p: Project, versionId: string): Project {
  const version = (p.history || []).find(v => v.id === versionId);
  if (!version) return p;
  return {
    ...p,
    name: version.snapshot.name,
    context: version.snapshot.context,
    documents: JSON.parse(JSON.stringify(version.snapshot.documents)),
    updatedAt: new Date().toISOString(),
  };
}

function countFilled(doc: Record<string, string>): number {
  return Object.values(doc).filter(v => v && v.trim().length > 10).length;
}

// Very lightweight markdown renderer for preview (no external deps)
function renderSimpleMarkdown(text: string): string {
  if (!text) return '<em class="empty">No content yet</em>';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code `text`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Lists (simple - or * at start of line)
  html = html.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  // Line breaks
  html = html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>');
  html = '<p>' + html + '</p>';
  return html;
}

function insertFormatting(current: string, before: string, after = ''): string {
  // Simple append-with-format for now (good enough for polish pass)
  return current + (current ? '\n' : '') + before + after;
}

function App() {
  const [project, setProject] = useState<Project>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const loaded = JSON.parse(raw);
        // Graceful recovery message
        if (loaded && loaded.updatedAt) {
          const last = new Date(loaded.updatedAt);
          const minutesAgo = Math.floor((Date.now() - last.getTime()) / 60000);
          if (minutesAgo < 60) {
            // We'll show a non-intrusive banner
            (window as any).__npi_recovered = `Work recovered from ${last.toLocaleTimeString()} (${minutesAgo}m ago)`;
          }
        }
        if (!loaded.history) loaded.history = [];
        return loaded;
      }
    } catch {}
    return createEmptyProject();
  });

  const [selectedDocId, setSelectedDocId] = useState(artifacts[0].id);
  const [aiConfig, setAiConfig] = useState<AIConfig>(loadAIConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [lastAiError, setLastAiError] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [previewFields, setPreviewFields] = useState<Record<string, boolean>>({});
  const [lastSaved, setLastSaved] = useState<string>('Just now');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [isWizardMode, setIsWizardMode] = useState(false);

  // ProdBot popout state for movable floating window
  const [isProdBotPopped, setIsProdBotPopped] = useState(false);
  const [prodBotPos, setProdBotPos] = useState({ x: 80, y: 80 });
  const [isProdBotDragging, setIsProdBotDragging] = useState(false);
  const prodBotDragOffset = useRef({ x: 0, y: 0 });

  const [prodBotMessages, setProdBotMessages] = useState<Array<{role: 'user'|'bot', text: string}>>([
    { role: 'bot', text: "Hi, I'm ProdBot — your NPI co-pilot. Ask me anything about your documents, propagation, or next steps." }
  ]);
  const [prodBotInput, setProdBotInput] = useState('');

  // Super robust auto-save: immediate + debounced safety net
  const saveToStorage = (proj: Project) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(proj));
      const now = new Date();
      setLastSaved(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.warn('Auto-save failed', e);
    }
  };

  // Auto-save on every project change (already reactive)
  useEffect(() => {
    saveToStorage(project);
  }, [project]);

  // Extra safety: auto-checkpoint + save when user leaves the tab (prevents loss on crash/close)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Force a checkpoint when stepping away
        const snap = saveSnapshot(project, 'Auto-saved on tab away');
        saveToStorage(snap);
      }
    };
    const handleBeforeUnload = () => {
      saveToStorage(project);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [project]);

  // Show recovery message once on mount
  useEffect(() => {
    const msg = (window as any).__npi_recovered;
    if (msg) {
      setRecoveryMessage(msg);
      // Clear it after showing
      delete (window as any).__npi_recovered;
      // Auto-hide after 12 seconds
      setTimeout(() => setRecoveryMessage(null), 12000);
    }
  }, []);

  const selectedArtifact = useMemo(() => getArtifact(selectedDocId), [selectedDocId]);
  const currentDoc = project.documents[selectedDocId] || {};

  // Auto-persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  // Compute overall progress
  const progress = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const a of artifacts) {
      const doc = project.documents[a.id] || {};
      total += Object.keys(a.template).length;
      filled += countFilled(doc);
    }
    return { percent: total ? Math.round((filled / total) * 100) : 0, filled, total };
  }, [project.documents]);

  const docProgress = useMemo(() => {
    const total = Object.keys(selectedArtifact.template).length;
    const filled = countFilled(currentDoc);
    return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
  }, [currentDoc, selectedArtifact]);

  function updateProject(updater: (p: Project) => Project) {
    setProject(prev => {
      const next = updater(prev);
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }

  function updateField(fieldKey: string, value: string, autoSnapshot = false) {
    updateProject(p => {
      const next = {
        ...p,
        documents: {
          ...p.documents,
          [selectedDocId]: {
            ...(p.documents[selectedDocId] || {}),
            [fieldKey]: value,
          },
        },
      };
      return autoSnapshot ? saveSnapshot(next, `Edited ${fieldKey}`) : next;
    });
  }

  function togglePreview(fieldKey: string) {
    setPreviewFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  }

  function applyFormat(fieldKey: string, prefix: string, suffix = '') {
    const current = currentDoc[fieldKey] || '';
    const newValue = insertFormatting(current, prefix, suffix);
    updateField(fieldKey, newValue);
  }

  function loadExample(full = false) {
    updateProject(p => {
      const nextDocs = { ...p.documents };
      const examplesToUse = full ? SMART_OPS_EXAMPLES : SMART_OPS_EXAMPLES;
      for (const [docId, fields] of Object.entries(examplesToUse)) {
        nextDocs[docId] = { ...(nextDocs[docId] || {}), ...fields };
      }
      const newProject = { ...p, name: p.name === 'New Initiative' || p.name.startsWith('Untitled') ? 'SmartOps Portal' : p.name, documents: nextDocs };
      return saveSnapshot(newProject, full ? 'Loaded full SmartOps example' : 'Loaded SmartOps example');
    });
  }

  function checkpoint() {
    updateProject(p => saveSnapshot(p, 'Manual checkpoint'));
  }

  function restore(versionId: string) {
    updateProject(p => restoreVersion(p, versionId));
  }

  // Frictionless guided workflow helpers
  const currentWorkflowIndex = WORKFLOW_ORDER.indexOf(selectedDocId as any);
  const nextDocId = currentWorkflowIndex >= 0 && currentWorkflowIndex < WORKFLOW_ORDER.length - 1 
    ? WORKFLOW_ORDER[currentWorkflowIndex + 1] 
    : null;
  const prevDocId = currentWorkflowIndex > 0 
    ? WORKFLOW_ORDER[currentWorkflowIndex - 1] 
    : null;

  function goToNextStep() {
    if (nextDocId) {
      // Gentle auto-suggestion: if current is well filled, offer to seed the next doc with context
      const currentFill = countFilled(currentDoc);
      const currentTotal = Object.keys(selectedArtifact.template).length;
      if (currentFill / currentTotal > 0.6 && nextDocId) {
        // Auto-generate a starter for the next document using current context (low friction!)
        const nextArt = getArtifact(nextDocId);
        const firstField = Object.keys(nextArt.template)[0];
        if (firstField && !project.documents[nextDocId]?.[firstField]) {
          // Fire a background starter generation
          generateStarterForNext(nextDocId, firstField);
        }
      }
      setSelectedDocId(nextDocId);
    }
  }

  function goToPrevStep() {
    if (prevDocId) setSelectedDocId(prevDocId);
  }

  async function generateStarterForNext(nextId: string, fieldKey: string) {
    try {
      const nextArt = getArtifact(nextId);
      const summary = `${selectedArtifact.shortName} summary:\n${Object.entries(currentDoc)
        .filter(([,v]) => v).map(([k,v]) => `${k}: ${v.slice(0,160)}`).join('\n')}`;

      const result = await generateSection(aiConfig, {
        artifactName: nextArt.name,
        shortName: nextArt.shortName,
        fieldKey,
        fieldGuidance: nextArt.template[fieldKey],
        currentValue: '',
        projectContext: project.context,
        otherContext: summary,
        mode: 'generate',
      });

      updateProject(p => {
        const nextDocs = { ...p.documents };
        nextDocs[nextId] = { ...(nextDocs[nextId] || {}), [fieldKey]: result };
        return saveSnapshot({ ...p, documents: nextDocs }, `Auto-seeded ${nextArt.shortName} from ${selectedArtifact.shortName}`);
      });
      setLastAiError(null);
    } catch (e) {
      // non-blocking
    }
  }

  // Stronger propagation: Draft entire next document(s) from all upstream context
  async function propagateToNext(targetDocId?: string) {
    const target = targetDocId || nextDocId;
    if (!target) return;

    setAiBusy('propagation');
    setLastAiError(null);

    try {
      const targetArt = getArtifact(target);
      const upstreamSummary: string[] = [];

      // Collect strong context from all previous documents in the chain
      const targetIdx = WORKFLOW_ORDER.indexOf(target as any);
      for (let i = 0; i < targetIdx; i++) {
        const upId = WORKFLOW_ORDER[i];
        const upDoc = project.documents[upId] || {};
        const filled = Object.entries(upDoc).filter(([,v]) => v && v.trim().length > 20);
        if (filled.length) {
          upstreamSummary.push(`${getArtifact(upId).shortName}:\n${filled.map(([k,v]) => `${k}: ${v.slice(0,220)}`).join('\n')}`);
        }
      }

      // For each field in target, generate with rich upstream context
      for (const [fieldKey, guidance] of Object.entries(targetArt.template)) {
        const currentVal = project.documents[target]?.[fieldKey] || '';
        if (currentVal.trim().length > 30) continue; // respect existing work

        const result = await generateSection(aiConfig, {
          artifactName: targetArt.name,
          shortName: targetArt.shortName,
          fieldKey,
          fieldGuidance: guidance,
          currentValue: currentVal,
          projectContext: project.context,
          otherContext: upstreamSummary.join('\n\n---\n\n'),
          mode: currentVal ? 'refine' : 'generate',
        });

        updateProject(p => {
          const nextDocs = { ...p.documents };
          nextDocs[target] = { ...(nextDocs[target] || {}), [fieldKey]: result };
          return p; // we'll snapshot at the end
        });

        await new Promise(r => setTimeout(r, 280));
      }

      updateProject(p => saveSnapshot(p, `Propagated from upstream into ${targetArt.shortName}`));
    } catch (e: any) {
      setLastAiError(e?.message || String(e));
    } finally {
      setAiBusy(null);
    }
  }

  function getSmartNextAction() {
    const fillPct = docProgress.percent;
    if (fillPct < 40) return `Fill more of the current ${selectedArtifact.shortName} or use AI on empty fields.`;
    if (fillPct < 80 && nextDocId) return `You're making good progress. Ready to move to ${getArtifact(nextDocId).shortName}?`;
    if (nextDocId) return `Consider moving to the next step: ${getArtifact(nextDocId).shortName}`;
    return 'Great work! Review the full set or run a consistency check.';
  }

  // ProdBot - permanent Smart Assistant
  async function sendToProdBot(message: string) {
    if (!message.trim()) return;

    const userMsg = { role: 'user' as const, text: message };
    setProdBotMessages(prev => [...prev, userMsg]);
    setProdBotInput('');
    setAiBusy('prodbot');

    try {
      // Build rich context for ProdBot
      const contextSummary = `Current document: ${selectedArtifact.shortName} (${docProgress.percent}% filled)\n` +
        Object.entries(currentDoc).filter(([,v]) => v).map(([k,v]) => `${k}: ${v.slice(0,140)}`).join('\n') + '\n\n' +
        `Project context: ${project.context.slice(0,300)}\n\n` +
        `Upstream progress: ${WORKFLOW_ORDER.slice(0, WORKFLOW_ORDER.indexOf(selectedDocId as any)).map(id => {
          const d = project.documents[id] || {};
          return `${getArtifact(id).shortName}: ${countFilled(d)} fields`;
        }).join(', ')}`;

      const result = await generateSection(aiConfig, {
        artifactName: 'ProdBot Assistant',
        shortName: 'PRODBOT',
        fieldKey: 'Response',
        fieldGuidance: 'You are ProdBot, a helpful, concise NPI co-pilot. Be direct, actionable, and encouraging. Answer the user question using the provided project state.',
        currentValue: '',
        projectContext: project.context,
        otherContext: contextSummary,
        mode: 'generate',
        userInstruction: message,
      });

      setProdBotMessages(prev => [...prev, { role: 'bot', text: result }]);
    } catch (e: any) {
      setProdBotMessages(prev => [...prev, { role: 'bot', text: `Sorry, I had trouble: ${e.message || e}` }]);
    } finally {
      setAiBusy(null);
    }
  }

  // Keyboard shortcuts - low friction power user features
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        checkpoint();
      }
      if (meta && e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextStep();
      }
      if (meta && e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevStep();
      }
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        // Focus ProdBot input
        const input = document.getElementById('prodbot-input');
        input?.focus();
      }
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsWizardMode(!isWizardMode);
      }
      if (e.key === 'Escape') {
        if (isWizardMode) setIsWizardMode(false);
        if (showHistory) setShowHistory(false);
        if (showSettings) setShowSettings(false);
        if (isProdBotPopped) setIsProdBotPopped(false); // dock on escape
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        bulkFillEmpty(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedDocId, project, isWizardMode, showHistory, showSettings, isProdBotPopped]);

  // Dragging logic for popped-out ProdBot (mouse + touch for any device)
  useEffect(() => {
    if (!isProdBotPopped) return;

    const handleMove = (clientX: number, clientY: number) => {
      const newX = clientX - prodBotDragOffset.current.x;
      const newY = clientY - prodBotDragOffset.current.y;

      // Clamp to viewport with some padding
      const maxX = window.innerWidth - 380; // approx width
      const maxY = window.innerHeight - 120;
      setProdBotPos({
        x: Math.max(20, Math.min(newX, maxX)),
        y: Math.max(20, Math.min(newY, maxY)),
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isProdBotDragging) handleMove(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isProdBotDragging && e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const stopDrag = () => setIsProdBotDragging(false);

    if (isProdBotDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', stopDrag);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', stopDrag);
    };
  }, [isProdBotDragging, isProdBotPopped]);

  function resetProject() {
    if (!confirm('Reset current project to a blank new one?')) return;
    const fresh = createEmptyProject();
    setProject(fresh);
    setSelectedDocId(artifacts[0].id);
  }

  function newProject() {
    const fresh = createEmptyProject('Untitled Initiative ' + (Date.now() % 1000));
    setProject(fresh);
    setSelectedDocId(artifacts[0].id);
  }

  async function runAI(fieldKey: string, mode: 'generate' | 'refine' | 'critique') {
    const key = `${selectedDocId}:${fieldKey}:${mode}`;
    setAiBusy(key);
    setLastAiError(null);

    const guidance = selectedArtifact.template[fieldKey] || '';
    const currentValue = currentDoc[fieldKey] || '';

    // Build lightweight other context from other filled docs
    const otherParts: string[] = [];
    for (const a of artifacts) {
      if (a.id === selectedDocId) continue;
      const d = project.documents[a.id] || {};
      const sample = Object.entries(d).filter(([,v]) => v && v.length > 20).slice(0, 2);
      if (sample.length) otherParts.push(`${a.shortName}: ${sample.map(([k,v]) => `${k}=${v.slice(0,120)}`).join('; ')}`);
    }

    try {
      const result = await generateSection(aiConfig, {
        artifactName: selectedArtifact.name,
        shortName: selectedArtifact.shortName,
        fieldKey,
        fieldGuidance: guidance,
        currentValue,
        projectContext: project.context,
        otherContext: otherParts.join('\n') || undefined,
        mode,
        userInstruction: customInstruction || undefined,
      });

      if (mode === 'critique') {
        const note = `\n\n--- AI Critique (${new Date().toLocaleTimeString()}) ---\n${result}`;
        updateField(fieldKey, (currentDoc[fieldKey] || '') + note, true);
      } else {
        updateField(fieldKey, result, true);
      }
      setCustomInstruction('');
      // Friendly micro-feedback so user feels progress without swivel
      setLastAiError(null);
      // If this was the last empty field, gently suggest next doc
      setTimeout(() => {
        const stillEmpty = Object.keys(selectedArtifact.template).some(k => {
          const v = (project.documents[selectedDocId] || {})[k];
          return !v || v.trim().length < 15;
        });
        if (!stillEmpty && nextDocId) {
          // Non-blocking hint
          console.log('%c[Builder] All fields filled — next step available', 'color:#22d3ee');
        }
      }, 800);
    } catch (e: any) {
      setLastAiError(e?.message || String(e));
    } finally {
      setAiBusy(null);
    }
  }

  async function bulkFillEmpty(regenerateAll = false) {
    setAiBusy('bulk');
    setLastAiError(null);
    const fieldsToProcess = Object.keys(selectedArtifact.template).filter(k => 
      regenerateAll || !currentDoc[k] || currentDoc[k].trim().length < 15
    );

    for (const fieldKey of fieldsToProcess) {
      try {
        const guidance = selectedArtifact.template[fieldKey];
        const result = await generateSection(aiConfig, {
          artifactName: selectedArtifact.name,
          shortName: selectedArtifact.shortName,
          fieldKey,
          fieldGuidance: guidance,
          currentValue: regenerateAll ? (currentDoc[fieldKey] || '') : '',
          projectContext: project.context,
          mode: regenerateAll ? 'refine' : 'generate',
        });
        updateField(fieldKey, result);
        await new Promise(r => setTimeout(r, 380));
      } catch (e: any) {
        setLastAiError(`Stopped at ${fieldKey}: ${e?.message || e}`);
        break;
      }
    }
    // Auto-checkpoint after bulk AI work
    updateProject(p => saveSnapshot(p, regenerateAll ? 'Bulk regenerate' : 'Bulk AI fill'));
    setAiBusy(null);
  }

  async function runConsistencyReview() {
    setAiBusy('consistency');
    setLastAiError(null);

    // Build a summary of all documents
    const summary: string[] = [];
    for (const a of artifacts) {
      const doc = project.documents[a.id] || {};
      const filled = Object.entries(doc).filter(([,v]) => v && v.trim().length > 20).map(([k,v]) => `${k}: ${v.slice(0,180)}`);
      if (filled.length) summary.push(`${a.shortName}:\n${filled.join('\n')}`);
    }

    try {
      const result = await generateSection(aiConfig, {
        artifactName: 'Cross-Artifact Review',
        shortName: 'REVIEW',
        fieldKey: 'Consistency',
        fieldGuidance: 'Review the entire set of NPI documents for consistency, gaps, contradictions, and missing linkages. Suggest specific improvements.',
        currentValue: '',
        projectContext: project.context,
        otherContext: summary.join('\n\n---\n\n'),
        mode: 'generate',
        userInstruction: customInstruction || 'Focus on traceability between PCD → PRD → PDD → technical docs and risks.',
      });

      // Append the review as a special note to the current document or show in alert for now
      const reviewNote = `\n\n--- AI Consistency Review (${new Date().toLocaleString()}) ---\n${result}`;
      updateField(Object.keys(selectedArtifact.template)[0], (currentDoc[Object.keys(selectedArtifact.template)[0]] || '') + reviewNote);
      updateProject(p => saveSnapshot(p, 'Consistency review'));
    } catch (e: any) {
      setLastAiError(e?.message || String(e));
    } finally {
      setAiBusy(null);
    }
  }

  function saveAIConfigLocal(partial: Partial<AIConfig>) {
    const next = saveAIConfig(partial);
    setAiConfig(next);
  }

  async function testAI() {
    try {
      setLastAiError(null);
      const test = await generateSection(aiConfig, {
        artifactName: 'Test',
        shortName: 'TEST',
        fieldKey: 'Connection',
        fieldGuidance: 'Confirm the connection works by returning the single word: OK',
        currentValue: '',
        projectContext: '',
        mode: 'generate',
      });
      if (test.toUpperCase().includes('OK')) {
        alert('Connection successful! AI responded correctly.');
      } else {
        alert('Connected but response was: ' + test.slice(0, 140));
      }
    } catch (e: any) {
      setLastAiError(e?.message || String(e));
    }
  }

  // Simple folder save (File System Access API - Chrome/Edge)
  async function saveToFolder() {
    if (!('showDirectoryPicker' in window)) {
      alert('Folder picker requires a modern Chromium browser (Edge/Chrome). Use "Export ZIP" instead.');
      return;
    }
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      // write project.json
      const pj = await dir.getFileHandle('project.json', { create: true });
      const w1 = await pj.createWritable();
      await w1.write(JSON.stringify(project, null, 2));
      await w1.close();

      // write per-doc mds
      const docsDirHandle = await dir.getDirectoryHandle('docs', { create: true });
      for (const [docId, fields] of Object.entries(project.documents)) {
        const art = getArtifact(docId);
        let content = `# ${art.shortName} — ${art.name}\n\nProject: ${project.name}\n\n`;
        for (const [k, v] of Object.entries(fields)) {
          content += `## ${k}\n\n${v}\n\n`;
        }
        const fh = await docsDirHandle.getFileHandle(`${art.shortName.toLowerCase()}.md`, { create: true });
        const w = await fh.createWritable();
        await w.write(content);
        await w.close();
      }
      alert('Saved to selected folder (project.json + docs/).');
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('Folder save failed: ' + (e?.message || e));
    }
  }

  function loadProjectJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const loaded: Project = JSON.parse(reader.result as string);
        // minimal validation
        if (!loaded.documents || !loaded.name) throw new Error('Invalid project file');
        // Ensure history array exists for older projects
        if (!loaded.history) loaded.history = [];
        setProject(loaded);
        setSelectedDocId(Object.keys(loaded.documents)[0] || artifacts[0].id);
      } catch (e: any) {
        alert('Failed to load project: ' + e.message);
      }
    };
    reader.readAsText(file);
  }



  return (
    <div className="app">
      {/* LEFT: Project + Document list */}
      <aside className="sidebar">
        <div>
          <div className="chip" style={{ marginBottom: 6 }}>Standalone</div>
          <img 
            src={npiLogo} 
            alt="NPI Builder" 
            style={{ width: '100%', maxWidth: '210px', height: 'auto', display: 'block', marginBottom: '6px' }} 
          />
          <div className="stat">AI-assisted • {artifacts.length} artifacts</div>
        </div>

        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={newProject}><RefreshCw size={14} style={{ marginRight: 4 }} /> New</button>
          <button className="btn small" onClick={resetProject}>Reset</button>
          <button className="btn small primary" onClick={() => loadExample(false)}>SmartOps</button>
          <button className="btn small" onClick={() => loadExample(true)} title="Load complete filled examples for all documents">Full</button>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Project name</label>
          <input
            className="input"
            value={project.name}
            onChange={e => updateProject(p => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="section-head" style={{ marginBottom: 6 }}>
            <strong style={{ fontSize: '0.85rem' }}>Documents</strong>
            <span className="stat">{progress.filled}/{progress.total} fields • {progress.percent}%</span>
          </div>
          <div className="doc-list">
            {artifacts.map(art => {
              const doc = project.documents[art.id] || {};
              const f = countFilled(doc);
              const t = Object.keys(art.template).length;
              const pct = t ? Math.round((f / t) * 100) : 0;
              const isActive = art.id === selectedDocId;
              return (
                <button
                  key={art.id}
                  className={`doc-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedDocId(art.id)}
                >
                  <div>
                    <div className="name">{art.shortName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{art.name}</div>
                  </div>
                  <div className="status">{f}/{t} ({pct}%)</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: '0.72rem', color: 'var(--muted)' }}>
          Data stays in your browser (localStorage) until you export.<br />
          Use exports or "Save to folder" for true portability.
        </div>
      </aside>

      {/* MAIN EDITOR */}
      <main className="main">
        {/* Recovery banner - super important for not losing work */}
        {recoveryMessage && (
          <div style={{ 
            background: 'rgba(34, 211, 238, 0.12)', 
            border: '1px solid var(--accent)', 
            padding: '8px 14px', 
            borderRadius: 10, 
            marginBottom: 12,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            ✅ {recoveryMessage}
            <button className="btn small" onClick={() => setRecoveryMessage(null)} style={{ marginLeft: 'auto' }}>Got it</button>
          </div>
        )}

        <div className="header">
          <h2>{selectedArtifact.shortName} — {selectedArtifact.name}</h2>
          <span className="chip">{docProgress.filled}/{docProgress.total} filled • {docProgress.percent}%</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="stat" style={{ fontSize: '0.75rem' }}>Auto-saved {lastSaved}</span>
            <button className="btn" onClick={() => setShowSettings(true)}><Settings size={15} style={{ marginRight: 6 }} /> AI Settings</button>
          </div>
        </div>

        {/* Frictionless Workflow Bar */}
        <div className="panel" style={{ padding: '10px 16px', marginBottom: 14, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Guided Flow:</div>
            {WORKFLOW_ORDER.map((id) => {
              const art = getArtifact(id);
              const isCurrent = id === selectedDocId;
              const doc = project.documents[id] || {};
              const filled = countFilled(doc);
              const total = Object.keys(art.template).length;
              const pct = total ? Math.round(filled / total * 100) : 0;
              return (
                <button 
                  key={id}
                  onClick={() => setSelectedDocId(id)}
                  className={`btn small ${isCurrent ? 'primary' : ''}`}
                  style={{ 
                    fontSize: '0.75rem', 
                    padding: '4px 10px',
                    opacity: isCurrent ? 1 : 0.85 
                  }}
                  title={`${art.name} — ${pct}% complete`}
                >
                  {art.shortName} {pct > 0 && `(${pct}%)`}
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn small" disabled={!prevDocId} onClick={goToPrevStep}>← Prev</button>
              <button className="btn small primary" disabled={!nextDocId} onClick={goToNextStep}>
                Next → {nextDocId ? getArtifact(nextDocId).shortName : ''}
              </button>
              <button className="btn small" onClick={() => setIsWizardMode(true)} title="Enter focused wizard mode (Cmd/Ctrl+K)">
                Wizard
              </button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
            {getSmartNextAction()}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <div>
              <p style={{ margin: 0, color: 'var(--muted)' }}>{selectedArtifact.definition}</p>
              <p style={{ marginTop: 4, fontSize: '0.85rem' }}><strong>Purpose:</strong> {selectedArtifact.purpose}</p>
            </div>
            <button className="btn small" onClick={() => bulkFillEmpty(false)} disabled={!!aiBusy}>
              <Zap size={14} style={{ marginRight: 4 }} /> {aiBusy === 'bulk' ? 'Working…' : 'AI Fill empty'}
            </button>
          </div>

          {/* Always-visible helpfulness - no need to remember best practices */}
          <div style={{ 
            fontSize: '0.78rem', 
            background: 'rgba(255,255,255,0.04)', 
            padding: '8px 12px', 
            borderRadius: 8, 
            marginBottom: 10,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10
          }}>
            <div>
              <strong style={{ color: 'var(--good)' }}>Best practices</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: 'var(--muted)' }}>
                {selectedArtifact.bestPractices.slice(0, 2).map((bp, i) => <li key={i}>{bp}</li>)}
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--bad)' }}>Watch out for</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: 'var(--muted)' }}>
                {selectedArtifact.mistakes.slice(0, 2).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Additional instructions for AI</label>
            <textarea
              className="field-input"
              style={{ minHeight: 42, fontSize: '0.85rem' }}
              placeholder="e.g. Emphasize integration risks..."
              value={customInstruction}
              onChange={e => setCustomInstruction(e.target.value)}
            />
          </div>

          {/* Super low-friction AI actions */}
          <div className="ai-row" style={{ marginBottom: 8, gap: '5px', flexWrap: 'wrap' }}>
            <button 
              className="btn small primary" 
              disabled={!!aiBusy} 
              onClick={() => bulkFillEmpty(false)}
              title="Fill all empty sections in this document using AI + your project context"
            >
              {aiBusy === 'bulk' ? 'Working…' : '✨ Fill remaining sections'}
            </button>
            <button 
              className="btn small" 
              disabled={!!aiBusy} 
              onClick={() => bulkFillEmpty(true)}
            >
              {aiBusy === 'bulk' ? 'Working…' : 'Regenerate this doc'}
            </button>
            <button 
              className="btn small" 
              disabled={!!aiBusy} 
              onClick={runConsistencyReview}
              title="AI reviews all your documents together for consistency and gaps"
            >
              {aiBusy === 'consistency' ? 'Reviewing…' : '🔍 Full consistency check'}
            </button>
            <button className="btn small" onClick={checkpoint}>
              <History size={13} style={{ marginRight: 3 }} /> Checkpoint
            </button>
            <button className="btn small" onClick={() => setShowHistory(!showHistory)}>
              History {(project.history?.length || 0) > 0 ? `(${project.history!.length})` : ''}
            </button>
          </div>

          {/* One big friendly button to remove swivel-chair work */}
          {nextDocId && docProgress.percent > 50 && (
            <div style={{ marginBottom: 8 }}>
              <button 
                className="btn" 
                style={{ width: '100%', justifyContent: 'center' }} 
                onClick={goToNextStep}
              >
                ✨ Continue to {getArtifact(nextDocId).shortName} (AI can help seed it from here)
              </button>
            </div>
          )}

          {lastAiError && (
            <div style={{ color: 'var(--bad)', background: 'rgba(248, 113, 113, 0.12)', padding: 8, borderRadius: 8, marginBottom: 8, fontSize: '0.85rem' }}>
              AI error: {lastAiError}
            </div>
          )}

          {Object.entries(selectedArtifact.template).map(([key, guidance]) => {
            const value = currentDoc[key] || '';
            const busyKey = `${selectedDocId}:${key}`;
            const isBusy = aiBusy?.startsWith(busyKey);
            const showPreview = previewFields[key];

            return (
              <div className="field" key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="field-label">{key}</div>
                  <button 
                    className="btn small" 
                    onClick={() => togglePreview(key)}
                    style={{ fontSize: '0.7rem' }}
                  >
                    {showPreview ? 'Edit' : 'Preview'}
                  </button>
                </div>
                <div className="field-hint">{guidance}</div>

                {!showPreview ? (
                  <>
                    <textarea
                      className="field-input"
                      value={value}
                      onChange={e => updateField(key, e.target.value)}
                      placeholder="Write or let AI generate... (Markdown supported)"
                    />
                    {/* Markdown toolbar */}
                    <div className="ai-row" style={{ marginTop: '4px', gap: '4px' }}>
                      <button className="btn small" onClick={() => applyFormat(key, '**', '**')}>**B**</button>
                      <button className="btn small" onClick={() => applyFormat(key, '*', '*')}>*I*</button>
                      <button className="btn small" onClick={() => applyFormat(key, '- ')}>- List</button>
                      <button className="btn small" onClick={() => applyFormat(key, '`', '`')}>`code`</button>
                      <button className="btn small" onClick={() => applyFormat(key, '\n\n> ')}>Quote</button>
                    </div>
                  </>
                ) : (
                  <div 
                    className="field-input" 
                    style={{ 
                      minHeight: '92px', 
                      background: '#0f1a33', 
                      padding: '10px 12px', 
                      fontSize: '0.9rem',
                      lineHeight: 1.5,
                      overflow: 'auto'
                    }}
                    dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(value) }}
                  />
                )}

                <div className="ai-row">
                  <button className="btn small" disabled={!!aiBusy} onClick={() => runAI(key, 'generate')}>
                    {isBusy && aiBusy?.includes(':generate') ? 'Generating…' : 'AI Generate'}
                  </button>
                  <button className="btn small" disabled={!!aiBusy || !value} onClick={() => runAI(key, 'refine')}>
                    {isBusy && aiBusy?.includes(':refine') ? 'Refining…' : 'AI Refine'}
                  </button>
                  <button className="btn small" disabled={!!aiBusy || !value} onClick={() => runAI(key, 'critique')}>
                    {isBusy && aiBusy?.includes(':critique') ? 'Critiquing…' : 'AI Critique'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel" style={{ fontSize: '0.85rem' }}>
          <strong>Best practices (from the guide)</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
            {selectedArtifact.bestPractices.map((bp, i) => <li key={i}>{bp}</li>)}
          </ul>
        </div>
      </main>

      {/* RIGHT: Context + Actions + Export */}
      <aside className="right">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <strong>Project Context</strong>
          </div>
          <textarea
            className="field-input"
            style={{ minHeight: 110 }}
            placeholder="Describe the product initiative, business goals, known constraints, target users, or any facts the AI should always consider..."
            value={project.context}
            onChange={e => updateProject(p => ({ ...p, context: e.target.value }))}
          />
          <div className="stat" style={{ marginTop: 6 }}>This text is sent with every AI request for consistency.</div>
        </div>

        <div className="panel">
          <div style={{ marginBottom: 8 }}>
            <strong>Overall progress</strong>
            <div className="progress"><div style={{ width: `${progress.percent}%` }} /></div>
            <div className="stat">{progress.filled} of {progress.total} fields filled across all documents ({progress.percent}%)</div>
          </div>

          <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
            <button 
              className="btn primary" 
              onClick={() => exportMinimalistPdf(project)}
              title="Slick minimalist PDF — the recommended polished output"
            >
              <Download size={14} style={{ marginRight: 4 }} /> Export Full Pack (PDF)
            </button>
            <button className="btn" onClick={() => exportMinimalistDocx(project, selectedDocId)}>
              <Download size={14} style={{ marginRight: 4 }} /> {selectedArtifact.shortName} .docx
            </button>
            <button className="btn" onClick={() => exportProjectZip(project)}>
              <Download size={14} style={{ marginRight: 4 }} /> Full .zip (MDs)
            </button>
            <button className="btn" onClick={saveToFolder}>
              <FolderOpen size={14} style={{ marginRight: 4 }} /> Save files to folder (Chromium)
            </button>
          </div>

          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Load project from JSON</label>
            <input
              type="file"
              accept="application/json"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) loadProjectJson(f);
                e.currentTarget.value = '';
              }}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => {
              const data = JSON.stringify(project, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `${project.name.replace(/\s+/g,'_')}.npi-project.json`;
              a.click(); URL.revokeObjectURL(url);
            }}>
              <Save size={14} style={{ marginRight: 4 }} /> Download project JSON
            </button>
          </div>
        </div>

        {/* History panel (toggled from header) */}
        {showHistory && (
          <div className="panel" style={{ fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Version History</strong>
              <button className="btn small" onClick={() => setShowHistory(false)}>Close</button>
            </div>
            {(project.history && project.history.length > 0) ? (
              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                {project.history.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <div>{v.label || 'Snapshot'}</div>
                      <div className="stat" style={{ fontSize: '0.7rem' }}>{new Date(v.timestamp).toLocaleString()}</div>
                    </div>
                    <button className="btn small" onClick={() => restore(v.id)}>Restore</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stat">No checkpoints yet. Use "Checkpoint" button after major changes.</div>
            )}
          </div>
        )}

        {/* Docked ProdBot (compact in sidebar) */}
        {!isProdBotPopped && (
          <div className="panel" style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', maxHeight: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong>ProdBot</strong>
              <div style={{ display: 'flex', gap: 4 }}>
                <button 
                  className="btn small" 
                  onClick={() => setIsProdBotPopped(true)}
                  title="Pop out ProdBot into a movable floating window"
                >
                  Pop out ↗
                </button>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', alignSelf: 'center' }}>NPI co-pilot</span>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#0f1a33', padding: 6, borderRadius: 6, marginBottom: 6, fontSize: '0.75rem', maxHeight: 160 }}>
              {prodBotMessages.slice(-3).map((m, i) => (
                <div key={i} style={{ marginBottom: 4, color: m.role === 'bot' ? 'var(--text)' : 'var(--accent)' }}>
                  <strong>{m.role === 'bot' ? 'ProdBot' : 'You'}:</strong> {m.text.length > 90 ? m.text.slice(0,87) + '...' : m.text}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <input
                id="prodbot-input"
                className="input"
                style={{ flex: 1, fontSize: '0.75rem' }}
                placeholder="Ask ProdBot..."
                value={prodBotInput}
                onChange={e => setProdBotInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendToProdBot(prodBotInput); }}
              />
              <button className="btn small" onClick={() => sendToProdBot(prodBotInput)} disabled={!!aiBusy || !prodBotInput.trim()}>Send</button>
            </div>

            <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
              <button className="btn small" disabled={!!aiBusy} onClick={() => propagateToNext()}>Propagate</button>
              <button className="btn small" disabled={!!aiBusy} onClick={runConsistencyReview}>Audit</button>
              <button className="btn small" onClick={() => sendToProdBot('What should I do next?')}>Next?</button>
            </div>
          </div>
        )}

        <div className="panel" style={{ fontSize: '0.8rem' }}>
          <div><strong>AI Provider</strong></div>
          <div className="stat" style={{ margin: '4px 0' }}>{aiConfig.baseUrl} — {aiConfig.model}</div>
          <button className="btn small" onClick={() => setShowSettings(true)}>Edit AI settings</button>
          {aiConfig.apiKey && <div className="chip" style={{ marginTop: 8, display: 'inline-block' }}>Key stored locally</div>}
        </div>

        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', padding: '0 4px' }}>
          Shortcuts: ⌘S checkpoint • ⌘→ next doc • / focus ProdBot • ⌘K wizard
        </div>
      </aside>

      {/* Popped-out movable ProdBot - floating window for maximum screen real estate and any device */}
      {isProdBotPopped && (
        <div
          style={{
            position: 'fixed',
            left: prodBotPos.x,
            top: prodBotPos.y,
            width: 420,
            maxWidth: 'calc(100vw - 40px)',
            height: 520,
            maxHeight: 'calc(100vh - 60px)',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
            zIndex: 300,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontSize: '0.9rem',
          }}
        >
          {/* Drag handle / title bar */}
          <div
            onMouseDown={(e) => {
              setIsProdBotDragging(true);
              prodBotDragOffset.current = {
                x: e.clientX - prodBotPos.x,
                y: e.clientY - prodBotPos.y,
              };
            }}
            onTouchStart={(e) => {
              if (e.touches.length > 0) {
                setIsProdBotDragging(true);
                prodBotDragOffset.current = {
                  x: e.touches[0].clientX - prodBotPos.x,
                  y: e.touches[0].clientY - prodBotPos.y,
                };
              }
            }}
            style={{
              padding: '8px 12px',
              background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
              color: 'white',
              cursor: 'move',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            <span>ProdBot — NPI Co-Pilot (drag me)</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button 
                onClick={() => setIsProdBotPopped(false)} 
                style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                Dock
              </button>
              <button 
                onClick={() => setIsProdBotPopped(false)} 
                style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Full chat area - maximized for capability */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#0f1a33', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prodBotMessages.map((m, i) => (
              <div 
                key={i} 
                style={{ 
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? 'var(--accent)' : '#16233f',
                  color: m.role === 'user' ? '#0b1428' : 'var(--text)',
                  padding: '8px 12px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  fontSize: '0.88rem',
                  lineHeight: 1.35,
                }}
              >
                {m.text}
              </div>
            ))}
          </div>

          {/* Input + actions - full power */}
          <div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--panel)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                id="prodbot-input"
                className="input"
                style={{ flex: 1 }}
                placeholder="Ask anything... (e.g. propagate, review risks, suggest next)"
                value={prodBotInput}
                onChange={e => setProdBotInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendToProdBot(prodBotInput); }}
              />
              <button className="btn" onClick={() => sendToProdBot(prodBotInput)} disabled={!!aiBusy || !prodBotInput.trim()}>Send</button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn small" disabled={!!aiBusy} onClick={() => propagateToNext()}>Propagate upstream</button>
              <button className="btn small" disabled={!!aiBusy} onClick={runConsistencyReview}>Full consistency review</button>
              <button className="btn small" onClick={() => sendToProdBot('Give me the best next action right now')}>Best next action</button>
              <button className="btn small" onClick={() => sendToProdBot('Review all documents for gaps or contradictions')}>Audit everything</button>
            </div>
          </div>
        </div>
      )}

      {/* Wizard-style full-screen mode */}
      {isWizardMode && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(11, 20, 40, 0.98)', zIndex: 200,
          display: 'flex', flexDirection: 'column', padding: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>Wizard Mode — {selectedArtifact.shortName}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => propagateToNext()}>Propagate from upstream</button>
              <button className="btn primary" onClick={goToNextStep} disabled={!nextDocId}>Next Document</button>
              <button className="btn" onClick={() => setIsWizardMode(false)}>Exit Wizard (Esc)</button>
            </div>
          </div>

          {/* Big stepper */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {WORKFLOW_ORDER.map((id, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 999, fontSize: '0.85rem',
                background: id === selectedDocId ? 'var(--accent)' : '#16233f',
                color: id === selectedDocId ? '#0b1428' : 'var(--text)',
                border: '1px solid var(--border)'
              }}>
                {getArtifact(id).shortName}
              </div>
            ))}
          </div>

          {/* Focused editor area (reuse same logic but bigger) */}
          <div style={{ flex: 1, overflow: 'auto', background: '#16233f', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow)' }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              <h3 style={{ marginBottom: 8 }}>{selectedArtifact.name}</h3>
              <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{selectedArtifact.purpose}</p>

              {Object.entries(selectedArtifact.template).map(([key, guidance]) => {
                const value = currentDoc[key] || '';
                const showPreview = previewFields[key];
                return (
                  <div key={key} style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{key}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>{guidance}</div>
                    {!showPreview ? (
                      <textarea
                        className="field-input"
                        value={value}
                        onChange={e => updateField(key, e.target.value)}
                        style={{ minHeight: 110, fontSize: '1rem' }}
                      />
                    ) : (
                      <div className="field-input" style={{ minHeight: 110, background: '#0f1a33' }} dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(value) }} />
                    )}
                    <div className="ai-row" style={{ marginTop: 4 }}>
                      <button className="btn small" onClick={() => togglePreview(key)}>{showPreview ? 'Edit' : 'Preview'}</button>
                      <button className="btn small" disabled={!!aiBusy} onClick={() => runAI(key, 'generate')}>AI Generate</button>
                      <button className="btn small" disabled={!!aiBusy} onClick={() => runAI(key, 'refine')}>Refine</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 16, textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Focused wizard • All auto-save still active • Press Esc to exit
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>AI Provider Settings</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Uses any OpenAI-compatible /chat/completions endpoint. Works great with xAI (Grok), OpenAI, Anthropic via proxy, or local models (Ollama with OpenAI compat).
            </p>

            <div style={{ marginTop: 12 }}>
              <label>Base URL</label>
              <input
                className="input"
                value={aiConfig.baseUrl}
                onChange={e => saveAIConfigLocal({ baseUrl: e.target.value })}
                placeholder="https://api.x.ai/v1"
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label>Model</label>
              <input
                className="input"
                value={aiConfig.model}
                onChange={e => saveAIConfigLocal({ model: e.target.value })}
                placeholder="grok-3-latest or gpt-4o-mini"
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label>API Key (stored only in this browser)</label>
              <input
                className="input"
                type="password"
                value={aiConfig.apiKey}
                onChange={e => saveAIConfigLocal({ apiKey: e.target.value })}
                placeholder="sk-... or xai-..."
              />
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
              <button className="btn" onClick={testAI}>Test connection</button>
              <button className="btn primary" onClick={() => setShowSettings(false)}>Done</button>
            </div>

            <div style={{ fontSize: '0.75rem', marginTop: 12, color: 'var(--muted)' }}>
              Recommended starters:<br />
              • xAI Grok: base https://api.x.ai/v1 , model grok-3-latest<br />
              • OpenAI: https://api.openai.com/v1 , model gpt-4o or gpt-4o-mini<br />
              • Local Ollama: http://localhost:11434/v1 (after `ollama serve` + pull model)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
