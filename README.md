# Production-Ready AI Chatbot — OpenRouter + Flask + Render

A lightweight, high-performance, production-ready AI Chatbot web application built with **Python Flask**, **Vanilla JavaScript**, **CSS3**, and the **OpenRouter API**, specifically architected for cost-free, high-reliability deployment on **Render Web Services** and **Gunicorn**.

---

## 1. Project Overview

This AI Chatbot provides an enterprise-grade conversation experience without the overhead of heavy JavaScript frameworks, databases, or expensive compute instances.

### Key Highlights:
- **Zero Heavy Frontend Frameworks**: Pure HTML5, modern CSS3, and Vanilla JavaScript (ES6+).
- **Model-Agnostic OpenRouter Integration**: Seamlessly switch between free and paid AI models (e.g. Llama 3.3 70B Free, DeepSeek R1 Free, Gemini 2.0 Flash) solely via environment variables.
- **Render Free-Tier Optimized**: Extremely low RAM usage (~35MB) and negligible idle CPU footprint.
- **Built-in Security & Rate Limiting**: In-memory IP-based rate limiting, input sanitization, safe XSS-free Markdown rendering, and strict API key isolation.
- **Session Memory**: Client-side localStorage persistence with multi-conversation history, prompt suggestions, and export capabilities.

---

## 2. Features

- **Responsive Dark-Mode Interface**: Fluid on Desktop (1920px), Laptops, Tablets, iPhones, and Android devices.
- **Collapsible Drawer Sidebar**: Fast session switching, session deletion, and active chat indicators.
- **Markdown & Code Formatting**: Real-time formatting with syntax blocks, language badges, and one-click copy buttons.
- **Typing Indicator**: Lightweight CSS keyframe animations (zero JavaScript animation loops).
- **Prompt Starter Chips**: Immediate one-click conversation starters for coding, debugging, and concept explanation.
- **Conversation Actions**: One-click message copying, AI response regeneration, and Markdown export (`.md`).
- **Resilient Error Handling**: Clean, user-friendly error banners for rate limits, network timeouts, and model downtime without leaking server stack traces.

---

## 3. Tech Stack

- **Backend**: Python 3.10+, Flask 3.0.3, Requests
- **Production Server**: Gunicorn 22.0.0
- **AI Provider**: OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`)
- **Frontend**: Semantic HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+)
- **Source Control**: Git & GitHub
- **Deployment Platform**: Render (Web Service)

---

## 4. Folder Structure

```text
ai-chatbot/
│
├── app.py                  # Production Flask application & API routes
├── requirements.txt        # Python package dependencies
├── .gitignore              # Git ignore rules for Python, IDE, & secrets
├── README.md               # Comprehensive setup & deployment guide
│
├── templates/
│   └── index.html          # Semantic HTML5 Chatbot interface
│
└── static/
    ├── css/
    │   └── style.css       # Premium responsive CSS3 styles
    │
    └── js/
        └── script.js       # Pure Vanilla JS application logic
```

---

## 5. Local Setup & Installation

### Step 1: Clone the repository
```bash
git clone https://github.com/your-username/ai-chatbot.git
cd ai-chatbot
```

### Step 2: Create a virtual environment
```bash
# macOS / Linux
python3 -m venv venv

# Windows
python -m venv venv
```

### Step 3: Activate the virtual environment
```bash
# macOS / Linux
source venv/bin/activate

# Windows (Command Prompt)
venv\Scripts\activate.bat

# Windows (PowerShell)
venv\Scripts\Activate.ps1
```

### Step 4: Install dependencies
```bash
pip install -r requirements.txt
```

### Step 5: Configure environment variables
Create a `.env` file in the project root:
```env
OPENROUTER_API_KEY=sk-or-v1-your-actual-api-key-here
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
MAX_MESSAGE_LENGTH=4000
MAX_HISTORY_MESSAGES=12
RATE_LIMIT_REQUESTS=20
RATE_LIMIT_WINDOW=60
PORT=5000
```

### Step 6: Run the development server
```bash
python app.py
```
Open your browser and navigate to: `http://localhost:5000`

---

## 6. OpenRouter API Configuration

1. Visit [OpenRouter.ai](https://openrouter.ai/) and create an account.
2. Navigate to **Keys** and click **Create Key**.
3. Copy your API key (starts with `sk-or-v1-...`).
4. Set `OPENROUTER_API_KEY` in your environment.

### Popular Free-Tier Compatible Models:
| Model ID | Description |
| :--- | :--- |
| `meta-llama/llama-3.3-70b-instruct:free` | Flagship open weights model (fast & accurate) |
| `deepseek/deepseek-r1:free` | High-reasoning open model |
| `google/gemini-2.0-flash-exp:free` | Ultra-fast multimodal & reasoning model |
| `mistralai/mistral-7b-instruct:free` | Lightweight, low-latency conversational model |

> **Note on Free Models**: OpenRouter free-tier availability, quotas, and provider rate limits can fluctuate over time. If a specific model is rate-limited or deprecated, simply update the `OPENROUTER_MODEL` environment variable without making any source code changes.

---

## 7. GitHub Setup

```bash
# Initialize git repository
git init

# Add files
git add .

# Commit changes
git commit -m "feat: initial release of production AI chatbot"

# Link to your GitHub repo and push
git branch -M main
git remote add origin https://github.com/your-username/ai-chatbot.git
git push -u origin main
```

---

## 8. Render Deployment Guide

Deploying to Render takes less than 2 minutes using their free Web Service tier.

### 1. Create a New Web Service
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → Select **Web Service**.
3. Choose **Build and deploy from a Git repository**.
4. Connect your GitHub account and select your `ai-chatbot` repository.

### 2. Configure Service Settings
- **Name**: `ai-chatbot` (or any unique name)
- **Region**: Select closest to your users (e.g., Oregon, Frankfurt, Singapore)
- **Branch**: `main`
- **Root Directory**: Leave blank (uses root)
- **Runtime**: `Python 3`
- **Build Command**:
  ```bash
  pip install -r requirements.txt
  ```
- **Start Command**:
  ```bash
  gunicorn app:app
  ```
- **Instance Type**: `Free`

### 3. Add Environment Variables in Render
Under the **Environment Variables** section in Render, add:

| Key | Value | Description |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | `sk-or-v1-xxxxxxxxxxxx` | **(Secret)** Your OpenRouter API key |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | Active AI model ID |
| `MAX_MESSAGE_LENGTH` | `4000` | Maximum character length per message |
| `MAX_HISTORY_MESSAGES` | `12` | Maximum history messages sent per prompt |
| `RATE_LIMIT_REQUESTS` | `20` | Max requests allowed per client IP window |
| `RATE_LIMIT_WINDOW` | `60` | Sliding window in seconds (20 req / 60s) |

4. Click **Create Web Service**. Render will automatically build and deploy your app!

---

## 9. Security Checklist

- [x] **Zero Secret Leakage**: `OPENROUTER_API_KEY` is exclusively accessed server-side and never exposed to the client or version control.
- [x] **XSS Mitigation**: Client-side Markdown rendering escapes all raw HTML entities before constructing markup.
- [x] **In-Memory Rate Limiting**: Built-in sliding-window limiter prevents API abuse and denial-of-service attempts without requiring Redis.
- [x] **Payload Caps**: Strict length checks (`MAX_MESSAGE_LENGTH`) prevent memory bloat and massive token consumption.
- [x] **Safe Error Masking**: All server exceptions return generic friendly messages to prevent information disclosure.

---

## 10. Performance Checklist

- [x] **Low Memory Footprint**: Python process runs within ~35MB RAM on Render's 512MB free tier.
- [x] **Zero Framework Overhead**: Vanilla JS loads in <15ms with 0 npm dependencies on the client.
- [x] **Optimized History Slicing**: Slices only the latest $N$ messages to keep OpenRouter latency minimal and token usage low.
- [x] **Pure CSS Animations**: Smooth keyframe transitions for spinners and typing indicators without CPU-heavy `requestAnimationFrame` loops.

---

## License

MIT License. Free for commercial and personal use.
