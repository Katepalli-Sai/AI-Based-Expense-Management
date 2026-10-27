"""Thin wrapper around the Gemini API. The key stays on the server; callers get friendly errors."""
import logging

from app.core.config import get_settings

log = logging.getLogger("ai")
TIMEOUT_MS = 30_000


class AIError(Exception):
    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.message, self.status_code = message, status_code


def ai_configured() -> bool:
    return get_settings().gemini_configured


def generate_text(prompt: str, system: str | None = None, json_mode: bool = False) -> str:
    s = get_settings()
    if not s.gemini_configured:
        raise AIError("AI features are not configured. Add GEMINI_API_KEY and GEMINI_MODEL to the backend .env file.", 503)
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=s.GEMINI_API_KEY, http_options=types.HttpOptions(timeout=TIMEOUT_MS))
        cfg = types.GenerateContentConfig(
            system_instruction=system, temperature=0.3, max_output_tokens=1500,
            response_mime_type="application/json" if json_mode else None,
        )
        resp = client.models.generate_content(model=s.GEMINI_MODEL, contents=prompt, config=cfg)
        text = (resp.text or "").strip()
        if not text:
            raise AIError("The AI returned an empty response. Please try again.", 502)
        return text
    except AIError:
        raise
    except Exception as exc:  # never leak the key or raw provider payloads
        name = type(exc).__name__
        msg = str(exc).lower()
        log.warning("Gemini call failed: %s", name)  # do not log the message: may echo request details
        if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
            raise AIError("The AI service is rate limited or out of quota right now. Try again later.", 429)
        if "404" in msg or "not found" in msg or "not supported" in msg:
            raise AIError("The configured Gemini model is unavailable. Check GEMINI_MODEL in the backend .env.", 503)
        if "timeout" in msg or "timed out" in msg or "deadline" in msg:
            raise AIError("The AI service took too long to respond. Please try again.", 504)
        if "api key" in msg or "401" in msg or "403" in msg or "permission" in msg:
            raise AIError("The Gemini API key was rejected. Check GEMINI_API_KEY in the backend .env.", 503)
        raise AIError("The AI service is temporarily unavailable. Please try again.", 502)
