# Stock Market Analyzer — v2

Tableau de bord Streamlit pour suivre ton portefeuille boursier. Tout se gère depuis l'interface, aucun CSV requis.

## Installation

```bash
# Prérequis (une seule fois)
brew install python@3.12 uv

# Depuis le dossier du projet
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Phase 2 (optionnel — IA)
cp .env.example .env
# Remplis GEMINI_API_KEY et GROQ_API_KEY dans .env
```

## Lancement

```bash
streamlit run frontend/dashboard.py
```

Ouvre http://localhost:8501 dans ton navigateur.

## Utilisation

1. Onglet **💼 Gérer mes positions** → saisis ton ticker, clique **Vérifier le ticker** pour auto-remplir le nom et voir le cours actuel, puis **Enregistrer**.
2. Onglet **📊 Vue d'ensemble** → KPIs, graphiques et tableau détaillé.
3. Bouton **🔄 Actualiser les cours** (en haut à droite) → rafraîchit les prix en temps réel.

## Structure

```
stock-market-analyzer/
├── backend/
│   ├── db.py          # SQLite CRUD
│   ├── collectors.py  # Yahoo Finance via yfinance
│   └── analytics.py   # Calculs portefeuille
├── frontend/
│   └── dashboard.py   # Interface Streamlit
├── data/
│   └── portfolio.db   # Créé automatiquement (ignoré par git)
├── requirements.txt
├── .env.example
└── .gitignore
```
