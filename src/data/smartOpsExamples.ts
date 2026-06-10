// Full SmartOps Portal filled example data for the NPI Document Builder
// Based on the original Interactive NPI Guide

export const SMART_OPS_EXAMPLES: Record<string, Record<string, string>> = {
  pcd: {
    Problem: 'Operations reporting is fragmented across Jira, ServiceNow, spreadsheets, and email threads. Managers spend hours each week chasing status updates instead of acting on them.',
    Users: 'Operations managers, engineering leads, product owners, support teams, and executives who need a single source of truth for operational requests, automation opportunities, service health, and release readiness.',
    Value: 'Reduce manual reporting time by 40%+, improve visibility into automation opportunities, accelerate release readiness decisions, and reduce risk of missed dependencies across teams.',
    Concept: 'Build SmartOps Portal as an internal AI-powered dashboard for request intake, automation scoring, status reporting, and launch readiness tracking with integrations to Jira, ServiceNow, and observability tools.',
    Risks: 'Integration data quality from source systems, adoption across different roles, role-based access control complexity, initial data mapping and sync reliability effort, and change management for new workflows.',
  },
  prd: {
    Objective: 'Provide a single operational hub that standardizes intake, scoring, tracking, and readiness reporting so teams spend dramatically less time chasing status and more time executing.',
    Scope: 'MVP includes request intake form with guided fields, triage dashboard with filters and scoring, basic automation scoring engine, role-based views, CSV/PDF export, and read-only integrations to Jira and ServiceNow. Out of scope for MVP: full write-back, advanced analytics, mobile app.',
    Requirements: 'Users can submit a fully populated request in under 2 minutes. Requests appear in the shared dashboard with owner, priority score, and current status within 10 seconds. Managers can filter, search, and export the current view. Role-based access must hide data the viewer is not authorized to see.',
    Stories: 'As an operations manager I can submit a new operational request and assign an initial owner and target date. As a team lead I can see all open requests for my teams sorted by automation score and recency. As an executive I can export a readiness summary for the next leadership review.',
    Acceptance: 'A complete request submission succeeds and appears in the dashboard for authorized viewers within 10s. Filters and search return correct results. Export contains exactly the columns visible to the current user. Unauthorized users cannot see restricted requests.',
  },
  pdd: {
    Goal: 'Enable users to triage and track operational work without constantly switching between five different tools. Provide fast overview with the ability to drill into details on demand.',
    Flow: 'Landing dashboard (card grid + filters + search) → request detail panel with scoring and ownership → release readiness checklist view → reporting and export actions. Support empty, loading, and error states throughout.',
    Wireframes: 'Card-based dashboard with status chips, automation score badge, owner avatar, and quick actions. Right-side slide-in detail panel for the selected request. Guided multi-step intake wizard. Clear empty states and loading skeletons for all major views.',
    Accessibility: 'Full keyboard navigation and visible focus states. Sufficient color contrast (WCAG AA). Descriptive ARIA labels and live regions for dynamic status changes. Support for screen readers on all interactive elements.',
    Validation: 'Three operations managers and two engineering leads completed core tasks (submit, triage, export) in moderated usability testing with zero critical or major usability issues. Minor feedback on filter discoverability was addressed in the final design.',
  },
  sdd: {
    Architecture: 'Browser-based SPA calling a secured backend API layer. Backend consists of request intake service, scoring engine, integration adapters for Jira and ServiceNow, and a central operational data store with analytics pipeline.',
    Components: 'Frontend dashboard and intake wizard. API gateway with auth. Request service (CRUD + state machine). Scoring service (rules + ML features if later). Integration adapters (event-driven sync). Audit and analytics store. Notification service for status changes.',
    Interfaces: 'REST APIs for intake, query, and export. Webhook/event subscriptions from Jira and ServiceNow for status updates. Internal async queue for scoring and enrichment jobs. Role-based authorization on all endpoints.',
    Data: 'Central request record with fields for id, type, submitter, owner, priority signals, scores, status, linked issues, and timestamps. Score history table. Audit log of all state transitions and access. Read replicas for reporting queries.',
    Operations: 'Health checks on all services and integrations. Structured logging with correlation IDs. Alerts on integration failures, stale data, or scoring queue backlog. Canary + blue/green deployment with instant rollback capability. Retention policy for audit logs.',
  },
  hld: {
    Overview: 'SmartOps Portal is a central internal web application that aggregates operational requests, automation opportunities, service health signals, and release readiness status from multiple source systems.',
    Boundaries: 'In scope: internal users only, read-heavy dashboard, guided intake, scoring, basic reporting, and read-only integrations. Out of scope: external users, heavy write-back to source systems in MVP, real-time collaboration, mobile native apps.',
    Flows: 'User submits request → intake service validates and persists → scoring engine enriches and scores → dashboard reflects new/updated record → integration adapters keep Jira/ServiceNow status in sync → users export or act on readiness views.',
    Security: 'Azure AD / corporate SSO for authentication. Role-based access control (RBAC) with least privilege. All high-risk actions (ownership change, export of sensitive views) are audited. Data in transit encrypted (TLS 1.2+). Secrets managed via platform key vault.',
    Runtime: 'Containerized frontend and backend services deployed to Kubernetes. Horizontal scaling for the API and scoring workers. Database with read replicas. Monitoring via platform observability stack (metrics, logs, traces).',
  },
  lld: {
    Module: 'Request Intake Service + Scoring Engine (initial vertical slice).',
    Behavior: 'Validate required fields on submission. Persist request record. Enqueue scoring job. Compute automation score based on signals (recency, source system, keywords, historical similar requests). Update request with score and suggested owner. Emit dashboard update event.',
    Schema: 'requests table (id PK, type, title, description, submitter_id, owner_id, target_date, status, score, created_at, updated_at). score_history (id, request_id, score, signals_json, computed_at). audit_log (id, request_id, actor, action, before, after, timestamp).',
    Rules: 'All submissions must have type, title, description, and at least one affected system. Score must be between 0 and 100. Ownership changes only allowed by current owner or managers in the owning team. All mutations write an immutable audit record.',
    Tests: 'Unit tests for validation rules and score calculation. Integration test for full intake → score → visible in dashboard flow. Contract tests against Jira and ServiceNow adapters. Load test for 100 concurrent submissions.',
  },
  'risk-register': {
    Risk: 'Source data in Jira and ServiceNow may not match the expected structure or freshness for the dashboard.',
    Impact: 'Reported status and automation scores could be inconsistent or stale, reducing trust in the tool.',
    Likelihood: 'Medium',
    Mitigation: 'Define strict data mapping and freshness SLAs with source system owners. Implement health checks + data quality scores visible in the UI. Build fallback to show “data as of X” and allow manual override notes.',
    Owner: 'Engineering Lead',
    Status: 'Open',
  },
  'launch-checklist': {
    Item: 'Support runbook completed and reviewed with on-call contacts and escalation tree.',
    Evidence: 'Runbook link in Confluence, on-call rotation in PagerDuty, documented escalation path, and rollback instructions tested in staging.',
    Owner: 'Operations/Support lead',
    Status: 'Done',
    Notes: 'Hypercare schedule published and first two weeks of on-call assigned.',
  },
  'post-launch-review': {
    Goal: 'Reduce manual status chasing time by at least 40% and improve release readiness visibility within the first quarter after launch.',
    Result: 'After 6 weeks, average time spent on status gathering dropped ~35% among pilot teams. Release readiness reviews now take 20 minutes instead of 90. Adoption at 68% of target users.',
    Learning: 'The scoring model is directionally useful but needs tuning on certain request types. Integration freshness is the biggest trust issue. Users want deeper drill-down by team and request category.',
    Actions: '1. Improve scoring weights and add per-team calibration. 2. Add Jira + ServiceNow write-back for status sync in next release. 3. Build executive summary export and team-level dashboards. 4. Add request aging alerts.',
    Owners: 'Product Manager (scoring + roadmap), Engineering Lead (integrations), UX Designer (drill-down views)',
  },
};
