# AEGIS-AI-Powered-Disease-Outbreak-Intelligence-Early-Warning-System
AEGIS is an AI-driven epidemiological intelligence platform designed to detect, monitor, predict, and visualize infectious disease outbreaks across India.

The platform combines machine learning, graph analytics, environmental monitoring, and real-time intelligence generation to provide actionable insights for healthcare authorities, public health agencies, and disaster response teams.

AEGIS integrates disease surveillance data, weather patterns, water quality reports, hospital admissions, and outbreak predictions into a unified dashboard powered by Neo4j Graph Database.

---

## Key Features

### 🔐 Secure Authentication

* Firebase Authentication
* Email & Password Login
* Google Sign-In
* Email Verification Workflow
* Password Reset Support

### 📊 Real-Time Epidemiological Dashboard

* States Coverage
* District Coverage
* Admissions (Last 24 Hours)
* Latest Prediction Runs
* Water Quality Reports
* Weather Monitoring
* Active High-Risk Districts
* Real-Time Data Freshness Indicator

### 🧠 AI-Powered Disease Prediction

* Risk Classification

  * Low
  * Medium
  * High
  * Critical
* Disease Spread Forecasting
* Confidence Scoring
* Hotspot Detection

### 🚨 Alert Management System

* Automatic Alert Generation
* High-Risk District Monitoring
* Active Alert Tracking
* Critical Outbreak Escalation

### 🌍 Geographic Intelligence

* Dynamic India District Registry
* Border Adjacency Graph Mapping
* State-Level Analytics
* Regional Risk Assessment

### 📈 Advanced Visualizations

* Case Trends
* Disease Distribution
* Regional Risk Tables
* National Risk Index
* Intelligence Briefing Dashboard

### 🤖 Intelligence Briefing Engine

Generates deterministic outbreak intelligence from live data:

* Emerging Hotspots
* Escalation Factors
* Environmental Correlations
* Spread Projections
* Recommended Actions

---

## System Architecture

Hospital Data
      │
      ▼
Weather Data ──► Neo4j Knowledge Graph ◄── Water Quality Data
      │
      ▼
Prediction Engine
      │
      ▼
Risk Assessment
      │
      ▼
Alert Generation
      │
      ▼
Dashboard & Intelligence Briefings

--

Frontend

* React.js
* Vite
* Tailwind CSS
* Recharts
* React Query

Backend

* Node.js
* Express.js
* Neo4j Graph Database
* Redis Cache (with In-Memory Fallback)

Authentication

* Firebase Authentication

Infrastructure

* GitHub
* Render
* Vercel

---

## Live Telemetry

The platform continuously monitors:
| Metric                     | Description                  |
| -------------------------- | ---------------------------- |
| States                     | Total monitored states       |
| Districts                  | Total monitored districts    |
| Admissions                 | Last 24-hour admissions      |
| Predictions                | Latest prediction run        |
| Weather Reports            | Latest weather observations  |
| Water Reports              | Latest water quality reports |
| Active High-Risk Districts | Current high-risk districts  |
| Last Data Refresh          | Latest telemetry update      |

---
## Database Model

### Core Nodes

* State
* District
* Hospital
* Disease
* HospitalAdmission
* WeatherPattern
* WaterQualityReport
* OutbreakPrediction
* Alert

### Relationships

* IN_DISTRICT
* REPORTED_BY
* FOR_DISEASE
* LOCATED_IN
* BORDER_ADJACENT

---

## Real-Time Telemetry

AEGIS continuously tracks:

* Total States
* Total Districts
* Admissions (Last 24 Hours)
* Latest Prediction Run
* Weather Observations
* Water Reports
* Active High-Risk Districts
* Last Data Refresh Timestamp

---

## Technology Stack

| Layer            | Technology                |
| ---------------- | ------------------------- |
| Frontend         | React, Vite, Tailwind CSS |
| Backend          | Node.js, Express.js       |
| Database         | Neo4j AuraDB              |
| Authentication   | Firebase                  |
| Caching          | Redis                     |
| Charts           | Recharts                  |
| State Management | React Query               |
| Deployment       | Vercel, Render            |

---

## Installation

### Clone Repository

```bash
git clone https://github.com/your-username/aegis.git

cd aegis
```

### Frontend Setup

```bash
npm install

npm run dev
```

### Backend Setup

```bash
cd server

npm install

node server.js
```

---

## Environment Variables

### Frontend (.env)

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

### Backend (.env)

```env
PORT=5000

NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=

REDIS_URL=
```

---

## Example Analytics

### Disease Forecasting

* Cholera
* Dengue
* Malaria
* Typhoid

### Risk Prediction Levels

* Low
* Medium
* High
* Critical

### Environmental Correlations

* Rainfall
* Temperature
* Humidity
* Water Quality
* E. coli Levels
* Turbidity

---

## Project Highlights

✔ Graph-Based Disease Surveillance

✔ Real-Time Outbreak Intelligence

✔ Predictive Risk Assessment

✔ Automated Alert Generation

✔ Geo-Spatial Risk Monitoring

✔ Firebase Authentication

✔ Neo4j Analytics Engine

✔ AI-Powered Intelligence Briefing

✔ Production-Ready Dashboard

---

## Future Enhancements

* Satellite Weather Integration
* GIS Heatmaps
* Mobile Application
* SMS & Email Alerting
* LLM-Powered Intelligence Reports
* Government Health API Integrations

---

## Authors

Developed as part of an AI & Public Health Analytics Project.

### AEGIS

**AI-Powered Disease Outbreak Intelligence & Early Warning System**


