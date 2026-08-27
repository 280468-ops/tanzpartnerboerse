# Tanzpartnerbörse – Web-App

React/Vite-Web-App für die Suche nach Tanzpartnern für konkrete Sonntags-Workshops im Sonnenhof Aspach.

## Aktueller Ablauf
- Registrierung und Login über Supabase Auth
- Profil: Anzeigename, Alter, Geschlecht, optionale Größe in cm, Sichtbarkeit
- Workshops werden aus der Supabase-Tabelle `workshops` angezeigt
- Tanzart und Termin kommen aus dem Workshop und werden nicht im Profil gespeichert
- Nutzer können sich für einen konkreten Workshop als suchend markieren
- Andere offene Suchende werden für genau diesen Workshop angezeigt
- Kontaktanfrage ist immer an den Workshop gebunden
- Annahme erzeugt ein Tanzpaar für diesen Workshop
- Nach Annahme wird ein privater Chat freigeschaltet
- Wird ein Paar aufgelöst, kann für diesen Workshop erneut gesucht werden
- Ein Paar in einem Workshop kann nicht doppelt vergeben werden

## Supabase
Benötigt werden die Tabellen `profiles`, `workshops`, `workshop_interests`, `contact_requests`, `workshop_pairs`, `messages`.

Migrationen:
- `profile_height_migration.sql`
- `workshop_pair_migration.sql`
- `contact_chat_migration.sql`

## Konfiguration
`.env.example` nach `.env` kopieren und `VITE_SUPABASE_URL` sowie `VITE_SUPABASE_PUBLISHABLE_KEY` setzen.

Für Netlify sind die Variablen in `netlify.toml` hinterlegt.

## Start
```bash
npm install
npm run dev
```

## Hinweis
Die aktuelle Netlify-Version kann erst wieder automatisch veröffentlicht werden, wenn im Netlify-Team wieder Produktions-Credits verfügbar sind. Die ZIP enthält den vollständigen aktuellen Quellstand für den nächsten Deploy.
