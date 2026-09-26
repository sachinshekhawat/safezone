-- Rollback: 000006_alert_audit
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS alerts;

DROP TYPE IF EXISTS audit_action;
DROP TYPE IF EXISTS alert_severity;
DROP TYPE IF EXISTS alert_type;
