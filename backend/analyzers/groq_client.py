import os
import json
import re
import requests as _requests

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


def analyze_with_groq(prompt: str) -> dict:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return {"error": "GROQ_API_KEY non configurée dans .env", "text": "", "virtual_portfolio": None, "conviction_level": None}

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "Tu es un gestionnaire de portefeuille professionnel. Tu réponds exclusivement en français, de manière directe et structurée.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    try:
        r = _requests.post(
            GROQ_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=90,
        )
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"]
        vp = _extract_json(text)
        return {
            "model": f"Llama 3.3 70B (Groq)",
            "text": text,
            "virtual_portfolio": vp,
            "conviction_level": vp.get("conviction_level") if vp else None,
            "error": None,
        }
    except Exception as e:
        return {"error": str(e), "text": "", "virtual_portfolio": None, "conviction_level": None}


def _extract_json(text: str) -> dict | None:
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
    return None
