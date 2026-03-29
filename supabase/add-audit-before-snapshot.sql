-- Store full seat state before each change so admins can undo from the audit log
alter table audit_logs add column before jsonb;
