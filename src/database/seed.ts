/**
 * Database Seeder for Development (Idempotent)
 * 
 * Run with: pnpm db:seed
 * 
 * This seeder creates test data for frontend development:
 * - 1 Organization (or uses existing)
 * - 3 Users (or uses existing)
 * - 2 Projects (or uses existing)
 * - 3 Workflows (or uses existing)
 * - 3 Sessions with messages
 * - 3 Comments
 * - 3 Documents
 */

import { DataSource } from 'typeorm';

// Pre-computed hash for 'password123'
const PRECOMPUTED_PASSWORD_HASH = '$2b$10$EqKcp1WMJP0xCWQ5H3GJyuVbNO4cI2G7pYvK0LbC2VqT7KQf0qQ3e';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: parseInt(process.env.APP_DB_PORT || '5432'),
    username: process.env.APP_DB_USER || 'app',
    password: process.env.APP_DB_PASSWORD || 'change-me-app-db-password',
    database: process.env.APP_DB_NAME || 'appdb',
    synchronize: false,
    logging: true,
  });

  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  console.log('🌱 Starting database seeding...\n');

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. Organization
    // ═══════════════════════════════════════════════════════════
    console.log('📦 Seeding Organizations...');
    let orgId = uuid();
    await queryRunner.query(`
      INSERT INTO organization (id, name, plan, created_at, updated_at)
      VALUES ($1, 'Acme Corporation', 'free', now(), now())
      ON CONFLICT (name) DO NOTHING
    `, [orgId]);
    const orgResult = await queryRunner.query(`SELECT id FROM organization WHERE name = 'Acme Corporation' LIMIT 1`);
    orgId = orgResult[0]?.id || orgId;
    console.log(`  ✓ Organization: Acme Corporation (${orgId})`);

    // ═══════════════════════════════════════════════════════════
    // 2. Users
    // ═══════════════════════════════════════════════════════════
    console.log('\n👥 Seeding Users...');
    
    const existingUsers = await queryRunner.query(`SELECT id, email, role FROM "user" WHERE email LIKE '%@acme.com'`);
    let adminId: string, ownerId: string, analystId: string;
    
    if (existingUsers.length === 0) {
      const users = [
        { email: 'admin@acme.com', role: 'admin' },
        { email: 'owner@acme.com', role: 'process_owner' },
        { email: 'analyst@acme.com', role: 'business_analyst' },
      ];
      const userIds: string[] = [];
      for (const user of users) {
        const userId = uuid();
        userIds.push(userId);
        await queryRunner.query(`
          INSERT INTO "user" (id, email, password_hash, role, org_id, is_verified, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4::user_role_enum, $5, true, true, now(), now())
          ON CONFLICT (email) DO NOTHING
        `, [userId, user.email, PRECOMPUTED_PASSWORD_HASH, user.role, orgId]);
        console.log(`  ✓ User: ${user.email} (${user.role})`);
      }
      adminId = userIds[0];
      ownerId = userIds[1];
      analystId = userIds[2];
    } else {
      console.log('  ⚠ Users already exist, using existing...');
      adminId = existingUsers.find((u: any) => u.email === 'admin@acme.com')?.id;
      ownerId = existingUsers.find((u: any) => u.email === 'owner@acme.com')?.id;
      analystId = existingUsers.find((u: any) => u.email === 'analyst@acme.com')?.id;
    }

    // ═══════════════════════════════════════════════════════════
    // 3. Projects
    // ═══════════════════════════════════════════════════════════
    console.log('\n📁 Seeding Projects...');
    
    let hrProjectId: string, financeProjectId: string;
    try {
      const existingProjects = await queryRunner.query(`SELECT id, name FROM project WHERE org_id = $1`, [orgId]);
      
      if (existingProjects.length === 0) {
        const projects = [
          { name: 'HR Workflows' },
          { name: 'Finance Automation' },
        ];
        const projectIds: string[] = [];
        for (const project of projects) {
          const projectId = uuid();
          projectIds.push(projectId);
          await queryRunner.query(`
            INSERT INTO project (id, name, org_id, owner_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, now(), now())
            ON CONFLICT (id) DO NOTHING
          `, [projectId, project.name, orgId, ownerId]);
          console.log(`  ✓ Project: ${project.name}`);
        }
        hrProjectId = projectIds[0];
        financeProjectId = projectIds[1];
      } else {
        console.log('  ⚠ Projects already exist, using existing...');
        hrProjectId = existingProjects[0]?.id;
        financeProjectId = existingProjects[1]?.id || existingProjects[0]?.id;
      }
    } catch (e) {
      console.log('  ⚠ Project table not found, skipping...');
      hrProjectId = '';
      financeProjectId = '';
    }

    // ═══════════════════════════════════════════════════════════
    // 4. Workflows
    // ═══════════════════════════════════════════════════════════
    console.log('\n📋 Seeding Workflows...');
    
    const workflows = [
      { title: 'Employee Onboarding', description: 'Complete onboarding process for new employees', status: 'validated', domain: 'HR', tags: ['onboarding', 'hr'], projectId: hrProjectId },
      { title: 'Expense Approval', description: 'Approve employee expense reports', status: 'in_elicitation', domain: 'Finance', tags: ['approval', 'finance'], projectId: financeProjectId },
      { title: 'Vacation Request', description: 'Process vacation leave requests', status: 'draft', domain: 'HR', tags: ['leave', 'hr'], projectId: hrProjectId },
    ];

    const workflowIds: string[] = [];
    for (const workflow of workflows) {
      const workflowId = uuid();
      workflowIds.push(workflowId);
      try {
        // Insert workflow with current_version = 0 (trigger allows 0 when no versions exist)
        await queryRunner.query(`
          INSERT INTO workflow (id, title, description, status, current_version, org_id, owner_id, project_id, domain, tags, created_at, updated_at)
          VALUES ($1, $2, $3, $4::workflow_status_enum, 0, $5, $6, $7, $8, $9, now(), now())
          ON CONFLICT (id) DO NOTHING
        `, [workflowId, workflow.title, workflow.description, workflow.status, orgId, ownerId, workflow.projectId, workflow.domain, workflow.tags]);
        
        // Now insert version 1
        await queryRunner.query(`
          INSERT INTO workflow_version (id, workflow_id, version_number, version_data, status, created_at, updated_at)
          VALUES ($1, $2, 1, $3::jsonb, 'published', now(), now())
          ON CONFLICT (id) DO NOTHING
        `, [uuid(), workflowId, JSON.stringify({ nodes: [], edges: [] })]);
        
        // Update workflow to set current_version = 1
        await queryRunner.query(`
          UPDATE workflow SET current_version = 1, updated_at = now() WHERE id = $1
        `, [workflowId]);
        
        console.log(`  ✓ Workflow: ${workflow.title} (${workflow.status})`);
      } catch (e) {
        console.log(`  ✗ Workflow failed: ${workflow.title} - ${e}`);
      }
    }

    const onboardingWorkflowId = workflowIds[0];
    const expenseWorkflowId = workflowIds[1];
    const vacationWorkflowId = workflowIds[2];

    // ═══════════════════════════════════════════════════════════
    // 5. Sessions
    // ═══════════════════════════════════════════════════════════
    console.log('\n💬 Seeding Sessions...');
    
    const sessions = [
      { workflowId: onboardingWorkflowId, mode: 'auto', status: 'validated', inputText: 'Create an employee onboarding workflow that collects personal details, provisions system access, and confirms completion.' },
      { workflowId: expenseWorkflowId, mode: 'interactive', status: 'in_elicitation', inputText: 'Build an expense approval workflow that routes to manager for approval based on amount.' },
      { workflowId: vacationWorkflowId, mode: 'auto', status: 'processing', inputText: 'Process vacation requests with manager approval.' },
    ];

    const sessionIds: string[] = [];
    for (const session of sessions) {
      const sessionId = uuid();
      sessionIds.push(sessionId);
      await queryRunner.query(`
        INSERT INTO session (id, workflow_id, user_id, mode, status, confidence_score, created_at)
        VALUES ($1, $2, $3, $4::session_mode_enum, $5::session_status_enum, 0.85, now())
        ON CONFLICT (id) DO NOTHING
      `, [sessionId, session.workflowId, analystId, session.mode, session.status]);
      console.log(`  ✓ Session: ${session.inputText.substring(0, 40)}... (${session.status})`);
    }

    // ═══════════════════════════════════════════════════════════
    // 6. Messages
    // ═══════════════════════════════════════════════════════════
    console.log('\n💭 Seeding Messages...');
    
    const session1Messages = [
      { role: 'user', type: 'user_input', content: 'Create an employee onboarding workflow that collects personal details, provisions system access, and confirms completion.' },
      { role: 'ai', type: 'ai_response', content: 'I\'ve analyzed your request and identified the key actors: HR Manager, IT Department, and New Employee.' },
      { role: 'ai', type: 'ai_summary', content: 'The onboarding workflow includes 5 main steps: collect details, verify documents, create accounts, assign training, and confirm completion.' },
      { role: 'system', type: 'system_status', content: 'Session completed with 85% confidence. Workflow ready for review.' },
    ];

    const session2Messages = [
      { role: 'user', type: 'user_input', content: 'Build an expense approval workflow that routes to manager for approval based on amount.' },
      { role: 'ai', type: 'ai_question', content: 'What should happen to requests under $100? Should they require manager approval or can they be auto-approved?' },
      { role: 'user', type: 'user_input', content: 'Under $100 can be auto-approved, over $100 needs manager.' },
      { role: 'ai', type: 'ai_response', content: 'Got it! I\'ve added a decision gateway based on amount threshold.' },
    ];

    const messageBatches = [
      { sessionId: sessionIds[0], messages: session1Messages },
      { sessionId: sessionIds[1], messages: session2Messages },
    ];
    
    let messageOrder = 0;
    for (const batch of messageBatches) {
      for (const msg of batch.messages) {
        messageOrder++;
        await queryRunner.query(`
          INSERT INTO message (id, session_id, role, type, content, metadata, created_at)
          VALUES ($1, $2, $3::message_role_enum, $4::message_type_enum, $5, '{}'::jsonb, now())
          ON CONFLICT (id) DO NOTHING
        `, [uuid(), batch.sessionId, msg.role, msg.type, msg.content]);
      }
    }
    console.log(`  ✓ Messages: ${messageOrder} messages created`);

    // ═══════════════════════════════════════════════════════════
    // 7. Comments
    // ═══════════════════════════════════════════════════════════
    console.log('\n💬 Seeding Comments...');
    
    const comments = [
      { workflowId: onboardingWorkflowId, type: 'approval', content: 'This workflow looks good! Approved for export.', authorId: ownerId },
      { workflowId: expenseWorkflowId, type: 'question', content: 'Should there be a notification to the employee when their request is approved or rejected?', authorId: analystId },
      { workflowId: vacationWorkflowId, type: 'correction', content: 'Please change the approval timeout from 48 hours to 24 hours.', authorId: ownerId },
    ];

    for (const comment of comments) {
      const commentId = uuid();
      await queryRunner.query(`
        INSERT INTO comment (id, workflow_id, type, content, author_id, created_at)
        VALUES ($1, $2, $3::comment_type_enum, $4, $5, now())
        ON CONFLICT (id) DO NOTHING
      `, [commentId, comment.workflowId, comment.type, comment.content, comment.authorId]);
      console.log(`  ✓ Comment: ${comment.type} - ${comment.content.substring(0, 30)}...`);
    }

    // ═══════════════════════════════════════════════════════════
    // 8. Documents
    // ═══════════════════════════════════════════════════════════
    console.log('\n📄 Seeding Documents...');
    
    const documents = [
      { name: 'HR Policy Manual', originalName: 'hr-policy.pdf', mimeType: 'application/pdf', size: 1024000, workflowId: onboardingWorkflowId },
      { name: 'Expense Form Template', originalName: 'expense-form.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 51200, workflowId: expenseWorkflowId },
      { name: 'Leave Request Notes', originalName: 'leave-notes.txt', mimeType: 'text/plain', size: 4096, workflowId: vacationWorkflowId },
    ];

    for (const doc of documents) {
      const documentId = uuid();
      await queryRunner.query(`
        INSERT INTO document (id, workflow_id, filename, file_type, storage_url, file_size_bytes, doc_version, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 1, now())
        ON CONFLICT (id) DO NOTHING
      `, [documentId, doc.workflowId, doc.name, doc.mimeType, `documents/${doc.workflowId}/${doc.originalName}`, doc.size]);
      console.log(`  ✓ Document: ${doc.name}`);
    }

    // ═══════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(50));
    console.log('✅ Database seeded successfully!');
    console.log('='.repeat(50));
    console.log('\n📋 Test Credentials:');
    console.log('  Admin:    admin@acme.com / password123');
    console.log('  Owner:    owner@acme.com / password123');
    console.log('  Analyst:  analyst@acme.com / password123');
    console.log('\n🌐 API Base URL: http://localhost:3000');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seed().catch(console.error);