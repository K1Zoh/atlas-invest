"""
Bilingual UI strings — French (default) and English.
Usage: from backend.i18n import tr
       tr("tab.dashboard")   reads st.session_state._lang
"""
from __future__ import annotations
import streamlit as st

_T: dict[str, dict[str, str]] = {
    "fr": {
        # ── Brand ──────────────────────────────────────────────────────────────
        "brand.subtitle": "Moteur de Portefeuille Personnel",
        # ── Tabs ───────────────────────────────────────────────────────────────
        "tab.dashboard":  "▣  Dashboard",
        "tab.stocks":     "◈  Actions / ETF",
        "tab.crypto":     "₿  Crypto",
        "tab.alerts":     "◉  Alertes",
        "tab.watchlist":  "◎  Watchlist",
        "tab.fiscal":     "▤  Fiscal",
        "tab.settings":   "⚙  Paramètres",
        # ── Dashboard ──────────────────────────────────────────────────────────
        "dash.portfolio_evolution": "Évolution du portefeuille",
        "dash.benchmark":           "Comparaison benchmark",
        "dash.global_alloc":        "Répartition globale des actifs",
        "dash.stock_alloc":         "Actions / ETF — Répartition",
        "dash.crypto_alloc":        "Crypto — Répartition",
        "dash.geo":                 "Exposition géographique",
        "dash.rebalance":           "Rééquilibrage du portefeuille",
        "dash.risk_metrics":        "Métriques de risque",
        # ── Common (shared across tabs) ────────────────────────────────────────
        "common.normalized":        "Évolution normalisée — base 100",
        "common.positions":         "Détail des positions",
        "common.recommendations":   "Recommandations consolidées",
        "common.run_analysis":      "Lancer une analyse automatique",
        "common.ai_engine":         "IA Engine Competition",
        "common.analysis_history":  "Historique des analyses",
        "common.no_data":           "Aucune donnée disponible",
        # ── Stocks tab ─────────────────────────────────────────────────────────
        "stocks.alloc_value":       "Répartition par valeur",
        "stocks.alloc_sector":      "Répartition par secteur",
        "stocks.performance":       "Performance par position",
        "stocks.buy":               "Enregistrer un achat",
        "stocks.sell":              "Enregistrer une vente",
        "stocks.my_positions":      "Mes positions",
        "stocks.dca":               "Simulateur DCA",
        "stocks.dividends":         "Suivi des dividendes",
        "stocks.dividend_yield":    "Rendement des positions",
        "stocks.add_dividend":      "Enregistrer un dividende reçu",
        "stocks.dividend_history":  "Historique des dividendes reçus",
        "stocks.analysis_history":  "Historique des analyses",
        # ── Crypto tab ─────────────────────────────────────────────────────────
        "crypto.alloc":             "Répartition par crypto",
        "crypto.alloc_cat":         "Répartition par catégorie",
        "crypto.performance":       "Performance par crypto",
        "crypto.detail_card":       "Fiche détail — analyse d'une crypto",
        "crypto.add":               "Ajouter une crypto",
        "crypto.csv_import":        "Import en masse (CSV)",
        "crypto.my_positions":      "Mes positions crypto",
        "crypto.ai_engine":         "IA Engine Competition — Crypto",
        "crypto.analysis_history":  "Historique des analyses crypto",
        # ── Alerts tab ─────────────────────────────────────────────────────────
        "alerts.create":            "Créer une alerte",
        "alerts.check":             "Vérification manuelle",
        "alerts.active":            "Alertes actives",
        "alerts.triggered":         "Alertes déclenchées",
        # ── Fiscal tab ─────────────────────────────────────────────────────────
        "fiscal.stocks_gains":      "◈ Actions / ETF — Plus-values réalisées",
        "fiscal.crypto_2086":       "₿ Crypto — Formulaire 2086",
        "fiscal.summary":           "Récapitulatif fiscal global",
        # ── Settings tab ───────────────────────────────────────────────────────
        "settings.display_title":   "Affichage",
        "settings.lang_label":      "Langue / Language",
        "settings.theme_label":     "Thème",
        "settings.theme_dark":      "◑ Sombre",
        "settings.theme_light":     "◐ Clair",
        "settings.apply":           "Appliquer",
        "settings.saved":           "✓ Préférences sauvegardées.",
        "settings.notif_title":     "Notifications",
        "settings.notif_caption":   (
            "Configure tes canaux d'alerte directement ici. "
            "Les valeurs sont sauvegardées dans `data/settings.json` — "
            "aucune modification du fichier `.env` n'est nécessaire."
        ),
        "settings.email_title":     "Email (SMTP)",
        "settings.smtp_provider":   "Fournisseur",
        "settings.smtp_server":     "Serveur SMTP",
        "settings.smtp_port":       "Port",
        "settings.smtp_from":       "Email expéditeur",
        "settings.smtp_pass":       "Mot de passe / Clé d'application",
        "settings.smtp_to":         "Email destinataire des alertes",
        "settings.smtp_to_ph":      "laisser vide = même que l'expéditeur",
        "settings.smtp_saved":      "✓ Paramètres email sauvegardés.",
        "settings.smtp_test_info":  "Remplis et sauvegarde les paramètres SMTP pour tester.",
        "settings.tg_title":        "Telegram",
        "settings.tg_saved":        "✓ Paramètres Telegram sauvegardés.",
        "settings.tg_test_info":    "Remplis et sauvegarde le token et chat_id pour tester.",
        "settings.dc_title":        "Discord",
        "settings.dc_saved":        "✓ Webhook Discord sauvegardé.",
        "settings.dc_test_info":    "Remplis et sauvegarde le webhook URL pour tester.",
        "settings.status_title":    "Statut des canaux",
        "settings.configured":      "✓ Configuré",
        "settings.not_configured":  "—",
        # ── Buttons ────────────────────────────────────────────────────────────
        "btn.refresh":              "↻ Actualiser",
        "btn.search":               "Rechercher",
        "btn.use":                  "Utiliser ce titre",
        "btn.use_crypto":           "Utiliser cette crypto",
        "btn.simulate":             "Simuler",
        "btn.import":               "Importer",
        "btn.save_score":           "Enregistrer le score",
        "btn.check_now":            "Vérifier maintenant",
        "btn.add_watchlist":        "Ajouter à la watchlist",
        "btn.reset":                "↺ Réinitialiser aux valeurs actuelles",
        "btn.ai_rec":               "▶ Recommandation IA",
        "btn.test_email":           "Tester l'envoi email",
        "btn.test_msg":             "Tester l'envoi message",
        "btn.save":                 "Enregistrer",
    },
    "en": {
        # ── Brand ──────────────────────────────────────────────────────────────
        "brand.subtitle": "Personal Portfolio Engine",
        # ── Tabs ───────────────────────────────────────────────────────────────
        "tab.dashboard":  "▣  Dashboard",
        "tab.stocks":     "◈  Stocks / ETF",
        "tab.crypto":     "₿  Crypto",
        "tab.alerts":     "◉  Alerts",
        "tab.watchlist":  "◎  Watchlist",
        "tab.fiscal":     "▤  Tax",
        "tab.settings":   "⚙  Settings",
        # ── Dashboard ──────────────────────────────────────────────────────────
        "dash.portfolio_evolution": "Portfolio Evolution",
        "dash.benchmark":           "Benchmark Comparison",
        "dash.global_alloc":        "Global Asset Allocation",
        "dash.stock_alloc":         "Stocks / ETF — Allocation",
        "dash.crypto_alloc":        "Crypto — Allocation",
        "dash.geo":                 "Geographic Exposure",
        "dash.rebalance":           "Portfolio Rebalancing",
        "dash.risk_metrics":        "Risk Metrics",
        # ── Common ─────────────────────────────────────────────────────────────
        "common.normalized":        "Normalized Evolution — Base 100",
        "common.positions":         "Position Details",
        "common.recommendations":   "Consolidated Recommendations",
        "common.run_analysis":      "Run Automatic Analysis",
        "common.ai_engine":         "AI Engine Competition",
        "common.analysis_history":  "Analysis History",
        "common.no_data":           "No data available",
        # ── Stocks tab ─────────────────────────────────────────────────────────
        "stocks.alloc_value":       "Allocation by Value",
        "stocks.alloc_sector":      "Allocation by Sector",
        "stocks.performance":       "Performance by Position",
        "stocks.buy":               "Record a Purchase",
        "stocks.sell":              "Record a Sale",
        "stocks.my_positions":      "My Positions",
        "stocks.dca":               "DCA Simulator",
        "stocks.dividends":         "Dividend Tracking",
        "stocks.dividend_yield":    "Position Yield",
        "stocks.add_dividend":      "Record a Received Dividend",
        "stocks.dividend_history":  "Dividend History",
        "stocks.analysis_history":  "Analysis History",
        # ── Crypto tab ─────────────────────────────────────────────────────────
        "crypto.alloc":             "Allocation by Crypto",
        "crypto.alloc_cat":         "Allocation by Category",
        "crypto.performance":       "Performance by Crypto",
        "crypto.detail_card":       "Detail Card — Crypto Analysis",
        "crypto.add":               "Add a Crypto",
        "crypto.csv_import":        "Bulk Import (CSV)",
        "crypto.my_positions":      "My Crypto Positions",
        "crypto.ai_engine":         "AI Engine Competition — Crypto",
        "crypto.analysis_history":  "Crypto Analysis History",
        # ── Alerts tab ─────────────────────────────────────────────────────────
        "alerts.create":            "Create an Alert",
        "alerts.check":             "Manual Check",
        "alerts.active":            "Active Alerts",
        "alerts.triggered":         "Triggered Alerts",
        # ── Fiscal tab ─────────────────────────────────────────────────────────
        "fiscal.stocks_gains":      "◈ Stocks / ETF — Realized Gains",
        "fiscal.crypto_2086":       "₿ Crypto — Form 2086",
        "fiscal.summary":           "Global Tax Summary",
        # ── Settings tab ───────────────────────────────────────────────────────
        "settings.display_title":   "Display",
        "settings.lang_label":      "Language / Langue",
        "settings.theme_label":     "Theme",
        "settings.theme_dark":      "◑ Dark",
        "settings.theme_light":     "◐ Light",
        "settings.apply":           "Apply",
        "settings.saved":           "✓ Preferences saved.",
        "settings.notif_title":     "Notifications",
        "settings.notif_caption":   (
            "Configure your alert channels directly here. "
            "Values are saved in `data/settings.json` — "
            "no `.env` file editing required."
        ),
        "settings.email_title":     "Email (SMTP)",
        "settings.smtp_provider":   "Provider",
        "settings.smtp_server":     "SMTP Server",
        "settings.smtp_port":       "Port",
        "settings.smtp_from":       "From email",
        "settings.smtp_pass":       "Password / App Key",
        "settings.smtp_to":         "Alert recipient email",
        "settings.smtp_to_ph":      "leave empty = same as sender",
        "settings.smtp_saved":      "✓ Email settings saved.",
        "settings.smtp_test_info":  "Fill in and save SMTP settings to enable testing.",
        "settings.tg_title":        "Telegram",
        "settings.tg_saved":        "✓ Telegram settings saved.",
        "settings.tg_test_info":    "Fill in and save token + chat_id to enable testing.",
        "settings.dc_title":        "Discord",
        "settings.dc_saved":        "✓ Discord webhook saved.",
        "settings.dc_test_info":    "Fill in and save the webhook URL to enable testing.",
        "settings.status_title":    "Channel Status",
        "settings.configured":      "✓ Configured",
        "settings.not_configured":  "—",
        # ── Buttons ────────────────────────────────────────────────────────────
        "btn.refresh":              "↻ Refresh",
        "btn.search":               "Search",
        "btn.use":                  "Use this ticker",
        "btn.use_crypto":           "Use this crypto",
        "btn.simulate":             "Simulate",
        "btn.import":               "Import",
        "btn.save_score":           "Save Score",
        "btn.check_now":            "Check Now",
        "btn.add_watchlist":        "Add to Watchlist",
        "btn.reset":                "↺ Reset to current values",
        "btn.ai_rec":               "▶ AI Recommendation",
        "btn.test_email":           "Test email sending",
        "btn.test_msg":             "Test message sending",
        "btn.save":                 "Save",
    },
}


def tr(key: str, **kwargs: object) -> str:
    lang = st.session_state.get("_lang", "fr")
    text = _T.get(lang, _T["fr"]).get(key, key)
    return text.format(**kwargs) if kwargs else text
