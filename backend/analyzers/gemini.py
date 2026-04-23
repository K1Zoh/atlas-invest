import os
import json
import re
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")
_model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

genai.configure(api_key=_api_key)


def _parse_vp(text: str) -> dict | None:
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def analyze_with_gemini(prompt: str) -> dict:
    if not _api_key:
        return {"model": "Gemini", "text": None, "error": "Clé API manquante"}
    try:
        model = genai.GenerativeModel(_model_name)
        response = model.generate_content(prompt)
        text = response.text
        vp = _parse_vp(text)
        return {
            "model": f"Gemini ({_model_name})",
            "text": text,
            "virtual_portfolio": vp,
            "conviction_level": vp.get("conviction_level") if vp else None,
            "error": None,
        }
    except Exception as e:
        return {"model": f"Gemini ({_model_name})", "text": None, "error": str(e)}
