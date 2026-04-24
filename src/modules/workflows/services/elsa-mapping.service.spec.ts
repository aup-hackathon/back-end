import { ElsaMappingService, FlowForgeElement, ElsaWorkflowJson } from './elsa-mapping.service';

describe('ElsaMappingService', () => {
  let service: ElsaMappingService;

  beforeEach(() => {
    service = new ElsaMappingService();
  });

  describe('mapFlowForgeTypeToElsa', () => {
    it('should map start event to Elsa.Events.StartWorkflow', () => {
      expect(service.mapFlowForgeTypeToElsa('start_event')).toBe('Elsa.Events.StartWorkflow');
    });

    it('should map end event to Elsa.Events.EndWorkflow', () => {
      expect(service.mapFlowForgeTypeToElsa('end_event')).toBe('Elsa.Events.EndWorkflow');
    });

    it('should map exclusive gateway to Elsa.Flowchart.ExclusiveGateway', () => {
      expect(service.mapFlowForgeTypeToElsa('exclusive_gateway')).toBe('Elsa.Flowchart.ExclusiveGateway');
    });

    it('should map parallel gateway to Elsa.Flowchart.ParallelGateway', () => {
      expect(service.mapFlowForgeTypeToElsa('parallel_gateway')).toBe('Elsa.Flowchart.ParallelGateway');
    });

    it('should map user_task to Elsa.Core.Activity', () => {
      expect(service.mapFlowForgeTypeToElsa('user_task')).toBe('Elsa.Core.Activity');
    });

    it('should map service_task to Elsa.Core.Activity', () => {
      expect(service.mapFlowForgeTypeToElsa('service_task')).toBe('Elsa.Core.Activity');
    });

    it('should map script_task to Elsa.Scripting.JavaScript.RunJavaScript', () => {
      expect(service.mapFlowForgeTypeToElsa('script_task')).toBe('Elsa.Scripting.JavaScript.RunJavaScript');
    });

    it('should map inclusive gateway to Elsa.Flowchart.InclusiveGateway', () => {
      expect(service.mapFlowForgeTypeToElsa('inclusive_gateway')).toBe('Elsa.Flowchart.InclusiveGateway');
    });

    it('should map event gateway to Elsa.Flowchart.EventBasedGateway', () => {
      expect(service.mapFlowForgeTypeToElsa('event_gateway')).toBe('Elsa.Flowchart.EventBasedGateway');
    });

    it('should map message event to Elsa.Messaging.StartWorkflow', () => {
      expect(service.mapFlowForgeTypeToElsa('message_event')).toBe('Elsa.Messaging.StartWorkflow');
    });

    it('should map timer event to Elsa.Timers.StartWorkflowTimer', () => {
      expect(service.mapFlowForgeTypeToElsa('timer_event')).toBe('Elsa.Timers.StartWorkflowTimer');
    });

    it('should map lane to Elsa.Flowchart.Lane', () => {
      expect(service.mapFlowForgeTypeToElsa('lane')).toBe('Elsa.Flowchart.Lane');
    });

    it('should map pool to Elsa.Flowchart.Pool', () => {
      expect(service.mapFlowForgeTypeToElsa('pool')).toBe('Elsa.Flowchart.Pool');
    });

    it('should map sequence flow to Elsa.Flowchart.SequenceFlow', () => {
      expect(service.mapFlowForgeTypeToElsa('sequence_flow')).toBe('Elsa.Flowchart.SequenceFlow');
    });

    it('should map default flow to Elsa.Flowchart.DefaultFlow', () => {
      expect(service.mapFlowForgeTypeToElsa('default_flow')).toBe('Elsa.Flowchart.DefaultFlow');
    });

    it('should map conditional flow to Elsa.Flowchart.ConditionalFlow', () => {
      expect(service.mapFlowForgeTypeToElsa('conditional_flow')).toBe('Elsa.Flowchart.ConditionalFlow');
    });

    it('should map message flow to Elsa.Flowchart.MessageFlow', () => {
      expect(service.mapFlowForgeTypeToElsa('message_flow')).toBe('Elsa.Flowchart.MessageFlow');
    });

    it('should map subprocess to Elsa.CompositeActivity', () => {
      expect(service.mapFlowForgeTypeToElsa('subprocess')).toBe('Elsa.CompositeActivity');
    });

    it('should return default for unknown types', () => {
      expect(service.mapFlowForgeTypeToElsa('unknown_type')).toBe('Elsa.Core.Activity');
    });

    it('should handle case-insensitive input', () => {
      expect(service.mapFlowForgeTypeToElsa('START_EVENT')).toBe('Elsa.Events.StartWorkflow');
    });
  });

  describe('convertToElsaWorkflow', () => {
    it('should convert nodes to Elsa activities', () => {
      const elements = {
        nodes: [
          { id: 'start-1', type: 'start_event', label: 'Start' },
          { id: 'task-1', type: 'user_task', label: 'Review Document' },
          { id: 'end-1', type: 'end_event', label: 'End' },
        ],
        edges: [
          { id: 'edge-1', type: 'sequence_flow', sourceId: 'start-1', targetId: 'task-1' },
          { id: 'edge-2', type: 'sequence_flow', sourceId: 'task-1', targetId: 'end-1' },
        ],
      };

      const result = service.convertToElsaWorkflow(elements, 'wf-123', 'My Workflow', 1);

      expect(result.id).toBe('workflow-wf-123');
      expect(result.name).toBe('My Workflow');
      expect(result.version).toBe(1);
      expect(result.activities).toHaveLength(3);
      expect(result.connections).toHaveLength(2);
    });

    it('should handle empty elements', () => {
      const result = service.convertToElsaWorkflow({}, 'wf-123', 'My Workflow', 1);

      expect(result.activities).toHaveLength(0);
      expect(result.connections).toHaveLength(0);
    });

    it('should include tags in output', () => {
      const elements = { nodes: [] };
      const result = service.convertToElsaWorkflow(elements, 'wf-123', 'My Workflow', 1);

      expect(result.tags).toContain('flowforge-export');
    });

    it('should preserve node labels as activity names', () => {
      const elements = {
        nodes: [{ id: 'task-1', type: 'task', label: 'Custom Task Name' }],
      };

      const result = service.convertToElsaWorkflow(elements, 'wf-123', 'My Workflow', 1);

      expect(result.activities[0].name).toBe('Custom Task Name');
    });

    it('should handle elements without nodes', () => {
      const elements = { edges: [] };
      const result = service.convertToElsaWorkflow(elements, 'wf-123', 'My Workflow', 1);

      expect(result.activities).toHaveLength(0);
    });

    it('should handle elements without edges', () => {
      const elements = { nodes: [] };
      const result = service.convertToElsaWorkflow(elements, 'wf-123', 'My Workflow', 1);

      expect(result.connections).toHaveLength(0);
    });

    it('should include edge labels as outcomes', () => {
      const elements = {
        nodes: [
          { id: 'start-1', type: 'start_event' },
          { id: 'end-1', type: 'end_event' },
        ],
        edges: [{ id: 'edge-1', type: 'conditional_flow', sourceId: 'start-1', targetId: 'end-1', label: 'Approved' }],
      };

      const result = service.convertToElsaWorkflow(elements, 'wf-123', 'My Workflow', 1);

      expect(result.connections[0].outcome).toBe('Approved');
    });
  });
});