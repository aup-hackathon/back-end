export interface WorkflowChangedElement {
  element_id: string;
  change_type: 'added' | 'removed' | 'modified';
}

export interface WorkflowUpdatedEvent {
  workflow_id: string;
  version_number: number;
  changed_elements: WorkflowChangedElement[];
  source: 'ai' | 'user' | 'comment_injection' | 'reconciliation';
  actor_id?: string;
  correlation_id: string;
}