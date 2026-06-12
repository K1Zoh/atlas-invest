# DESIGN.md — Atlas

## Color

Stratégie : Restrained (neutres anthracite teintés + vert émeraude en accent ≤10 %,
cyan ponctuel pour l'info, rouge rosé pour les pertes).

Tokens (CSS variables, `src/app/globals.css`) :
- dark : background #0a0a0b, surface #131316, surface-2 #1a1a1f, border #26262c,
  foreground #f4f4f5, muted #9aa0aa, accent #10b981, accent-2 #22d3ee,
  danger #f43f5e, warning #f59e0b
- light : background #f6f7f8, surface #fff, foreground #0f172a, muted #475569,
  accent #059669 (contraste AA), danger #e11d48

## Typography

- Corps & UI : Geist Sans (var --font-geist-sans)
- Monospace (tickers, code) : Geist Mono
- Chiffres financiers : .tnum (font-variant-numeric: tabular-nums) obligatoire
- Échelle : text-[10px]/11px labels uppercase tracking-wider muted ;
  text-sm corps ; text-xl/2xl valeurs clés en font-bold

## Components

- Card : rounded-2xl, border-border, bg-surface/80, hover = halo vert très doux
  (shadow 0 0 24px -8px var(--glow)) + border accent/35
- Segmented : pills dans un conteneur border, actif = bg-surface + text-accent
- PctBadge : pill bg-accent-soft/danger-soft + flèche tendance
- Badge tones : neutral / accent / danger / warning / cyan
- Boutons : primary = bg-accent (texte sombre en dark), outline, ghost, danger

## Motion

- fade-up 0.45s cubic-bezier(0.21,1.02,0.73,1) à l'entrée, staggers ≤ 400ms
- Sparklines : draw-in stroke-dashoffset 1.1s ease-out
- Count-up des montants : 800ms ease-out cubique (AnimatedNumber)
- prefers-reduced-motion respecté globalement (kill switch CSS)

## Elevation & depth

- Blobs ambiants fixes (.ambient) : 2 radiaux flous opacité ≤ 0.13, jamais sur le texte
- Pas de glassmorphism décoratif ; backdrop-blur réservé topbar/sidebar/toasts
