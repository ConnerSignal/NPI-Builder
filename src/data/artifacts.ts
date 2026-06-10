// Core data model and templates for NPI Document Builder
// Extracted/adapted from the Interactive NPI Guide for standalone use.

export type Artifact = {
  id: string;
  name: string;
  shortName: string;
  definition: string;
  purpose: string;
  timing: string;
  owner: string;
  sections: string[];
  template: Record<string, string>; // fieldKey -> guidance prompt
  bestPractices: string[];
  mistakes: string[];
};

export const artifacts: Artifact[] = [
  {
    id: 'pcd',
    name: 'Product Concept Document',
    shortName: 'PCD',
    definition: 'The early concept record that captures the problem, opportunity, target users, value proposition, assumptions, and risks.',
    purpose: 'Align stakeholders before detailed requirements are written and keep the team problem-focused.',
    timing: 'Created after initial discovery and before formal requirements approval.',
    owner: 'Product Manager',
    sections: ['Problem statement', 'Opportunity', 'Target users', 'Proposed solution', 'Business value', 'Assumptions', 'Risks', 'Success measures'],
    template: {
      'Problem': 'What pain are we solving? Be specific about who is affected and the measurable impact today.',
      'Users': 'Who has the problem? List primary personas or roles and their context.',
      'Value': 'Why should the company care? Tie to revenue, cost, risk, or strategic goal.',
      'Concept': 'What is the proposed direction? High-level solution idea without deep feature lists.',
      'Risks': 'What could stop success? Key assumptions and external dependencies.',
    },
    bestPractices: [
      'Keep it concise but evidence-based',
      'Use one problem statement',
      'Tie every idea to an outcome',
      'Call out what is not in scope'
    ],
    mistakes: [
      'Writing a feature list instead of a concept',
      'Skipping assumptions and risks',
      'No link to business goals'
    ],
  },
  {
    id: 'prd',
    name: 'Product Requirements Document',
    shortName: 'PRD',
    definition: 'The document that translates the approved concept into functional and non-functional requirements, user stories, acceptance criteria, dependencies, and success metrics.',
    purpose: 'Create a testable agreement on what the product must do and how success is measured.',
    timing: 'Created after the concept and business case are approved, before design and build planning are finalized.',
    owner: 'Product Manager or Product Owner',
    sections: ['Objectives', 'User personas', 'Functional requirements', 'Non-functional requirements', 'User stories', 'Acceptance criteria', 'Dependencies', 'Out of scope', 'Success metrics'],
    template: {
      'Objective': 'Business outcome and product goal. One or two sentences.',
      'Scope': 'What is in and out for this release/MVP.',
      'Requirements': 'Functional and non-functional needs. Keep atomic and testable.',
      'Stories': 'Key user stories with role and outcome.',
      'Acceptance': 'How the work is verified. Measurable conditions.',
    },
    bestPractices: [
      'Keep requirements atomic and testable',
      'Trace every requirement to a business goal',
      'Document edge cases',
      'Use clear priority labels'
    ],
    mistakes: [
      'Mixing solution detail with requirements',
      'Missing acceptance criteria',
      'No dependency or compliance notes'
    ],
  },
  {
    id: 'pdd',
    name: 'Product Design Document',
    shortName: 'PDD',
    definition: 'The design artifact that describes the user experience, workflows, wireframes, interaction patterns, accessibility decisions, and validation findings.',
    purpose: 'Show how the approved requirements become an intuitive, usable product experience.',
    timing: 'Created after the PRD, and refined through design reviews and user validation.',
    owner: 'UX Designer',
    sections: ['Design goals', 'Personas', 'User journeys', 'Wireframes', 'Interaction rules', 'Content strategy', 'Accessibility', 'Prototype findings'],
    template: {
      'Goal': 'What the experience must achieve.',
      'Flow': 'How the user moves through the product (key paths).',
      'Wireframes': 'Screen-level structure and hierarchy (describe or link).',
      'Accessibility': 'Keyboard, contrast, labels, ARIA, inclusive considerations.',
      'Validation': 'What users tested and what was learned or changed.',
    },
    bestPractices: [
      'Validate flows with users',
      'Design for empty, error, and loading states',
      'Document decisions and rationale',
      'Keep parity with requirements'
    ],
    mistakes: [
      'Designing screens without user journeys',
      'Ignoring accessibility',
      'Treating wireframes as final code'
    ],
  },
  {
    id: 'sdd',
    name: 'Software Design Document',
    shortName: 'SDD',
    definition: 'The technical document that describes the software solution approach, system components, interfaces, data flow, security, observability, and technical constraints.',
    purpose: 'Bridge product intent and engineering implementation with enough detail to build safely and consistently.',
    timing: 'Created once requirements and design are stable enough to translate into implementation plans.',
    owner: 'Engineering Lead or Architect',
    sections: ['Architecture overview', 'Component responsibilities', 'APIs and integrations', 'Data model', 'Security controls', 'Error handling', 'Observability', 'Operational concerns'],
    template: {
      'Architecture': 'Big-picture technical shape and major decisions.',
      'Components': 'Services, modules, and their responsibilities.',
      'Interfaces': 'APIs, events, integrations, contracts.',
      'Data': 'Storage, schema, key entities and relationships.',
      'Operations': 'Monitoring, logging, alerts, deployment, scaling.',
    },
    bestPractices: [
      'Describe major decisions and tradeoffs',
      'Show how services communicate',
      'Include non-functional requirements in the design',
      'State assumptions clearly'
    ],
    mistakes: [
      'Being too vague to implement',
      'Mixing architecture with user-copy decisions',
      'No operations or security detail'
    ],
  },
  {
    id: 'hld',
    name: 'High-Level Design',
    shortName: 'HLD',
    definition: 'The solution-level architecture view that describes system boundaries, major components, data flows, integrations, deployment approach, and security model.',
    purpose: 'Give stakeholders a clear picture of the end-to-end technical approach before implementation starts.',
    timing: 'Created before or alongside the more detailed software design and implementation breakdown.',
    owner: 'Architect',
    sections: ['Overview', 'Boundaries', 'Flows', 'Security', 'Runtime'],
    template: {
      'Overview': 'What the solution is at a system level.',
      'Boundaries': 'What is inside and outside the system.',
      'Flows': 'How data and control move end to end.',
      'Security': 'Authentication, authorization, data protection model.',
      'Runtime': 'Deployment, hosting, scaling, and operations approach.',
    },
    bestPractices: [
      'Use one architecture story for the whole solution',
      'Call out trust boundaries',
      'Show deployment and runtime concerns',
      'Keep it comprehensible for non-engineers'
    ],
    mistakes: [
      'Only drawing boxes without explaining flows',
      'Ignoring integration or infrastructure realities',
      'No security view'
    ],
  },
  {
    id: 'lld',
    name: 'Low-Level Design',
    shortName: 'LLD',
    definition: 'The implementation detail that explains classes, services, methods, database schema, validation rules, sequence flows, errors, and configuration.',
    purpose: 'Remove ambiguity for engineers building the solution and for reviewers validating behavior.',
    timing: 'Created when the team is ready to implement the specific components or stories.',
    owner: 'Developer or Engineering Lead',
    sections: ['Module', 'Behavior', 'Schema', 'Rules', 'Tests'],
    template: {
      'Module': 'What code unit is being built (service, component, etc.).',
      'Behavior': 'How it should work step by step.',
      'Schema': 'Database or object model details for this area.',
      'Rules': 'Validation and error handling specifics.',
      'Tests': 'What must be verified (unit, integration, edge).',
    },
    bestPractices: [
      'Keep the design concrete enough for implementation',
      'Specify rules and constraints',
      'Document error handling and retries',
      'Align to the test strategy'
    ],
    mistakes: [
      'Too high-level to code from',
      'Duplicating the HLD without implementation detail',
      'Ignoring edge cases and validation'
    ],
  },
  {
    id: 'risk-register',
    name: 'Risk Register',
    shortName: 'Risk',
    definition: 'A live list of risks, assumptions, issues, and dependencies that may affect scope, quality, schedule, cost, or adoption.',
    purpose: 'Keep the team explicit about what could go wrong and what action is needed.',
    timing: 'Created early and updated throughout the lifecycle.',
    owner: 'Product Manager and Engineering Lead',
    sections: ['Risk', 'Impact', 'Likelihood', 'Mitigation', 'Owner', 'Status'],
    template: {
      'Risk': 'Clear statement of what might happen.',
      'Impact': 'Consequence if it occurs (cost, delay, quality, adoption).',
      'Likelihood': 'High / Medium / Low or probability range.',
      'Mitigation': 'Preventive or corrective actions and owners.',
      'Owner': 'Single accountable person for monitoring/mitigation.',
      'Status': 'Open / Watching / Mitigated / Closed.',
    },
    bestPractices: [
      'Review at each gate',
      'Tie risks to decisions',
      'Escalate when mitigation is blocked',
      'Distinguish risks from issues'
    ],
    mistakes: [
      'Treating risk as a one-time list',
      'No owner or mitigation',
      'Hiding operational risks'
    ],
  },
  {
    id: 'launch-checklist',
    name: 'Launch Checklist',
    shortName: 'Launch',
    definition: 'A readiness checklist that covers deployment, comms, training, support, rollback, monitoring, and approvals.',
    purpose: 'Prevent avoidable launch failures by making readiness visible and executable.',
    timing: 'Created in launch planning and completed before go-live.',
    owner: 'Operations/Support and Product Manager',
    sections: ['Item', 'Evidence', 'Owner', 'Status', 'Notes'],
    template: {
      'Item': 'Readiness check item (deployment, training, comms, support, monitoring, rollback, approvals).',
      'Evidence': 'What proves it is complete? (links, screenshots, sign-offs).',
      'Owner': 'Who signs off and ensures it?',
      'Status': 'Open or Done.',
      'Notes': 'Issues, blockers, or follow-up actions.',
    },
    bestPractices: [
      'Use clear yes/no evidence',
      'Assign an owner for each item',
      'Rehearse escalation paths',
      'Treat launch as an operational event'
    ],
    mistakes: [
      'Checklist exists but is not used',
      'No rollback path',
      'Support training is skipped'
    ],
  },
  {
    id: 'post-launch-review',
    name: 'Post-Launch Review',
    shortName: 'Review',
    definition: 'A structured retrospective on launch outcomes, metrics, defects, feedback, and next-step improvements.',
    purpose: 'Close the loop between launch and the next roadmap cycle.',
    timing: 'Performed after initial launch and again after hypercare stabilizes.',
    owner: 'Product Manager',
    sections: ['Goal', 'Result', 'Learning', 'Actions', 'Owners'],
    template: {
      'Goal': 'What did we expect (from business case or prior artifacts)?',
      'Result': 'What actually happened (metrics, adoption, incidents)?',
      'Learning': 'What did we learn (positive and negative)?',
      'Actions': 'Concrete follow-ups for the backlog or process changes.',
      'Owners': 'Who owns each action and by when?',
    },
    bestPractices: [
      'Compare outcomes to the original business goal',
      'Capture learning, not blame',
      'Update the roadmap and operating model',
      'Use feedback to improve future NPI cycles'
    ],
    mistakes: [
      'Only reviewing incidents',
      'No action backlog',
      'No linkage to success metrics'
    ],
  },
];

export const artifactOrder = artifacts.map(a => a.id);

export function getArtifact(id: string): Artifact {
  return artifacts.find(a => a.id === id)!;
}
