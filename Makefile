.PHONY: help dev dev-down db-up db-down migrate-up migrate-down migrate-status migrate-create seed backend ai-service ai-train ai-train-db frontend test lint clean

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =========================
# Docker Compose
# =========================
dev: ## Start all services in development mode
	docker compose up --build

dev-down: ## Stop all services
	docker compose down

dev-clean: ## Stop all services and remove volumes
	docker compose down -v

# =========================
# Database
# =========================
db-up: ## Start PostgreSQL + Redis only
	docker compose up -d postgres redis

db-down: ## Stop PostgreSQL + Redis
	docker compose stop postgres redis

db-shell: ## Open PostgreSQL shell
	docker compose exec postgres psql -U safezone -d safezone_india

migrate-up: ## Run all migrations
	cd backend && go run cmd/migrate/main.go up

migrate-down: ## Rollback last migration
	cd backend && go run cmd/migrate/main.go down

migrate-status: ## Show applied and pending migrations
	cd backend && go run cmd/migrate/main.go status

migrate-create: ## Create a new migration (usage: make migrate-create NAME=create_xxx)
	cd backend && go run cmd/migrate/main.go create $(NAME)

seed: ## Seed database with initial data
	cd backend && go run cmd/seed/main.go

# =========================
# Backend (Go)
# =========================
backend: ## Run Go backend locally
	cd backend && go run cmd/gateway/main.go

backend-build: ## Build Go backend binary
	cd backend && go build -o bin/safezone-gateway cmd/gateway/main.go

backend-test: ## Run Go backend tests
	cd backend && go test ./... -v -cover

backend-lint: ## Lint Go backend
	cd backend && golangci-lint run ./...

# =========================
# AI Service (Python)
# =========================
ai-setup: ## Set up Python virtual environment
	cd ai-service && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt

ai-service: ## Run AI/ML service locally
	cd ai-service && . venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload

ai-test: ## Run AI service tests
	cd ai-service && . venv/bin/activate && pytest tests/ -v

ai-train: ## Train the risk predictor on synthetic data (bootstrap)
	cd ai-service && . venv/bin/activate && python -m app.training.train_risk_predictor --synthetic 4000

ai-train-db: ## Train the risk predictor on real rows from PostgreSQL
	cd ai-service && . venv/bin/activate && python -m app.training.train_risk_predictor --source db

# =========================
# Frontend (Next.js)
# =========================
frontend-setup: ## Install frontend dependencies
	cd frontend && npm install

frontend: ## Run frontend dev server
	cd frontend && npm run dev

frontend-build: ## Build frontend for production
	cd frontend && npm run build

frontend-lint: ## Lint frontend code
	cd frontend && npm run lint

# =========================
# Full Stack
# =========================
setup: db-up ai-setup frontend-setup ## Initial project setup
	@echo "✅ Project setup complete. Run 'make dev' to start all services."

test: backend-test ai-test ## Run all tests
	cd frontend && npm test

clean: ## Clean build artifacts
	cd backend && rm -rf bin/
	cd frontend && rm -rf .next/ out/
	cd ai-service && rm -rf __pycache__/ .pytest_cache/
