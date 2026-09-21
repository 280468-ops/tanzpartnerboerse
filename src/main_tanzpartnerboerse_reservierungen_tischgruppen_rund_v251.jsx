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
 * 3. Externer Tänzer wird dadurch wieder für diesen Workshop verfügbar.
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

// PWA: Service Worker registrieren, damit Chrome die Tanzpartnerbörse
// als installierbare Web-App erkennen und verwalten kann.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service Worker konnte nicht registriert werden:", error);
    });
  });
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
  costPerPerson
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
          costPerPerson: costPerPerson ?? null
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

// Öffentliches Login-Hintergrundbild aus dem Supabase-Bucket.
// Der Zeitstempel verhindert, dass nach einem Austausch des Bildes
// eine alte Browser-/CDN-Version angezeigt wird.
const LOGIN_BACKGROUND_BASE_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/login-bg.png";
const LOGIN_BACKGROUND_URL = `${LOGIN_BACKGROUND_BASE_URL}?v=${Date.now()}`;

// Öffentliches Workshop-Titelbild.
// Das Bild kann im Admin-Bereich direkt ersetzt werden.
// Einheitliches neues Logo für Workshops, Paaranmeldung und Vorschauen.
// Es verwendet bewusst dasselbe Bild wie der Login-Splash.
const WORKSHOP_HEADER_BASE_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/workshop-header.png";
const WORKSHOP_HEADER_VERSION_KEY = "workshop-header-version";
const WORKSHOP_HEADER_VERSION = (() => {
  try { return localStorage.getItem(WORKSHOP_HEADER_VERSION_KEY) || "1"; }
  catch (_) { return "1"; }
})();
const WORKSHOP_HEADER_URL = `${WORKSHOP_HEADER_BASE_URL}?v=${WORKSHOP_HEADER_VERSION}`;

// Workshop-Bilder werden beim Upload unter workshops/<Workshop-ID>.<Endung>
// gespeichert. Falls ein älterer/zwischengespeicherter RPC noch kein
// image_url liefert, versuchen wir deshalb die bekannten Dateiendungen.
const WORKSHOP_STORAGE_BASE_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/workshops";
function getWorkshopImageUrl(workshop) {
  if (workshop?.image_url) return workshop.image_url;
  if (workshop?.id != null) return `${WORKSHOP_STORAGE_BASE_URL}/${workshop.id}.png`;
  return WORKSHOP_HEADER_URL;
}

const ADMIN_USER_ID = "dee327bb-f3eb-4ada-bf05-bad48e4844df";

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

const HOME_DANCERS_IMAGE = "data:image/webp;base64,UklGRggeAABXRUJQVlA4IPwdAADwlwCdASphAZABPpVKn0ulpCMlJNPJyLASiWNu/HwrWUQBwf1Oa87N8i9GskzuI/q+r30w/d77h36c9QDzC/tB+13u4+lz+2+oB/gv+V1rvoL/s76cXssf2T/fek7//+zm6Rftr/lfAl/Cf6TuN+3Kkk+9/8/+6emnf/wAvyT+q/7XfDQBfYDvzdSzID/WLioKAX6Y9DzRJ9fewqOZSJySo9da7JsZY14LNk4Kc9jafmLEQxi3OunTcKBUkHDTqtWy29J7sDXsR85tfW2xp2UOTxojiU7jygSUVGUUG1x7p5O/Ew5cgGwg/qx/nJCqIB2LCwvFs5fYOVl/X0tqnXqhokUFcEyy6dqkEy/aoixWzZOKZEhUaD/l+AzAzFXQlUXmgkQgE2acJ1gg5inYvwYofuzh7dcU5waKe0BUGfevtPGzNKpUgT1V63+DBXviZOvlroAvTfqLt7d55XkmsnfEVKxOkXbpm7o0nsYToc4Z4OOQ/lFErlquFnc0cvnhd0of/KcCbYUj9SQlFD7odsczzsLodZ8rFqIDPUUWtyWoq5E2VgZtret+jmNpR9R34wS579TONj7/eND9eibjjh+7uDdb8b+UUiE7L6ooYUjNioJeDRGBbE8Q2oJp4fv5pbThJJZrC/c03fu4Y9bJTkNxBFc3E4F9KLmOEqw69HMwUawRExJpKZsrdPB3SmfTS82bPQgTYU8UiYQZCSV5Fqqbl8UMd4wocvCV7FfG36QBX3wNDVB01ykMHKYn78vWCMh9eFkEnp6r9eI8I6FK3DquaeCPAkAR6NxIzxb7roxlbvCiVAOXoAQ7uKwjviRHD4MKCDyFJVqu2GudkLFttduFHG5WryEtqYBSAoRM8eT82b5j6p6pGjmLxx0DG2HF2dk4gcxLakud5NOKE+B6bf0raLd2/pWCXzvu0zTcq8VsQSJl7xXNmACX+yvlut879Tm1gC0p3tj7QlhRlWlY/Xsda3+XM//8Ec+a6JehGKlV9t5bVH/qo/oyVMhnM3HXwBofA7J7GWDDnIJvlV0JPQOd7cVo6qAW0F5N2xMQGQGJT9k9v60OPOA0QUzrYXWJXLaXZaqgfRptkEX5ucV7TkQAphNGxPK6e3S1JEqQuZPcEG00EQq/U/QeUAmqHE4lC9aEFY5TknwzhrUcz0pnsb9eqR5EBt0DNThq0dSUaVFjWYHg4f8zFiY0H8UoB4qijOePsc01QRRIMTa/WWLlv8qFz0Ugm5MJcMedYUX4YahmYJe2Cs/NtBidWFwtdRN5apGMZLAt3JksB7q5auPH49CECyYOnG1BKi2XKhO6EOmc/JpUOGzgY2X7JPyUOPySnOGr6vshjMKYR0U04qCp+vvFQKdTNHhQ48Mer+RfGURIuT7wlj1hfMZgsP+dYVroBkHBRy421xmhRr8Uam5n1BcTJ2SCmhi98PFuRV//MVVa9P2ZZaMHVDwYiX/jFZPXRrfEY8Lv5Bnl2pRL+HL2X66Xg3lT9E36h7UTbSDBOMPNInJpJUSvEjvYhy8TDjRhv++Uz/EzvyKz/8GlfVl/LU/+s5+FqAvNs8MI894/Pty58z6i8zd8XLEOgrrYm2urtqBKJLcgUWDHJV/8MB1omwESRnv3qbYenIAA/vnugltUrkdQg7NmBxhLQTU2rdtxcHa/UukORQK39dortur2++0X3lVHDHLLubHdtbExu/uaOB3gcABwa5yJ2laD+fY1enH225i1WGB0Q3U7QVOM66Vbv6flQibj7f7/ggvY26H44MS0+dLi5tYpoaYP4DCqrglBVwIaR/O88IADDpl4n80Hz7IF0j/gACk7KojhmiO2JXsj2mOwAONQt0KrsXPAo8Kohbht54zwD+psvDBV5RU0FXEgrqGO3ITSAR1vWniTDDZY6Ot6UTLxuaEBDwp+Z1KnsdSU5BXp9tVMx5LzktiHFD2hPWsBhiQ5LsDQCkP8dDCZ52q5oKisu7YEkrohJ/dc1mb3aPoUCSh+Si0//DN+aaIMU8fOEbh3xQTvtYge6QryuTXBKPkX2k2SzCDeZ06uXThXUvGmKhbKfxJYk2m6QC5nKusolpRyLbaaRxon08TibvwIMe1mGL0446GmQMESg6rRli2VEZrxGdPYLaVXcF3+NlROGgHJbcy+ePYGXOoX0M+4qwRo40pfKQ051Xfjcr79OZjXc13k0fIrONxMAPnR12Y5rrd5DAMoJ4e+YNGTkI9M6iv+FARWII/e59bLgKfE1aDYyn9zMUVaKkJoDGyXqfT6V8i4mIySAmepIBZoUIKKgmqV2+TWvKdEeoFhGiEpc82yj5kVQdMP0mNhJAzsiq/yDiwEIy2WuBLWJFKul/vO+xKTsxS/avqszib0ELryzQperpbzuWP2VDkwW/X4QYEJU1U79SYMGHlRKhnFTpR09z8KNgosUNirauv17qxUcfJybhoAd05jgE1E8XXUgJazsHHsjIJyabIKp59zTWMroi370tMarEMaBhlpNEOPAfi7NutEz2H4RD9JEJAAJmydV+489EflPchHUUnnj3SqvN/QsAVZlDBPKsNfN7F3NrL3mVal/2AjilbkUgqly2W3TzKdA02FpQK5ogsILtLSvWDwXzEeD82aGHo1T0J4HSmm5aubRvejpzYkKgHHwE3UAij1Jbou4wDRHtWqt/aqyaFgL6+BLmAz/c22Q1QMjAZMtAdWtvXBwNxn8iBVsTsqs4uQJvyXr404KNiBCSRjTCWywElqmKbAycZk9enHY5bVxCXXO6gW3ynjw85jIKNNCyxmrrki8vU7rjD/jCifOtQpolJa4kXPBwp8I8vpE4Ai+xLOrBow91QEuWzjmPXTqlJh5xCnmTHP6pN46b789efe+7XmHMLBHZ69cc6LAtV2q9bqLxIFSseX9ZnlR4BWQ66sBcqU3mqA+M0/mfwJm8KJnpos5n6Kz0vCMADehV1WyXRRJKpY6ToVbSr/0AlPaoNue/z2XgDE4zUTa73MUhB+10ypd8bT80LSBYso+s5/WKF2T5Q0G7w9MbqernXEAMNO0atUPr12WmVF+6Mja/6mfJS97jbv8fAtHUJs8Su1wgJg+irETie2IKfOfM4+Rjcc+kASc+ecZ/1IwXY/O2OewfhNXrFtPtIZC4TWmWujhyHezdH5e68o3UPY23ilrzKJTfTQbPMM56AIbWACBj3fd9EoX0UEy77Z7MGeUF307tJaWCqf5+i6qFdsNfxXFf3dMBZ4SZGwLVcNKr7P0pNkN8e4Wh73qHlGIKSIbFqPzLfeWj8huoBm92OxNtm1TG8fTWcf2dsqbnFXfAVuOuepyqNSlcGzhFX6kaGfzAMAwZzumulpciJ6BPCYeRe/d+CUWAwyl8dc+VIG2/P7qwvB9MDYT+5iPV5Zl8wHPA/BakqcNqO22lWTzBcGGO8mXox/5cchl3+aCsz4b7rODc86ulkQyJ4F0wXYWNb5zpwslGxC29dw8ivfflo3jiJxBcat5ob2o4VB4wZSi2/TI2jB3mBV4C51mbAdxtfDkK0dZUdxo5hR4PMiF8MK+cdWM+PAQ6c19zqT0qSGRtbrsC8RzGxCTbmIhtdmaBD0rQaDnHk6Sd8YNeRXVAvPdJkr46kqg0UCvxpIPn50pwtaIbnW/BfSgZzRpjVSCCtgAqLVDgkxcyfhnQsHwaNEdyfsqXmTwtmejLg8+w9MvtqSETswJSRrYAkrN5xoDZTHPMXLSEBcwfSE/JyPkzz7/f914nE1WOzrTtGjQ+kYxey3Qhp5XkToaM3dj999v/4+Mh9aGHygTxRzwmoDWpcmQoZ0XIYaZcAZRQEbj305V/bTSNvfqWJVm1PoMklpotP+TYdmVryRp2hgGnalRtHrfo9UlJgeVv170b9+RqACRyWMsX8HnMuTTcnCMLdUjHzSamOtCZvnHzrDvAvO5muakPf8GKFQWSo3vpzH3VdFnavCJmZaUEjb1PseMSGXooLZdLTlQfhJvfHPm+xhIgkL2Ee2wnEkZTdUDjzIbOlOX4cfYF7LH/ymccgYtr/BEUAP/7gffl+9aeAt6zHBpLIrg4zQcz3XonmVnpP7loWLaMLYbTtXKZdQ2O6qEP+seFCt+b9GRJ05C6dBE5JIZx8faf+FWHHVEpubD4/+Tm16mYJPtKGn7z2fTSh0gDHdQGZw1TU1ty8jieSb7fjyzKT39+lA+9VGsp90mcW1Q4jmrYNK86oaOFmR5Pzp2/q4S0o6CHmNgttEE1aK7lSAjgTJ/nlheXriFX9zYDWO/7cH3jxYo5lDIUbimmw6ZoyWqaX1oHjgwsEwEVUWQ78wK38eb/w6hc9shnVqH0l3pLR/bnkUI5fKZWaBGvahYBbpw55v8g2FTn5ezeF+AGtllqzf0e6B6Ff+twZ3RgBLEb3Rdz8NIk2t9Pqu2ulAyiSWmvfO1kctkVeYLz2bT3VEgPEwGwpaTrXUU/2Hdq8oNANY4cqdnzTFzipTjZHaHWm8Lmkr0ojWXUhtsmYuP8dGVt+Dd1oCYRdbc5uziVpxmtHr9FSwSrIKtOMI1s0EYqx4ra3ujHLSJ1uYOWJomqVex5tf/qNi/UHd01S3o9/mfA3khsUE7gGWz7oO9O3vAXsg9WnuNNXmXnk8D0yPdteteWIZeaj+jc4YfX8th1SFcxMOe1BaXy5LwBp3PER55nh1Tbbn01x35m/OJSWHhqqoeZtf0uQSvqNzxbT2ZalCRp+WcWNbHu14l+Tifav2x3TKvKqgRlPl7/6+fwXLGikh8NlI0NGgbqdM+I3fhBOIx9RJoxmrG/9vsplCyB7CUaZ5LjCVoq6PDNIYaY8dPorSwGClT4qkKr6Xjh1o+Uj7tKp71uUGArx7LFB8lR4+90roM1GccCQBdOxTwLdrC+0/uP7zU4Y0LF2lz6LZ2FfRaLUbnSRN831HrVjj2KNSns/TSGIErfhqMY8tji+HENvKT6WE5c+zSN8nvYvMWi1pZwUUBFx/AOeKFPf7N85hp5lQHgWnMnyzWqasT/FLA9fV2SqRxKW0nE1gifZTNRL2SLqjuopOB5t2/CM3BwU0rIpdsyGtp+T6uf1mSRgTBdI4q8eGfGVMw0A1kaAxhf3XHhhl9AsTy8FLXlg1w4xr6s9HpMglWLgpPSR85L/XY9dhILOBol4a/7JQ3YCLyrLMzMkwnkMBa/wbPgazt+NDQieBn94M3vY6UJ5XlMzDGuYLiITccTL393jPyknPwXK7r0ynqAq3cUmig7nO0te53g1AkXFSbdayYkcDLaL/+iYA3HobMxlKo5hR6A3WTz9TfI9Wegc/P7DiGd9WldUzgoNzxd2Zitd9rzuZHmUyUGlOsx1wjp14Q3A5FbSqh4W8oJAtCXwsiPObaO8ALUodmpPMnqxyk6wcJx1Iv6Qx7Xf1PFpTXAEqVXUDBW6iJc4KcwnwWL1krhVHmeNFyLHi+dNzKzPY4zd5o1PExLaRA+9JfGyR+h8V8n80Z86Qd2fBTVNewuWPux3cchjADlSJ1+XF7j51Hwlbfp4oqjUUcsqm9XtaIUhLlzkatXJkuGZ5csFT1pPWhrtFxUGd3XddvFNQsQecfWqAPHu6ESdLSgSQKDQ+WRELIiIenzVDgxVCVEP2dDPHhKnYAOsbgegN9P4yLhpvKl3CuV9VGL8ykeMxCc97bOoAW/8GtjuUwsbDm2otO/yXWYmQgBLx8MklkZVLwlL2lqsBsu95r2N0GCxEfKAqh8pUPa83suKb1/cF5WsvwABV7NS/E88+0BG61I/ILOm9SeoFhEayOZcrBMzQVMah9TVguSfYiurllIddZxJ5nCQvBAxjCCZ4WSzrBS8jjWUYT6bYge1xL053pBra3Gx7BHcnLYmwrnBh2uygAs5+Wh4oQhdHQrdedts5L7x+F33gKdn8J3kyuz8Uhyty4nMy+1Nl3mhU2rRViKcX8CbjwPD0KXkDIgbsAgPDhhVHqRyduZ/N4YioCItRSuTquniRIqsE9jgv8yn3HX7gnfOP4OsovFiTvLRA31gKJtJu2raEsGror8yHc0WGWnvZgY5splT17E3cJiC9T2NuqEVcS9pND7mvJqrFprbdhclX7C/PlPliryeSUHztszTws7xnYrDq+/nQM2tY2YoxrQnow0SMW3dlc11Fb0VAJuPdoMgbhelU3fxfVRava/KZFPXtjR4L4ayhe9uctxcPx+mScl6N631xN6YU+JoiuG4Vcxj4+OGNGmK9b8f1ueWrj/XN8DbnKi79/BzcrMBRVmLbERqbNmlzaCdG70FHPeaIMcLdmjq/xnG8MjUDwCpGc9y2HIusZPgDhinrJb659ljPQbQbEvzNmxxRjJAoWkkcUH1sppLoDupWeKN7QxTctgjScrAtH2tN8RyBv6OPc3R9vdmd9EHEo1VPR+J1sYcZHtq4KaQweXM7RCj9vkipd/wN6oNJ2Mqy9K0+9pPFmQSZM3/9GyMbfiOi6/VtEe7cDIPadZE5lswkYHSQ4HrIvuS+sNSdzIIQhqMJqIIpi5VTBE57B9VCsNChrK7+nx9/3B9DxzNCdnJbbgPVEuX+YxcF9DSfPFJrbwDduJ9MuWf2j8K/sqnAycbF061YjfhaPZUXmXs2b01uaAOaZqfisQHbvyfIcILtGYk5uKjarYV0NMKdHWZikjUxbUt6N1ydKugkNO0TiFQZTlG6kMWaYz++Ihj2diOU6e0ICDnzxFuHeSMqVn2FZqecZW6DbSafwdgo9iJJcxevffKipB64hxxezj1CIVPLl+ZwP/17Ui4HYm28c0tkuGOwMVONr7l+OdlXMRrGeeaZR6Lx3FMlNXZZ4CZWU/oiwmanjBTX3UL7c65FSbWadjafF/8IiIhRWiiNEDcxK+S5Idt1FNq6E6nyjG5A5wq1O5Me0KN8O1w1hb00+A+9ah6NFJBUPIuwwnNRxbvCUjRVwYI2nUjOWwN0CAVQlNXwHQP+S8JENWnaN9hMX3d7wTzSZ+GC7wlmmNz+jO49sG7gIO+w5M6yvIcCs3Gp0ouLsQULZBhbWQ3YL7z15N5BeXbOtADMf5ZHA+jhBfGsGvzj7v9x2DoTW6haXARTnoswlLQCoUgNZ2QFLMDHcQcdB9oh21OroOZiHOcoO7C0cnEp+rQ5YCD9ihi7dyfQiq7MkZN1swBolUVA9ioNb7c017dACwthJJS8JzmdH2foA68UkyhP9P5XYOlwV5C3VqhAxPrBEA5jIwkqI8RzByREHveeiVYdPXsKuaR8JNqXQ2o2Up6I6xoZzb5lUPLyUJjoRok3l7R13XYX98ywoe7VgSWPHey3QgqGKQOcrvpZxEeqrQg0c9tLssKc9apVWgorQw3rf0FWuoEZyVBx0tnUFhFjcSRotkxF/FJsPlDUMhGDzjM8rRv5JoJk949JUao6rd6vGW0K0M0kj6I7tRfq/M8hz9Jj90i0UAXCjz/8eNXoq5tp8gQp+n8tSq9DzkBS3w4X60CedP4KXeFdWkbeEAAKXj0EwRB4EN4TFEOI3FaE974/61dlNPaW0OR98SYRVBcV+xEHIbb4dxEdnN4KrlaI3HjKOsQD0O3c4yS8N3VTyAO34K5K3FerISb0e0J/SxhyS8BLkDP39hF6K/dTPjF1VmDW3WMXsRGCLxVyiyCiTCvONFY5faDz09DJcb/b/51wlfL3boFShm+5llYfml/EJOFO/y4EtPASygUk4H/GO0WLwy+SUiGbrWccWW/eHHHFPOVnLrrhXN4xJ1bkzjRGGaYTT8sZVumXBn+L4vHFj6cq3SWzqqDkd4LjVIf/5c15vsE1ONEOQwpzFzTTfX0IJtZVNykA+gK4U+RNUsRyykmoAdORd/Tx7FzeD/su0ntoa+Y/fbSn8GLDe7lfgCLoQ6CsXi5ZWCRvMQQKJiBcFi6Y4Ta25kDutOwx+chEv9q2tF4x79Aw0IkDJnh/mKJtQzj6TQCA/xizzUSbuPMnhBFNlaK/k2BRe1yJHyxrDK7lBkaCtig2D5kQylb/Rih9OmdTefQYyc9EiZ3+C/c2ubM1SpXUGzEpQNdSiW+JXdbtO76aibtt3xzcF4pEHeSD1qNQjNQNkqkmu9ykDWGXgeNabeXFoXBQYq6MpAntYBahxEcziftYsG3zI3WmRmhj1MbZdvlnrM7k2XifLRJP3d+eKDwdBNVqbxY5iansiWp9u3xkz33TSaT6HLCJwbTu+iqPmI4aJ69cdWvR//zV08BJ1ZVBdGsrFMcXqi1hYeskG3VNXmfb1noFzEsQuaWTDx0ZUJn8Ew9WsFSgstVhsGFEszrzoQskZKMIJEXgDnhl/zNJndjRqNCer8tbcIIIgH9rXfDr97ktQWooE4PFzpMAMX7Le0+8FutlGMZJD30DP26uXWczhzb9ODd4RCBdzHHm/nCk+PdinUqw7BuKUkM0rKtHv8wZ5zB3+oXpLkthrWSfvtCyUKjOnoYccia2i1z0i65mvYOSntlY/yII6Nht0qFguWkfoJ7LAMVpkpO0/HDz/UgOG6Gm/fqjyG7psWUAZ2d8quJEEa1a5Y5NCSDWhsOjpYL/rozBliPqQomxNJmenvwWS1CgMYstRT0/8enQwfpw10mkBD7u8tFCtwv2EnKeK2zVgEPQ5ojblalpRnbSy4GL4eLPZ6KygDKPjBDAkuYLJi+wvejrog5FFTJ2wmwoocRGAMmWqSz4+m2mLcDeHN2JyX0gTgdg2mPogDCmdI0/jOhkC+7w3bIxy1fig084qYvubpno6sKNDrhqk1KWy/t1+OiCIAd30LrWf39UCZ9+dRUtLbpcH2rGwAxLxfeudU16hy+jnfQNulXngLLNWz2zxjA0eHg8oi3CG/SqMzM67gRT9WlwJ2Kyinq6Se9ZOoIGL/TNfohEuniwV9vWEc0tPZgSm+KKkLkmd2y9fVUH4BQWsUoWBj/XRlRn2RbO/DClgyMz0AzZVG3C2pid57fxCgM9z2uZ/6vxiZGjAI/zjqjarnK9iPHAS09UiGsiBOEUm1mYd/1qai2S1HozYjXYQ5k4OlPhQbU7cJf1oBoQFf+YpQLQCauSJKTCaoMeaUyrK4XkBnpADiv743Bj5/GhRAZ3YjBSEo/pEE2vIY3Y3d5R2X5+Fj8V3joBS9plobaq/fXEhbqLDa2Ab3kbOslspithWUrvCz742aTq9n5hJ/MDgBl4kZ+co8JdREvUnWvwM1TLgY512IFX4G+n/CWRP4uWpttM7/Q9SzE75SRCAkdZFoITMpLMftvLFaYHrO/CDN4ps55xBYFcA0Z3oocAzjqGZayAnzIZZo+C5dJULZ1/4jujdeoeDtrAb3brGU3UTnxj4zrx3Z1P69HvvpG9E+699Ul5JNy7JX53nZzeRfLkRQfp2vbdBgA6B3+4tBeeBKNoAKCPgCzDs0yGwQFRUAvpIJPKhzeKqonQXkbvoBS5WLKEyGzp03yq+PYhZeSRlcweGR80TEh4O9/8hisq+XZ0BfiaM4AQzgoaYsYyLQ2eAes2Z5pyuptP30IWhwvD3PDLCXXIWBBQJICXYZ1NrykAcZKktO3Fe5Fbi2bPXm+phRw1+tPrBzGKXx07G5k4UcjxJ78oxSCZc3Asri9QXin4Dft78aQ+c5AEh2FKqQ6ShrJRLIIW2l9xUdId5i8oACwyqq5t47p18TcA1Yv1uiy2M3jAhKim/qBPJgvYO0x/UbUnmcsjnkinTbY29dIoUe0ag4DqsL1r3d5v6Ux61AT3BhQxwPFiJa8s45Da0llIdUy6h86Jirb588ix9qiIlmaUv3Umco0TExP5AWJgMMwAQLwPDteE7MNcdBz36dTd8ua6QO7GzVwjWEG4CnaH3HegNZUYuZgXzZxtT6jXuACTsiXvjbobSOseyqhjB4Qk0xJx/MUQC86X8oa6LOOUxTO2BP2jfWTUyZBc5XBZjXSNsYwe7kLAIzRcU5QxasFdjzh+63BwNqUK1uEM4tn4mQMIcg9seA32nuElRpOADz26swoqMIZu+tzzCzW/WtwA774p8gXGB4gEFKaua5Ae1V15XCb3YLHvVj2YYhIHe+uvhwEDbm1YBZPD5DxP+q6B/5+btJa/Rpg8IR+WqoTOWtxgyjTyCmn8O6YKN7f/mPydIxkXzR7Q5Ti5iSbaOZ/aWIH4+L512C61B+M9rBc1EIDtTERsOnHhJDPtgqZTowLXLlNKxU2QX3roV+SydKJ3k/vheMl92BYmRr8p9u3ivdPNxdmnj+mzJ/30WxWEkMCRvi03pbQAAA==";

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

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "16px 12px 40px", fontFamily: "inherit" }}>
      <a
        href={getPublicTanzkreisUrl()}
        aria-label="Tanzkreis öffnen"
        style={{
          display: "block",
          marginBottom: 12,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid #d9cdf7",
          boxShadow: "0 4px 14px rgba(87,49,155,0.12)",
          background: "#f5f1ff",
          textDecoration: "none"
        }}
      >
        <img
          src={TANZKREIS_BANNER_DATA_URL}
          alt="Peter und Bettinas Tanzkreis"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </a>

      <div style={{ padding: "15px 16px", borderRadius: 18, background: "linear-gradient(135deg,#f5f1ff,#ebe5ff)", border: "1px solid #d9cdf7", marginBottom: 12 }}>
        <div style={{ fontSize: 23, fontWeight: 900, color: "#5630a8" }}>⭕ Tanzkreis</div>
        <div style={{ marginTop: 4, color: "#625a70", fontSize: 13, lineHeight: 1.4 }}>
          Dieser Bereich ist ausschließlich über diesen direkten Link erreichbar. Die Tanzkreis-Termine erscheinen nicht in der normalen Tanzpartnerbörse.
        </div>
      </div>

      {loading && <div className="muted" style={{ padding: 18, textAlign: "center" }}>Tanzkreis wird geladen …</div>}
      {errorMessage && <div className="notice error">{errorMessage}</div>}
      {!loading && !errorMessage && workshops.length === 0 && (
        <div className="profile-card" style={{ padding: 18, textAlign: "center" }}>Aktuell sind keine Tanzkreis-Termine vorhanden.</div>
      )}

      {!loading && !errorMessage && workshops.map(w => {
        const date = w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(w.starts_at)) : "Termin offen";
        const time = w.start_time ? String(w.start_time).slice(0,5) : (w.starts_at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(w.starts_at)) : "");
        return (
          <article key={w.id} className="profile-card" style={{ padding: "13px 14px", marginBottom: 9, borderRadius: 16, border: "1px solid #e4dbf3" }}>
            <div style={{ fontSize: 12, color: "#6f35d9", fontWeight: 850 }}>📅 {date}{time ? ` · 🕐 ${time} Uhr` : ""}{w.duration_minutes ? ` · ⏱️ ${w.duration_minutes} Min.` : ""}</div>
            <div style={{ marginTop: 4, fontSize: 17, fontWeight: 900, color: "#30263d" }}>{w.title}</div>
            {w.level && <div style={{ marginTop: 5, display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: "#f0e8ff", color: "#6330c8", fontSize: 11, fontWeight: 800 }}>{w.level}</div>}
            {w.info_text && <div style={{ marginTop: 8, color: "#5e5968", fontSize: 12.5, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{w.info_text}</div>}
            <a
              href={getPublicPairRegistrationUrl(w.id)}
              className="primary"
              style={{
                display: "block",
                marginTop: 10,
                textAlign: "center",
                textDecoration: "none",
                fontWeight: 900
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

      <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 14, background: "#faf9fc", border: "1px solid #ebe7f1", color: "#6b6572", fontSize: 11.5, lineHeight: 1.4 }}>
        🔗 Diesen Bereich kannst du direkt als Tanzkreis-Link weitergeben: <strong>{getPublicTanzkreisUrl()}</strong>
      </div>
    </main>
  );
}

function PublicWorkshopList() {
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

  const purple = "#5f2db0";
  const purpleDark = "#57319b";
  const softPurple = "#f1eafe";
  const border = "#dfd1f6";

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
        background: "linear-gradient(180deg,#f8f4ff 0%,#ffffff 62%)",
        fontFamily: "inherit"
      }}
    >
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        {/* Kopfbereich – bewusst kompakt wie die gewünschte Vorlage */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div
            style={{
              width: "100%",
              overflow: "hidden",
              borderRadius: 18,
              background: "#f1eafe",
              border: `1px solid ${border}`,
              boxShadow: "0 4px 14px rgba(87,49,155,0.10)"
            }}
          >
            <img
              src={WORKSHOP_HEADER_URL}
              alt="Peter & Bettina's Workshops & mehr"
              style={{ display: "block", width: "100%", height: "auto", objectFit: "cover" }}
              onError={e => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = LOGIN_BACKGROUND_URL;
              }}
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
            Workshops
          </h1>

          <div style={{ color: "#777", fontSize: 12.5 }}>
            Peter &amp; Bettina's Tanzpartnerbörse
          </div>
        </div>

        {/* Kurzer Hinweis statt großer Infobox */}
        <div
          style={{
            padding: "8px 10px",
            marginBottom: 10,
            borderRadius: 15,
            background: "#f5f0ff",
            border: `1px solid ${border}`,
            color: "#4f4858",
            fontSize: 12,
            lineHeight: 1.35
          }}
        >
          <strong style={{ color: purple }}>🎟️ Anmeldung:</strong>{" "}
          Normale Workshops direkt als Paar anmelden. Beim Dauerworkshop zuerst Samstag
          und anschließend Einzelperson oder Paar wählen.
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
                background: "#fff",
                border: `1px solid ${border}`,
                borderRadius: 15,
                marginBottom: 8,
                padding: 8,
                boxShadow: "0 2px 9px rgba(87,49,155,0.07)"
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
                        boxShadow: "0 2px 6px rgba(95,45,176,0.15)"
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
      if (!de) setDates(ds || []);
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
    if (!validDate) return setErrorMessage("Bitte einen der nächsten fünf Samstage auswählen.");
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
              <label style={{ display: "block", fontWeight: 700, marginBottom: 5 }}>Termin</label>
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
      </div>
    </div>
  );
}

function PublicPairRegistration({ workshopId }) {
  const [workshop, setWorkshop] = useState(null);
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

      const { data, error } = await supabase.rpc(
        "get_public_workshop_for_registration",
        { p_workshop_id: Number(workshopId) }
      );

      if (!active) return;

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

    // E-Mail-Adresse von Person 2 ist optional.
    // Name von Person 2 bleibt erforderlich, damit das Paar eindeutig zugeordnet werden kann.
    if (!name1 || !email1 || !name2) {
      setErrorMessage("Bitte Namen für beide Personen und die E-Mail-Adresse von Person 1 angeben.");
      return;
    }

    setBusy(true);
    setErrorMessage("");

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
                  Ihr seid für diesen Workshop als Paar angemeldet.
                </div>
                <div style={{ marginTop: 9, fontSize: 12.5 }}>
                  Eine Registrierung in der Tanzpartnerbörse ist nicht erforderlich.
                </div>
                <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.45 }}>
                  📧 <strong>Bestätigungs-Mail bitte aufbewahren.</strong><br />
                  Sie enthält den <strong>Link zur Abmeldung vom Workshop.</strong>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
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
                    💃🕺 Als Paar anmelden
                  </h2>
                  <p
                    style={{
                      color: "#777",
                      lineHeight: 1.35,
                      margin: "4px 0 0",
                      fontSize: 12.5
                    }}
                  >
                    Ihr habt euch bereits als Tanzpaar gefunden? Direkt anmelden – ohne Registrierung.
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
                  {busy ? "Anmeldung wird gespeichert …" : "🎟️ Verbindlich als Paar anmelden"}
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

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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
    const splashTimer = window.setTimeout(() => setShowSplash(false), 850);
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

  if (reservationCancelToken || reservationCancelGroupToken) {
    return <PublicReservationCancellation
      token={reservationCancelToken}
      groupToken={reservationCancelGroupToken}
    />;
  }

  if (workshopCancelToken) {
    return <PublicWorkshopPairCancellation token={workshopCancelToken} />;
  }

  if (guestPairWorkshopId) {
    return <PublicPairRegistration workshopId={guestPairWorkshopId} />;
  }

  if (recurringWorkshopId) {
    return <PublicRecurringWorkshopRegistration workshopId={recurringWorkshopId} selectedDate={recurringWorkshopDate} />;
  }

  if (publicWorkshops) {
    return <PublicWorkshopList />;
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

  if (!session) {
    return <Auth />;
  }

  return (
    <ErrorBoundary>
      <Dashboard session={session} />
    </ErrorBoundary>
  );
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
        .admin-registration-panel .admin-workshop-summary-main strong { display:block !important; min-width:0 !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; color:#3f236f !important; font-size:12px !important; line-height:15px !important; font-weight:850 !important; }
        .admin-registration-panel .admin-workshop-summary-main small { display:block !important; color:#756d7b !important; font-size:9px !important; line-height:11px !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }
        .admin-registration-panel .admin-workshop-count { font-size:8.5px !important; line-height:11px !important; padding:3px 5px !important; border-radius:7px !important; white-space:nowrap !important; }
        .admin-registration-panel .admin-chevron { font-size:17px !important; line-height:1 !important; }
        .admin-registration-panel .admin-workshop-details { padding:6px 8px 8px !important; }
        .admin-registration-panel .admin-participant-summary { min-height:32px !important; height:auto !important; padding:5px 7px !important; font-size:10.5px !important; line-height:13px !important; }
        .admin-registration-panel .admin-participant-details { padding:7px !important; font-size:10px !important; }
        @media (max-width:560px) {
          .admin-registration-panel { gap:5px !important; }
          .admin-registration-panel .admin-workshop-summary { grid-template-columns:minmax(0,1fr) auto auto !important; min-height:46px !important; padding:5px 7px !important; }
          .admin-registration-panel .admin-workshop-summary-main strong { font-size:11.5px !important; }
          .admin-registration-panel .admin-workshop-summary-main small { font-size:8.5px !important; }
          .admin-registration-panel .admin-workshop-count { font-size:8px !important; }
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
                    const dy = ((e.clientY - drag.y) / drag.height) * 100 / zoom;
                    setObjectDragPreview(prev => prev ? ({ ...prev, x: Math.max(1, Math.min(99, drag.startX + dx)), y: Math.max(1, Math.min(99, drag.startY + dy)) }) : prev);
                  }) : undefined}
                  onPointerUp={editable && !disabled ? (async e => {
                    const drag = objectDragRef.current;
                    if (!drag || drag.id !== obj.id || drag.pointerId !== e.pointerId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                    const preview = objectDragPreview;
                    const moved = Math.abs(Number(preview?.x ?? obj.x ?? 50) - Number(obj.x ?? 50)) > 0.05 ||
                      Math.abs(Number(preview?.y ?? obj.y ?? 50) - Number(obj.y ?? 50)) > 0.05;
                    objectDragRef.current = null;
                    setObjectDragging(null);
                    setObjectDragPreview(null);
                    setSelectedObjectId(obj.id);
                    if (moved && preview && onObjectMove) await onObjectMove(obj.id, preview.x, preview.y);
                  }) : undefined}
                  onPointerCancel={editable && !disabled ? (e => {
                    const drag = objectDragRef.current;
                    if (!drag || drag.id !== obj.id || drag.pointerId !== e.pointerId) return;
                    objectDragRef.current = null;
                    setObjectDragging(null);
                    setObjectDragPreview(null);
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                  }) : undefined}
                  style={getObjectStyle(obj, preview)}
                >
                  <div style={{
                    width: "100%", height: "100%", display: "grid", placeItems: "center",
                    border: isSelected ? "2px solid #7c3aed" : isStage ? "1px solid #b8bec8" : isWindow ? "none" : "1px solid #e4dff0",
                    background: isStage ? "#e5e7eb" : isWindow ? "transparent" : "rgba(250,247,255,.92)",
                    borderRadius: isStage ? 9 : isWindow ? 0 : 12,
                    boxShadow: isWindow ? "none" : "0 2px 7px rgba(40,20,70,.08)",
                    fontWeight: 900, fontSize: isWindow ? "clamp(10px, 1.8vw, 24px)" : "clamp(12px, 2vw, 28px)",
                    letterSpacing: isWindow ? ".08em" : 0, color: "#272333",
                    textAlign: "center", overflow: "hidden", padding: 4, boxSizing: "border-box"
                  }}>
                    {obj.emoji && <span style={{ fontSize: "clamp(18px, 3vw, 40px)", lineHeight: 1 }}>{obj.emoji}</span>}
                    <span>{obj.label}</span>
                  </div>

                  {editable && !disabled && (
                    <>
                      <button
                        type="button"
                        data-resize-handle="true"
                        aria-label={`${obj.label} Größe ändern`}
                        onPointerDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedObjectId(obj.id);
                          const rect = viewportRef.current?.getBoundingClientRect();
                          const start = {
                            id: obj.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY,
                            width: rect?.width || 1, height: rect?.height || 1,
                            startWidth: Number(obj.width ?? 10), startHeight: Number(obj.height ?? 8)
                          };
                          objectResizeRef.current = start;
                          setObjectResizing(start);
                          setObjectResizePreview({ id: obj.id, x: Number(obj.x ?? 50), y: Number(obj.y ?? 50), width: start.startWidth, height: start.startHeight });
                          try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                        }}
                        onPointerMove={e => {
                          const resize = objectResizeRef.current;
                          if (!resize || resize.id !== obj.id || resize.pointerId !== e.pointerId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const dw = ((e.clientX - resize.x) / resize.width) * 100 / zoom;
                          const dh = ((e.clientY - resize.y) / resize.height) * 100 / zoom;
                          setObjectResizePreview(prev => prev ? ({ ...prev, width: Math.max(3, Math.min(80, resize.startWidth + dw)), height: Math.max(3, Math.min(45, resize.startHeight + dh)) }) : prev);
                        }}
                        onPointerUp={async e => {
                          const resize = objectResizeRef.current;
                          if (!resize || resize.id !== obj.id || resize.pointerId !== e.pointerId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                          const preview = objectResizePreview;
                          objectResizeRef.current = null;
                          setObjectResizing(null);
                          setObjectResizePreview(null);
                          if (preview && onObjectResize) await onObjectResize(obj.id, preview.width, preview.height);
                        }}
                        style={{
                          position: "absolute", right: -5, bottom: -5, width: 20, height: 20,
                          borderRadius: "50%", border: "2px solid #fff", background: "#7c3aed",
                          color: "#fff", fontSize: 11, padding: 0, zIndex: 50, cursor: "nwse-resize"
                        }}
                      >↘</button>
                      {isSelected && obj.id !== "default-window" && (
                        <button
                          type="button"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); onObjectDelete?.(obj.id); }}
                          aria-label={`${obj.label} löschen`}
                          style={{
                            position: "absolute", left: -5, top: -5, width: 22, height: 22,
                            borderRadius: "50%", border: "2px solid #fff", background: "#dc2626",
                            color: "#fff", fontWeight: 900, fontSize: 12, padding: 0, zIndex: 51
                          }}
                        >×</button>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {groups.map(([key, group]) => {
              const center = getTableCenter(group);
              const tableNumber = center.table;
              const tableDraggingActive = tableDragging?.table === tableNumber;
              return (
                <div
                  key={`table-${key}`}
                  data-table-drag={editable && !disabled ? "true" : undefined}
                  onPointerDown={editable && !disabled ? (e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = viewportRef.current?.getBoundingClientRect();
                    const start = {
                      table: tableNumber, pointerId: e.pointerId, x: e.clientX, y: e.clientY,
                      width: rect?.width || 1, height: rect?.height || 1, lastDx: 0, lastDy: 0
                    };
                    tableDragRef.current = start;
                    setTableDragging(start);
                    setTableDragPreview({ table: tableNumber, dx: 0, dy: 0 });
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                  }) : undefined}
                  onPointerMove={editable && !disabled ? (e => {
                    const drag = tableDragRef.current;
                    if (!drag || drag.table !== tableNumber || drag.pointerId !== e.pointerId) return;
                    e.preventDefault(); e.stopPropagation();
                    const dx = ((e.clientX - drag.x) / drag.width) * 100 / zoom;
                    const dy = ((e.clientY - drag.y) / drag.height) * 100 / zoom;
                    drag.lastDx = dx; drag.lastDy = dy;
                    setTableDragging({ ...drag });
                    setTableDragPreview({ table: tableNumber, dx, dy });
                  }) : undefined}
                  onPointerUp={editable && !disabled ? (async e => {
                    const drag = tableDragRef.current;
                    if (!drag || drag.table !== tableNumber || drag.pointerId !== e.pointerId) return;
                    e.preventDefault(); e.stopPropagation();
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                    const dx = Number(drag.lastDx || 0), dy = Number(drag.lastDy || 0);
                    tableDragRef.current = null; setTableDragging(null); setTableDragPreview(null);
                    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) await onTableMove?.(tableNumber, dx, dy);
                  }) : undefined}
                  onPointerCancel={editable && !disabled ? (e => {
                    const drag = tableDragRef.current;
                    if (!drag || drag.table !== tableNumber || drag.pointerId !== e.pointerId) return;
                    tableDragRef.current = null; setTableDragging(null); setTableDragPreview(null);
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                  }) : undefined}
                  style={{
                    position: "absolute",
                    left: `${center.x + (tableDragPreview?.table === tableNumber ? tableDragPreview.dx : 0)}%`,
                    top: `${center.y + (tableDragPreview?.table === tableNumber ? tableDragPreview.dy : 0)}%`,
                    transform: "translate(-50%, -50%)",
                    width: compact ? 84 : 82, height: compact ? 84 : 82,
                    aspectRatio: "1 / 1", zIndex: tableDraggingActive ? 30 : 15,
                    pointerEvents: editable ? "auto" : "none", cursor: editable ? (tableDraggingActive ? "grabbing" : "grab") : "default",
                    borderRadius: 12, touchAction: "none", userSelect: "none", WebkitUserSelect: "none"
                  }}
                >
                  <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: compact ? 46 : "48%", aspectRatio: "1 / 1", height: "auto", borderRadius: "50%", background: "#dcecff", pointerEvents: "none", border: "2px solid #78a9e6", display: "grid", placeItems: "center", fontWeight: 900, fontSize: "clamp(9px, 1.25vw, 17px)", boxSizing: "border-box" }}>{tableNumber}</div>
                  {editable && !disabled && onTableDelete && <button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation(); onTableDelete(tableNumber);}} title={`Tisch ${tableNumber} löschen`} style={{position:"absolute",right:"-18%",top:"-18%",width:22,height:22,padding:0,borderRadius:"50%",border:"1px solid #e5e7eb",background:"#fff",fontSize:12,cursor:"pointer",zIndex:40,boxShadow:"0 1px 4px rgba(0,0,0,.15)"}}>🗑️</button>}
                </div>
              );
            })}

            {(seats || []).map(seat => {
              const seatKey = String(seat.seat_id || seat.id);
              const selected = multiSelect
                ? selectedSeatIds.some(id => String(id) === seatKey)
                : String(selectedSeatId) === seatKey;
              const reserved = Boolean(seat.reserved);
              const pos = getSeatVisualPosition(seat);
              const seatNumber = String(seat.label || "").split("· Platz ")[1] || String(seat.label || "").replace(/.*Platz\s*/i, "");
              return (
                <button
                  key={seat.seat_id || seat.id}
                  type="button"
                  disabled={disabled}
                  onPointerDown={e => {
                    // Nicht stoppen: Der Viewport muss das Pointer-Event
                    // bekommen, damit der Saalplan auch dann verschiebbar
                    // bleibt, wenn der Finger direkt auf einem Sitz startet.
                    // Die eigentliche Sitzplatz-Auswahl erfolgt weiterhin
                    // über onClick.
                  }}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    if (!reserved) onSelect?.(seat);
                  }}
                  title={reserved ? `${seat.label} – bereits reserviert` : `${seat.label} – frei`}
                  style={{
                    position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`,
                    width: compact ? 34 : 28, height: compact ? 34 : 28,
                    minWidth: 10, minHeight: 10, transform: "translate(-50%, -50%)",
                    border: selected ? "3px solid #f59e0b" : reserved ? "2px solid #dc2626" : "2px solid #15803d",
                    borderRadius: "50%", background: selected ? "#fbbf24" : reserved ? "#ef4444" : "#4ade80",
                    color: reserved ? "#fff" : "#173018", fontWeight: 900, fontSize: "clamp(6px, .8vw, 10px)",
                    cursor: disabled || reserved ? "default" : "pointer", opacity: 1, boxSizing: "border-box",
                    boxShadow: "0 2px 4px rgba(0,0,0,.16)", zIndex: 4, padding: 0
                  }}
                >{seatNumber}</button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 9, fontSize: 12, fontWeight: 800 }}>
        <span>🟢 Frei</span><span>🔴 Reserviert</span><span>🟡 Ausgewählt</span>
      </div>
      {editable && <div className="muted" style={{ marginTop: 7, textAlign: "center" }}>👆 Bearbeiten: Tische und Elemente greifen/verschieben · ↘ Ecke ziehen = Größe ändern · +/− = Zoom</div>}
    </div>
  );
}

function Events({ currentUser, onBack = null }) {
  const MAX_EVENT_SEATS_PER_EMAIL = 6;
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [planObjects, setPlanObjects] = useState([]);
  const [myReservations, setMyReservations] = useState([]);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seatLoading, setSeatLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("id,title,starts_at,admission_at,ends_at,location,description,image_url,published")
      .eq("published", true)
      .order("starts_at", { ascending: true, nullsFirst: false });
    if (error) {
      console.error("Veranstaltungen konnten nicht geladen werden:", error);
      setMessage("Veranstaltungen konnten gerade nicht geladen werden.");
      setEvents([]);
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  }

  async function loadSeats(eventId) {
    setSeatLoading(true);
    setSelectedSeat(null);
    setSelectedSeats([]);
    const [{ data, error }, { data: objectData, error: objectError }] = await Promise.all([
      supabase.rpc("get_event_seat_status", { p_event_id: eventId }),
      supabase.from("event_plan_objects").select("id,event_id,type,label,emoji,x,y,width,height,rotation,sort_order").eq("event_id", eventId).order("sort_order").order("created_at")
    ]);
    if (error) {
      console.error("Sitzplan konnte nicht geladen werden:", error);
      setMessage("Der Saalplan konnte gerade nicht geladen werden.");
      setSeats([]);
    } else {
      setSeats(data || []);
    }
    if (!objectError) setPlanObjects(objectData || []);
    else setPlanObjects([]);
    setSeatLoading(false);
  }

  async function loadMyReservations() {
    if (!currentUser) return;
    const { data, error } = await supabase.rpc("get_my_event_reservations");
    if (!error) setMyReservations(data || []);
  }

  useEffect(() => {
    loadEvents();
    loadMyReservations();

    const eventId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("event") : null;
    if (eventId) {
      (async () => {
        const { data, error } = await supabase
          .from("events")
          .select("id,title,starts_at,admission_at,ends_at,location,description,image_url,published")
          .eq("id", eventId)
          .maybeSingle();
        if (!error && data) {
          setSelectedEvent(data);
        } else if (error) {
          setMessage("Veranstaltung konnte nicht geladen werden.");
        }
      })();
    }
  }, []);

  useEffect(() => {
    if (selectedEvent?.id && selectedEvent?.published) loadSeats(selectedEvent.id);
    else setSeats([]);
  }, [selectedEvent?.id, selectedEvent?.published]);

  async function reserveSelectedSeats() {
    if (!selectedEvent || busy) return;
    const chosen = selectedSeats.length ? selectedSeats : (selectedSeat ? [selectedSeat] : []);
    if (!chosen.length) return;

    const reservationName = guestName.trim();
    const reservationEmail = guestEmail.trim().replace(/\s+/g, "").toLowerCase();
    if (!reservationName || !reservationEmail) {
      setMessage("Bitte Name und E-Mail-Adresse eingeben.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservationEmail)) {
      setMessage("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }

    if (!currentUser) {
      setGuestBusy(true);
      setMessage("");
      try {
        const reservationGroupToken = (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem("pending_event_reservation", JSON.stringify({
          eventId: selectedEvent.id,
          seatIds: chosen.map(s => s.seat_id || s.id),
          email: reservationEmail,
          name: reservationName,
          reservationGroupToken
        }));

        const redirectUrl = `${window.location.origin}${window.location.pathname}?event=${encodeURIComponent(selectedEvent.id)}`;
        const { error } = await supabase.auth.signInWithOtp({
          email: reservationEmail,
          options: { shouldCreateUser: true, emailRedirectTo: redirectUrl }
        });
        if (error) {
          localStorage.removeItem("pending_event_reservation");
          throw error;
        }
        setMessage("📧 Wir haben dir einen Bestätigungs-Link an deine E-Mail-Adresse gesendet. Nach dem Klick werden die ausgewählten Plätze automatisch reserviert.");
      } catch (error) {
        setMessage(error?.message || "Die E-Mail-Bestätigung konnte nicht gestartet werden.");
      } finally {
        setGuestBusy(false);
      }
      return;
    }

    setBusy(true);
    setMessage("");
    const reservedIds = [];
    const reservationGroupToken = (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      for (const seat of chosen) {
        const { error } = await supabase.rpc("reserve_event_seat", {
          p_event_id: selectedEvent.id,
          p_seat_id: seat.seat_id || seat.id,
          p_reservation_name: reservationName,
          p_reservation_email: reservationEmail,
          p_reservation_group_token: reservationGroupToken
        });
        if (error) throw error;
        reservedIds.push(seat.seat_id || seat.id);
      }
      const emailResult = await sendEventReservationEmail({
        action: "confirmed",
        eventId: selectedEvent.id,
        seatIds: reservedIds
      });
      setMessage(emailResult.ok
        ? `✅ ${chosen.length} ${chosen.length === 1 ? "Sitzplatz wurde" : "Sitzplätze wurden"} erfolgreich reserviert. 📧 Bestätigungs-E-Mail wurde versendet – bitte aufbewahren, der Stornierungslink befindet sich darin. 🎟️ Beim Einlass genügt der angegebene Name oder die angegebene E-Mail-Adresse.`
        : `✅ ${chosen.length} ${chosen.length === 1 ? "Sitzplatz wurde" : "Sitzplätze wurden"} erfolgreich reserviert. ⚠️ Die Reservierungs-E-Mail konnte nicht versendet werden. Bitte wende dich an den Veranstalter.`);
      setSelectedSeat(null);
      setSelectedSeats([]);
      await Promise.all([loadSeats(selectedEvent.id), loadMyReservations()]);
    } catch (error) {
      setMessage(error?.message || "Ein oder mehrere Sitzplätze konnten nicht reserviert werden.");
      await Promise.all([loadSeats(selectedEvent.id), loadMyReservations()]);
    } finally {
      setBusy(false);
    }
  }

  async function finishPendingGuestReservation() {
    if (!currentUser || !selectedEvent || !seats.length) return;
    try {
      const raw = localStorage.getItem("pending_event_reservation");
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (String(pending?.eventId) !== String(selectedEvent.id) || !Array.isArray(pending?.seatIds)) return;

      const own = myReservations.filter(r => String(r.event_id) === String(selectedEvent.id));

      const pendingName = String(pending.name || "").trim();
      const pendingEmail = String(pending.email || "").trim().replace(/\s+/g, "").toLowerCase();
      if (!pendingName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)) {
        localStorage.removeItem("pending_event_reservation");
        setMessage("Die Angaben für die Sitzplatzreservierung sind unvollständig. Bitte reserviere die Plätze erneut.");
        return;
      }

      const seatIds = pending.seatIds.slice(0, MAX_EVENT_SEATS_PER_EMAIL);
      const reservationGroupToken = pending.reservationGroupToken || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      if (!pending.reservationGroupToken) {
        try { localStorage.setItem("pending_event_reservation", JSON.stringify({ ...pending, reservationGroupToken })); } catch (_) {}
      }
      if (!seatIds.length) {
        localStorage.removeItem("pending_event_reservation");
        return;
      }

      setBusy(true);
      for (const seatId of seatIds) {
        if (own.some(r => String(r.seat_id) === String(seatId))) continue;
        const { error } = await supabase.rpc("reserve_event_seat", {
          p_event_id: selectedEvent.id,
          p_seat_id: seatId,
          p_reservation_name: String(pending.name || "").trim(),
          p_reservation_email: String(pending.email || "").trim().replace(/\s+/g, "").toLowerCase(),
          p_reservation_group_token: reservationGroupToken
        });
        if (error) throw error;
      }
      const confirmedSeatIds = seatIds.filter(seatId => !own.some(r => String(r.seat_id) === String(seatId)));
      const emailResult = await sendEventReservationEmail({
        action: "confirmed",
        eventId: selectedEvent.id,
        seatIds: confirmedSeatIds
      });
      localStorage.removeItem("pending_event_reservation");
      setSelectedSeats([]);
      setSelectedSeat(null);
      setMessage(emailResult.ok
        ? `✅ Deine ${seatIds.length === 1 ? "Sitzplatzreservierung wurde" : "Sitzplatzreservierungen wurden"} nach der E-Mail-Bestätigung erfolgreich abgeschlossen. 📧 Bestätigungs-E-Mail wurde versendet – bitte aufbewahren, der Stornierungslink befindet sich darin. 🎟️ Beim Einlass genügt der angegebene Name oder die angegebene E-Mail-Adresse.`
        : `✅ Deine ${seatIds.length === 1 ? "Sitzplatzreservierung wurde" : "Sitzplatzreservierungen wurden"} nach der E-Mail-Bestätigung erfolgreich abgeschlossen. ⚠️ Die Reservierungs-E-Mail konnte nicht versendet werden. Bitte wende dich an den Veranstalter.`);
      await Promise.all([loadSeats(selectedEvent.id), loadMyReservations()]);
    } catch (error) {
      setMessage(error?.message || "Die ausgewählten Sitzplätze konnten nach der E-Mail-Bestätigung nicht reserviert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation(reservationId) {
    if (!window.confirm("Möchtest du diese Sitzplatzreservierung wirklich stornieren?")) return;
    const { error } = await supabase.rpc("cancel_event_reservation", { p_reservation_id: reservationId });
    if (error) {
      alert(error.message || "Die Reservierung konnte nicht storniert werden.");
      return;
    }
    const emailResult = await sendEventReservationEmail({
      action: "cancelled",
      eventId: selectedEvent?.id,
      reservationIds: [reservationId]
    });
    if (!emailResult.ok) alert("Die Reservierung wurde storniert, aber die Storno-E-Mail konnte nicht versendet werden.");
    await Promise.all([loadMyReservations(), selectedEvent?.id ? loadSeats(selectedEvent.id) : Promise.resolve()]);
  }

  useEffect(() => {
    if (currentUser && selectedEvent?.id && seats.length && !seatLoading) {
      finishPendingGuestReservation();
    }
  }, [currentUser, selectedEvent?.id, seats.length, seatLoading, myReservations.length]);

  const selectedDate = selectedEvent ? formatEventDateTime(selectedEvent.starts_at) : null;
  const admission = selectedEvent?.admission_at ? formatEventDateTime(selectedEvent.admission_at).time : "";
  if (selectedEvent) {
    return (
      <main className="page" style={{ paddingBottom: 18 }}>
        <button type="button" className="primary" onClick={() => {
          setSelectedEvent(null); setSelectedSeat(null); setSelectedSeats([]); setMessage("");
          if (!currentUser) window.location.href = window.location.pathname;
        }} style={{ marginBottom: 8 }}>‹ Veranstaltungen</button>
        <div className="hero" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: "0 0 4px" }}>🎟️ {selectedEvent.title}</h2>
          <p style={{ margin: 0 }}>Sitzplatzreservierung</p>
        </div>

        <div className="profile-card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{selectedDate?.date}</div>
          <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 8, color: "#5e5a69", fontWeight: 700 }}>
            {selectedDate?.time && <span>🕐 Beginn: {selectedDate.time}</span>}
            {admission && <span>🚪 Einlass: {admission}</span>}
          </div>
          {selectedEvent.description && <p style={{ margin: "7px 0 0", lineHeight: 1.4 }}>{selectedEvent.description}</p>}
        </div>

        <div role="note" aria-label="Wichtige Hinweise zur Reservierung" style={{
          marginBottom: 8,
          padding: "11px 13px",
          borderRadius: 13,
          background: "#fff9e8",
          border: "2px solid #e7bd54",
          color: "#3f3828",
          boxShadow: "0 1px 2px rgba(0,0,0,.04)"
        }}>
          <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 6 }}>⚠️ WICHTIGE HINWEISE</div>
          <div style={{
            marginBottom: 7,
            padding: "7px 9px",
            borderRadius: 9,
            background: "#fff0f0",
            border: "1.5px solid #e05252",
            color: "#9f1d1d",
            fontWeight: 900,
            fontSize: 14,
            lineHeight: 1.3
          }}>
            🎟️ Maximal <strong>6 Plätze pro E-Mail-Adresse</strong>
          </div>
          <div style={{ lineHeight: 1.35, fontSize: 13 }}>
            📧 <strong>Reservierungs-E-Mail:</strong> Bitte aufbewahren – den <strong>Stornierungslink</strong> findest du dort.
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #ead7a2", lineHeight: 1.35, fontSize: 13 }}>
            🎟️ <strong>Einlass:</strong> Die Reservierung wird über den angegebenen <strong>Namen oder die E-Mail-Adresse</strong> geprüft.
          </div>
        </div>

        {message && <div className="notice" style={{ marginBottom: 8 }}>{message}</div>}

        {myReservations.filter(r => String(r.event_id) === String(selectedEvent.id)).length > 0 && (
          <details style={{ marginBottom: 8 }}>
            <summary style={{
              cursor: "pointer",
              listStyle: "none",
              padding: "10px 12px",
              borderRadius: 12,
              background: "#f0e8ff",
              border: "1px solid #d8c6f5",
              color: "#5b22c7",
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8
            }}>
              <span>🎟️ Meine Reservierungen</span>
              <span style={{ fontSize: 13 }}>
                {myReservations.filter(r => String(r.event_id) === String(selectedEvent.id)).length}/{MAX_EVENT_SEATS_PER_EMAIL} ▾
              </span>
            </summary>
            <div style={{ marginTop: 5, display: "grid", gap: 4 }}>
              {myReservations
                .filter(r => String(r.event_id) === String(selectedEvent.id))
                .map(r => (
                  <div key={r.reservation_id} style={{
                    padding: "6px 8px",
                    border: "1px solid #e4dff0",
                    borderRadius: 9,
                    background: "#faf8ff"
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 7
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: 14 }}>🪑 {r.seat_label}</strong>
                        {r.checked_in_at && (
                          <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                            🟢 eingecheckt
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => cancelReservation(r.reservation_id)}
                        style={{ padding: "4px 7px", minHeight: 30 }}
                      >
                        Aufheben
                      </button>
                    </div>
                    {r.checkin_token && (
                      <details style={{ marginTop: 3 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 12 }}>
                          🎟️ QR-Code anzeigen
                        </summary>
                        <div style={{ padding: "6px 0 2px", textAlign: "center" }}>
                          <EventQrImage token={r.checkin_token} size={125} />
                          <div className="muted" style={{ marginTop: 3, fontSize: 11 }}>
                            Beim Einlass vorzeigen.
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
            </div>
          </details>
        )}

        {!selectedEvent.published ? (
          <div className="profile-card" style={{ padding: 12, background: "#faf7ff", border: "1px solid #e2d6f3" }}>
            <h3 style={{ margin: "0 0 5px", color: "#5b22c7" }}>🔒 Noch nicht veröffentlicht</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.4 }}>
              Diese Veranstaltung ist noch nicht freigeschaltet. Die Sitzplatzreservierung wird geöffnet, sobald die Veranstaltung veröffentlicht wurde.
            </p>
          </div>
        ) : seatLoading ? (
          <div className="card">Saalplan wird geladen …</div>
        ) : seats.length === 0 ? (
          <div className="card">Für diese Veranstaltung wurde noch kein Saalplan hinterlegt.</div>
        ) : (
          <div className="profile-card" style={{ padding: 12, marginTop: 0 }}>
            <h3 style={{ margin: "0 0 8px" }}>🪑 Saalplan</h3>
            {selectedSeats.length > 0 && (
              <div style={{ marginBottom: 10, padding: 12, borderRadius: 14, background: "#fff8e7", border: "1px solid #f3d38a" }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>🟡 {selectedSeats.length} von {MAX_EVENT_SEATS_PER_EMAIL} Plätzen ausgewählt</div>
                <div className="muted" style={{ marginTop: 3, lineHeight: 1.35 }}>
                  {selectedSeats.map(s => s.label).join(" · ")}
                </div>

                <div style={{ marginTop: 9, padding: 10, borderRadius: 12, background: "#fff", border: "1px solid #e7dfef" }}>
                  <div style={{ fontWeight: 900, color: "#5b22c7" }}>👤 Angaben für die Sitzplatzreservierung</div>
                  <div className="muted" style={{ marginTop: 2, lineHeight: 1.35 }}>
                    Bitte immer Name und E-Mail-Adresse angeben. Die Angaben werden für diese Sitzplatzreservierung verwendet.
                    {currentUser ? " Auch wenn du bereits in der Tanzpartnerbörse angemeldet bist, sind diese Angaben erforderlich." : " Eine Anmeldung in der Tanzpartnerbörse ist nicht erforderlich."}
                  </div>
                  <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Vor- und Nachname *" autoComplete="name" style={{ marginTop: 7 }} />
                  <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="E-Mail-Adresse *" autoComplete="email" style={{ marginTop: 6 }} />
                </div>

                <button type="button" className="primary wide" style={{ marginTop: 8 }} onClick={reserveSelectedSeats} disabled={busy || guestBusy}>
                  {(busy || guestBusy) ? "Bitte warten …" : currentUser ? `${selectedSeats.length} ${selectedSeats.length === 1 ? "Platz" : "Plätze"} reservieren` : "📧 E-Mail bestätigen & Plätze reservieren"}
                </button>
                <button type="button" className="ghost wide" style={{ marginTop: 6 }} onClick={() => { setSelectedSeat(null); setSelectedSeats([]); }}>
                  Auswahl aufheben
                </button>
              </div>
            )}

            <EventSeatPlan
              seats={seats}
              selectedSeatId={selectedSeat?.seat_id}
              selectedSeatIds={selectedSeats.map(s => s.seat_id || s.id)}
              multiSelect
              onSelect={seat => {
                const id = String(seat.seat_id || seat.id);
                setSelectedSeat(seat);
                setSelectedSeats(prev => {
                  const exists = prev.some(s => String(s.seat_id || s.id) === id);
                  if (exists) return prev.filter(s => String(s.seat_id || s.id) !== id);
                  if (prev.length >= MAX_EVENT_SEATS_PER_EMAIL) {
                    setMessage(`⚠️ Du kannst maximal ${MAX_EVENT_SEATS_PER_EMAIL} Sitzplätze gleichzeitig auswählen.`);
                    return prev;
                  }
                  return [...prev, seat];
                });
              }}
              planObjects={planObjects}
            />


          </div>
        )}
      </main>
    );
  }

  return (
    <main className="page" style={{ paddingBottom: 18 }}>
      {onBack && <button type="button" className="admin-top-back primary" onClick={onBack} style={{ marginBottom: 8 }}>‹ Startseite</button>}
      <div className="hero" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: "0 0 4px" }}>🎟️ Veranstaltungen</h2>
        <p style={{ margin: 0 }}>Gemeinsam tanzen, feiern und genießen.</p>
      </div>

      {loading ? <div className="card">Veranstaltungen werden geladen …</div> : events.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 24 }}><div style={{ fontSize: 38 }}>🎟️</div><h3>Aktuell keine Veranstaltungen</h3><p className="muted">Sobald eine Veranstaltung veröffentlicht ist, erscheint sie hier.</p></div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {events.map(event => {
            const dt = formatEventDateTime(event.starts_at);
            return (
              <article key={event.id} className="profile-card" style={{ padding: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 58, height: 58, flexShrink: 0, borderRadius: 16, display: "grid", placeItems: "center", background: "#eee5ff", color: "#6f35d9", fontSize: 30, overflow: "hidden" }}>
                    {event.image_url ? <img src={event.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎟️"}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 style={{ margin: "0 0 3px", color: "#5b22c7", fontSize: 20 }}>{event.title}</h3>
                    <div style={{ fontWeight: 800 }}>📅 {dt.date}{dt.time ? ` · 🕐 ${dt.time}` : ""}</div>
                    <div
                      style={{
                        marginTop: 6,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#fff0f0",
                        border: "2px solid #e05252",
                        color: "#9f1d1d",
                        fontSize: 12.5,
                        fontWeight: 900,
                        lineHeight: 1.3
                      }}
                    >
                      ⚠️ MAXIMAL 6 PLÄTZE PRO MAILADRESSE!
                    </div>
                  </div>
                </div>

                {event.description && <p style={{ margin: "7px 0 8px", lineHeight: 1.4 }}>{event.description}</p>}
                <button type="button" className="primary wide" style={{ marginTop: 2 }} onClick={() => setSelectedEvent(event)}>🪑 Sitzplatz reservieren</button>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}


function getEventQrUrl(token) {
  if (!token) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=2&data=${encodeURIComponent(String(token))}`;
}

function EventQrImage({ token, size = 150 }) {
  if (!token) return null;
  return (
    <img
      src={getEventQrUrl(token)}
      alt="QR-Code für den Einlass"
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size, borderRadius: 10, background: "#fff", border: "1px solid #e5e0eb" }}
    />
  );
}

function EventCheckinPanel({ eventId, readOnly = false }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  function stopScanner() {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScannerOpen(false);
  }

  useEffect(() => () => stopScanner(), []);

  async function lookupToken(value) {
    const clean = String(value || "").trim();
    if (!clean) return;
    setBusy(true); setMessage(""); setSelected(null);
    const { data, error } = await supabase.rpc("admin_get_event_reservation_by_token", { p_checkin_token: clean });
    if (error) setMessage(error.message || "QR-Code konnte nicht geprüft werden.");
    else if (!data?.length) setMessage("❌ Keine gültige Reservierung zu diesem QR-Code gefunden.");
    else if (String(data[0].event_id) !== String(eventId)) setMessage("❌ Der QR-Code gehört zu einer anderen Veranstaltung.");
    else { setSelected(data[0]); setToken(clean); }
    setBusy(false);
  }

  async function searchReservations() {
    setBusy(true); setMessage(""); setSelected(null);
    const { data, error } = await supabase.rpc("admin_search_event_reservations", { p_event_id: eventId, p_search: search.trim() });
    if (error) setMessage(error.message || "Suche fehlgeschlagen.");
    else setResults(data || []);
    setBusy(false);
  }

  async function checkin(reservation) {
    if (readOnly || !reservation || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await supabase.rpc("admin_checkin_event_reservation", { p_reservation_id: reservation.reservation_id });
    if (error) setMessage(error.message || "Einlass konnte nicht verbucht werden.");
    else {
      const wasAlready = Boolean(data?.[0]?.already_checked_in);
      setMessage(wasAlready ? "ℹ️ Diese Person war bereits eingecheckt." : "✅ Einlass erfolgreich verbucht.");
      setSelected(prev => prev ? { ...prev, checked_in_at: data?.[0]?.checked_in_at || prev.checked_in_at } : prev);
      setResults(prev => prev.map(r => r.reservation_id === reservation.reservation_id ? { ...r, checked_in_at: data?.[0]?.checked_in_at || r.checked_in_at } : r));
    }
    setBusy(false);
  }

  async function startScanner() {
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) { setMessage("📷 Die Kamera wird von diesem Browser nicht unterstützt. Bitte den Namen suchen."); return; }
    if (!("BarcodeDetector" in window)) { setMessage("📷 Dieser Browser unterstützt keinen integrierten QR-Scan. Bitte den Namen suchen oder den QR-Code mit der normalen Handy-Kamera öffnen."); return; }
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setScannerOpen(true);
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      }, 50);
      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes?.[0]?.rawValue;
          if (value) { stopScanner(); await lookupToken(value); }
        } catch (_) {}
      }, 500);
    } catch (error) {
      setMessage("📷 Kamera konnte nicht geöffnet werden. Bitte Kamerazugriff erlauben oder den Namen suchen.");
      stopScanner();
    }
  }

  return (
    <div className="profile-card" style={{ padding: 14 }}>
      <h3 style={{ margin: "2px 0 10px" }}>🚪 Einlasskontrolle</h3>
      <p className="muted" style={{ marginTop: 0 }}>Zwei Möglichkeiten: QR-Code der Reservierung scannen oder nach Name/E-Mail suchen.</p>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ padding: 12, borderRadius: 14, background: "#f5f0ff", border: "1px solid #ddd0ff" }}>
          <strong>📷 QR-Code scannen</strong>
          <button type="button" className="primary wide" style={{ marginTop: 8 }} onClick={startScanner} disabled={busy || readOnly}>QR-Code mit Kamera scannen</button>
          {scannerOpen && <div style={{ marginTop: 10 }}><video ref={videoRef} playsInline muted style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 14, background: "#111" }} /><button type="button" className="ghost wide" style={{ marginTop: 8 }} onClick={stopScanner}>Scanner schließen</button></div>}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}><input value={token} onChange={e => setToken(e.target.value)} placeholder="QR-Token manuell eingeben" /><button type="button" className="ghost" onClick={() => lookupToken(token)} disabled={busy}>Prüfen</button></div>
        </div>
        <div style={{ padding: 12, borderRadius: 14, background: "#f7fbff", border: "1px solid #dce9fb" }}>
          <strong>🔎 Nach Namen suchen</strong>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") searchReservations(); }} placeholder="Name oder E-Mail" /><button type="button" className="ghost" onClick={searchReservations} disabled={busy}>Suchen</button></div>
        </div>
      </div>
      {message && <div className="notice" style={{ marginTop: 10 }}>{message}</div>}
      {selected && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: selected.checked_in_at ? "#eefaf1" : "#fff8e7", border: `1px solid ${selected.checked_in_at ? "#b7dfc0" : "#f3d38a"}` }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{selected.checked_in_at ? "🟢 Bereits eingecheckt" : "🟡 Reservierung gefunden"}</div>
          <div style={{ marginTop: 6, fontWeight: 800 }}>{selected.display_name || "Unbekannt"}</div>
          <div className="muted">{selected.email || ""}</div>
          <div style={{ marginTop: 6 }}>🪑 {selected.seat_label} · {selected.capacity} Plätze</div>
          {!selected.checked_in_at && !readOnly && <button type="button" className="primary wide" style={{ marginTop: 10 }} onClick={() => checkin(selected)} disabled={busy}>{busy ? "Wird verbucht …" : "✅ Einlass gewähren"}</button>}
          {selected.checked_in_at && <div className="muted" style={{ marginTop: 7 }}>Einlass: {new Date(selected.checked_in_at).toLocaleString("de-DE")}</div>}
        </div>
      )}
      {results.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
          {results.map(r => <button key={r.reservation_id} type="button" onClick={() => setSelected(r)} style={{ textAlign: "left", padding: 11, borderRadius: 12, border: `1px solid ${r.checked_in_at ? "#b7dfc0" : "#e4dff0"}`, background: r.checked_in_at ? "#f2fbf4" : "#fff", cursor: "pointer" }}><strong>{r.checked_in_at ? "🟢" : "🟡"} {r.display_name || "Unbekannt"}</strong><div className="muted">{r.email || ""} · {r.seat_label}</div></button>)}
        </div>
      )}
    </div>
  );
}

function getPublicEventUrl(eventId) {
  if (!eventId || typeof window === "undefined") return "";
  // Öffentlicher Link zur konkreten Veranstaltung.
  // Dadurch kann die Vorschau (Open Graph) eindeutig Bild 2 verwenden.
  return `${window.location.origin}/?event=${encodeURIComponent(eventId)}`;
}

function copyPublicEventLink(eventId) {
  const url = getPublicEventUrl(eventId);
  if (!url) return Promise.reject(new Error("Kein Veranstaltungslink verfügbar."));
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(url);
  const input = document.createElement("input");
  input.value = url;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return Promise.resolve();
}

async function sendEventReservationEmail({ action = "confirmed", eventId, seatIds = [], reservationIds = [], cancelToken = null, cancelGroupToken = null }) {
  try {
    const { data, error } = await supabase.functions.invoke("send-event-reservation-email", {
      body: { action, eventId, seatIds, reservationIds, cancelToken, cancelGroupToken }
    });
    if (error) {
      console.warn("Sitzplatz-E-Mail konnte nicht versendet werden:", error);
      return { ok: false, error };
    }
    if (data?.success === false) return { ok: false, error: new Error(data.error || "E-Mail konnte nicht gesendet werden.") };
    return { ok: true, data };
  } catch (error) {
    console.warn("Fehler beim Sitzplatz-E-Mail-Versand:", error);
    return { ok: false, error };
  }
}

function AdminEvents({ readOnly = false, initialMode = "overview" }) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [seats, setSeats] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seatBusy, setSeatBusy] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [seatEditMode, setSeatEditMode] = useState(false);
  const [planObjects, setPlanObjects] = useState([]);
  const [symbolLibrary, setSymbolLibrary] = useState([]);
  const [reservationSearch, setReservationSearch] = useState("");
  const [reservationSort, setReservationSort] = useState("name");
  const [form, setForm] = useState({ title: "", starts_at: "", admission_at: "", ends_at: "", location: "", description: "", published: false });
  const [seatForm, setSeatForm] = useState({ label: "Tisch 1", capacity: 4, x: 50, y: 50, width: 14, height: 10, shape: "round" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialMode === "create") {
      setSelectedEventId("");
      setSeats([]);
      setReservations([]);
      setForm({ title: "", starts_at: "", admission_at: "", ends_at: "", location: "", description: "", published: true });
    }
  }, [initialMode]);

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase.from("events").select("id,title,starts_at,admission_at,ends_at,location,description,image_url,published").order("starts_at", { ascending: true, nullsFirst: false });
    if (error) { setMessage("Veranstaltungen konnten nicht geladen werden: " + error.message); setEvents([]); }
    else setEvents(data || []);
    setLoading(false);
  }

  async function loadEventDetails(eventId) {
    if (!eventId) { setSeats([]); setReservations([]); setPlanObjects([]); return; }
    const [{ data: seatData, error: seatError }, { data: reservationData, error: reservationError }, { data: objectData, error: objectError }] = await Promise.all([
      supabase.from("event_seats").select("id,event_id,label,capacity,x,y,width,height,shape,sort_order").eq("event_id", eventId).order("sort_order").order("label"),
      supabase.rpc("admin_get_event_overview", { p_event_id: eventId }),
      supabase.from("event_plan_objects").select("id,event_id,type,label,emoji,x,y,width,height,rotation,sort_order").eq("event_id", eventId).order("sort_order").order("created_at")
    ]);
    if (seatError) setMessage("Sitzplätze konnten nicht geladen werden: " + seatError.message);
    if (reservationError) setMessage("Reservierungen konnten nicht geladen werden: " + reservationError.message);
    if (objectError) setMessage("Saalplan-Elemente konnten nicht geladen werden: " + objectError.message);
    setSeats(seatData || []);
    setReservations(reservationData || []);
    if (objectData?.length) {
      setPlanObjects(objectData);
    } else if (!readOnly) {
      const rows = DEFAULT_PLAN_OBJECTS.map((obj, index) => ({
        event_id: eventId, type: obj.type, label: obj.label, emoji: obj.emoji || null,
        x: obj.x, y: obj.y, width: obj.width, height: obj.height, rotation: obj.rotation || 0, sort_order: index + 10
      }));
      const { data: created, error: createError } = await supabase.from("event_plan_objects").insert(rows).select("id,event_id,type,label,emoji,x,y,width,height,rotation,sort_order");
      if (!createError) setPlanObjects(created || []);
      else setPlanObjects([]);
    }
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("plan_symbol_library").select("id,name,emoji,type,sort_order").eq("active", true).order("sort_order").order("name");
      if (!error) setSymbolLibrary(data || []);
    })();
  }, []);

  useEffect(() => { loadEvents(); }, []);

  useEffect(() => {
    if (initialMode === "edit" && !selectedEventId && events.length > 0) {
      selectEvent(events[0]);
    }
  }, [initialMode, events.length]);

  useEffect(() => { loadEventDetails(selectedEventId); }, [selectedEventId]);

  function selectEvent(event) {
    setSelectedEventId(event.id);
    setForm({ title: event.title || "", starts_at: event.starts_at ? new Date(event.starts_at).toISOString().slice(0,16) : "", admission_at: event.admission_at ? new Date(event.admission_at).toISOString().slice(0,16) : "", ends_at: event.ends_at ? new Date(event.ends_at).toISOString().slice(0,16) : "", location: event.location || "", description: event.description || "", published: Boolean(event.published) });
    setMessage("");
  }

  function toIso(value) { return value ? new Date(value).toISOString() : null; }

  async function saveEvent(e) {
    e.preventDefault();
    if (readOnly) return alert("Dieser Admin-Zugang ist nur zum Lesen freigegeben.");
    if (!form.title.trim()) return alert("Bitte einen Veranstaltungstitel eingeben.");
    setEventBusy(true); setMessage("");
    const payload = { title: form.title.trim(), starts_at: toIso(form.starts_at), admission_at: toIso(form.admission_at), ends_at: toIso(form.ends_at), location: form.location.trim() || null, description: form.description.trim() || null, published: Boolean(form.published) };
    const isNewEvent = !selectedEventId;
    const result = isNewEvent
      ? await supabase.from("events").insert(payload).select().single()
      : await supabase.from("events").update(payload).eq("id", selectedEventId).select().single();
    if (result.error) {
      setMessage("Fehler beim Speichern: " + result.error.message);
    } else {
      const eventId = result.data.id;
      if (isNewEvent) {
        const { data: seatCount, error: seatPlanError } = await supabase.rpc("admin_create_event_seat_plan", { p_event_id: eventId });
        if (seatPlanError) {
          setSelectedEventId(eventId);
          await loadEvents();
          setMessage("⚠️ Veranstaltung gespeichert, aber der automatische Saalplan konnte nicht angelegt werden: " + seatPlanError.message);
        } else {
          setSelectedEventId(eventId);
          await loadEventDetails(eventId);
          await loadEvents();
          setMessage(`✅ Veranstaltung gespeichert – der Saalplan mit ${seatCount || 106} Sitzplätzen wurde automatisch angelegt. Der Veranstaltungslink ist unten verfügbar.`);
        }
      } else {
        setMessage("✅ Veranstaltung gespeichert. Der Veranstaltungslink ist unten verfügbar.");
        setSelectedEventId(eventId);
        await loadEvents();
      }
    }
    setEventBusy(false);
  }

  async function moveEventTable(tableNumber, dx, dy) {
    if (readOnly || !selectedEventId || !tableNumber) return;
    const group = seats.filter(s => String(s.label || "").match(/^Tisch\s+\d+/i)?.[0] === `Tisch ${tableNumber}`);
    if (!group.length) return;
    setSeatBusy(true);
    try {
      const updates = group.map(seat => ({
        id: seat.id,
        x: Math.max(0.5, Math.min(99.5, Number(seat.x || 50) + Number(dx || 0))),
        y: Math.max(0.5, Math.min(99.5, Number(seat.y || 50) + Number(dy || 0)))
      }));
      const results = await Promise.all(updates.map(row => supabase.from("event_seats").update({ x: row.x, y: row.y }).eq("id", row.id)));
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
      await loadEventDetails(selectedEventId);
      setMessage(`✅ Tisch ${tableNumber} wurde verschoben und gespeichert.`);
    } catch (error) {
      setMessage("Tisch konnte nicht verschoben werden: " + (error?.message || error));
    } finally {
      setSeatBusy(false);
    }
  }

  async function changeEventTableSeatCount(tableNumber, newCount) {
    if (readOnly || !selectedEventId) return;
    const count = Number(newCount);
    if (![4, 6, 8].includes(count)) return;
    const group = seats.filter(s => String(s.label || "").match(/^Tisch\s+\d+/i)?.[0] === `Tisch ${tableNumber}`)
      .sort((a, b) => {
        const na = Number(String(a.label || "").match(/Platz\s+(\d+)/i)?.[1] || 0);
        const nb = Number(String(b.label || "").match(/Platz\s+(\d+)/i)?.[1] || 0);
        return na - nb;
      });
    if (!group.length || group.length === count) return;

    const reservedLabels = new Set(activeReservations.map(r => String(r.seat_label || "")));
    if (group.some(seat => reservedLabels.has(String(seat.label || "")))) {
      setMessage(`⚠️ Die Platzanzahl von Tisch ${tableNumber} kann nicht geändert werden, solange dort reservierte Plätze bestehen.`);
      return;
    }

    const centerX = group.reduce((sum, s) => sum + Number(s.x || 50), 0) / group.length;
    const centerY = group.reduce((sum, s) => sum + Number(s.y || 50), 0) / group.length;
    const angles = count === 4 ? [-90, 0, 90, 180] : count === 6 ? [-90, -30, 30, 90, 150, 210] : [-90, -45, 0, 45, 90, 135, 180, 225];
    const radiusX = count === 4 ? 4.0 : 4.4;
    const radiusY = 5.0;
    setSeatBusy(true);
    try {
      const kept = group.slice(0, count);
      const updates = kept.map((seat, index) => {
        const rad = angles[index] * Math.PI / 180;
        return supabase.from("event_seats").update({
          label: `Tisch ${tableNumber} · Platz ${index + 1}`,
          x: Math.max(0.5, Math.min(99.5, Number((centerX + Math.cos(rad) * radiusX).toFixed(3)))),
          y: Math.max(0.5, Math.min(99.5, Number((centerY + Math.sin(rad) * radiusY).toFixed(3)))),
          width: 3.2, height: 3.2, shape: "round"
        }).eq("id", seat.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;

      if (count > group.length) {
        const rows = Array.from({ length: count - group.length }, (_, i) => {
          const index = group.length + i;
          const rad = angles[index] * Math.PI / 180;
          return {
            event_id: selectedEventId,
            label: `Tisch ${tableNumber} · Platz ${index + 1}`,
            capacity: 1,
            x: Math.max(0.5, Math.min(99.5, Number((centerX + Math.cos(rad) * radiusX).toFixed(3)))),
            y: Math.max(0.5, Math.min(99.5, Number((centerY + Math.sin(rad) * radiusY).toFixed(3)))),
            width: 3.2, height: 3.2, shape: "round", sort_order: seats.length + i
          };
        });
        const { error } = await supabase.from("event_seats").insert(rows);
        if (error) throw error;
      } else if (count < group.length) {
        const remove = group.slice(count);
        const { error } = await supabase.from("event_seats").delete().in("id", remove.map(s => s.id));
        if (error) throw error;
      }
      await loadEventDetails(selectedEventId);
      setMessage(`✅ Tisch ${tableNumber} hat jetzt ${count} Plätze – gespeichert.`);
    } catch (error) {
      setMessage("Platzanzahl konnte nicht geändert werden: " + (error?.message || error));
    } finally {
      setSeatBusy(false);
    }
  }

  async function updatePlanObject(id, patch) {
    if (readOnly || !selectedEventId || !id || String(id).startsWith("default-")) return;
    const clean = {};
    ["x","y","width","height","rotation"].forEach(key => { if (patch[key] != null) clean[key] = Number(patch[key]); });
    if (patch.label != null) clean.label = String(patch.label);
    if (patch.emoji != null) clean.emoji = String(patch.emoji);
    const { error } = await supabase.from("event_plan_objects").update(clean).eq("id", id).eq("event_id", selectedEventId);
    if (error) { setMessage("Saalplan-Element konnte nicht gespeichert werden: " + error.message); return; }
    setPlanObjects(prev => prev.map(obj => String(obj.id) === String(id) ? { ...obj, ...clean } : obj));
  }

  async function movePlanObject(id, x, y) {
    await updatePlanObject(id, { x: Math.max(1, Math.min(99, x)), y: Math.max(1, Math.min(99, y)) });
  }

  async function resizePlanObject(id, width, height) {
    await updatePlanObject(id, { width: Math.max(3, Math.min(80, width)), height: Math.max(3, Math.min(45, height)) });
  }

  async function deletePlanObject(id) {
    if (readOnly || !selectedEventId || !id) return;
    if (String(id) === "default-window") return;
    if (!window.confirm("Dieses Element aus dem Saalplan entfernen?")) return;

    // Standard-Symbole werden normalerweise nur als Fallback aus DEFAULT_PLAN_OBJECTS
    // angezeigt und haben deshalb noch keine Datenbank-ID. Damit auch Eingang,
    // Toilette, Kasse, Baum usw. dauerhaft gelöscht werden können, materialisieren
    // wir beim ersten Löschen die Standardobjekte in der Veranstaltung und lassen
    // das ausgewählte Objekt weg. Danach arbeitet der Saalplan nur noch mit den
    // gespeicherten Objekten.
    if (String(id).startsWith("default-")) {
      const existing = Array.isArray(planObjects) ? planObjects : [];
      const alreadyMaterialized = existing.length > 0;
      if (alreadyMaterialized) {
        const { error } = await supabase.from("event_plan_objects").delete().eq("id", id).eq("event_id", selectedEventId);
        if (error) { setMessage("Element konnte nicht gelöscht werden: " + error.message); return; }
        setPlanObjects(prev => prev.filter(obj => String(obj.id) !== String(id)));
        return;
      }
      const rows = DEFAULT_PLAN_OBJECTS
        .filter(obj => obj.id !== id)
        .map((obj, index) => ({
          event_id: selectedEventId, type: obj.type, label: obj.label, emoji: obj.emoji || null,
          x: obj.x, y: obj.y, width: obj.width, height: obj.height, rotation: obj.rotation || 0, sort_order: index + 10
        }));
      const { data, error } = await supabase.from("event_plan_objects").insert(rows)
        .select("id,event_id,type,label,emoji,x,y,width,height,rotation,sort_order");
      if (error) { setMessage("Element konnte nicht gelöscht werden: " + error.message); return; }
      setPlanObjects(data || []);
      return;
    }

    const { error } = await supabase.from("event_plan_objects").delete().eq("id", id).eq("event_id", selectedEventId);
    if (error) { setMessage("Element konnte nicht gelöscht werden: " + error.message); return; }
    setPlanObjects(prev => prev.filter(obj => String(obj.id) !== String(id)));
  }

  async function addPlanSymbol(symbol) {
    if (readOnly || !selectedEventId || !symbol) return;
    const nextOrder = planObjects.length + 10;
    const { data, error } = await supabase.from("event_plan_objects").insert({
      event_id: selectedEventId,
      type: symbol.type || "symbol",
      label: symbol.name || "Symbol",
      emoji: symbol.emoji || "🌿",
      x: 50, y: 50, width: 10, height: 10, rotation: 0, sort_order: nextOrder
    }).select("id,event_id,type,label,emoji,x,y,width,height,rotation,sort_order").single();
    if (error) { setMessage("Symbol konnte nicht hinzugefügt werden: " + error.message); return; }
    setPlanObjects(prev => [...prev, data]);
    setMessage(`✅ ${symbol.name || "Symbol"} wurde zum Saalplan hinzugefügt.`);
  }

  async function resetPlanObjects() {
    if (readOnly || !selectedEventId) return;
    if (!window.confirm("Alle frei hinzugefügten Symbole werden entfernt und Eingang, Kasse, Bühne, Palme und Fensterfront auf die Standardposition gesetzt. Fortfahren?")) return;
    setSeatBusy(true);
    try {
      await supabase.from("event_plan_objects").delete().eq("event_id", selectedEventId);
      const rows = DEFAULT_PLAN_OBJECTS.map((obj, index) => ({
        event_id: selectedEventId, type: obj.type, label: obj.label, emoji: obj.emoji || null,
        x: obj.x, y: obj.y, width: obj.width, height: obj.height, rotation: obj.rotation || 0, sort_order: index + 10
      }));
      const { data, error } = await supabase.from("event_plan_objects").insert(rows).select("id,event_id,type,label,emoji,x,y,width,height,rotation,sort_order");
      if (error) throw error;
      setPlanObjects(data || []);
      setMessage("✅ Saalplan-Elemente wurden zurückgesetzt.");
    } catch (error) {
      setMessage("Saalplan-Elemente konnten nicht zurückgesetzt werden: " + (error?.message || error));
    } finally {
      setSeatBusy(false);
    }
  }

  async function deleteEvent() {
    if (readOnly || !selectedEventId) return;
    if (!window.confirm("Veranstaltung und alle zugehörigen Sitzplätze/Reservierungen wirklich löschen?")) return;
    const { error } = await supabase.from("events").delete().eq("id", selectedEventId);
    if (error) { setMessage("Fehler beim Löschen: " + error.message); return; }
    setSelectedEventId(""); setSeats([]); setReservations([]); setForm({ title: "", starts_at: "", admission_at: "", ends_at: "", location: "", description: "", published: false }); await loadEvents();
  }

  async function addSeat(e) {
    e.preventDefault();
    if (readOnly || !selectedEventId) return;
    if (!seatForm.label.trim()) return alert("Bitte eine Bezeichnung eingeben.");
    setSeatBusy(true);
    const { error } = await supabase.from("event_seats").insert({ event_id: selectedEventId, label: seatForm.label.trim(), capacity: Number(seatForm.capacity) || 1, x: Number(seatForm.x), y: Number(seatForm.y), width: Number(seatForm.width), height: Number(seatForm.height), shape: seatForm.shape, sort_order: seats.length });
    if (error) setMessage("Fehler beim Anlegen des Platzes: " + error.message);
    else { setMessage("✅ Sitzplatz hinzugefügt."); await loadEventDetails(selectedEventId); setSeatForm(prev => ({ ...prev, label: `Tisch ${seats.length + 2}` })); }
    setSeatBusy(false);
  }

  async function loadOriginalSeatPlan() {
    if (readOnly || !selectedEventId) return;
    if (reservations.some(r => r.status === "reserved")) {
      setMessage("⚠️ Der Saalplan kann nicht ersetzt werden, solange Reservierungen bestehen. Bitte zuerst die Reservierungen stornieren.");
      return;
    }
    if (seats.length > 0 && !window.confirm("Der vorhandene Saalplan wird durch die Vorlage ersetzt. Wirklich fortfahren?")) return;
    setSeatBusy(true); setMessage("");
    try {
      const { data: seatCount, error } = await supabase.rpc("admin_create_event_seat_plan", { p_event_id: selectedEventId });
      if (error) throw error;
      await loadEventDetails(selectedEventId);
      setMessage(`✅ Originalplan Enzpavillon mit ${seatCount || 108} Sitzplätzen wurde übernommen. Reservierungen werden nicht übernommen.`);
    } catch (error) {
      setMessage("Saalplan konnte nicht angelegt werden: " + (error?.message || error));
    } finally {
      setSeatBusy(false);
    }
  }

  async function deleteEventTable(tableNumber) {
    if (readOnly || !selectedEventId || !tableNumber) return;
    const group = seats.filter(s => String(s.label || "").match(/^Tisch\s+\d+/i)?.[0] === `Tisch ${tableNumber}`);
    if (!group.length) return;
    const reserved = group.some(s => activeReservations.some(r => String(r.seat_id || "") === String(s.id) && r.status === "reserved"));
    if (reserved) {
      setMessage(`⚠️ Tisch ${tableNumber} kann nicht gelöscht werden, solange dort reservierte Plätze bestehen.`);
      return;
    }
    if (!window.confirm(`Tisch ${tableNumber} mit ${group.length} Plätzen wirklich löschen?`)) return;
    setSeatBusy(true);
    try {
      const { error } = await supabase.from("event_seats").delete().in("id", group.map(s => s.id));
      if (error) throw error;
      await loadEventDetails(selectedEventId);
      setMessage(`✅ Tisch ${tableNumber} wurde gelöscht.`);
    } catch (error) {
      setMessage("Tisch konnte nicht gelöscht werden: " + (error?.message || error));
    } finally {
      setSeatBusy(false);
    }
  }

  async function deleteSeat(seat) {
    if (readOnly) return;
    if (!window.confirm(`${seat.label} wirklich löschen?`)) return;
    const { error } = await supabase.from("event_seats").delete().eq("id", seat.id);
    if (error) { setMessage("Fehler beim Löschen: " + error.message); return; }
    await loadEventDetails(selectedEventId);
  }

  async function cancelReservation(reservationId) {
    if (readOnly) return;
    if (!window.confirm("Diese Reservierung wirklich aufheben?")) return;
    const { error } = await supabase.from("event_reservations").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", reservationId).eq("status", "reserved");
    if (error) { setMessage("Reservierung konnte nicht aufgehoben werden: " + error.message); return; }
    await loadEventDetails(selectedEventId);
  }

  const selectedEvent = events.find(e => String(e.id) === String(selectedEventId));
  const activeReservations = reservations.filter(r => r.status === "reserved");
  const capacity = seats.reduce((sum, s) => sum + Number(s.capacity || 1), 0);

  const normalizedReservationSearch = reservationSearch.trim().toLocaleLowerCase("de-DE");
  const visibleReservations = activeReservations
    .filter(r => {
      if (!normalizedReservationSearch) return true;
      const haystack = [
        r.display_name,
        r.email,
        r.seat_label
      ].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
      return haystack.includes(normalizedReservationSearch);
    })
    .slice()
    .sort((a, b) => {
      if (reservationSort === "seat") {
        return String(a.seat_label || "").localeCompare(String(b.seat_label || ""), "de-DE", { numeric: true, sensitivity: "base" });
      }
      return String(a.display_name || a.email || "Unbekannt").localeCompare(
        String(b.display_name || b.email || "Unbekannt"),
        "de-DE",
        { sensitivity: "base" }
      ) || String(a.seat_label || "").localeCompare(String(b.seat_label || ""), "de-DE", { numeric: true });
    });

  function printReservationList() {
    if (!selectedEvent) return;
    const rows = visibleReservations.map((r, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${String(r.display_name || "Unbekannt").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]))}</strong><br><span>${String(r.email || "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]))}</span></td>
        <td>${String(r.seat_label || "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]))}</td>
        <td>${r.checked_in_at ? "Eingecheckt" : "Offen"}</td>
      </tr>
    `).join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Reservierungsliste – ${selectedEvent.title}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#222;font-size:14pt}h1{margin:0 0 10px;font-size:22pt}p{color:#666;margin:0 0 18px;font-size:14pt}table{width:100%;border-collapse:collapse}th,td{padding:11px 10px;border-bottom:1px solid #ddd;text-align:left;font-size:14pt}th{background:#f4efff;color:#4c2b83}td span{color:#666;font-size:14pt}</style>
      </head><body><h1>📋 Reservierungsliste</h1><p>${selectedEvent.title} · ${selectedEvent.starts_at ? formatEventDateTime(selectedEvent.starts_at).date : ""} · alphabetisch</p>
      <table><thead><tr><th>Nr.</th><th>Name / E-Mail</th><th>Sitzplatz</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>Keine Reservierungen</td></tr>"}</tbody></table>
      <p style="margin-top:18px"><strong>${visibleReservations.length}</strong> reservierte Plätze in dieser Ansicht.</p></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  return (
    <div>
      <div className="hero">
        <h2>🎟️ Veranstaltungen</h2>
        <p>Veranstaltungen und Sitzplätze verwalten.</p>
      </div>
      {message && <div className="notice" style={{ marginBottom: 12 }}>{message}</div>}
      <div style={{ display: "grid", gap: 12 }}>
        <div className="profile-card" style={{ padding: 14 }}>
          <h3 style={{ margin: "2px 0 10px" }}>📋 Veranstaltungen</h3>
          {loading ? <div className="muted">Lade Veranstaltungen …</div> : events.length === 0 ? <div className="muted">Noch keine Veranstaltungen angelegt.</div> : (
            <div style={{ display: "grid", gap: 7 }}>
              {events.map(event => <button key={event.id} type="button" onClick={() => selectEvent(event)} style={{ textAlign: "left", borderRadius: 12, border: String(selectedEventId) === String(event.id) ? "2px solid #7c3aed" : "1px solid #e4dff0", background: String(selectedEventId) === String(event.id) ? "#f5efff" : "#fff", padding: "10px 12px", cursor: "pointer" }}><strong>{event.published ? "🟢" : "⚪"} {event.title}</strong><div className="muted" style={{ marginTop: 3 }}>{formatEventDateTime(event.starts_at).date}{event.location ? ` · ${event.location}` : ""}</div></button>)}
            </div>
          )}
          {!readOnly && <button type="button" className="primary wide" style={{ marginTop: 10 }} onClick={() => { setSelectedEventId(""); setSeats([]); setReservations([]); setForm({ title: "", starts_at: "", admission_at: "", ends_at: "", location: "", description: "", published: true }); setMessage(""); }}>➕ Neue Veranstaltung</button>}
        </div>

        <form className="profile-card" style={{ padding: 14 }} onSubmit={saveEvent}>
          <h3 style={{ margin: "2px 0 10px" }}>{selectedEventId ? "✏️ Veranstaltung bearbeiten" : "➕ Veranstaltung anlegen"}</h3>
          <label>Bezeichnung<input value={form.title} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="z.B. Discofox-Party" required /></label>
          <label>Beginn<input type="datetime-local" value={form.starts_at} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></label>
          <label>Einlass<input type="datetime-local" value={form.admission_at} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, admission_at: e.target.value })} /></label>
          <label>Ende<input type="datetime-local" value={form.ends_at} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></label>
          <label>Ort<input value={form.location} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="z.B. Enzpavillon, Mühlacker" /></label>
          <label>Beschreibung<textarea rows={4} maxLength={1000} value={form.description} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.published} disabled={readOnly || eventBusy} onChange={e => setForm({ ...form, published: e.target.checked })} style={{ width: "auto" }} /> Veranstaltung veröffentlichen</label>
          {!readOnly && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="primary" disabled={eventBusy}>{eventBusy ? "Speichern …" : "💾 Speichern"}</button>{selectedEventId && <button type="button" className="ghost" onClick={deleteEvent}>🗑️ Löschen</button>}</div>}
          {selectedEventId && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 13, background: "#faf7ff", border: "1px solid #e4d8f3" }}>
              <div style={{ fontWeight: 900, color: "#5b22c7", marginBottom: 5 }}>🔗 Öffentlicher Veranstaltungslink</div>
              <div className="muted" style={{ fontSize: 12, wordBreak: "break-all", marginBottom: 9 }}>{getPublicEventUrl(selectedEventId)}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="ghost" onClick={() => copyPublicEventLink(selectedEventId).then(() => setMessage("✅ Veranstaltungslink wurde kopiert." )).catch(() => setMessage("Der Link konnte nicht kopiert werden."))}>📋 Link kopieren</button>
                <button type="button" className="ghost" onClick={() => window.open(getPublicEventUrl(selectedEventId), "_blank", "noopener,noreferrer")}>🔗 Link öffnen</button>
              </div>
              {!form.published && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Noch nicht veröffentlicht: Der Link kann bereits für den Flyer verwendet werden. Die Sitzplatzreservierung wird erst nach dem Veröffentlichen freigegeben.</div>}
            </div>
          )}
        </form>

        {selectedEventId && (
          <div className="profile-card" style={{ padding: 14 }}>
            <h3 style={{ margin: "2px 0 10px" }}>🪑 Saalplan</h3>
            <p className="muted" style={{ marginTop: 0 }}>Tische und Sitzplätze sind bewusst kompakt dargestellt. Der <strong>Originalplan Enzpavillon</strong> enthält die aktuelle Tisch-, Sitzplatz- und Objektanordnung als feste Vorlage. Beim Übernehmen werden nur Sitzplätze und Saalplan-Elemente kopiert – <strong>keine Reservierungen</strong>. Der Plan selbst kann per Finger/Maus verschoben und mit +/− vergrößert werden. Im Bearbeitungsmodus lassen sich Tische sowie Eingang, Kasse, Bühne, Pflanzen und weitere Symbole verschieben und in der Größe ändern.</p>
            {!readOnly && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button type="button" className="primary" onClick={loadOriginalSeatPlan} disabled={seatBusy}>{seatBusy ? "⏳ Originalplan wird übernommen …" : "🏛️ Originalplan Enzpavillon übernehmen"}</button>
            </div>}
            {!readOnly && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <button type="button" className={seatEditMode ? "primary" : "ghost"} onClick={() => setSeatEditMode(v => !v)} disabled={seatBusy}>{seatEditMode ? "✅ Bearbeiten beenden" : "✏️ Saalplan bearbeiten"}</button>
              {seatEditMode && <span className="muted" style={{ fontWeight: 700 }}>Tisch mit Finger greifen und verschieben – Änderungen werden automatisch gespeichert.</span>}{seatEditMode && <button type="button" className="ghost" onClick={resetPlanObjects} disabled={seatBusy}>↩ Elemente zurücksetzen</button>}
            </div>}
            <EventSeatPlan seats={seats.map(s => ({ ...s, seat_id: s.id }))} compact editable={seatEditMode} disabled={seatBusy} onTableMove={moveEventTable} onTableDelete={deleteEventTable} planObjects={planObjects} onObjectMove={movePlanObject} onObjectResize={resizePlanObject} onObjectDelete={deletePlanObject} symbolLibrary={symbolLibrary} onAddSymbol={addPlanSymbol} />
            {!readOnly && seatEditMode && seats.length > 0 && <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#faf7ff", border: "1px solid #e1d5f5" }}>
              <h4 style={{ margin: "0 0 9px" }}>⚙️ Plätze pro Tisch</h4>
              <div style={{ display: "grid", gap: 7 }}>
                {groupEventSeatsByTable(seats).map(([key, group]) => {
                  const match = String(key).match(/(\d+)/); const tableNumber = match ? Number(match[1]) : null;
                  if (!tableNumber) return null;
                  const count = group.length;
                  return <div key={`seat-count-${key}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 11, background: "#fff", border: "1px solid #e5e0eb" }}>
                    <strong>Tisch {tableNumber}</strong>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {[4,6,8].map(n => <button key={n} type="button" className={count === n ? "primary" : "ghost"} onClick={() => changeEventTableSeatCount(tableNumber, n)} disabled={seatBusy} style={{ minWidth: 48, padding: "7px 9px" }}>{n}</button>)}
                      <button type="button" className="ghost" onClick={() => deleteEventTable(tableNumber)} disabled={seatBusy} style={{ minWidth: 40, padding: "7px 9px" }} title={`Tisch ${tableNumber} löschen`}>🗑️</button>
                    </div>
                  </div>;
                })}
              </div>
            </div>}
            {!readOnly && <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>⚙️ Einzelnen Platz zusätzlich anlegen</summary>
              <form onSubmit={addSeat} style={{ marginTop: 10, padding: 12, borderRadius: 14, background: "#faf7ff", border: "1px solid #e1d5f5" }}>
              <h4 style={{ margin: "0 0 8px" }}>➕ Tisch / Platz hinzufügen</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                <label>Bezeichnung<input value={seatForm.label} onChange={e => setSeatForm({ ...seatForm, label: e.target.value })} /></label>
                <label>Plätze<input type="number" min="1" value={seatForm.capacity} onChange={e => setSeatForm({ ...seatForm, capacity: e.target.value })} /></label>
                <label>X %<input type="number" min="0" max="100" value={seatForm.x} onChange={e => setSeatForm({ ...seatForm, x: e.target.value })} /></label>
                <label>Y %<input type="number" min="0" max="100" value={seatForm.y} onChange={e => setSeatForm({ ...seatForm, y: e.target.value })} /></label>
                <label>Breite %<input type="number" min="5" max="60" value={seatForm.width} onChange={e => setSeatForm({ ...seatForm, width: e.target.value })} /></label>
                <label>Höhe %<input type="number" min="5" max="40" value={seatForm.height} onChange={e => setSeatForm({ ...seatForm, height: e.target.value })} /></label>
              </div>
              <button className="primary wide" style={{ marginTop: 8 }} disabled={seatBusy}>{seatBusy ? "Wird angelegt …" : "🪑 Platz hinzufügen"}</button>
              </form>
            </details>}
            {seats.length > 0 && <div style={{ marginTop: 12, display: "grid", gap: 7 }}>{seats.map(seat => <div key={seat.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 10px", border: "1px solid #e5e0eb", borderRadius: 11 }}><div><strong>{seat.label}</strong><div className="muted">{seat.capacity} Plätze · X {seat.x}% · Y {seat.y}%</div></div>{!readOnly && <button type="button" className="ghost" onClick={() => deleteSeat(seat)}>🗑️</button>}</div>)}</div>}
          </div>
        )}

      </div>
    </div>
  );
}


function AdminEventReservations({ readOnly = false }) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [reservations, setReservations] = useState([]);
  const [seatOptions, setSeatOptions] = useState([]);
  const [blockName, setBlockName] = useState("");
  const [blockSeatIds, setBlockSeatIds] = useState([]);
  const [openBlockTable, setOpenBlockTable] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [statusTab, setStatusTab] = useState("reserved");

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase.from("events").select("id,title,starts_at,published").order("starts_at", { ascending: true, nullsFirst: false });
    if (error) setMessage("Veranstaltungen konnten nicht geladen werden: " + error.message);
    else {
      setEvents(data || []);
      if (!selectedEventId && data?.length) setSelectedEventId(data[0].id);
    }
    setLoading(false);
  }

  async function loadReservations(eventId = selectedEventId) {
    if (!eventId) { setReservations([]); setSeatOptions([]); return; }
    const [{ data, error }, { data: seatData, error: seatError }] = await Promise.all([
      supabase.rpc("admin_get_event_overview", { p_event_id: eventId }),
      supabase.from("event_seats").select("id,label,capacity,sort_order").eq("event_id", eventId).order("sort_order").order("label")
    ]);
    if (error) setMessage("Reservierungen konnten nicht geladen werden: " + error.message);
    else { setReservations(data || []); setMessage(""); }
    if (seatError) setMessage("Sitzplätze konnten nicht geladen werden: " + seatError.message);
    setSeatOptions(seatData || []);
  }

  const freeSeatOptions = seatOptions.filter(seat =>
    !reservations.some(r => String(r.seat_id) === String(seat.id) && r.status === "reserved")
  );
  const blockSeatGroups = Object.entries(freeSeatOptions.reduce((map, seat) => {
    const match = String(seat.label || "").match(/^Tisch\s*(\d+)/i);
    const table = match ? `Tisch ${match[1]}` : "Weitere Plätze";
    (map[table] ||= []).push(seat);
    return map;
  }, {})).sort((a, b) => a[0].localeCompare(b[0], "de-DE", { numeric: true }));

  async function blockSeat() {
    if (readOnly || !selectedEventId || !blockSeatIds.length) return;
    const name = blockName.trim();
    if (!name) { setMessage("Bitte einen Namen für die Sperre eingeben, z. B. „Familie Müller“ oder „Verein XY“."); return; }
    setLoading(true);

    const results = [];
    for (const seatId of blockSeatIds) {
      const result = await supabase.rpc("admin_block_event_seat", {
        p_event_id: selectedEventId,
        p_seat_id: seatId,
        p_block_name: name
      });
      results.push({ seatId, error: result.error });
    }

    const failed = results.filter(r => r.error);
    const successful = results.length - failed.length;

    if (failed.length) {
      const firstError = failed[0]?.error?.message || "Unbekannter Fehler";
      setMessage(`⚠️ ${successful} Platz${successful === 1 ? "" : "e"} blockiert, ${failed.length} konnten nicht blockiert werden: ${firstError}`);
      if (successful) await loadReservations(selectedEventId);
    } else {
      setBlockName("");
      setBlockSeatIds([]);
      setOpenBlockTable("");
      setMessage(`🔒 ${successful} ${successful === 1 ? "Sitzplatz wurde" : "Sitzplätze wurden"} für die öffentliche Reservierung gesperrt.`);
      await loadReservations(selectedEventId);
    }
    setLoading(false);
  }

  async function unblockSeat(blockIds, tableLabel = "Tisch") {
    if (readOnly) return;
    const ids = (Array.isArray(blockIds) ? blockIds : [blockIds]).map(String).filter(Boolean);
    if (!ids.length) return;
    const count = ids.length;
    if (!window.confirm(`${tableLabel} mit ${count} ${count === 1 ? "blockiertem Sitzplatz" : "blockierten Sitzplätzen"} wieder für die öffentliche Reservierung freigeben?`)) return;
    setLoading(true);
    const results = [];
    for (const blockId of ids) {
      const { error } = await supabase.rpc("admin_unblock_event_seat", { p_block_id: blockId });
      results.push(error);
    }
    const failed = results.filter(Boolean);
    if (failed.length) {
      setMessage(`⚠️ ${count - failed.length} Platz${count - failed.length === 1 ? "" : "e"} freigegeben, ${failed.length} konnten nicht freigegeben werden: ${failed[0]?.message || "Unbekannter Fehler"}`);
    } else {
      setMessage(`✅ ${tableLabel}: ${count} ${count === 1 ? "Sitzplatz wurde" : "Sitzplätze wurden"} wieder für die öffentliche Reservierung freigegeben.`);
    }
    await loadReservations(selectedEventId);
    setLoading(false);
  }

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { loadReservations(); }, [selectedEventId]);

  const selectedEvent = events.find(e => String(e.id) === String(selectedEventId));
  const active = reservations.filter(r => r.status === "reserved");
  const cancelled = reservations.filter(r => r.status === "cancelled");
  const current = statusTab === "cancelled" ? cancelled : active;
  const q = search.trim().toLocaleLowerCase("de-DE");
  const visible = current.filter(r => {
    if (!q) return true;
    return [r.display_name, r.email, r.seat_label].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(q);
  }).slice().sort((a,b) => {
    if (sort === "seat") return String(a.seat_label || "").localeCompare(String(b.seat_label || ""), "de-DE", { numeric:true });
    return String(a.display_name || a.email || "Unbekannt").localeCompare(String(b.display_name || b.email || "Unbekannt"), "de-DE", { sensitivity:"base" }) || String(a.seat_label || "").localeCompare(String(b.seat_label || ""), "de-DE", { numeric:true });
  });

  const groupedVisible = Object.values(visible.reduce((map, r) => {
    let key;
    if (r.entry_type === "admin_block") {
      const label = String(r.seat_label || "");
      const tableMatch = label.match(/^Tisch\s*(\d+)/i);
      // Veranstalter-Sperren werden nach Tisch zusammengefasst, damit z.B.
      // T17/1 bis T17/6 nur noch als ein Eintrag erscheinen.
      key = tableMatch
        ? `block-table|${tableMatch[1]}`
        : `block-other|${String(r.display_name || r.block_id || r.seat_id || "").toLowerCase()}`;
    } else {
      key = `${String(r.user_id || "").toLowerCase()}|${String(r.email || "").toLowerCase()}|${String(r.display_name || "").toLowerCase()}`;
    }
    if (!map[key]) {
      const isBlock = r.entry_type === "admin_block";
      const tableMatch = String(r.seat_label || "").match(/^Tisch\s*(\d+)/i);
      map[key] = {
        key,
        display_name: isBlock ? (tableMatch ? `Tisch ${tableMatch[1]}` : (r.display_name || "Vorab blockiert")) : (r.display_name || "Unbekannt"),
        email: isBlock ? "🔒 Vom Veranstalter blockiert" : (r.email || ""),
        rows: []
      };
    }
    map[key].rows.push(r);
    return map;
  }, {})).map(g => ({
    ...g,
    rows: g.rows.slice().sort((a,b) => String(a.seat_label || "").localeCompare(String(b.seat_label || ""), "de-DE", { numeric:true })),
    checkedIn: g.rows.length > 0 && g.rows.every(r => Boolean(r.checked_in_at)),
    seatSummary: (() => {
      const labels = g.rows.map(r => String(r.seat_label || "").trim()).filter(Boolean);
      const byTable = {};
      labels.forEach(label => {
        const m = label.match(/^Tisch\s*(\d+)\s*[·\-]?\s*Platz\s*(\d+)$/i);
        if (m) (byTable[m[1]] ||= []).push(Number(m[2]));
      });
      const parts = [];
      Object.keys(byTable).sort((a,b) => Number(a)-Number(b)).forEach(table => {
        const nums = [...new Set(byTable[table])].sort((a,b)=>a-b);
        if (nums.length === 1) parts.push(`T${table}/${nums[0]}`);
        else {
          const ranges=[]; let start=nums[0], prev=nums[0];
          for (let i=1;i<nums.length;i++) {
            if (nums[i] === prev+1) prev=nums[i];
            else { ranges.push(start===prev ? String(start) : `${start}–${prev}`); start=prev=nums[i]; }
          }
          if (nums.length) ranges.push(start===prev ? String(start) : `${start}–${prev}`);
          parts.push(`T${table}/${ranges.join(",")}`);
        }
      });
      const unmatched = labels.filter(label => !/^Tisch\s*\d+\s*[·\-]?\s*Platz\s*\d+$/i.test(label));
      return parts.concat(unmatched).join(" · ");
    })()
  }));

  async function cancelReservation(reservationId, options = {}) {
    if (readOnly) return false;
    const ids = Array.isArray(options.ids) ? options.ids.map(String).filter(Boolean) : [String(reservationId || "")].filter(Boolean);
    if (!ids.length) return false;
    if (!options.skipConfirm) {
      const text = ids.length > 1
        ? `Diese Reservierung mit ${ids.length} Sitzplätzen wirklich aufheben?\n\n${options.seatSummary || "Alle zu dieser Reservierung gehörenden Plätze werden freigegeben."}`
        : "Diese Reservierung wirklich aufheben?";
      if (!window.confirm(text)) return false;
    }
    const { error } = await supabase
      .from("event_reservations")
      .update({ status:"cancelled", cancelled_at:new Date().toISOString() })
      .in("id", ids)
      .eq("status","reserved");
    if (error) {
      setMessage("Reservierung konnte nicht aufgehoben werden: " + error.message);
      return false;
    }

    // Auch bei einer Stornierung durch den Volladmin bekommt der Gast
    // eine Stornobestätigung. Bei Teilstornierungen werden die weiterhin
    // reservierten Plätze in der E-Mail zusätzlich angezeigt.
    const emailResult = await sendEventReservationEmail({
      action: "cancelled",
      eventId: selectedEvent?.id,
      reservationIds: ids
    });
    if (!emailResult.ok) {
      setMessage("Reservierung aufgehoben. ⚠️ Die Stornobestätigung konnte nicht versendet werden.");
    } else {
      setMessage("Reservierung aufgehoben. 📧 Stornobestätigung wurde versendet.");
    }

    await loadReservations();
    return true;
  }

  function createReservationPdfBlob() {
    if (!selectedEvent) return null;

    const safe = value => String(value ?? "")
      .replace(/[\r\n]+/g, " ")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/·/g, "-")
      .replace(/[^\x00-\xFF]/g, "?");
    const escPdf = value => safe(value)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

    const PAGE_W = 595, PAGE_H = 842, LEFT = 35, RIGHT = 560, TOP = 795, BOTTOM = 45;
    const COL = { name: 78, table: 270, notes: 365, email: 445 };
    const pages = [];
    let commands = [];
    let y = TOP;

    const newPage = () => {
      if (commands.length) pages.push(commands);
      commands = [];
      y = TOP;
    };
    const ensure = h => { if (y - h < BOTTOM) newPage(); };
    const drawText = (x, yy, value, size=10.5, bold=false) => {
      commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${yy} Tm (${escPdf(value)}) Tj ET`);
    };
    const line = (x1,y1,x2,y2) => commands.push(`0.7 w ${x1} ${y1} m ${x2} ${y2} l S`);
    const rectFill = (x, yy, w, h) => commands.push(`0.94 g ${x} ${yy} ${w} ${h} re f 0 g`);
    const truncate = (value, maxChars) => {
      const s = safe(value);
      return s.length > maxChars ? `${s.slice(0, Math.max(0, maxChars - 3))}...` : s;
    };

    const isBlockedGroup = g => g.rows.some(r => r.entry_type === "admin_block");
    const reservedGroups = groupedVisible.filter(g => !isBlockedGroup(g));
    const blockedGroups = groupedVisible.filter(g => isBlockedGroup(g));

    drawText(LEFT, y, "Reservierungsliste", 20, true); y -= 28;
    drawText(LEFT, y, safe(selectedEvent.title), 14, true); y -= 20;
    const eventDate = selectedEvent.starts_at ? formatEventDateTime(selectedEvent.starts_at).date : "";
    drawText(LEFT, y, `${eventDate} - ${reservedGroups.length} Personen - ${reservedGroups.reduce((sum, g) => sum + g.rows.length, 0)} Plätze`, 12);
    y -= 24;

    const drawTableHeader = () => {
      ensure(28);
      rectFill(LEFT, y - 4, RIGHT - LEFT, 22);
      drawText(LEFT + 5, y, "Nr.", 10, true);
      drawText(COL.name, y, "Name", 10, true);
      drawText(COL.table, y, "Tisch / Plätze", 10, true);
      drawText(COL.notes, y, "Notizen", 10, true);
      drawText(COL.email, y, "E-Mail", 10, true);
      y -= 24;
      line(LEFT, y, RIGHT, y);
      y -= 10;
    };

    const drawGroupRow = (g, index, blocked = false) => {
      ensure(28);
      const seats = g.seatSummary || g.rows.map(r => r.seat_label || "Sitzplatz").join(" - ");
      const notes = blocked ? "Vom Veranstalter blockiert" : safe(g.notes || g.rows[0]?.notes || "");
      const email = blocked ? "" : truncate(g.email || "", 27);
      drawText(LEFT + 5, y, `${index + 1}.`, 10, true);
      drawText(COL.name, y, safe(g.display_name || "Unbekannt"), 10, true);
      drawText(COL.table, y, safe(seats), 10);
      drawText(COL.notes, y, notes, 9.5);
      drawText(COL.email, y, email, 9.5);
      y -= 20;
      line(LEFT, y, RIGHT, y);
      y -= 7;
    };

    drawTableHeader();
    if (!reservedGroups.length) {
      drawText(LEFT + 5, y, "Keine reservierten Plätze.", 10.5);
      y -= 20;
    } else {
      reservedGroups.forEach((g, index) => drawGroupRow(g, index, false));
    }

    if (blockedGroups.length) {
      y -= 12;
      ensure(42);
      drawText(LEFT, y, "Blockierte Plätze (vom Veranstalter)", 14, true);
      y -= 20;
      drawTableHeader();
      blockedGroups.forEach((g, index) => drawGroupRow(g, index, true));
    }

    if (commands.length) pages.push(commands);

    const objects = [];
    const pageIds = [];
    const contentIds = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push("");
    pages.forEach(cmds => {
      const stream = cmds.join("\n");
      contentIds.push(objects.length + 1);
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      pageIds.push(objects.length + 1);
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${objects.length + 2} 0 R /F2 ${objects.length + 3} 0 R >> >> /Contents ${contentIds[contentIds.length-1]} 0 R >>`);
    });
    const font1Id = objects.length + 1;
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const font2Id = objects.length + 1;
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    let pageIndex = 0;
    pages.forEach(() => {
      const objIndex = pageIds[pageIndex] - 1;
      objects[objIndex] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${contentIds[pageIndex]} 0 R >>`;
      pageIndex++;
    });
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [0];
    objects.forEach((obj, index) => {
      offsets[index + 1] = pdf.length;
      pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: "application/pdf" });
  }

  async function createAndShareReservationPdf() {
    if (!selectedEvent || !visible.length) {
      alert("Es gibt keine Reservierungen zum Erstellen einer PDF.");
      return;
    }
    const blob = createReservationPdfBlob();
    if (!blob) return;
    const safeName = String(selectedEvent.title || "Reservierungen").replace(/[^\wäöüÄÖÜß-]+/g, "-").replace(/^-|-$/g, "");
    const file = new File([blob], `Reservierungen-${safeName || "Liste"}.pdf`, { type: "application/pdf" });

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: "Reservierungsliste",
          text: `${selectedEvent.title} - Reservierungsliste`,
          files: [file]
        });
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div style={{ paddingBottom: 130 }}>
      <div className="hero">
        <h2>🎟️ Reservierungen & Einlass</h2>
        <p>Reservierungsliste, Stornierungen und Einlasskontrolle getrennt vom Saalplan.</p>
      </div>
      <div style={{ display:"grid", gap:12 }}>
        <div className="profile-card" style={{ padding:14 }}>
          <h3 style={{ margin:"2px 0 10px" }}>📅 Veranstaltung auswählen</h3>
          {loading ? <div className="muted">Lade Veranstaltungen …</div> : <div style={{ display:"grid", gap:7 }}>
            {events.map(event => <button key={event.id} type="button" onClick={() => setSelectedEventId(event.id)} style={{ textAlign:"left", borderRadius:12, border:String(selectedEventId)===String(event.id)?"2px solid #7c3aed":"1px solid #e4dff0", background:String(selectedEventId)===String(event.id)?"#f5efff":"#fff", padding:"10px 12px", cursor:"pointer" }}><strong>{event.published?"🟢":"⚪"} {event.title}</strong><div className="muted" style={{ marginTop:3 }}>{formatEventDateTime(event.starts_at).date}</div></button>)}
          </div>}
        </div>

        {selectedEventId && <>
          {!readOnly && <div className="profile-card seat-block-card">
            <div className="seat-block-head">
              <div>
                <div className="seat-block-title">🔒 Plätze vorab blockieren</div>
                <div className="seat-block-subtitle">Blockierte Plätze stehen der öffentlichen Sitzplatzreservierung nicht zur Verfügung.</div>
              </div>
              <div className="seat-block-badge">ADMIN</div>
            </div>

            <div className="seat-block-form">
              <label className="seat-block-field">
                <span>Bezeichnung <em>optional</em></span>
                <input value={blockName} onChange={e=>setBlockName(e.target.value)} placeholder="z. B. Familie Müller oder Verein XY" />
              </label>

              <div className="seat-block-field">
                <span>Sitzplatz <em>erforderlich</em></span>
                <details
                  open={Boolean(openBlockTable)}
                  onToggle={e => { if (!e.currentTarget.open) setOpenBlockTable(""); }}
                  className="seat-picker"
                >
                  <summary>
                    <span>{blockSeatIds.length ? `🪑 ${blockSeatIds.length} ${blockSeatIds.length === 1 ? "Platz ausgewählt" : "Plätze ausgewählt"}` : "🪑 Sitzplätze auswählen"}</span>
                    <span className="seat-picker-chevron">⌄</span>
                  </summary>
                  <div className="seat-picker-list">
                    {blockSeatGroups.length === 0 ? (
                      <div className="muted seat-picker-empty">Keine freien Plätze vorhanden.</div>
                    ) : blockSeatGroups.map(([table, group]) => {
                      const isOpen = openBlockTable === table;
                      return (
                        <details key={table} open={isOpen} onToggle={e => setOpenBlockTable(e.currentTarget.open ? table : "")}>
                          <summary className="seat-table-row">
                            <span><strong>{table}</strong><small>{group.length} freie Plätze</small></span>
                            <span>{isOpen ? "−" : "+"}</span>
                          </summary>
                          <div className="seat-options-grid">
                            {group.map(seat => {
                              const seatId = String(seat.id);
                              const selected = blockSeatIds.some(id => String(id) === seatId);
                              return (
                                <button
                                  key={seat.id}
                                  type="button"
                                  className={selected ? "primary" : "ghost"}
                                  aria-pressed={selected}
                                  onClick={() => setBlockSeatIds(prev => selected
                                    ? prev.filter(id => String(id) !== seatId)
                                    : [...prev, seatId]
                                  )}
                                >
                                  {selected ? "☑️" : "☐"} {seat.label.replace(/^Tisch\s*\d+\s*[·-]?\s*/i, "")}
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              </div>

              <div className="seat-block-actions">
                <div className="seat-block-selection">
                  {blockSeatIds.length
                    ? <><strong>{blockSeatIds.length}</strong> {blockSeatIds.length === 1 ? "Platz ausgewählt" : "Plätze ausgewählt"}</>
                    : "Noch keine Plätze ausgewählt"}
                  {blockSeatIds.length > 0 && <button type="button" className="seat-block-clear" onClick={() => setBlockSeatIds([])} disabled={loading}>Auswahl aufheben</button>}
                </div>
                <button type="button" className="primary seat-block-submit" onClick={blockSeat} disabled={loading || !blockSeatIds.length}>
                  🔒 {blockSeatIds.length > 1 ? `${blockSeatIds.length} Plätze blockieren` : "Platz blockieren"}
                </button>
              </div>
            </div>

            <div className="seat-block-note">💡 Der Platz wird sofort für die öffentliche Reservierung gesperrt und unten in der Liste als blockiert angezeigt.</div>
          </div>}
          <div className="profile-card" style={{ padding:14 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
              <div><h3 style={{ margin:"2px 0 3px" }}>📋 Reservierungen</h3><div className="muted">Alphabetisch und unabhängig vom Saalplan.</div></div>
          <button type="button" className="ghost" onClick={createAndShareReservationPdf} disabled={!visible.length}>📄 PDF erstellen/teilen</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:8, marginTop:10 }}>
              <button type="button" className={statusTab==="reserved"?"primary":"ghost"} onClick={()=>setStatusTab("reserved")}>🟢 Bestätigt {active.length}</button>
              <button type="button" className={statusTab==="cancelled"?"primary":"ghost"} onClick={()=>setStatusTab("cancelled")}>⚪ Storniert {cancelled.length}</button>
            </div>
            <div className="reservation-list-controls" style={{ marginTop:10, display:"grid", gridTemplateColumns:"minmax(0,1fr) auto", gap:8 }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔎 Name, E-Mail oder Sitzplatz" />
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{ minWidth:125 }}><option value="name">A–Z Name</option><option value="seat">Tisch / Platz</option></select>
            </div>
            <div style={{ marginTop:9, padding:"8px 10px", borderRadius:11, background:"#f5f0ff", color:"#51339b", fontWeight:800 }}>👥 {groupedVisible.length} Personen · {visible.length} Plätze · {active.length} bestätigt · {cancelled.length} storniert</div>
            {groupedVisible.length===0 ? <div className="muted" style={{ padding:"18px 4px 4px", textAlign:"center" }}>{statusTab==="cancelled"?"Keine Stornierungen.":"Noch keine bestätigten Reservierungen."}</div> : <div style={{ marginTop:9, display:"grid", gap:4 }}>
              {groupedVisible.map((g,index)=><div key={g.key} style={{ display:"grid", gridTemplateColumns:"22px minmax(0,1fr) auto", alignItems:"center", columnGap:6, padding:"4px 2px", borderBottom:"1px solid #e8e3ed", background:"#fff" }}>
                <div style={{ width:22,height:22,flexShrink:0,borderRadius:6,display:"grid",placeItems:"center",background:"#f1eaff",color:"#5b22c7",fontWeight:900,fontSize:10 }}>{index+1}</div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:900, lineHeight:1.15 }}>{g.rows.some(r => r.entry_type === "admin_block") ? "🔒" : (g.checkedIn?"🟢":"🟡")} {g.display_name} <span style={{fontWeight:700,fontSize:12}}>· {g.rows.length} {g.rows.length===1?"Platz":"Plätze"}</span></div>
                  <div className="muted" style={{ fontSize:10.5, overflowWrap:"anywhere", marginTop:1 }}>{g.email||"Keine E-Mail hinterlegt"}</div>
                  <div style={{ marginTop:2, fontWeight:800, fontSize:12.5, lineHeight:1.15, color:"#4f3a78" }}>{g.seatSummary}</div>
                </div>
                <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                  <div className="muted" style={{fontSize:10}}>{g.rows.some(r => r.entry_type === "admin_block") ? "Blockiert" : (g.checkedIn?"Eingecheckt":"Offen")}</div>
                  {statusTab==="reserved" && !readOnly && (g.rows.some(r => r.entry_type === "admin_block")
                    ? <div style={{ marginTop:3, display:"grid", gap:3, justifyItems:"end" }}>
                        <button type="button" className="ghost" onClick={()=>unblockSeat(g.rows.map(r => r.block_id).filter(Boolean), g.display_name)} style={{ padding:"4px 7px", minHeight:28, fontSize:11 }}>Alle freigeben</button>
                        {g.rows.length > 1 && <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"flex-end", gap:3, maxWidth:170 }}>
                          {g.rows.map(r => (
                            <button key={r.block_id || r.seat_id} type="button" className="ghost" onClick={()=>unblockSeat(r.block_id, r.seat_label || "Sitzplatz")} style={{ padding:"3px 6px", minHeight:25, fontSize:10 }}>
                              {String(r.seat_label || "Platz").replace(/^Tisch\s*/i, "T").replace(/\s*·\s*Platz\s*/i, "/")}
                            </button>
                          ))}
                        </div>}
                      </div>
                    : <button type="button" className="ghost" onClick={() => cancelReservation(g.rows[0]?.reservation_id, { ids: g.rows.map(r => r.reservation_id), seatSummary: g.seatSummary })} style={{ marginTop:3, padding:"4px 7px", minHeight:28, fontSize:11 }}>Stornieren</button>)}
                </div>
              </div>)}
            </div>}
          </div>

          <EventCheckinPanel eventId={selectedEventId} readOnly={readOnly} />
        </>}
      </div>
    </div>
  );
}


function HomeMyWorkshops({ user, onOpenWorkshop }) {
  const [myWorkshops, setMyWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Eigene Datumsformatierung für die Startseiten-Kachel.
  // Die Funktion muss lokal verfügbar sein, damit die Kachel nicht
  // von einer innerhalb einer anderen Komponente definierten Funktion abhängt.
  function homeWorkshopDate(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(iso));
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [{ data: interests }, { data: pairs }, { data: registrations }, { data: recurring }] = await Promise.all([
          supabase.from("workshop_interests").select("workshop_id,level").eq("user_id", user.id),
          supabase.from("workshop_pairs").select("workshop_id,user1_id,user2_id").or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
          supabase.from("workshop_registrations").select("workshop_id,user1_id,user2_id,user1_name,user2_name,user1_email,user2_email").or(`user1_id.eq.${user.id},user2_id.eq.${user.id},user1_email.eq.${user.email},user2_email.eq.${user.email}`),
          supabase.rpc("get_my_recurring_workshop_registrations")
        ]);

        const registrationRows = registrations || [];
        const normalizedEmail = String(user.email || "").trim().toLowerCase();
        const belongs = row => row.user1_id === user.id || row.user2_id === user.id ||
          (normalizedEmail && String(row.user1_email || "").trim().toLowerCase() === normalizedEmail) ||
          (normalizedEmail && String(row.user2_email || "").trim().toLowerCase() === normalizedEmail);
        // Eine direkte Workshop-Anmeldung ist eine eigene Anmeldung und darf
        // nicht davon abhängen, ob zusätzlich ein Datensatz in workshop_pairs
        // existiert. Das ist besonders wichtig für vom Admin eingetragene
        // Paaranmeldungen (z.B. Santina + Andreas).
        const activeRegistrations = registrationRows.filter(row =>
          Boolean(row.workshop_id) && belongs(row)
        );

        const ids = [...new Set([
          ...(interests || []).map(x => x.workshop_id),
          ...(pairs || []).map(x => x.workshop_id),
          ...activeRegistrations.map(x => x.workshop_id),
          ...(recurring || []).map(x => x.workshop_id)
        ].filter(Boolean))];

        if (!ids.length) {
          if (mounted) setMyWorkshops([]);
          return;
        }

        const { data: workshops } = await supabase.from("workshops")
          .select("id,title,starts_at,start_time,duration_minutes,recurrence_text,location,workshop_type")
          .in("id", ids).order("starts_at");

        const levelMap = Object.fromEntries((interests || []).map(x => [x.workshop_id, x.level]));
        const recurringMap = {};
        (recurring || []).forEach(row => {
          if (!row.workshop_id) return;
          (recurringMap[row.workshop_id] ||= []).push(row);
        });
        const pairedIds = new Set((pairs || []).map(x => x.workshop_id));
        const partnerMap = {};
        activeRegistrations.forEach(row => {
          const isUser1 = row.user1_id === user.id || (normalizedEmail && String(row.user1_email || "").trim().toLowerCase() === normalizedEmail);
          const partner = isUser1 ? row.user2_name : row.user1_name;
          if (partner) partnerMap[row.workshop_id] = partner;
        });
        const { data: partnerRows } = await supabase.rpc("get_my_workshop_partner_names", { p_user_id: user.id });
        (partnerRows || []).forEach(row => { if (row.workshop_id && row.partner_name) partnerMap[row.workshop_id] = row.partner_name; });

        const list = (workshops || []).map(w => ({
          ...w,
          level: levelMap[w.id] || "",
          paired: pairedIds.has(w.id) || activeRegistrations.some(r => r.workshop_id === w.id),
          partnerName: partnerMap[w.id] || "",
          recurringBookings: recurringMap[w.id] || []
        })).filter(w => isWorkshopVisibleToUser(w) && !isTanzkreisWorkshop(w));

        if (mounted) setMyWorkshops(list);
      } catch (error) {
        console.warn("Meine Workshops konnten auf der Startseite nicht geladen werden:", error);
        if (mounted) setMyWorkshops([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [user.id, user.email]);

  return (
    <section className={`profile-card home-my-workshops-tile ${open ? "is-open" : ""}`} style={{ marginTop: 0, padding: 0, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        width: "100%", border: 0, background: "transparent", color: "inherit", textAlign: "left",
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer"
      }}>
        <div className="home-wide-icon" style={{ background: "#fff", color: "#6f35d9", flexShrink: 0, border: "1.5px solid #d8c2f5" }}>👤📅</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 15.5, color: "#5b22c7", lineHeight: 1.2 }}>Meine Workshops &amp; Tanzpartnersuche</div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
            {loading ? "Workshops werden geladen …" : myWorkshops.length ? `${myWorkshops.length} Workshop${myWorkshops.length === 1 ? "" : "s"} angemeldet` : "Noch für keinen Workshop angemeldet"}
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#6f35d9", flexShrink: 0 }}>{open ? "⌃" : "›"}</div>
      </button>
      {open && !loading && myWorkshops.length > 0 && (
        <div style={{ borderTop: "1px solid #eee" }}>
          {myWorkshops.map(w => (
            <button key={w.id} type="button" onClick={() => onOpenWorkshop?.(w.id)} style={{
              width: "100%", border: 0, borderBottom: "1px solid #eee", background: "#fff", color: "inherit",
              textAlign: "left", display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", cursor: "pointer"
            }}>
              <span style={{ fontSize: 17 }}>📅</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="small" style={{ fontSize: 10, display: "block" }}>
                  {w.recurrence_text ? (w.recurringBookings?.length ? w.recurringBookings.map(r => homeWorkshopDate(`${r.session_date}T12:00:00`)).join(" · ") : w.recurrence_text) : homeWorkshopDate(w.starts_at)}
                </span>
                <strong style={{ display: "block", fontSize: 13, lineHeight: 1.2 }}>{w.title}</strong>
                {w.paired && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#187443", display: "block", marginTop: 2 }}>
                    ✅ Angemeldet als Tanzpaar · 🧑‍🤝‍🧑 {w.partnerName || "Tanzpartner/in"}
                  </span>
                )}
              </span>
              <span style={{ color: "#6f35d9", fontSize: 20 }}>›</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && myWorkshops.length === 0 && (
        <div className="muted" style={{ padding: "0 14px 13px", fontSize: 12 }}>Noch keine eigenen Workshop-Anmeldungen.</div>
      )}
    </section>
  );
}


function HomeMatchProposals({ user, onOpenContacts }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadProposals() {
    if (!user?.id) return;
    try {
      const [{ data: own, error: ownError }, { data: external, error: externalError }] =
        await Promise.all([
          supabase.rpc("get_my_workshop_match_proposals"),
          supabase.rpc("get_my_external_match_proposals")
        ]);

      if (ownError) console.warn("Vermittlungsvorschläge konnten nicht geladen werden:", ownError.message);
      if (externalError) console.warn("Externe Vermittlungsvorschläge konnten nicht geladen werden:", externalError.message);

      const ownRows = (own || []).map(row => ({
        ...row,
        proposalType: "registered",
        personName: row.other_user_name || "Tanzpartner/in"
      }));
      const externalRows = (external || []).map(row => ({
        ...row,
        proposalType: "external",
        personName: row.external_dancer_name || "Externer Tänzer"
      }));

      setProposals([...ownRows, ...externalRows]);
    } catch (error) {
      console.warn("Fehler beim Laden der Vermittlungsvorschläge auf der Startseite:", error);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProposals();
    const interval = setInterval(loadProposals, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  if (loading || proposals.length === 0) return null;

  return (
    <section
      className="profile-card"
      style={{
        marginTop: 10,
        padding: 0,
        overflow: "hidden",
        border: "1px solid #eadcfb",
        background: "#fcf9ff"
      }}
    >
      <button
        type="button"
        onClick={onOpenContacts}
        style={{
          width: "100%",
          border: 0,
          background: "transparent",
          color: "inherit",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          cursor: "pointer"
        }}
      >
        <div
          className="home-wide-icon"
          style={{ background: "#eee5ff", color: "#6f35d9", flexShrink: 0 }}
        >
          🤝
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#5b22c7" }}>
            Tanzpartner-Vorschlag
          </div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
            {proposals.length} neuer {proposals.length === 1 ? "Vorschlag" : "Vorschläge"} – bitte ansehen und entscheiden
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#6f35d9", flexShrink: 0 }}>›</div>
      </button>

      <div style={{ borderTop: "1px solid #eadcfb" }}>
        {proposals.slice(0, 3).map(proposal => {
          const date = proposal.starts_at
            ? new Intl.DateTimeFormat("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
              }).format(new Date(proposal.starts_at))
            : "Termin offen";
          const time = proposal.start_time
            ? String(proposal.start_time).slice(0, 5)
            : (proposal.starts_at
              ? new Intl.DateTimeFormat("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23"
                }).format(new Date(proposal.starts_at))
              : "");

          return (
            <button
              key={`${proposal.proposalType}-${proposal.id}`}
              type="button"
              onClick={onOpenContacts}
              style={{
                width: "100%",
                border: 0,
                borderBottom: "1px solid #eee",
                background: "#fff",
                color: "inherit",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 14px",
                cursor: "pointer"
              }}
            >
              <span style={{ fontSize: 16 }}>🧑‍🤝‍🧑</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: 13, lineHeight: 1.2 }}>
                  {proposal.personName}
                </strong>
                <span className="small" style={{ fontSize: 10, display: "block", marginTop: 2 }}>
                  {proposal.workshop_title || "Workshop"} · {date}{time ? ` · ${time} Uhr` : ""}
                </span>
              </span>
              <span style={{ color: "#6f35d9", fontSize: 18 }}>›</span>
            </button>
          );
        })}

        {proposals.length > 3 && (
          <button
            type="button"
            onClick={onOpenContacts}
            style={{
              width: "100%",
              border: 0,
              background: "#faf7ff",
              color: "#5b22c7",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 800,
              textAlign: "center",
              cursor: "pointer"
            }}
          >
            Alle {proposals.length} Vorschläge ansehen ›
          </button>
        )}
      </div>
    </section>
  );
}

function Dashboard({ session }) {
  const [tab, setTab] = useState("home");
  const [showHomeSupport, setShowHomeSupport] = useState(false);
  const [workshopToOpen, setWorkshopToOpen] = useState(null);
  const [showOnlyFoundPartners, setShowOnlyFoundPartners] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [pendingAvatarCount, setPendingAvatarCount] = useState(0);
  const [foundDancePartners, setFoundDancePartners] = useState([]);

  async function loadNewMessageCount() {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id,is_read")
        .eq("recipient_id", session.user.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) {
        console.warn("Neue Nachrichten konnten nicht geprüft werden:", error.message);
      } else {
        setNewMessageCount((data || []).length);
      }

      const {
        count: pendingRequestCount,
        error: requestError
      } = await supabase
        .from("contact_requests")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", session.user.id)
        .eq("status", "pending");

      if (requestError) {
        console.warn(
          "Offene Kontaktanfragen konnten nicht geprüft werden:",
          requestError.message
        );
      } else {
        setOpenRequestCount(pendingRequestCount || 0);
      }

    } catch (error) {
      console.warn("Fehler beim Prüfen neuer Kontakte:", error);
    }
  }

  async function loadFoundDancePartners() {
    try {
      const { data: pairs, error: pairError } = await supabase
        .from("workshop_pairs")
        .select("workshop_id")
        .or(
          `user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`
        );

      if (pairError) {
        console.warn("Gefundene Tanzpartner konnten nicht geladen werden:", pairError.message);
        return;
      }

      const workshopIds = [...new Set((pairs || []).map(row => row.workshop_id).filter(Boolean))];

      if (workshopIds.length === 0) {
        setFoundDancePartners([]);
        return;
      }

      const [{ data: workshopRows }, { data: partnerRows, error: partnerError }] = await Promise.all([
        supabase
          .from("workshops")
          .select("id,title,starts_at,start_time,duration_minutes,recurrence_text,level,trainer_name,workshop_type")
          .in("id", workshopIds)
          .order("starts_at"),
        supabase.rpc("get_my_workshop_partner_names", {
          p_user_id: session.user.id
        })
      ]);

      if (partnerError) {
        console.warn("Tanzpartner-Namen konnten nicht geladen werden:", partnerError.message);
      }

      const namesByWorkshop = Object.fromEntries(
        (partnerRows || [])
          .filter(row => row && row.workshop_id != null && row.partner_name)
          .map(row => [String(row.workshop_id), row.partner_name])
      );

      const result = (workshopRows || [])
        .filter(w => namesByWorkshop[String(w.id)])
        .map(w => ({
          id: w.id,
          title: w.title,
          starts_at: w.starts_at,
          start_time: w.start_time,
          recurrence_text: w.recurrence_text,
          partnerName: namesByWorkshop[String(w.id)]
        }));

      setFoundDancePartners(result);
    } catch (error) {
      console.warn("Fehler beim Laden der gefundenen Tanzpartner:", error);
    }
  }

  useEffect(() => {
    loadNewMessageCount();
    loadFoundDancePartners();
    const interval = setInterval(() => {
      loadNewMessageCount();
      loadFoundDancePartners();
      }, 30000);

    const handleMessageRead = event => {
      if (event.detail?.userId === session.user.id) {
        loadNewMessageCount();
      }
    };

    window.addEventListener(
      "tanzpartnerboerse-message-read",
      handleMessageRead
    );

    return () => {
      clearInterval(interval);
      window.removeEventListener(
        "tanzpartnerboerse-message-read",
        handleMessageRead
      );
    };
  }, [session.user.id]);

  // Startseiten-Kacheln für Nachrichten/Kontakte.
  // Beide Aktionen öffnen bewusst den bestehenden Bereich „Kontakte“,
  // der dort auch den Chat bereitstellt.
  function openChat() {
    setTab("kontakte");
  }

  function openContacts() {
    setTab("kontakte");
  }

  const isAdmin = session.user.id === ADMIN_USER_ID;
  // Ein vorhandenes Profil mit admin_read_only=true ist jetzt der sichere
  // Demo-Account: komplette App + aktuelle Live-Daten, aber keine echten Schreibaktionen.
  const isDemoAccount = Boolean(profile?.admin_read_only) && !isAdmin;
  const hasAdminAccess = isAdmin || isDemoAccount;

  async function loadPendingAvatarCount() {
    if (!isAdmin && !isDemoAccount) {
      setPendingAvatarCount(0);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_pending_avatar_reviews");

      if (error) {
        console.warn(
          "Offene Profilfoto-Freigaben konnten nicht geprüft werden:",
          error.message
        );
        return;
      }

      setPendingAvatarCount(Array.isArray(data) ? data.length : 0);
    } catch (error) {
      console.warn("Fehler beim Prüfen offener Profilfoto-Freigaben:", error);
    }
  }

  useEffect(() => {
    loadPendingAvatarCount();
    const interval = setInterval(loadPendingAvatarCount, 30000);
    return () => clearInterval(interval);
  }, [session.user.id, isAdmin, isDemoAccount]);

  async function logout() {
    supabase = realSupabase;
    await realSupabase.auth.signOut();
  }

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setProfileLoading(true);

      const { data, error } = await realSupabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Profil konnte nicht geladen werden:", error);
      }

      setProfile(data || null);
      // Das bestehende Feld admin_read_only wird ab jetzt als Demo-Account-
      // Kennzeichen verwendet. Es bleibt damit ohne zusätzliche Anmeldung
      // direkt am vorhandenen Profil hängen.
      supabase = data?.admin_read_only
        ? createTrainingSupabaseClient(realSupabase)
        : realSupabase;
      setProfileLoading(false);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session.user.id]);

  const displayName =
    profile?.display_name ||
    session.user.user_metadata?.display_name ||
    "Tanzfreund";

  const profileCompletion = getProfileCompletion(profile, session.user);

  return (
    <div className="app">
      <style>{`
        @media (max-width: 560px) {
          .reservation-list-controls {
            grid-template-columns: 1fr !important;
          }
        }

        .seat-block-card {
          padding: 18px !important;
          border: 1px solid #e7e1ef !important;
          border-radius: 18px !important;
          background: #fff !important;
          box-shadow: 0 4px 16px rgba(31, 24, 45, .05);
        }
        .seat-block-head {
          display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
          padding-bottom:14px; border-bottom:1px solid #eee9f3;
        }
        .seat-block-title { font-size:20px; font-weight:900; line-height:1.2; color:#25222b; }
        .seat-block-subtitle { margin-top:5px; color:#77727d; font-size:14px; line-height:1.35; max-width:680px; }
        .seat-block-badge { flex:0 0 auto; padding:5px 9px; border:1px solid #ddd3ed; border-radius:999px; background:#faf8fd; color:#6f38c8; font-size:10px; font-weight:900; letter-spacing:.08em; }
        .seat-block-form { display:grid; grid-template-columns:minmax(220px, .85fr) minmax(300px, 1.5fr) auto; gap:12px; align-items:end; padding-top:15px; }
        .seat-block-field > span { display:flex; align-items:center; gap:6px; margin:0 0 6px; font-size:13px; font-weight:900; color:#302b36; }
        .seat-block-field > span em { font-style:normal; font-weight:700; color:#9a94a0; font-size:11px; }
        .seat-block-field input { width:100%; box-sizing:border-box; min-height:48px; border:1px solid #ddd7e5; border-radius:12px; padding:11px 13px; background:#fff; }
        .seat-picker { position:relative; width:100%; box-sizing:border-box; border:1px solid #dcd5e4; border-radius:12px; background:#fff; }
        .seat-picker > summary { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:48px; box-sizing:border-box; padding:11px 13px; cursor:pointer; list-style:none; font-weight:800; color:#29252e; }
        .seat-picker > summary::-webkit-details-marker, .seat-table-row::-webkit-details-marker { display:none; }
        .seat-picker-chevron { color:#756d7d; font-size:18px; line-height:1; }
        .seat-picker-list { max-height:310px; overflow-y:auto; padding:7px; border-top:1px solid #eee9f3; background:#fcfbfd; border-radius:0 0 12px 12px; }
        .seat-picker-list > details { margin-bottom:5px; }
        .seat-picker-list > details:last-child { margin-bottom:0; }
        .seat-table-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 10px; border-radius:9px; background:#f6f3f9; cursor:pointer; list-style:none; }
        .seat-table-row > span:first-child { display:flex; align-items:baseline; gap:7px; min-width:0; }
        .seat-table-row strong { font-size:13px; white-space:nowrap; }
        .seat-table-row small { color:#77717d; font-size:11px; font-weight:700; white-space:nowrap; }
        .seat-options-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; padding:6px 2px 2px; }
        .seat-options-grid button { min-height:36px; padding:7px 9px; text-align:left; font-size:12px; border-radius:9px; }
        .seat-picker-empty { padding:12px 8px; text-align:center; }
        .seat-block-actions { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; }
        .seat-block-selection { min-height:48px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:9px 12px; border:1px solid #e5e0ea; border-radius:12px; background:#faf9fc; color:#6f6875; font-size:13px; }
        .seat-block-selection strong { color:#5f2bb7; }
        .seat-block-clear { border:0; background:transparent; color:#6f38c8; font-weight:800; font-size:12px; cursor:pointer; padding:3px 0; }
        .seat-block-submit { min-height:48px; white-space:nowrap; padding:11px 16px !important; }
        .seat-block-note { margin-top:12px; padding:9px 11px; border-radius:10px; background:#faf8fc; color:#77717d; font-size:12px; line-height:1.35; }
        @media (max-width: 760px) {
          .seat-block-form { grid-template-columns:1fr; gap:11px; }
          .seat-block-actions { grid-template-columns:1fr; }
          .seat-block-submit { width:100%; }
        }
        @media (max-width: 480px) {
          .seat-block-card { padding:14px !important; border-radius:15px !important; }
          .seat-block-title { font-size:18px; }
          .seat-block-subtitle { font-size:13px; }
          .seat-options-grid { grid-template-columns:1fr 1fr; }
        }

        .home-page {
          width: 100%;
          max-width: 980px;
          margin: 0 auto;
          padding: 4px 0 12px;
          box-sizing: border-box;
        }

        .home-hero {
          position: relative;
          overflow: hidden;
          padding: 12px 16px 10px;
          margin-bottom: 10px;
          border-radius: 16px;
          background: linear-gradient(135deg, #ffffff 0%, #faf7ff 100%);
          border: 1px solid #eee8f8;
          box-shadow: 0 5px 20px rgba(65, 38, 110, 0.06);
        }

        .home-brand-script {
          font-family: "Brush Script MT", "Segoe Script", "URW Chancery L", cursive;
          color: #6f35d9;
          font-size: clamp(24px, 5.6vw, 38px);
          line-height: 1;
        }

        .home-brand-title {
          color: #18152a;
          font-size: clamp(23px, 5.7vw, 34px);
          font-weight: 850;
          line-height: 1.02;
          margin-top: 3px;
        }

        .home-welcome {
          position: relative;
          z-index: 2;
          margin-top: 14px;
          max-width: 62%;
        }

        .home-welcome h1 {
          margin: 0 0 5px;
          color: #5b22c7;
          font-size: clamp(20px, 4.7vw, 29px);
          line-height: 1.1;
        }

        .home-welcome p {
          margin: 0;
          color: #25213a;
          font-size: clamp(14px, 3.3vw, 18px);
          line-height: 1.25;
        }

        .home-dancers {
          position: absolute;
          right: -2px;
          top: 34px;
          width: min(45%, 365px);
          pointer-events: none;
          z-index: 1;
        }

        .home-dancers img {
          display: block;
          width: 100%;
          height: auto;
        }

        .home-wave {
          display: none;
        }

        .home-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .home-tile {
          min-height: 118px;
          border: 1px solid #eeeaf4;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 5px 18px rgba(45, 35, 70, 0.06);
          padding: 9px 7px 7px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
          cursor: pointer;
          font-family: inherit;
          transition: transform .15s ease, box-shadow .15s ease;
        }

        .home-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 22px rgba(45, 35, 70, 0.10);
        }

        .home-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 24px;
          margin-bottom: 5px;
        }

        .home-tile-title {
          font-size: clamp(14px, 3.4vw, 19px);
          font-weight: 800;
          line-height: 1.15;
        }

        .home-tile-subtitle {
          margin-top: 4px;
          color: #5e5a69;
          font-size: 11px;
          line-height: 1.15;
        }

        .home-arrow {
          margin-top: 3px;
          font-size: 24px;
          line-height: 1;
        }

        .home-partners-tile {
          position: relative;
        }

        .home-found-partners {
          margin-top: 5px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          color: #2f2a38;
          font-size: 10px;
          line-height: 1.15;
          text-align: left;
        }

        .home-found-partners div {
          min-width: 0;
        }

        .home-found-partners strong {
          display: block;
          color: #277c4d;
          font-size: 11px;
          line-height: 1.15;
        }

        .home-found-partners span {
          display: block;
          margin-top: 1px;
          color: #5e5a69;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .home-more-partners {
          color: #139657;
          font-weight: 700;
          margin-top: 1px;
        }

        .home-seeker-tile {
          margin-top: 10px;
          min-height: 60px;
          height: 60px;
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #e2d2ff;
          border-radius: 16px;
          background: #fff;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          box-shadow: 0 5px 18px rgba(86, 48, 140, 0.06);
        }

        .home-seeker-icon {
          flex: 0 0 42px;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #eee3ff;
          display: grid;
          place-items: center;
          font-size: 21px;
        }

        .home-seeker-text {
          min-width: 0;
          flex: 1;
        }

        .home-seeker-title {
          color: #5b22c7;
          font-size: clamp(15px, 3.7vw, 21px);
          font-weight: 800;
          line-height: 1.2;
        }

        .home-seeker-subtitle {
          margin-top: 4px;
          color: #4e495b;
          font-size: 12px;
          line-height: 1.35;
        }

        .home-seeker-arrow {
          color: #5b22c7;
          font-size: 27px;
          line-height: 1;
        }

        .home-logout {
          width: 100%;
          margin-top: 14px;
          border: 1px solid #ff8da0;
          color: #e93659;
          background: #fff;
          border-radius: 14px;
          min-height: 42px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }

        .home-logout:hover {
          background: #fff6f8;
        }

        @media (max-width: 620px) {
          .home-page { padding: 0 0 8px; }
          .home-logout {
            margin-top: 14px;
            min-height: 70px;
            border-radius: 16px;
            font-size: 23px;
          }
          .home-seeker-tile {
            margin-top: 10px;
            padding: 14px 16px;
            gap: 14px;
            border-radius: 18px;
          }
          .home-seeker-icon {
            flex: 0 0 54px;
            width: 54px;
            height: 54px;
            font-size: 27px;
          }
          .home-seeker-title {
            font-size: 23px;
            line-height: 1.12;
          }
          .home-seeker-subtitle {
            margin-top: 5px;
            font-size: 14px;
            line-height: 1.25;
          }
          .home-seeker-arrow {
            font-size: 32px;
          }
          .home-hero { padding: 10px 14px 8px; margin-bottom: 8px; border-radius: 18px; }
          .home-brand-script { font-size: 21px; }
          .home-brand-title { font-size: 28px; }
          .home-welcome { max-width: 59%; margin-top: 9px; }
          .home-welcome h1 { font-size: 21px; margin-bottom: 4px; }
          .home-welcome p { font-size: 14px; line-height: 1.22; }
          .home-dancers { right: -2px; top: 58px; width: 46%; }
          .home-grid { gap: 8px; }
          .home-tile { min-height: 112px; padding: 8px 5px 6px; border-radius: 15px; }
          .home-icon { width: 42px; height: 42px; font-size: 20px; margin-bottom: 3px; }
          .home-tile-title { font-size: clamp(13px, 3.3vw, 17px); }
          .home-tile-subtitle { font-size: 10px; line-height: 1.1; margin-top: 2px; }
          .home-found-partners { font-size: 9px; gap: 2px; }
          .home-found-partners strong { font-size: 10px; }
          .home-seeker-tile {
            margin-top: 10px;
            padding: 14px 16px;
            gap: 14px;
            border-radius: 18px;
          }
          .home-seeker-icon {
            flex: 0 0 56px;
            width: 56px;
            height: 56px;
            font-size: 27px;
          }
          .home-seeker-title {
            font-size: 23px;
            line-height: 1.12;
          }
          .home-seeker-subtitle {
            margin-top: 5px;
            font-size: 14px;
            line-height: 1.25;
          }
          .home-seeker-arrow {
            font-size: 32px;
          }
          .home-arrow { font-size: 22px; margin-top: 0; }
          .home-seeker-tile { margin-top: 8px; padding: 8px 10px; border-radius: 15px; }
          .home-seeker-icon { flex-basis: 40px; width: 40px; height: 40px; font-size: 19px; }
          .home-seeker-title { font-size: 15px; line-height: 1.15; }
          .home-seeker-subtitle { font-size: 11px; margin-top: 2px; line-height: 1.2; }
          .home-seeker-arrow { font-size: 22px; }
          .home-logout { margin-top: 8px; min-height: 40px; border-radius: 13px; font-size: 14px; }
        }
      
        .home-simple-list { display: grid; gap: 10px; }
        .home-simple-list > .home-wide-tile { height: 60px; min-height: 60px; }
        .home-simple-list > .home-my-workshops-tile:not(.is-open) { height: 60px; min-height: 60px; }
        .home-wide-tile {
          width: 100%; min-height: 60px; height: 60px; border: 1px solid #ece8f3; border-radius: 17px;
          background: #fff; box-shadow: 0 4px 14px rgba(45,35,70,.045);
          padding: 8px 12px; display: flex; align-items: center; gap: 10px;
          text-align: left; cursor: pointer; font-family: inherit; box-sizing: border-box;
        }
        .home-wide-icon {
          width: 42px; height: 42px; min-width: 42px; border-radius: 50%;
          display: grid; place-items: center; font-size: 26px;
        }
        .home-wide-text { min-width: 0; flex: 1; }
        .home-wide-title { font-size: 18px; font-weight: 850; line-height: 1.1; }
        .home-wide-subtitle { margin-top: 2px; color: #66606f; font-size: 12px; line-height: 1.15; }
        .home-wide-arrow { font-size: 30px; line-height: 1; }
        .home-quick-links {
          display: flex; justify-content: center; align-items: center; gap: 10px;
          margin: 13px 0 4px; color: #6d6875;
        }
        .home-quick-links button {
          border: 0; background: transparent; color: #625d6c; font: inherit;
          font-size: 14px; cursor: pointer; padding: 4px 2px;
        }
        .bottom-simple-nav {
          width: 100%; max-width: 100vw; box-sizing: border-box;
          display: flex; justify-content: space-evenly; align-items: stretch;
          gap: 0; padding: 0 10px; overflow: hidden;
        }
        .bottom-simple-nav button {
          min-width: 0; width: min(160px, 42vw); flex: 0 1 160px;
          box-sizing: border-box; margin: 0; text-align: center;
        }
        @media (max-width: 620px) {
          .home-wide-tile { min-height: 100px; padding: 13px 14px; border-radius: 16px; }
          .home-wide-icon { width: 50px; height: 50px; min-width: 50px; font-size: 24px; }
          .home-wide-title { font-size: 19px; }
          .home-wide-subtitle { font-size: 13px; margin-top: 4px; }
          .home-quick-links { margin-top: 11px; }
        }
`}</style>

      {tab === "home" && (
        <main className="home-page">
          {isDemoAccount && (
            <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 14, border: "2px solid #7c3aed", background: "linear-gradient(135deg,#faf7ff,#f3edff)", color: "#4c1d95", fontSize: 13, lineHeight: 1.35 }}>
              <strong>🧪 DEMO-ACCOUNT</strong><br/>
              Aktuelle Live-Daten · Die App kann vollständig angesehen und ausprobiert werden. Änderungen werden nicht gespeichert.
            </div>
          )}
          <section className="home-hero" style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setTab("profil")}
              aria-label="Mein Profil öffnen"
              style={{
                position: "absolute", top: 12, right: 12, zIndex: 3,
                border: "1px solid #e5d8f6", background: "rgba(255,255,255,.92)",
                color: "#5b22c7", borderRadius: 18, padding: "6px 10px",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 2px 8px rgba(45,35,70,.08)"
              }}
            >
              👤 Profil
            </button>
            <div className="home-brand-script">Peter &amp; Bettina’s</div>
            <div className="home-brand-title">Tanzpartnerbörse</div>

            <div className="home-welcome">
              <h1>Schön, dass du da bist, {displayName}!</h1>
              <p>
                Finde deinen Tanzpartner<br />
                für die Workshops im Sonnenhof.
              </p>
            </div>

            <div className="home-dancers" aria-hidden="true">
              <img src={HOME_DANCERS_IMAGE} alt="" />
            </div>
          </section>

          <button
            type="button"
            onClick={openChat}
            aria-label="Wichtiger Hinweis: internen Chat im Auge behalten"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              margin: "0 0 12px", padding: "11px 13px", borderRadius: 14,
              border: "1.5px solid #f2c94c", background: "#fffdf0", color: "#4b3b00",
              textAlign: "left", cursor: "pointer", boxSizing: "border-box"
            }}
          >
            <span style={{ fontSize: 21, flex: "0 0 auto" }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 15 }}>
                WICHTIG – Bitte Nachrichten im Auge behalten!
              </strong>
              <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: "#6b5b1b" }}>
                Neue Nachrichten und wichtige Hinweise findest du hier
              </span>
            </span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>›</span>
          </button>

          <div className="home-simple-list">
            <button className="home-wide-tile" type="button" onClick={() => { setShowOnlyFoundPartners(false); setTab("workshops"); }}>
              <div className="home-wide-icon" style={{ background: "#fff", color: "#f97316", border: "1.5px solid #f2c49b" }}>📅</div>
              <div className="home-wide-text">
                <div className="home-wide-title" style={{ color: "#5b22c7" }}>Alle verfügbaren Workshops</div>
                <div className="home-wide-subtitle">Termine ansehen &amp; anmelden</div>
              </div>
              <div className="home-wide-arrow" style={{ color: "#6f35d9" }}>›</div>
            </button>

            <button className="home-seeker-tile" type="button" onClick={() => setTab("gesucht")}>
              <div className="home-seeker-icon">💃</div>
              <div className="home-seeker-text">
                <div className="home-seeker-title">Wer sucht noch einen Tanzpartner?</div>
                <div className="home-seeker-subtitle">Aktuelle Tanzpartner-Gesuche ansehen</div>
              </div>
              <div className="home-seeker-arrow">›</div>
            </button>

            <HomeMyWorkshops
              user={session.user}
              onOpenWorkshop={(workshopId) => {
                setWorkshopToOpen(workshopId);
                setShowOnlyFoundPartners(false);
                setTab("workshops");
              }}
            />
          </div>

          <HomeMatchProposals
            user={session.user}
            onOpenContacts={() => setTab("kontakte")}
          />

          {(newMessageCount > 0 || openRequestCount > 0) && (
            <div className="home-notifications" style={{ marginTop: 10, marginBottom: 10, background: "#fff", border: "1px solid #e7e1f0", borderRadius: 18, padding: "13px 15px", boxShadow: "0 3px 12px rgba(45, 35, 70, .06)" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#51339b", marginBottom: 7 }}>🔔 Aktuelles</div>
              {newMessageCount > 0 && (
                <button type="button" onClick={openChat} style={{ width: "100%", border: 0, background: "transparent", padding: "6px 0", display: "flex", alignItems: "center", gap: 9, textAlign: "left", fontSize: 15, fontWeight: 700, color: "#1467d9", cursor: "pointer" }}>
                  <span>💬</span><span style={{ flex: 1 }}>{newMessageCount} neue {newMessageCount === 1 ? "Nachricht" : "Nachrichten"}</span><span style={{ fontSize: 20 }}>›</span>
                </button>
              )}
              {openRequestCount > 0 && (
                <button type="button" onClick={openContacts} style={{ width: "100%", border: 0, background: "transparent", padding: "6px 0", display: "flex", alignItems: "center", gap: 9, textAlign: "left", fontSize: 15, fontWeight: 700, color: "#ed3157", cursor: "pointer" }}>
                  <span>💃</span><span style={{ flex: 1 }}>{openRequestCount} neue {openRequestCount === 1 ? "Tanzpartner-Anfrage" : "Tanzpartner-Anfragen"}</span><span style={{ fontSize: 20 }}>›</span>
                </button>
              )}
            </div>
          )}

          {!profileCompletion.complete && (
            <button type="button" className="home-profile-complete-banner" onClick={() => setTab("profil")}>
              <div className="home-profile-complete-icon">⚠️</div>
              <div className="home-profile-complete-text">
                <div className="home-profile-complete-title">
                  Wichtig – ohne vollständiges Profil keine Tanzpartnersuche.
                </div>
                <div className="home-profile-complete-subtitle">
                  Ergänze deine fehlenden Angaben.
                </div>
              </div>
              <div className="home-profile-complete-action">Profil vervollständigen&nbsp;›</div>
            </button>
          )}

          <section style={{ marginTop: 12, padding: "7px 10px 9px", border: "1px solid #e7e1f0", borderRadius: 16, background: "#fff" }}>
            <button type="button" onClick={() => setTab("faq")} style={{ width: "100%", minHeight: 42, border: 0, borderBottom: "1px solid #eeeaf4", background: "transparent", padding: "5px 3px", display: "flex", alignItems: "center", textAlign: "left", fontSize: 15, fontWeight: 800, color: "#5b22c7", cursor: "pointer" }}>
              <span>❓ FAQ</span><span style={{ marginLeft: "auto", fontSize: 21 }}>›</span>
            </button>

            <button type="button" onClick={() => setShowHomeSupport(v => !v)} aria-expanded={showHomeSupport} style={{ width: "100%", minHeight: 42, border: 0, borderBottom: showHomeSupport ? "1px solid #eeeaf4" : 0, background: "transparent", padding: "5px 3px", display: "flex", alignItems: "center", textAlign: "left", fontSize: 15, fontWeight: 800, color: "#5b22c7", cursor: "pointer" }}>
              <span>📞 Bei Fragen</span><span style={{ marginLeft: "auto", fontSize: 20 }}>{showHomeSupport ? "⌃" : "⌄"}</span>
            </button>

            {showHomeSupport && (
              <div style={{ padding: "8px 5px 5px", color: "#514a3f", fontSize: 12.5, lineHeight: 1.4 }}>
                <div style={{ padding: '2px 0 11px' }}><strong>Fragen zu Workshops und deren Inhalt:</strong> Peter · 01573 8166311</div>
                <div style={{ borderTop: '1px solid #ddd', padding: '11px 0' }}><strong>Fragen zur Funktion der App:</strong> Bitte zuerst die FAQ lesen. Wenn deine Frage dort nicht beantwortet wird, kannst du uns per WhatsApp unter <strong>01631600941</strong> schreiben. Bitte sende möglichst einen Screenshot und deine Frage mit.</div>
                <div style={{ borderTop: '1px solid #ddd', padding: '11px 0 2px' }}><strong>Programmfehler:</strong> Wenn etwas technisch nicht funktioniert, bitte per WhatsApp an <strong>01631600941</strong> melden – möglichst mit Screenshot und kurzer Beschreibung, was passiert ist.</div>
              </div>
            )}

            <InstallationHomeBar />
          </section>

          <button className="home-logout" type="button" onClick={logout}>
            ↪ Abmelden
          </button>

        </main>
      )}

      {tab === "workshops" && (
        <Workshops
          currentUser={session.user.id}
          onlyFoundPartners={showOnlyFoundPartners}
          workshopToOpen={workshopToOpen}
          onWorkshopOpened={() => setWorkshopToOpen(null)}
          onBack={() => {
            setShowOnlyFoundPartners(false);
            setWorkshopToOpen(null);
            setTab("home");
          }}
          profile={profile}
          user={session.user}
        />
      )}

      {tab === "profil" && (
        <ProfileEditor
          user={session.user}
          profile={profile}
          profileLoading={profileLoading}
          setProfile={setProfile}
          onOpenWorkshop={(workshopId) => {
            setWorkshopToOpen(workshopId);
            setShowOnlyFoundPartners(false);
            setTab("workshops");
          }}
          onOpenSearch={() => {
            setShowOnlyFoundPartners(false);
            setWorkshopToOpen(null);
            setTab("gesucht");
          }}
          onBack={() => setTab("home")}
        />
      )}

      {tab === "kontakte" && <Contacts userId={session.user.id} onBack={() => setTab("home")} />}

      {tab === "gesucht" && (
        <SeekerOverview
          currentUser={session.user.id}
          onBack={() => setTab("home")}
          onOwnSearch={() => { setShowOnlyFoundPartners(false); setTab("workshops"); }}
        />
      )}

      {tab === "faq" && <FaqPage onBack={() => setTab("home")} />}

      {tab === "admin" && hasAdminAccess && (
        <ErrorBoundary>
          <AdminPanel onBack={() => setTab("home")} demoMode={isDemoAccount} />
        </ErrorBoundary>
      )}

      <nav className="bottom-simple-nav">
        <button className={tab === "home" ? "selected" : ""} onClick={() => setTab("home")}>
          🏠
          <span>Startseite</span>
        </button>

        {hasAdminAccess && (
          <button className={tab === "admin" ? "selected" : ""} onClick={() => setTab("admin")}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              🔐
              {isAdmin && pendingAvatarCount > 0 && (
                <span style={{
                  position: "absolute", top: -7, right: -10, minWidth: 18, height: 18,
                  padding: "0 4px", borderRadius: 999, background: "#ef4444", color: "#fff",
                  fontSize: 11, lineHeight: "18px", fontWeight: 800, textAlign: "center",
                  border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.18)"
                }}>
                  {pendingAvatarCount > 99 ? "99+" : pendingAvatarCount}
                </span>
              )}
            </span>
            <span>Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
}


function getApprovedAvatarDisplayUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const { data } = supabase.storage.from("avatars").getPublicUrl(value);
  return data?.publicUrl || "";
}

function SeekerOverview({ currentUser, onBack, onOwnSearch }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [sendingId, setSendingId] = useState(null);
  const [filterDance, setFilterDance] = useState("Alle Tänze");
  const [filterDate, setFilterDate] = useState("Alle Termine");
  const [filterGender, setFilterGender] = useState("Alle Geschlechter");

  function isWorkshopInFuture(dateString) {
  if (!dateString) return true;
  const d = new Date(dateString);
  return Number.isNaN(d.getTime()) || d.getTime() >= Date.now();
}

function formatDate(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(iso));
  }

  function formatStartTime(timeValue) {
    if (!timeValue) return "";
    return String(timeValue).slice(0, 5);
  }

  function workshopDateLabel(row) {
    if (row?.recurrenceText) return row.recurrenceText;
    return row?.startsAt ? formatDate(row.startsAt) : "Termin noch offen";
  }

  function workshopCapacityLabel(row) {
    const max = Number(row?.maxPairCount);
    const count = Number(row?.registeredPairCount || 0);
    if (!Number.isFinite(max) || max <= 0) return "";
    const free = Math.max(0, max - count);
    if (free === 0) {
      return `👥 ${count} von ${max} Paaren belegt · 🔴 AUSGEBUCHT`;
    }
    return `👥 ${count} von ${max} Paaren belegt · ${free} Paarplätze frei`;
  }

  async function load() {
    setBusy(true);

    try {
      const { data: workshops, error } = await supabase
        .from("workshops")
        .select("id,title,starts_at,start_time,duration_minutes,recurrence_text,level,max_pair_count,trainer_name,workshop_type")
        .or(`starts_at.gte.${new Date().toISOString()},starts_at.is.null`)
        .order("starts_at", { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Die öffentlichen Workshop-Daten enthalten bereits die Zahl der
      // angemeldeten Tanzpaare. So müssen wir keine geschützten
      // workshop_registrations-Daten direkt an die Tanzpartnersuche geben.
      const { data: publicWorkshopRows, error: publicWorkshopError } = await supabase.rpc(
        "get_public_workshops_for_registration"
      );

      if (publicWorkshopError) {
        console.warn(
          "Workshop-Platzbelegung konnte nicht geladen werden:",
          publicWorkshopError.message
        );
      }

      const publicWorkshopMap = Object.fromEntries(
        (publicWorkshopRows || []).map(w => [String(w.id), w])
      );

      const result = [];

      // Die RPC „get_workshop_seekers“ blendet den aktuell angemeldeten
      // Nutzer absichtlich aus. Für die öffentliche Übersicht soll die
      // eigene offene Suche aber ebenfalls sichtbar sein. Deshalb laden wir
      // die eigenen Workshop-Interessen zusätzlich direkt.
      const { data: ownInterests, error: ownInterestsError } = await supabase
        .from("workshop_interests")
        .select("workshop_id")
        .eq("user_id", currentUser);

      if (ownInterestsError) {
        console.warn(
          "Eigene Tanzpartnersuchen konnten nicht geladen werden:",
          ownInterestsError.message
        );
      }

      const ownWorkshopIds = new Set(
        (ownInterests || []).map(row => row.workshop_id).filter(Boolean)
      );

      // Bereits gefundene Tanzpartnerschaften für den aktuellen Nutzer laden.
      // Für diese Workshops darf die eigene Suche nicht mehr angezeigt werden.
      const { data: ownPairs, error: ownPairsError } = await supabase
        .from("workshop_pairs")
        .select("workshop_id")
        .or(`user1_id.eq.${currentUser},user2_id.eq.${currentUser}`);

      if (ownPairsError) {
        console.warn(
          "Eigene Tanzpartnerschaften konnten nicht geladen werden:",
          ownPairsError.message
        );
      }

      const ownPairedWorkshopIds = new Set(
        (ownPairs || []).map(row => row.workshop_id).filter(Boolean)
      );

      // Das eigene Profil immer laden. Die eigene Suche darf nicht davon
      // abhängen, ob die RPC den aktuellen Nutzer zurückliefert.
      const { data: ownProfile, error: ownProfileError } = await supabase
        .from("profiles")
        .select("id,display_name,age,gender,height_cm,avatar_url,city")
        .eq("id", currentUser)
        .maybeSingle();

      if (ownProfileError) {
        console.warn(
          "Eigenes Profil konnte nicht geladen werden:",
          ownProfileError.message
        );
      }

      for (const workshop of workshops || []) {
        // Die eigene Suche wird unabhängig von der RPC direkt aus
        // workshop_interests aufgebaut. So funktioniert sie auch dann,
        // wenn get_workshop_seekers den eigenen Nutzer ausblendet.
        if (
          ownWorkshopIds.has(workshop.id) &&
          !ownPairedWorkshopIds.has(workshop.id) &&
          ownProfile?.display_name &&
          !result.some(
            row => row.workshopId === workshop.id && row.userId === currentUser
          )
        ) {
          result.push({
            id: `${workshop.id}:${currentUser}`,
            userId: currentUser,
            workshopId: workshop.id,
            workshopTitle: workshop.title,
            startsAt: workshop.starts_at,
            startTime: workshop.start_time,
            recurrenceText: workshop.recurrence_text,
            workshopLevel: workshop.level,
            maxPairCount: publicWorkshopMap[String(workshop.id)]?.max_pair_count ?? workshop.max_pair_count,
            registeredPairCount: publicWorkshopMap[String(workshop.id)]?.registered_pair_count ?? 0,
            displayName: ownProfile.display_name,
            age: ownProfile.age,
            gender: ownProfile.gender,
            height_cm: ownProfile.height_cm,
            city: ownProfile.city || "",
            avatar_url: ownProfile.avatar_url,
            isOwnSearch: true
          });
        }

        const { data: seekerRows, error: seekerError } = await supabase.rpc(
          "get_workshop_seekers",
          { p_workshop_id: workshop.id }
        );

        if (seekerError) {
          console.warn(
            "Suchende konnten nicht geladen werden:",
            seekerError.message
          );
          // Die eigene Suche wurde bereits hinzugefügt. Deshalb hier nicht
          // mit "continue" abbrechen.
          continue;
        }

        for (const person of seekerRows || []) {
          if (!person?.user_id) continue;
          if (!person.display_name || person.is_visible === false || person.is_blocked === true) continue;
          if (!isWorkshopInFuture(workshop.starts_at)) continue;


          result.push({
            id: `${workshop.id}:${person.user_id}`,
            userId: person.user_id,
            workshopId: workshop.id,
            workshopTitle: workshop.title,
            startsAt: workshop.starts_at,
            startTime: workshop.start_time,
            recurrenceText: workshop.recurrence_text,
            workshopLevel: workshop.level,
            maxPairCount: publicWorkshopMap[String(workshop.id)]?.max_pair_count ?? workshop.max_pair_count,
            registeredPairCount: publicWorkshopMap[String(workshop.id)]?.registered_pair_count ?? 0,
            displayName: person.display_name,
            age: person.age,
            gender: person.gender,
            height_cm: person.height_cm,
            city: person.city || person.location || person.ort || "",
            avatar_url: person.avatar_url,
            isOwnSearch: person.user_id === currentUser
          });
        }

      }

      setRows(result);
    } catch (error) {
      console.error("Fehler beim Laden der Tanzpartner-Gesuche:", error);
      alert(error.message || "Tanzpartner-Gesuche konnten nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [currentUser]);

  async function contact(row) {
    if (sendingId) return;
    setSendingId(row.id);

    try {
      const { data: existingRequests, error: existingError } = await supabase
        .from("contact_requests")
        .select("id,status,requester_id,recipient_id")
        .eq("workshop_id", row.workshopId)
        .or(
          `and(requester_id.eq.${currentUser},recipient_id.eq.${row.userId}),and(requester_id.eq.${row.userId},recipient_id.eq.${currentUser})`
        )
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) throw existingError;

      if (existingRequests?.length) {
        const existing = existingRequests[0];
        if (existing.status === "pending") {
          alert("Für diesen Workshop besteht bereits eine Anfrage.");
          return;
        }
        if (existing.status === "accepted") {
          alert("Ihr seid für diesen Workshop bereits als Tanzpartner verbunden.");
          return;
        }
      }

      const { data: openProposals, error: proposalCheckError } = await supabase
        .from("workshop_match_proposals")
        .select("id,status,user1_id,user2_id")
        .eq("workshop_id", row.workshopId)
        .eq("status", "pending")
        .or(`and(user1_id.eq.${currentUser},user2_id.eq.${row.userId}),and(user1_id.eq.${row.userId},user2_id.eq.${currentUser})`)
        .limit(1);

      if (proposalCheckError) throw proposalCheckError;
      if (openProposals?.length) {
        alert("Für euch besteht bereits ein offener Vermittlungsvorschlag für diesen Workshop. Bitte beantworte diesen Vorschlag.");
        return;
      }

      const { error: insertError } = await supabase
        .from("contact_requests")
        .insert({
          requester_id: currentUser,
          recipient_id: row.userId,
          workshop_id: row.workshopId,
          status: "pending"
        });

      if (insertError) {
        alert(
          insertError.message.includes("duplicate") || insertError.code === "23505"
            ? "Für diesen Workshop besteht bereits eine Anfrage."
            : insertError.message
        );
        return;
      }

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", currentUser)
        .maybeSingle();

      const emailResult = await sendPartnerEmail({
        recipientId: row.userId,
        partnerName: senderProfile?.display_name || "Ein Tanzpartner",
        workshopName: row.workshopTitle || "Workshop",
        date: formatDate(row.startsAt),
        messageType: "new_request"
      });

      if (!emailResult.ok) {
        console.warn("Kontaktanfrage wurde gespeichert, aber die E-Mail konnte nicht gesendet werden.");
      }

      alert("Die Kontaktanfrage wurde gesendet.");
      await load();
    } catch (error) {
      console.error("Kontaktanfrage konnte nicht gesendet werden:", error);
      alert(error.message || "Kontaktanfrage konnte nicht gesendet werden.");
    } finally {
      setSendingId(null);
    }
  }

  const filteredRows = rows.filter(row => {
    const danceOk = filterDance === "Alle Tänze" || row.workshopTitle === filterDance;
    const dateOk = filterDate === "Alle Termine" || workshopDateLabel(row) === filterDate;
    const genderOk = filterGender === "Alle Geschlechter" || row.gender === filterGender;
    return danceOk && dateOk && genderOk;
  });

  // Das eigene Gesuch wird separat hervorgehoben, damit es beim Ansehen
  // der kompletten Liste nicht zwischen den anderen Suchenden untergeht.
  const ownFilteredRows = filteredRows.filter(row => row.isOwnSearch);
  const otherFilteredRows = filteredRows.filter(row => !row.isOwnSearch);

  const danceOptions = [...new Set(rows.map(r => r.workshopTitle).filter(Boolean))];
  const dateOptions = [...new Set(rows.map(r => workshopDateLabel(r)).filter(Boolean))];

  return (
    <section>
      <style>{`
        .seeker-page { max-width: 980px; margin: 0 auto; padding: 0 8px; box-sizing: border-box; }
        .seeker-page-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin: 0 2px 12px; flex-wrap: wrap;
        }
        .seeker-page-header h2 { color: #211b32; }
        .seeker-filters {
          display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 10px;
          margin-bottom: 12px;
        }
        .seeker-filter {
          background: #fff; border: 1px solid #e3deeb; border-radius: 13px;
          min-height: 46px; padding: 0 12px; font: inherit; font-weight: 700;
          color: #302a3d; width: 100%;
        }
        .seeker-list { display: grid; gap: 8px; }
        .seeker-card {
          display: grid; grid-template-columns: minmax(210px, 1.05fr) minmax(175px, .85fr) auto;
          align-items: center; gap: 12px; padding: 8px 12px;
          background: #fff; border: 1px solid #ece9f2; border-radius: 15px;
          box-shadow: 0 2px 9px rgba(45,35,70,.045);
        }
        .seeker-person { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .seeker-avatar {
          width: 50px; height: 50px; min-width: 50px; border-radius: 50%;
          object-fit: cover; border: 2px solid #eadfff; background: #f1eaff;
        }
        .seeker-avatar-placeholder {
          width: 50px; height: 50px; min-width: 50px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #f1eaff; font-size: 25px;
        }
        .seeker-card-main { min-width: 0; }
        .seeker-name { font-size: 16px; font-weight: 850; color: #25202f; }
        .seeker-profile-details { margin-top: 2px; color: #5f596b; font-size: 12.5px; line-height: 1.25; }
        .seeker-workshop-box { min-width: 0; border-left: 1px solid #e4dfea; padding-left: 16px; }
        .seeker-workshop-pill {
          display: inline-block; padding: 4px 9px; border-radius: 8px;
          background: #eee5ff; color: #5b22c7; font-weight: 850; font-size: 12.5px;
        }
        .seeker-workshop-line { margin-top: 5px; color: #4d475a; font-size: 12.5px; line-height: 1.25; }
        .seeker-capacity { margin-top: 2px; color: #7a7483; font-size: 12px; }
        .seeker-contact {
          min-width: 125px; border: 0; border-radius: 12px; background: #6f35d9;
          color: #fff; padding: 9px 11px; font-weight: 800; cursor: pointer;
          font-family: inherit; font-size: 13px;
        }
        .seeker-contact:disabled { opacity: .6; cursor: wait; }
        @media (max-width: 700px) {
          .seeker-filters { grid-template-columns: 1fr; gap: 7px; }
          .seeker-card { grid-template-columns: 1fr auto; gap: 8px 12px; padding: 10px 11px; }
          .seeker-person { grid-column: 1 / -1; }
          .seeker-workshop-box { border-left: 0; padding-left: 0; }
          .seeker-contact { min-width: 128px; grid-column: 2; grid-row: 2; }
        }
      `}</style>

      <div className="seeker-page">
        <div className="seeker-page-header">
          <button className="admin-top-back primary" type="button" onClick={onBack} style={{ background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 16, padding: "10px 17px", borderRadius: 13, border: "none", marginLeft: 2 }}>‹ Startseite</button>
          <h2 style={{ margin: 0 }}>💃 Tanzpartner gesucht</h2>
          <button className="primary" type="button" onClick={() => onOwnSearch?.()} style={{ background: "#6f35d9", color:"#fff", fontWeight:800, padding:"10px 16px", borderRadius:13, border:"none" }}>＋ Eigenes Gesuch</button>
        </div>

        <div className="seeker-filters">
          <select className="seeker-filter" aria-label="Workshop wählen" value={filterDance} onChange={e => setFilterDance(e.target.value)}>
            <option>Alle Tänze</option>
            {danceOptions.map(title => <option key={title}>{title}</option>)}
          </select>
          <select className="seeker-filter" aria-label="Termin wählen" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
            <option>Alle Termine</option>
            {dateOptions.map(date => <option key={date}>{date}</option>)}
          </select>
          <select className="seeker-filter" aria-label="Geschlecht wählen" value={filterGender} onChange={e => setFilterGender(e.target.value)}>
            <option>Alle Geschlechter</option>
            <option>weiblich</option>
            <option>männlich</option>
          </select>
        </div>

        {busy ? (
          <div className="card">Gesuche werden geladen…</div>
        ) : rows.length === 0 ? (
          <div className="card">Aktuell sucht niemand einen Tanzpartner.</div>
        ) : filteredRows.length === 0 ? (
          <div className="card">Für diese Auswahl gibt es aktuell keine passenden Gesuche.</div>
        ) : (
          <>
            {ownFilteredRows.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 900, color: "#5b22c7", fontSize: 16, margin: "4px 2px 7px" }}>
                  🔎 Dein eigenes Gesuch
                </div>
                <div className="seeker-list">
                  {ownFilteredRows.map(row => (
                    <div className="seeker-card" key={row.id} style={{ border: "2px solid #d9c6ff" }}>
                      <div className="seeker-person">
                        {row.avatar_url ? (
                          <img className="seeker-avatar" src={getApprovedAvatarDisplayUrl(row.avatar_url)} alt="" />
                        ) : (
                          <div className="seeker-avatar-placeholder" aria-hidden="true">👤</div>
                        )}
                        <div className="seeker-card-main">
                          <div className="seeker-name">{row.displayName}</div>
                          <div className="seeker-profile-details">
                            {[row.age ? `${row.age} Jahre` : null, row.gender, row.height_cm ? `${row.height_cm} cm` : null].filter(Boolean).join(" · ") || "Keine Profilangaben"}
                          </div>
                        </div>
                      </div>
                      <div className="seeker-workshop-box">
                        <span className="seeker-workshop-pill">{row.workshopTitle}</span>
                        <div className="seeker-workshop-line">📅 {workshopDateLabel(row)}</div>
                      </div>
                      <div className="seeker-contact" style={{ background: "#eee7fb", color: "#6f35d9", textAlign: "center", cursor: "default" }}>Deine Suche</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherFilteredRows.length > 0 && (
              <div>
                {ownFilteredRows.length > 0 && (
                  <div style={{ fontWeight: 900, color: "#302a3d", fontSize: 16, margin: "4px 2px 7px" }}>👥 Weitere Gesuche</div>
                )}
                <div className="seeker-list">
                  {otherFilteredRows.map(row => (
              <div className="seeker-card" key={row.id}>
                <div className="seeker-person">
                  {row.avatar_url ? (
                    <img className="seeker-avatar" src={getApprovedAvatarDisplayUrl(row.avatar_url)} alt="" />
                  ) : (
                    <div className="seeker-avatar-placeholder" aria-hidden="true">👤</div>
                  )}
                  <div className="seeker-card-main">
                    <div className="seeker-name">{row.displayName}</div>
                    <div className="seeker-profile-details">
                      {[row.age ? `${row.age} Jahre` : null, row.gender, row.height_cm ? `${row.height_cm} cm` : null]
                        .filter(Boolean).join(" · ") || "Keine Profilangaben"}
                    </div>
                    {row.city && <div className="seeker-profile-details">📍 {row.city}</div>}
                  </div>
                </div>

                <div className="seeker-workshop-box">
                  <span className="seeker-workshop-pill">{row.workshopTitle}</span>
                  <div className="seeker-workshop-line">📅 {workshopDateLabel(row)}</div>
                  {workshopCapacityLabel(row) && (
                    <div className="seeker-capacity">
                      {workshopCapacityLabel(row)
                        .replace(/^👥\s*/, "")
                        .replace(" Paare belegt · ", " belegt · ")}
                    </div>
                  )}
                </div>

                {row.isOwnSearch ? (
                  <div className="seeker-contact" style={{background:"#eee7fb",color:"#6f35d9",textAlign:"center",cursor:"default"}}>Deine Suche</div>
                ) : row.contactStatus === "accepted" ? (
                  <div className="seeker-contact" style={{background:"#eaf8ef",color:"#139657",textAlign:"center",cursor:"default"}}>💃 Tanzpartner gefunden</div>
                ) : row.contactStatus === "pending" ? (
                  <div className="seeker-contact" style={{background:"#f4f1e8",color:"#8a6d1d",textAlign:"center",cursor:"default"}}>🕐 Anfrage gesendet</div>
                ) : (
                  <button className="seeker-contact" type="button" disabled={sendingId === row.id} onClick={() => contact(row)}>
                    {sendingId === row.id ? "Senden…" : "✉ Kontakt aufnehmen"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
        )}
      </div>
    </section>
  );
}

function useAppInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installHelpDevice, setInstallHelpDevice] = useState(null);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream;

  useEffect(() => {
    const handler = event => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function installApp(device = "android") {
    if (!installPrompt) {
      setInstallHelpDevice(device);
      setShowInstallHelp(true);
      return false;
    }

    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    setInstallPrompt(null);

    return result?.outcome === "accepted";
  }

  return {
    canInstallDirectly: !!installPrompt,
    isIOS,
    showInstallHelp,
    setShowInstallHelp,
    installHelpDevice,
    setInstallHelpDevice,
    installApp
  };
}

function InstallationHomeBar() {
  const [showOptions, setShowOptions] = useState(false);
  const {
    showInstallHelp,
    setShowInstallHelp,
    installHelpDevice,
    setInstallHelpDevice,
    installApp
  } = useAppInstallPrompt();

  function closeOptions() {
    setShowOptions(false);
    setShowInstallHelp(false);
  }

  return (
    <>
      <button
        className="home-seeker-tile"
        type="button"
        onClick={() => setShowOptions(true)}
        style={{
          width: "100%",
          marginTop: 14,
          background: "#f5efff",
          border: "1px solid #e4d7ff",
          color: "#5b22c7",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          textAlign: "left",
          cursor: "pointer"
        }}
      >
        <div
          className="home-seeker-icon"
          style={{
            background: "#eee5ff",
            color: "#5b22c7",
            width: 38,
            height: 38,
            fontSize: 20,
            flexShrink: 0
          }}
        >
          📱
        </div>
        <div className="home-seeker-text" style={{ flex: 1 }}>
          <strong style={{ color: "#5b22c7", fontSize: 15 }}>
            Auf dem Handy installieren
          </strong>
          <span style={{ display: "block", color: "#6b6575", marginTop: 1, fontSize: 12 }}>
            Tanzpartnerbörse direkt auf dem Startbildschirm
          </span>
        </div>
        <div className="home-arrow" style={{ color: "#5b22c7", fontSize: 22 }}>›</div>
      </button>

      {showOptions && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tanzpartnerbörse installieren"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            boxSizing: "border-box"
          }}
          onClick={closeOptions}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 520,
              padding: 22,
              position: "relative",
              boxSizing: "border-box"
            }}
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeOptions}
              aria-label="Schließen"
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                border: "none",
                background: "transparent",
                fontSize: 28,
                color: "#6b6575",
                cursor: "pointer"
              }}
            >
              ×
            </button>

            <h3 style={{ margin: "0 38px 8px 0", color: "#5b22c7" }}>
              📱 Auf dem Handy installieren
            </h3>
            <p style={{ margin: "0 0 16px", color: "#6b6575" }}>
              Wähle dein Gerät:
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button"
                className="primary"
                onClick={() => installApp("android")}
                style={{
                  width: "100%",
                  fontSize: 16,
                  fontWeight: 800
                }}
              >
                📱 Installation Android
              </button>

              <button
                type="button"
                className="primary"
                onClick={() => {
                  setInstallHelpDevice("ios");
                  setShowInstallHelp(true);
                }}
                style={{
                  width: "100%",
                  fontSize: 16,
                  fontWeight: 800
                }}
              >
                🍎 Installation iPhone / iPad
              </button>
            </div>

            {showInstallHelp && (
              <div
                style={{
                  marginTop: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#fffaf0",
                  border: "1px solid #f4dfb2",
                  color: "#4f4a58"
                }}
              >
                {installHelpDevice === "ios" ? (
                  <>
                    <strong>🍎 iPhone / iPad</strong>
                    <ol style={{ margin: "8px 0 0 20px", padding: 0 }}>
                      <li>Öffne die Tanzpartnerbörse in <strong>Safari</strong>.</li>
                      <li>Tippe auf das <strong>Teilen-Symbol</strong> (□↑).</li>
                      <li>Wähle <strong>„Zum Home-Bildschirm“</strong>.</li>
                      <li>Tippe auf <strong>„Hinzufügen“</strong>.</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <strong>📱 Android mit Chrome</strong>
                    <p style={{ margin: "8px 0 0" }}>
                      Tippe oben rechts in Chrome auf <strong>⋮</strong>.
                    </p>
                    <p style={{ margin: "6px 0 0" }}>
                      Wähle dort <strong>„Installieren und Verknüp…“</strong>.
                    </p>
                    <p style={{ margin: "6px 0 0" }}>
                      Danach folge den Anweisungen von Chrome.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FaqPage({ onBack }) {
  return (
    <section>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button className="admin-top-back primary" type="button" onClick={onBack} style={{ background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 17, padding: "11px 18px", borderRadius: 14, border: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", marginBottom: 12 }}>‹ Startseite</button>
          <h2 style={{ margin: 0 }}>❓ FAQ</h2>
        </div>

        <div className="card">
          <FaqItem
            question="Wie funktioniert die Tanzpartnerbörse?"
            answer="Du wählst einen Workshop aus und kannst dort angeben, dass du einen Tanzpartner suchst. Deine Suche gilt immer für diesen Workshop. Wenn sich zwei Personen füreinander entscheiden und die Anfrage angenommen wird, seid ihr für diesen Workshop als Tanzpaar verbunden."
          />
          <FaqItem
            question="Muss ich für die Tanzpartnerbörse ein Profil anlegen?"
            answer="Für die Tanzpartnersuche ja. Dafür werden Name, Alter, Geschlecht und Größe benötigt. Eine normale Paaranmeldung zu einem Workshop ist dagegen auch ohne Registrierung möglich."
          />
          <FaqItem
            question="Kann ich mich als Paar ohne Registrierung anmelden?"
            answer="Ja. Bei Workshops, die eine Paaranmeldung ohne Registrierung anbieten, könnt ihr euch direkt als Paar anmelden. Dafür sind die Namen und E-Mail-Adressen beider Personen erforderlich."
          />
          <FaqItem
            question="Was bedeutet das Tanzniveau beim Workshop?"
            answer="Das angezeigte Niveau zeigt dir, für welche Tanzerfahrung der Workshop gedacht ist. So kannst du schon vor der Anmeldung einschätzen, ob der Workshop zu dir passt."
          />
          <FaqItem
            question="Wie starte ich eine Tanzpartnersuche?"
            answer="Öffne den gewünschten Workshop und wähle dort die Tanzpartnersuche. Deine Suche wird anschließend für genau diesen Workshop angezeigt."
          />
          <FaqItem
            question="Wo sehe ich meine offenen Tanzpartnersuchen?"
            answer="Im Profil findest du unter „Meine Aktivitäten“ deine Tanzpartnersuchen. Zusätzlich wird deine eigene Suche in der jeweiligen Workshop-Ansicht entsprechend gekennzeichnet."
          />
          <FaqItem
            question="Was passiert, wenn jemand meine Anfrage annimmt?"
            answer="Dann seid ihr für diesen Workshop als Tanzpaar verbunden. Ihr könnt anschließend über den Chat miteinander schreiben. Telefonnummer und E-Mail-Adresse werden dadurch nicht automatisch freigegeben."
          />
          <FaqItem
            question="Was passiert, wenn eine Anfrage abgelehnt wird?"
            answer="Die Anfrage wird beendet und ihr werdet für diesen Workshop nicht als Tanzpaar verbunden. Du kannst anschließend wieder nach einem anderen Tanzpartner suchen."
          />
          <FaqItem
            question="Kann ich eine Tanzpartnerschaft wieder auflösen?"
            answer="Ja. Öffne den entsprechenden Workshop unter „Meine Workshops“ und wähle dort die Möglichkeit, die Tanzpartnerschaft aufzulösen. Danach könnt ihr beide wieder nach einem anderen Tanzpartner suchen."
          />
          <FaqItem
            question="Wo sehe ich neue Nachrichten?"
            answer="Neue Nachrichten findest du unter „Kontakte“. Dort kannst du den jeweiligen Chat öffnen und direkt antworten."
          />
          <FaqItem
            question="Funktioniert der Chat ohne freigegebene Kontaktdaten?"
            answer="Ja. Der Chat funktioniert unabhängig davon, ob Telefonnummer oder E-Mail-Adresse freigegeben wurden. Du musst deine Kontaktdaten also nicht teilen."
          />
          <FaqItem
            question="Wie werden meine Kontaktdaten freigegeben?"
            answer="Die Freigabe ist freiwillig und erfolgt im Profil unter „Kontaktdaten verwalten“. Die Kontaktdaten werden erst sichtbar, wenn beide Tanzpartner ihre Kontaktdaten freigegeben haben."
          />
          <FaqItem
            question="Wie funktioniert das Profilfoto?"
            answer="Du kannst in deinem Profil ein JPG-, PNG- oder WebP-Foto mit maximal 6 MB hochladen. Ein neues Foto wird zunächst geprüft und ist für andere Nutzer erst sichtbar, wenn der Admin es freigegeben hat. Bis dahin siehst nur du den Hinweis, dass das Foto auf Freigabe wartet."
          />
          <FaqItem
            question="Warum wird mein Profilfoto nicht sofort angezeigt?"
            answer="Profilfotos werden vor der Veröffentlichung durch den Admin kontrolliert. Damit sollen ungeeignete oder unpassende Bilder von der Plattform ferngehalten werden. Die Prüfung erfolgt vor der öffentlichen Anzeige."
          />
          <FaqItem
            question="Kann ich ein Foto wieder ändern oder entfernen?"
            answer="Ja. Im Profil kannst du jederzeit ein anderes Foto auswählen oder dein vorhandenes Foto entfernen. Ein neu hochgeladenes Foto muss erneut freigegeben werden."
          />
          <FaqItem
            question="Was passiert, wenn mein Profilfoto nicht freigegeben wird?"
            answer="Das Foto wird nicht als Profilfoto veröffentlicht. Du kannst anschließend ein anderes Foto auswählen und erneut zur Prüfung hochladen."
          />
          <FaqItem
            question="Wie kann ich mein Profil löschen lassen?"
            answer="Schreib uns an mydiscofox@gmx.de und nenne die E-Mail-Adresse, mit der du registriert bist. Wir kümmern uns um die Löschung deines Profils."
          />
          <FaqItem
            question="Was mache ich, wenn ich mein Passwort vergessen habe?"
            answer="Nutze auf der Anmeldeseite die Funktion „Passwort vergessen“ und folge den dort angezeigten Schritten."
          />
          <FaqItem
            question="Wie kann ich mein Passwort ändern?"
            answer="Gehe in deinem Profil auf „Passwort ändern“ und lege dort ein neues Passwort fest."
          />
          <FaqItem
            question="Was kann ich tun, wenn sich jemand unangemessen verhält?"
            answer="Du kannst einen Nutzer über die vorgesehene Meldefunktion melden. Die Meldung wird an den Admin weitergeleitet und geprüft."
          />
          <FaqItem
            question="Sind meine Kontaktdaten automatisch sichtbar?"
            answer="Nein. Deine Kontaktdaten werden nicht automatisch veröffentlicht. Die Freigabe ist freiwillig und der Chat funktioniert auch ohne Telefonnummer oder E-Mail-Adresse."
          />

          <div style={{ marginTop: 14, padding: "14px 15px", borderRadius: 14, background: "#fff8e8", border: "1px solid #f1dfb5", color: "#514a3f", fontSize: 14, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>📞 Bei Fragen</div>
            <div><strong>Zur Funktion der App:</strong> Bitte zuerst die FAQ lesen.</div>
            <div style={{ marginTop: 6 }}><strong>Fragen zu den Workshops und deren Inhalt:</strong> Peter · 01573 8166311</div>
            <div style={{ marginTop: 6 }}><strong>Gefundene Programmfehler:</strong> bitte per WhatsApp an 01631600941 senden – möglichst mit Screenshot und kurzer Beschreibung.</div>
          </div>

          <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#faf8ff", color: "#5f5a68", fontSize: 14, lineHeight: 1.45 }}>
            🔒 <strong>Datenschutz:</strong> Teile persönliche Kontaktdaten nur, wenn du das möchtest. Für die Kommunikation mit deinem Tanzpartner steht der Chat zur Verfügung.
          </div>
        </div>
      </div>
    </section>
  );
}

function isWorkshopVisibleToUser(workshop) {
  // Dauer-Workshops haben bewusst kein festes Datum.
  // Nur wenn KEIN starts_at vorhanden ist, gilt der Workshop als dauerhaft.
  if (!workshop?.starts_at) return true;

  const d = new Date(workshop.starts_at);
  if (Number.isNaN(d.getTime())) return false;

  // Vergleich anhand der in der App angezeigten Ortszeit in Deutschland.
  // Dadurch verschwindet ein Workshop zuverlässig nach seiner Startzeit,
  // auch wenn Supabase/Browser die Zeitzone unterschiedlich liefert.
  const berlinParts = value => {
    const parts = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(value);

    const get = type =>
      Number(parts.find(part => part.type === type)?.value || 0);

    return [
      get("year"),
      get("month"),
      get("day"),
      get("hour"),
      get("minute"),
      get("second")
    ];
  };

  const workshopLocal = berlinParts(d);
  const nowLocal = berlinParts(new Date());

  for (let i = 0; i < workshopLocal.length; i++) {
    if (workshopLocal[i] !== nowLocal[i]) {
      return workshopLocal[i] > nowLocal[i];
    }
  }

  return true;
}

function Workshops({ currentUser, onlyFoundPartners = false, tanzkreisOnly = false, workshopToOpen = null, onWorkshopOpened, profile = null, user = null, onBack = null }) {
  const profileCompletion = getProfileCompletion(profile, user);

  const [workshops, setWorkshops] = useState([]);
  const [myInterests, setMyInterests] =
    useState(new Set());
  const [myPairs, setMyPairs] =
    useState(new Set());
  const [pairPartners, setPairPartners] =
    useState({});
  const [myRegistrationStatus, setMyRegistrationStatus] = useState(null);
  const [cancellingWorkshop, setCancellingWorkshop] = useState(false);
  const [seekers, setSeekers] = useState({});
  const [busy, setBusy] = useState(true);
  const [openWorkshop, setOpenWorkshop] = useState(null);
  const [showModalSeekers, setShowModalSeekers] = useState(false);

  const [guestPairMode, setGuestPairMode] = useState(false);
  const [guestPairBusy, setGuestPairBusy] = useState(false);
  const [guestPairSuccess, setGuestPairSuccess] = useState(false);
  const [guestPairForm, setGuestPairForm] = useState({
    user1Name: "",
    user1Email: "",
    user2Name: "",
    user2Email: ""
  });

  // Dauerworkshop: konkreten Samstag sowie Einzelperson oder Tanzpaar wählen.
  const [recurringDate, setRecurringDate] = useState("");
  const [recurringPartySize, setRecurringPartySize] = useState(1);
  const [recurringDates, setRecurringDates] = useState([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [recurringSuccess, setRecurringSuccess] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    user1Name: "",
    user1Email: "",
    user2Name: "",
    user2Email: ""
  });

  useEffect(() => {
    setShowModalSeekers(false);
  }, [openWorkshop?.id]);

  useEffect(() => {
    let active = true;

    async function loadRecurringModal() {
      if (!openWorkshop?.recurrence_text) {
        setRecurringDates([]);
        setRecurringDate("");
        setRecurringSuccess(false);
        return;
      }

      setRecurringLoading(true);
      setRecurringSuccess(false);
      setRecurringPartySize(1);
      setRecurringForm({
        user1Name: profile?.display_name || "",
        user1Email: user?.email || "",
        user2Name: "",
        user2Email: ""
      });

      const { data, error } = await supabase.rpc("get_recurring_workshop_dates", {
        p_workshop_id: Number(openWorkshop.id)
      });

      if (!active) return;

      if (error) {
        console.error("Dauerworkshop-Termine konnten nicht geladen werden:", error);
        setRecurringDates([]);
        setRecurringDate("");
      } else {
        const nextDates = data || [];
        setRecurringDates(nextDates);
        setRecurringDate(prev => {
          if (prev && nextDates.some(d => String(d.session_date) === String(prev))) {
            return prev;
          }
          return nextDates[0]?.session_date ? String(nextDates[0].session_date) : "";
        });
      }

      setRecurringLoading(false);
    }

    loadRecurringModal();
    return () => { active = false; };
  }, [openWorkshop?.id, openWorkshop?.recurrence_text, profile?.display_name, user?.email]);

  useEffect(() => {
    let active = true;

    async function loadMyRegistrationStatus() {
      if (!openWorkshop?.id || !currentUser) {
        if (active) setMyRegistrationStatus(null);
        return;
      }

      try {
        const { data, error } = await supabase.rpc(
          "get_my_workshop_registration_status",
          { p_workshop_id: Number(openWorkshop.id) }
        );

        if (error) throw error;
        if (active) setMyRegistrationStatus(Array.isArray(data) ? (data[0] || null) : (data || null));
      } catch (error) {
        console.warn("Eigene Workshop-Anmeldung konnte nicht geprüft werden:", error?.message || error);
        if (active) setMyRegistrationStatus(null);
      }
    }

    loadMyRegistrationStatus();
    return () => { active = false; };
  }, [openWorkshop?.id, currentUser]);

  useEffect(() => {
    if (!workshopToOpen || !workshops.length) return;

    const workshop = workshops.find(
      w => String(w.id) === String(workshopToOpen)
    );

    if (workshop) {
      setOpenWorkshop(workshop);
      onWorkshopOpened?.();
    }
  }, [workshopToOpen, workshops, onWorkshopOpened]);

  async function load() {
    setBusy(true);

    try {
      const [
        { data: ws, error: wsError },
        { data: interests },
        { data: pairs },
        { data: ownProfile, error: ownProfileError },
        { data: publicWorkshopRows, error: publicWorkshopError }
      ] = await Promise.all([
        supabase
          .from("workshops")
          .select(
            "id,title,starts_at,start_time,duration_minutes,recurrence_text,location,cost_per_person,max_pair_count,info_text,level,workshop_type,dance_styles(name)"
          )
          .order("starts_at"),

        supabase
          .from("workshop_interests")
          .select("workshop_id")
          .eq("user_id", currentUser),

        supabase
          .from("workshop_pairs")
          .select(
            "workshop_id,user1_id,user2_id"
          )
          .or(
            `user1_id.eq.${currentUser},user2_id.eq.${currentUser}`
          ),

        // Eigenes Profil laden, damit die eigene Tanzpartnersuche
        // auch in der im Workshop geöffneten "Alle anzeigen"-Liste
        // genauso erscheint wie in der zentralen Tanzpartnersuche.
        supabase
          .from("profiles")
          .select("id,display_name,age,gender,height_cm,avatar_url,is_visible,is_blocked")
          .eq("id", currentUser)
          .maybeSingle(),

        // Diese öffentliche RPC liefert auch die aktuelle Zahl der
        // angemeldeten Tanzpaare. Direkte Abfragen auf
        // workshop_registrations sind durch RLS geschützt.
        supabase.rpc("get_public_workshops_for_registration")
      ]);

      if (wsError) {
        alert(wsError.message);
      }

      if (publicWorkshopError) {
        console.warn(
          "Workshop-Platzbelegung konnte nicht geladen werden:",
          publicWorkshopError.message
        );
      }

      const publicWorkshopMap = Object.fromEntries(
        (publicWorkshopRows || []).map(w => [String(w.id), w])
      );

      // Workshopdaten mit der tatsächlich gemeldeten öffentlichen
      // Paarbelegung ergänzen. Dadurch zeigt das Workshop-Detailfenster
      // nicht mehr fälschlich 0 Paare an.
      const workshopsWithCapacity = (ws || []).map(w => {
        const publicWorkshop = publicWorkshopMap[String(w.id)];
        return {
          ...w,
          max_pair_count:
            publicWorkshop?.max_pair_count ?? w.max_pair_count,
          registered_pair_count:
            Number(publicWorkshop?.registered_pair_count ?? 0),
          // Der öffentliche RPC liefert den Trainer zuverlässig mit.
          // Dadurch bleibt die Anzeige auch dann korrekt, wenn die direkte
          // Workshop-Abfrage trainer_name wegen RLS/Ansicht nicht liefert.
          trainer_name:
            publicWorkshop?.trainer_name ?? w.trainer_name ?? null
        };
      });

      setWorkshops(sortWorkshopsDauerZuerst(workshopsWithCapacity));

      setMyInterests(
        new Set(
          (interests || []).map(
            x => x.workshop_id
          )
        )
      );

      setMyPairs(
        new Set(
          (pairs || []).map(
            x => x.workshop_id
          )
        )
      );

      // Partnernamen über die sichere Supabase-RPC laden.
      // Dadurch funktioniert die Anzeige auch dann, wenn eine direkte
      // profiles-Abfrage durch RLS eingeschränkt ist.
      const {
        data: partnerRows,
        error: partnerRpcError
      } = await supabase.rpc(
        "get_my_workshop_partner_names",
        { p_user_id: currentUser }
      );

      if (partnerRpcError) {
        console.warn(
          "Tanzpartner-Namen konnten nicht geladen werden:",
          partnerRpcError.message
        );
      }

      const partnerMap = Object.fromEntries(
        (partnerRows || [])
          .filter(
            row =>
              row &&
              row.workshop_id != null &&
              row.partner_name
          )
          .map(row => [
            String(row.workshop_id),
            row.partner_name
          ])
      );

      setPairPartners(partnerMap);

      const map = {};

      for (const w of ws || []) {
        const {
          data: seekerRows,
          error: seekerRpcError
        } = await supabase.rpc(
          "get_workshop_seekers",
          {
            p_workshop_id: w.id
          }
        );

        if (seekerRpcError) {
          console.warn(
            "Suchende für Workshop konnten nicht geladen werden:",
            seekerRpcError.message
          );
        }

        const otherSeekers = (seekerRows || [])
          .filter(
            p =>
              p &&
              p.user_id &&
              p.user_id !== currentUser
          )
          .map(p => ({
            ...p,
            id: p.user_id,
            workshop_level: p.level,
            isOwnSearch: false
          }))
          .filter(
            p =>
              p.display_name &&
              p.is_visible !== false &&
              p.is_blocked !== true
          );

        // Die zentrale Tanzpartnersuche zeigt die eigene offene Suche
        // bereits an. Die "Alle anzeigen"-Liste im Workshop-Modal soll
        // dieselben Gesuche enthalten. Deshalb wird die eigene Suche
        // hier ergänzt, wenn sie für diesen Workshop aktiv ist.
        const ownSearch =
          (interests || []).some(i => String(i.workshop_id) === String(w.id)) &&
          !((pairs || []).some(p => String(p.workshop_id) === String(w.id))) &&
          ownProfile?.display_name &&
          ownProfile?.is_visible !== false &&
          ownProfile?.is_blocked !== true
            ? [{
                user_id: currentUser,
                id: currentUser,
                display_name: ownProfile.display_name,
                age: ownProfile.age,
                gender: ownProfile.gender,
                height_cm: ownProfile.height_cm,
                level: w.level,
                workshop_level: w.level,
                isOwnSearch: true
              }]
            : [];

        map[w.id] = [...ownSearch, ...otherSeekers];
      }

      setSeekers(map);
    } catch (err) {
      console.error(
        "Fehler beim Laden der Workshops:",
        err
      );
      alert(
        err.message ||
          "Workshops konnten nicht geladen werden."
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [currentUser]);

  function formatGermanDateTime(iso, durationMinutes = 60) {
    if (!iso) {
      return {
        date: "",
        time: ""
      };
    }

    const start = new Date(iso);
    const duration = Number(durationMinutes);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;
    const end = new Date(
      start.getTime() +
        safeDuration * 60 * 1000
    );

    const date =
      new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(start);

    const time =
      new Intl.DateTimeFormat(
        "de-DE",
        {
          timeZone: "Europe/Berlin",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }
      );

    return {
      date,
      time: `${time.format(
        start
      )}–${time.format(end)} Uhr`
    };
  }

  function getWorkshopCapacityLabel(workshop, registrationCount = 0) {
  const max = Number(workshop?.max_pair_count);
  const count = Number(registrationCount || 0);
  if (!Number.isFinite(max) || max <= 0) return "";
  const free = Math.max(0, max - count);
  if (free === 0) {
    return `👥 ${count} von ${max} Paaren belegt · 🔴 AUSGEBUCHT`;
  }
  return `👥 ${count} von ${max} Paaren belegt · ${free} Paarplätze frei`;
}

function formatRecurringTime(timeValue, durationMinutes = 60) {
    if (!timeValue) return "";
    const parts = String(timeValue).split(":");
    if (parts.length < 2) return String(timeValue);

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(timeValue);

    const duration = Number(durationMinutes);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 60;
    const totalStartMinutes = hours * 60 + minutes;
    const totalEndMinutes = totalStartMinutes + safeDuration;
    const endHours = Math.floor(totalEndMinutes / 60) % 24;
    const endMinutes = totalEndMinutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}–${String(
      endHours
    ).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")} Uhr`;
  }

  function getWorkshopDateLabel(workshop) {
    if (workshop?.recurrence_text) return workshop.recurrence_text;
    return workshop?.starts_at
      ? formatGermanDateTime(workshop.starts_at).date
      : "Termin noch offen";
  }

  function getWorkshopAvailabilityLabel(workshop, registrations = []) {
    const maxPairs = Number(workshop?.max_pair_count);
    if (!Number.isFinite(maxPairs) || maxPairs <= 0) return "";
    const workshopId = String(workshop?.id ?? "");
    const bookedPairs = (registrations || []).filter(
      r => String(r.workshop_id ?? "") === workshopId
    ).length;
    const freePairs = Math.max(0, maxPairs - bookedPairs);
    if (freePairs === 0) return `🔴 ${bookedPairs} von ${maxPairs} Paaren belegt · AUSGEBUCHT`;
    return `👥 ${bookedPairs} von ${maxPairs} Paaren belegt · ${freePairs} Paarplätze frei`;
  }

  function getWorkshopTimeLabel(workshop) {
    if (workshop?.start_time) {
      return formatRecurringTime(workshop.start_time, workshop.duration_minutes);
    }
    return workshop?.starts_at
      ? formatGermanDateTime(workshop.starts_at, workshop.duration_minutes).time
      : "";
  }

  async function toggleInterest(workshopId) {
    const workshop = workshops.find(w => String(w.id) === String(workshopId));
    if (workshop?.allow_partner_search === false) {
      return alert("Für diesen Workshop ist keine Tanzpartnersuche vorgesehen.");
    }

    if (myPairs.has(workshopId)) return;

    const interested =
      myInterests.has(workshopId);

    // Tanzpartnersuche nur bei vollständig ausgefülltem Profil.
    // Das Profilfoto ist ausdrücklich kein Pflichtfeld.
    if (!interested && !profileCompletion.complete) {
      return alert(
        `Bitte vervollständige zuerst dein Profil.\n\nNoch fehlend: ${profileCompletion.missingLabels.join(", ")}.\n\nEin Profilfoto ist dafür nicht erforderlich.`
      );
    }

    if (interested) {
      const { error } =
        await supabase
          .from("workshop_interests")
          .delete()
          .eq(
            "user_id",
            currentUser
          )
          .eq(
            "workshop_id",
            workshopId
          );

      if (error) {
        return alert(error.message);
      }

      setMyInterests(prev => {
        const next = new Set(prev);
        next.delete(workshopId);
        return next;
      });

      await load();
      return true;
    }

    if (!workshop?.level) {
      return alert(
        "Für diesen Workshop wurde noch kein Kursniveau festgelegt."
      );
    }

    // Aktivierung und Chat-Bestätigung erfolgen jetzt in EINEM sicheren
    // Supabase-RPC. Dadurch kann die Suche nicht gespeichert werden, ohne
    // dass gleichzeitig die Nachricht von „Peter & Bettina“ erzeugt wird.
    const { error } = await supabase.rpc(
      "activate_workshop_interest_with_chat",
      { p_workshop_id: workshopId }
    );

    if (error) {
      return alert(error.message);
    }

    setMyInterests(
      prev =>
        new Set(prev).add(workshopId)
    );

    await load();
    return true;
  }

  async function contactForWorkshop(
    workshopId,
    recipientId
  ) {
    if (myPairs.has(workshopId)) {
      return alert("Für diesen Workshop hast du bereits einen Tanzpartner.");
    }

    const { data: existingRequests, error: existingError } =
      await supabase
        .from("contact_requests")
        .select("id,status,requester_id,recipient_id")
        .eq("workshop_id", workshopId)
        .or(
          `and(requester_id.eq.${currentUser},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${currentUser})`
        )
        .order("created_at", { ascending: false })
        .limit(1);

    if (existingError) {
      return alert(existingError.message);
    }

    if (existingRequests?.length) {
      const existing = existingRequests[0];

      if (existing.status === "pending") {
        return alert("Für diesen Workshop besteht bereits eine Anfrage.");
      }

      if (existing.status === "accepted") {
        return alert("Ihr seid für diesen Workshop bereits als Tanzpartner verbunden.");
      }
    }

    const { error } =
      await supabase
        .from("contact_requests")
        .insert({
          requester_id: currentUser,
          recipient_id: recipientId,
          workshop_id: workshopId,
          status: "pending"
        });

    if (error) {
      return alert(
        error.message.includes("duplicate") ||
          error.code === "23505"
          ? "Für diesen Workshop besteht bereits eine Anfrage."
          : error.message
      );
    }

    // Nach erfolgreicher Speicherung die Benachrichtigungs-Mail senden.
    // Die Anfrage bleibt auch dann gespeichert, wenn der Mailversand fehlschlägt.
    const workshop = workshops.find(w => w.id === workshopId);

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", currentUser)
      .maybeSingle();

    const formattedDate = workshop?.starts_at
      ? new Intl.DateTimeFormat("de-DE", {
          timeZone: "Europe/Berlin",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }).format(new Date(workshop.starts_at))
      : "";

    const emailResult = await sendPartnerEmail({
      recipientId,
      partnerName: senderProfile?.display_name || "Ein Tanzpartner",
      workshopName: workshop?.title || "Workshop",
      date: formattedDate,
      messageType: "new_request"
    });

    if (!emailResult.ok) {
      console.warn(
        "Kontaktanfrage wurde gespeichert, aber die E-Mail konnte nicht gesendet werden."
      );
    }

    alert(
      "Kontaktanfrage für diesen Workshop gesendet 💬"
    );
  }

  function openGuestPairRegistration(workshop) {
    const currentName = profile?.display_name || "";
    const currentEmail = user?.email || "";

    setGuestPairForm({
      user1Name: currentName,
      user1Email: currentEmail,
      user2Name: "",
      user2Email: ""
    });
    setGuestPairSuccess(false);
    setGuestPairMode(true);
  }

  async function registerGuestPair(workshop) {
    if (!workshop?.id || guestPairBusy) return;

    const name1 = guestPairForm.user1Name.trim();
    const email1 = guestPairForm.user1Email.trim();
    const name2 = guestPairForm.user2Name.trim();
    const email2 = guestPairForm.user2Email.trim();

    if (!name1 || !email1 || !name2) {
      return alert("Bitte Namen für beide Personen und die E-Mail-Adresse von Person 1 angeben.");
    }

    setGuestPairBusy(true);

    const { data: registrationId, error } = await supabase.rpc("register_guest_workshop_pair", {
      p_workshop_id: workshop.id,
      p_user1_name: name1,
      p_user1_email: email1,
      p_user2_name: name2,
      p_user2_email: email2
    });

    setGuestPairBusy(false);

    if (error) {
      return alert(error.message || "Die Workshop-Anmeldung konnte nicht gespeichert werden.");
    }

    const emailResult = await sendWorkshopPairConfirmation({
      workshopId: workshop.id,
      registrationId,
      user1Name: name1,
      user1Email: email1,
      user2Name: name2,
      user2Email: email2,
      costPerPerson: workshop?.cost_per_person ?? null
    });

    setGuestPairSuccess(true);

    if (!emailResult.ok) {
      console.warn(
        "Die Workshop-Anmeldung wurde gespeichert, aber die Bestätigungs-E-Mails konnten nicht versendet werden."
      );
      alert(
        "Die Anmeldung wurde erfolgreich gespeichert. Die Bestätigungs-E-Mail konnte leider nicht versendet werden."
      );
    }
  }

  async function registerRecurringBooking(workshop) {
    if (!workshop?.id || recurringBusy || recurringSuccess) return;

    const date = String(recurringDate || "");
    const selected = recurringDates.find(d => String(d.session_date) === date);
    const partySize = Number(recurringPartySize) === 2 ? 2 : 1;
    const name1 = recurringForm.user1Name.trim();
    const email1 = recurringForm.user1Email.trim();
    const name2 = recurringForm.user2Name.trim();
    const email2 = recurringForm.user2Email.trim();

    if (!selected) {
      return alert("Bitte einen der nächsten fünf Samstage auswählen.");
    }

    const free = selected.max_people == null
      ? null
      : Math.max(0, Number(selected.max_people) - Number(selected.registered_people || 0));

    if (free != null && free < partySize) {
      return alert("Für diesen Termin sind nicht mehr genügend Plätze frei.");
    }

    if (!name1 || !email1) {
      return alert("Bitte Name und E-Mail-Adresse angeben.");
    }

    if (partySize === 2 && (!name2 || !email2)) {
      return alert("Bitte für beide Personen Name und E-Mail-Adresse angeben.");
    }

    setRecurringBusy(true);

    const { data: registrationId, error } = await supabase.rpc("register_recurring_workshop_booking", {
      p_workshop_id: Number(workshop.id),
      p_session_date: date,
      p_party_size: partySize,
      p_user1_name: name1,
      p_user1_email: email1,
      p_user2_name: partySize === 2 ? name2 : null,
      p_user2_email: partySize === 2 ? email2 : null
    });

    setRecurringBusy(false);

    if (error) {
      return alert(error.message || "Die Anmeldung konnte nicht gespeichert werden.");
    }

    const mail = await sendRecurringWorkshopConfirmation({
      workshopId: workshop.id,
      registrationId,
      sessionDate: date,
      partySize,
      user1Name: name1,
      user1Email: email1,
      user2Name: name2,
      user2Email: email2
    });

    setRecurringSuccess(true);

    if (!mail.ok) {
      alert(
        "Die Anmeldung wurde erfolgreich gespeichert.\n\n" +
        "Die Bestätigungs-E-Mail konnte leider nicht versendet werden."
      );
    }
  }

  async function cancelWorkshopRegistration(workshopId) {
    if (!workshopId || cancellingWorkshop) return;

    const status = myRegistrationStatus;
    const isPair = myPairs.has(workshopId) || status?.registration_type === "registered_pair";
    const isExternal = status?.external_match === true || status?.registration_type === "external_pair";
    const isGuest = status?.guest_pair === true || status?.registration_type === "guest_pair";

    let message = "Möchtest du deine Workshop-Anmeldung wirklich stornieren?";
    if (isPair) {
      message = `Ihr seid als Tanzpaar für diesen Workshop angemeldet.

Mit der Abmeldung wird die gesamte Paaranmeldung storniert und die Tanzpartnerschaft für diesen Workshop beendet.`;
    } else if (isExternal) {
      message = `Möchtest du deine Workshop-Anmeldung wirklich stornieren?

Die Vermittlung mit dem externen Tanzpartner wird dabei ebenfalls beendet. Der externe Tänzer wird danach wieder verfügbar.`;
    } else if (isGuest) {
      message = `Möchtest du die Workshop-Anmeldung wirklich stornieren?

Die Anmeldung gilt für das gesamte Paar und wird vollständig entfernt.`;
    }

    if (!window.confirm(message)) return;

    setCancellingWorkshop(true);
    try {
      const { data, error } = await supabase.rpc(
        "cancel_my_workshop_registration",
        { p_workshop_id: Number(workshopId) }
      );

      if (error) throw error;
      const result = Array.isArray(data) ? (data[0] || null) : data;
      if (result && result.cancelled === false) {
        throw new Error("Die Workshop-Anmeldung konnte nicht storniert werden.");
      }

      setMyRegistrationStatus(null);
      setMyPairs(prev => { const next = new Set(prev); next.delete(Number(workshopId)); return next; });
      setPairPartners(prev => { const next = { ...prev }; delete next[Number(workshopId)]; return next; });
      setMyInterests(prev => { const next = new Set(prev); next.delete(Number(workshopId)); return next; });
      setGuestPairMode(false);
      setGuestPairSuccess(false);
      await load();
      alert("Die Workshop-Anmeldung wurde erfolgreich storniert. ✅");
      setOpenWorkshop(null);
    } catch (error) {
      console.error("Workshop-Anmeldung konnte nicht storniert werden:", error);
      alert("Die Workshop-Anmeldung konnte nicht storniert werden: " + (error?.message || "Unbekannter Fehler"));
    } finally {
      setCancellingWorkshop(false);
    }
  }

  const visibleWorkshopList = (onlyFoundPartners
    ? workshops.filter(w => myPairs.has(w.id) && isWorkshopVisibleToUser(w) && (tanzkreisOnly ? isTanzkreisWorkshop(w) : !isTanzkreisWorkshop(w)))
    : workshops.filter(w => isWorkshopVisibleToUser(w) && (tanzkreisOnly ? isTanzkreisWorkshop(w) : !isTanzkreisWorkshop(w)))
  );

  const workshopMonthGroups = [];
  const monthGroupMap = new Map();
  visibleWorkshopList.forEach(w => {
    const key = w.recurrence_text
      ? `recurring-${w.id}`
      : (w.starts_at
        ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", month: "long", year: "numeric" }).format(new Date(w.starts_at))
        : "Weitere Termine");
    if (!monthGroupMap.has(key)) {
      const group = { key, label: w.recurrence_text ? "DAUERWORKSHOPS" : key, workshops: [] };
      monthGroupMap.set(key, group);
      workshopMonthGroups.push(group);
    }
    monthGroupMap.get(key).workshops.push(w);
  });

  return (
    <section>
      <div style={{ marginBottom: 10, padding: "11px 13px", borderRadius: 16, background: tanzkreisOnly ? "linear-gradient(135deg,#f3f0ff,#ebe6ff)" : "#fff", border: tanzkreisOnly ? "1px solid #d9cdf7" : "1px solid #eeeaf4" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: tanzkreisOnly ? "#5630a8" : "#5b22c7" }}>{tanzkreisOnly ? "⭕ Tanzkreis" : "📅 Workshops"}</div>
        <div className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>{tanzkreisOnly ? "Eigener Bereich für die bestehenden Tanzkreis-Workshops." : "Workshops mit Tanzpartnersuche und normaler Anmeldung."}</div>
      </div>
      {onBack && (
        <button
          className="admin-top-back primary"
          type="button"
          onClick={onBack}
          style={{ background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 17, padding: "11px 18px", borderRadius: 14, border: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", marginBottom: 12 }}
        >
          ‹ Startseite
        </button>
      )}
      <div className="hero">
        <h2 style={{ marginBottom: 4 }}>Sonntags-Workshops</h2>

        <p style={{ margin: 0, fontSize: 13 }}>Finde deinen Workshop und – wenn nötig – einen passenden Tanzpartner.</p>
      </div>

      {busy ? (
        <div className="card">Workshops werden geladen…</div>
      ) : workshops.length === 0 ? (
        <div className="card">Noch keine Workshops eingetragen.</div>
      ) : (
        <>
          <style>{`
            .workshop-list {
              display: grid;
              gap: 7px;
              width: 100%;
              max-width: 760px;
              margin: 0 auto;
            }

            .workshop-modern-card {
              position: relative;
              background: #fff;
              border: 1px solid #ece9f2;
              border-radius: 15px;
              padding: 9px 10px 9px 14px;
              box-shadow: 0 3px 12px rgba(45, 35, 70, 0.05);
              box-sizing: border-box;
              overflow: hidden;
            }

            .workshop-modern-card::before {
              content: "";
              position: absolute;
              left: 0;
              top: 0;
              bottom: 0;
              width: 5px;
              background: #b18bea;
            }

            .workshop-modern-card.recurring {
              background: linear-gradient(90deg, #fffdf5 0%, #fff 32%);
              border-color: #ead9a2;
            }

            .workshop-modern-card.recurring::before {
              background: #f2b500;
            }

            .workshop-main-row {
              display: grid;
              grid-template-columns: 66px minmax(0, 1fr) 78px;
              align-items: start;
              gap: 8px;
              width: 100%;
            }

            .workshop-list-image {
              width: 66px;
              height: 54px;
              border-radius: 11px;
              object-fit: cover;
              display: block;
              background: #f1eafe;
              border: 1px solid #e8def7;
            }

            .workshop-info {
              min-width: 0;
              padding-right: 0;
            }

            .workshop-info .date-line {
              display: inline-block;
              font-size: 11.5px;
              line-height: 1.2;
              color: #6f6b78;
              margin: 0 0 3px;
              white-space: normal;
            }

            .workshop-info h3 {
              margin: 0 0 4px;
              font-size: 16px;
              line-height: 1.14;
              overflow-wrap: anywhere;
              word-break: normal;
            }

            .workshop-meta {
              color: #686571;
              font-size: 12.5px;
              line-height: 1.35;
            }

            .workshop-booking {
              position: absolute;
              top: 12px;
              right: 11px;
              width: 78px;
              min-width: 0;
              min-height: 54px;
              padding: 6px 5px;
              border-radius: 14px;
              background: #eaf6ed;
              color: #2e7b42;
              text-decoration: none;
              font-weight: 800;
              font-size: 13px;
              line-height: 1.1;
              text-align: center;
              border: 0;
              cursor: pointer;
              font-family: inherit;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
            }

            .workshop-actions {
              margin-top: 14px;
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }

            .workshop-modal-backdrop {
              position: fixed; inset: 0; z-index: 1000;
              background: rgba(20,16,30,.52); backdrop-filter: blur(3px);
              display:flex; align-items:center; justify-content:center; padding:14px; box-sizing:border-box;
            }
            .workshop-modal {
              position:relative; width:min(100%,520px); max-height:94vh; overflow-y:auto;
              background:linear-gradient(180deg,#fff 0%,#fbf9ff 100%);
              border-radius:28px; padding:18px 16px 16px;
              box-shadow:0 24px 70px rgba(20,16,30,.30); box-sizing:border-box;
              border:1px solid rgba(111,53,217,.08);
            }
            .workshop-modal-close {
              position:absolute; top:10px; right:12px; z-index:3; width:40px; height:40px;
              border:0; border-radius:50%; background:rgba(255,255,255,.9); font-size:30px; line-height:1;
              cursor:pointer; color:#5f6275; box-shadow:0 3px 12px rgba(40,30,70,.10);
            }
            .workshop-modal-header { position:relative; min-height:112px; padding:2px 128px 2px 2px; box-sizing:border-box; }
            .workshop-modal-logo { position:absolute; top:0; right:6px; width:116px; height:86px; object-fit:contain; object-position:center; border-radius:16px; }
            .workshop-modal-date { color:#6f35d9; font-size:15px; font-weight:700; margin:0 28px 4px 0; }
            .workshop-modal h3 { margin:0 0 6px; color:#25115f; font-size:25px; line-height:1.08; letter-spacing:-.3px; }
            .workshop-modal-level { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:999px; background:#f0e8ff; color:#6330c8; font-weight:800; font-size:14px; }
            .workshop-modal-summary { display:grid; grid-template-columns:1.05fr 1fr 1fr; gap:0; margin-top:4px; padding:9px 6px; border-radius:20px; background:linear-gradient(90deg,#faf7ff,#f8f9ff); border:1px solid #e9e0f7; }
            .workshop-modal-summary-item { padding:0 10px; min-width:0; color:#17152b; }
            .workshop-modal-summary-item + .workshop-modal-summary-item { border-left:1px solid #ddd5eb; }
            .workshop-modal-summary-icon { font-size:19px; margin-bottom:2px; }
            .workshop-modal-summary-main { font-weight:800; font-size:14px; line-height:1.25; }
            .workshop-modal-summary-sub { margin-top:2px; color:#666277; font-size:12px; line-height:1.25; }
            .workshop-modal-actions { display:block; margin-top:12px; }
            .workshop-registration-panel { padding:12px; border-radius:22px; background:linear-gradient(135deg,#faf7ff 0%,#f5efff 100%); border:1px solid #e6daf8; }
            .workshop-registration-title { font-weight:900; color:#6330c8; font-size:20px; }
            .workshop-registration-subtitle { margin-top:4px; color:#5d5870; font-size:13px; line-height:1.35; }
            .workshop-choice-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:11px; }
            .workshop-choice { overflow:hidden; border-radius:18px; border:1px solid #eadff8; background:#fff; box-shadow:0 5px 16px rgba(72,45,125,.07); }
            .workshop-choice-head { min-height:58px; padding:9px 9px; display:flex; align-items:center; gap:7px; color:#fff; font-weight:900; font-size:15px; line-height:1.05; box-sizing:border-box; }
            .workshop-choice-head.purple { background:linear-gradient(135deg,#9a3df0,#6f22df); }
            .workshop-choice-head.orange { background:linear-gradient(135deg,#ff9a22,#f05a0a); }
            .workshop-choice-icon { font-size:24px; flex:0 0 auto; }
            .workshop-choice-body { padding:10px 9px 9px; display:flex; flex-direction:column; min-height:155px; box-sizing:border-box; }
            .workshop-choice-question { font-size:15px; font-weight:900; line-height:1.2; margin-bottom:6px; }
            .workshop-choice-question.purple-text { color:#6330c8; } .workshop-choice-question.orange-text { color:#d34d0b; }
            .workshop-choice-copy { color:#5c6070; font-size:12.5px; line-height:1.35; flex:1; }
            .workshop-choice button { width:100%; margin-top:9px; border:0; border-radius:12px; padding:10px 6px; color:#fff; font-family:inherit; font-size:12.5px; font-weight:900; cursor:pointer; }
            .workshop-choice button.purple { background:linear-gradient(135deg,#8c2ff0,#6a1edb); }
            .workshop-choice button.orange { background:linear-gradient(135deg,#ff8c16,#f05a0a); }
            .workshop-modal-seekers { margin-top:13px; padding:13px; border-radius:20px; background:linear-gradient(135deg,#faf7ff,#f2ebff); border:1px solid #e4d8f8; }
            .workshop-modal-seekers-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
            .workshop-modal-seekers h4 { margin:0; font-size:18px; color:#17152b; line-height:1.2; }
            .workshop-seeker-count { flex:0 0 auto; padding:6px 10px; border-radius:999px; background:#e9ddff; color:#6330c8; font-weight:900; font-size:13px; }
            .workshop-seekers-intro { margin-top:7px; color:#5d6174; font-size:13px; line-height:1.4; }
            .workshop-seekers-show { width:100%; margin-top:9px; padding:10px 12px; border-radius:13px; border:1px solid #7a35df; background:#fff; color:#6330c8; font-family:inherit; font-weight:900; cursor:pointer; }
            .workshop-modal-seekers .seeker { background:#fff; border-radius:15px; padding:12px; margin-top:9px; border:1px solid #e8e2f1; }
            .workshop-modal-seekers .seeker b { font-size:17px; }
            .workshop-modal-seekers .seeker .primary { margin-top:10px; width:100%; }
            .workshop-modal-info { margin-top:12px; padding:12px 14px; border:1px solid #e1d5f5; border-radius:16px; background:#faf7ff; color:#5f5b68; box-sizing:border-box; }
            .workshop-modal-info-title { font-size:16px; font-weight:800; color:#6330c8; margin-bottom:5px; }
            .workshop-modal-info-text { font-size:14px; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
            .workshop-modal-help { margin-top:12px; padding:12px 14px; border-radius:18px; background:#eef5ff; border:1px solid #dce9ff; color:#24377a; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
            .workshop-modal-help-title { font-weight:900; font-size:14px; } .workshop-modal-help-sub { margin-top:2px; font-size:12px; color:#58627e; }
            .workshop-modal-help-contact { display:flex; align-items:center; gap:8px; font-weight:900; font-size:13px; white-space:nowrap; }
            .workshop-modal-actions a,.workshop-modal-actions button { box-sizing:border-box; text-align:center; text-decoration:none; }

            .workshop-guest-registration { margin-top: 12px; }

            @media (max-width: 520px) {
              .workshop-modal {
                width: calc(100vw - 14px);
                max-width: 520px;
               