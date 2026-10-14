-- Most queries are scoped to one user, so user_id leads every composite index.
CREATE INDEX idx_applications_user_status ON applications (user_id, status);
CREATE INDEX idx_applications_user_applied ON applications (user_id, applied_on DESC);
CREATE INDEX idx_applications_company ON applications (company_id);
CREATE INDEX idx_interviews_application ON interviews (application_id, scheduled_at);
CREATE INDEX idx_status_history_application ON status_history (application_id, changed_at);
CREATE INDEX idx_contacts_company ON contacts (company_id);
CREATE INDEX idx_sessions_user ON sessions (user_id);
