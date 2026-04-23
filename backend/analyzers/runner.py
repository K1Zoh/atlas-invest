from concurrent.futures import ThreadPoolExecutor, as_completed
from .gemini import analyze_with_gemini
from .groq_client import analyze_with_groq


def run_analysis(prompt: str) -> dict[str, dict]:
    """Exécute Gemini et Groq en parallèle. Retourne {"gemini": ..., "groq": ...}."""
    results = {}
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(analyze_with_gemini, prompt): "gemini",
            executor.submit(analyze_with_groq, prompt): "groq",
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                results[key] = {
                    "error": str(e),
                    "text": "",
                    "virtual_portfolio": None,
                    "conviction_level": None,
                }
    return results
