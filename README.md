# 🛡️ SafeZone India

> Data-driven safety risk prediction platform for Indian cities — empowering law enforcement and government to create safer environments for women.

[![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go)](https://go.dev/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python)](https://python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+PostGIS-4169E1?logo=postgresql)](https://postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 🎯 Mission

Help Indian police and government agencies identify high-risk areas, optimize patrol routes, and deploy resources effectively — **not to create fear, but to create attentiveness and safer environments for women**.

## ✨ Features

| Feature | Description |
|---|---|
| 🗺️ **Risk Heat Map** | Interactive map showing risk scores across zones in Indian cities |
| 📊 **Analytics Dashboard** | Trends, patterns, and monthly reports for police/government |
| 🆘 **SOS Emergency** | One-tap panic button with live location streaming to nearest police |
| 🤖 **AI Safety Advisor** | Chatbot answering "Is this area safe at night?" with data-backed advice |
| 🚔 **Patrol Optimizer** | AI-suggested patrol routes based on risk scores and time patterns |
| 📈 **ML Predictions** | XGBoost risk predictor + Prophet trend forecaster |
| 🔒 **Privacy First** | Zero victim PII stored — only anonymized statistical data |

## 🏗️ Architecture

```
Frontend (Next.js) → API Gateway (Go) → Microservices (Go) → PostgreSQL + PostGIS
                                      → AI/ML Service (Python/FastAPI) → Gemini AI
                                      → Redis (caching, pub/sub)
```

## 🏙️ Initial Cities

Delhi • Alwar • Jaipur • Lucknow • Bhopal

## 📁 Project Structure

```
safezone-india/
├── backend/          # Go API (Chi router, pgx, JWT)
│   ├── cmd/          # Service entry points
│   ├── internal/     # Models, handlers, middleware
│   └── migrations/   # SQL migrations (PostgreSQL + PostGIS)
├── ai-service/       # Python FastAPI (ML models + AI agents)
│   ├── app/agents/   # 5 AI agents (Crisis, Advisor, Report, Patrol, Analyst)
│   ├── app/models/   # ML models (XGBoost, Prophet, Isolation Forest)
│   └── app/training/ # Model training scripts
├── frontend/         # Next.js 14 (TypeScript, Tailwind, Leaflet maps)
│   └── src/          # Components, pages, hooks, stores
├── data/             # Raw + processed data
└── docs/             # API docs, legal, architecture
```

## 🚀 Quick Start

### Prerequisites

- Go 1.22+
- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 with PostGIS (or use Docker)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/safezone-india.git
cd safezone-india

# Copy environment variables
cp .env.example .env

# Start all services
make dev

# Access:
# Frontend: http://localhost:3000
# API:      http://localhost:8080
# AI API:   http://localhost:8090
```

### Option 2: Manual Setup

```bash
# 1. Start database
make db-up

# 2. Run migrations
make migrate-up

# 3. Start backend (terminal 1)
make backend

# 4. Start AI service (terminal 2)
make ai-setup
make ai-service

# 5. Start frontend (terminal 3)
make frontend-setup
make frontend
```

## 🗄️ Database Schema

21 tables across 9 migrations:

| Domain | Tables |
|---|---|
| **Core** | cities, zones, data_sources, users, police_stations |
| **Incidents** | incidents, incident_factors |
| **Analytics** | risk_scores, demographic_data, safety_programs, monthly_reports |
| **ML** | ml_models, predictions |
| **Alerts** | alerts, audit_logs |
| **SOS** | sos_requests, live_locations, emergency_contacts |
| **AI Chat** | chatbot_sessions, chat_messages, agent_tasks |

## 🤖 AI Agents

| Agent | Purpose |
|---|---|
| 🆘 **Crisis Agent** | Guides victims through emergencies, auto-dispatches police |
| 🗺️ **Safety Advisor** | Answers area safety questions with data-backed responses |
| 📊 **Report Generator** | Auto-generates monthly safety reports for government |
| 🚔 **Patrol Optimizer** | Suggests optimal patrol routes for police officers |
| 🔍 **Data Analyst** | Detects anomalies and data quality issues automatically |

## ⚖️ Legal Compliance

- **DPDP Act 2023** — No personal data collected; anonymized statistics only
- **IPC/BNS Section 228A** — Zero victim identity disclosure
- **NCRB Data** — Public data with proper attribution
- **IT Act 2000** — SSL/TLS, encryption at rest, audit logs

## 🔒 Privacy Guarantees

- ❌ No victim names, addresses, or FIR numbers stored
- ✅ Only age brackets, zone-level location, and statistical counts
- 🗑️ SOS location data auto-purged after 72 hours
- 📋 Full audit trail for all data access

## 📊 Data Sources

- NCRB "Crime in India" annual reports
- State police public records
- Court records (anonymized)
- NGO reports (verified)

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Go 1.22, Chi router, pgx v5, golang-jwt |
| **AI/ML** | Python 3.11, FastAPI, LangChain, scikit-learn, XGBoost |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Leaflet, Recharts |
| **Database** | PostgreSQL 16 + PostGIS |
| **Cache** | Redis 7 |
| **LLM** | Google Gemini (free tier) |
| **Maps** | OpenStreetMap + Leaflet (free) |
| **Infra** | Docker, Railway, Vercel, Neon |

## 🤝 Contributing

This is a social impact project. Contributions welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

> This platform provides statistical risk analysis based on publicly available data. Risk scores are predictions, not guarantees. No victim identity is stored or disclosed. This tool is designed to assist law enforcement and government agencies in resource allocation, not to create public fear.

---

Built with ❤️ for a safer India
