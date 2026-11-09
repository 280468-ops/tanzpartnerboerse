/* Startseite v3 – einheitliche Schriftfarben und moderne Linien-Icons; Gastherren-Suche prüft Partnerstatus nur für den kommenden Sonntag. */
/* Gastherren v4 – kompakte Karten in der Gastherren-Anmeldung; dezente Schnellaktionen oben. */
/* v334 – Eigene Admin-Videozentrale: Upload, Komprimierung, Workshop/Termin und Empfänger getrennt von Medienzentrale. */
/* v333 – Chat-Videos entfernt; Mediathek nach Workshop-Terminen mit aktuellem + zwei vergangenen Terminen; Admin ordnet Videos Workshop zu. */
/* v332 – Annahme idempotent: Duplicate-Key bei parallelem Klick behoben; Chatstatus-Ladezustand sauber getrennt. */
/* v327 – Versandstatus der externen Vermittlungsbestätigung sichtbar machen. */
/* v317 – Medien & Links: korrekte Link-Vorschauen, vollständige Texte und Bearbeiten-Funktion. */
/* v319 – Medien: Titel und Beschreibung für alle Medien bearbeitbar. */
/* v311 – Mobile Responsive Fix: PDF/Teilen bleibt vollständig innerhalb der Admin-Kachel. */
/* v309 – Offene Vermittlungen: Gastherren werden jetzt ebenfalls in der Admin-Übersicht angezeigt. */
/* Version 297 – Passwort-Zurücksetzen repariert: Recovery verwendet den echten Auth-Client; Fehler bleiben nicht im Speichern-Status hängen.
 * Version 274 – Vermittlungs-Chatstatus + Nutzerfilter; Version 270 – Nutzerverwaltung: Profilstatus + Nutzer löschen.
 * - Profil vollständig = Name + Alter + Geschlecht + Größe.
 * - Jeder Nicht-Admin-Nutzer kann aus der Nutzerverwaltung endgültig gelöscht werden.
 * - Löschung erfolgt sicher über die serverseitige Edge Function admin-delete-user.
 * - Demo-Accounts können keine echten Nutzer löschen.
 *
 * Version 266 – Vermittlung/Chat/Reservierung Gesamtfix: neues Standardbild ohne alte Zwischenanzeige.
 * Service Worker wird cache-busting registriert; das Startbild erhält einen eindeutigen Versionsparameter.
 * Das bestehende Bild /icons/icon-512.png bleibt erhalten.
 */

/*
 * v266 – Gesamtfix
 * - Vermittlungen nach Workshops gruppiert, standardmäßig zugeklappt.
 * - Direkte Anfrage vs. Vermittlungsvorschlag klar gekennzeichnet.
 * - Persönlicher Chatstatus aus echten Nachrichten; Peter-&-Bettina-Infos ausgeschlossen.
 * - Offene gesendete Anfragen auch beim anfragenden Nutzer sichtbar.
 * - Chat: „Erst chatten“ plus funktionierende Annahme/Ablehnung.
 * - Admin: „Vermittlung trennen“ ohne Löschen der Workshop-Anmeldung/Nutzer.
 * - Kein updated_at-Schreiben auf workshop_match_proposals.
 * - Sitzplatz-Reservierungsbestätigung direkt unter dem Reservierungsbutton.
 * - Startseite: Profilhinweis und parallele Schnellabfragen.
 */


/* Version 229 – Vermittlung zeigt Alter, Körpergröße und freigegebenes Profilfoto (falls vorhanden). */

/*
 * Version 182 – Professionelle kompakte Admin-Ansichten
 *
 * Fachliche Änderungen: Admin-Dashboard gruppiert, Kennzahlen ruhiger, Detailseiten kompakter.
 * Bestehende Funktionen und Datenlogik bleiben erhalten.
 *
 * Version 142 – Admin-Dauerworkshop Dashboard, Druck/PDF und Navigation
 *
 * Fachliche Umsetzung:
 * - Nicht registriertes Tanzpaar wird gemeinsam als eine Workshop-Anmeldung behandelt.
 * - Die Anmeldung erhält einen individuellen, nicht erratbaren Verwaltungs-/Abmeldetoken.
 * - Die Bestätigungs-Mail soll einen Link zur Verwaltung dieser konkreten Anmeldung
 *   enthalten (z.B. ?manageWorkshopRegistration=<token>).
 * - Über diesen Link kann das Paar die Anmeldung für genau diesen Workshop stornieren.
 * - Es wird keine freie E-Mail-Eingabe zur Identifikation einer fremden Anmeldung verwendet.
 * - Beim Storno werden beide externen Teilnehmer gemeinsam aus der Workshop-Anmeldung
 *   entfernt und der Status/Platz des Workshops entsprechend aktualisiert.
 *
 * WICHTIG:
 * Diese Datei dokumentiert die benötigte Datenlogik; die konkrete Supabase-Spalte,
 * Edge-Function und Mail-Vorlage müssen an die in diesem Projekt vorhandenen
 * Tabellen/Funktionen angebunden werden. Es werden deshalb keine unbekannten
 * Datenbankspalten oder API-Aufrufe erfunden.
 */
/*
 * Abmelde-Logik – Version 118
 *
 * Gewünschtes Verhalten:
 * 1. Registriertes Tanzpaar: Abmeldung immer für das gesamte Tanzpaar.
 * 2. Registrierte Person + externer Tanzpartner: registrierte Person abmelden
 *    und die externe Vermittlung gleichzeitig auflösen.
 * 3. Gastherr wird dadurch wieder für diesen Workshop verfügbar.
 * 4. Keine verwaiste Vermittlung zurücklassen.
 *
 * Die eigentliche Datenbank-/UI-Logik sollte an der bestehenden Workshop-
 * Abmeldefunktion zentral umgesetzt werden, damit alle bisherigen
 * Benachrichtigungen und Statusänderungen erhalten bleiben.
 */

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

// Globale Datumsformatierung: Komponenten dürfen nicht von lokal definierten
// formatDate-/formatWorkshopDate-Funktionen anderer Komponenten abhängen.
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}

function formatWorkshopDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

// FINAL 35 – Admin-Cache-Synchronisierung
// Beide Admin-Konten sollen immer denselben aktuellen App-Stand laden.
// Ein einmaliger URL-Build-Parameter umgeht einen veralteten HTML/JS-Cache,
// ohne vorhandene App-Parameter wie ?workshops=1 zu verlieren.
const APP_BUILD_ID = "2026-10-24-paaranmeldung-partybild-v1";
if (typeof window !== "undefined") {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("appv") !== APP_BUILD_ID) {
      url.searchParams.set("appv", APP_BUILD_ID);
      window.history.replaceState(null, "", url.toString());
      // Die aktuelle URL wird einmal neu geladen, damit auch eine alte
      // zwischengespeicherte HTML-Version den neuen App-Stand anfordert.
      window.location.replace(url.toString());
    }
  } catch (_) {}
}

// Alte Service-Worker-Versionen vollständig entfernen.
// Die App verwendet bewusst keinen Service Worker mehr, damit veraltete
// HTML/JS/Bild-Caches nicht beim Start kurz sichtbar werden.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().catch(() => {});
    });
  }).catch(() => {});
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const realSupabase = createClient(supabaseUrl, supabaseKey);
// Wird nach dem Laden des Profils bei einem Demo-Account durch den sicheren
// Trainings-Proxy ersetzt. So bleiben auch Startseiten-Funktionen schreibgeschützt.
let supabase = realSupabase;


/* Professionelle, kompakte Nutzerverwaltung */
const COMPACT_USER_ADMIN_STYLE = `
.structured-user-management .users-list{
  display:flex !important;
  flex-direction:column !important;
  gap:6px !important;
  margin-top:10px !important;
}
.structured-user-management .modern-user-card{
  position:relative !important;
  display:block !important;
  width:100% !important;
  min-height:0 !important;
  margin:0 !important;
  padding:0 !important;
  border:1px solid #e6e0ee !important;
  border-radius:14px !important;
  background:#fff !important;
  box-shadow:0 1px 5px rgba(45,35,70,.07) !important;
  overflow:hidden !important;
}
.structured-user-management .modern-user-card::before,
.structured-user-management .modern-user-card::after{
  content:none !important;
  display:none !important;
}
.structured-user-management .modern-user-summary{
  appearance:none !important;
  -webkit-appearance:none !important;
  display:grid !important;
  grid-template-columns:minmax(0,1fr) auto 18px !important;
  align-items:center !important;
  width:100% !important;
  min-height:64px !important;
  margin:0 !important;
  padding:7px 8px !important;
  border:0 !important;
  border-radius:14px !important;
  background:#fff !important;
  color:#24212b !important;
  text-align:left !important;
  box-shadow:none !important;
}
.structured-user-management .modern-user-identity{
  display:flex !important;
  align-items:center !important;
  min-width:0 !important;
  gap:9px !important;
}
.structured-user-management .modern-user-avatar{
  flex:0 0 38px !important;
  width:38px !important;
  height:38px !important;
  border-radius:50% !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  font-size:14px !important;
  font-weight:800 !important;
}
.structured-user-management .modern-user-name{
  margin:0 !important;
  font-size:15px !important;
  line-height:1.15 !important;
  font-weight:800 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}
.structured-user-management .modern-user-meta{
  margin:2px 0 0 !important;
  font-size:11px !important;
  line-height:1.2 !important;
  color:#686270 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}
.structured-user-management .modern-user-badges{
  display:flex !important;
  flex-wrap:nowrap !important;
  gap:5px !important;
  margin-top:3px !important;
}
.structured-user-management .modern-badge{
  display:inline-flex !important;
  align-items:center !important;
  padding:2px 6px !important;
  border-radius:999px !important;
  font-size:9px !important;
  line-height:1.2 !important;
  white-space:nowrap !important;
}
.structured-user-management .modern-user-stats{
  display:flex !important;
  flex-direction:column !important;
  align-items:flex-end !important;
  gap:2px !important;
  margin:0 4px 0 8px !important;
}
.structured-user-management .modern-stat-pill{
  display:block !important;
  padding:0 !important;
  border:0 !important;
  background:transparent !important;
  font-size:10px !important;
  line-height:1.25 !important;
  color:#5f5967 !important;
  white-space:nowrap !important;
}
.structured-user-management .modern-stat-pill.partnerships{
  color:#6f4a88 !important;
}
.structured-user-management .modern-chevron{
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  width:18px !important;
  font-size:18px !important;
  line-height:1 !important;
  color:#7c3aed !important;
}
.structured-user-management .modern-user-details{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:6px !important;
  padding:0 8px 8px !important;
  border-top:1px solid #eee9f3 !important;
}
.structured-user-management .modern-detail-box{
  padding:8px !important;
  border-radius:10px !important;
  background:#f8f5fc !important;
}
.structured-user-management .modern-detail-label,
.structured-user-management .modern-detail-email,
.structured-user-management .modern-detail-row{
  font-size:11px !important;
  line-height:1.3 !important;
}
.structured-user-management .modern-actions-title{
  margin:0 0 6px !important;
  font-size:12px !important;
}
.structured-user-management .modern-action-btn{
  min-height:32px !important;
  padding:6px 9px !important;
  font-size:11px !important;
  border-radius:9px !important;
}
@media (max-width:600px){
  .structured-user-management{
    overflow-x:hidden !important;
  }
  .structured-user-management .users-list{
    gap:5px !important;
  }
  .structured-user-management .modern-user-summary{
    min-height:61px !important;
    padding:6px 7px !important;
    grid-template-columns:minmax(0,1fr) auto 16px !important;
  }
  .structured-user-management .modern-user-avatar{
    flex-basis:35px !important;
    width:35px !important;
    height:35px !important;
    font-size:13px !important;
  }
  .structured-user-management .modern-user-identity{
    gap:8px !important;
  }
  .structured-user-management .modern-user-name{
    font-size:14px !important;
  }
  .structured-user-management .modern-user-meta{
    font-size:10px !important;
  }
  .structured-user-management .modern-badge{
    font-size:8px !important;
    padding:2px 5px !important;
  }
  .structured-user-management .modern-stat-pill{
    font-size:9px !important;
  }
  .structured-user-management .modern-user-stats{
    margin-left:5px !important;
    margin-right:2px !important;
  }
}
`;

if (typeof document !== "undefined") {
  const styleId = "compact-user-admin-style";
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = COMPACT_USER_ADMIN_STYLE;
}

// Android/Chrome: Die Browser-Adressleiste soll weiß bleiben,
// damit sich der lilafarbene "‹ Startseite"-Button klar davon abhebt.
if (typeof document !== "undefined") {
  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    document.head.appendChild(themeMeta);
  }
  themeMeta.setAttribute("content", "#ffffff");
}

const READ_MESSAGES_KEY_PREFIX = "tanzpartnerboerse_read_messages_";

function getReadMessageIds(userId) {
  try {
    const raw = localStorage.getItem(
      `${READ_MESSAGES_KEY_PREFIX}${userId}`
    );
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

async function markMessageAsRead(userId, messageId) {
  if (!userId || !messageId) return;

  // Der Lesestatus wird jetzt dauerhaft in Supabase gespeichert.
  // localStorage bleibt nur als Fallback für ältere Nachrichten/Offline-Fälle.
  try {
    const { error } = await supabase
      .from("messages")
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq("id", messageId)
      .eq("recipient_id", userId);

    if (error) throw error;

    const ids = getReadMessageIds(userId);
    ids.add(messageId);
    const trimmed = Array.from(ids).slice(-1000);
    localStorage.setItem(
      `${READ_MESSAGES_KEY_PREFIX}${userId}`,
      JSON.stringify(trimmed)
    );

    window.dispatchEvent(
      new CustomEvent("tanzpartnerboerse-message-read", {
        detail: { userId, messageId }
      })
    );
  } catch (error) {
    // Fallback: der Nutzer soll die Nachricht trotzdem nicht erneut als neu sehen,
    // falls der Datenbank-Update gerade nicht möglich ist.
    try {
      const ids = getReadMessageIds(userId);
      ids.add(messageId);
      const trimmed = Array.from(ids).slice(-1000);
      localStorage.setItem(
        `${READ_MESSAGES_KEY_PREFIX}${userId}`,
        JSON.stringify(trimmed)
      );
    } catch {}
    console.warn("Nachricht konnte nicht dauerhaft als gelesen gespeichert werden:", error);
  }
}


// Zentrale E-Mail-Funktion: Die private E-Mail-Adresse wird dabei
// nicht an das Frontend gegeben. Die Edge Function kann sie anhand
// der recipientId serverseitig aus Supabase laden.
async function sendPartnerEmail({
  recipientId,
  recipientName = "Tanzfreund/in",
  partnerName = "Ein Tanzpartner",
  workshopName = "",
  date = "",
  messageType = "new_request"
}) {
  if (!recipientId) {
    console.error("E-Mail konnte nicht gesendet werden: recipientId fehlt.");
    return { ok: false, error: new Error("recipientId fehlt") };
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      "send-partner-email",
      {
        body: {
          recipientId,
          recipientName,
          partnerName,
          workshopName,
          date,
          messageType
        }
      }
    );

    if (error) {
      console.error("E-Mail-Benachrichtigung fehlgeschlagen:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (error) {
    console.error("Fehler beim E-Mail-Versand:", error);
    return { ok: false, error };
  }
}


async function sendWorkshopPairConfirmation({
  workshopId,
  registrationId,
  user1Name,
  user1Email,
  user2Name,
  user2Email,
  costPerPerson,
  isHotelBooking = false,
  isRecurringHotel = false,
  sessionDate = null
}) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "send-workshop-pair-confirmation",
      {
        body: {
          workshopId: Number(workshopId),
          registrationId: registrationId || null,
          user1Name,
          user1Email,
          user2Name,
          user2Email,
          costPerPerson: costPerPerson ?? null,
          isHotelBooking,
          isRecurringHotel,
          sessionDate
        }
      }
    );

    if (error) {
      console.error("Workshop-Bestätigungs-E-Mail fehlgeschlagen:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (error) {
    console.error("Fehler beim Versand der Workshop-Bestätigungs-E-Mail:", error);
    return { ok: false, error };
  }
}


async function sendRecurringWorkshopConfirmation({
  workshopId,
  registrationId,
  sessionDate,
  partySize,
  user1Name,
  user1Email,
  user2Name,
  user2Email
}) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "send-recurring-workshop-confirmation",
      {
        body: {
          workshopId: Number(workshopId),
          registrationId: registrationId || null,
          sessionDate,
          partySize: Number(partySize) === 2 ? 2 : 1,
          user1Name,
          user1Email,
          user2Name: Number(partySize) === 2 ? user2Name : null,
          user2Email: Number(partySize) === 2 ? user2Email : null
        }
      }
    );

    if (error) {
      console.error("Dauerworkshop-Bestätigungs-E-Mail fehlgeschlagen:", error);
      return { ok: false, error };
    }

    return { ok: true, data };
  } catch (error) {
    console.error("Fehler beim Versand der Dauerworkshop-Bestätigungs-E-Mail:", error);
    return { ok: false, error };
  }
}

// Öffentliches Login-Hintergrundbild aus Supabase Storage.
// Eine stabile URL ermöglicht dem Browser, das Bild zwischen Seitenaufrufen wiederzuverwenden.
// Nach einem Bildaustausch kann bei Bedarf eine feste Versionsnummer ergänzt werden.
const LOGIN_BACKGROUND_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/login-bg-q50.webp";

// Zentrales Workshop-Standardbild.
// Im Admin-Bereich kann dieses Bild unter „Workshop-Titelbild“ geändert werden.
// Es wird überall verwendet, wenn ein Workshop kein eigenes image_url hat.
const WORKSHOP_HEADER_CUSTOM_BASE_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/workshop-header.webp";
const WORKSHOP_HEADER_VERSION_KEY = "workshop-header-version";
const WORKSHOP_HEADER_VERSION = (() => {
  try { return localStorage.getItem(WORKSHOP_HEADER_VERSION_KEY) || "1"; }
  catch (_) { return "1"; }
})();
const WORKSHOP_HEADER_URL = `${WORKSHOP_HEADER_CUSTOM_BASE_URL}?v=${WORKSHOP_HEADER_VERSION}`;

// Workshop-Bilder: eigenes Workshopbild verwenden.
// Wenn keines vorhanden ist oder das hinterlegte Bild nicht geladen werden
// kann, wird überall das neue Peter-&-Bettina-Standardbild verwendet.
function getWorkshopImageUrl(workshop) {
  return workshop?.image_url || HOME_DANCERS_IMAGE;
}

function handleWorkshopImageFallback(event) {
  const current = event?.currentTarget;
  if (!current || current.dataset.defaultApplied === "1") return;
  current.dataset.defaultApplied = "1";
  current.onerror = null;
  current.src = HOME_DANCERS_IMAGE;
}

const ADMIN_USER_ID = "dee327bb-f3eb-4ada-bf05-bad48e4844df";
const SECOND_ADMIN_USER_ID = "2b115fae-a98a-4fcb-b862-e51753eeb487";

function getProfileCompletion(profile, user) {
  const fields = [
    { key: "display_name", label: "Anzeigename", value: Boolean((profile?.display_name || user?.user_metadata?.display_name || "").trim()) },
    { key: "age", label: "Alter", value: Boolean(profile?.age) },
    { key: "gender", label: "Geschlecht", value: Boolean(profile?.gender) },
    { key: "height_cm", label: "Größe", value: Boolean(profile?.height_cm) }
  ];
  const completed = fields.filter(field => field.value).length;
  const missingLabels = fields.filter(field => !field.value).map(field => field.label);
  return {
    completed,
    total: fields.length,
    complete: completed === fields.length,
    missingLabels
  };
}

const HOME_DANCERS_IMAGE = "/icons/icon-512.png?v=262";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      info: null
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error, info) {
    console.error("FEHLER IN DER APP:", error);
    console.error("FEHLER-INFO:", info);

    this.setState({
      error,
      info
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="card"
          style={{ margin: 20, padding: 20 }}
        >
          <h2>⚠️ Fehler in der App</h2>

          <p>
            <strong>
              {this.state.error?.message ||
                "Unbekannter Fehler"}
            </strong>
          </p>

          <details>
            <summary>
              Technische Details anzeigen
            </summary>

            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 12,
                marginTop: 15
              }}
            >
              {this.state.error?.stack ||
                "Kein Stack verfügbar"}

              {"\n\n"}

              {this.state.info?.componentStack || ""}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}


function getPublicWorkshopsUrl() {
  return `${window.location.origin}/?workshops=1`;
}

function getPublicPairRegistrationUrl(workshopId) {
  return `${window.location.origin}/?paaranmeldung=${encodeURIComponent(workshopId)}`;
}

const TANZKREIS_BANNER_DATA_URL = "/tanzkreis-preview.jpg";
function getPublicTanzkreisUrl() {
  return `${window.location.origin}/?tanzkreis=1`;
}

function getPublicRecurringWorkshopUrl(workshopId) {
  return `${window.location.origin}/?dauerworkshop=${encodeURIComponent(workshopId)}`;
}

function getNextFiveSaturdays() {
  const dates = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (dates.length < 5) {
    if (d.getDay() === 6) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
  }).format(date);
}

function isTanzkreisWorkshop(workshop) {
  return String(workshop?.workshop_type || "").toLowerCase() === "tanzkreis";
}

function sortWorkshopsDauerZuerst(list) {
  return [...(list || [])].sort((a, b) => {
    const aDauer = !!a?.recurrence_text;
    const bDauer = !!b?.recurrence_text;

    // Dauer-Workshops immer zuerst.
    if (aDauer && !bDauer) return -1;
    if (!aDauer && bDauer) return 1;

    // Innerhalb der Gruppen chronologisch sortieren.
    if (!a?.starts_at && !b?.starts_at) return 0;
    if (!a?.starts_at) return 1;
    if (!b?.starts_at) return -1;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
}

function PublicTanzkreisArea({ session = null }) {
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [tanzkreisParticipants, setTanzkreisParticipants] = useState({});
  const [tanzkreisParticipantsOpen, setTanzkreisParticipantsOpen] = useState({});
  const [tanzkreisParticipantsLoading, setTanzkreisParticipantsLoading] = useState({});

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErrorMessage("");
      const { data, error } = await supabase.rpc("get_public_workshops_for_registration");
      if (!active) return;
      if (error) {
        console.error("Tanzkreis konnte nicht geladen werden:", error);
        setErrorMessage("Der Tanzkreis konnte gerade nicht geladen werden.");
        setWorkshops([]);
      } else {
        const rows = sortWorkshopsDauerZuerst((data || []).filter(isTanzkreisWorkshop));
        setWorkshops(rows);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function togglePublicTanzkreisParticipants(workshop) {
    const key = String(workshop.id);
    const opening = !tanzkreisParticipantsOpen[key];
    setTanzkreisParticipantsOpen(prev => ({ ...prev, [key]: opening }));

    if (!opening) return;

    setTanzkreisParticipantsLoading(prev => ({ ...prev, [key]: true }));
    const { data, error } = await supabase.rpc(
      "get_public_tanzkreis_participants",
      { p_workshop_id: Number(workshop.id) }
    );

    if (error) {
      console.error("Tanzkreis-Teilnehmer konnten nicht geladen werden:", error);
      setTanzkreisParticipants(prev => ({ ...prev, [key]: [] }));
    } else {
      setTanzkreisParticipants(prev => ({
        ...prev,
        [key]: Array.isArray(data) ? data : []
      }));
    }

    setTanzkreisParticipantsLoading(prev => ({ ...prev, [key]: false }));
  }

  const tanzkreisPalettes = [
    { accent: "#28764A", soft: "#EAF5EA", border: "#CFE5D0", badge: "#F8F2DF" },
    { accent: "#2876A8", soft: "#EAF4FC", border: "#CFE4F4", badge: "#E8F2FF" },
    { accent: "#B66A27", soft: "#FFF5E7", border: "#F0DEC3", badge: "#FFF0D2" }
  ];

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "16px 12px 40px", fontFamily: "inherit", background: "linear-gradient(180deg,#fffdf8 0%,#f7faf7 55%,#ffffff 100%)", minHeight: "100vh", boxSizing: "border-box" }}>
      <a
        href={getPublicTanzkreisUrl()}
        aria-label="Tanzkreis öffnen"
        style={{
          display: "block",
          marginBottom: 12,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid #e3eadf",
          boxShadow: "0 7px 20px rgba(40,86,55,0.12)",
          background: "#ffffff",
          textDecoration: "none"
        }}
      >
        <img
          src={TANZKREIS_BANNER_DATA_URL}
          alt="Peter und Bettinas Tanzkreis"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </a>

      <section style={{ padding: "17px 16px", borderRadius: 20, background: "linear-gradient(135deg,#EAF5E9 0%,#FFF9EA 100%)", border: "1px solid #D7E7D4", marginBottom: 18, boxShadow: "0 5px 16px rgba(53,105,66,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "grid", placeItems: "center", width: 46, height: 46, flex: "0 0 46px", borderRadius: 15, background: "#FFFFFF", boxShadow: "0 2px 7px rgba(34,90,49,0.10)", fontSize: 27 }}>⭕</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 900, color: "#245B3A" }}>Tanzkreis</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#52715A", fontWeight: 700 }}>Gemeinsam tanzen. Gemeinsam Freude erleben.</div>
          </div>
        </div>
        <div style={{ marginTop: 12, color: "#4D6653", fontSize: 13, lineHeight: 1.5 }}>
          Hier findest du unsere nächsten Tanzkreis-Termine. Schau nach, wer dabei ist, und melde dich direkt mit deinem Tanzpartner an.
        </div>
        <a href="#tanzkreis-termine" style={{ display: "block", marginTop: 13, padding: "13px 14px", borderRadius: 13, background: "#28764A", color: "#FFFFFF", textAlign: "center", textDecoration: "none", fontSize: 15, fontWeight: 900, boxShadow: "0 3px 0 #1F603B" }}>
          📅 Unsere Termine ansehen
        </a>
        <div style={{ marginTop: 8, color: "#64806A", fontSize: 10.5, textAlign: "center" }}>Die Termine in diesem Bereich sind nur über den direkten Tanzkreis-Link erreichbar.</div>
      </section>

      <h2 id="tanzkreis-termine" style={{ margin: "20px 2px 12px", fontSize: 21, lineHeight: 1.2, color: "#27362D", fontWeight: 900 }}>Unsere nächsten Termine</h2>

      {loading && <div className="muted" style={{ padding: 18, textAlign: "center" }}>Tanzkreis wird geladen …</div>}
      {errorMessage && <div className="notice error">{errorMessage}</div>}
      {!loading && !errorMessage && workshops.length === 0 && (
        <div className="profile-card" style={{ padding: 18, textAlign: "center" }}>Aktuell sind keine Tanzkreis-Termine vorhanden.</div>
      )}

      {!loading && !errorMessage && workshops.map((w, index) => {
        const palette = tanzkreisPalettes[index % tanzkreisPalettes.length];
        const date = w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(w.starts_at)) : "Termin offen";
        const time = w.start_time ? String(w.start_time).slice(0,5) : (w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(w.starts_at)) : "");
        return (
          <article key={w.id} className="profile-card" style={{ padding: 14, marginBottom: 14, borderRadius: 19, border: `1px solid ${palette.border}`, borderLeft: `5px solid ${palette.accent}`, background: "#FFFFFF", boxShadow: "0 5px 16px rgba(37,52,42,0.06)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 60, minWidth: 60, borderRadius: 14, background: palette.badge, padding: "9px 4px 8px", textAlign: "center", border: `1px solid ${palette.border}`, boxSizing: "border-box" }}>
                <div style={{ fontSize: 10, letterSpacing: 1, fontWeight: 900, color: palette.accent }}>{w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", month: "short" }).format(new Date(w.starts_at)).replace(".", "").toUpperCase() : "TERM"}</div>
                <div style={{ fontSize: 27, lineHeight: 1.1, fontWeight: 950, color: palette.accent }}>{w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit" }).format(new Date(w.starts_at)) : "—"}</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: "#667064" }}>{w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date(w.starts_at)) : ""}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: palette.accent, fontWeight: 900, lineHeight: 1.4 }}>📅 {date}</div>
                <div style={{ marginTop: 4, fontSize: 18, lineHeight: 1.25, fontWeight: 900, color: "#252D35" }}>{w.title}</div>
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {time && <span style={{ padding: "4px 8px", borderRadius: 8, background: "#F0F5F8", color: "#455A68", fontSize: 11, fontWeight: 800 }}>🕒 {time} Uhr</span>}
                  {w.duration_minutes && <span style={{ padding: "4px 8px", borderRadius: 8, background: "#F0F5F8", color: "#455A68", fontSize: 11, fontWeight: 800 }}>⏱️ {w.duration_minutes} Min.</span>}
                </div>
              </div>
            </div>
            {w.level && <div style={{ marginTop: 11, display: "inline-flex", padding: "6px 10px", borderRadius: 9, background: palette.soft, color: palette.accent, fontSize: 11.5, fontWeight: 900 }}>{w.level}</div>}
            {w.info_text && <div style={{ marginTop: 8, color: "#5e5968", fontSize: 12.5, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{w.info_text}</div>}
            <button
              type="button"
              className="ghost"
              onClick={() => togglePublicTanzkreisParticipants(w)}
              style={{
                width: "100%",
                marginTop: 13,
                textAlign: "center",
                fontWeight: 850,
                borderRadius: 12,
                minHeight: 46,
                border: `1px solid ${palette.border}`,
                background: "#FFFFFF",
                color: palette.accent,
                boxShadow: "none"
              }}
            >
              👥 Wer ist noch dabei?
            </button>

            {tanzkreisParticipantsOpen[String(w.id)] && (
              <div
                style={{
                  marginTop: 7,
                  padding: "9px 10px",
                  borderRadius: 12,
                  background: palette.soft,
                  border: `1px solid ${palette.border}`,
                  color: "#37443B",
                  fontSize: 12.5,
                  lineHeight: 1.45
                }}
              >
                {tanzkreisParticipantsLoading[String(w.id)] ? (
                  <div className="muted">Teilnehmer werden geladen …</div>
                ) : !tanzkreisParticipants[String(w.id)]?.length ? (
                  <div className="muted">Noch niemand angemeldet.</div>
                ) : (
                  <>
                    <div style={{ fontWeight: 850, color: palette.accent, marginBottom: 5 }}>
                      Bereits angemeldet:
                    </div>
                    {tanzkreisParticipants[String(w.id)].map((row, index) => (
                      <div key={`${row.participant_pair}-${index}`} style={{ padding: "3px 0" }}>
                        👤 {row.participant_pair}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <a
              href={getPublicPairRegistrationUrl(w.id)}
              className="primary"
              style={{
                display: "block",
                marginTop: 8,
                padding: "13px 12px",
                borderRadius: 12,
                background: palette.accent,
                border: `1px solid ${palette.accent}`,
                color: "#FFFFFF",
                textAlign: "center",
                textDecoration: "none",
                fontWeight: 900,
                boxShadow: `0 3px 0 ${palette.accent}CC`
              }}
            >
              💃🕺 Als Tanzpaar anmelden
            </a>
            {w.booking_url && (
              <a
                href={w.booking_url}
                target="_blank"
                rel="noreferrer"
                className="ghost"
                style={{
                  display: "block",
                  marginTop: 7,
                  textAlign: "center",
                  textDecoration: "none"
                }}
              >
                🔗 Weitere Anmeldung
              </a>
            )}
          </article>
        );
      })}

      <div style={{ marginTop: 18, padding: "13px 14px", borderRadius: 15, background: "#EDF4FF", border: "1px solid #D5E4FA", color: "#49627D", fontSize: 12, lineHeight: 1.5 }}>
        🔗 Diesen Bereich kannst du direkt als Tanzkreis-Link weitergeben: <strong>{getPublicTanzkreisUrl()}</strong>
      </div>
    </main>
  );
}

function PublicWorkshopLanding() {
  const [showPartyImage, setShowPartyImage] = useState(false);
  // Alle fünf Startkacheln verwenden bewusst dieselbe Größe und Gestaltung.
  const tile = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    width: "100%", height: 88, minHeight: 88, maxHeight: 88, boxSizing: "border-box", padding: "14px 18px",
    borderRadius: 17, border: "1px solid #d9dfd2", background: "#fffdf9",
    color: "#55406b", textDecoration: "none", fontSize: 17, fontWeight: 900,
    boxShadow: "0 3px 12px rgba(85,64,107,.08)"
  };
  const tileLabel = (icon, label) => <><span style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}><span aria-hidden="true" style={{ width: 46, height: 46, minWidth: 46, display: "grid", placeItems: "center", borderRadius: 14, background: "#f1eee7", color: "#665b49", fontSize: 25 }}>{icon}</span><span>{label}</span></span><span aria-hidden="true" style={{ fontSize: 25, color: "#756783", lineHeight: 1 }}>›</span></>;
  return (
    <main style={{ minHeight: "100vh", boxSizing: "border-box", padding: "14px 12px 32px", background: "linear-gradient(180deg,#f7f3eb 0%,#fffdf9 58%,#f2f5ef 100%)" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ overflow: "hidden", borderRadius: 19, background: "#fffaf0", border: "1px solid #d9b66a", boxShadow: "0 4px 14px rgba(120,75,20,.10)", marginBottom: 16 }}>
          <img src="/alles-auf-einen-blick-ohne-haus.jpg?v=20261103b" alt="Alles auf einen Blick – alle Workshops und Aktivitäten von Peter & Bettina"
            style={{ display: "block", width: "100%", height: "auto", objectFit: "contain" }} />
        </div>
        <div style={{ display: "grid", gap: 11 }}>
          <a href="/?workshops=1&workshoptag=samstag" style={tile}>{tileLabel("🗓️", "Workshops am Samstag")}</a>
          <a href="/?workshops=1&workshoptag=sonntag" style={tile}>{tileLabel("📆", "Workshops am Sonntag")}</a>
          <a href="/" style={tile}>{tileLabel("🕺", "Tanzpartner finden")}</a>
          <button type="button" onClick={() => setShowPartyImage(true)} style={{ ...tile, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>{tileLabel("🎶", "Tanzparty am Sonntag")}</button>
          <a href="/?gastherren=1" style={tile}>{tileLabel("🤝", "Gastherr werden")}</a>
        </div>
        {showPartyImage && <div role="presentation" onClick={() => setShowPartyImage(false)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(20,10,35,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, boxSizing: "border-box" }}>
          <section role="dialog" aria-modal="true" aria-label="Informationen zur Tanzparty" onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(100%,560px)", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", background: "#fff", borderRadius: 16, padding: 10, boxSizing: "border-box" }}>
            <button type="button" onClick={() => setShowPartyImage(false)} style={{ display: "block", margin: "0 0 8px auto", border: 0, borderRadius: 9, padding: "8px 13px", background: "#f0e7fc", color: "#55406b", fontWeight: 800 }}>Schließen ✕</button>
            <img src="/discofox-tanzparty.png" alt="Informationen zur Tanzparty am Sonntag" style={{ display: "block", width: "100%", height: "auto", borderRadius: 10 }} />
          </section>
        </div>}
      </div>
    </main>
  );
}

function PublicWorkshopList() {
  const [showDiscofoxPartyImage, setShowDiscofoxPartyImage] = useState(false);
  const [workshops, setWorkshops] = useState([]);
  const [recurringDates, setRecurringDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => {
    let active = true;

    async function loadWorkshops() {
      setLoading(true);
      setErrorMessage("");
      const { data, error } = await supabase.rpc("get_public_workshops_for_registration");
      if (!active) return;

      if (error) {
        console.error("Öffentliche Workshops konnten nicht geladen werden:", error);
        setErrorMessage("Die Workshops konnten gerade nicht geladen werden.");
        setWorkshops([]);
      } else {
        const rows = sortWorkshopsDauerZuerst((data || []).filter(w => !isTanzkreisWorkshop(w)));
        setWorkshops(rows);

        const recurring = rows.filter(w => w.recurrence_text);
        const dateEntries = await Promise.all(
          recurring.map(async w => {
            const { data: dates, error: dateError } = await supabase.rpc(
              "get_recurring_workshop_dates",
              { p_workshop_id: Number(w.id) }
            );
            if (dateError) {
              console.warn("Dauerworkshop-Termine konnten nicht geladen werden:", dateError.message);
              return [String(w.id), []];
            }
            return [String(w.id), dates || []];
          })
        );

        if (active) setRecurringDates(Object.fromEntries(dateEntries));
      }

      setLoading(false);
    }

    loadWorkshops();
    return () => { active = false; };
  }, []);

  const purple = "#6b4b8a";
  const purpleDark = "#55406b";
  const softPurple = "#f4f0e8";
  const border = "#d9dfd2";

  // Counts come from get_public_workshops_for_registration():
  // registered_pair_count is the number of pair-registration rows for this workshop.
  const workshopPairAvailability = (workshop) => {
    const booked = Math.max(0, Number(workshop?.registered_pair_count || 0));
    const max = Number(workshop?.max_pair_count);
    if (!Number.isFinite(max) || max <= 0) {
      return `👥 ${booked} ${booked === 1 ? "Paar" : "Paare"} angemeldet · freie Paarplätze nicht hinterlegt`;
    }
    const free = Math.max(0, max - booked);
    if (free === 0) {
      return `👥 ${booked} von ${max} Paaren angemeldet · 🔴 AUSGEBUCHT`;
    }
    return `👥 ${booked} von ${max} Paaren angemeldet · ${free} Paarplätze frei`;
  };

  const compactMeta = (workshop, isRecurring) => (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "3px 10px",
        marginTop: 5,
        color: "#4e4857",
        fontSize: 12,
        lineHeight: 1.25
      }}
    >
      {workshop.trainer_name && <span>👤 {workshop.trainer_name}</span>}
      {workshop.level && <span>⭐ {workshop.level}</span>}
      {isRecurring && workshop.recurrence_text && <span>📅 {workshop.recurrence_text}</span>}
      {!isRecurring && workshop.starts_at && (
        <span>📅 {formatShortDate(new Date(workshop.starts_at))}</span>
      )}
      {workshop.start_time && <span>🕓 {String(workshop.start_time).slice(0, 5)} Uhr</span>}
      {workshop.duration_minutes != null && <span>⏱️ {workshop.duration_minutes} Min.</span>}
      {workshop.cost_per_person != null && (
        <span>💶 {Number(workshop.cost_per_person).toFixed(2).replace(".", ",")} € p.P.</span>
      )}
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "10px 12px 32px",
        background: "linear-gradient(180deg,#f7f3eb 0%,#fffdf9 58%,#f2f5ef 100%)",
        fontFamily: "inherit"
      }}
    >
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        {/* Schnellaktionen immer ganz oben, noch vor Bild und Workshopliste. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 10 }}>
          <a href="/" style={{ display: "block", textDecoration: "none", textAlign: "center", padding: "13px 10px", minHeight: 52, boxSizing: "border-box", borderRadius: 13, background: "#a51f25", color: "#fff", fontWeight: 900, fontSize: 14, lineHeight: 1.25, boxShadow: "0 2px 5px rgba(70,30,30,.13)" }}>
            Du suchst noch einen Tanzpartner?<br />Zur Tanzpartnersuche
          </a>
          <a href="/?gastherren=1" style={{ display: "block", textDecoration: "none", textAlign: "center", padding: "13px 10px", minHeight: 52, boxSizing: "border-box", borderRadius: 13, background: "linear-gradient(135deg,#f3ead8,#e8dfc9)", border: "1px solid #d8c8a6", color: "#665332", fontWeight: 900, fontSize: 14, lineHeight: 1.25, boxShadow: "0 2px 5px rgba(30,90,50,.08)" }}>
            Gastherr werden?<br />Informationen &amp; Anmeldung
          </a>
        </div>

        {/* Anklickbare Discofox-Party-Kachel: Das Plakat wird erst nach Antippen geöffnet. */}
        <button
          type="button"
          aria-label="Discofox Party ab 17.30 Uhr – Plakat anzeigen"
          onClick={() => setShowDiscofoxPartyImage(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
            margin: "0 0 14px",
            padding: "16px 18px",
            borderRadius: 16,
            background: "#fff",
            border: `1px solid ${border}`,
            boxShadow: "0 3px 12px rgba(85,64,107,0.08)",
            color: purpleDark,
            textAlign: "left",
            fontSize: 18,
            lineHeight: 1.25,
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          <span>💃 Discofox Party ab 17.30 Uhr</span>
          <span aria-hidden="true" style={{ fontSize: 24 }}>›</span>
        </button>

        {showDiscofoxPartyImage && (
          <div
            role="presentation"
            onClick={() => setShowDiscofoxPartyImage(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 10000,
              background: "rgba(20, 10, 35, 0.82)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 12, boxSizing: "border-box"
            }}
          >
            <section
              role="dialog" aria-modal="true" aria-label="Discofox-Party-Plakat"
              onClick={event => event.stopPropagation()}
              style={{
                position: "relative", width: "min(100%, 560px)",
                maxHeight: "calc(100dvh - 24px)", overflowY: "auto",
                background: "#fff", borderRadius: 16, padding: 10,
                boxSizing: "border-box"
              }}
            >
              <button
                type="button" aria-label="Plakat schließen"
                onClick={() => setShowDiscofoxPartyImage(false)}
                style={{
                  display: "block", margin: "0 0 8px auto", border: 0,
                  borderRadius: 9, padding: "8px 13px", background: "#f0e7fc",
                  color: purpleDark, fontWeight: 800, cursor: "pointer"
                }}
              >Schließen ✕</button>
              <img
                src="/discofox-tanzparty.png"
                alt="Discofox Tanzparty im Hotel Sonnenhof ab 17.30 Uhr"
                style={{ display: "block", width: "100%", height: "auto", borderRadius: 10 }}
              />
            </section>
          </div>
        )}


        {/* Kopfbereich – bewusst kompakt wie die gewünschte Vorlage */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div
            style={{
              width: "100%",
              overflow: "hidden",
              borderRadius: 18,
              background: "#f4f0e8",
              border: `1px solid ${border}`,
              boxShadow: "0 4px 14px rgba(85,64,107,0.08)"
            }}
          >
            <img
              src={HOME_DANCERS_IMAGE}
              alt="Workshop"
              style={{
                display: "block",
                width: "100%",
                maxHeight: 260,
                objectFit: "contain",
                objectPosition: "center",
                background: "#f1eafe"
              }}
              onError={handleWorkshopImageFallback}
            />
          </div>

          <h1
            style={{
              margin: "10px 0 1px",
              color: purpleDark,
              fontSize: 25,
              lineHeight: 1.1,
              fontWeight: 900
            }}
          >
            Workshops &amp; Paaranmeldung
          </h1>

          <div style={{ color: "#777", fontSize: 12.5 }}>
            Peter &amp; Bettina’s Tanzpartnerbörse
          </div>
        </div>

        {/* Kurzer Hinweis statt großer Infobox */}
        <div
          style={{
            padding: "8px 10px",
            marginBottom: 10,
            borderRadius: 15,
            background: "#f5f3ec",
            border: `1px solid ${border}`,
            color: "#4f4858",
            fontSize: 12,
            lineHeight: 1.35
          }}
        >
          <strong style={{ color: purple }}>🎟️ Anmeldung:</strong>{" "}
          Alle Workshops ansehen und direkt anmelden. Bei normalen Workshops als Paar; beim Dauerworkshop zuerst den Samstag und anschließend Einzelperson oder Paar wählen.
        </div>

        {loading && (
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            Workshops werden geladen …
          </div>
        )}

        {!loading && errorMessage && (
          <div
            className="card"
            style={{
              padding: 16,
              textAlign: "center",
              color: "#9b2226",
              background: "#fff5f5"
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && workshops.length === 0 && (
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🎟️</div>
            <h2 style={{ margin: "7px 0" }}>Keine Workshops verfügbar</h2>
          </div>
        )}

        {!loading && !errorMessage && workshops.map(workshop => {
          const isRecurring = !!workshop.recurrence_text;
          const dates = recurringDates[String(workshop.id)] || [];

          return (
            <article
              key={workshop.id}
              style={{
                background: "#fffdf9",
                border: `1px solid ${border}`,
                borderRadius: 17,
                marginBottom: 11,
                padding: 11,
                boxShadow: "0 3px 10px rgba(65,70,55,0.06)",
                borderLeft: `4px solid #9baa91`
              }}
            >
              {isRecurring ? (
                <>
                  {/* Dauerworkshop – wie die große, geöffnete Karte aus der Vorlage */}
                  <div
                    style={{
                      padding: "9px 10px",
                      borderRadius: 11,
                      background: softPurple,
                      border: `1px solid ${border}`
                    }}
                  >
                    <div
                      style={{
                        color: purple,
                        fontWeight: 900,
                        fontSize: 16,
                        lineHeight: 1.18
                      }}
                    >
                      {workshop.title}
                    </div>

                    {workshop.recurrence_text && (
                      <div
                        style={{
                          marginTop: 2,
                          color: "#4d4657",
                          fontWeight: 700,
                          fontSize: 12
                        }}
                      >
                        {workshop.recurrence_text}
                      </div>
                    )}

                    {compactMeta(workshop, true)}
                  </div>

                  <div style={{ marginTop: 9 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        color: purpleDark,
                        fontSize: 14,
                        margin: "0 0 6px 1px"
                      }}
                    >
                      📅 Nächste 5 Samstage
                    </div>

                    {/* Auf kleinen Handys horizontal scrollbar – keine riesigen Buttons */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        overflowX: "auto",
                        paddingBottom: 3,
                        WebkitOverflowScrolling: "touch"
                      }}
                    >
                      {dates.map(d => {
                        const free =
                          d.max_people == null
                            ? null
                            : Math.max(
                                0,
                                Number(d.max_people) - Number(d.registered_people || 0)
                              );

                        const date = new Date(`${d.session_date}T12:00:00`);

                        return (
                          <button
                            key={String(d.session_date)}
                            type="button"
                            onClick={() => {
                              if (free !== null && free <= 0) return;
                              window.location.href =
                                `${getPublicRecurringWorkshopUrl(workshop.id)}&termin=${encodeURIComponent(d.session_date)}`;
                            }}
                            disabled={free !== null && free <= 0}
                            style={{
                              flex: "0 0 116px",
                              minHeight: 72,
                              padding: "7px 6px",
                              borderRadius: 11,
                              border: `1px solid ${border}`,
                              background:
                                free !== null && free <= 0 ? "#eeeaf2" : purple,
                              color:
                                free !== null && free <= 0 ? "#888" : "#fff",
                              cursor:
                                free !== null && free <= 0 ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                              fontWeight: 900,
                              fontSize: 11.5,
                              lineHeight: 1.2,
                              boxShadow:
                                free !== null && free <= 0
                                  ? "none"
                                  : "0 2px 6px rgba(95,45,176,0.16)"
                            }}
                          >
                            <div style={{ fontSize: 10.5, opacity: 0.9 }}>
                              {new Intl.DateTimeFormat("de-DE", {
                                weekday: "short"
                              }).format(date)}
                            </div>
                            <div style={{ fontSize: 13.5, marginTop: 2 }}>
                              {new Intl.DateTimeFormat("de-DE", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric"
                              }).format(date)}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 10.5 }}>
                              {free === null
                                ? "Termin wählen →"
                                : free > 0
                                  ? "Wählen →"
                                  : "Ausgebucht"}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {!dates.length && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Termine werden geladen …
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#6b6175",
                        lineHeight: 1.35
                      }}
                    >
                      Nach jedem Samstag rückt automatisch der nächste Samstag nach.
                      Vergangene Termine werden nicht mehr angeboten.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Normale Workshops – eine einzige kompakte Zeile/Karte */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "7px 7px 7px 8px",
                      borderRadius: 11,
                      background: "#fff",
                      minWidth: 0
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: purple,
                          fontWeight: 900,
                          fontSize: 15.5,
                          lineHeight: 1.15,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                        title={workshop.title}
                      >
                        {workshop.title}
                      </div>

                      {compactMeta(workshop, false)}
                      <div
                        style={{
                          marginTop: 6,
                          color: Number(workshop?.max_pair_count) > 0 && Number(workshop?.registered_pair_count || 0) >= Number(workshop.max_pair_count) ? "#b4232c" : purpleDark,
                          fontSize: 11.5,
                          lineHeight: 1.3,
                          fontWeight: 800
                        }}
                      >
                        {workshopPairAvailability(workshop)}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Als Paar anmelden: ${workshop.title}`}
                      onClick={() => {
                        window.location.href = getPublicPairRegistrationUrl(workshop.id);
                      }}
                      style={{
                        flex: "0 0 auto",
                        border: 0,
                        borderRadius: 10,
                        padding: "8px 9px",
                        background: purple,
                        color: "#fff",
                        fontFamily: "inherit",
                        fontSize: 11,
                        fontWeight: 900,
                        lineHeight: 1.1,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        boxShadow: "0 3px 8px rgba(85,64,107,0.13)"
                      }}
                    >
                      💃🕺<br />
                      Als Paar
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}

        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            color: "#777",
            fontSize: 11.5,
            lineHeight: 1.4
          }}
        >
          🔒 Keine Registrierung erforderlich – normale Workshops direkt als Paar anmelden.
        </div>

        <div style={{ textAlign: "center", color: "#6f625c", fontSize: 12, margin: "12px 0 4px" }}>Die Workshop-Anmeldung selbst ist nur paarweise möglich.</div>
      </div>
    </div>
  );
}

function PublicRecurringWorkshopRegistration({ workshopId, selectedDate }) {
  const [workshop, setWorkshop] = useState(null);
  const [dates, setDates] = useState([]);
  const [partySize, setPartySize] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({ user1Name: "", user1Email: "", user2Name: "", user2Email: "" });
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelForm, setCancelForm] = useState({ name: "", email: "", date: selectedDate || "" });
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: w, error: we }, { data: ds, error: de }] = await Promise.all([
        supabase.rpc("get_public_workshop_for_registration", { p_workshop_id: Number(workshopId) }),
        supabase.rpc("get_recurring_workshop_dates", { p_workshop_id: Number(workshopId) })
      ]);
      if (!active) return;
      if (we || !w?.[0]) setErrorMessage("Dieser Dauerworkshop wurde nicht gefunden.");
      else setWorkshop(w[0]);
      if (!de) setDates((ds || []).slice(0, 1)); // V47: Für Dauerworkshops nur den nächsten Samstag anbieten.
      setLoading(false);
    })();
    return () => { active = false; };
  }, [workshopId]);

  const validDate = dates.some(d => String(d.session_date) === String(selectedDate));
  const selected = dates.find(d => String(d.session_date) === String(selectedDate));
  const free = selected?.max_people == null ? null : Math.max(0, Number(selected.max_people) - Number(selected.registered_people || 0));

  async function submit(e) {
    e.preventDefault();
    if (busy || success) return;
    const name1 = form.user1Name.trim(), email1 = form.user1Email.trim();
    const name2 = form.user2Name.trim(), email2 = form.user2Email.trim();
    if (!validDate) return setErrorMessage("Bitte den nächsten anstehenden Samstag auswählen.");
    if (free != null && free < partySize) return setErrorMessage("Für diesen Termin sind nicht mehr genügend Plätze frei.");
    if (!name1 || !email1) return setErrorMessage("Bitte Name und E-Mail angeben.");
    if (partySize === 2 && (!name2 || !email2)) return setErrorMessage("Für die Paaranmeldung bitte beide Namen und E-Mail-Adressen angeben.");
    setBusy(true); setErrorMessage("");
    const { error } = await supabase.rpc("register_recurring_workshop_booking", {
      p_workshop_id: Number(workshopId), p_session_date: selectedDate, p_party_size: partySize,
      p_user1_name: name1, p_user1_email: email1, p_user2_name: partySize === 2 ? name2 : null, p_user2_email: partySize === 2 ? email2 : null
    });
    setBusy(false);
    if (error) return setErrorMessage(error.message || "Die Anmeldung konnte nicht gespeichert werden.");
    setSuccess(true);
  }

  async function cancelPublicRecurring(e) {
    e.preventDefault();
    if (cancelBusy) return;
    if (!cancelForm.name.trim() || !cancelForm.email.trim() || !cancelForm.date) {
      setCancelMessage("Bitte Name, E-Mail und den gebuchten Samstag angeben."); return;
    }
    if (!window.confirm(`Möchtest du die Anmeldung für ${formatShortDate(new Date(`${cancelForm.date}T12:00:00`))} wirklich stornieren? Andere Samstage bleiben unverändert.`)) return;
    setCancelBusy(true); setCancelMessage("");
    try {
      const { data, error } = await supabase.rpc("cancel_my_public_recurring_workshop_registration", {
        p_workshop_id: Number(workshopId), p_session_date: cancelForm.date,
        p_guest_name: cancelForm.name.trim(), p_guest_email: cancelForm.email.trim()
      });
      if (error) throw error;
      if (!data) setCancelMessage("Keine passende Anmeldung gefunden. Bitte Name, E-Mail und Datum prüfen.");
      else setCancelMessage("✅ Die Anmeldung für diesen Samstag wurde storniert. Andere Samstage bleiben unverändert.");
    } catch (err) { setCancelMessage("Stornierung fehlgeschlagen: " + (err?.message || "Unbekannter Fehler")); }
    finally { setCancelBusy(false); }
  }

  if (loading) return <div className="center" style={{ minHeight: "100vh", padding: 24 }}>Dauerworkshop wird geladen …</div>;
  if (!workshop || errorMessage && !dates.length) return <div className="center" style={{ minHeight: "100vh", padding: 24 }}>⚠️ {errorMessage || "Workshop nicht gefunden."}</div>;

  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box", padding: "28px 16px 40px", background: "linear-gradient(180deg,#f8f4ff 0%,#ffffff 55%)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ padding: "14px 16px", borderRadius: 16, background: "#f1eafe", border: "1px solid #dfd1f6", marginBottom: 18 }}>
            <div style={{ color: "#6a35c7", fontWeight: 800, fontSize: 21 }}>{workshop.title}</div>
            {workshop.trainer_name && (
              <div style={{ marginTop: 4, fontWeight: 700 }}>👤 Tanzlehrer/Tanztrainer: {workshop.trainer_name}</div>
            )}
            <div style={{ marginTop: 6, fontWeight: 700 }}>🔄 {workshop.recurrence_text}</div>
            {workshop.start_time && <div style={{ marginTop: 4 }}>🕓 {String(workshop.start_time).slice(0,5)} Uhr</div>}
            {workshop.duration_minutes != null && <div style={{ marginTop: 4 }}>⏱️ {workshop.duration_minutes} Min.</div>}
            {workshop.cost_per_person != null && <div style={{ marginTop: 4 }}>💶 {Number(workshop.cost_per_person).toFixed(2).replace(".", ",")} € pro Person</div>}
          </div>

          {success ? (
            <div style={{ padding: 18, borderRadius: 16, background: "#eaf8ef", border: "1px solid #b8e4c7", color: "#167544", textAlign: "center" }}>
              <div style={{ fontSize: 32 }}>✅</div><div style={{ fontWeight: 800, fontSize: 20, marginTop: 5 }}>Anmeldung erfolgreich!</div>
              <div style={{ marginTop: 7, lineHeight: 1.5 }}>{formatShortDate(new Date(`${selectedDate}T12:00:00`))} · {partySize === 1 ? "Einzelperson" : "Tanzpaar"}</div>
              <div style={{ marginTop: 12, fontSize: 13 }}>Eine Registrierung in der Tanzpartnerbörse ist nicht erforderlich.</div>
              <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.45 }}>
                📧 <strong>Bestätigungs-Mail bitte aufbewahren.</strong><br />
                Sie enthält den <strong>Link zur Abmeldung vom Workshop.</strong>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 style={{ margin: "0 0 8px", color: "#51339b", fontSize: 21 }}>📅 Termin &amp; Anmeldung</h2>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 5 }}>Nächster Samstag</label>
              <div style={{ fontSize: 12, color: "#6b6473", marginBottom: 8 }}>Es wird immer nur der nächste anstehende Samstag angeboten.</div>
              <select required value={validDate ? selectedDate : ""} onChange={e => { window.location.href = `${getPublicRecurringWorkshopUrl(workshopId)}&termin=${encodeURIComponent(e.target.value)}`; }} style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }}>
                <option value="">Termin auswählen …</option>
                {dates.map(d => <option key={String(d.session_date)} value={d.session_date}>{formatShortDate(new Date(`${d.session_date}T12:00:00`))}</option>)}
              </select>

              <div style={{ fontWeight: 700, marginBottom: 7 }}>Wie möchtest du teilnehmen?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <button type="button" onClick={() => setPartySize(1)} className={partySize === 1 ? "primary" : "secondary"} style={{ fontWeight: 800 }}>👤 Einzelperson</button>
                <button type="button" onClick={() => setPartySize(2)} className={partySize === 2 ? "primary" : "secondary"} style={{ fontWeight: 800 }}>👥 Tanzpaar</button>
              </div>
              {free != null && <div style={{ marginBottom: 12, padding: "9px 11px", borderRadius: 10, background: free >= partySize ? "#eefaf2" : "#fff1f1", border: "1px solid #d5eadb" }}>🪑 Noch <strong>{free}</strong> Plätze frei</div>}

              <label style={{ display: "block", fontWeight: 700, marginBottom: 5 }}>Name {partySize === 2 ? "Person 1" : ""}</label>
              <input type="text" required value={form.user1Name} onChange={e => setForm(v => ({ ...v, user1Name: e.target.value }))} placeholder="Vor- und Nachname" style={{ width: "100%", boxSizing: "border-box", marginBottom: 11 }} />
              <label style={{ display: "block", fontWeight: 700, marginBottom: 5 }}>E-Mail {partySize === 2 ? "Person 1" : ""}</label>
              <input type="email" required value={form.user1Email} onChange={e => setForm(v => ({ ...v, user1Email: e.target.value }))} placeholder="name@beispiel.de" style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }} />
              {partySize === 2 && <>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 5 }}>Name Person 2</label>
                <input type="text" required value={form.user2Name} onChange={e => setForm(v => ({ ...v, user2Name: e.target.value }))} placeholder="Vor- und Nachname" style={{ width: "100%", boxSizing: "border-box", marginBottom: 11 }} />
                <label style={{ display: "block", fontWeight: 700, marginBottom: 5 }}>E-Mail Person 2 <span style={{ fontWeight: 500, color: "#777" }}>(optional)</span></label>
                <input type="email" value={form.user2Email} onChange={e => setForm(v => ({ ...v, user2Email: e.target.value }))} placeholder="name@beispiel.de" style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }} />
              </>}
              {errorMessage && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: "#fff1f1", border: "1px solid #efb8b8", color: "#a22" }}>⚠️ {errorMessage}</div>}
              <button type="submit" className="primary" disabled={busy || !validDate || (free != null && free < partySize)} style={{ marginTop: 4, width: "100%", fontWeight: 800 }}>{busy ? "Anmeldung wird gespeichert …" : partySize === 1 ? "🎟️ Verbindlich als Einzelperson anmelden" : "🎟️ Verbindlich als Paar anmelden"}</button>
            </form>
          )}
        </div>
        <div className="card" style={{ marginTop: 12, padding: 18 }}>
          <button type="button" className="ghost wide" onClick={() => setShowCancelForm(v => !v)} style={{ fontWeight: 800 }}>↩️ Bereits gebuchte Teilnahme stornieren {showCancelForm ? "−" : "+"}</button>
          {showCancelForm && <form onSubmit={cancelPublicRecurring} style={{ display: "grid", gap: 9, marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>Bitte die Daten genau wie bei der Anmeldung eingeben. Es wird nur der ausgewählte Samstag storniert.</p>
            <label style={{ fontWeight: 700 }}>Name bei der Anmeldung</label><input required value={cancelForm.name} onChange={e => setCancelForm(v => ({ ...v, name: e.target.value }))} placeholder="Vor- und Nachname" />
            <label style={{ fontWeight: 700 }}>E-Mail bei der Anmeldung</label><input required type="email" value={cancelForm.email} onChange={e => setCancelForm(v => ({ ...v, email: e.target.value }))} placeholder="name@beispiel.de" />
            <label style={{ fontWeight: 700 }}>Gebuchter Samstag</label><input required type="date" value={cancelForm.date} onChange={e => setCancelForm(v => ({ ...v, date: e.target.value }))} />
            {cancelMessage && <div className="notice">{cancelMessage}</div>}
            <button type="submit" className="primary wide" disabled={cancelBusy}>{cancelBusy ? "Wird storniert …" : "Nur diesen Samstag stornieren"}</button>
          </form>}
        </div>
      </div>
    </div>
  );
}

function PublicSonnenhofHotelRegistration() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const isHotelAdminRoute = params.get("hoteladmin") === "1";
  const [activeTab, setActiveTab] = useState("programm");
  const [activities, setActivities] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [sundayWorkshops, setSundayWorkshops] = useState([]);
  const [saturdayWorkshops, setSaturdayWorkshops] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [selected, setSelected] = useState(null);
  const [adminSession, setAdminSession] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const adminEmail = "mydiscofox@gmx.de";
  const [activityForm, setActivityForm] = useState({ title: "", description: "", starts_at: "", ends_at: "", max_participants: "", image_url: "", is_weekly: true, weekday: "5", start_time: "09:00", end_time: "", enabled_this_week: true, price_eur: "" });
  const [savingActivity, setSavingActivity] = useState(false);
  const [activityImageFile, setActivityImageFile] = useState(null);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [bookingFilter, setBookingFilter] = useState("alle");
  const [roomLookup, setRoomLookup] = useState("");
  const [roomLookupDone, setRoomLookupDone] = useState(false);
  const [manualBooking, setManualBooking] = useState({ kind: "activity", itemId: "", sessionDate: "", room: "", partySize: "1" });
  const [savingManualBooking, setSavingManualBooking] = useState(false);

  const colors = { ink: "#12343b", teal: "#075b66", pale: "#edf6f4", gold: "#d9a441", line: "#dce7e5" };
  const card = { background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 16, padding: 15, boxShadow: "0 3px 14px rgba(12,52,59,.06)" };
  const button = { border: 0, borderRadius: 10, padding: "11px 14px", background: colors.teal, color: "white", fontWeight: 800, cursor: "pointer" };
  const field = { width: "100%", boxSizing: "border-box", padding: 12, border: `1px solid ${colors.line}`, borderRadius: 10, background: "white", fontSize: 16 };
  const discofoxPartyPhoto = "data:image/jpeg;base64,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5LAwYevZWM7pDbOlHWLSm62r61hJFxAoOG1hOMdI8lB7CJPLBfFvrHz15BCQddZdNS5rmFXmvuqqZ2xqTasPnzlHVvwreDecm648ZWhc39FlE2l88mm0nFlfm3IlTxt6YU8bc7lXG/uhNx1yeS9cR6FvGt/WRFm19zLdZXY4+sqFNgs2wNHMrEpS4UNPz/e/Pj1Xq2ZTymcNJ9aufMJbXDniD7amzlepAIsKK+GqUJqGyrJOc2aUgtA2v9UqTP6NSyuobD6SsvRW4vmPQ5KtrVey20y2eUYjaZ7Wxk5xtjSaSpvb1Xbu+fnfULx29UWTrtAvKPSfRfe3fNy571qe773d6Hvd3p+93e973d6Hvd0+e93c773d7vvd3o+93cn73dznvd0ue93d573dzvvd3fe93Rl73Rz3vdPJe93ej73R3vvdPve93c973R73vdPee90cl73d73vdMe+90d973THvvdHPe90y573dzvvd3ue93S573dyXvd3O+93c973d3nvd3ve93e973d73vd3ve93e973d73vd3ve93e773d73vd0ee93T973dz3vdHfe90+573dGXvdHfe90x973d73vd0ve93e573d7vvd0Je93cl73d73vd0e+90e973T7vvd3Pe93d570dGXvT3ee93Rn73d73vR3ue9Pcw3vCN//EADEQAAICAgICAQMEAwACAgIDAAECAAMEEQUSEyEQFCIxFSAjMgYzQSQwNENCUBYlQP/aAAgBAQABBQLkuSq42nN5jLzmf8/idoLRre55dSr2oA0AJ/8Alxlta0LVVYeg7PQUni2v03r6cGNj+zSYuPufT6ni+7wKZZx71KKl0nHI9bVdLMwDrqECE6b/AIBsqNSrIZIM9hP1JpdyDGNllo1pm52nad53neeSeSeSeSeSeSeSGwQWCeUTY2oXQqBlXHGyLwbNB/j5h/x8z9BKy3jTXDSBCiiL1mxOwir2hqIhrnjjJOk6TpFrniniE6Tx7i41hn0lghpKj8GhvfbUoyNT6rQ+slmZMjNdWfOsYC5jBY0FjTytO5hjCH1Hg+As6zpAvtG6xMkiDNafXtLctmllmxqahSdIFnSOo30XqU9hROvvoNFRrrFSBItQ2yjrir617WbjGNB+GUeZl+1gOpA6oJx/L5eE3HclVyVXJZrchmf9aN+PgH4o/qv4E191D9UW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";

  async function loadProgram() {
    setLoading(true); setError("");
    try {
      const [activityResult, workshopResult] = await Promise.all([
        supabase.from("hotel_activities").select("*").order("weekday", { ascending: true }).order("start_time", { ascending: true }),
        supabase.rpc("get_public_workshops_for_registration")
      ]);
      if (activityResult.error) throw activityResult.error;
      if (workshopResult.error) throw workshopResult.error;
      setActivities((activityResult.data || []).filter(a => isHotelAdminRoute || a.is_active));
      const now = Date.now();
      const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
      const currentWeekWorkshops = (workshopResult.data || []).filter(w => {
        if (!w || w.is_published === false || w.workshop_type === "tanzkreis") return false;
        if (w.starts_at) return new Date(w.starts_at).getTime() >= now && new Date(w.starts_at).getTime() <= nextWeek;
        // Wiederkehrende Samstag- und Sonntagstermine ohne festes Datum erhalten
        // für die Anzeige den nächsten konkreten Termin.
        const recurrence = String(w.recurrence_text || "");
        const weekday = /sonntag/i.test(recurrence) ? 0 : /samstag/i.test(recurrence) ? 6 : null;
        if (weekday !== null && w.start_time) {
          const [hh, mm] = String(w.start_time).split(":").map(Number);
          const next = new Date();
          const daysUntil = (weekday - next.getDay() + 7) % 7;
          next.setDate(next.getDate() + daysUntil);
          next.setHours(hh || 0, mm || 0, 0, 0);
          if (next.getTime() <= now) next.setDate(next.getDate() + 7);
          if (next.getTime() <= nextWeek) { w.starts_at = next.toISOString(); return true; }
        }
        return false;
      });
      const isSunday = w => (w.starts_at && new Date(w.starts_at).getDay() === 0) || /sonntag/i.test(w.recurrence_text || "");
      const isSaturday = w => (w.starts_at && new Date(w.starts_at).getDay() === 6) || /samstag/i.test(w.recurrence_text || "");
      setWorkshops(currentWeekWorkshops);
      setSundayWorkshops(currentWeekWorkshops.filter(isSunday));
      setSaturdayWorkshops(currentWeekWorkshops.filter(isSaturday));
    } catch (e) {
      console.error("Hotelprogramm konnte nicht geladen werden", e);
      setError("Das Wochenprogramm konnte nicht geladen werden. Bitte später erneut versuchen.");
    } finally { setLoading(false); }
  }

  async function loadAdminBookings() {
    setError("");
    const { data, error: e } = await supabase.rpc("hotel_admin_list_bookings");
    if (e) { setError("Teilnehmerliste konnte nicht geladen werden. Bitte mit einem freigeschalteten Hoteladmin anmelden."); return; }
    setBookings(data || []);
  }

  useEffect(() => { loadProgram(); }, []);

  const formatDay = value => value ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(value)) : "Termin folgt";
  const formatTime = value => value ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) + " Uhr" : "Uhrzeit nach Absprache";
  const dateInputValue = value => value ? new Date(value).toISOString().slice(0,16) : "";
  const weekdayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const nextOccurrence = (weekday, time) => { const now = new Date(); const date = new Date(now); date.setDate(date.getDate() + ((Number(weekday) - date.getDay() + 7) % 7)); if (time) { const [h,m] = String(time).split(":").map(Number); date.setHours(h || 0, m || 0, 0, 0); } else date.setHours(12,0,0,0); if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 7); return date; };
  const activityDate = item => item.is_weekly && item.weekday !== null && item.weekday !== undefined ? nextOccurrence(item.weekday, item.start_time).toISOString() : item.starts_at;
  const activityTimeLabel = item => item.is_weekly ? `${item.start_time ? item.start_time.slice(0,5) + " Uhr" : "Zeit folgt"}${item.end_time ? "–" + item.end_time.slice(0,5) + " Uhr" : ""}` : formatTime(item.starts_at);

  async function bookItem(item, kind) {
    setError(""); setNotice("");
    const room = roomNumber.trim();
    const count = Number(partySize);
    if (!room) { setError("Bitte zuerst die Zimmernummer eingeben."); return; }
    if (!Number.isInteger(count) || count < 1 || count > 10) { setError("Bitte eine Personenzahl zwischen 1 und 10 wählen."); return; }
    const saturdayWorkshop = kind === "workshop" && ((item.starts_at && new Date(item.starts_at).getDay() === 6) || /samstag/i.test(item.recurrence_text || ""));
    if (kind === "workshop" && !saturdayWorkshop && count !== 2) { setError("Dieser Workshop wird paarweise gebucht. Bitte 2 Personen auswählen."); return; }
    const id = `${kind}-${item.id || "party"}`;
    setBusyId(id);
    try {
      const { data, error: e } = await supabase.rpc("register_hotel_program_booking", {
        p_booking_kind: kind,
        p_room_number: room,
        p_party_size: count,
        p_activity_id: kind === "activity" ? item.id : null,
        p_workshop_id: kind === "workshop" ? item.id : null,
        p_session_date: (kind === "workshop" || (kind === "activity" && item.is_weekly)) ? new Date(item.starts_at || activityDate(item)).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }) : null
      });
      if (e) throw e;
      setNotice(`Anmeldung gespeichert: ${item.title || "Discofox Party"} · Zimmer ${room} · ${count} ${count === 1 ? "Person" : "Personen"}.`);
      setSelected(null);
      if (isHotelAdminRoute && adminSession) await loadAdminBookings();
    } catch (e) {
      console.error("Hotelbuchung fehlgeschlagen", e);
      setError(e?.message?.includes("ausgebucht") ? e.message : (e?.message || "Die Anmeldung konnte nicht gespeichert werden."));
    } finally { setBusyId(""); }
  }

  async function signInHotelAdmin(e) {
    e.preventDefault(); setError("");
    const { data, error: e2 } = await supabase.auth.signInWithPassword({ email: "mydiscofox@gmx.de", password: adminPassword });
    if (e2) { setError("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen."); return; }
    const { data: allowed, error: roleError } = await supabase.rpc("is_hotel_admin");
    if (roleError || allowed !== true) { await supabase.auth.signOut(); setError("Dieses Konto ist nicht als Hoteladmin freigeschaltet."); return; }
    setAdminSession(data.user); setAdminPassword(""); setActiveTab("admin"); await loadAdminBookings();
  }

  async function saveActivity(e) {
    e.preventDefault(); setError(""); setNotice(""); setSavingActivity(true);
    try {
      let savedImageUrl = activityForm.image_url.trim() || null;
      if (activityImageFile) {
        if (!/^image\/(jpeg|png|webp)$/i.test(activityImageFile.type)) throw new Error("Bitte ein JPG-, PNG- oder WebP-Bild auswählen.");
        if (activityImageFile.size > 8 * 1024 * 1024) throw new Error("Das Bild darf höchstens 8 MB groß sein.");
        const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = reader.result; }; reader.onerror = reject; reader.readAsDataURL(activityImageFile); });
        const canvas = document.createElement("canvas"); const scale = Math.min(1, 640 / image.width); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressed = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.72));
        if (!compressed) throw new Error("Bild konnte nicht komprimiert werden.");
        const path = `hotel-activities/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
        const { error: uploadError } = await supabase.storage.from("app-images").upload(path, compressed, { upsert: false, contentType: "image/jpeg", cacheControl: "31536000" });
        if (uploadError) throw new Error(`Bild-Upload fehlgeschlagen: ${uploadError.message}`);
        savedImageUrl = supabase.storage.from("app-images").getPublicUrl(path).data?.publicUrl || null;
        if (!savedImageUrl) throw new Error("Bild wurde hochgeladen, aber die öffentliche URL fehlt.");
      }
      const payload = { title: activityForm.title.trim(), description: activityForm.description.trim() || null, starts_at: activityForm.is_weekly ? null : (activityForm.starts_at ? new Date(activityForm.starts_at).toISOString() : null), ends_at: activityForm.is_weekly ? null : (activityForm.ends_at ? new Date(activityForm.ends_at).toISOString() : null), max_participants: activityForm.max_participants ? Number(activityForm.max_participants) : null, price_eur: activityForm.price_eur === "" ? null : Number(activityForm.price_eur), image_url: savedImageUrl, is_active: true, is_weekly: !!activityForm.is_weekly, weekday: activityForm.is_weekly ? Number(activityForm.weekday) : null, start_time: activityForm.is_weekly && activityForm.start_time ? activityForm.start_time : null, end_time: activityForm.is_weekly && activityForm.end_time ? activityForm.end_time : null, enabled_this_week: !!activityForm.enabled_this_week };
      const query = editingActivityId
        ? supabase.from("hotel_activities").update(payload).eq("id", editingActivityId)
        : supabase.from("hotel_activities").insert({ ...payload, created_by: adminSession?.id || null });
      const { error: e2 } = await query;
      if (e2) throw e2;
      setActivityForm({ title: "", description: "", starts_at: "", ends_at: "", max_participants: "", image_url: "", is_weekly: true, weekday: "5", start_time: "09:00", end_time: "", enabled_this_week: true, price_eur: "" }); setActivityImageFile(null); setEditingActivityId(null);
      setNotice(editingActivityId ? "Aktivität wurde aktualisiert." : "Aktivität wurde dem Wochenprogramm hinzugefügt."); await loadProgram();
    } catch (e2) { setError(e2?.message || "Aktivität konnte nicht gespeichert werden."); }
    finally { setSavingActivity(false); }
  }

  async function deactivateActivity(id) {
    const { error: e } = await supabase.from("hotel_activities").update({ is_active: false }).eq("id", id);
    if (e) { setError("Aktivität konnte nicht deaktiviert werden."); return; }
    await loadProgram(); setNotice("Aktivität wurde aus dem öffentlichen Programm genommen.");
  }

  async function toggleActivityWeek(item) { setError(""); setNotice(""); const { error: e } = await supabase.from("hotel_activities").update({ enabled_this_week: !item.enabled_this_week }).eq("id", item.id); if (e) { setError("Wochenfreigabe konnte nicht geändert werden."); return; } setNotice(item.enabled_this_week ? "Aktivität ist für diese Woche pausiert." : "Aktivität ist für diese Woche freigegeben."); await loadProgram(); }

  function startEditActivity(item) {
    setEditingActivityId(item.id);
    setActivityForm({ title: item.title || "", description: item.description || "", starts_at: item.starts_at ? dateInputValue(item.starts_at) : "", ends_at: item.ends_at ? dateInputValue(item.ends_at) : "", max_participants: item.max_participants == null ? "" : String(item.max_participants), image_url: item.image_url || "", is_weekly: !!item.is_weekly, weekday: String(item.weekday ?? 5), start_time: item.start_time ? String(item.start_time).slice(0,5) : "09:00", end_time: item.end_time ? String(item.end_time).slice(0,5) : "", enabled_this_week: item.enabled_this_week !== false, price_eur: item.price_eur == null ? "" : String(item.price_eur) });
    setActivityImageFile(null); setNotice("Aktivität wird bearbeitet. Änderungen unten speichern.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getVisibleHotelBookings() {
    if (bookingFilter === "alle") return bookings;
    if (bookingFilter === "activity") return bookings.filter(b => b.booking_kind === "activity");
    if (bookingFilter === "workshop") return bookings.filter(b => b.booking_kind === "workshop");
    if (bookingFilter === "party") return bookings.filter(b => b.booking_kind === "party");
    if (bookingFilter.startsWith("activity:")) return bookings.filter(b => b.booking_kind === "activity" && String(b.title || "") === bookingFilter.slice(9));
    if (bookingFilter.startsWith("workshop:")) return bookings.filter(b => b.booking_kind === "workshop" && String(b.title || "") === bookingFilter.slice(9));
    return bookings;
  }

  function getRoomHotelBookings() {
    const room = String(roomLookup || "").trim().toLocaleLowerCase("de-DE");
    if (!room) return [];
    return bookings.filter(b => String(b.room_number || "").trim().toLocaleLowerCase("de-DE") === room)
      .sort((a, b) => String(a.session_date || a.starts_at || "").localeCompare(String(b.session_date || b.starts_at || "")) || String(a.title || "").localeCompare(String(b.title || ""), "de"));
  }

  function printRoomHotelBookings(mode) {
    const room = String(roomLookup || "").trim();
    const rows = getRoomHotelBookings();
    if (!room) { setError("Bitte zuerst eine Zimmernummer eingeben."); return; }
    if (!rows.length) { setError(`Für Zimmer ${room} wurden keine aktiven Buchungen gefunden.`); return; }
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) { setError("Bitte Pop-ups für den Ausdruck erlauben."); return; }
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const dateLabel = b => b.session_date || (b.starts_at ? formatDay(b.starts_at) : "Termin nach Absprache");
    const body = rows.map(b => `<tr><td>${esc(dateLabel(b))}</td><td>${esc(b.title || (b.booking_kind === "party" ? "Discofox Party" : b.booking_kind))}</td><td>${esc(b.party_size)}</td>${mode === "internal" ? `<td>${esc(b.booking_kind)}</td><td>${esc(b.created_at ? formatWorkshopDate(b.created_at) : "")}</td>` : ""}</tr>`).join("");
    const internal = mode === "internal";
    const title = internal ? "Interne Zimmerübersicht" : "Ihre Buchungsübersicht";
    popup.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Zimmer ${esc(room)}</title><style>body{font:14px Arial,sans-serif;color:#173b40;padding:28px;max-width:900px;margin:auto}header{text-align:center;border-bottom:2px solid #075b66;padding-bottom:16px;margin-bottom:22px}h1{font-size:24px;margin:0 0 6px}p{color:#52666a}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:11px 9px;text-align:left;border-bottom:1px solid #dce7e5}th{background:#edf4f2} .room{font-size:18px;font-weight:bold;margin:14px 0}@media print{button{display:none}body{padding:0}}</style></head><body><header><div style="font-size:12px;letter-spacing:2px;font-weight:bold;color:#075b66">HOTEL SONNENHOF · ASPACH</div><h1>${title}</h1><div class="room">Zimmer ${esc(room)}</div></header>${internal ? `<p>Interne Übersicht für Rezeption und Hotelteam · ${rows.length} aktive Buchungen</p>` : `<p>Vielen Dank für Ihre Anmeldung. Hier finden Sie Ihre gebuchten Aktivitäten im Hotel Sonnenhof.</p>`}<table><thead><tr><th>Termin</th><th>Angebot</th><th>Personen</th>${internal ? "<th>Buchungsart</th><th>Gebucht am</th>" : ""}</tr></thead><tbody>${body}</tbody></table>${internal ? "" : `<p style="margin-top:28px">Wir wünschen Ihnen viel Freude und einen angenehmen Aufenthalt!<br><strong>Ihr Hotel Sonnenhof Team</strong></p>`}<p style="font-size:10px;color:#819092;margin-top:30px">Erstellt am ${new Date().toLocaleString("de-DE")}</p><button onclick="window.print()">Drucken / Als PDF speichern</button><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function printHotelBookings() {
    const rows = getVisibleHotelBookings();
    const popup = window.open("", "_blank", "width=1000,height=750");
    if (!popup) { setError("Bitte Pop-ups für den PDF-/Druckexport erlauben."); return; }
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const body = rows.map(b => `<tr><td>${esc(b.session_date || (b.starts_at ? formatDay(b.starts_at) : "Party"))}</td><td>${esc(b.title || b.booking_kind)}</td><td>${esc(b.room_number)}</td><td>${esc(b.party_size)}</td><td>${esc(b.created_at ? formatWorkshopDate(b.created_at) : "")}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Hotel-Teilnehmerliste</title><style>body{font:12px Arial,sans-serif;color:#173b40;padding:24px}h1{font-size:22px}p{color:#52666a}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:9px;text-align:left;border-bottom:1px solid #dce7e5}th{background:#edf4f2}@media print{button{display:none}body{padding:0}}</style></head><body><h1>Hotel Sonnenhof – Teilnehmerliste</h1><p>${bookingFilter === "alle" ? "Alle Aktivitäten und Buchungen" : `Filter: ${bookingFilter}`} · Erstellt am ${new Date().toLocaleString("de-DE")}</p><button onclick="window.print()">Drucken / Als PDF speichern</button><table><thead><tr><th>Termin</th><th>Angebot</th><th>Zimmer</th><th>Personen</th><th>Gebucht am</th></tr></thead><tbody>${body || "<tr><td colspan=5>Keine Buchungen vorhanden</td></tr>"}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  async function addManualHotelBooking(e) {
    e.preventDefault(); setError(""); setNotice(""); setSavingManualBooking(true);
    try {
      const kind = manualBooking.kind;
      const item = kind === "activity" ? activities.find(a => String(a.id) === String(manualBooking.itemId)) : kind === "workshop" ? workshops.find(w => String(w.id) === String(manualBooking.itemId)) : null;
      if (kind !== "party" && !item) throw new Error("Bitte zuerst eine Aktivität auswählen.");
      const count = Number(manualBooking.partySize);
      if (!manualBooking.room.trim()) throw new Error("Bitte Zimmernummer oder Kennzeichnung (z. B. Extern) eintragen.");
      if (kind === "workshop" && count !== 2) throw new Error("Tanzworkshops werden paarweise gebucht.");
      const date = manualBooking.sessionDate || (kind === "activity" && item?.is_weekly ? new Date(activityDate(item)).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }) : kind === "workshop" && item?.starts_at ? new Date(item.starts_at).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }) : null);
      const { error: rpcError } = await supabase.rpc("register_hotel_program_booking", { p_booking_kind: kind, p_room_number: manualBooking.room.trim(), p_party_size: count, p_activity_id: kind === "activity" ? item.id : null, p_workshop_id: kind === "workshop" ? item.id : null, p_session_date: date });
      if (rpcError) throw rpcError;
      setNotice("Teilnehmer wurde manuell hinzugefügt.");
      setManualBooking(v => ({ ...v, room: "", sessionDate: "" }));
      await loadAdminBookings();
    } catch (err) { setError(err?.message || "Teilnehmer konnte nicht hinzugefügt werden."); }
    finally { setSavingManualBooking(false); }
  }

  async function cancelHotelBooking(booking) {
    if (!window.confirm(`Buchung für ${booking.title || "diese Aktivität"} in Zimmer ${booking.room_number} wirklich stornieren?`)) return;
    const { error: cancelError } = await supabase.from("hotel_program_bookings").update({ cancelled_at: new Date().toISOString() }).eq("id", booking.id);
    if (cancelError) { setError("Buchung konnte nicht storniert werden. Bitte Berechtigung prüfen."); return; }
    setNotice("Buchung wurde storniert."); await loadAdminBookings();
  }
  const openBooking = (item, kind) => { const date = item.is_weekly ? activityDate(item) : item.starts_at; setSelected({ ...item, starts_at: date, kind }); setError(""); };
  // Kleine, komprimierte Vorschaubilder: maximal 640 px breit und mit lazy loading.
  // Eigene Bild-URLs aus dem Adminbereich haben Vorrang vor den Beispielmotiven.
  const sampleImageFor = title => {
    const t = String(title || "").toLowerCase();
    // Komprimierte, vom Nutzer bereitgestellte lokale Fotos (640 px, JPG).
    if (/weinberg|zügle|bimmelbahn/.test(t)) return "data:image/jpeg;base64,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";
    if (/hotel.?tour|sonnenhof/.test(t)) return "data:image/jpeg;base64,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";
    if (/alpaka|lama/.test(t)) return "data:image/jpeg;base64,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";
    if (/alpaka/.test(t)) return "https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=640&q=58";
    if (/weinberg|zügle|zug|streichelzoo|tier/.test(t)) return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=58";
    if (/sauna|wellness|aufguss/.test(t)) return "https://images.unsplash.com/photo-1540555700478-4be289fbecee?auto=format&fit=crop&w=640&q=58";
    if (/fahrrad|bike|rad/.test(t)) return "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=640&q=58";
    if (/discofox|tanz|dj|musik|workshop/.test(t)) return "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?auto=format&fit=crop&w=640&q=58";
    if (/ladengässle|tante.?emma|laden/.test(t)) return "https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=640&q=58";
    if (/backhäusle|backhaus/.test(t)) return "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=640&q=58";
    return "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=640&q=58";
  };
  const ActivityCard = ({ item }) => <article style={{ ...card, overflow: "hidden", padding: 0 }}>
    <img src={item.image_url || sampleImageFor(item.title)} alt={item.title || "Aktivität"} loading="lazy" decoding="async" width="640" height="180" onError={e => { e.currentTarget.style.display = "none"; }} style={{ display: "block", width: "100%", height: 118, objectFit: "cover", background: "#e8f2ec" }} />
    <div style={{ padding: 14 }}><div style={{ color: colors.teal, fontSize: 12, fontWeight: 800 }}>{formatDay(activityDate(item))}{(item.is_weekly || item.starts_at) ? ` · ${activityTimeLabel(item)}` : ""}</div><h3 style={{ color: colors.ink, margin: "6px 0", fontSize: 18 }}>{item.title}</h3><p style={{ color: "#52666a", fontSize: 13, lineHeight: 1.5, minHeight: 38, margin: "0 0 8px", overflowWrap: "anywhere" }}>{item.description || "Gemeinsam etwas Schönes erleben."}</p>{item.price_eur != null && <div style={{ color: colors.teal, fontWeight: 900, marginBottom: 10 }}>{Number(item.price_eur).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro Person</div>}<button disabled={item.is_weekly && !item.enabled_this_week} style={{ ...button, width: "100%", opacity: item.is_weekly && !item.enabled_this_week ? .5 : 1 }} onClick={() => { setPartySize("2"); openBooking(item, "activity"); }}>{item.is_weekly && !item.enabled_this_week ? "Diese Woche pausiert" : "Jetzt anmelden"}</button></div>
  </article>;

  return <main style={{ minHeight: "100vh", background: "#f6f7f3", color: colors.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
    <header style={{ position: "relative", minHeight: isHotelAdminRoute ? 170 : 230, padding: isHotelAdminRoute ? "82px 20px 30px" : "108px 20px 42px", color: "white", background: "linear-gradient(120deg,rgba(4,53,61,.94),rgba(10,91,96,.76)), url('/sonnenhof-hotel.jpg') center/cover" }}>
      <a href={`${window.location.origin}/`} style={{ position: "absolute", top: 12, left: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.6)", background: "rgba(0,0,0,.28)", color: "white", textDecoration: "none", fontSize: 14, fontWeight: 800 }}>‹ Zurück zur Tanzpartnerbörse</a>
      {!isHotelAdminRoute && <a href={`${window.location.origin}/?sonnenhof=1&hoteladmin=1`} style={{ position: "absolute", top: 58, left: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "9px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.9)", background: "#ffffff", color: "#07575b", textDecoration: "none", fontSize: 14, fontWeight: 900, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>🔐 Mitarbeiter-Login</a>}
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 800, opacity: .85 }}>Hotel Sonnenhof · Aspach</div><h1 style={{ fontFamily: "Georgia,serif", fontSize: "clamp(30px,5vw,46px)", lineHeight: 1.05, margin: "14px 0 8px" }}>{isHotelAdminRoute ? "Hotelverwaltung" : "Ihr Wochenprogramm"}</h1><p style={{ margin: 0, fontSize: 16 }}>{isHotelAdminRoute ? "Aktivitäten · Teilnehmer · Buchungen" : "Erlebnisse · Tanz · Genuss · Gemeinsam mehr erleben"}</p></div>
    </header>
    <div style={{ maxWidth: 1120, margin: "-24px auto 0", padding: "0 14px 36px", position: "relative" }}>
      {isHotelAdminRoute && adminSession && <section style={{ ...card, marginBottom: 16, padding: 12, position: "relative" }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, margin: "0 2px 10px" }}><div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 900, color: "#6a7d7e" }}>Hotelverwaltung</div><button type="button" onClick={async()=>{await supabase.auth.signOut();setAdminSession(null);setActiveTab("programm");}} style={{ border:0, background:"transparent", color:colors.teal, fontWeight:800, padding:"5px 7px", whiteSpace:"nowrap" }}>Abmelden</button></div><nav aria-label="Hotelverwaltung – Bereiche" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 }}><button type="button" aria-current={activeTab === "programm" ? "page" : undefined} style={{ ...button, background: activeTab === "programm" ? colors.teal : "#edf3f1", color: activeTab === "programm" ? "white" : colors.ink, minHeight: 48, padding: "8px 5px", fontSize: "clamp(10px,2.8vw,12px)", lineHeight: 1.2, borderRadius: 12, boxShadow: activeTab === "programm" ? "0 2px 7px rgba(7,85,91,.18)" : "none" }} onClick={() => setActiveTab("programm")}>Wochenprogramm</button><button type="button" aria-current={activeTab === "admin" ? "page" : undefined} style={{ ...button, background: activeTab === "admin" ? colors.teal : "#edf3f1", color: activeTab === "admin" ? "white" : colors.ink, minHeight: 48, padding: "8px 5px", fontSize: "clamp(10px,2.8vw,12px)", lineHeight: 1.2, borderRadius: 12, boxShadow: activeTab === "admin" ? "0 2px 7px rgba(7,85,91,.18)" : "none" }} onClick={() => { setActiveTab("admin"); loadAdminBookings(); }}>Hotelbuchungen</button><button type="button" aria-current={activeTab === "einstellungen" ? "page" : undefined} style={{ ...button, background: activeTab === "einstellungen" ? colors.teal : "#edf3f1", color: activeTab === "einstellungen" ? "white" : colors.ink, minHeight: 48, padding: "8px 5px", fontSize: "clamp(10px,2.8vw,12px)", lineHeight: 1.2, borderRadius: 12, boxShadow: activeTab === "einstellungen" ? "0 2px 7px rgba(7,85,91,.18)" : "none" }} onClick={() => setActiveTab("einstellungen")}>Aktivitäten</button></nav><div style={{ fontSize:11, color:"#718083", margin:"8px 2px 0" }}>Angemeldet als Hotelteam</div></section>}
      {(error || notice) && <div role={error ? "alert" : "status"} style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: error ? "#fff0ee" : "#eaf8ee", border: `1px solid ${error ? "#f3c4be" : "#b9e0c4"}`, color: error ? "#982d24" : "#17653a" }}>{error || notice}<button onClick={() => { setError(""); setNotice(""); }} style={{ float: "right", border: 0, background: "transparent", cursor: "pointer" }}>✕</button></div>}
      {isHotelAdminRoute && !adminSession && <section style={{ ...card, marginBottom: 16 }}><h2 style={{ marginTop: 0 }}>Hoteladmin-Zugang</h2><p style={{ color: "#52666a" }}>Bitte mit dem freigeschalteten Hoteladmin-Konto anmelden, um Teilnehmer und Aktivitäten zu verwalten.</p><form onSubmit={signInHotelAdmin} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}><input required type="password" placeholder="Passwort" autoComplete="current-password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} style={field}/><button style={button}>Sicher anmelden</button></form></section>}
      {(!isHotelAdminRoute || activeTab === "programm") && <>
        <section style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", alignItems: "end", gap: 12, marginBottom: 20 }}><div><label style={{ display: "block", fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Zimmernummer</label><input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} placeholder="z. B. 125" style={field} /></div><div><label style={{ display: "block", fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Anzahl Personen</label><select value={partySize} onChange={e => setPartySize(e.target.value)} style={field}>{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} {n === 1 ? "Person" : "Personen"}</option>)}</select></div><div><label style={{ display: "block", fontWeight: 800, fontSize: 13, marginBottom: 6 }}>E-Mail-Adresse (optional)</label><input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="name@beispiel.de" style={field} autoComplete="email" /></div><div style={{ gridColumn: "1 / -1", color: "#607276", fontSize: 13 }}>Zimmernummer und Personenanzahl genügen. Die E-Mail-Adresse ist freiwillig. Samstagsworkshops können einzeln oder zu zweit gebucht werden.</div></section>
        {loading ? <div style={card}>Wochenprogramm wird geladen …</div> : <>
          <section style={{ marginBottom: 26 }}><h2 style={{ fontFamily: "Georgia,serif", fontSize: 27, margin: "0 0 5px" }}>🌄 Hotel-Aktivitäten</h2><p style={{ margin: "0 0 12px", color: "#607276" }}>Entdecken Sie die Region und genießen Sie Ihre Auszeit.</p>{activities.filter(a => !a.is_weekly || a.enabled_this_week).length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(225px,1fr))", gap: 12 }}>{activities.filter(a => !a.is_weekly || a.enabled_this_week).map(a => <ActivityCard key={a.id} item={a}/>)}</div> : <div style={card}>Das Hotel stellt die Aktivitäten für die kommende Woche zusammen. Bitte schauen Sie bald wieder vorbei.</div>}</section>
          <section style={{ marginBottom: 26 }}><h2 style={{ fontFamily: "Georgia,serif", fontSize: 27, margin: "0 0 5px" }}>💃 Samstags-Workshops</h2><p style={{ margin: "0 0 12px", color: "#607276" }}>Das Samstagsprogramm im Hotel Sonnenhof. Einzelpersonen und Paare sind willkommen.</p>{saturdayWorkshops.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>{saturdayWorkshops.map(w => { const saturdayDiscofox = /discofox/i.test(w.title || ""); return <article key={w.id} style={{ ...card, overflow: "hidden", padding: 0 }}><img src={w.image_url || sampleImageFor(w.title)} alt={w.title || "Tanzworkshop"} loading="lazy" decoding="async" width="640" height="360" onError={e => { e.currentTarget.style.display = "none"; }} style={{ display: "block", width: "100%", height: "auto", maxHeight: 260, objectFit: "contain", background: "#f3eaf5", borderRadius: "12px 12px 0 0" }}/><div style={{ padding: 14 }}><div style={{ color: colors.teal, fontSize: 12, fontWeight: 800 }}>Jeden Samstag{w.start_time ? ` · ${String(w.start_time).slice(0,5)} Uhr` : ""}</div><h3 style={{ margin: "7px 0", fontSize: 18 }}>{w.title}</h3>{saturdayDiscofox ? <><p style={{ color: "#52666a", margin: "5px 0 12px", lineHeight: 1.45 }}>Drei Kursteile – jeweils 45 Minuten. Die beiden Discofox-Kursteile bauen aufeinander auf; anschließend folgt Freestyle.</p><div style={{ background: "#edf6f4", borderRadius: 12, padding: 12, display: "grid", gap: 10, marginBottom: 12 }}><div><strong>14:30–15:15 Uhr · Discofox 1</strong><div style={{ color: "#607276", fontSize: 13 }}>Grundlagen und erste Figuren · 45 Minuten</div></div><div><strong>15:15–16:00 Uhr · Discofox 2</strong><div style={{ color: "#607276", fontSize: 13 }}>Aufbau und Variationen · 45 Minuten</div></div><div><strong>16:00–16:45 Uhr · Freestyle</strong><div style={{ color: "#607276", fontSize: 13 }}>Figuren üben und freies Tanzen · 45 Minuten</div></div></div><div style={{ color: "#b52d4b", fontWeight: 900, margin: "8px 0 12px" }}>5 € pro Kursteil / Person</div></> : <>{w.location && <div style={{ color: "#607276", fontSize: 13 }}>📍 {w.location}</div>}{w.trainer_name && <div style={{ color: "#607276", fontSize: 13 }}>👤 {w.trainer_name}</div>}</>}<button style={{ ...button, width: "100%" }} onClick={() => { setPartySize("1"); openBooking(w, "workshop"); }}>Anmelden – einzeln oder zu zweit</button></div></article>; })}</div> : <div style={card}>Aktuell sind keine Samstagsworkshops veröffentlicht.</div>}</section>
          <section style={{ marginBottom: 26 }}><h2 style={{ fontFamily: "Georgia,serif", fontSize: 27, margin: "0 0 5px" }}>☀️ Sonntags-Workshopprogramm</h2><p style={{ margin: "0 0 12px", color: "#607276" }}>Die aktuell veröffentlichten Sonntagsworkshops aus der Tanzpartnerbörse – Woche für Woche automatisch übernommen.</p>{sundayWorkshops.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>{sundayWorkshops.map(w => <article key={w.id} style={{ ...card, overflow: "hidden", padding: 0 }}><img src={w.image_url || sampleImageFor(w.title)} alt={w.title || "Sonntagsworkshop"} loading="lazy" decoding="async" width="640" height="360" onError={e => { e.currentTarget.style.display = "none"; }} style={{ display: "block", width: "100%", height: "auto", maxHeight: 260, objectFit: "contain", background: "#f3eaf5", borderRadius: "12px 12px 0 0" }}/><div style={{ padding: 14 }}><div style={{ color: colors.teal, fontSize: 12, fontWeight: 800 }}>{formatDay(w.starts_at)} · {formatTime(w.starts_at)}</div><h3 style={{ margin: "7px 0", fontSize: 18 }}>{w.title}</h3>{w.info_text && <p style={{ color: "#52666a", fontSize: 13, lineHeight: 1.45 }}>{w.info_text}</p>}{w.location && <div style={{ color: "#607276", fontSize: 13 }}>📍 {w.location}</div>}{w.trainer_name && <div style={{ color: "#607276", fontSize: 13 }}>👤 {w.trainer_name}</div>}{w.cost_per_person != null && <div style={{ color: colors.teal, fontWeight: 900, marginTop: 8 }}>{Number(w.cost_per_person).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro Person</div>}<div style={{ marginTop: 10, color: "#607276", fontSize: 12 }}>Anmeldung für Hotelgäste direkt an der Rezeption.</div></div></article>)}</div> : <div style={card}>Für den kommenden Sonntag sind derzeit keine veröffentlichten Workshops eingetragen.</div>}</section>
          <section style={{ marginBottom: 18 }}><h2 style={{ fontFamily: "Georgia,serif", fontSize: 27, margin: "0 0 5px" }}>🎶 Discofox Party</h2><p style={{ margin: "0 0 12px", color: "#607276" }}>Sonntagabend · Tanzen, Freunde treffen und den Abend genießen.</p><article style={{ ...card, overflow: "hidden", padding: 0 }}><img src={discofoxPartyPhoto} alt="Viele Tanzpaare auf einer Discofox-Tanzfläche" loading="lazy" decoding="async" width="1200" height="325" style={{ display: "block", width: "100%", height: "auto", maxHeight: 230, objectFit: "cover" }}/><div style={{ padding: 15, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center" }}><div><h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Discofox Party</h3><div>🕒 Sonntag, 17:30–22:00 Uhr</div><p style={{ color: "#607276", fontSize: 13, lineHeight: 1.45, marginBottom: 0 }}>Musik, Tanz und gute Stimmung – alle Hotelgäste sind willkommen.</p></div><button style={{ ...button, background: "#b52d4b", maxWidth: 170 }} onClick={() => { setPartySize("2"); openBooking({ id: "sunday-discofox", title: "Discofox Party", starts_at: null }, "party"); }}>Für die Party anmelden</button></div></article></section>
        </>}
      </>}
      {isHotelAdminRoute && adminSession && activeTab === "admin" && <section style={{ ...card, padding: 16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap", alignItems:"center" }}><div><div style={{fontSize:11,letterSpacing:1.3,textTransform:"uppercase",fontWeight:900,color:colors.teal}}>Buchungsübersicht</div><h2 style={{ margin:"4px 0" }}>Hotelbuchungen</h2><p style={{ margin:0,color:"#607276",fontSize:13 }}>Alle Buchungen der Hotelgäste – getrennt von Peters persönlichen Anmeldungen in der Tanzpartnerbörse.</p></div><button style={button} onClick={loadAdminBookings}>↻ Aktualisieren</button></div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginTop:14 }}><div style={{background:"#edf6f4",borderRadius:12,padding:12}}><div style={{fontSize:11,color:"#607276"}}>Aktive Hotelbuchungen</div><strong style={{fontSize:24}}>{bookings.length}</strong></div><div style={{background:"#edf6f4",borderRadius:12,padding:12}}><div style={{fontSize:11,color:"#607276"}}>Gebuchte Personen</div><strong style={{fontSize:24}}>{bookings.reduce((sum,b)=>sum+Number(b.party_size||0),0)}</strong></div></div>
        
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:9,marginTop:14}}><label style={{fontWeight:800,fontSize:13}}>Teilnehmerliste filtern<select value={bookingFilter} onChange={e=>setBookingFilter(e.target.value)} style={{...field,marginTop:5}}><option value="alle">Alle Hotelbuchungen</option><option value="activity">Alle Hotel-Aktivitäten</option>{activities.map(a=><option key={`filter-activity-${a.id}`} value={`activity:${a.title}`}>{a.title}</option>)}<option value="workshop">Alle Hotel-Workshopbuchungen</option>{workshops.map(w=><option key={`filter-workshop-${w.id}`} value={`workshop:${w.title}`}>{w.title}</option>)}<option value="party">Discofox Party</option></select></label><button type="button" onClick={printHotelBookings} style={{...button,width:"100%",background:"#0b6870"}}>▤ Gesamtliste / gefilterte Liste drucken oder als PDF speichern</button></div>
        <div style={{marginTop:16,padding:14,borderRadius:14,background:"#f4f8f6",border:`1px solid ${colors.line}`}}><h3 style={{margin:"0 0 4px"}}>Ausdruck nach Zimmernummer</h3><p style={{fontSize:12,color:"#607276",margin:"0 0 10px"}}>Zimmernummer eingeben. Die normale Buchungsliste bleibt davon unberührt.</p><div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"end"}}><label style={{fontSize:13,fontWeight:800}}>Zimmernummer<input value={roomLookup} onChange={e=>{setRoomLookup(e.target.value);setRoomLookupDone(false);setError("");}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();setRoomLookupDone(true);}}} placeholder="z. B. 125" style={{...field,marginTop:5}}/></label><button type="button" onClick={()=>{setRoomLookupDone(true);setError("");}} disabled={!roomLookup.trim()} style={{...button,whiteSpace:"nowrap"}}>Buchungen anzeigen</button></div>{roomLookupDone && <div style={{marginTop:11,padding:11,borderRadius:10,background:"#fff",border:`1px solid ${colors.line}`}}>{getRoomHotelBookings().length ? <><strong>{getRoomHotelBookings().length} Buchung(en) für Zimmer {roomLookup.trim()}</strong><div style={{fontSize:12,color:"#607276",marginTop:4}}>{getRoomHotelBookings().map(b=>`${b.title || (b.booking_kind==="party"?"Discofox Party":b.booking_kind)} · ${b.session_date || (b.starts_at?formatDay(b.starts_at):"Termin offen")} · ${b.party_size} Pers.`).join(" | ")}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginTop:10}}><button type="button" onClick={()=>printRoomHotelBookings("internal")} style={{...button,background:"#315d68",fontSize:12}}>Interner Ausdruck</button><button type="button" onClick={()=>printRoomHotelBookings("guest")} style={{...button,background:"#0b6870",fontSize:12}}>Gästeausdruck</button></div></> : <div style={{fontSize:12,color:"#8c3b32"}}>Keine aktiven Buchungen für dieses Zimmer gefunden.</div>}</div>}</div>
        <div style={{marginTop:18,padding:14,borderRadius:14,background:"#f4f8f6",border:`1px solid ${colors.line}`}}><h3 style={{margin:"0 0 4px"}}>Teilnehmer manuell hinzufügen</h3><p style={{fontSize:12,color:"#607276",margin:"0 0 10px"}}>Für telefonische Anmeldungen oder Gäste, die direkt vor Ort buchen. Workshop-Einträge werden ausschließlich als Hotelbuchungen gespeichert.</p><form onSubmit={addManualHotelBooking} style={{display:"grid",gap:9}}><label style={{fontSize:13,fontWeight:800}}>Angebotsart<select value={manualBooking.kind} onChange={e=>setManualBooking(v=>({...v,kind:e.target.value,itemId:""}))} style={{...field,marginTop:4}}><option value="activity">Hotel-Aktivität</option><option value="workshop">Tanzworkshop</option><option value="party">Discofox Party</option></select></label>{manualBooking.kind!=="party" && <label style={{fontSize:13,fontWeight:800}}>Aktivität auswählen<select required value={manualBooking.itemId} onChange={e=>setManualBooking(v=>({...v,itemId:e.target.value}))} style={{...field,marginTop:4}}><option value="">Bitte auswählen</option>{(manualBooking.kind==="activity"?activities:workshops).map(item=><option key={item.id} value={item.id}>{item.title} · {manualBooking.kind==="activity"?(item.is_weekly?`${weekdayNames[item.weekday]} ${activityTimeLabel(item)}`:formatDay(item.starts_at)):formatDay(item.starts_at)}</option>)}</select></label>}<div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}><label style={{fontSize:13,fontWeight:800}}>Zimmer / Kennung<input required value={manualBooking.room} onChange={e=>setManualBooking(v=>({...v,room:e.target.value}))} placeholder="z. B. 125 oder Extern" style={{...field,marginTop:4}}/></label><label style={{fontSize:13,fontWeight:800}}>Personen<select value={manualBooking.kind==="workshop"?"2":manualBooking.partySize} disabled={manualBooking.kind==="workshop"} onChange={e=>setManualBooking(v=>({...v,partySize:e.target.value}))} style={{...field,marginTop:4}}>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div><button type="submit" disabled={savingManualBooking} style={{...button,width:"100%"}}>{savingManualBooking?"Wird hinzugefügt …":"＋ Teilnehmer hinzufügen"}</button></form></div>
        
        <div style={{overflowX:"auto",marginTop:16}}><table style={{width:"100%",minWidth:560,borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Termin","Angebot","Zimmer","Personen","Gebucht am","Aktion"].map(t=><th key={t} style={{textAlign:"left",padding:9,background:"#edf4f2",borderBottom:`1px solid ${colors.line}`}}>{t}</th>)}</tr></thead><tbody>{getVisibleHotelBookings().map((b,i)=><tr key={b.id||i}><td style={{padding:9,borderBottom:`1px solid ${colors.line}`}}>{b.session_date|| (b.starts_at?formatDay(b.starts_at):"Sonntag")}</td><td style={{padding:9,borderBottom:`1px solid ${colors.line}`}}><strong>{b.title||b.booking_kind}</strong>{b.booking_kind==="workshop"&&<div style={{fontSize:10,color:colors.teal,fontWeight:800,marginTop:2}}>Peter · Hotelbuchung</div>}</td><td style={{padding:9,borderBottom:`1px solid ${colors.line}`}}>{b.room_number}</td><td style={{padding:9,borderBottom:`1px solid ${colors.line}`}}>{b.party_size}</td><td style={{padding:9,borderBottom:`1px solid ${colors.line}`}}>{b.created_at?formatWorkshopDate(b.created_at):""}</td><td style={{padding:7,borderBottom:`1px solid ${colors.line}`}}><button type="button" onClick={()=>cancelHotelBooking(b)} style={{border:"1px solid #e7caca",background:"#fff5f4",color:"#a52b2b",borderRadius:8,padding:"7px 9px",fontWeight:800}}>Stornieren</button></td></tr>)}</tbody></table>{!getVisibleHotelBookings().length&&<p style={{color:"#607276",textAlign:"center",padding:14}}>Keine Buchungen in dieser Auswahl.</p>}</div>
      </section>}
      {isHotelAdminRoute && adminSession && activeTab === "einstellungen" && <section style={card}><div style={{fontSize:11,letterSpacing:1.3,textTransform:"uppercase",fontWeight:900,color:colors.teal}}>Aktivitäten & Inhalte</div><h2 style={{ margin:"4px 0" }}>{editingActivityId ? "Aktivität bearbeiten" : "Aktivität erstellen"}</h2><p style={{ color: "#607276" }}>Texte, Termine, Teilnehmergrenzen, Preise und Bilder selbst verwalten.</p><form onSubmit={saveActivity} style={{ display: "grid", gap: 10 }}><label style={{ fontWeight: 800 }}>Titel<input required value={activityForm.title} onChange={e => setActivityForm(v => ({ ...v, title: e.target.value }))} placeholder="z. B. Alpaka-Wanderung" style={{ ...field, marginTop: 5 }}/></label><label style={{ fontWeight: 800 }}>Beschreibung<textarea value={activityForm.description} onChange={e => setActivityForm(v => ({ ...v, description: e.target.value }))} placeholder="Kurze Beschreibung für Hotelgäste" style={{ ...field, marginTop: 5, minHeight: 80 }}/></label><label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 800 }}><input type="checkbox" checked={activityForm.is_weekly} onChange={e => setActivityForm(v => ({ ...v, is_weekly: e.target.checked }))}/> Wiederkehrende wöchentliche Aktivität</label>{activityForm.is_weekly && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, padding: 12, borderRadius: 12, background: "#f1f7f5" }}><label style={{ fontWeight: 800 }}>Wochentag<select required value={activityForm.weekday} onChange={e => setActivityForm(v => ({ ...v, weekday: e.target.value }))} style={{ ...field, marginTop: 5 }}>{weekdayNames.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label><label style={{ fontWeight: 800 }}>Beginn<input required type="time" value={activityForm.start_time} onChange={e => setActivityForm(v => ({ ...v, start_time: e.target.value }))} style={{ ...field, marginTop: 5 }}/></label><label style={{ fontWeight: 800 }}>Ende (optional)<input type="time" value={activityForm.end_time} onChange={e => setActivityForm(v => ({ ...v, end_time: e.target.value }))} style={{ ...field, marginTop: 5 }}/></label><label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}><input type="checkbox" checked={activityForm.enabled_this_week} onChange={e => setActivityForm(v => ({ ...v, enabled_this_week: e.target.checked }))}/> Diese Woche aktiv</label></div>}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>{!activityForm.is_weekly && <><label style={{ fontWeight: 800 }}>Beginn<input type="datetime-local" value={activityForm.starts_at} onChange={e => setActivityForm(v => ({ ...v, starts_at: e.target.value }))} style={{ ...field, marginTop: 5 }}/></label><label style={{ fontWeight: 800 }}>Ende<input type="datetime-local" value={activityForm.ends_at} onChange={e => setActivityForm(v => ({ ...v, ends_at: e.target.value }))} style={{ ...field, marginTop: 5 }}/></label></>}<label style={{ fontWeight: 800 }}>Max. Teilnehmer<input type="number" min="1" value={activityForm.max_participants} onChange={e => setActivityForm(v => ({ ...v, max_participants: e.target.value }))} style={{ ...field, marginTop: 5 }}/></label></div><label style={{ fontWeight: 800 }}>Preis pro Person in Euro (optional)<input type="number" min="0" step="0.01" value={activityForm.price_eur} onChange={e => setActivityForm(v => ({ ...v, price_eur: e.target.value }))} placeholder="z. B. 12,00" style={{ ...field, marginTop: 5 }}/></label><label style={{ fontWeight: 800 }}>Titelbild vom Computer hochladen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setActivityImageFile(e.target.files?.[0] || null)} style={{ ...field, marginTop: 5, padding: 9 }}/><small style={{ display: "block", marginTop: 4, color: "#607276", fontWeight: 400, lineHeight: 1.4 }}>Bilddatei vom PC/Handy auswählen. Das Bild wird automatisch auf maximal 640 px verkleinert und als JPG komprimiert. Maximal 8 MB vor dem Upload.{activityImageFile ? ` Ausgewählt: ${activityImageFile.name}` : ""}</small></label><label style={{ fontWeight: 800 }}>Oder Titelbild-URL (optional)<input type="url" value={activityForm.image_url} onChange={e => setActivityForm(v => ({ ...v, image_url: e.target.value }))} placeholder="https://…" style={{ ...field, marginTop: 5 }}/><small style={{ display: "block", marginTop: 4, color: "#607276", fontWeight: 400, lineHeight: 1.4 }}>Ein ausgewähltes Bild vom Computer hat Vorrang vor der URL.</small></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={{ ...button, justifySelf: "start" }} disabled={savingActivity}>{savingActivity ? "Wird gespeichert …" : editingActivityId ? "Änderungen speichern" : "Aktivität erstellen"}</button>{editingActivityId && <button type="button" onClick={()=>{setEditingActivityId(null);setActivityForm({title:"",description:"",starts_at:"",ends_at:"",max_participants:"",image_url:"",is_weekly:true,weekday:"5",start_time:"09:00",end_time:"",enabled_this_week:true,price_eur:""});setActivityImageFile(null);}} style={{...button,background:"#eaf0ef",color:colors.ink}}>Bearbeitung abbrechen</button>}</div></form><h3 style={{ marginTop: 24 }}>Aktivitäten verwalten</h3>{activities.map(a => <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${colors.line}`, padding: "10px 0" }}><div><strong>{a.title}</strong><div style={{ fontSize: 12, color: "#607276" }}>{a.is_weekly ? `${weekdayNames[a.weekday]} · ${activityTimeLabel(a)}` : formatDay(a.starts_at)} · {a.max_participants ? `max. ${a.max_participants} Personen · ` : "ohne Begrenzung · "}{a.price_eur != null ? `${Number(a.price_eur).toLocaleString("de-DE")} € · ` : "kostenfrei · "}{a.is_active ? "öffentlich" : "ausgeblendet"}</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button style={{ ...button, background: "#eaf0ef", color: colors.ink, padding: "8px 10px" }} onClick={() => startEditActivity(a)}>Bearbeiten</button>{a.is_weekly && a.is_active && <button style={{ ...button, background: a.enabled_this_week ? "#986a14" : colors.teal, padding: "8px 10px" }} onClick={() => toggleActivityWeek(a)}>{a.enabled_this_week ? "Diese Woche pausieren" : "Diese Woche aktivieren"}</button>}<button style={{ ...button, background: a.is_active ? "#a52b2b" : colors.teal, padding: "8px 10px" }} onClick={async () => { const { error: e } = await supabase.from("hotel_activities").update({ is_active: !a.is_active }).eq("id", a.id); if (e) setError("Aktivitätsstatus konnte nicht geändert werden."); else { setNotice(a.is_active ? "Aktivität ausgeblendet." : "Aktivität veröffentlicht."); await loadProgram(); } }}>{a.is_active ? "Ausblenden" : "Veröffentlichen"}</button></div></div>)}</section>}
    </div>
    {selected && <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(7,31,36,.62)", display: "grid", placeItems: "center", padding: 14 }}><section role="dialog" aria-modal="true" aria-labelledby="hotel-book-title" style={{ ...card, width: "min(100%,460px)", boxSizing: "border-box", padding: 22 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><div style={{ fontSize: 12, fontWeight: 800, color: colors.teal, textTransform: "uppercase" }}>Verbindliche Anmeldung</div><h2 id="hotel-book-title" style={{ margin: "5px 0 8px" }}>{selected.title}</h2><div style={{ color: "#607276", fontSize: 13 }}>{selected.kind === "party" ? "Sonntag · 17:30–22:00 Uhr" : `${formatDay(selected.starts_at)} · ${formatTime(selected.starts_at)}`}</div></div><button aria-label="Schließen" onClick={() => setSelected(null)} style={{ border: 0, background: "#edf3f2", borderRadius: 9, padding: "6px 10px", height: 36 }}>✕</button></div><p style={{ background: colors.pale, padding: 11, borderRadius: 10, fontSize: 13 }}>{selected.kind === "workshop" && ((selected.starts_at && new Date(selected.starts_at).getDay() === 6) || /samstag/i.test(selected.recurrence_text || "")) ? "Samstagsworkshops können einzeln oder zu zweit gebucht werden." : selected.kind === "workshop" ? "Dieser Workshop wird paarweise gebucht." : "Es werden nur Zimmernummer und Personenanzahl benötigt."}</p><form onSubmit={e => { e.preventDefault(); bookItem(selected, selected.kind); }} style={{ display: "grid", gap: 12 }}><label style={{ fontWeight: 800, fontSize: 13 }}>Zimmernummer<input autoFocus required value={roomNumber} onChange={e => setRoomNumber(e.target.value)} placeholder="z. B. 125" style={{ ...field, marginTop: 5 }}/></label><label style={{ fontWeight: 800, fontSize: 13 }}>Anzahl Personen<select value={selected.kind === "workshop" && !((selected.starts_at && new Date(selected.starts_at).getDay() === 6) || /samstag/i.test(selected.recurrence_text || "")) ? "2" : partySize} disabled={selected.kind === "workshop" && !((selected.starts_at && new Date(selected.starts_at).getDay() === 6) || /samstag/i.test(selected.recurrence_text || ""))} onChange={e => setPartySize(e.target.value)} style={{ ...field, marginTop: 5 }}>{(selected.kind === "workshop" && !((selected.starts_at && new Date(selected.starts_at).getDay() === 6) || /samstag/i.test(selected.recurrence_text || "")) ? [2] : [1,2,3,4,5,6,7,8,9,10]).map(n => <option key={n} value={n}>{n} {n === 1 ? "Person" : "Personen"}</option>)}</select></label>{error && <div role="alert" style={{ color: "#982d24", background: "#fff0ee", padding: 10, borderRadius: 8 }}>{error}</div>}<button type="submit" disabled={!!busyId} style={{ ...button, width: "100%" }}>{busyId ? "Anmeldung wird gespeichert …" : "Verbindlich anmelden"}</button></form></section></div>}
    <footer style={{ textAlign: "center", padding: "12px 16px 26px", fontSize: 12, color: "#718083" }}>Hotel Sonnenhof · Wochenprogramm &amp; Aktivitäten</footer>
  </main>;
}

function PublicPairRegistration({ workshopId }) {
  const [workshop, setWorkshop] = useState(null);
  const [individualAllowed, setIndividualAllowed] = useState(false);
  const [registrationMode, setRegistrationMode] = useState("pair");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    user1Name: "",
    user1Email: "",
    user2Name: "",
    user2Email: ""
  });

  useEffect(() => {
    let active = true;

    async function loadWorkshop() {
      setLoading(true);
      setErrorMessage("");

      const [{ data, error }, { data: individualEnabled }] = await Promise.all([
        supabase.rpc("get_public_workshop_for_registration", { p_workshop_id: Number(workshopId) }),
        supabase.rpc("get_public_workshop_individual_registration_enabled", { p_workshop_id: Number(workshopId) })
      ]);

      if (!active) return;
      setIndividualAllowed(individualEnabled === true);

      if (error || !data?.[0]) {
        setErrorMessage("Dieser Workshop wurde nicht gefunden.");
        setWorkshop(null);
      } else {
        let loadedWorkshop = data[0];
        if (!String(loadedWorkshop.trainer_name || "").trim()) {
          const { data: publicWorkshops } = await supabase.rpc("get_public_workshops_for_registration");
          const publicMatch = (publicWorkshops || []).find(w => Number(w.id) === Number(workshopId));
          if (publicMatch?.trainer_name) {
            loadedWorkshop = { ...loadedWorkshop, trainer_name: publicMatch.trainer_name };
          }
        }
        setWorkshop(loadedWorkshop);
      }

      setLoading(false);
    }

    loadWorkshop();
    return () => { active = false; };
  }, [workshopId]);

  async function submit(e) {
    e.preventDefault();
    if (busy || success) return;

    const name1 = form.user1Name.trim();
    const email1 = form.user1Email.trim();
    const name2 = form.user2Name.trim();
    const email2 = form.user2Email.trim();

    if (!name1 || !email1) {
      setErrorMessage("Bitte Name und E-Mail-Adresse angeben.");
      return;
    }
    if (registrationMode === "pair" && !name2) {
      setErrorMessage("Bitte auch den Namen der zweiten Person angeben.");
      return;
    }

    setBusy(true);
    setErrorMessage("");

    if (registrationMode === "individual") {
      const { error: individualError } = await supabase.rpc("register_guest_workshop_individually", {
        p_workshop_id: Number(workshopId),
        p_participant_name: name1,
        p_participant_email: email1
      });
      setBusy(false);
      if (individualError) {
        setErrorMessage(individualError.message || "Die Einzelanmeldung konnte nicht gespeichert werden.");
        return;
      }
      setSuccess(true);
      return;
    }

    const { data: registrationId, error } = await supabase.rpc("register_guest_workshop_pair", {
      p_workshop_id: Number(workshopId),
      p_user1_name: name1,
      p_user1_email: email1,
      p_user2_name: name2,
      p_user2_email: email2
    });

    setBusy(false);

    if (error) {
      setErrorMessage(error.message || "Die Anmeldung konnte nicht gespeichert werden.");
      return;
    }

    const emailResult = await sendWorkshopPairConfirmation({
      workshopId,
      registrationId,
      user1Name: name1,
      user1Email: email1,
      user2Name: name2,
      user2Email: email2 || null,
      costPerPerson: workshop?.cost_per_person ?? null
    });

    if (!emailResult.ok) {
      console.warn(
        "Die Paaranmeldung wurde gespeichert, aber die Bestätigungs-E-Mails konnten nicht vollständig versendet werden."
      );
    }

    setSuccess(true);
  }

  if (loading) {
    return (
      <div className="center" style={{ minHeight: "100vh", padding: 24 }}>
        Workshop wird geladen …
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "18px 12px 28px",
        background: "linear-gradient(180deg,#f8f4ff 0%,#ffffff 72%)",
        fontFamily: "inherit"
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div
            style={{
              width: "100%",
              overflow: "hidden",
              borderRadius: 18,
              marginBottom: 10,
              background: "#f1eafe",
              border: "1px solid #dfd1f6",
              boxShadow: "0 3px 12px rgba(87,49,155,0.08)"
            }}
          >
            <img
              src={WORKSHOP_HEADER_URL}
              onError={handleWorkshopImageFallback}
              alt="Peter & Bettina's Workshops & mehr"
              style={{ display: "block", width: "100%", height: "auto", objectFit: "cover" }}
              onError={e => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = LOGIN_BACKGROUND_URL;
              }}
            />
          </div>
          <h1 style={{ margin: "4px 0 1px", color: "#57319b", fontSize: 23, lineHeight: 1.15 }}>
            Paaranmeldung
          </h1>
          <div style={{ color: "#666", fontSize: 12.5 }}>
            Peter &amp; Bettina's Tanzpartnerbörse
          </div>
        </div>

        {!workshop ? (
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>⚠️</div>
            <h2 style={{ margin: "8px 0" }}>Workshop nicht gefunden</h2>
            <p className="muted" style={{ lineHeight: 1.45, marginBottom: 0 }}>
              Der Link zur Paaranmeldung ist ungültig oder der Workshop existiert nicht mehr.
            </p>
          </div>
        ) : (
          <div
            className="card"
            style={{
              padding: 10,
              borderRadius: 16,
              boxShadow: "0 3px 14px rgba(87,49,155,0.07)"
            }}
          >
            {/* Kompakte Workshop-Zusammenfassung */}
            <div
              style={{
                padding: "11px 12px",
                borderRadius: 15,
                background: "#f1eafe",
                border: "1px solid #dfd1f6",
                marginBottom: 10
              }}
            >
              <div
                style={{
                  color: "#6331b8",
                  fontWeight: 900,
                  fontSize: 20,
                  lineHeight: 1.15,
                  marginBottom: 5
                }}
              >
                {workshop.title}
              </div>

              {workshop.trainer_name && (
                <div style={{ fontWeight: 700, lineHeight: 1.35 }}>
                  👤 {workshop.trainer_name}
                </div>
              )}

              {workshop.level && (
                <div style={{ fontWeight: 700, lineHeight: 1.35 }}>
                  ⭐ {workshop.level}
                </div>
              )}

              {workshop.starts_at && (
                <div style={{ lineHeight: 1.35 }}>
                  📅 {new Intl.DateTimeFormat("de-DE", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                  }).format(new Date(workshop.starts_at))}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginTop: 2,
                  lineHeight: 1.35
                }}
              >
                {workshop.start_time && (
                  <strong>🕓 {String(workshop.start_time).slice(0, 5)} Uhr</strong>
                )}
                {workshop.duration_minutes != null && (
                  <strong>⏱️ {workshop.duration_minutes} Min.</strong>
                )}
              </div>

              {workshop.cost_per_person != null && (
                <div style={{ marginTop: 2, lineHeight: 1.35 }}>
                  💶 {Number(workshop.cost_per_person).toFixed(2).replace(".", ",")} € pro Person
                </div>
              )}
            </div>

            {success ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 14,
                  background: "#eaf8ef",
                  border: "1px solid #b8e4c7",
                  color: "#167544",
                  textAlign: "center"
                }}
              >
                <div style={{ fontSize: 30 }}>✅</div>
                <div style={{ fontWeight: 900, fontSize: 19, marginTop: 4 }}>
                  Anmeldung erfolgreich!
                </div>
                <div style={{ marginTop: 6, lineHeight: 1.45 }}>
                  {registrationMode === "individual" ? "Du bist für diesen Workshop einzeln angemeldet." : "Ihr seid für diesen Workshop als Paar angemeldet."}
                </div>
                <div style={{ marginTop: 9, fontSize: 12.5 }}>
                  Eine Registrierung in der Tanzpartnerbörse ist nicht erforderlich.
                </div>
                <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.45 }}>
                  {registrationMode === "pair" ? <>📧 <strong>Bestätigungs-Mail bitte aufbewahren.</strong><br />Sie enthält den <strong>Link zur Abmeldung vom Workshop.</strong></> : <>Bitte bewahre die Angaben zu deiner Anmeldung auf. Eine Bestätigungs-Mail für Einzelanmeldungen ist noch nicht eingerichtet.</>}
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                {individualAllowed && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button type="button" onClick={() => { setRegistrationMode("pair"); setErrorMessage(""); }} style={{ flex: 1, minHeight: 43, borderRadius: 11, border: registrationMode === "pair" ? "2px solid #7138d6" : "1px solid #ddd", background: registrationMode === "pair" ? "#f1eafe" : "#fff", color: "#57319b", fontWeight: 850 }}>💃🕺 Als Paar</button>
                    <button type="button" onClick={() => { setRegistrationMode("individual"); setErrorMessage(""); }} style={{ flex: 1, minHeight: 43, borderRadius: 11, border: registrationMode === "individual" ? "2px solid #7138d6" : "1px solid #ddd", background: registrationMode === "individual" ? "#f1eafe" : "#fff", color: "#57319b", fontWeight: 850 }}>👤 Einzeln anmelden</button>
                  </div>
                )}
                <div
                  style={{
                    padding: "9px 10px 10px",
                    borderRadius: 14,
                    background: "#fff",
                    border: "1px solid #e5ddf2",
                    marginBottom: 9
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      color: "#57319b",
                      fontSize: 19,
                      lineHeight: 1.2
                    }}
                  >
                    {registrationMode === "individual" ? "👤 Einzeln anmelden" : "💃🕺 Als Paar anmelden"}
                  </h2>
                  <p
                    style={{
                      color: "#777",
                      lineHeight: 1.35,
                      margin: "4px 0 0",
                      fontSize: 12.5
                    }}
                  >
                    {registrationMode === "individual" ? "Du meldest dich allein an. Es wird kein Tanzpartner vermittelt." : "Ihr habt euch bereits als Tanzpaar gefunden? Direkt anmelden – ohne Registrierung."}
                  </p>
                </div>

                {/* Person 1 */}
                <div
                  style={{
                    padding: "9px 10px 8px",
                    borderRadius: 13,
                    background: "#faf7ff",
                    border: "1px solid #e5ddf2",
                    marginBottom: 7
                  }}
                >
                  <div style={{ color: "#57319b", fontWeight: 900, fontSize: 15, marginBottom: 6 }}>
                    👤 Person 1
                  </div>

                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.user1Name}
                    onChange={e => setForm(v => ({ ...v, user1Name: e.target.value }))}
                    placeholder="Vor- und Nachname"
                    autoComplete="name"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginBottom: 6,
                      minHeight: 43,
                      padding: "9px 11px",
                      borderRadius: 11
                    }}
                  />

                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
                    E-Mail
                  </label>
                  <input
                    type="email"
                    required
                    value={form.user1Email}
                    onChange={e => setForm(v => ({ ...v, user1Email: e.target.value }))}
                    placeholder="name@beispiel.de"
                    autoComplete="email"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      minHeight: 43,
                      padding: "9px 11px",
                      borderRadius: 11
                    }}
                  />
                </div>

                {registrationMode === "pair" && <>
                {/* Person 2 */}
                <div
                  style={{
                    padding: "9px 10px 8px",
                    borderRadius: 13,
                    background: "#faf7ff",
                    border: "1px solid #e5ddf2",
                    marginBottom: 7
                  }}
                >
                  <div style={{ color: "#57319b", fontWeight: 900, fontSize: 15, marginBottom: 6 }}>
                    👤 Person 2 <span style={{ color: "#777", fontWeight: 500, fontSize: 12 }}>(E-Mail optional)</span>
                  </div>

                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.user2Name}
                    onChange={e => setForm(v => ({ ...v, user2Name: e.target.value }))}
                    placeholder="Vor- und Nachname"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginBottom: 6,
                      minHeight: 43,
                      padding: "9px 11px",
                      borderRadius: 11
                    }}
                  />

                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
                    E-Mail <span style={{ fontWeight: 500, color: "#777" }}>(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={form.user2Email}
                    onChange={e => setForm(v => ({ ...v, user2Email: e.target.value }))}
                    placeholder="name@beispiel.de"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      minHeight: 43,
                      padding: "9px 11px",
                      borderRadius: 11
                    }}
                  />
                </div>

                </>}

                {errorMessage && (
                  <div
                    style={{
                      marginBottom: 7,
                      padding: "8px 10px",
                      borderRadius: 11,
                      background: "#fff1f1",
                      border: "1px solid #efb8b8",
                      color: "#a22",
                      fontSize: 12.5,
                      lineHeight: 1.35
                    }}
                  >
                    ⚠️ {errorMessage}
                  </div>
                )}

                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 11,
                    background: "#faf7ff",
                    border: "1px solid #e1d5f5",
                    color: "#5c4b72",
                    fontSize: 11.5,
                    lineHeight: 1.35,
                    marginBottom: 8
                  }}
                >
                  🔒 E-Mail-Adressen werden ausschließlich für die Workshop-Anmeldung verwendet.
                </div>

                <button
                  type="submit"
                  className="primary"
                  disabled={busy}
                  style={{
                    width: "100%",
                    minHeight: 47,
                    marginTop: 0,
                    fontWeight: 900,
                    fontSize: 15.5,
                    borderRadius: 12
                  }}
                >
                  {busy ? "Anmeldung wird gespeichert …" : (registrationMode === "individual" ? "🎟️ Verbindlich einzeln anmelden" : "🎟️ Verbindlich als Paar anmelden")}
                </button>

                <div
                  style={{
                    textAlign: "center",
                    color: "#777",
                    fontSize: 11.5,
                    marginTop: 7,
                    lineHeight: 1.35
                  }}
                >
                  ℹ️ Keine Registrierung erforderlich · Bestätigung per E-Mail
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TanzpartnerRulesGate({ rules, onAccepted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function acceptRules() {
    if (!rules?.version || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: acceptError } = await realSupabase.rpc("accept_tanzpartner_rules", {
        p_version: Number(rules.version)
      });
      if (acceptError) throw acceptError;
      onAccepted?.();
    } catch (err) {
      console.error("Regelbestätigung konnte nicht gespeichert werden:", err);
      setError("Die Bestätigung konnte gerade nicht gespeichert werden. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  }

  const imageUrl = "data:image/webp;base64,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";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f7f3fb",
      padding: "12px 10px 110px",
      boxSizing: "border-box",
      overflowY: "auto"
    }}>
      <div style={{
        width: "min(100%, 760px)",
        margin: "0 auto",
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 8px 30px rgba(70,35,110,.12)",
        overflow: "hidden",
        border: "1px solid #e7d9f6"
      }}>
        <img
          src={imageUrl}
          alt="Regeln für ein gutes Miteinander in der Tanzpartnerbörse"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
        <div style={{ padding: "12px 14px 16px", background: "#fff" }}>
          <div style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "#faf7ff",
            border: "1px solid #e4d8f4",
            color: "#5b4d69",
            fontSize: 12,
            lineHeight: 1.4,
            marginBottom: 10
          }}>
            Bitte bestätige einmal, dass du die Regeln gelesen hast. Danach gelangst du direkt zur Startseite.
          </div>
          <button
            type="button"
            onClick={acceptRules}
            disabled={busy}
            style={{
              width: "100%",
              minHeight: 52,
              border: 0,
              borderRadius: 14,
              background: busy ? "#a78bda" : "#7c3aed",
              color: "#fff",
              fontSize: 16,
              fontWeight: 900,
              cursor: busy ? "wait" : "pointer",
              boxShadow: "0 4px 12px rgba(124,58,237,.22)"
            }}
          >
            {busy ? "⏳ Bestätigung wird gespeichert …" : "✅ Ich habe die Regeln gelesen und verstanden"}
          </button>
          {error && (
            <div style={{ marginTop: 9, padding: 10, borderRadius: 10, background: "#fff1f2", border: "1px solid #fecdd3", color: "#b4233c", fontWeight: 800, fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicExternalDancerStatus({ token }) {
  const [rows, setRows] = useState([]);
  const [availableWorkshops, setAvailableWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availabilityBusy, setAvailabilityBusy] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setPhoneLoading(true); setErrorMessage("");
      const [{ data, error }, { data: savedPhone, error: phoneError }, { data: workshopData, error: workshopError }] = await Promise.all([
        supabase.rpc("get_external_dancer_booking_status", { p_token: token }),
        supabase.rpc("get_external_dancer_phone_by_token", { p_token: token }),
        supabase.from("workshops").select("id,title,starts_at,recurrence_text,is_published,workshop_type")
          .eq("is_published", true).gt("starts_at", new Date().toISOString())
          .or("recurrence_text.is.null,recurrence_text.eq.").order("starts_at").limit(100)
      ]);
      if (!active) return;
      if (workshopError) console.warn("Verfügbare Workshops konnten nicht geladen werden:", workshopError.message);
      setAvailableWorkshops((workshopData || []).filter(w => !isTanzkreisWorkshop(w) && !w.recurrence_text));
      if (error) {
        console.error("Externer Buchungsstatus konnte nicht geladen werden:", error);
        setErrorMessage("Der Buchungsstatus konnte gerade nicht geladen werden. Bitte prüfe den Link oder versuche es später erneut.");
        setRows([]);
      } else {
        setRows(data || []);
        if (!data?.length) setErrorMessage("Zu diesem persönlichen Link wurden keine Workshop-Vormerkungen gefunden.");
      }
      if (!phoneError) setPhone(savedPhone || "");
      else console.warn("Handynummer konnte nicht geladen werden. Bitte die Telefonfunktion in Supabase prüfen:", phoneError.message);
      setPhoneLoading(false); setLoading(false);
    })();
    return () => { active = false; };
  }, [token]);

  async function savePhone(e) {
    e.preventDefault(); setPhoneMessage(""); setPhoneBusy(true);
    try {
      const { error } = await supabase.rpc("set_external_dancer_phone_by_token", { p_token: token, p_phone: phone.trim() || null });
      if (error) throw error;
      setPhoneMessage("Handynummer wurde gespeichert.");
    } catch (error) {
      console.error("Handynummer konnte nicht gespeichert werden:", error);
      setPhoneMessage("Speichern nicht möglich. Bitte prüfe den persönlichen Link oder melde dich bei Peter.");
    } finally { setPhoneBusy(false); }
  }


  async function changeAvailability(workshopId, available) {
    const key = String(workshopId);
    if (availabilityBusy) return;
    setAvailabilityBusy(key); setAvailabilityMessage("");
    try {
      const { error } = await supabase.rpc("set_gastherr_availability_by_token", {
        p_token: token, p_workshop_id: Number(workshopId), p_available: available
      });
      if (error) throw error;
      setAvailabilityMessage(available ? "Der Termin wurde hinzugefügt." : "Der freie Termin wurde entfernt.");
      const { data, error: reloadError } = await supabase.rpc("get_external_dancer_booking_status", { p_token: token });
      if (reloadError) throw reloadError;
      setRows(data || []);
    } catch (error) {
      console.error("Gastherren-Termin konnte nicht geändert werden:", error);
      setAvailabilityMessage(error?.message || "Der Termin konnte nicht geändert werden. Bitte versuche es erneut.");
    } finally { setAvailabilityBusy(""); }
  }

  const card = { background: "#fff", border: "1px solid #e5e0d7", borderRadius: 16, padding: 15, boxShadow: "0 3px 12px rgba(45,35,20,.05)" };
  return (
    <main style={{ width: "100%", maxWidth: 700, margin: "0 auto", padding: "24px 14px 48px", boxSizing: "border-box", color: "#3e352b" }}>
      <header style={{ ...card, background: "linear-gradient(135deg,#f0fbf3,#fff8eb)", borderColor: "#cfe5d4", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#287747", textTransform: "uppercase", letterSpacing: ".06em" }}>Persönlicher Status-Link</div>
        <h1 style={{ fontSize: 24, lineHeight: 1.2, margin: "7px 0" }}>Meine Workshop-Buchungen</h1>
        <p style={{ margin: 0, color: "#665747", fontSize: 14, lineHeight: 1.5 }}>Hier siehst du, für welche Workshops du als externer Tanzpartner vorgemerkt oder gebucht bist. Bewahre diesen Link privat auf.</p>
      </header>
      <section style={{ ...card, marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 6px", color: "#8f1e22" }}>Meine Handynummer</h2>
        <p style={{ fontSize: 13, lineHeight: 1.45, color: "#665747", margin: "0 0 12px" }}>Nur falls Peter dich erreichen muss. Die Nummer wird nicht öffentlich angezeigt und nicht automatisch an Tanzpartnerinnen weitergegeben. Du kannst sie hier jederzeit ändern oder löschen.</p>
        {phoneLoading ? <p>Kontaktdaten werden geladen …</p> : <form onSubmit={savePhone} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Handynummer (freiwillig)<input type="tel" autoComplete="tel" inputMode="tel" maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} placeholder="z. B. 0170 1234567" style={{ boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d9c7b9", borderRadius: 9, font: "inherit" }} /></label>
          {phoneMessage && <div role="status" style={{ color: phoneMessage.includes("gespeichert") ? "#216b40" : "#a11d24", fontSize: 13 }}>{phoneMessage}</div>}
          <button type="submit" disabled={phoneBusy} style={{ border: 0, borderRadius: 10, padding: 12, background: "#8f1e22", color: "white", fontWeight: 850 }}>{phoneBusy ? "Speichert …" : "Handynummer speichern"}</button>
        </form>}
      </section>
      {loading ? <div style={card}>Buchungen werden geladen …</div> : rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, i) => {
            const booked = row.booking_status === "Gebucht";
            const date = row.starts_at ? new Date(row.starts_at).toLocaleString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr" : "Termin folgt";
            return <section key={`${row.workshop_id}-${i}`} style={card}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}><h2 style={{ fontSize: 18, margin: "0 0 6px" }}>{row.workshop_title}</h2><div style={{ color: "#6b6259", fontSize: 13 }}>📅 {date}</div></div>
                <span style={{ flexShrink: 0, borderRadius: 999, padding: "6px 9px", fontSize: 12, fontWeight: 900, background: booked ? "#dff5e6" : "#fff1d8", color: booked ? "#216b40" : "#8a5b26" }}>{booked ? "✓ Gebucht" : "Noch nicht gebucht"}</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: booked ? "#216b40" : "#8a5b26" }}>{booked ? "Gebuchte Termine können nur über Peter geändert oder abgesagt werden." : "Du kannst diesen freien Termin selbst entfernen."}</span>
                {!booked && <button type="button" disabled={!!availabilityBusy} onClick={() => changeAvailability(row.workshop_id, false)} style={{ border: "1px solid #e7b8b3", borderRadius: 9, padding: "9px 12px", background: "#fff5f4", color: "#9d2922", fontWeight: 800 }}>{availabilityBusy === String(row.workshop_id) ? "Wird entfernt …" : "Freien Termin entfernen"}</button>}
              </div>
            </section>;
          })}
        </div>
      ) : <div style={{ ...card, lineHeight: 1.5 }}>{errorMessage || "Noch keine Workshop-Termine ausgewählt."}</div>}
      <section style={{ ...card, marginTop: 14 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 6px", color: "#8f1e22" }}>Weitere Workshops hinzufügen</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.45, color: "#665747" }}>Wähle zusätzliche zukünftige Workshops aus, für die du als Gastherr verfügbar bist. Bereits gebuchte Termine kannst du hier nicht ändern oder absagen.</p>
        {availabilityMessage && <div role="status" style={{ padding: 10, marginBottom: 10, borderRadius: 9, background: availabilityMessage.includes("hinzugefügt") || availabilityMessage.includes("entfernt") ? "#effaf1" : "#fff3f2", color: availabilityMessage.includes("hinzugefügt") || availabilityMessage.includes("entfernt") ? "#216b40" : "#9d2922", fontSize: 13 }}>{availabilityMessage}</div>}
        {availableWorkshops.filter(w => !rows.some(r => Number(r.workshop_id) === Number(w.id))).length ? <div style={{ display: "grid", gap: 9 }}>
          {availableWorkshops.filter(w => !rows.some(r => Number(r.workshop_id) === Number(w.id))).map(w => <div key={w.id} style={{ border: "1px solid #e8dfd5", borderRadius: 11, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}><strong>{w.title || "Workshop"}</strong><div style={{ fontSize: 12, color: "#6b6259", marginTop: 4 }}>📅 {w.starts_at ? new Date(w.starts_at).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr" : "Termin folgt"}</div></div>
            <button type="button" disabled={!!availabilityBusy} onClick={() => changeAvailability(w.id, true)} style={{ flexShrink: 0, border: 0, borderRadius: 9, padding: "9px 11px", background: "#287747", color: "#fff", fontWeight: 850 }}>{availabilityBusy === String(w.id) ? "Speichert …" : "+ Hinzufügen"}</button>
          </div>)}
        </div> : <p style={{ fontSize: 13, color: "#665747", margin: 0 }}>Aktuell sind keine weiteren passenden Workshops verfügbar.</p>}
      </section>
      <p style={{ color: "#82766a", fontSize: 11, lineHeight: 1.45, marginTop: 14 }}>Dieser Link ist persönlich. Bitte nicht öffentlich weitergeben.</p>
    </main>
  );
}

function PublicGastherrenPage() {
  const [workshops, setWorkshops] = useState([]);
  const [recurringDates, setRecurringDates] = useState({});
  const [selected, setSelected] = useState([]);
  const [selectedDates, setSelectedDates] = useState({});
  const [form, setForm] = useState({ name: "", height: "", gender: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_public_workshops_for_registration");
      if (!active) return;
      if (error) {
        setErrorMessage("Die Workshop-Termine konnten gerade nicht geladen werden.");
      } else {
        // Gastherren werden nur für reguläre Workshops angeboten; der samstägliche Dauerworkshop gehört nicht in dieses Formular.
        const rows = sortWorkshopsDauerZuerst((data || []).filter(w => !isTanzkreisWorkshop(w) && !w.recurrence_text));
        setWorkshops(rows);
        const recurring = rows.filter(w => w.recurrence_text);
        const dateEntries = await Promise.all(recurring.map(async w => {
          const { data: dates, error: dateError } = await supabase.rpc("get_recurring_workshop_dates", { p_workshop_id: Number(w.id) });
          if (dateError) {
            console.warn("Gastherren-Termine konnten nicht geladen werden:", dateError.message);
            return [String(w.id), []];
          }
          return [String(w.id), dates || []];
        }));
        if (active) setRecurringDates(Object.fromEntries(dateEntries));
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  function toggleWorkshop(id) {
    setSelected(prev => prev.includes(String(id)) ? prev.filter(x => x !== String(id)) : [...prev, String(id)]);
  }

  function toggleRecurringDate(workshopId, date) {
    const key = String(workshopId);
    const currentDates = new Set(selectedDates[key] || []);
    if (currentDates.has(date)) currentDates.delete(date); else currentDates.add(date);
    const nextForWorkshop = [...currentDates].sort();
    setSelectedDates(prev => {
      const next = { ...prev };
      if (nextForWorkshop.length) next[key] = nextForWorkshop;
      else delete next[key];
      return next;
    });
    setSelected(current => nextForWorkshop.length
      ? (current.includes(key) ? current : [...current, key])
      : current.filter(x => x !== key));
  }

  async function submit(e) {
    e.preventDefault();
    setErrorMessage("");
    if (!form.name.trim() || !form.email.trim() || !form.height || !form.gender || selected.length === 0) {
      setErrorMessage("Bitte Name, Geschlecht, Größe, E-Mail-Adresse und mindestens einen Workshoptermin auswählen.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      // Separate public intake RPC: this must save a pending application only,
      // never call the admin-only external-dancer creation RPC from the browser.
      const { error } = await supabase.rpc("submit_gastherr_application", {
        p_name: form.name.trim(),
        p_height_cm: Number(form.height),
        p_email: form.email.trim(),
        p_workshop_ids: selected.map(Number),
        p_workshop_dates: selectedDates,
        p_gender: form.gender,
        p_phone: form.phone.trim() || null
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err) {
      console.error("Gastherren-Anmeldung konnte nicht gespeichert werden:", err);
      setErrorMessage("Die Anmeldung konnte nicht gespeichert werden. Bitte versuche es später erneut oder melde dich telefonisch bei Peter: 01573 8166311.");
    } finally { setBusy(false); }
  }

  const card = { background: "#fff", border: "1px solid #ead9c8", borderRadius: 16, padding: 16, boxShadow: "0 3px 14px rgba(85,40,30,.07)" };
  return <main style={{ minHeight: "100vh", background: "#fffaf5", padding: "14px 12px 36px", color: "#38251e" }}>
    <div style={{ maxWidth: 680, margin: "0 auto", display: "grid", gap: 14 }}>
      <a href="/?workshops=1" style={{ color: "#8f1e22", fontWeight: 800, textDecoration: "none" }}>← Zur Workshop-Übersicht</a>
      <header style={{ textAlign: "center" }}>
        <h1 style={{ color: "#8f1e22", fontSize: "clamp(25px,6vw,38px)", lineHeight: 1.1, margin: "4px 0 10px" }}>Werde Gastherr im Sonnenhof!</h1>
        <p style={{ margin: 0, lineHeight: 1.5 }}>Du tanzt gerne und möchtest unsere Sonntags-Workshops unterstützen? Wir freuen uns auf dich!</p>
      </header>
      <div style={{ ...card, padding: 8 }}>
        <img src="/gastherren-sonnenhof.png" alt="Informationen für Gastherren – Dein Tanzsonntag im Sonnenhof" style={{ display: "block", width: "100%", height: "auto", borderRadius: 10 }} onError={e => { e.currentTarget.style.display = "none"; }} />
        <div style={{ padding: 10, lineHeight: 1.5 }}><strong>Das erwartet dich:</strong><ul style={{ paddingLeft: 22, marginBottom: 0 }}><li>Deine Teilnahme am Workshop ist kostenfrei.</li><li>Die Tanzpartnerin wird dir von uns gestellt.</li><li>Du kannst die Workshops auswählen, die dich interessieren.</li><li>Nach fünf Workshops als Gastherr erhältst du ein Discofox-Party-Ticket gratis.</li></ul></div>
      </div>
      <section style={card}>
        <h2 style={{ margin: "0 0 12px", color: "#8f1e22" }}>Deine Gastherren-Anmeldung</h2>
        {success ? <div role="status" style={{ padding: 14, borderRadius: 12, background: "#edf8ee", color: "#1c662b", fontWeight: 750 }}>Vielen Dank! Deine Meldung wurde übermittelt. Wir melden uns bei dir.</div> : <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Name<input required autoComplete="name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} style={{ boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d9c7b9", borderRadius: 9, font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Geschlecht<select required value={form.gender} onChange={e => setForm(v => ({ ...v, gender: e.target.value }))} style={{ boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d9c7b9", borderRadius: 9, font: "inherit", background: "white" }}><option value="">Bitte auswählen</option><option value="Mann">Mann</option><option value="Frau">Frau</option></select></label>
          <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Größe in cm<input required inputMode="numeric" type="number" min="130" max="230" value={form.height} onChange={e => setForm(v => ({ ...v, height: e.target.value }))} style={{ boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d9c7b9", borderRadius: 9, font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>E-Mail-Adresse<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} style={{ boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d9c7b9", borderRadius: 9, font: "inherit" }} /></label>
          <label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Handynummer <span style={{ fontWeight: 500, fontSize: 12, color: "#6e5a50" }}>(freiwillig – nur falls Peter dich erreichen muss)</span><input type="tel" autoComplete="tel" inputMode="tel" maxLength={40} value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))} placeholder="z. B. 0170 1234567" style={{ boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d9c7b9", borderRadius: 9, font: "inherit" }} /><small style={{ color: "#6e5a50", lineHeight: 1.4 }}>Deine Nummer wird nicht öffentlich angezeigt und nicht automatisch an Tanzpartnerinnen weitergegeben.</small></label>
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend style={{ fontWeight: 850, padding: 0, marginBottom: 9, color: "#38251e" }}>An welchen Workshops kannst du Gastherr sein?</legend>{loading ? <p>Termine werden geladen …</p> : workshops.length ? <div style={{ display: "grid", gap: 8 }}>{workshops.map(w => {
            const id = String(w.id);
            const recurring = Boolean(w.recurrence_text);
            const checked = selected.includes(id);
            const dates = recurringDates[id] || [];
            return <article key={w.id} style={{ padding: 10, border: `1px solid ${checked ? "#c9d6ea" : "#e1e6ee"}`, borderLeft: `4px solid ${checked ? "#6750a4" : "#aeb9ca"}`, borderRadius: 10, background: checked ? "#f5f7fc" : "#fff", boxShadow: "0 1px 3px rgba(30,41,59,.04)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
                <span style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: 14, lineHeight: 1.3, color: "#33283e", overflowWrap: "anywhere" }}>{w.title || w.name || "Workshop"}</strong><span style={{ display: "block", marginTop: 4, color: "#71677b", fontSize: 12, lineHeight: 1.35 }}>{w.starts_at ? formatWorkshopDate(w.starts_at) : (w.recurrence_text || "Termin siehe Workshop-Übersicht")} {w.start_time ? ` · ${String(w.start_time).slice(0,5)} Uhr` : ""}</span></span>
                {!recurring && <input type="checkbox" checked={checked} onChange={() => toggleWorkshop(w.id)} aria-label={`${w.title || "Workshop"} auswählen`} style={{ width: 20, height: 20, accentColor: "#6840a6", margin: 0 }} />}
              </div>
              {recurring && <div style={{ marginTop: 10, borderTop: "1px solid #e8def7", paddingTop: 9 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4b5568", marginBottom: 7, letterSpacing: ".01em" }}>TERMINE · gewünschte Samstage einzeln auswählen</div>
                {dates.length ? <div style={{ display: "grid", gap: 6 }}>{dates.map((dateRow, idx) => {
                  const date = String(dateRow.session_date || dateRow.date || "").slice(0, 10);
                  if (!date) return null;
                  const dateSelected = (selectedDates[id] || []).includes(date);
                  const [year, month, day] = date.split("-").map(Number);
                  const label = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(year, month - 1, day));
                  return <label key={`${id}-${date}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 9px", borderRadius: 8, border: `1px solid ${dateSelected ? "#c7d2e5" : "#e4e8ef"}`, background: dateSelected ? "#eef3fb" : "#fafbfc", fontSize: 12, cursor: "pointer" }}><span>{label}{w.start_time ? ` · ${String(w.start_time).slice(0,5)} Uhr` : ""}</span><input type="checkbox" checked={dateSelected} onChange={() => toggleRecurringDate(w.id, date)} aria-label={`${w.title || "Dauerworkshop"} am ${label}`} style={{ width: 18, height: 18, accentColor: "#6840a6", margin: 0 }} /></label>;
                })}</div> : <div style={{ fontSize: 12, color: "#8b7777" }}>Für diesen Dauerworkshop konnten keine zukünftigen Termine geladen werden.</div>}
              </div>}
            </article>;
          })}</div> : <p>Aktuell sind keine Workshops verfügbar.</p>}</fieldset>
          <p style={{ fontSize: 12, lineHeight: 1.45, color: "#6e5a50", margin: 0 }}>Mit dem Absenden erlaubst du uns, deine Angaben zur Bearbeitung deiner Gastherren-Anmeldung zu verwenden. Bitte sende das Formular nur für dich selbst ab.</p>
          {errorMessage && <div role="alert" style={{ color: "#a11d24", background: "#fff0f0", padding: 10, borderRadius: 8 }}>{errorMessage}</div>}
          <button type="submit" disabled={busy || loading || !workshops.length} style={{ border: 0, borderRadius: 11, padding: 14, background: busy ? "#a88a85" : "#a51f25", color: "white", fontWeight: 900, fontSize: 16, cursor: busy ? "wait" : "pointer" }}>{busy ? "Wird gesendet …" : "Als Gastherr melden"}</button>
        </form>}
      </section>
      <div style={{ textAlign: "center", fontSize: 13 }}>Fragen? Peter &amp; Bettina · <a href="tel:+4915738166311" style={{ color: "#8f1e22", fontWeight: 800 }}>01573 8166311</a></div>
    </div>
  </main>;
}


function AdminRecurringDateExclusions({ adminDb, readOnly = false }) {
  const [workshops, setWorkshops] = useState([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function loadWorkshops() {
    const { data, error } = await adminDb.from("workshops").select("id,title,recurrence_text").not("recurrence_text", "is", null).order("title");
    if (error) throw error;
    const list = data || [];
    setWorkshops(list);
    if (!selectedWorkshop && list.length) setSelectedWorkshop(String(list[0].id));
  }
  async function loadExclusions(workshopId = selectedWorkshop) {
    if (!workshopId) { setRows([]); return; }
    const { data, error } = await adminDb.rpc("admin_list_recurring_date_exclusions", { p_workshop_id: Number(workshopId) });
    if (error) throw error;
    setRows(data || []);
  }
  async function load() {
    setLoading(true); setMessage("");
    try { await loadWorkshops(); }
    catch (e) { setMessage(e?.message || "Dauerworkshops konnten nicht geladen werden."); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedWorkshop) loadExclusions(selectedWorkshop).catch(e => setMessage(e?.message || "Ausnahmen konnten nicht geladen werden.")); }, [selectedWorkshop]);
  async function addExclusion() {
    if (!selectedWorkshop || !date || busy || readOnly) return;
    if (!window.confirm(`Den Dauerworkshop am ${new Intl.DateTimeFormat("de-DE").format(new Date(date + "T12:00:00"))} ausnehmen? Bestehende Anmeldungen werden nicht gelöscht.`)) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await adminDb.rpc("admin_add_recurring_date_exclusion", { p_workshop_id: Number(selectedWorkshop), p_session_date: date, p_reason: reason.trim() });
      if (error) throw error;
      setMessage("Termin wurde ausgenommen. Bestehende Anmeldungen bleiben erhalten."); setDate(""); setReason(""); await loadExclusions(selectedWorkshop);
    } catch (e) { setMessage(e?.message || "Termin konnte nicht ausgenommen werden."); }
    finally { setBusy(false); }
  }
  async function removeExclusion(row) {
    if (busy || readOnly || !window.confirm("Diese Terminausnahme wirklich aufheben? Der Samstag wird wieder automatisch angeboten, sofern er im Vorschaufenster liegt.")) return;
    setBusy(true); setMessage("");
    try { const { error } = await adminDb.rpc("admin_remove_recurring_date_exclusion", { p_exclusion_id: row.id }); if (error) throw error; await loadExclusions(selectedWorkshop); setMessage("Ausnahme entfernt."); }
    catch (e) { setMessage(e?.message || "Ausnahme konnte nicht entfernt werden."); }
    finally { setBusy(false); }
  }
  const field = { boxSizing: "border-box", width: "100%", padding: 11, border: "1px solid #d8cceb", borderRadius: 10, font: "inherit", background: "#fff" };
  return <article className="profile-card" style={{ marginBottom: 16, borderLeft: "5px solid #7c3aed", background: "#fff" }}>
    <h3 style={{ marginTop: 0 }}>🚫 Einzelne Dauerworkshop-Termine ausnehmen</h3>
    <p className="muted" style={{ lineHeight: 1.5 }}>Ausgenommene Samstage werden bei der automatischen Terminliste übersprungen. Bestehende Anmeldungen werden nicht automatisch gelöscht.</p>
    {loading ? <p className="muted">Dauerworkshops werden geladen …</p> : workshops.length === 0 ? <p className="muted">Kein Dauerworkshop gefunden.</p> : <>
      <label style={{ display: "grid", gap: 6, fontWeight: 750, marginBottom: 10 }}>Dauerworkshop<select style={field} value={selectedWorkshop} onChange={e => setSelectedWorkshop(e.target.value)}>{workshops.map(w => <option key={w.id} value={String(w.id)}>{w.title || `Dauerworkshop ${w.id}`}</option>)}</select></label>
      {!readOnly && <><label style={{ display: "grid", gap: 6, fontWeight: 750, marginBottom: 10 }}>Datum ausnehmen<input type="date" style={field} value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().slice(0,10)} /></label><label style={{ display: "grid", gap: 6, fontWeight: 750, marginBottom: 10 }}>Grund (optional)<input style={field} value={reason} onChange={e => setReason(e.target.value)} placeholder="z. B. Weihnachten" /></label><button type="button" disabled={!date || busy} onClick={addExclusion} style={{ width: "100%", border: 0, borderRadius: 10, padding: 12, background: "#6d28d9", color: "#fff", fontWeight: 850 }}>{busy ? "Bitte warten …" : "Termin ausnehmen"}</button></>}
      <div style={{ marginTop: 14, fontWeight: 850 }}>Gespeicherte Ausnahmen</div>
      {!rows.length ? <p className="muted">Für diesen Dauerworkshop sind keine Ausnahmen gespeichert.</p> : rows.map(row => <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #eee" }}><div><strong>{new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${row.session_date}T12:00:00`))}</strong>{row.reason && <div className="muted" style={{ fontSize: 12 }}>{row.reason}</div>}</div>{!readOnly && <button type="button" disabled={busy} onClick={() => removeExclusion(row)} style={{ border: 0, borderRadius: 8, padding: "8px 10px", background: "#fee2e2", color: "#991b1b", fontWeight: 800 }}>Aufheben</button>}</div>)}
    </>}
    {message && <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: "#f5f3ff", color: "#4c1d95", fontSize: 13 }}>{message}</div>}
  </article>;
}

function AdminGastherrRewards({ adminDb, readOnly, onBack }) {
  const [rows,setRows]=useState([]), [dancers,setDancers]=useState([]), [workshops,setWorkshops]=useState([]);
  const [dancerId,setDancerId]=useState(""), [workshopId,setWorkshopId]=useState(""), [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [message,setMessage]=useState("");
  async function load(){setLoading(true);try{const [{data,error},{data:ds,error:de},{data:ws,error:we}]=await Promise.all([adminDb.rpc("admin_get_gastherr_rewards"),adminDb.rpc("admin_get_external_dancers"),adminDb.from("workshops").select("id,title,starts_at,workshop_type").lt("starts_at",new Date().toISOString()).order("starts_at",{ascending:false}).limit(250)]);if(error)throw error;if(de)throw de;if(we)throw we;setRows(data||[]);setDancers(ds||[]);setWorkshops((ws||[]).filter(w=>String(w.workshop_type||"").toLowerCase()!=="tanzkreis"));setMessage("");}catch(e){setMessage(e?.message||"Prämien konnten nicht geladen werden.");}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function action(fn,args,ok){if(busy)return;setBusy(true);setMessage("");try{const {error}=await adminDb.rpc(fn,args);if(error)throw error;setMessage(ok);await load();}catch(e){setMessage(e?.message||"Aktion fehlgeschlagen.");}finally{setBusy(false);}}
  const field={width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid #d9d3e1",borderRadius:10,background:"#fff",color:"#302b35"};
  return <section style={{maxWidth:1000,margin:"0 auto",padding:12,color:"#302b35"}}><button type="button" onClick={onBack} style={{border:0,background:"transparent",padding:"8px 0",fontWeight:800,color:"#6d28d9"}}>← Zurück zum Dashboard</button><header style={{background:"#fff9e8",border:"1px solid #f2d69a",borderRadius:16,padding:16,margin:"8px 0 14px"}}><h2 style={{margin:"0 0 5px"}}>🎁 Gastherrn Prämie</h2><p style={{margin:0,lineHeight:1.45}}>Nach fünf absolvierten Workshops erhält der Gastherr ein kostenloses Discofox-Party-Ticket. Verbliebene Anmeldungen nach dem Workshop werden automatisch gezählt; kurzfristige Einspringer können nachgetragen werden.</p></header>
  {!readOnly&&<div style={{background:"#fff",border:"1px solid #e6e0ea",borderRadius:14,padding:14,marginBottom:14}}><h3 style={{margin:"0 0 10px"}}>Teilnahme nachtragen</h3><p style={{margin:"0 0 10px",fontSize:13,color:"#746d78"}}>Für einen Gastherrn auswählen, der kurzfristig für einen erkrankten Kollegen eingesprungen ist. Pro Person und Workshop wird nur eine Teilnahme gezählt.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}><select value={dancerId} onChange={e=>setDancerId(e.target.value)} style={field}><option value="">Gastherr auswählen …</option>{dancers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><select value={workshopId} onChange={e=>setWorkshopId(e.target.value)} style={field}><option value="">Vergangenen Workshop auswählen …</option>{workshops.map(w=><option key={w.id} value={w.id}>{new Date(w.starts_at).toLocaleDateString("de-DE")} · {w.title}</option>)}</select><button type="button" disabled={!dancerId||!workshopId||busy} onClick={()=>action("admin_add_gastherr_reward_attendance",{p_external_dancer_id:dancerId,p_workshop_id:Number(workshopId)},"Teilnahme wurde nachgetragen.")} style={{border:0,borderRadius:10,padding:"10px 14px",background:"#6d28d9",color:"#fff",fontWeight:850}}>+ Teilnahme nachtragen</button></div></div>}
  {message&&<div role="status" style={{padding:11,borderRadius:10,background:"#f5f0ff",marginBottom:12,overflowWrap:"anywhere"}}>{message}</div>}{loading?<p>Prämien werden geladen …</p>:rows.length===0?<div style={{padding:16,background:"#fff",border:"1px solid #e6e0ea",borderRadius:12}}>Noch keine Gastherren gefunden.</div>:<div style={{display:"grid",gap:10}}>{rows.map(r=>{const count=Number(r.completed_count||0),due=count>=5&&!r.reward_issued;return <article key={r.external_dancer_id} style={{background:"#fff",border:`1px solid ${due?"#eab308":"#e6e0ea"}`,borderRadius:13,padding:14}}><div style={{display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}><div><strong style={{fontSize:16}}>{r.name}</strong><div style={{fontSize:12,color:"#746d78",marginTop:3}}>{r.email||"Keine E-Mail hinterlegt"}</div></div><strong style={{fontSize:20,color:due?"#a16207":count>=5?"#16834a":"#302b35"}}>{count} / 5</strong></div><div style={{height:7,background:"#eeeaf1",borderRadius:8,overflow:"hidden",margin:"10px 0"}}><div style={{height:"100%",width:`${Math.min(100,count/5*100)}%`,background:count>=5?"#16834a":"#7c3aed"}}/></div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><span style={{fontSize:13,color:due?"#a16207":r.reward_issued?"#16834a":"#746d78",fontWeight:750}}>{due?"🎁 Prämie erreicht – Ticket noch offen":r.reward_issued?"✓ Ticket bereits ausgegeben":`Noch ${Math.max(0,5-count)} Workshop(s) bis zur Prämie`}</span>{!readOnly&&count>=5&&!r.reward_issued&&<button type="button" disabled={busy} onClick={()=>action("admin_mark_gastherr_reward_issued",{p_external_dancer_id:r.external_dancer_id},"Gratis-Ticket wurde als ausgegeben markiert.")} style={{border:0,borderRadius:9,padding:"9px 12px",background:"#16834a",color:"#fff",fontWeight:850}}>Ticket ausgegeben</button>}</div></article>})}</div>}<button type="button" onClick={load} disabled={loading} style={{marginTop:14,border:"1px solid #d9d3e1",borderRadius:10,padding:"9px 13px",background:"#fff",fontWeight:800}}>↻ Aktualisieren</button></section>;
}

function AdminGastherrApplications({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("pending");

  const load = async () => {
    setLoading(true); setErrorMessage("");
    const { data, error } = await realSupabase.rpc("admin_list_gastherr_applications", { p_status: filter });
    if (error) { setErrorMessage("Anmeldungen konnten nicht geladen werden. Bitte zuerst die SQL-Migration gastherr_application_admin_migration.sql in Supabase ausführen."); setRows([]); }
    else setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter]);

  async function deleteApplication(row) {
    if (!window.confirm(`Anmeldung von ${row.name} endgültig löschen?`)) return;
    setBusyId(row.id); setErrorMessage("");
    try {
      const { data, error } = await realSupabase.rpc("admin_delete_gastherr_application", { p_application_id: row.id });
      if (error) throw error;
      if (!data) throw new Error("Die Anmeldung wurde nicht gefunden.");
      await load();
    } catch (error) {
      setErrorMessage(error?.message || "Die Anmeldung konnte nicht gelöscht werden.");
    } finally { setBusyId(""); }
  }

  async function decide(row, decision) {
    const prompt = decision === "approve" ? `Gastherr ${row.name} freigeben und in den Gastherren-Pool übernehmen? Anschließend wird automatisch eine E-Mail mit dem persönlichen Verwaltungslink versendet.` : `Anmeldung von ${row.name} wirklich ablehnen?`;
    if (!window.confirm(prompt)) return;
    setBusyId(row.id); setErrorMessage("");
    try {
      const { data, error } = await realSupabase.rpc("admin_decide_gastherr_application", { p_application_id: row.id, p_decision: decision });
      if (error) throw error;
      if (decision === "approve") {
        let mailResult = { ok: false, reason: "E-Mail konnte nicht vorbereitet werden." };
        try {
          const { data: dancers, error: dancersError } = await realSupabase.rpc("admin_get_external_dancers");
          if (dancersError) throw dancersError;
          const dancer = (dancers || []).find(d => String(d.email || "").toLowerCase() === String(row.email || "").toLowerCase());
          if (!dancer?.id) throw new Error("Gastherr freigegeben, aber nicht im Gastherren-Pool gefunden.");
          const { data: tokenData, error: tokenError } = await realSupabase.rpc("admin_get_external_status_token", { p_external_dancer_id: dancer.id });
          if (tokenError) throw tokenError;
          const token = typeof tokenData === "string" ? tokenData : (tokenData?.status_token || tokenData?.token);
          if (!token) throw new Error("Persönlicher Verwaltungslink konnte nicht erstellt werden.");
          const managementUrl = `${window.location.origin}/?gastherren-status=${encodeURIComponent(token)}`;
          const selections = Array.isArray(row.selections) ? row.selections : [];
          const { data: mailData, error: mailError } = await realSupabase.functions.invoke("send-partner-email", {
            body: { messageType: "gastherr_approved", to: row.email, recipientName: row.name, selections, managementUrl }
          });
          if (mailError) throw mailError;
          if (!mailData?.success) throw new Error(mailData?.error || "E-Mail-Versand wurde nicht bestätigt.");
          mailResult = { ok: true };
        } catch (mailError) {
          console.error("Gastherren-Freigabe-E-Mail fehlgeschlagen:", mailError);
          mailResult = { ok: false, reason: mailError?.message || "Unbekannter E-Mail-Fehler" };
        }
        alert(mailResult.ok
          ? `Gastherr ${row.name} wurde freigegeben. Die E-Mail mit dem persönlichen Verwaltungslink wurde erfolgreich zum Versand übergeben.`
          : `Gastherr ${row.name} wurde freigegeben, aber die E-Mail konnte nicht versendet werden.

Fehler: ${mailResult.reason}

Bitte über „Link anzeigen“ den persönlichen Link manuell weitergeben.`);
      }
      await load();
    } catch (error) {
      setErrorMessage(error?.message || "Die Entscheidung konnte nicht gespeichert werden.");
    } finally { setBusyId(""); }
  }

  const card = { background:"#fff", border:"1px solid #e3e7ee", borderRadius:14, padding:14, boxShadow:"0 2px 8px rgba(20,30,50,.04)" };
  return <section style={{maxWidth:1000, margin:"0 auto", padding:"8px 4px 100px", display:"grid", gap:12, color:"#172033"}}>
    <header style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <button type="button" onClick={onBack} style={{border:"1px solid #d9dee8",borderRadius:10,padding:"9px 12px",background:"#fff",fontWeight:800}}>‹ Zurück</button>
      <div style={{flex:1,minWidth:200}}><h1 style={{fontSize:24,margin:"0 0 3px",fontWeight:900}}>Gastherren genehmigen</h1><div style={{color:"#687386",fontSize:13}}>Anmeldungen prüfen und in den Gastherren-Pool übernehmen</div></div>
      <button type="button" onClick={load} style={{border:"1px solid #d9dee8",borderRadius:10,padding:"9px 12px",background:"#fff",fontWeight:800}}>↻ Aktualisieren</button>
    </header>
    <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{[{value:"pending",label:"Offen"},{value:"approved",label:"Freigegeben"},{value:"rejected",label:"Abgelehnt"},{value:"all",label:"Alle"}].map(x=><button key={x.value} type="button" onClick={()=>setFilter(x.value)} style={{border:"1px solid "+(filter===x.value?"#b8c7dc":"#dfe4ec"),background:filter===x.value?"#eaf1fb":"#fff",borderRadius:999,padding:"8px 13px",fontWeight:800,color:"#23334c"}}>{x.label}</button>)}</div>
    {errorMessage && <div role="alert" style={{...card,background:"#fff4f3",borderColor:"#f2c7c3",color:"#9b2520"}}>{errorMessage}</div>}
    {loading ? <div style={card}>Anmeldungen werden geladen …</div> : rows.length ? rows.map(row=><article key={row.id} style={card}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div style={{minWidth:0,flex:1}}><h2 style={{margin:"0 0 6px",fontSize:18,fontWeight:900}}>{row.name}</h2><div style={{fontSize:13,color:"#5b6678",lineHeight:1.6}}>📧 {row.email} · 📏 {row.height_cm} cm</div><div style={{fontSize:12,color:"#7a8494",marginTop:4}}>Eingegangen: {row.created_at ? new Date(row.created_at).toLocaleString("de-DE") : "—"}</div></div><span style={{padding:"6px 9px",borderRadius:999,fontSize:11,fontWeight:900,background:row.status==="approved"?"#def7e6":row.status==="rejected"?"#ffe5e2":"#fff0ce",color:row.status==="approved"?"#17613a":row.status==="rejected"?"#9a2b22":"#8a5c10"}}>{row.status==="approved"?"Freigegeben":row.status==="rejected"?"Abgelehnt":"Wartet auf Prüfung"}</span></div>
      <div style={{marginTop:10,padding:10,background:"#f7f9fc",borderRadius:10}}><strong style={{fontSize:12}}>Gewünschte Workshops und Termine</strong><ul style={{margin:"6px 0 0",paddingLeft:19,fontSize:12.5,lineHeight:1.6}}>{(row.selections || []).map((x,i)=><li key={i}>{x}</li>)}</ul></div>
      <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>{row.status==="pending" && <><button disabled={!!busyId} onClick={()=>decide(row,"approve")} style={{border:0,borderRadius:10,padding:"10px 13px",background:"#16834a",color:"#fff",fontWeight:900}}>{busyId===row.id?"Speichert …":"✓ Freigeben"}</button><button disabled={!!busyId} onClick={()=>decide(row,"reject")} style={{border:"1px solid #efc3c0",borderRadius:10,padding:"10px 13px",background:"#fff3f2",color:"#a12d25",fontWeight:850}}>Ablehnen</button></>}{row.status==="approved" && <button disabled={!!busyId} onClick={async()=>{setBusyId(row.id);try{const {data:dancers,error:dancerError}=await realSupabase.rpc("admin_get_external_dancers");if(dancerError)throw dancerError;const dancer=(dancers||[]).find(d=>String(d.email||"").toLowerCase()===String(row.email||"").toLowerCase());if(!dancer?.id)throw new Error("Der freigegebene Gastherr wurde nicht im Gastherren-Pool gefunden.");const {data,error}=await realSupabase.rpc("admin_get_external_status_token",{p_external_dancer_id:dancer.id});if(error)throw error;const token=typeof data==="string"?data:(data?.status_token||data?.token);if(!token)throw new Error("Für diesen Gastherrn konnte kein Link ermittelt werden.");const url=`${window.location.origin}/?gastherren-status=${encodeURIComponent(token)}`;window.prompt("Persönlichen Gastherren-Link kopieren:",url);}catch(e){setErrorMessage(e?.message||"Link konnte nicht geladen werden.");}finally{setBusyId("");}}} style={{border:"1px solid #c7d8ca",borderRadius:10,padding:"10px 13px",background:"#f1fbf3",color:"#245b36",fontWeight:850}}>🔗 Link anzeigen</button>}<button disabled={!!busyId} onClick={()=>deleteApplication(row)} style={{border:"1px solid #e2a7a3",borderRadius:10,padding:"10px 13px",background:"#fff",color:"#a12d25",fontWeight:850}}>🗑 Anmeldung löschen</button></div>
    </article>) : <div style={card}>Keine Anmeldungen in diesem Filter.</div>}
    <div style={{fontSize:11.5,color:"#7a8494",lineHeight:1.5}}>Hinweis: Der Link wird nicht automatisch kopiert. Bei freigegebenen Anmeldungen kannst du ihn später über „Link anzeigen“ abrufen. Der automatische E-Mail-Versand und die Selbstverwaltung von Terminen benötigen noch eine serverseitige Mail-/Verwaltungsfunktion.</div>
  </section>;
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [tanzpartnerRulesState, setTanzpartnerRulesState] = useState({
    loading: true,
    required: false,
    rules: null,
    error: ""
  });

  const urlParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;

  const guestPairWorkshopId =
    urlParams?.get("paaranmeldung") || null;
  const recurringWorkshopId =
    urlParams?.get("dauerworkshop") || null;
  const recurringWorkshopDate =
    urlParams?.get("termin") || "";

  const publicWorkshops =
    urlParams?.get("workshops") === "1";

  const publicGastherren = urlParams?.get("gastherren") === "1";

  const publicSonnenhofHotel = urlParams?.get("sonnenhof") === "1";

  const publicTanzkreis =
    urlParams?.get("tanzkreis") === "1";

  const publicEventId =
    urlParams?.get("event") || null;

  const reservationCancelToken =
    urlParams?.get("reservierung-stornieren") || null;
  const reservationCancelGroupToken =
    urlParams?.get("reservierung-stornieren-alle") || null;
  const workshopCancelToken =
    urlParams?.get("workshop-stornieren") || null;
  const recurringCancelRequested = Boolean(urlParams?.has("dauerworkshop-stornieren"));
  const recurringCancelToken = urlParams?.get("dauerworkshop-stornieren") || "";

  const externalDancerStatusToken =
    urlParams?.get("gastherren-status") || null;

  // Öffentlicher Veranstaltungslink: immer die öffentliche Veranstaltungsübersicht
  // öffnen. Die Veranstaltung wird dort als normale Kachel angezeigt.
  const publicEvents =
    urlParams?.get("veranstaltungen") === "1" || !!publicEventId;

  useEffect(() => {
    supabase.rpc("record_public_visit").then(({ error }) => {
      if (error) {
        console.warn("Aufruf konnte nicht gezählt werden:", error.message);
      }
    });
  }, []);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 2000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    let mounted = true;

    realSupabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error("getSession Fehler:", error);
      }

      setSession(data?.session || null);
      setLoading(false);
    });

    const {
      data: listener
    } = realSupabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);

        if (event === "PASSWORD_RECOVERY") {
          setResetMode(true);
        }
      }
    );

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);


  // Globale Regelbestätigung: einmal pro Nutzer und Regelversion vor der Startseite.
  useEffect(() => {
    let mounted = true;

    async function checkRules() {
      if (!session?.user?.id) {
        if (mounted) setTanzpartnerRulesState({ loading: false, required: false, rules: null, error: "" });
        return;
      }

      if (mounted) setTanzpartnerRulesState(prev => ({ ...prev, loading: true, error: "" }));

      try {
        const { data: ruleRows, error: ruleError } = await realSupabase.rpc("get_current_tanzpartner_rules");
        if (ruleError) throw ruleError;

        const rules = ruleRows?.[0] || null;
        if (!rules?.version) {
          if (mounted) setTanzpartnerRulesState({ loading: false, required: false, rules: null, error: "" });
          return;
        }

        const { data: acceptanceRows, error: acceptanceError } = await realSupabase.rpc(
          "get_my_tanzpartner_rules_acceptance",
          { p_version: Number(rules.version) }
        );
        if (acceptanceError) throw acceptanceError;

        const accepted = Boolean(acceptanceRows?.[0]?.accepted);
        if (mounted) {
          setTanzpartnerRulesState({ loading: false, required: !accepted, rules, error: "" });
        }
      } catch (err) {
        console.error("Tanzpartner-Regeln konnten nicht geprüft werden:", err);
        if (mounted) {
          setTanzpartnerRulesState({
            loading: false,
            required: true,
            rules: { version: 1, text_content: "" },
            error: "Die Regelbestätigung konnte gerade nicht geprüft werden. Bitte lade die Seite neu."
          });
        }
      }
    }

    checkRules();
    return () => { mounted = false; };
  }, [session?.user?.id]);

  if (reservationCancelToken || reservationCancelGroupToken) {
    return <PublicReservationCancellation
      token={reservationCancelToken}
      groupToken={reservationCancelGroupToken}
    />;
  }

  if (workshopCancelToken) {
    return <PublicWorkshopPairCancellation token={workshopCancelToken} />;
  }

  if (recurringCancelRequested) {
    return <PublicRecurringCancellation token={recurringCancelToken} />;
  }

  if (publicSonnenhofHotel) {
    return <PublicSonnenhofHotelRegistration />;
  }

  if (guestPairWorkshopId) {
    return <PublicPairRegistration workshopId={guestPairWorkshopId} />;
  }

  if (recurringWorkshopId) {
    return <PublicRecurringWorkshopRegistration workshopId={recurringWorkshopId} selectedDate={recurringWorkshopDate} />;
  }

  if (publicGastherren) {
    return <PublicGastherrenPage />;
  }

  if (publicWorkshops) {
    const selectedWorkshopDay = urlParams?.get("workshoptag");
    // Der allgemeine Workshop-Link öffnet zuerst die goldene Übersichtsseite.
    // Erst Samstag/Sonntag führen in die gefilterte Workshopliste.
    return selectedWorkshopDay === "samstag" || selectedWorkshopDay === "sonntag"
      ? <PublicWorkshopList />
      : <PublicWorkshopLanding />;
  }

  if (publicTanzkreis) {
    return <PublicTanzkreisArea session={session} />;
  }

  // Öffentliche Veranstaltungsseite muss unabhängig davon geöffnet werden,
  // ob im Browser bereits eine Sitzung angemeldet ist.
  if (publicEvents && !loading) {
    return (
      <ErrorBoundary>
        <Events currentUser={session?.user || null} />
      </ErrorBoundary>
    );
  }

  if (showSplash) {
    return (
      <div
        aria-label="Workshops & mehr wird geladen"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "#f7f3fb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          animation: "appSplashFadeIn .18s ease-out"
        }}
      >
        <img
          src={LOGIN_BACKGROUND_URL}
          onError={e => {
            if (e.currentTarget.dataset.fallbackApplied !== "1") {
              e.currentTarget.dataset.fallbackApplied = "1";
              e.currentTarget.src = "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/tanzpartnerboerse_og.png";
            }
          }}
          alt="Peter & Bettina’s Workshops & mehr"
          style={{
            display: "block",
            width: "min(92vw, 560px)",
            maxHeight: "82vh",
            objectFit: "contain",
            borderRadius: 28,
            boxShadow: "0 14px 40px rgba(60,35,100,.12)"
          }}
        />
        <style>{`
          @keyframes appSplashFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="center" style={{ minHeight: "100vh", padding: 24 }}>
        <div className="muted">Workshops werden geladen …</div>
      </div>
    );
  }

  if (resetMode) {
    return (
      <ResetPassword
        onDone={() => setResetMode(false)}
      />
    );
  }

  if (externalDancerStatusToken) {
    return <PublicExternalDancerStatus token={externalDancerStatusToken} />;
  }

  if (!session) {
    return <Auth />;
  }

  if (tanzpartnerRulesState.loading) {
    return (
      <div className="center" style={{ minHeight: "100vh", padding: 24 }}>
        <div className="muted">Regeln werden geladen …</div>
      </div>
    );
  }

  if (tanzpartnerRulesState.required) {
    if (tanzpartnerRulesState.error) {
      return (
        <div className="center" style={{ minHeight: "100vh", padding: 24 }}>
          <div style={{ maxWidth: 520, width: "100%", background: "#fff", border: "1px solid #eadcf7", borderRadius: 18, padding: 18, boxSizing: "border-box" }}>
            <h2 style={{ marginTop: 0 }}>📋 Regelbestätigung</h2>
            <p style={{ color: "#5f5967", lineHeight: 1.45 }}>{tanzpartnerRulesState.error}</p>
            <button type="button" className="primary" onClick={() => window.location.reload()}>↻ Erneut versuchen</button>
          </div>
        </div>
      );
    }
    return (
      <TanzpartnerRulesGate
        rules={tanzpartnerRulesState.rules}
        onAccepted={() => setTanzpartnerRulesState(prev => ({ ...prev, required: false }))}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Dashboard session={session} />
    </ErrorBoundary>
  );
}

function PublicRecurringCancellation({ token }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(token ? "Über diesen Link kannst du genau die Dauerworkshop-Anmeldung für einen Samstag stornieren." : "Der Stornierungslink enthält kein Buchungskennzeichen. Bitte nutze die Stornierung über Name und Zimmernummer auf der Hotel-Anmeldeseite.");
  const [done, setDone] = useState(false);
  async function cancel() {
    if (busy || done || !String(token || "").trim()) return;
    if (!window.confirm("Möchtest du diese Dauerworkshop-Anmeldung für genau diesen Samstag stornieren?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("cancel_sonnenhof_recurring_by_token", { p_token: token });
      if (error) throw error;
      if (!data) throw new Error("Der Link ist ungültig oder die Anmeldung wurde bereits storniert.");
      setDone(true); setMessage("✅ Die Anmeldung für diesen Samstag wurde storniert. Andere Samstage bleiben unverändert.");
    } catch (e) { setMessage("Stornierung fehlgeschlagen: " + (e?.message || "Unbekannter Fehler")); }
    finally { setBusy(false); }
  }
  return <main className="page" style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}><div className="hero"><h2>↩️ Dauerworkshop stornieren</h2><p>Peter &amp; Bettina’s Tanzpartnerbörse</p></div><div className="card"><p>{message}</p>{!done && token && <button className="primary wide" type="button" onClick={cancel} disabled={busy}>{busy ? "Wird storniert …" : "Teilnahme für diesen Samstag stornieren"}</button>}</div></main>;
}

function PublicWorkshopPairCancellation({ token }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState(null);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const activeToken = String(token || "").trim();
      if (!activeToken) {
        if (mounted) { setMessage("Dieser Stornierungslink ist ungültig."); setLoading(false); }
        return;
      }
      const { data, error } = await supabase.rpc("get_workshop_registration_by_cancellation_token", {
        p_token: activeToken
      });
      if (!mounted) return;
      if (error) {
        setMessage(error.message || "Die Workshop-Anmeldung konnte nicht geladen werden.");
      } else if (!data?.length) {
        setMessage("Die Workshop-Anmeldung wurde bereits storniert oder der Link ist ungültig.");
      } else {
        setRegistration(data[0]);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token]);

  async function cancel() {
    if (busy || done) return;
    if (!window.confirm("Möchtest du die gesamte Workshop-Paaranmeldung wirklich stornieren?")) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("cancel_workshop_registration_by_cancellation_token", {
      p_token: String(token || "").trim()
    });
    if (error) {
      setMessage(error.message || "Die Workshop-Anmeldung konnte nicht storniert werden.");
      setBusy(false);
      return;
    }
    setDone(true);
    setMessage("✅ Die Workshop-Paaranmeldung wurde erfolgreich storniert. Der Platz ist wieder frei.");
    setBusy(false);
  }

  return (
    <main className="page" style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      <div className="hero" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: "0 0 5px" }}>↩️ Workshop-Anmeldung stornieren</h2>
        <p style={{ margin: 0 }}>Peter &amp; Bettina’s Tanzpartnerbörse</p>
      </div>
      {loading ? <div className="card">Workshop-Anmeldung wird geladen …</div> : registration ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{registration.workshop_title}</h3>
          <div style={{ lineHeight: 1.7 }}>
            <div><strong>📅 Termin:</strong> {registration.starts_at ? formatEventDateTime(registration.starts_at).date : ""}{registration.starts_at && formatEventDateTime(registration.starts_at).time ? ` · ${formatEventDateTime(registration.starts_at).time} Uhr` : ""}</div>
            <div><strong>💃🕺 Tanzpaar:</strong> {registration.user1_name} + {registration.user2_name}</div>
          </div>
          {!done && (
            <button type="button" className="primary wide" onClick={cancel} disabled={busy} style={{ marginTop: 14 }}>
              {busy ? "Wird storniert …" : "↩️ Workshop-Paaranmeldung stornieren"}
            </button>
          )}
          {message && <div className="notice" style={{ marginTop: 12 }}>{message}</div>}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42 }}>ℹ️</div>
          <p>{message || "Workshop-Anmeldung nicht gefunden."}</p>
        </div>
      )}
    </main>
  );
}

function PublicReservationCancellation({ token, groupToken }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [resolvedGroup, setResolvedGroup] = useState(!token && !!groupToken);
  const activeToken = String(token || groupToken || "").trim();
  const isGroup = resolvedGroup;

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      if (!activeToken) {
        if (mounted) { setMessage("Dieser Stornierungslink ist ungültig."); setLoading(false); }
        return;
      }
      const rpc = groupToken
        ? "get_event_reservation_by_cancel_group_token"
        : "get_event_reservation_by_any_cancel_token";
      const { data, error } = await supabase.rpc(rpc, { p_token: activeToken });
      if (!mounted) return;
      if (error) {
        setMessage(error.message || "Die Reservierung konnte nicht geladen werden.");
      } else if (!data?.length) {
        setMessage("Die Reservierung wurde bereits storniert oder der Link ist ungültig.");
      } else {
        setReservation(data[0]);
        if (!groupToken) setResolvedGroup(Boolean(data[0]?.is_group));
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [activeToken, isGroup]);

  async function cancel() {
    if (busy || done) return;
    const question = isGroup
      ? "Möchtest du wirklich alle Sitzplätze dieser Reservierung stornieren?"
      : "Möchtest du diesen Sitzplatz wirklich stornieren?";
    if (!window.confirm(question)) return;
    setBusy(true); setMessage("");
    const rpc = isGroup ? "cancel_event_reservations_by_token" : "cancel_event_reservation_by_token";
    const { data, error } = await supabase.rpc(rpc, { p_token: activeToken });
    if (error) {
      setMessage(error.message || "Die Reservierung konnte nicht storniert werden.");
      setBusy(false);
      return;
    }
    if (!data?.length) {
      setMessage("Die Reservierung wurde bereits storniert oder ist nicht mehr verfügbar.");
      setBusy(false);
      return;
    }
    setDone(true);
    setReservation(prev => prev ? { ...prev, status: "cancelled", cancelled_at: new Date().toISOString() } : prev);

    // Auch bei einer Stornierung über den öffentlichen E-Mail-Link wird
    // eine Stornobestätigung verschickt. Dafür wird der sichere Token
    // serverseitig verwendet; eine Anmeldung ist nicht erforderlich.
    const cancellationEmail = await sendEventReservationEmail({
      action: "cancelled",
      eventId: reservation?.event_id || null,
      cancelToken: isGroup ? null : token,
      cancelGroupToken: isGroup ? groupToken : null
    });

    const cancelledCount = Array.isArray(data) ? data.length : 1;
    setMessage(
      isGroup
        ? `✅ ${cancelledCount === 1 ? "Der Sitzplatz wurde" : `Die ${cancelledCount} Sitzplätze wurden`} erfolgreich storniert. ${cancellationEmail.ok ? "Eine Stornobestätigung wurde per E-Mail versendet." : "⚠️ Die Stornobestätigung konnte nicht versendet werden."}`
        : `✅ Der Sitzplatz wurde erfolgreich storniert. ${cancellationEmail.ok ? "Eine Stornobestätigung wurde per E-Mail versendet." : "⚠️ Die Stornobestätigung konnte nicht versendet werden."}`
    );
    setBusy(false);
  }

  return (
    <main className="page" style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      <div className="hero" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: "0 0 5px" }}>↩️ Sitzplatzreservierung stornieren</h2>
        <p style={{ margin: 0 }}>Peter &amp; Bettina’s Tanzpartnerbörse</p>
      </div>
      {loading ? <div className="card">Reservierung wird geladen …</div> : reservation ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{reservation.event_title}</h3>
          <div style={{ lineHeight: 1.7 }}>
            <div><strong>👤 Name:</strong> {reservation.reservation_name}</div>
            <div><strong>📧 E-Mail:</strong> {reservation.reservation_email}</div>
            <div><strong>📅 Termin:</strong> {formatEventDateTime(reservation.starts_at).date}{formatEventDateTime(reservation.starts_at).time ? ` · ${formatEventDateTime(reservation.starts_at).time} Uhr` : ""}</div>
            <div style={{ marginTop: 8 }}><strong>🪑 Sitzplätze:</strong></div>
            <ul>{(reservation.seat_labels || []).map((label, i) => <li key={`${label}-${i}`}>{label}</li>)}</ul>
          </div>
          {!done && (
            <button type="button" className="primary wide" onClick={cancel} disabled={busy} style={{ marginTop: 12 }}>
              {busy ? "Wird storniert …" : (isGroup ? "↩️ Alle Sitzplätze stornieren" : "↩️ Diesen Sitzplatz stornieren")}
            </button>
          )}
          {message && <div className="notice" style={{ marginTop: 12 }}>{message}</div>}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42 }}>ℹ️</div>
          <p>{message || "Reservierung nicht gefunden."}</p>
        </div>
      )}
    </main>
  );
}

function Auth() {
  const [emailUnconfirmed, setEmailUnconfirmed] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function resendConfirmationEmail() {
    if (!email.trim() || resendBusy) return;
    setResendBusy(true);
    setResendMessage("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    setResendBusy(false);
    setResendMessage(
      error
        ? "Die Bestätigungs-Mail konnte nicht erneut gesendet werden."
        : "📧 Die Bestätigungs-Mail wurde erneut gesendet. Bitte prüfe auch deinen Spam-Ordner."
    );
  }

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showAlreadyRegisteredModal, setShowAlreadyRegisteredModal] = useState(false);
  const [showLoginErrorModal, setShowLoginErrorModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordBusy, setForgotPasswordBusy] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");

  async function sendPasswordReset() {
    const targetEmail = email.trim();

    if (!targetEmail) {
      setForgotPasswordMessage(
        "Bitte gib zuerst deine E-Mail-Adresse ein."
      );
      return;
    }

    setForgotPasswordBusy(true);
    setForgotPasswordMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        {
          redirectTo: window.location.origin
        }
      );

      if (error) throw error;

      setForgotPasswordMessage(
        "Wenn diese E-Mail-Adresse registriert ist, wurde ein Link zum Zurücksetzen des Passworts gesendet."
      );
    } catch (error) {
      setForgotPasswordMessage(
        error.message ||
          "Der Link konnte nicht angefordert werden."
      );
    } finally {
      setForgotPasswordBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "register") {
        if (!displayName.trim()) {
          throw new Error(
            "Bitte einen Anzeigenamen eingeben."
          );
        }

        if (!emailConfirmed) {
          throw new Error(
            "Bitte bestätige, dass deine E-Mail-Adresse korrekt ist."
          );
        }

        const { data, error } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                display_name: displayName.trim()
              }
            }
          });

        // Supabase kann bei einer bereits registrierten E-Mail
        // absichtlich keinen normalen "duplicate"-Fehler zurückgeben.
        // In diesem Fall ist identities leer.
        if (
          !error &&
          data?.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        ) {
          setShowAlreadyRegisteredModal(true);
          return;
        }

        if (error) {
          const errorText = String(error.message || "").toLowerCase();

          if (
            errorText.includes("already registered") ||
            errorText.includes("already exists") ||
            errorText.includes("user already registered") ||
            errorText.includes("email address already") ||
            errorText.includes("duplicate")
          ) {
            setShowAlreadyRegisteredModal(true);
            return;
          }

          throw error;
        }

        setShowVerificationModal(false);
        setMessage(
          "✅ Konto erstellt. Du kannst dich jetzt direkt anmelden."
        );
        setMode("login");
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
          });
    setEmailUnconfirmed(
      !!error && /confirm|verified|verification/i.test(error.message || "")
    );


        if (error) {
          setShowLoginErrorModal(true);
          return;
        }
      }
    } catch (err) {
      setMessage(
        err.message ||
          "Es ist ein Fehler aufgetreten."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="auth-shell"
      style={{
        minHeight: "100vh",
        background: "#f5f3f8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowX: "hidden",
        overflowY: "auto",
        padding: 0
      }}
    >
      <div
        style={{
          width: "100%",
          flexShrink: 0,
          lineHeight: 0
        }}
      >
        <img
          src={LOGIN_BACKGROUND_URL}
          onError={e => {
            if (e.currentTarget.dataset.fallbackApplied !== "1") {
              e.currentTarget.dataset.fallbackApplied = "1";
              e.currentTarget.src = "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/tanzpartnerboerse_og.png";
            }
          }}
          alt="Dein Workshop-Tanzsonntag in der Hazienda"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            objectFit: "contain",
            objectPosition: "center top"
          }}
        />
      </div>

      <style>{`
        /* Startseite: ruhige weiße Kacheln, nur dezente farbige Ränder */
        .home-simple-list .home-wide-tile {
          background: #fff !important;
          border: 1.5px solid #e2d7f2;
          box-shadow: 0 3px 12px rgba(45,35,70,.045);
          min-height: 100px;
        }
        .home-simple-list .home-wide-tile:nth-child(1) {
          border-color: #d8c2f5;
        }
        .home-simple-list .home-wide-tile:nth-last-child(1) {
          border-color: #c7dcf7;
        }
        .home-simple-list .home-wide-icon {
          background: #fff !important;
        }
        .home-my-workshops-tile {
          min-height: 60px !important;
          height: 60px !important;
          box-sizing: border-box;
          border: 1.5px solid #d8c2f5 !important;
          border-radius: 17px !important;
          background: #fff !important;
          box-shadow: 0 3px 12px rgba(45,35,70,.045);
        }
        .home-my-workshops-tile .home-wide-icon {
          background: #fff !important;
          width: 42px !important; height: 42px !important; min-width: 42px !important;
        }
        .home-my-workshops-tile.is-open { height: auto !important; }

        .peter-bettina-brand {
          letter-spacing: 0.01em;
        }

        @media (max-width: 420px) {
          .peter-bettina-brand {
            font-size: clamp(30px, 8.5vw, 38px) !important;
          }
        }
        .auth-email-unconfirmed {
          margin: 10px 0 12px;
          padding: 12px;
          border: 1.5px solid #f59e0b;
          border-radius: 15px;
          background: #fff7ed;
          text-align: left;
        }
        .auth-email-unconfirmed-title {
          color: #ea580c;
          font-size: 15px;
          font-weight: 900;
          line-height: 1.2;
        }
        .auth-email-unconfirmed-text {
          margin-top: 5px;
          color: #5f5a68;
          font-size: 12px;
          line-height: 1.35;
        }
        .auth-email-resend {
          margin-top: 9px;
          width: 100%;
          border: 0;
          border-radius: 12px;
          padding: 9px 10px;
          background: #f97316;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .auth-email-resend:disabled {
          opacity: .65;
        }
        .auth-email-resend-message {
          margin-top: 7px;
          color: #6b7280;
          font-size: 11px;
          line-height: 1.3;
        }
        /* Professionelles Admin-Menü: klare Hierarchie, kompakte Zeilen, weißer Hintergrund */
        .admin-menu-main {
          height: 60px !important;
          min-height: 60px !important;
          max-height: 60px !important;
          box-sizing: border-box !important;
          background: #fff !important;
          border-radius: 15px !important;
          padding: 6px 12px !important;
          box-shadow: 0 2px 7px rgba(40,30,65,.035) !important;
          overflow: hidden !important;
        }
        .admin-menu-main > div {
          min-width: 0;
        }
        .admin-menu-main .admin-menu-title {
          font-size: 15.5px !important;
          line-height: 1.05 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .admin-menu-main .admin-menu-subtitle {
          font-size: 10.5px !important;
          line-height: 1.05 !important;
          margin-top: 3px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .admin-menu-main .admin-menu-icon {
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          border-radius: 11px !important;
          background: #fff !important;
          font-size: 20px !important;
        }
        .admin-event-sub {
          height: 46px !important;
          min-height: 46px !important;
          box-sizing: border-box !important;
          background: #fff !important;
          border: 1px solid #e5dcef !important;
          border-radius: 11px !important;
          padding: 5px 10px !important;
          box-shadow: none !important;
        }
        .admin-event-sub span {
          font-size: 13px;
        }
        .admin-secondary-list {
          background: #fff !important;
          border: 1px solid #e5e0ea !important;
          border-radius: 15px !important;
          overflow: hidden !important;
        }
        .admin-secondary-row {
          width: 100% !important;
          height: 46px !important;
          min-height: 46px !important;
          max-height: 46px !important;
          box-sizing: border-box !important;
          border: 0 !important;
          border-bottom: 1px solid #eeeaf1 !important;
          border-radius: 0 !important;
          background: #fff !important;
          padding: 5px 12px !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          overflow: hidden !important;
        }
        .admin-secondary-row:last-child { border-bottom: 0 !important; }
        .admin-secondary-row .admin-row-label {
          font-size: 12.5px !important;
          line-height: 1 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .admin-secondary-row .admin-row-icon {
          width: 24px !important;
          min-width: 24px !important;
          text-align: center !important;
          font-size: 18px !important;
        }
        .admin-secondary-row .admin-row-action {
          flex: 1 !important;
          min-width: 0 !important;
        }
        .admin-secondary-row .primary {
          flex-shrink: 0 !important;
          padding: 5px 9px !important;
          font-size: 10.5px !important;
          border-radius: 9px !important;
        }
        @media (max-width: 700px) {
          .admin-main-60, .admin-menu-main {
            height: 60px !important;
            min-height: 60px !important;
            max-height: 60px !important;
            background: #fff !important;
          }
          .admin-secondary-45, .admin-secondary-row {
            height: 46px !important;
            min-height: 46px !important;
            max-height: 46px !important;
            background: #fff !important;
          }
        }

        /* Admin-Dashboard: ruhige, professionelle mobile Darstellung */
        .admin-dashboard-sections { margin-bottom: 16px; }
        .admin-top-back { display: none !important; }

        .admin-section-heading { display:flex; align-items:center; gap:9px; margin:0 2px 8px; min-height:22px; }
        .admin-section-heading h3 { margin:0; font-size:18px; line-height:1.1; letter-spacing:-.2px; }
        .admin-section-heading > span { font-size:10.5px; white-space:nowrap; }
        .admin-section-line { height:1px; flex:1; background:#ded9e4; }
        .admin-main-list { display:grid; gap:8px; }
        .admin-menu-main.admin-main-60 {
          width:100%; height:60px; min-height:60px; max-height:60px; box-sizing:border-box;
          display:flex; align-items:center; gap:10px; padding:7px 12px; text-align:left; cursor:pointer;
          background:#fff !important; border:1px solid #ddd8e4; border-left-width:3px; border-radius:12px; overflow:hidden;
          box-shadow:0 1px 2px rgba(30,20,50,.03);
        }
        .admin-card-events { border-left-color:#b83a79 !important; }
        .admin-card-neutral { border-left-color:#7c3aed !important; }
        .admin-card-workshops { border-left-color:#7c3aed !important; }
        .admin-card-matching { border-left-color:#15936c !important; }
        .admin-card-icon { width:34px; height:34px; flex:0 0 34px; display:grid; place-items:center; font-size:19px; border-radius:9px; background:#faf9fc; }
        .admin-card-copy { min-width:0; flex:1; display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
        .admin-card-title { color:#29242e; font-size:15px; line-height:18px; font-weight:850; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .admin-card-subtitle { color:#746d78; font-size:10.5px; line-height:13px; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .admin-card-arrow { flex:0 0 auto; font-size:22px; line-height:1; color:#655d69; margin-left:2px; }
        .admin-card-count { flex:0 0 auto; min-width:24px; text-align:center; font-size:11px; font-weight:850; color:#5b21b6; background:#f1eaff; border-radius:9px; padding:4px 7px; }
        .admin-event-sublist { display:grid; gap:5px; margin:0 0 1px 16px; padding-left:10px; border-left:1px solid #e5dff0; }
        .admin-event-sub { width:100%; height:42px; min-height:42px; box-sizing:border-box; display:flex; align-items:center; gap:9px; padding:6px 10px; border:1px solid #e4dfea; border-radius:9px; background:#fff; color:#302b35; text-align:left; cursor:pointer; font-size:12px; }
        .admin-event-sub strong { flex:1; font-weight:750; }
        .admin-event-sub > span:last-child { color:#716a75; font-size:18px; }
        .admin-secondary-section { margin-top:2px; }
        .admin-secondary-professional { background:#fff; border:1px solid #ddd8e4; border-radius:12px; overflow:hidden; box-shadow:0 1px 2px rgba(30,20,50,.025); }
        .admin-secondary-professional .admin-secondary-row { border:0; border-bottom:1px solid #eeeaf1; border-radius:0; }
        .admin-secondary-professional .admin-secondary-row:last-child { border-bottom:0; }
        .admin-secondary-row.admin-secondary-45 { width:100%; height:46px; min-height:46px; max-height:46px; box-sizing:border-box; display:flex; align-items:center; gap:9px; padding:5px 10px; background:#fff !important; text-align:left; cursor:pointer; }
        .admin-row-icon { width:27px; flex:0 0 27px; text-align:center; font-size:18px; line-height:1; }
        .admin-row-copy { min-width:0; flex:1; display:flex; align-items:center; gap:8px; overflow:hidden; }
        .admin-row-copy strong { color:#302b35; font-size:12.5px; line-height:15px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .admin-row-copy small { color:#807883; font-size:9.5px; line-height:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .admin-row-arrow { flex:0 0 auto; color:#716a75; font-size:20px; line-height:1; }
        .admin-row-badge { flex:0 0 auto; font-size:9.5px; font-weight:850; color:#2563eb; background:#eef5ff; border-radius:8px; padding:4px 6px; white-space:nowrap; }
        .admin-row-badge.warning { color:#a16207; background:#fff4dc; }
        .admin-row-button { flex:0 0 auto; margin:0 !important; padding:5px 8px !important; font-size:10px !important; border-radius:8px !important; }
        .accent-purple { border-left:3px solid #8b5cf6 !important; }
        .accent-green { border-left:3px solid #31a57b !important; }
        .accent-blue { border-left:3px solid #4d83d9 !important; }
        @media (max-width:700px) {
          .admin-dashboard-sections { margin-bottom:14px; }
          .admin-main-list { gap:7px; }
          .admin-menu-main.admin-main-60 { height:60px !important; min-height:60px !important; max-height:60px !important; }
          .admin-card-title { font-size:14px; }
          .admin-card-subtitle { font-size:10px; }
          .admin-secondary-row.admin-secondary-45 { height:46px !important; min-height:46px !important; max-height:46px !important; }
        }

        /* Admin v185 – einheitliches, kompaktes mobiles Bedienkonzept */
        .admin-registration-panel { display:grid; gap:8px; width:100%; box-sizing:border-box; }
        .admin-action-card, .admin-workshop-card, .admin-report-card { background:#fff; border:1px solid #e2dce9; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(50,35,70,.035); box-sizing:border-box; }
        .admin-registration-panel button, .admin-registration-panel input, .admin-registration-panel select { box-sizing:border-box; }
        /* v190: force compact mobile registration UI even if global button styles are present */
        .admin-registration-panel .admin-action-card { margin:0 !important; padding:0 !important; border:1px solid #e5dff0 !important; border-radius:14px !important; background:#fff !important; box-shadow:none !important; }
        .admin-registration-panel .admin-action-toggle { width:100% !important; min-height:52px !important; height:52px !important; margin:0 !important; padding:7px 10px !important; border:0 !important; border-radius:0 !important; background:#fff !important; color:#29242e !important; display:flex !important; align-items:center !important; gap:9px !important; font:inherit !important; text-align:left !important; line-height:normal !important; }
        .admin-registration-panel .admin-action-toggle strong { font-size:14px !important; line-height:16px !important; font-weight:900 !important; }
        .admin-registration-panel .admin-action-toggle small { display:block !important; font-size:10px !important; line-height:12px !important; color:#746d78 !important; }
        .admin-registration-panel .admin-action-icon { width:30px !important; height:30px !important; flex:0 0 30px !important; font-size:16px !important; }
        .admin-registration-panel .admin-workshop-card { margin:0 !important; padding:0 !important; border:1px solid #e2dce9 !important; border-radius:11px !important; background:#fff !important; box-shadow:none !important; }
        .admin-registration-panel .admin-workshop-summary { width:100% !important; min-height:48px !important; height:auto !important; margin:0 !important; padding:6px 8px !important; border:0 !important; border-radius:0 !important; background:#fff !important; color:#29242e !important; display:grid !important; grid-template-columns:minmax(0,1fr) auto auto !important; align-items:center !important; gap:6px !important; font:inherit !important; text-align:left !important; line-height:normal !important; }
        .admin-registration-panel .admin-workshop-summary-main { min-width:0 !important; display:flex !important; flex-direction:column !important; gap:1px !important; }
        .admin-registration-panel .admin-workshop-summary-main strong { display:block !important; min-width:0 !important; overflow:visible !important; text-overflow:clip !important; white-space:normal !important; overflow-wrap:anywhere !important; color:#3f236f !important; font-size:15px !important; line-height:19px !important; font-weight:900 !important; }
        .admin-registration-panel .admin-workshop-summary-main small { display:block !important; color:#53616c !important; font-size:12px !important; line-height:16px !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important; overflow-wrap:anywhere !important; }
        .admin-registration-panel .admin-workshop-count { font-size:11px !important; line-height:14px !important; padding:5px 7px !important; border-radius:9px !important; white-space:normal !important; text-align:center !important; background:#e6f4ff !important; color:#175985 !important; max-width:105px !important; }
        .admin-registration-panel .admin-chevron { font-size:17px !important; line-height:1 !important; }
        .admin-registration-panel .admin-workshop-details { padding:6px 8px 8px !important; }
        .admin-registration-panel .admin-participant-summary { min-height:42px !important; height:auto !important; padding:8px 9px !important; font-size:13px !important; line-height:17px !important; }
        .admin-registration-panel .admin-participant-details { padding:10px !important; font-size:12px !important; line-height:17px !important; }
        .admin-registration-panel .admin-workshop-card { border-left:5px solid #8b5cf6 !important; }
        .admin-registration-panel .admin-workshop-card:nth-of-type(3n + 1) { border-left-color:#31a57b !important; }
        .admin-registration-panel .admin-workshop-card:nth-of-type(3n + 2) { border-left-color:#4d91c6 !important; }
        .admin-registration-panel .admin-workshop-card:nth-of-type(3n) { border-left-color:#8b5cf6 !important; }
        .admin-registration-panel .admin-workshop-card.is-open { box-shadow:0 5px 16px rgba(61,93,115,.09) !important; }
        .matching-seekers-panel { box-shadow:0 4px 14px rgba(49,165,123,.08) !important; }
        .matching-external-panel { box-shadow:0 4px 14px rgba(77,145,198,.09) !important; }
        .admin-sent-messages-card { box-shadow:0 4px 14px rgba(77,145,198,.08) !important; }
        @media (max-width:560px) {
          .admin-registration-panel { gap:5px !important; }
          .admin-registration-panel .admin-workshop-summary { grid-template-columns:minmax(0,1fr) auto auto !important; min-height:66px !important; height:auto !important; padding:9px 10px !important; gap:7px !important; }
          .admin-registration-panel .admin-workshop-summary-main strong { font-size:14.5px !important; line-height:18px !important; }
          .admin-registration-panel .admin-workshop-summary-main small { font-size:11.5px !important; line-height:15px !important; }
          .admin-registration-panel .admin-workshop-count { font-size:10px !important; line-height:13px !important; max-width:84px !important; }
        }
        .admin-action-toggle, .admin-workshop-summary, .admin-report-summary { width:100%; border:0; background:transparent; color:#29242e; display:flex; align-items:center; gap:9px; text-align:left; cursor:pointer; box-sizing:border-box; }
        .admin-action-toggle { min-height:58px; padding:8px 11px; }
        .admin-action-icon { width:32px; height:32px; flex:0 0 32px; display:grid; place-items:center; border-radius:9px; background:#f0e9ff; font-size:17px; }
        .admin-action-copy, .admin-workshop-summary-main, .admin-report-summary > span:first-child { min-width:0; flex:1; display:flex; flex-direction:column; gap:2px; }
        .admin-action-copy strong, .admin-workshop-summary-main strong { font-size:14px; line-height:17px; font-weight:900; }
        .admin-action-copy small, .admin-workshop-summary-main small { color:#756d7b; font-size:10.5px; line-height:13px; }
        .admin-chevron { flex:0 0 auto; color:#6d28d9; font-size:21px; line-height:1; font-weight:800; }
        .admin-action-body { padding:10px 11px 12px; border-top:1px solid #eeeaf2; background:#fcfbff; }
        .admin-two-col { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .admin-two-col > div { min-width:0; }
        .admin-two-col input, .admin-two-col select { width:100%; min-width:0; }
        .admin-workshop-summary { min-height:64px; padding:9px 11px; }
        .admin-workshop-summary-main strong { color:#4c1d95; }
        .admin-workshop-count { flex:0 0 auto; color:#5b21b6; background:#f1eaff; border-radius:9px; padding:4px 6px; font-size:9.5px; font-weight:900; white-space:nowrap; }
        .admin-workshop-details { padding:8px 11px 11px; border-top:1px solid #eeeaf2; background:#faf8fd; }
        .admin-detail-line { color:#5f5667; font-size:11px; margin-bottom:7px; }
        .admin-participant-list { background:#fff; border:1px solid #e8e1ef; border-radius:11px; overflow:hidden; }
        .admin-participant-row + .admin-participant-row { border-top:1px solid #eeeaf2; }
        .admin-participant-summary { width:100%; min-height:40px; padding:7px 9px; border:0; background:#fff; display:flex; align-items:center; justify-content:space-between; gap:8px; text-align:left; cursor:pointer; font-size:12px; }
        .admin-participant-summary span { color:#6d28d9; font-size:17px; }
        .admin-participant-details { padding:8px 9px 10px; background:#fcfbff; border-top:1px solid #eeeaf2; font-size:11px; line-height:1.4; }
        .admin-report-card { margin-bottom:7px; border-left:4px solid #16a34a; }
        .admin-report-card.is-pending { border-left-color:#f59e0b; }
        .admin-report-summary { min-height:60px; padding:8px 10px; }
        .admin-report-summary strong { font-size:13px; }
        .admin-report-summary small { color:#746d78; font-size:10px; line-height:13px; }
        @media (max-width:560px) {
          .admin-two-col { grid-template-columns:1fr; gap:7px; }
          .admin-action-toggle { min-height:52px; padding:7px 9px; }
          .admin-action-copy strong { font-size:13px; }
          .admin-action-copy small { font-size:10px; }
          .admin-workshop-summary { min-height:58px; padding:7px 9px; }
          .admin-workshop-count { font-size:9px; padding:3px 5px; }
          .admin-participant-summary { min-height:38px; font-size:11.5px; }
          .admin-action-body { padding:9px; }
        }

        .admin-report-details { padding:10px; border-top:1px solid #eeeaf2; background:#fcfbff; font-size:12px; line-height:1.45; }
        .admin-report-detail-box { margin-top:8px; padding:9px; border-radius:9px; background:#f6f4f8; }
        @media (max-width:700px) {
          .admin-two-col { grid-template-columns:1fr; }
          .admin-workshop-summary { min-height:60px; }
          .admin-workshop-count { font-size:8.5px; padding:4px 5px; }
          .admin-action-copy small, .admin-workshop-summary-main small { font-size:9.5px; }
        }

        /* Admin v182: klarere Gruppen und ruhigere mobile Informationshierarchie */
        .admin-secondary-group-heading {
          display:flex; align-items:center; gap:7px;
          min-height:28px; padding:6px 10px 5px;
          background:#f8f5fc; border-bottom:1px solid #eeeaf1;
          color:#5b5262; font-size:10px; line-height:13px;
          font-weight:900; letter-spacing:.03em; text-transform:uppercase;
        }
        .admin-secondary-group-heading span:first-child { font-size:14px; line-height:1; }
        .admin-secondary-group-heading span:last-child { opacity:.72; }
        .admin-secondary-group-heading + .admin-secondary-row { border-top:0 !important; }
        .admin-stats-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:7px; }
        .admin-stat-tile { min-width:0; border-radius:11px; padding:5px 2px 6px; text-align:center; box-sizing:border-box; }
        .admin-dashboard .admin-main-list { gap:7px; }
        .admin-dashboard .admin-event-sublist { margin-bottom:0; }
        .admin-dashboard .admin-secondary-section { margin-top:0; }
        @media (max-width:700px) {
          .admin-stats-grid { gap:5px; }
          .admin-stat-tile { border-radius:10px; padding:5px 2px 5px; }
          .admin-stat-tile .admin-stat-value { font-size:16px !important; }
          .admin-stat-tile .admin-stat-label { font-size:7.8px !important; }
          .admin-stat-tile .admin-stat-sub { font-size:6.8px !important; }
          .admin-secondary-group-heading { min-height:27px; padding:5px 9px 4px; }
        }

        /* Kompakte Detailseiten: zuerst Übersicht, Details erst beim Öffnen */
        .admin-workshop-management [data-workshop-admin-section] {
          min-height:0 !important;
          padding:10px 12px !important;
          margin-bottom:7px !important;
          border-radius:13px !important;
        }
        .admin-workshop-management [data-workshop-admin-section] > div:first-child {
          width:40px !important; height:40px !important; border-radius:11px !important; font-size:21px !important;
        }
        .admin-workshop-management [data-workshop-admin-section] > div:nth-child(2) > div:first-child { font-size:15px !important; }
        .admin-workshop-management [data-workshop-admin-section] > div:nth-child(2) > div:last-child { font-size:10.5px !important; line-height:13px !important; }
        .admin-workshop-management .profile-card { border-radius:13px !important; padding:12px !important; }
        .admin-workshop-management .profile-card h3 { font-size:15px !important; }
        .admin-workshop-management .profile-card p { font-size:11px !important; line-height:1.4 !important; }
        .admin-messages-page .card, .admin-matching-page .card, .admin-participant-page .card, .admin-reports-page .card { border-radius:13px !important; }
        .admin-participant-page .profile-card { padding:10px 12px !important; margin-bottom:7px !important; }
        .admin-participant-page .profile-card h3 { margin:0 !important; font-size:14px !important; }
        .admin-reports-page .profile-card { padding:12px !important; }

      `}</style>

      <div
        className="auth-card"
        style={{
          width: "min(88%, 770px)",
          marginTop: "-22px",
          marginBottom: "30px",
          position: "relative",
          zIndex: 2,
          boxSizing: "border-box"
        }}
      >
        <div
          className="peter-bettina-brand"
          style={{
            fontFamily:
              '"Brush Script MT", "Segoe Script", "URW Chancery L", cursive',
            fontSize: "clamp(34px, 8vw, 64px)",
            lineHeight: 1.05,
            color: "#6f35d9",
            textAlign: "center",
            whiteSpace: "normal",
            overflowWrap: "break-word",
            wordBreak: "normal",
            padding: "0 8px",
            margin: "0 auto 6px",
            maxWidth: "100%",
            boxSizing: "border-box"
          }}
        >
        </div>

        <p className="muted">
          Finde deinen Tanzpartner für die Workshops
        </p>

        <div className="tabs">
          <button
            type="button"
            className={
              mode === "login" ? "active" : ""
            }
            onClick={() => {
              setMode("login");
              setEmailConfirmed(false);
            }}
          >
            Anmelden
          </button>

          <button
            type="button"
            className={
              mode === "register" ? "active" : ""
            }
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
          >
            Registrieren
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Anzeigename

              <input
                value={displayName}
                onChange={e =>
                  setDisplayName(e.target.value)
                }
                placeholder="z. B. Alex"
                required
              />
            </label>
          )}

          <label>
            E-Mail

            <input
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (emailConfirmed) setEmailConfirmed(false);
              }}
              placeholder="name@beispiel.de"
              required
            />
          </label>

          {mode === "register" && (
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                margin: "-2px 0 14px",
                padding: "10px 12px",
                borderRadius: 12,
                background: "#f5fbf7",
                border: "1px solid #d5eadb",
                color: "#356247",
                fontSize: 13,
                lineHeight: 1.35,
                cursor: "pointer"
              }}
            >
              <input
                type="checkbox"
                checked={emailConfirmed}
                onChange={e => setEmailConfirmed(e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  margin: "1px 0 0",
                  flexShrink: 0,
                  accentColor: "#35a85a"
                }}
              />
              <span>
                <strong>Ich bestätige, dass diese E-Mail-Adresse korrekt ist.</strong>
                <br />
                Bitte prüfe die Adresse vor dem Erstellen des Kontos.
              </span>
            </label>
          )}

          <label>
            Passwort

                    {mode === "login" && emailUnconfirmed && (
          <div className="auth-email-unconfirmed">
            <div className="auth-email-unconfirmed-title">📧 E-Mail noch nicht bestätigt</div>
            <div className="auth-email-unconfirmed-text">
              Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir per E-Mail geschickt haben.
              Prüfe gegebenenfalls auch deinen <strong>Spam-Ordner</strong>.
            </div>
            <button
              type="button"
              className="auth-email-resend"
              onClick={resendConfirmationEmail}
              disabled={resendBusy}
            >
              {resendBusy ? "⏳ Wird gesendet..." : "📧 Bestätigungs-Mail erneut senden"}
            </button>
            {resendMessage && (
              <div className="auth-email-resend-message">{resendMessage}</div>
            )}
          </div>
        )}

<div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e =>
                  setPassword(e.target.value)
                }
                placeholder="Mindestens 6 Zeichen"
                required
                minLength="6"
                style={{ paddingRight: "54px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  padding: "8px",
                  margin: 0,
                  cursor: "pointer",
                  fontSize: "21px",
                  lineHeight: 1,
                  color: "#666"
                }}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </label>

          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                setForgotPasswordMessage("");
                setShowForgotPasswordModal(true);
              }}
              style={{
                border: 0,
                background: "transparent",
                padding: "0",
                margin: "-4px 0 14px",
                color: "#6f35d9",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                textAlign: "left",
                alignSelf: "flex-start"
              }}
            >
              Passwort vergessen?
            </button>
          )}

          <button
            className="primary wide"
            disabled={busy}
          >
            {busy
              ? "Bitte warten…"
              : mode === "login"
              ? "Anmelden"
              : "Konto erstellen"}
          </button>
        </form>

        {message && (
          <div className="notice">{message}</div>
        )}

        {showForgotPasswordModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-password-modal-title"
            onClick={() => setShowForgotPasswordModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(30, 20, 45, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 12px",
              boxSizing: "border-box"
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 520,
                background: "#fff",
                borderRadius: 24,
                padding: "26px 24px 24px",
                boxSizing: "border-box",
                boxShadow: "0 18px 60px rgba(30,20,45,.25)"
              }}
            >
              <h3
                id="forgot-password-modal-title"
                style={{ margin: "0 0 10px", fontSize: 24 }}
              >
                Passwort vergessen?
              </h3>

              <p
                className="muted"
                style={{ margin: "0 0 18px", lineHeight: 1.5 }}
              >
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link,
                mit dem du ein neues Passwort festlegen kannst.
              </p>

              <label>
                E-Mail

                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@beispiel.de"
                  autoFocus
                />
              </label>

              {forgotPasswordMessage && (
                <div
                  className="notice"
                  style={{ marginTop: 14, lineHeight: 1.45 }}
                >
                  {forgotPasswordMessage}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 18,
                  flexWrap: "wrap"
                }}
              >
                <button
                  type="button"
                  className="primary"
                  onClick={sendPasswordReset}
                  disabled={forgotPasswordBusy}
                  style={{ flex: "1 1 220px" }}
                >
                  {forgotPasswordBusy
                    ? "Wird gesendet…"
                    : "Link senden"}
                </button>

                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowForgotPasswordModal(false)}
                  disabled={forgotPasswordBusy}
                  style={{ flex: "1 1 140px" }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {showVerificationModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="verification-modal-title"
            onClick={() => setShowVerificationModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(30, 20, 45, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 12px",
              boxSizing: "border-box"
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "520px",
                background: "#fff",
                borderRadius: 12,
                padding: "28px 24px 24px",
                boxSizing: "border-box",
                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                textAlign: "left"
              }}
            >
              <button
                type="button"
                aria-label="Fenster schließen"
                onClick={() => setShowVerificationModal(false)}
                style={{
                  float: "right",
                  border: "none",
                  background: "transparent",
                  fontSize: "28px",
                  lineHeight: 1,
                  color: "#777",
                  cursor: "pointer",
                  padding: "0 4px"
                }}
              >
                ×
              </button>

              <div
                style={{
                  fontSize: "38px",
                  marginBottom: "8px"
                }}
              >
                📧
              </div>

              <h2
                id="verification-modal-title"
                style={{
                  margin: "0 0 16px",
                  color: "#4f249e",
                  fontSize: "24px"
                }}
              >
                E-Mail-Adresse bestätigen
              </h2>

              <p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: 1.55 }}>
                <strong>Fast geschafft! 🎉</strong>
              </p>

              <p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: 1.55 }}>
                Wir haben dir eine Verifizierungs-E-Mail an deine angegebene
                E-Mail-Adresse geschickt.
              </p>

              <p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: 1.55 }}>
                👉 Bitte öffne die E-Mail und klicke auf den
                <strong> Bestätigungslink</strong>.
              </p>

              <p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: 1.55 }}>
                Erst danach kannst du dich vollständig anmelden und die
                Tanzpartnerbörse nutzen.
              </p>

              <p style={{ margin: "0 0 22px", fontSize: "14px", lineHeight: 1.5, color: "#666" }}>
                Keine E-Mail erhalten? Bitte prüfe auch deinen Spam- oder
                Junk-Ordner.
              </p>

              <button
                type="button"
                className="primary wide"
                onClick={() => setShowVerificationModal(false)}
              >
                OK – verstanden
              </button>
            </div>
          </div>
        )}

        {showLoginErrorModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-error-modal-title"
            onClick={() => setShowLoginErrorModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10001,
              background: "rgba(30, 20, 45, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 12px",
              boxSizing: "border-box"
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "520px",
                background: "#fff",
                borderRadius: 12,
                padding: "28px 24px 24px",
                boxSizing: "border-box",
                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                textAlign: "left"
              }}
            >
              <button
                type="button"
                aria-label="Fenster schließen"
                onClick={() => setShowLoginErrorModal(false)}
                style={{
                  float: "right",
                  border: "none",
                  background: "transparent",
                  fontSize: "28px",
                  lineHeight: 1,
                  color: "#777",
                  cursor: "pointer",
                  padding: "0 4px"
                }}
              >
                ×
              </button>

              <div style={{ fontSize: "38px", marginBottom: "8px" }}>
                ⚠️
              </div>

              <h2
                id="login-error-modal-title"
                style={{
                  margin: "0 0 16px",
                  color: "#4f249e",
                  fontSize: "24px"
                }}
              >
                Anmeldung nicht möglich
              </h2>

              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "16px",
                  lineHeight: 1.55
                }}
              >
                E-Mail-Adresse oder Passwort sind nicht korrekt.
              </p>

              <p
                style={{
                  margin: "0 0 22px",
                  fontSize: "16px",
                  lineHeight: 1.55
                }}
              >
                Bitte überprüfe deine Eingaben. <strong>Noch nicht registriert?</strong>
                Dann kannst du jetzt kostenlos ein Konto erstellen.
              </p>

              <button
                type="button"
                className="primary wide"
                onClick={() => {
                  setShowLoginErrorModal(false);
                  setMode("register");
                  setMessage("");
                  setPassword("");
                }}
              >
                Jetzt registrieren
              </button>

              <button
                type="button"
                onClick={() => setShowLoginErrorModal(false)}
                style={{
                  width: "100%",
                  marginTop: "10px",
                  border: "none",
                  background: "transparent",
                  color: "#6f35d9",
                  fontWeight: 700,
                  fontSize: "16px",
                  padding: "10px",
                  cursor: "pointer"
                }}
              >
                Erneut versuchen
              </button>
            </div>
          </div>
        )}

        {showAlreadyRegisteredModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="already-registered-modal-title"
            onClick={() => setShowAlreadyRegisteredModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              background: "rgba(30, 20, 45, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 12px",
              boxSizing: "border-box"
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "520px",
                background: "#fff",
                borderRadius: 12,
                padding: "28px 24px 24px",
                boxSizing: "border-box",
                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                textAlign: "left"
              }}
            >
              <button
                type="button"
                aria-label="Fenster schließen"
                onClick={() => setShowAlreadyRegisteredModal(false)}
                style={{
                  float: "right",
                  border: "none",
                  background: "transparent",
                  fontSize: "28px",
                  lineHeight: 1,
                  color: "#777",
                  cursor: "pointer",
                  padding: "0 4px"
                }}
              >
                ×
              </button>

              <div
                style={{
                  fontSize: "38px",
                  marginBottom: "8px"
                }}
              >
                ⚠️
              </div>

              <h2
                id="already-registered-modal-title"
                style={{
                  margin: "0 0 16px",
                  color: "#4f249e",
                  fontSize: "24px"
                }}
              >
                Bereits registriert
              </h2>

              <p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: 1.55 }}>
                Diese E-Mail-Adresse ist bereits bei der Tanzpartnerbörse
                registriert.
              </p>

              <p style={{ margin: "0 0 22px", fontSize: "16px", lineHeight: 1.55 }}>
                Bitte gehe zur <strong>Anmeldung</strong> und melde dich dort
                mit deinen Zugangsdaten an.
              </p>

              <button
                type="button"
                className="primary wide"
                onClick={() => {
                  setShowAlreadyRegisteredModal(false);
                  setMode("login");
                  setMessage("");
                  setPassword("");
                }}
              >
                Zur Anmeldung
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatEventDateTime(iso) {
  if (!iso) return { date: "Termin wird noch bekannt gegeben", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "Termin wird noch bekannt gegeben", time: "" };
  return {
    date: new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(d),
    time: new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d) + " Uhr"
  };
}

const ORIGINAL_EVENT_TABLE_TEMPLATE = [
  // Originalvorlage aus dem aktuellen Referenz-Event:
  // gleiche Tischanordnung, kompaktere Außenränder und kein unnötiger Leerraum
  // unterhalb der letzten Tischreihe. Tisch 2 hat 8 Plätze, Tisch 16 hat 4.
  { table: 1,  x: 9.2,  y: 15.0, seats: 6 },
  { table: 2,  x: 21.5, y: 15.0, seats: 8 },
  { table: 3,  x: 34.1, y: 15.0, seats: 6 },
  { table: 4,  x: 46.0, y: 15.0, seats: 6 },
  { table: 6,  x: 58.1, y: 15.0, seats: 6 },
  { table: 8,  x: 70.5, y: 15.0, seats: 6 },
  { table: 10, x: 82.1, y: 15.0, seats: 6 },

  { table: 5,  x: 39.2, y: 35.0, seats: 6 },
  { table: 7,  x: 52.0, y: 35.5, seats: 6 },
  { table: 9,  x: 66.3, y: 35.5, seats: 6 },
  { table: 11, x: 78.9, y: 35.0, seats: 6 },

  { table: 13, x: 80.0, y: 53.5, seats: 6 },
  { table: 14, x: 93.0, y: 52.5, seats: 6 },
  { table: 15, x: 92.3, y: 71.3, seats: 6 },
  { table: 16, x: 92.6, y: 88.0, seats: 4 },

  { table: 17, x: 8.0,  y: 53.0, seats: 6 },
  { table: 18, x: 8.0,  y: 73.0, seats: 6 }
];

function buildOriginalEventSeatTemplate(eventId) {
  const rows = [];
  let sort = 0;
  const angles6 = [-90, -30, 30, 90, 150, 210];
  const angles4 = [-90, 0, 90, 180];
  const angles8 = [-90, -45, 0, 45, 90, 135, 180, 225];
  for (const table of ORIGINAL_EVENT_TABLE_TEMPLATE) {
    const angles = table.seats === 4 ? angles4 : table.seats === 8 ? angles8 : angles6;
    const radiusX = table.seats === 4 ? 4.0 : 4.4;
    const radiusY = table.seats === 4 ? 4.0 : 4.4;
    angles.forEach((deg, index) => {
      const rad = deg * Math.PI / 180;
      rows.push({
        event_id: eventId,
        label: `Tisch ${table.table} · Platz ${index + 1}`,
        capacity: 1,
        x: Number((table.x + Math.cos(rad) * radiusX).toFixed(3)),
        y: Number((table.y + Math.sin(rad) * radiusY).toFixed(3)),
        width: 3.2,
        height: 3.2,
        shape: "round",
        sort_order: sort++
      });
    });
  }
  return rows;
}
function groupEventSeatsByTable(seats) {
  const groups = new Map();
  (seats || []).forEach(seat => {
    const match = String(seat.label || "").match(/^(Tisch\s+\d+)/i);
    const key = match ? match[1] : String(seat.label || "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(seat);
  });
  return Array.from(groups.entries());
}

const DEFAULT_PLAN_OBJECTS = [
  // Ausstattung aus dem Referenz-Event – künftig ebenfalls Bestandteil der Originalvorlage.
  { id: "default-entrance", type: "facility", label: "Eingang", emoji: "🚪", x: 1, y: 3.22, width: 11.95, height: 9.67, rotation: 0, sort_order: 10 },
  { id: "default-cash", type: "facility", label: "Kasse", emoji: "💶", x: 1.38, y: 41.44, width: 11.95, height: 8.85, rotation: 0, sort_order: 11 },
  { id: "default-stage", type: "stage", label: "Bühne", emoji: "", x: 47.96, y: 99, width: 53.07, height: 10.63, rotation: 0, sort_order: 12 },
  { id: "default-plant", type: "plant", label: "Palme", emoji: "🌴", x: 92.3, y: 16.41, width: 7, height: 8, rotation: 0, sort_order: 13 },
  { id: "default-window", type: "window", label: "FENSTERFRONT", emoji: "", x: 45.71, y: 1, width: 70, height: 6, rotation: 0, sort_order: 14 },
  { id: "default-toilet", type: "facility", label: "Toilette", emoji: "🚻", x: 5.81, y: 30.22, width: 3, height: 3, rotation: 0, sort_order: 15 },
  { id: "default-tree", type: "plant", label: "Baum", emoji: "🌳", x: 93.57, y: 15.45, width: 10, height: 10, rotation: 0, sort_order: 16 }
];

// v64: optimierter veröffentlichter Saalplan – große virtuelle Fläche, runde Sitzplätze ohne Überlappung, freies Pan
function EventSeatPlan({
  seats,
  selectedSeatId,
  selectedSeatIds = [],
  multiSelect = false,
  onSelect,
  disabled = false,
  compact = false,
  editable = false,
  onTableMove = null,
  onTableDelete = null,
  planObjects = [],
  onObjectMove = null,
  onObjectResize = null,
  onObjectDelete = null,
  symbolLibrary = [],
  onAddSymbol = null
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const suppressClickRef = useRef(false);
  const [tableDragging, setTableDragging] = useState(null);
  const [tableDragPreview, setTableDragPreview] = useState(null);
  const [objectDragging, setObjectDragging] = useState(null);
  const [objectDragPreview, setObjectDragPreview] = useState(null);
  const [objectResizing, setObjectResizing] = useState(null);
  const [objectResizePreview, setObjectResizePreview] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef(null);
  const tableDragRef = useRef(null);
  const objectDragRef = useRef(null);
  const objectResizeRef = useRef(null);
  const viewportRef = useRef(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateSize);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  function clampZoom(value) { return Math.min(2.4, Math.max(0.4, Number(value) || 1)); }
  // Die veröffentlichte Ansicht verwendet bewusst eine deutlich größere
  // Saalplan-Zeichenfläche. Bei 100 % entspricht die Grundgröße ungefähr
  // der bisherigen Darstellung bei 160 %, sodass der Plan im Hochformat
  // nicht gequetscht wird. Der sichtbare Bereich ist nur ein Fenster auf
  // diese Fläche und kann per Finger in alle Richtungen verschoben werden.
  // Veröffentlichter Saalplan: feste virtuelle Arbeitsfläche statt
  // Anpassung an die schmale Handybreite. Dadurch bleibt die Geometrie
  // bei 100 % lesbar und der Plan kann innerhalb des Viewports verschoben werden.
  // v59/v61: Die veröffentlichte Reservierungsansicht braucht eine echte virtuelle
  // Arbeitsfläche, die unabhängig von der Breite des Handys ist. 100 %
  // bedeutet dabei: normale Plan-Größe – nicht "alles in den Viewport quetschen".
  // Die Prozent-Koordinaten der gespeicherten Tische bleiben unverändert.
  const canvasWidth = compact ? 1800 : 1100;
  const canvasHeight = compact ? 1500 : 1300;

  function getPanLimits(forZoom = zoom) {
    const w = viewportSize.width || 0;
    const h = viewportSize.height || 0;
    const scaledW = canvasWidth * forZoom;
    const scaledH = canvasHeight * forZoom;
    // Die veröffentlichte Ansicht arbeitet wie ein echter Karten-/Plan-Viewport.
    // Die große Zeichenfläche kann innerhalb des sichtbaren Fensters in alle
    // Richtungen verschoben werden. Die Begrenzung wird ausschließlich aus
    // der tatsächlichen Canvas-Größe und dem Viewport berechnet.
    return {
      x: Math.max(0, scaledW - w),
      y: Math.max(0, scaledH - h)
    };
  }

  function changeZoom(delta) {
    setZoom(current => {
      const next = clampZoom(current + delta);
      const limits = getPanLimits(next);
      setOffset(prev => ({
        x: Math.max(-limits.x, Math.min(limits.x, prev.x)),
        y: Math.max(-limits.y, Math.min(limits.y, prev.y))
      }));
      return next;
    });
  }
  function resetView() { setZoom(1); setOffset({ x: 0, y: 0 }); }

  function onPointerDown(event) {
    // Im normalen Reservierungsmodus darf der Finger direkt auf einem
    // Sitzplatz starten. Der Viewport übernimmt trotzdem das Pointer-Event
    // und hält es per pointer capture fest. Das ist auf Android deutlich
    // zuverlässiger als eine zusätzliche Mischung aus Pointer- und
    // Touch-Events. Im Admin-Editor behalten die einzelnen Elemente ihre
    // eigenen Drag-Funktionen.
    if (editable && event.target?.closest?.("button,[data-table-drag],[data-plan-object],[data-resize-handle]")) return;
    suppressClickRef.current = false;
    setDragging(true);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
  }
  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
      suppressClickRef.current = true;
    }
    const limits = getPanLimits();
    const maxPanX = limits.x;
    const maxPanY = limits.y;
    const nextX = drag.ox + dx;
    const nextY = drag.oy + dy;
    setOffset({
      x: Math.max(-maxPanX, Math.min(maxPanX, nextX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, nextY))
    });
  }
  function onPointerUp(event) {
    const drag = dragRef.current;
    setDragging(false);
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    // Nach einem echten Wischen darf das anschließende Click-Event keinen
    // Sitzplatz auswählen. Der nächste PointerDown gibt den Status wieder frei.
    if (drag?.moved) {
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  }
  function onWheel(event) {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 0.12 : -0.12);
  }

  function getSeatVisualPosition(seat) {
    const x = Number(seat.x ?? 50);
    const y = Number(seat.y ?? 50);
    const match = String(seat.label || "").match(/^(Tisch\s+\d+)/i);
    if (!match || !viewportSize.width || !viewportSize.height) return { x, y };

    const group = groups.find(([key]) => String(key).toLowerCase() === match[1].toLowerCase())?.[1];
    if (!group?.length) return { x, y };

    // WICHTIG: Die Tischgruppen werden im Editor aus echten Kreiswinkeln
    // erzeugt (4er = 0/90/180/270°, 6er = -90/-30/30/90/150/210°).
    // Im kompakten mobilen Reservierungsplan ist die Zeichenfläche aber
    // nicht gleich breit und hoch. Prozentuale X/Y-Abstände würden dadurch
    // optisch zu einem Oval verzerrt.
    //
    // Deshalb zeichnen wir die Stühle hier wieder über ihren ORIGINALEN
    // Winkel und korrigieren ausschließlich den Y-Radius so, dass der
    // physische Abstand in Pixeln exakt dem X-Radius entspricht.
    // Die gespeicherten Daten/Positionen werden dabei NICHT verändert.
    const center = getTableCenter(group);
    const seatCount = group.length;

    // DIESE Winkel entsprechen der Tisch-Anordnung im Saalplan-Editor.
    // Wichtig: Auch 8er-Tische brauchen ihre vollständige 8er-Geometrie.
    // Die frühere Version hatte nur 4/6 Winkel – dadurch fielen beim
    // 8er-Tisch mehrere Plätze auf denselben Punkt.
    const angles =
      seatCount === 4
        ? [-90, 0, 90, 180]
        : seatCount === 6
          ? [-90, -30, 30, 90, 150, 210]
          : seatCount === 8
            ? [-90, -45, 0, 45, 90, 135, 180, 225]
            : Array.from({ length: seatCount }, (_, i) => -90 + (360 / seatCount) * i);

    const labelMatch = String(seat.label || "").match(/·\s*Platz\s*(\d+)/i);
    const index = labelMatch
      ? Math.max(0, Number(labelMatch[1]) - 1)
      : group.findIndex(s => String(s.seat_id || s.id) === String(seat.seat_id || seat.id));
    const angleDeg = angles[index >= 0 && index < angles.length ? index : 0];
    const rad = angleDeg * Math.PI / 180;

    // Die gespeicherten Prozentkoordinaten können durch die unterschiedliche
    // Breite/Höhe des mobilen Viewports optisch verzerrt sein. Deshalb wird
    // der Radius zuerst in echte Pixel umgerechnet und danach als EIN
    // gemeinsamer physischer Radius wieder auf X/Y verteilt.
    //
    // Dadurch bleibt die Tischgruppe geometrisch rund – unabhängig davon,
    // wie breit oder hoch der Reservierungs-Saalplan auf dem Gerät ist.
    const dxPx = Math.abs(x - center.x) * canvasWidth / 100;
    const dyPx = Math.abs(y - center.y) * canvasHeight / 100;
    const storedRadiusPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

    // Bei einzelnen fehlerhaften/alten Koordinaten nicht deren Verzerrung
    // übernehmen. Der Mittelwert aller Plätze liefert den stabilen Tischradius.
    const radiiPx = group.map(s => {
      const sx = Number(s.x ?? center.x);
      const sy = Number(s.y ?? center.y);
      const sxPx = Math.abs(sx - center.x) * canvasWidth / 100;
      const syPx = Math.abs(sy - center.y) * canvasHeight / 100;
      return Math.sqrt(sxPx * sxPx + syPx * syPx);
    }).filter(r => Number.isFinite(r) && r > 1);

    const averageRadiusPx = radiiPx.length
      ? radiiPx.reduce((sum, r) => sum + r, 0) / radiiPx.length
      : storedRadiusPx;

    // Im veröffentlichten Plan wird der Radius bewusst aus der virtuellen
    // Saalplan-Geometrie genommen. Dadurch bleiben die Sitzplätze auch im
    // Hochformat kreisförmig und haben immer denselben Abstand zum Tisch.
    // Kompakter Sitzradius: Die Stühle rücken näher an den Tisch, ohne dass sich
    // die Plätze bei 6er- oder 8er-Tischen berühren. Die Tischpositionen selbst
    // und damit die Abstände zwischen den Tischen bleiben unverändert.
    const physicalRadius = 44;
    const visualRadiusX = physicalRadius / canvasWidth * 100;
    const visualRadiusY = physicalRadius / canvasHeight * 100;

    return {
      x: center.x + Math.cos(rad) * visualRadiusX,
      y: center.y + Math.sin(rad) * visualRadiusY
    };
  }

  function getTableCenter(group) {
    if (!group?.length) return { x: 50, y: 50, table: null };
    const xs = group.map(s => Number(s.x ?? 50));
    const ys = group.map(s => Number(s.y ?? 50));
    const tableMatch = String(group[0]?.label || "").match(/Tisch\s+(\d+)/i);
    return {
      x: xs.reduce((a,b) => a+b, 0) / xs.length,
      y: ys.reduce((a,b) => a+b, 0) / ys.length,
      table: tableMatch ? Number(tableMatch[1]) : null
    };
  }

  function getObjectStyle(obj, preview) {
    const px = preview?.id === obj.id ? Number(preview.x) : Number(obj.x ?? 50);
    const py = preview?.id === obj.id ? Number(preview.y) : Number(obj.y ?? 50);
    const pw = preview?.id === obj.id ? Number(preview.width) : Number(obj.width ?? 10);
    const ph = preview?.id === obj.id ? Number(preview.height) : Number(obj.height ?? 8);
    return {
      position: "absolute",
      left: `${Math.max(1, Math.min(99, px))}%`,
      top: `${Math.max(1, Math.min(99, py))}%`,
      width: `${Math.max(3, Math.min(80, pw))}%`,
      height: `${Math.max(3, Math.min(45, ph))}%`,
      transform: `translate(-50%, -50%) rotate(${Number(obj.rotation || 0)}deg)`,
      zIndex: obj.type === "window" ? 2 : 10,
      boxSizing: "border-box",
      userSelect: "none",
      WebkitUserSelect: "none",
      touchAction: "none",
      cursor: editable ? (objectDragging?.id === obj.id ? "grabbing" : "grab") : "default"
    };
  }

  const groups = groupEventSeatsByTable(seats);
  const visibleObjects = (planObjects && planObjects.length > 0) ? planObjects : DEFAULT_PLAN_OBJECTS;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="ghost" onClick={() => changeZoom(0.2)}>＋ Vergrößern</button>
          <button type="button" className="ghost" onClick={() => changeZoom(-0.2)}>− Verkleinern</button>
          <button type="button" className="ghost" onClick={resetView}>↩ Zurücksetzen</button>
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted" style={{ fontWeight: 800, minWidth: 58 }}>Zoom {Math.round(zoom * 100)} %</span>
          <input
            type="range"
            min="40"
            max="240"
            step="10"
            value={Math.round(zoom * 100)}
            onChange={e => {
              const next = clampZoom(Number(e.target.value) / 100);
              const limits = getPanLimits(next);
              setOffset(prev => ({
                x: Math.max(-limits.x, Math.min(limits.x, prev.x)),
                y: Math.max(-limits.y, Math.min(limits.y, prev.y))
              }));
              setZoom(next);
            }}
            aria-label="Saalplan Zoom"
            style={{ flex: 1, minWidth: 120, accentColor: "#7c3aed" }}
          />
          <span className="muted" style={{ fontWeight: 800 }}>40–240 %</span>
        </div>
      </div>

      {editable && !disabled && (
        <div style={{ marginBottom: 10, padding: "9px 10px", borderRadius: 13, background: "#faf7ff", border: "1px solid #e1d5f5" }}>
          <div style={{ fontWeight: 900, color: "#5b22c7", marginBottom: 7 }}>🌿 Symbole & Ausstattung hinzufügen</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(symbolLibrary.length ? symbolLibrary : [
              { id: "p1", name: "Palme", emoji: "🌴", type: "plant" },
              { id: "p2", name: "Topfpflanze", emoji: "🪴", type: "plant" },
              { id: "p3", name: "Baum", emoji: "🌳", type: "plant" },
              { id: "p4", name: "Blume", emoji: "🌺", type: "plant" },
              { id: "f1", name: "Sitzgruppe", emoji: "🛋️", type: "furniture" },
              { id: "f2", name: "Garderobe", emoji: "🧥", type: "facility" },
              { id: "f3", name: "Toilette", emoji: "🚻", type: "facility" }
            ]).map(symbol => (
              <button key={symbol.id} type="button" className="ghost" style={{ padding: "7px 10px", fontSize: 13 }} onClick={() => onAddSymbol?.(symbol)}>
                {symbol.emoji} {symbol.name}
              </button>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Elemente können anschließend mit Finger/Maus verschoben und über die Ecke in der Größe verändert werden.</div>
        </div>
      )}

      <div
        ref={viewportRef}
        onPointerDown={e => {
          if (editable && !e.target?.closest?.("[data-plan-object],[data-table-drag]")) setSelectedObjectId(null);
          onPointerDown(e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{
          position: "relative", width: "100%",
          height: compact ? 680 : "min(680px, 70vh)",
          minHeight: compact ? 560 : 520, maxHeight: compact ? 760 : 700,
          overflow: "hidden", borderRadius: 18, background: "#fff",
          border: "1px solid #d9d3e3", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.8)",
          touchAction: "none", overscrollBehavior: "contain", userSelect: "none", WebkitUserSelect: "none", cursor: dragging ? "grabbing" : "grab"
        }}
      >
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: `${offset.x}px`,
              top: `${offset.y}px`,
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left"
            }}
          >

            {visibleObjects.map(obj => {
              const isPreview = objectDragPreview?.id === obj.id || objectResizePreview?.id === obj.id;
              const preview = objectResizePreview?.id === obj.id ? objectResizePreview : objectDragPreview?.id === obj.id ? objectDragPreview : null;
              const isSelected = selectedObjectId === obj.id || objectDragging?.id === obj.id || objectResizing?.id === obj.id;
              const isStage = obj.type === "stage";
              const isWindow = obj.type === "window";
              return (
                <div
                  key={obj.id}
                  data-plan-object="true"
                  onClick={editable && !disabled ? (e => {
                    if (e.target?.closest?.("[data-resize-handle]")) return;
                    e.stopPropagation();
                    // Ein normaler Tipp/Klick wählt das Element aus.
                    // Erst danach ist das rote Löschen-X sichtbar.
                    if (!objectDragging && !objectResizing) setSelectedObjectId(obj.id);
                  }) : undefined}
                  onPointerDown={editable && !disabled ? (e => {
                    if (e.target?.closest?.("[data-resize-handle]")) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedObjectId(obj.id);
                    const rect = viewportRef.current?.getBoundingClientRect();
                    const start = {
                      id: obj.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY,
                      width: rect?.width || 1, height: rect?.height || 1,
                      startX: Number(obj.x ?? 50), startY: Number(obj.y ?? 50)
                    };
                    objectDragRef.current = start;
                    setObjectDragging(start);
                    setObjectDragPreview({ id: obj.id, x: start.startX, y: start.startY, width: Number(obj.width ?? 10), height: Number(obj.height ?? 8) });
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                  }) : undefined}
                  onPointerMove={editable && !disabled ? (e => {
                    const drag = objectDragRef.current;
                    if (!drag || drag.id !== obj.id || drag.pointerId !== e.pointerId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const dx = ((e.clientX - drag.x) / drag.width) * 100 / zoom;
                    cons