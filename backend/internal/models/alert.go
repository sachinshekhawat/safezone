package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ========================
// Alert
// ========================

type AlertType string

const (
	AlertSpike         AlertType = "spike"
	AlertHighRisk      AlertType = "high_risk"
	AlertTrendReversal AlertType = "trend_reversal"
	AlertNewHotspot    AlertType = "new_hotspot"
	AlertDataQuality   AlertType = "data_quality"
	AlertSOSEscalation AlertType = "sos_escalation"
)

type AlertSeverity string

const (
	SeverityCritical AlertSeverity = "critical"
	SeverityHigh     AlertSeverity = "high"
	SeverityMedium   AlertSeverity = "medium"
	SeverityLow      AlertSeverity = "low"
)

// Alert represents a system-generated or AI-generated alert.
type Alert struct {
	ID              uuid.UUID     `json:"id"`
	ZoneID          uuid.UUID     `json:"zone_id"`
	AlertType       AlertType     `json:"alert_type"`
	Severity        AlertSeverity `json:"severity"`
	Title           string        `json:"title"`
	Message         string        `json:"message"`
	IsAcknowledged  bool          `json:"is_acknowledged"`
	AcknowledgedBy  *uuid.UUID    `json:"acknowledged_by,omitempty"`
	AcknowledgedAt  *time.Time    `json:"acknowledged_at,omitempty"`
	ResolutionNotes *string       `json:"resolution_notes,omitempty"`
	GeneratedBy     *string       `json:"generated_by,omitempty"`
	CreatedAt       time.Time     `json:"created_at"`
	ExpiresAt       *time.Time    `json:"expires_at,omitempty"`

	// Joined fields
	ZoneName *string `json:"zone_name,omitempty"`
	CityName *string `json:"city_name,omitempty"`
}

// ========================
// Audit Log
// ========================

// AuditLog represents an immutable audit trail entry.
type AuditLog struct {
	ID         uuid.UUID       `json:"id"`
	UserID     *uuid.UUID      `json:"user_id,omitempty"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   *uuid.UUID      `json:"entity_id,omitempty"`
	OldValues  json.RawMessage `json:"old_values,omitempty"`
	NewValues  json.RawMessage `json:"new_values,omitempty"`
	IPAddress  *string         `json:"ip_address,omitempty"`
	UserAgent  *string         `json:"user_agent,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

// ========================
// Chatbot / Agent
// ========================

// ChatbotSession represents a chat session with an AI agent.
type ChatbotSession struct {
	ID            uuid.UUID       `json:"id"`
	SOSRequestID  *uuid.UUID      `json:"sos_request_id,omitempty"`
	UserID        *uuid.UUID      `json:"user_id,omitempty"`
	SessionType   string          `json:"session_type"`
	AgentType     string          `json:"agent_type"`
	Language      string          `json:"language"`
	Status        string          `json:"status"`
	MessageCount  int             `json:"message_count"`
	ContextData   json.RawMessage `json:"context_data,omitempty"`
	StartedAt     time.Time       `json:"started_at"`
	EndedAt       *time.Time      `json:"ended_at,omitempty"`
	LastMessageAt *time.Time      `json:"last_message_at,omitempty"`
}

// ChatMessage represents a single message in a chat session.
type ChatMessage struct {
	ID           uuid.UUID       `json:"id"`
	SessionID    uuid.UUID       `json:"session_id"`
	Role         string          `json:"role"`
	Content      string          `json:"content"`
	ToolCalls    json.RawMessage `json:"tool_calls,omitempty"`
	ToolName     *string         `json:"tool_name,omitempty"`
	InputTokens  *int            `json:"input_tokens,omitempty"`
	OutputTokens *int            `json:"output_tokens,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ChatRequest is the request body for sending a chat message.
type ChatRequest struct {
	SessionID *uuid.UUID `json:"session_id,omitempty"` // nil = new session
	Message   string     `json:"message" validate:"required"`
	AgentType string     `json:"agent_type" validate:"required"`
	Language  string     `json:"language"`
	Context   map[string]interface{} `json:"context,omitempty"`
}

// ChatResponse is the response from a chat agent.
type ChatResponse struct {
	SessionID uuid.UUID `json:"session_id"`
	Message   string    `json:"message"`
	ToolsUsed []string  `json:"tools_used,omitempty"`
}

// AgentTask represents a background AI agent task.
type AgentTask struct {
	ID              uuid.UUID       `json:"id"`
	AgentType       string          `json:"agent_type"`
	TriggerType     string          `json:"trigger_type"`
	TriggeredBy     *uuid.UUID      `json:"triggered_by,omitempty"`
	Status          string          `json:"status"`
	InputParams     json.RawMessage `json:"input_params,omitempty"`
	OutputResult    json.RawMessage `json:"output_result,omitempty"`
	OutputFilePath  *string         `json:"output_file_path,omitempty"`
	StartedAt       *time.Time      `json:"started_at,omitempty"`
	CompletedAt     *time.Time      `json:"completed_at,omitempty"`
	DurationSeconds *float64        `json:"duration_seconds,omitempty"`
	ErrorMessage    *string         `json:"error_message,omitempty"`
	RetryCount      int             `json:"retry_count"`
	MaxRetries      int             `json:"max_retries"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ========================
// Common API Types
// ========================

// APIError represents a standard error response.
type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// PaginationParams holds pagination query parameters.
type PaginationParams struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
}

// DefaultPagination returns default pagination values.
func DefaultPagination() PaginationParams {
	return PaginationParams{Page: 1, Limit: 20}
}
