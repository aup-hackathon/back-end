import { Injectable } from '@nestjs/common';

import { JsonValue } from '../../../database/types/json-value.type';

export interface FlowForgeElement {
  id: string;
  type: string;
  label?: string;
  properties?: Record<string, JsonValue>;
  sourceId?: string;
  targetId?: string;
}

export interface ElsaWorkflowJson {
  id: string;
  name: string;
  version: number;
  activities: ElsaActivity[];
  connections: ElsaConnection[];
  variables?: Record<string, unknown>[];
  tags?: string[];
}

export interface ElsaActivity {
  id: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

export interface ElsaConnection {
  id?: string;
  sourceId: string;
  targetId: string;
  outcome?: string;
}

const FLOWFORGE_TO_ELSA_MAPPING: Record<string, string> = {
  start: 'Elsa.Core.Activity',
  end: 'Elsa.Core.Activity',
  task: 'Elsa.Core.Activity',
  user_task: 'Elsa.Core.Activity',
  service_task: 'Elsa.Core.Activity',
  script_task: 'Elsa.Scripting.JavaScript.RunJavaScript',
  exclusive_gateway: 'Elsa.Flowchart.ExclusiveGateway',
  inclusive_gateway: 'Elsa.Flowchart.InclusiveGateway',
  parallel_gateway: 'Elsa.Flowchart.ParallelGateway',
  event_gateway: 'Elsa.Flowchart.EventBasedGateway',
  start_event: 'Elsa.Events.StartWorkflow',
  end_event: 'Elsa.Events.EndWorkflow',
  message_event: 'Elsa.Messaging.StartWorkflow',
  timer_event: 'Elsa.Timers.StartWorkflowTimer',
  subprocess: 'Elsa.CompositeActivity',
  lane: 'Elsa.Flowchart.Lane',
  pool: 'Elsa.Flowchart.Pool',
  sequence_flow: 'Elsa.Flowchart.SequenceFlow',
  default_flow: 'Elsa.Flowchart.DefaultFlow',
  conditional_flow: 'Elsa.Flowchart.ConditionalFlow',
  message_flow: 'Elsa.Flowchart.MessageFlow',
};

@Injectable()
export class ElsaMappingService {
  /**
   * Maps FlowForge element types to Elsa Workflows 3.x activity types
   */
  mapFlowForgeTypeToElsa(elementType: string): string {
    return FLOWFORGE_TO_ELSA_MAPPING[elementType.toLowerCase()] ?? 'Elsa.Core.Activity';
  }

  /**
   * Converts FlowForge elements JSON to Elsa Workflows 3.x JSON format
   */
  convertToElsaWorkflow(
    elements: { nodes?: FlowForgeElement[]; edges?: FlowForgeElement[] },
    workflowId: string,
    workflowName: string,
    version: number = 1,
  ): ElsaWorkflowJson {
    const nodes = elements.nodes ?? [];
    const edges = elements.edges ?? [];

    const activities: ElsaActivity[] = nodes.map((node) => this.convertNodeToActivity(node));
    const connections: ElsaConnection[] = edges.map((edge) => this.convertEdgeToConnection(edge));

    return {
      id: `workflow-${workflowId}`,
      name: workflowName,
      version,
      activities,
      connections,
      variables: [],
      tags: ['flowforge-export'],
    };
  }

  private convertNodeToActivity(node: FlowForgeElement): ElsaActivity {
    const elsaType = this.mapFlowForgeTypeToElsa(node.type);

    const properties: Record<string, unknown> = {};

    if (node.label) {
      properties.displayText = node.label;
    }

    if (node.properties) {
      properties.customProperties = this.sanitizeProperties(node.properties);
    }

    return {
      id: node.id,
      type: elsaType,
      name: node.label ?? node.type,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    };
  }

  private convertEdgeToConnection(edge: FlowForgeElement): ElsaConnection {
    const connection: ElsaConnection = {
      sourceId: edge.sourceId ?? '',
      targetId: edge.targetId ?? '',
    };

    if (edge.label) {
      connection.outcome = edge.label;
    }

    return connection;
  }

  private sanitizeProperties(props: Record<string, JsonValue>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = JSON.stringify(value);
      } else if (value !== undefined) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}