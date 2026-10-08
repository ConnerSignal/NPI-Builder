# NPI Builder UX & Responsiveness Overhaul

## Goal
Make API/model switching frictionless, persist keys correctly with visible status, and make the entire UI fully responsive across all screen sizes and devices.

---

## Phase 1: Inline AI Config Bar (Priority — fixes the main pain point)

### 1.1 Create `src/components/AIConfigBar.tsx`
A compact inline bar that is always visible in the header area or as a floating collapsible pill at the top of the app.

**Content:**
- Current provider preset label (e.g., "OpenAI") with editable dropdown
- Current model displayed as an editable field (select if preset has models, text input otherwise)
- Quick-edit base URL (collapsed by default — expandable via a gear icon or "change" link)
- API key field showing `••••••••` masked text with clear/edit button
- Connection status indicator: green dot ("connected"), yellow ("key set, not tested"), red ("error")
- A "Save" confirmation chip that appears briefly after saving

**Behavior:**
- All changes auto-save immediately via the existing `saveAIConfigLocal()` → `saveAIConfig()` → `stripStoredSecrets` + localStorage pipeline. No modal needed.
- When Electron is detected (check for `npiSecureStore`), add a tiny label next to key field: "secure" (green dot). Otherwise: "session-only".
- Connection status auto-updates after each AI call via the existing `lastAiError` state (pass it as prop to this bar and read it, or derive from error presence in App.tsx).
- Collapsible: on load show all fields collapsed; clicking expand reveals full edit mode. Default view is just provider + model + key status.

**Responsive:**
- On wide screens (>1024px): display horizontally as a thin top bar (height ~48px) below the main header, spans full width of center panel.
- On medium screens (768–1024px): display as a collapsible pill with provider/model visible; key hidden behind "edit" tap.
- On narrow screens (<768px): become a bottom sheet swipeable panel OR stay in header but with vertical stacking.

### 1.2 Wire into `App.tsx`
- Replace the "AI Settings" button (line 974) with an inline variant — clicking opens the full model instead of being its own element.
- Replace line 1371–1375 in right sidebar (the current "AI Provider" status chip) with AI config bar's read-only compact mode.
- The config bar reuses the `aiConfig` state and `saveAIConfigLocal` function already defined.

### 1.3 Persist vs session feedback
- Replace line 1374 (`Key loaded for this session`) with a component that checks both:
  - localStorage (for non-secret config fields) → "config saved locally"
  - `npiSecureStore?.getSecrets` exists → "key secured in OS storage"
- Show two small dots/badges so user knows exactly where things are stored.

---

## Phase 2: Responsive Layout System

### 2.1 CSS variables for breakpoints (or a minimal media mixin approach)

Add to `src/index.css`:
```css
:root {
  --sidebar-width: 260px;   /* left */
  --right-panel-width: 300px; /* right */
}

@media (max-width: 1280px) {
  /* reduce panel gaps and font sizes slightly */
}

@media (max-width: 1024px) {
  /* tablet portrait — switch to dual-column or single column */
}

@media (max-width: 768px) {
  /* mobile — stack everything, sidebar becomes a hamburger nav */
}

@media (max-width: 480px) {
  /* very small phones — maximize editor width, bottom navigation bar */
}
```

### 2.2 Desktop (>1280px): Current 3-column layout stays unchanged
- Left sidebar: full width, all content visible
- Center: full-width editor
- Right: full context panel + export buttons

### 2.3 Tablet (768–1280px)
- Merge right panel into the center via an inline toggle sheet (click to expand from right edge as an overlay, not modal — slides in).
- Left sidebar narrows to icon rail (collapsed nav) with tooltips; clicking a doc name expands it.
- Document list in left sidebar becomes scrollable with `max-height: calc(100vh - 180px)`.

### 2.4 Mobile (<768px): Single column mode
- Left sidebar becomes bottom tab bar or top collapsible drawer.
  - Use `position: fixed` bottom bar for nav items (PCD, PRD, PDD, etc.) — like a mobile app's bottom nav.
  - Or use Collapsible Sheet pattern: section at top of screen, swipe up to expand full list.
- Right panel content moves into inline accordions below the editor field.
- The header bar (with document name and progress) becomes sticky/fixed-top.
- AI config bar switches to compact mode — just show provider + green/yellow/red dot + small "edit" tap.

### 2.5 Viewport-based font sizing
- Use `clamp()` for text sizes based on viewport width:
  ```css
  html { font-size: clamp(13px, 0.8vw + 12px, 16px); }
  .field-label { font-size: clamp(0.85rem, 0.7vw + 0.75rem, 1rem); }
  ```
- This avoids manual breakpoints for text and auto-fits the content.

### 2.6 Touch targets
- All buttons get `min-height: 44px` / `min-width: 44px` on touch devices using media query `(pointer: coarse)`.

---

## Phase 3: Extensible AI Provider Management (No code changes needed to add providers)

### 3.1 Create `src/components/AIProviderManager.tsx` — manages presets dynamically

A modal/panel that lets users add, edit, and delete provider presets without touching source code.

**Default view:**
- List of existing presets (from `AI_PROVIDER_PRESETS`) as cards with edit/delete buttons.

**Add preset form:**
- Name (text)
- Base URL (text)
- Models (comma-separated text input — each becomes a selectable option in the model dropdown)
- API key placeholder text (text)
- "Test & Add" button

**Storage:**
- Saved presets go into `localStorage` under key `'npi-ai-presets'`.
- On load: merge built-in presets with user-created ones. Built-in ones are marked `builtin: true` and cannot be deleted but can be edited.
- User presets appear below builtin ones in the list.

**Update `AI_PROVIDER_PRESETS` type:**
```typescript
export interface AIProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
  apiKeyPlaceholder: string;
  builtin?: boolean; // true = cannot delete, pre-configured
}
```

### 3.2 Export helper from `lib/ai.ts`
- Add `getUserPresets()` that reads from localStorage
- Add `saveUserPreset(preset)` / `deleteUserPreset(id)` functions
- Merge: `const allPresets = [...AI_PROVIDER_PRESETS, ...userPresets]` — use this in all preset dropdowns.

---

## Phase 4: Inline Editing Enhancements

### 4.1 Move Privacy Controls context inline (reduce modal depth)
Currently users need to find the Privacy Controls section deep in the right sidebar. Add two quick toggles to the AI config bar:
- Allow AI transfers toggle with a one-line explanation on hover or if red (disabled).
- Remember locally is already localStorage — no UI change needed for that; just make sure the status is visible from the AI config bar.

### 4.2 Smart fields in document list sidebar
Add small AI indicator icons next to each document in the doc-list: show a green dot if AI can generate content (i.e., key + base URL present without errors), yellow if API key missing, red if last call had an error — so users don't have to wonder "is my API working right now?"

---

## Phase 5: Accessibility & Polish

### 5.1 Reduce modal dependency
- The current Settings modal (lines 1568–1709 in App.tsx) remains for power-user deep config but should now be the fallback — most users never open it because the inline bar covers common operations.
- Keep the `showSettings` modal for: advanced toggles (fallback), clearing secrets, bulk delete, etc.

### 5.2 Keyboard accessibility
- All new interactive elements get proper Tab focus order.
- AI config bar fields support Enter to submit/save.
- ESC closes any open popover/drawer from all configs.

---

## Files to Create or Modify

### New files:
| File | Purpose |
|------|---------|
| `src/components/AIConfigBar.tsx` | Inline AI config bar (compact + expanded modes) |
| `src/components/AIProviderManager.tsx` | User-managed preset CRUD UI |
| `src/lib/presets.ts` | Preset management logic + localStorage persistence |

### Modified files:
| File | Changes |
|------|---------|
| `src/App.tsx` | Import AI config bar, replace "AI Settings" button with inline bar, add responsive wrapper, wire connection status |
| `src/lib/ai.ts` | Export user preset helpers, update type definition with `builtin?`, merge presets |
| `src/App.css` | Responsive breakpoints, mobile nav styles, clamp-based typography, touch targets |
| `src/data/artifacts.ts` | Add `builtin?: boolean` to preset type (or move to lib/ai.ts — decision in Phase 3) |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migrating existing user config to new storage structure | Read old `localStorage('npi-ai-config')` on first mount and copy non-secret fields into new structure; delete old key after migration |
| Inline bar pushing content down on small screens | Use collapsible/fixed-position behavior: on mobile the bar replaces top nav elements entirely, doesn't add to scroll height |
| Touch target overlap on mobile | Add `min-height: 44px` and gap spacing in `(pointer: coarse)` queries |
| Preset list growing unbounded | Cap user presets at 20; show warning at 15+; allow bulk delete of non-builtin presets |

---

## Validation Steps (for implementation agent)

1. Run the app and test API key update flow from inline bar — no modal needed, key updates in <1 second with visual confirmation
2. Resize browser window through all breakpoints: 1920px → 1280px → 768px → 480px → 320px. No horizontal scroll on any viewport. All content visible.
3. Test on touch device or use DevTools touch emulation for tap targets (all > 44px)
4. Add a new custom provider via the provider manager — verify it appears in all preset dropdowns immediately without page reload
5. Remove and re-add browser tab — confirm API key persists correctly in Electron session; localStorage config persists on refresh
6. Run `npm run build` to ensure no TypeScript errors
