import os
import json
import re


def analyze_with_gemini(prompt: str) -> dict:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"error": "GEMINI_API_KEY non configurée dans .env", "text": "", "virtual_portfolio": None, "conviction_level": None}

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        text = response.text
        vp = _extract_json(text)
        return {
            "model": f"Gemini ({model_name})",
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
