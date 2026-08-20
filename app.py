"""
Production-Ready AI Chatbot Backend
Powered by Flask, OpenRouter API, and Gunicorn for Render Deployment.
"""

import os
import time
from collections import defaultdict
from typing import Any, Dict, List, Tuple
from flask import Flask, jsonify, render_template, request
import requests
from dotenv import load_dotenv

# Load local .env if present
load_dotenv()

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration & Environment Variables
# ---------------------------------------------------------------------------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b:free").strip()
MAX_MESSAGE_LENGTH = int(os.getenv("MAX_MESSAGE_LENGTH", "4000"))
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "12"))
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "20"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # in seconds

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
REQUEST_TIMEOUT_SECONDS = 45

# Lightweight in-memory rate limiter: IP -> list of timestamps
_rate_limit_records: Dict[str, List[float]] = defaultdict(list)


def is_rate_limited(client_ip: str) -> bool:
    """
    In-memory sliding window rate limiter per client IP.
    Keeps memory footprint tiny by cleaning old entries.
    """
    now = time.time()
    timestamps = _rate_limit_records[client_ip]

    # Purge timestamps outside the window
    cutoff = now - RATE_LIMIT_WINDOW
    _rate_limit_records[client_ip] = [ts for ts in timestamps if ts > cutoff]

    if len(_rate_limit_records[client_ip]) >= RATE_LIMIT_REQUESTS:
        return True

    _rate_limit_records[client_ip].append(now)
    return False


def sanitize_history(raw_history: Any) -> List[Dict[str, str]]:
    """
    Validates, filters, and slices conversation history to keep payload size optimal.
    """
    if not isinstance(raw_history, list):
        return []

    valid_messages: List[Dict[str, str]] = []
    for item in raw_history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()

        if role in ("user", "assistant") and content:
            # Enforce single message length cap
            if len(content) > MAX_MESSAGE_LENGTH:
                content = content[:MAX_MESSAGE_LENGTH]
            valid_messages.append({"role": role, "content": content})

    # Return only the most recent N allowed history messages
    return valid_messages[-MAX_HISTORY_MESSAGES:]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/", methods=["GET"])
def index():
    """Serves the primary single-page chat interface."""
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint for Render, uptime monitors, and load balancers."""
    return jsonify({
        "status": "healthy",
        "model": OPENROUTER_MODEL,
        "configured": bool(OPENROUTER_API_KEY)
    }), 200


@app.route("/api/config", methods=["GET"])
def get_public_config():
    """Returns safe, public non-sensitive configuration to frontend."""
    return jsonify({
        "model": OPENROUTER_MODEL,
        "maxMessageLength": MAX_MESSAGE_LENGTH,
        "maxHistoryMessages": MAX_HISTORY_MESSAGES,
        "rateLimitRequests": RATE_LIMIT_REQUESTS,
        "rateLimitWindow": RATE_LIMIT_WINDOW,
        "hasApiKey": bool(OPENROUTER_API_KEY)
    }), 200


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Main chat completion endpoint proxying requests securely to OpenRouter.
    """
    # 1. Client IP & In-Memory Rate Limiting
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1")
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    if is_rate_limited(client_ip):
        return jsonify({
            "success": False,
            "error": "Too many requests. Please wait a moment before trying again."
        }), 429

    # 2. Parse & Validate Payload
    if not request.is_json:
        return jsonify({
            "success": False,
            "error": "Invalid request format. JSON expected."
        }), 400

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Malformed request payload."
        }), 400

    raw_message = data.get("message")
    if not raw_message or not isinstance(raw_message, str) or not raw_message.strip():
        return jsonify({
            "success": False,
            "error": "Please enter a message."
        }), 400

    user_message = raw_message.strip()
    if len(user_message) > MAX_MESSAGE_LENGTH:
        return jsonify({
            "success": False,
            "error": f"Your message is too long (maximum {MAX_MESSAGE_LENGTH} characters)."
        }), 400

    # 3. Check OpenRouter API Key
    if not OPENROUTER_API_KEY:
        return jsonify({
            "success": False,
            "error": "AI service is not configured. Please set the OPENROUTER_API_KEY environment variable."
        }), 503

    # 4. Prepare Optimized Payload for OpenRouter
    history = sanitize_history(data.get("history", []))

    messages: List[Dict[str, str]] = [
        {
            "role": "system",
            "content": "You are a helpful, professional, and knowledgeable AI assistant. Provide concise, well-formatted answers with clear Markdown formatting where applicable."
        }
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("APP_URL", "https://render.com"),
        "X-Title": "Production AI Chatbot"
    }

    # 5. Execute HTTP Request to OpenRouter
    try:
        response = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS
        )

        # Handle specific upstream HTTP status codes
        if response.status_code == 401:
            return jsonify({
                "success": False,
                "error": "Authentication failed. Please verify your OpenRouter API key."
            }), 503

        if response.status_code == 429:
            return jsonify({
                "success": False,
                "error": "The AI model is currently rate-limited by the provider. Please retry in a few moments."
            }), 429

        if response.status_code == 404 or response.status_code == 400:
            # Possible invalid model name or unsupported parameters
            return jsonify({
                "success": False,
                "error": f"The configured model '{OPENROUTER_MODEL}' is currently unavailable or invalid on OpenRouter."
            }), 503

        if not response.ok:
            return jsonify({
                "success": False,
                "error": "The AI service is temporarily unavailable. Please try again."
            }), 503

        response_data = response.json()
        choices = response_data.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            return jsonify({
                "success": False,
                "error": "Received an empty response from the AI provider."
            }), 502

        first_choice = choices[0]
        message_obj = first_choice.get("message", {})
        ai_text = message_obj.get("content", "")

        if not ai_text:
            return jsonify({
                "success": False,
                "error": "The AI returned a blank response."
            }), 502

        return jsonify({
            "success": True,
            "response": ai_text.strip()
        }), 200

    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "The request took too long. Please try again."
        }), 504

    except requests.exceptions.ConnectionError:
        return jsonify({
            "success": False,
            "error": "Could not connect to the AI service. Please check your internet connection or server network."
        }), 503

    except Exception:
        # Never leak internal tracebacks to client
        return jsonify({
            "success": False,
            "error": "An unexpected error occurred while processing your message."
        }), 500


# ---------------------------------------------------------------------------
# Development Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
