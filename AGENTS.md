# AGENTS.md

## Architektur
Single-Page-App, bewusst schlank gehalten: die gesamte UI-Logik liegt in `src/main.jsx` (Auth, Dashboard mit Tab-Navigation, Suche, Profil-Editor, Favoriten, Kontakte). Styling in `src/styles.css`. Kein Router, kein State-Management jenseits von React-`useState`/`useEffect` — Navigation erfolgt über einen lokalen `tab`-State im Dashboard.

Supabase-Client wird einmal in `src/main.jsx` initialisiert (`createClient`) und direkt in den Komponenten für Auth und Datenzugriffe verwendet (kein Data-Layer/Repository-Abstraktion).

## Verzeichnisse
- `src/main.jsx` – gesamte App (Komponenten + Rendering)
- `src/styles.css` – Styling
- `index.html` – Vite-Entry-Point
- `netlify.toml` – Build-Konfiguration und Supabase-Client-Env-Vars für das Deployment

## Datenbank (Supabase, extern verwaltet)
Tabellen: `profiles`, `dance_styles`, `favorites`, `contact_requests`. Das Schema wird nicht in diesem Repo verwaltet, sondern liegt im Supabase-Projekt des Nutzers.

## Konventionen
- Deutsche UI-Texte, deutsche Variablennamen wo naheliegend (aus dem Original-Starter übernommen)
- Kein TypeScript, kein Linting-Setup — einfacher JS/JSX-Starter
- Fehler werden aktuell per `alert()` angezeigt (bewusst minimal für die Testversion)

## Nicht-offensichtliche Entscheidungen
- Der Supabase "publishable/anon key" ist absichtlich in `netlify.toml` als Klartext-Build-Env-Var hinterlegt statt als Secret in den Netlify-Projekteinstellungen, da programmatischer Zugriff auf die Netlify-Env-API in dieser Session nicht verfügbar war. Das ist unkritisch, da dieser Key für Client-Code vorgesehen ist und der eigentliche Schutz über Row Level Security in Supabase erfolgt.
- Die im README erwähnte SQL-Setup-Datei war nicht Teil des Starter-ZIPs; das Schema existiert laut Nutzerangabe bereits im verbundenen Supabase-Projekt.
