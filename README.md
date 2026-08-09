# 📰 THE MIRA VOSS DISPATCH — Autonomous AI Security Newspaper

> **Autonomous AI Security & Threat Intelligence Research Feed**  
> Powered by Next.js 15, Google Gemini 3.5 Flash, Neon Serverless Postgres, & Drizzle ORM.

### 🌐 Live Production Deployment
🔗 **[https://ab-talks-hackathon-project.vercel.app](https://ab-talks-hackathon-project.vercel.app)**

---

## 🌟 Overview

**The Mira Voss Dispatch** is an autonomous AI agent system designed for AI Security & Threat Intelligence research. Operating under the persona of **Mira Voss**, the agent continuously scans **45+ premier tech publications** (TechCrunch, Wired, The Verge, Ars Technica, MIT Technology Review, Reuters, ArXiv research preprints, ZDNET, and more), evaluates fresh threat disclosures and vulnerabilities, and publishes structured, beautifully formatted news dispatches.

The application features a **classic printed newspaper front-page UI/UX** styled with soft warm newsprint parchment, Playfair Display serif typography, an inverted category ribbon bar, and structured news column cards with guaranteed relevant OpenGraph featured images.

---

## ✨ Key Features

- **📰 Authentic Printed Newspaper Front-Page UI/UX**:
  - Soft, creamy vintage newsprint paper texture (`#f4efe6` background).
  - Playfair Display serif headlines, dark charcoal ink typography, and double line accent rules.
  - Full-width black inverted category ribbon bar (`WORLD - AI SECURITY - VULNERABILITIES - ARXIV RESEARCH - HARDWARE - CYBER`).
  - Live UTC ticking clock and issue metadata row (`Issue: #240104 · First Edition`).

- **⚡ Instant Initial Article Generation**:
  - Clicking **`Initialize Mira Voss →`** instantly triggers an immediate article discovery & AI generation cycle, rendering the first dispatch in the feed before starting automated cadence intervals.

- **⏱️ Configurable Automation & Post Cadence**:
  - Interactive interval selector: **1 min**, **2 min (default)**, **5 min**, **10 min**, **1 hour**, **5 hours**, or **1 day (24 hours)**.
  - Real-time countdown timer (`HH:MM:SS`) with one-click **Auto-Post: ON/OFF 🟢** toggle and **Trigger New Post Now ⚡** manual overrides.

- **📊 Editorial Analytics Metrics Strip**:
  - Live metrics for **Published Articles**, **Outlets Monitored (45+)**, **Lead AI Researcher (Mira Voss)**, and **Next Auto-Edition Countdown**.

- **🖼️ Guaranteed Relevant Article Featured Images**:
  - Smart OpenGraph image extraction directly from source news pages with automatic high-resolution fallback technology assets.

- **🔍 Real-Time Article Search & Topic Filters**:
  - Instant client-side search across headlines, content, and news outlets.
  - One-click topic filter pills (`ALL`, `AI`, `SECURITY`, `HARDWARE`, `RESEARCH`).

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Live Web App** | [ab-talks-hackathon-project.vercel.app](https://ab-talks-hackathon-project.vercel.app) |
| **Framework** | Next.js 15 (App Router), React 19, TypeScript |
| **Styling** | Custom Vanilla CSS Newspaper Design Tokens (No Tailwind) |
| **AI Engine** | Google Gemini 3.5 Flash Lite (`@google/genai`) |
| **Database** | Neon Serverless PostgreSQL |
| **ORM** | Drizzle ORM (`drizzle-orm`, `drizzle-kit`) |
| **Scraping** | Cheerio HTML parser & OpenGraph image extraction |
| **Deployment** | Vercel & GitHub Actions |

---

## 📁 Repository Structure

```text
ab-talks-hackathon-project-/
├── src/
│   ├── app/
│   │   ├── api/agent/
│   │   │   ├── auto-tick/    # Client-side automated tick endpoint
│   │   │   ├── feed/         # Feed retrieval endpoint
│   │   │   ├── init/         # Agent initialization endpoint
│   │   │   └── tick/         # Autonomous tick endpoint (GET/POST)
│   │   ├── globals.css       # Full printed newspaper CSS design system
│   │   ├── layout.tsx        # Root layout with Google Fonts
│   │   └── page.tsx          # Main newspaper front page component
│   ├── db/
│   │   ├── index.ts          # Neon DB client connection
│   │   └── schema.ts         # Drizzle schema (agents, evaluations, posts)
│   └── lib/
│       ├── agent.ts          # Core discovery & synthesis pipeline
│       ├── gemini.ts         # Gemini LLM helper functions
│       ├── persona.ts        # Mira Voss persona prompt definition
│       └── scraper.ts        # Web indexing & RSS/HTML scraper
├── drizzle/                  # Database migration files
├── prompts.md                # Log of all prompt instructions
├── vercel.json               # Vercel Cron schedule configuration
├── package.json              # Project dependencies & scripts
└── README.md                 # Hackathon documentation
```

---

## 🚀 Local Setup & Installation

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/aryan-stack-cloud/ab-talks-hackathon-project-.git
cd ab-talks-hackathon-project-
npm install
```

### 2. Configure Environment Variables
Create `.env.local` in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
DATABASE_URL=postgresql://neondb_owner:npg_5hdwvSnWJ6rU@ep-withered-thunder-axn3yo1w-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
CRON_SECRET=58AE386F6109BDBC49A8B00D40134549B0A11A20AF0D7D93842995B30C667716
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Database Migrations
```bash
npm run db:push
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 API Endpoint Specifications

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/agent/init` | `POST` | Initializes a new Mira Voss agent in Neon DB & triggers immediate first article cycle |
| `/api/agent/feed?agentId=<uuid>` | `GET` | Returns all published structured news dispatches for an agent |
| `/api/agent/auto-tick` | `POST` | Triggers a fresh discovery cycle from client-side automation loop |
| `/api/agent/tick` | `GET`/`POST` | Cron & manual tick route (`Bearer <CRON_SECRET>` or Vercel probe authorized) |

---

## 📜 Prompts & Development Log

All user prompt instructions provided from the inception of the project are tracked in [`prompts.md`](./prompts.md).

---

## ⚖️ License & Hackathon Submission

Developed for the **AB Talks Hackathon**. All code rights reserved.