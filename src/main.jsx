import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

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

// Öffentliches Login-Hintergrundbild aus dem Supabase-Bucket.
// Der Zeitstempel verhindert, dass nach einem Austausch des Bildes
// eine alte Browser-/CDN-Version angezeigt wird.
const LOGIN_BACKGROUND_BASE_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/login-bg.png";
const LOGIN_BACKGROUND_URL = `${LOGIN_BACKGROUND_BASE_URL}?v=${Date.now()}`;

const ADMIN_USER_ID = "dee327bb-f3eb-4ada-bf05-bad48e4844df";

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

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error("getSession Fehler:", error);
      }

      setSession(data?.session || null);
      setLoading(false);
    });

    const {
      data: listener
    } = supabase.auth.onAuthStateChange(
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

  if (loading) {
    return <div className="center">Laden...</div>;
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

function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

        const { error } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                display_name: displayName.trim()
              }
            }
          });

        if (error) throw error;

        setMessage(
          "Registrierung erfolgreich. Falls E-Mail-Bestätigung aktiviert ist, prüfe bitte dein Postfach."
        );
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
          });

        if (error) throw error;
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
        .peter-bettina-brand {
          letter-spacing: 0.01em;
        }

        @media (max-width: 420px) {
          .peter-bettina-brand {
            font-size: clamp(30px, 8.5vw, 38px) !important;
          }
        }
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
          Peter &amp; Bettina’s
        </div>

        <h1>Tanzpartnerbörse</h1>

        <p className="muted">
          Finde deinen Tanzpartner für die Workshops
        </p>

        <div className="tabs">
          <button
            type="button"
            className={
              mode === "login" ? "active" : ""
            }
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>

          <button
            type="button"
            className={
              mode === "register" ? "active" : ""
            }
            onClick={() => setMode("register")}
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
              onChange={e =>
                setEmail(e.target.value)
              }
              placeholder="name@beispiel.de"
              required
            />
          </label>

          <label>
            Passwort

            <input
              type="password"
              value={password}
              onChange={e =>
                setPassword(e.target.value)
              }
              placeholder="Mindestens 6 Zeichen"
              required
              minLength="6"
            />
          </label>

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
      </div>
    </div>
  );
}

function Dashboard({ session }) {
  const [tab, setTab] = useState("workshops");
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] =
    useState(true);

  const isAdmin =
    session.user.id ===
    "dee327bb-f3eb-4ada-bf05-bad48e4844df";

  async function logout() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setProfileLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error(
          "Profil konnte nicht geladen werden:",
          error
        );
      }

      setProfile(data || null);
      setProfileLoading(false);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session.user.id]);

  return (
    <div className="app">
      <header>
        <div>
          <div
            className="brand"
            style={{
              textAlign: "left",
              lineHeight: 1,
              marginBottom: "4px"
            }}
          >
            <div
              style={{
                fontFamily:
                  '"Brush Script MT", "Segoe Script", "URW Chancery L", cursive',
                fontSize: "clamp(22px, 5vw, 34px)",
                color: "#6f35d9",
                lineHeight: 1.05,
                whiteSpace: "nowrap"
              }}
            >
              Peter &amp; Bettina’s
            </div>

            <div
              style={{
                fontSize: "clamp(18px, 4vw, 28px)",
                fontWeight: 800,
                lineHeight: 1.05
              }}
            >
              Tanzpartnerbörse
            </div>
          </div>

          <div className="small">
            Hallo{" "}
            {profile?.display_name ||
              session.user.user_metadata
                ?.display_name ||
              "Tanzfreund"}
            !
          </div>
        </div>

        <button
          className="ghost"
          onClick={logout}
        >
          Abmelden
        </button>
      </header>

      <main>
        {tab === "workshops" && (
          <Workshops
            currentUser={session.user.id}
          />
        )}

        {tab === "profil" && (
          <ProfileEditor
            user={session.user}
            profile={profile}
            profileLoading={profileLoading}
            setProfile={setProfile}
          />
        )}

        {tab === "kontakte" && (
          <Contacts
            userId={session.user.id}
          />
        )}

        {tab === "admin" && isAdmin && (
          <ErrorBoundary>
            <AdminPanel />
          </ErrorBoundary>
        )}
      </main>

      <nav>
        <button
          className={
            tab === "workshops"
              ? "selected"
              : ""
          }
          onClick={() =>
            setTab("workshops")
          }
        >
          🎟️
          <span>Workshops</span>
        </button>

        <button
          className={
            tab === "kontakte"
              ? "selected"
              : ""
          }
          onClick={() =>
            setTab("kontakte")
          }
        >
          💬
          <span>Kontakte</span>
        </button>

        <button
          className={
            tab === "profil"
              ? "selected"
              : ""
          }
          onClick={() =>
            setTab("profil")
          }
        >
          👤
          <span>Profil</span>
        </button>

        {isAdmin && (
          <button
            className={
              tab === "admin"
                ? "selected"
                : ""
            }
            onClick={() =>
              setTab("admin")
            }
          >
            🔐
            <span>Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
}

function Workshops({ currentUser }) {
  const [workshops, setWorkshops] = useState([]);
  const [myInterests, setMyInterests] =
    useState(new Set());
  const [myPairs, setMyPairs] =
    useState(new Set());
  const [pairPartners, setPairPartners] =
    useState({});
  const [seekers, setSeekers] = useState({});
  const [busy, setBusy] = useState(true);
  const [selectedLevels, setSelectedLevels] =
    useState({});
  const [openWorkshop, setOpenWorkshop] = useState(null);

  async function load() {
    setBusy(true);

    try {
      const [
        { data: ws, error: wsError },
        { data: interests },
        { data: pairs }
      ] = await Promise.all([
        supabase
          .from("workshops")
          .select(
            "id,title,starts_at,location,booking_url,dance_styles(name)"
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
          )
      ]);

      if (wsError) {
        alert(wsError.message);
      }

      setWorkshops(ws || []);

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

      // Die Namen der jeweiligen Tanzpartner separat laden.
      // So bleibt die Anzeige unabhängig von Supabase-Relation-Namen.
      const partnerIds = [
        ...new Set(
          (pairs || [])
            .filter(
              p =>
                p.user1_id === currentUser ||
                p.user2_id === currentUser
            )
            .map(p =>
              p.user1_id === currentUser
                ? p.user2_id
                : p.user1_id
            )
            .filter(Boolean)
        )
      ];

      let partnerProfiles = [];

      if (partnerIds.length > 0) {
        const { data: profiles, error: profileError } =
          await supabase
            .from("profiles")
            .select("id,display_name")
            .in("id", partnerIds);

        if (profileError) {
          console.warn(
            "Tanzpartner-Namen konnten nicht geladen werden:",
            profileError.message
          );
        } else {
          partnerProfiles = profiles || [];
        }
      }

      const profileMap = Object.fromEntries(
        partnerProfiles.map(p => [p.id, p.display_name])
      );

      const partnerMap = {};

      for (const pair of pairs || []) {
        if (
          pair.user1_id === currentUser ||
          pair.user2_id === currentUser
        ) {
          const otherId =
            pair.user1_id === currentUser
              ? pair.user2_id
              : pair.user1_id;

          partnerMap[pair.workshop_id] =
            profileMap[otherId] || "Tanzpartner/in";
        }
      }

      setPairPartners(partnerMap);

      const map = {};

      for (const w of ws || []) {
        const [
          { data: wi },
          { data: wp }
        ] = await Promise.all([
          supabase
            .from("workshop_interests")
            .select(
              "user_id,level,profiles(id,display_name,age,gender,height_cm,avatar_url,is_visible,is_blocked)"
            )
            .eq("workshop_id", w.id),

          supabase
            .from("workshop_pairs")
            .select(
              "user1_id,user2_id"
            )
            .eq("workshop_id", w.id)
        ]);

        const paired = new Set(
          (wp || []).flatMap(p => [
            p.user1_id,
            p.user2_id
          ])
        );

        map[w.id] = (wi || [])
          .filter(
            x =>
              x.user_id &&
              x.user_id !== currentUser &&
              !paired.has(x.user_id) &&
              x.profiles?.is_visible !== false &&
              x.profiles?.is_blocked !== true
          )
          .map(x => ({
            ...x.profiles,
            id: x.user_id,
            user_id: x.user_id,
            workshop_level: x.level
          }))
          .filter(Boolean);
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

  function formatGermanDateTime(iso) {
    const start = new Date(iso);
    const end = new Date(
      start.getTime() +
        60 * 60 * 1000
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
      new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

    return {
      date,
      time: `${time.format(
        start
      )}–${time.format(end)} Uhr`
    };
  }

  async function toggleInterest(workshopId) {
    if (myPairs.has(workshopId)) return;

    const interested =
      myInterests.has(workshopId);

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
      return;
    }

    const level =
      selectedLevels[workshopId];

    if (!level) {
      return alert(
        "Bitte wähle zuerst dein Niveau für diesen Workshop."
      );
    }

    const { error } =
      await supabase
        .from("workshop_interests")
        .insert({
          user_id: currentUser,
          workshop_id: workshopId,
          level
        });

    if (error) {
      return alert(error.message);
    }

    setMyInterests(
      prev =>
        new Set(prev).add(workshopId)
    );

    await load();
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

  async function dissolvePair(workshopId) {
    const { data: pairs, error } =
      await supabase
        .from("workshop_pairs")
        .select("workshop_id,user1_id,user2_id")
        .eq("workshop_id", workshopId)
        .or(
          `user1_id.eq.${currentUser},user2_id.eq.${currentUser}`
        )
        .limit(1);

    if (error) {
      return alert(
        "Tanzpartnerschaft konnte nicht geladen werden: " +
        error.message
      );
    }

    const pair = pairs?.[0];

    if (!pair) {
      return alert(
        "Für diesen Workshop wurde keine Tanzpartnerschaft gefunden."
      );
    }

    if (
      !confirm(
        "Tanzpartnerschaft für diesen Workshop wirklich auflösen?"
      )
    ) {
      return;
    }

    const otherUserId =
      pair.user1_id === currentUser
        ? pair.user2_id
        : pair.user1_id;

    const { error: deleteError } =
      await supabase
        .from("workshop_pairs")
        .delete()
        .eq("workshop_id", workshopId)
        .eq("user1_id", pair.user1_id)
        .eq("user2_id", pair.user2_id);

    if (deleteError) {
      return alert(
        "Tanzpartnerschaft konnte nicht aufgelöst werden: " +
        deleteError.message
      );
    }

    await supabase
      .from("contact_requests")
      .update({ status: "cancelled" })
      .eq("workshop_id", workshopId)
      .or(
        `and(requester_id.eq.${currentUser},recipient_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},recipient_id.eq.${currentUser})`
      )
      .in("status", ["accepted", "pending"]);

    await load();
    setOpenWorkshop(current =>
      current?.id === workshopId ? null : current
    );
  }

  return (
    <section>
      <div className="hero">
        <h2>Sonntags-Workshops</h2>

        <p>
          Finde einen Tanzpartner für genau den
          Workshop, an dem du teilnehmen möchtest.
        </p>
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
              gap: 16px;
              width: 100%;
              max-width: 760px;
              margin: 0 auto;
            }

            .workshop-modern-card {
              background: #fff;
              border: 1px solid #ece9f2;
              border-radius: 22px;
              padding: 18px 16px;
              box-shadow: 0 4px 16px rgba(45, 35, 70, 0.06);
              box-sizing: border-box;
              overflow: hidden;
            }

            .workshop-main-row {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 86px;
              align-items: center;
              gap: 14px;
              width: 100%;
            }

            .workshop-info {
              min-width: 0;
            }

            .workshop-info .date-line {
              font-size: 13px;
              line-height: 1.35;
              color: #6f6b78;
              margin: 0 0 4px;
              white-space: normal;
            }

            .workshop-info h3 {
              margin: 0 0 7px;
              font-size: 19px;
              line-height: 1.18;
              overflow-wrap: anywhere;
              word-break: normal;
            }

            .workshop-meta {
              color: #686571;
              font-size: 14px;
              line-height: 1.55;
            }

            .workshop-booking {
              width: 86px;
              min-width: 0;
              min-height: 64px;
              padding: 8px 6px;
              border-radius: 16px;
              background: #eaf6ed;
              color: #2e7b42;
              text-decoration: none;
              font-weight: 800;
              font-size: 14px;
              line-height: 1.15;
              text-align: center;
              border: 0;
              cursor: pointer;
              font-family: inherit;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              justify-self: end;
              box-sizing: border-box;
            }

            .workshop-actions {
              margin-top: 14px;
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }

            .workshop-modal-backdrop {
              position: fixed;
              inset: 0;
              z-index: 1000;
              background: rgba(20, 16, 30, .42);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }

            .workshop-modal {
              position: relative;
              width: min(100%, 430px);
              max-height: 90vh;
              overflow-y: auto;
              background: #fff;
              border-radius: 24px;
              padding: 26px 22px 22px;
              box-shadow: 0 18px 50px rgba(20, 16, 30, .25);
              box-sizing: border-box;
            }

            .workshop-modal-close {
              position: absolute;
              top: 10px;
              right: 12px;
              border: 0;
              background: transparent;
              font-size: 30px;
              line-height: 1;
              cursor: pointer;
              color: #777;
            }

            .workshop-modal-date {
              color: #6f6b78;
              font-size: 14px;
              margin-bottom: 5px;
            }

            .workshop-modal h3 {
              margin: 0 35px 12px 0;
              font-size: 25px;
            }

            .workshop-modal-meta {
              color: #686571;
              line-height: 1.7;
              font-size: 15px;
            }

            .workshop-modal-actions {
              display: flex;
              flex-direction: column;
              gap: 10px;
              margin-top: 20px;
            }

            .workshop-modal-seekers {
              margin-top: 22px;
            }

            .workshop-modal-seekers h4 {
              margin: 0 0 14px;
              font-size: 20px;
            }

            .workshop-modal-seekers .seeker {
              background: #fafafa;
              border-radius: 16px;
              padding: 14px;
              margin-top: 10px;
            }

            .workshop-modal-seekers .seeker b {
              font-size: 18px;
            }

            .workshop-modal-seekers .seeker .primary {
              margin-top: 12px;
              width: 100%;
            }

            .workshop-modal-actions a,
            .workshop-modal-actions button {
              width: 100%;
              box-sizing: border-box;
              text-align: center;
              text-decoration: none;
            }

            @media (max-width: 520px) {
              .workshop-modern-card {
                padding: 16px 14px;
                border-radius: 20px;
              }

              .workshop-main-row {
                grid-template-columns: minmax(0, 1fr) 78px;
                gap: 10px;
                align-items: center;
              }

              .workshop-info .date-line {
                font-size: 12px;
                margin-bottom: 4px;
              }

              .workshop-info h3 {
                font-size: 18px;
                line-height: 1.17;
                margin-bottom: 6px;
              }

              .workshop-meta {
                font-size: 13px;
                line-height: 1.5;
              }

              .workshop-booking {
                width: 78px;
                min-height: 58px;
                border-radius: 15px;
                font-size: 13px;
                padding: 7px 5px;
              }
            }

            @media (max-width: 360px) {
              .workshop-main-row {
                grid-template-columns: minmax(0, 1fr) 70px;
                gap: 8px;
              }

              .workshop-info h3 {
                font-size: 17px;
              }

              .workshop-meta {
                font-size: 12px;
              }

              .workshop-booking {
                width: 70px;
                font-size: 12px;
              }
            }
          `}</style>

          <div className="workshop-list">
            {workshops.map(w => {
              const dt = formatGermanDateTime(w.starts_at);
              const interested = myInterests.has(w.id);
              const paired = myPairs.has(w.id);
              const openSeekers = seekers[w.id] || [];

              return (
                <article className="workshop-modern-card" key={w.id}>
                  <div className="workshop-main-row">
                    <div className="workshop-info">
                      <div className="date-line">{dt.date}</div>
                      <h3>{w.title}</h3>

                      <div className="workshop-meta">
                        🕓 {dt.time}
                        <br />
                        📍 {w.location || "Hazienda im Sonnenhof Aspach"}
                      </div>
                    </div>

                    <button
                      className="workshop-booking"
                      type="button"
                      onClick={() => setOpenWorkshop(w)}
                      aria-label={`${w.title} öffnen`}
                    >
                      Hier<br />öffnen
                    </button>
                  </div>

                  {paired && (
                    <div className="notice success" style={{ marginTop: 14 }}>
                      <div>✅ Tanzpartner gefunden</div>
                      <div style={{ marginTop: 6, fontWeight: 700 }}>
                        👤 Dein Tanzpartner: {pairPartners[w.id] || "Tanzpartner/in"}
                      </div>

                      <button
                        type="button"
                        className="ghost"
                        onClick={() => dissolvePair(w.id)}
                        style={{
                          marginTop: 12,
                          width: "100%",
                          borderColor: "#d8c9ee",
                          color: "#6f35d9",
                          fontWeight: 700,
                          background: "#faf8ff"
                        }}
                      >
                        🔓 Tanzpartnerschaft auflösen
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {openWorkshop && (
            <div
              className="workshop-modal-backdrop"
              onClick={() => setOpenWorkshop(null)}
              role="presentation"
            >
              <div
                className="workshop-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="workshop-modal-title"
              >
                <button
                  className="workshop-modal-close"
                  type="button"
                  onClick={() => setOpenWorkshop(null)}
                  aria-label="Schließen"
                >
                  ×
                </button>

                <div className="workshop-modal-date">
                  {formatGermanDateTime(openWorkshop.starts_at).date}
                </div>
                <h3 id="workshop-modal-title">{openWorkshop.title}</h3>

                <div className="workshop-modal-meta">
                  🕓 {formatGermanDateTime(openWorkshop.starts_at).time}
                  <br />
                  📍 {openWorkshop.location || "Hazienda im Sonnenhof Aspach"}
                </div>

                <div className="workshop-modal-actions">
                  {openWorkshop.booking_url && (
                    <a
                      className="primary"
                      href={openWorkshop.booking_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🎟️ Workshop-Anmeldung öffnen
                    </a>
                  )}

                  {myPairs.has(openWorkshop.id) && (
                    <div
                      className="notice success"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        marginTop: 4
                      }}
                    >
                      <div>✅ Tanzpartner gefunden</div>
                      <div style={{ marginTop: 6, fontWeight: 700 }}>
                        👤 Dein Tanzpartner: {pairPartners[openWorkshop.id] || "Tanzpartner/in"}
                      </div>

                      <button
                        type="button"
                        className="ghost"
                        onClick={() => dissolvePair(openWorkshop.id)}
                        style={{
                          marginTop: 12,
                          width: "100%",
                          borderColor: "#d8c9ee",
                          color: "#6f35d9",
                          fontWeight: 700,
                          background: "#faf8ff"
                        }}
                      >
                        🔓 Tanzpartnerschaft auflösen
                      </button>
                    </div>
                  )}

                  {!myPairs.has(openWorkshop.id) && (
                    <>
                      {!myInterests.has(openWorkshop.id) && (
                        <select
                          value={selectedLevels[openWorkshop.id] || ""}
                          onChange={e =>
                            setSelectedLevels(prev => ({
                              ...prev,
                              [openWorkshop.id]: e.target.value
                            }))
                          }
                        >
                          <option value="">⭐ Niveau wählen</option>
                          <option value="Anfänger">Anfänger</option>
                          <option value="Mittelstufe">Mittelstufe</option>
                          <option value="Fortgeschritten">Fortgeschritten</option>
                        </select>
                      )}

                      <button
                        className={myInterests.has(openWorkshop.id) ? "primary" : "ghost"}
                        type="button"
                        onClick={() => toggleInterest(openWorkshop.id)}
                      >
                        {myInterests.has(openWorkshop.id)
                          ? "❌ Tanzpartnersuche zurückziehen"
                          : "💃 Tanzpartner suchen"}
                      </button>
                    </>
                  )}
                </div>

                <div className="workshop-modal-seekers">
                  <h4>👥 Sucht noch einen Tanzpartner</h4>

                  {(seekers[openWorkshop.id] || []).length > 0 ? (
                    (seekers[openWorkshop.id] || []).map(p => (
                      <div className="row seeker" key={p.id}>
                        <div>
                          <b>
                            {p.display_name}
                            {p.age ? `, ${p.age}` : ""}
                          </b>
                          <div className="muted">
                            {[
                              p.gender,
                              p.height_cm ? `${p.height_cm} cm` : null
                            ].filter(Boolean).join(" · ")}
                          </div>
                          <div className="muted">
                            ⭐ {p.workshop_level || "Niveau nicht angegeben"}
                          </div>
                        </div>

                        <button
                          className="primary"
                          type="button"
                          onClick={() => contactForWorkshop(openWorkshop.id, p.id)}
                        >
                          Kontakt aufnehmen
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="muted">
                      Noch keine weiteren offenen Suchenden für diesen Workshop.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ProfileEditor({
  user,
  profile,
  profileLoading,
  setProfile
}) {
  const [form, setForm] = useState(profile || {});
  const [contact, setContact] = useState({
    email: user.email || "",
    phone: "",
    share_contacts: false
  });
  const [busy, setBusy] = useState(false);
  const [contactLoading, setContactLoading] = useState(true);
  const [openSection, setOpenSection] = useState(null);
  const [myWorkshops, setMyWorkshops] = useState([]);
  const [mySearches, setMySearches] = useState([]);
  const [workshopLoading, setWorkshopLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setForm(profile || {});
  }, [profile]);

  useEffect(() => {
    let mounted = true;

    async function loadContact() {
      setContactLoading(true);

      const { data, error } = await supabase
        .from("contact_details")
        .select("email,phone,share_contacts")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error(
          "Kontaktdaten konnten nicht geladen werden:",
          error
        );
      }

      setContact(
        data || {
          email: user.email || "",
          phone: "",
          share_contacts: false
        }
      );

      setContactLoading(false);
    }

    loadContact();

    return () => {
      mounted = false;
    };
  }, [user.id, user.email]);

  useEffect(() => {
    let mounted = true;

    async function loadWorkshopData() {
      setWorkshopLoading(true);

      const [
        { data: interests, error: interestError },
        { data: pairs }
      ] = await Promise.all([
        supabase
          .from("workshop_interests")
          .select("workshop_id,level")
          .eq("user_id", user.id),

        supabase
          .from("workshop_pairs")
          .select("workshop_id,user1_id,user2_id")
          .or(
            `user1_id.eq.${user.id},user2_id.eq.${user.id}`
          )
      ]);

      if (!mounted) return;

      if (interestError) {
        console.error(
          "Workshop-Anmeldungen konnten nicht geladen werden:",
          interestError
        );
        setWorkshopLoading(false);
        return;
      }

      const ids = [
        ...new Set(
          (interests || [])
            .map(x => x.workshop_id)
            .filter(Boolean)
        )
      ];

      let workshops = [];

      if (ids.length) {
        const { data, error } = await supabase
          .from("workshops")
          .select(
            "id,title,starts_at,location"
          )
          .in("id", ids)
          .order("starts_at");

        if (error) {
          console.error(
            "Workshops konnten nicht geladen werden:",
            error
          );
        }

        workshops = data || [];
      }

      const pairedRows = pairs || [];
      const pairedIds = new Set(
        pairedRows.map(x => x.workshop_id)
      );

      const levelMap = Object.fromEntries(
        (interests || []).map(x => [
          x.workshop_id,
          x.level
        ])
      );

      const partnerIds = [
        ...new Set(
          pairedRows.flatMap(pair => {
            if (pair.user1_id === user.id) {
              return [pair.user2_id];
            }

            if (pair.user2_id === user.id) {
              return [pair.user1_id];
            }

            return [];
          })
        )
      ].filter(Boolean);

      let partnerProfiles = [];

      if (partnerIds.length) {
        const {
          data: profiles,
          error: profileError
        } = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", partnerIds);

        if (profileError) {
          console.warn(
            "Tanzpartner-Namen konnten nicht geladen werden:",
            profileError.message
          );
        } else {
          partnerProfiles = profiles || [];
        }
      }

      const partnerNameMap = Object.fromEntries(
        partnerProfiles.map(p => [
          p.id,
          p.display_name
        ])
      );

      const partnerByWorkshop = {};

      for (const pair of pairedRows) {
        if (
          pair.user1_id !== user.id &&
          pair.user2_id !== user.id
        ) {
          continue;
        }

        const otherId =
          pair.user1_id === user.id
            ? pair.user2_id
            : pair.user1_id;

        partnerByWorkshop[pair.workshop_id] =
          partnerNameMap[otherId] ||
          "Tanzpartner/in";
      }

      const list = workshops.map(w => ({
        ...w,
        level: levelMap[w.id] || "",
        paired: pairedIds.has(w.id),
        partnerName:
          partnerByWorkshop[w.id] || ""
      }));

      setMyWorkshops(list);
      setMySearches(
        list.filter(w => !w.paired)
      );
      setWorkshopLoading(false);
    }

    loadWorkshopData();

    return () => {
      mounted = false;
    };
  }, [user.id]);

  function change(k, v) {
    setForm(f => ({
      ...f,
      [k]: v
    }));
  }

  function changeContact(k, v) {
    setContact(c => ({
      ...c,
      [k]: v
    }));
  }

  function toggleSection(section) {
    setOpenSection(current =>
      current === section
        ? null
        : section
    );
  }

  function formatWorkshopDate(iso) {
    if (!iso) return "";

    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(iso));
  }

  async function save(e) {
    e.preventDefault();

    if (busy) return;

    setBusy(true);

    try {
      const displayName = (
        form.display_name ||
        user.user_metadata?.display_name ||
        "Tanzpartner"
      ).trim();

      const payload = {
        id: user.id,
        display_name:
          displayName || "Tanzpartner",
        age: form.age
          ? Number(form.age)
          : null,
        gender: form.gender || null,
        height_cm: form.height_cm
          ? Number(form.height_cm)
          : null,
        is_visible:
          form.is_visible !== false,
        is_blocked:
          profile?.is_blocked === true,
        workshop_email_notifications:
          form.workshop_email_notifications !==
          false
      };

      const {
        data,
        error
      } = await supabase
        .from("profiles")
        .upsert(payload, {
          onConflict: "id"
        })
        .select("*")
        .single();

      if (error) {
        throw new Error(
          "Profil konnte nicht gespeichert werden:\n" +
          error.message
        );
      }

      const contactPayload = {
        user_id: user.id,
        email: (
          contact.email ||
          user.email ||
          ""
        ).trim() || null,
        phone: (
          contact.phone || ""
        ).trim() || null,
        share_contacts:
          contact.share_contacts === true
      };

      const {
        error: contactError
      } = await supabase
        .from("contact_details")
        .upsert(
          contactPayload,
          { onConflict: "user_id" }
        );

      if (contactError) {
        throw new Error(
          "Profil wurde gespeichert, aber die Kontaktdaten konnten nicht gespeichert werden:\n" +
          contactError.message
        );
      }

      setForm(data);
      setProfile(data);
      setOpenSection(null);

      alert("Profil gespeichert ✅");
    } catch (err) {
      alert(
        err.message ||
        "Unbekannter Fehler beim Speichern."
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();

    if (password.length < 6) {
      alert(
        "Das Passwort muss mindestens 6 Zeichen haben."
      );
      return;
    }

    setPasswordBusy(true);

    const { error } =
      await supabase.auth.updateUser({
        password
      });

    setPasswordBusy(false);

    if (error) {
      alert(error.message);
      return;
    }

    setPassword("");
    setOpenSection(null);

    alert(
      "Passwort wurde geändert. ✅"
    );
  }

  if (profileLoading) {
    return (
      <section className="profile-page">
        <h2>👤 Mein Profil</h2>
        <div className="card">
          Profil wird geladen…
        </div>
      </section>
    );
  }

  return (
    <section
      className="profile-page"
      style={{ paddingBottom: 20 }}
    >
      <h2
        style={{
          marginBottom: 18,
          fontSize: 30
        }}
      >
        👤 Mein Profil
      </h2>

      {/* Profil + Einstellungen */}
      <article
        className="profile-card"
        style={{
          padding: 0,
          overflow: "hidden"
        }}
      >
        <ProfileMenuRow
          icon="👤"
          label="Mein Profil"
          onClick={() =>
            toggleSection("profile")
          }
          open={openSection === "profile"}
        />

        {openSection === "profile" && (
          <form
            onSubmit={save}
            style={{
              padding: "18px 22px",
              borderTop:
                "1px solid #eee"
            }}
          >
            <label>
              Anzeigename
              <input
                value={
                  form.display_name || ""
                }
                onChange={e =>
                  change(
                    "display_name",
                    e.target.value
                  )
                }
                required
              />
            </label>

            <label>
              Alter
              <input
                type="number"
                min="18"
                max="100"
                value={form.age || ""}
                onChange={e =>
                  change(
                    "age",
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Geschlecht
              <select
                value={
                  form.gender || ""
                }
                onChange={e =>
                  change(
                    "gender",
                    e.target.value
                  )
                }
              >
                <option value="">
                  Bitte auswählen
                </option>
                <option value="Frau">
                  Frau
                </option>
                <option value="Mann">
                  Mann
                </option>
                <option value="Divers">
                  Divers
                </option>
              </select>
            </label>

            <label>
              Größe in cm{" "}
              <span className="small">
                (optional)
              </span>
              <input
                type="number"
                min="120"
                max="230"
                value={
                  form.height_cm || ""
                }
                onChange={e =>
                  change(
                    "height_cm",
                    e.target.value
                  )
                }
              />
            </label>

            <button
              className="primary wide"
              disabled={busy}
            >
              {busy
                ? "Speichern…"
                : "Profil speichern"}
            </button>
          </form>
        )}

        <ProfileMenuRow
          icon="⚙️"
          label="Einstellungen"
          onClick={() =>
            toggleSection("settings")
          }
          open={openSection === "settings"}
        />

        {openSection === "settings" && (
          <div
            style={{
              padding: "18px 22px",
              borderTop:
                "1px solid #eee"
            }}
          >
            <label className="check">
              <input
                type="checkbox"
                checked={
                  form.is_visible !== false
                }
                onChange={e =>
                  change(
                    "is_visible",
                    e.target.checked
                  )
                }
              />
              Mein Profil in der
              Tanzpartnersuche anzeigen
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={
                  form.workshop_email_notifications !==
                  false
                }
                onChange={e =>
                  change(
                    "workshop_email_notifications",
                    e.target.checked
                  )
                }
              />
              📧 Über neue Workshops
              per E-Mail informiert werden
            </label>

            <button
              className="primary wide"
              onClick={save}
              disabled={busy}
            >
              {busy
                ? "Speichern…"
                : "Einstellungen speichern"}
            </button>
          </div>
        )}

        <ProfileMenuRow
          icon="📞"
          label="Kontaktdaten verwalten"
          onClick={() =>
            toggleSection("contact")
          }
          open={openSection === "contact"}
        />

        {openSection === "contact" && (
          <div
            style={{
              padding: "18px 22px",
              borderTop:
                "1px solid #eee"
            }}
          >
            {contactLoading ? (
              <p className="muted">
                Kontaktdaten werden geladen…
              </p>
            ) : (
              <form onSubmit={save}>
                <p
                  className="muted"
                  style={{
                    marginTop: 0
                  }}
                >
                  Deine Kontaktdaten werden
                  erst sichtbar, wenn du und
                  dein Tanzpartner sie beide
                  freigegeben habt.
                </p>

                <label>
                  E-Mail
                  <input
                    type="email"
                    value={
                      contact.email || ""
                    }
                    onChange={e =>
                      changeContact(
                        "email",
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Telefon
                  <input
                    type="tel"
                    value={
                      contact.phone || ""
                    }
                    onChange={e =>
                      changeContact(
                        "phone",
                        e.target.value
                      )
                    }
                    placeholder="z. B. 0170 1234567"
                  />
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={
                      contact.share_contacts ===
                      true
                    }
                    onChange={e =>
                      changeContact(
                        "share_contacts",
                        e.target.checked
                      )
                    }
                  />
                  Kontaktdaten freigeben
                </label>

                <button
                  className="primary wide"
                  disabled={busy}
                >
                  {busy
                    ? "Speichern…"
                    : "Kontaktdaten speichern"}
                </button>
              </form>
            )}
          </div>
        )}

        <ProfileMenuRow
          icon="🔒"
          label="Passwort ändern"
          onClick={() =>
            toggleSection("password")
          }
          open={openSection === "password"}
        />

        {openSection === "password" && (
          <form
            onSubmit={savePassword}
            style={{
              padding: "18px 22px",
              borderTop:
                "1px solid #eee"
            }}
          >
            <label>
              Neues Passwort
              <input
                type="password"
                minLength="6"
                value={password}
                onChange={e =>
                  setPassword(
                    e.target.value
                  )
                }
                placeholder="Mindestens 6 Zeichen"
                required
              />
            </label>

            <button
              className="primary wide"
              disabled={passwordBusy}
            >
              {passwordBusy
                ? "Speichern…"
                : "Passwort ändern"}
            </button>
          </form>
        )}
      </article>

      {/* Meine Workshops */}
      <article
        className="profile-card"
        style={{
          padding: 0,
          overflow: "hidden",
          marginTop: 16
        }}
      >
        <div
          style={{
            padding:
              "15px 20px 11px",
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center"
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 25
            }}
          >
            📅 Meine Workshops
          </h3>

          {myWorkshops.length > 0 && (
            <span
              style={{
                background: "#f0e8ff",
                color: "#6f35d9",
                borderRadius: 22,
                padding:
                  "6px 12px",
                fontSize: 18,
                fontWeight: 800
              }}
            >
              {myWorkshops.length}
            </span>
          )}
        </div>

        {workshopLoading ? (
          <p
            className="muted"
            style={{
              padding:
                "0 20px 16px"
            }}
          >
            Workshops werden geladen…
          </p>
        ) : myWorkshops.length === 0 ? (
          <p
            className="muted"
            style={{
              padding:
                "0 20px 16px"
            }}
          >
            Noch für keinen Workshop
            angemeldet.
          </p>
        ) : (
          <div>
            {myWorkshops
              .slice(0, 4)
              .map(w => (
                <div
                  key={w.id}
                  style={{
                    display: "flex",
                    alignItems:
                      "center",
                    gap: 14,
                    padding:
                      "16px 22px",
                    borderTop:
                      "1px solid #eee"
                  }}
                >
                  <span
                    style={{
                      fontSize: 31,
                      flexShrink: 0
                    }}
                  >
                    📅
                  </span>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    <div
                      className="small"
                      style={{
                        fontSize: 14,
                        marginBottom: 2
                      }}
                    >
                      {formatWorkshopDate(
                        w.starts_at
                      )}{" "}
                      · Sonntag
                    </div>

                    <strong
                      style={{
                        display: "block",
                        fontSize: 21,
                        lineHeight: 1.2
                      }}
                    >
                      {w.title}
                    </strong>

                    {w.paired && (
                      <div
                        style={{
                          marginTop: 5,
                          display: "flex",
                          alignItems:
                            "center",
                          gap: 7,
                          color: "#24202b",
                          fontSize: 19,
                          lineHeight: 1.2,
                          fontWeight: 700
                        }}
                      >
                        <span
                          style={{
                            color: "#6f35d9",
                            fontSize: 21
                          }}
                        >
                          👤
                        </span>

                        <span>
                          {w.partnerName ||
                            "Tanzpartner/in"}
                        </span>
                      </div>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 400,
                      flexShrink: 0
                    }}
                  >
                    ›
                  </span>
                </div>
              ))}
          </div>
        )}
      </article>

      {/* Meine Tanzpartnersuche */}
      <article
        className="profile-card"
        style={{
          padding: 0,
          overflow: "hidden",
          marginTop: 16
        }}
      >
        <div
          style={{
            padding:
              "15px 20px 11px"
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 25
            }}
          >
            🤝 Meine Tanzpartnersuche
          </h3>
        </div>

        {workshopLoading ? (
          <p
            className="muted"
            style={{
              padding:
                "0 20px 16px"
            }}
          >
            Wird geladen…
          </p>
        ) : mySearches.length === 0 ? (
          <p
            className="muted"
            style={{
              padding:
                "0 22px 22px",
              fontSize: 18
            }}
          >
            Aktuell keine offene
            Tanzpartnersuche.
          </p>
        ) : (
          mySearches
            .slice(0, 3)
            .map(w => (
              <div
                key={w.id}
                style={{
                  borderTop:
                    "1px solid #eee",
                  padding:
                    "14px 22px"
                }}
              >
                <div className="small">
                  {formatWorkshopDate(
                    w.starts_at
                  )}{" "}
                  · Sonntag
                </div>

                <strong
                  style={{
                    display: "block",
                    fontSize: 20,
                    marginTop: 2
                  }}
                >
                  {w.title}
                </strong>

                <div className="muted">
                  ⭐{" "}
                  {w.level ||
                    "Niveau noch nicht angegeben"}
                </div>
              </div>
            ))
        )}
      </article>

      {/* Hilfe */}
      <article
        className="profile-card"
        style={{
          padding: 0,
          overflow: "hidden",
          marginTop: 16
        }}
      >
        <ProfileMenuRow
          icon="❓"
          label="Hilfe & FAQ"
          onClick={() =>
            alert(
              "Hier können wir später die häufigsten Fragen zur Tanzpartnerbörse hinterlegen."
            )
          }
        />

        <ProfileMenuRow
          icon="ⓘ"
          label="Über die Tanzpartnerbörse"
          onClick={() =>
            alert(
              "Peter & Bettina’s Tanzpartnerbörse – finde deinen Tanzpartner für die Sonntags-Workshops."
            )
          }
        />
      </article>
    </section>
  );
}

function ProfileMenuRow({ icon, label, onClick, open }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        border: 0,
        borderTop: "1px solid #eee",
        background: open ? "#faf8ff" : "white",
        padding: "17px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 17,
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer"
      }}
    >
      <span style={{ width: 26, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 400 }}>{open ? "⌃" : "›"}</span>
    </button>
  );
}


function Chat({
  userId,
  contact,
  onBack
}) {
  const [messages, setMessages] =
    useState([]);

  const [body, setBody] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const otherId =
    contact.requester_id === userId
      ? contact.recipient_id
      : contact.requester_id;

  const otherName =
    contact.requester_id === userId
      ? contact.recipient?.display_name
      : contact.requester?.display_name;

  async function loadMessages() {
    let q = supabase
      .from("messages")
      .select(
        "id,sender_id,recipient_id,workshop_id,body,created_at"
      )
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${userId})`
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );

    if (contact.workshop_id) {
      q = q.eq(
        "workshop_id",
        contact.workshop_id
      );
    }

    const {
      data,
      error
    } = await q;

    if (error) {
      alert(error.message);
    } else {
      setMessages(data || []);
    }
  }

  useEffect(() => {
    loadMessages();

    const channel =
      supabase
        .channel(
          `chat-${contact.id}`
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages"
          },
          payload => {
            const m = payload.new;

            if (
              (
                m.sender_id === userId &&
                m.recipient_id ===
                  otherId
              ) ||
              (
                m.sender_id === otherId &&
                m.recipient_id ===
                  userId
              )
            ) {
              if (
                !contact.workshop_id ||
                m.workshop_id ===
                  contact.workshop_id
              ) {
                setMessages(
                  prev =>
                    prev.some(
                      x =>
                        x.id === m.id
                    )
                      ? prev
                      : [
                          ...prev,
                          m
                        ]
                );
              }
            }
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    contact.id,
    contact.workshop_id,
    otherId,
    userId
  ]);

  async function send(e) {
    e.preventDefault();

    const text =
      body.trim();

    if (!text || busy) return;

    setBusy(true);

    const {
      data,
      error
    } = await supabase
      .from("messages")
      .insert({
        sender_id: userId,
        recipient_id:
          otherId,
        workshop_id:
          contact.workshop_id ||
          null,
        body: text
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
    } else {
      setMessages(
        prev => [...prev, data]
      );
      setBody("");
    }

    setBusy(false);
  }

  return (
    <section>
      <button
        className="ghost"
        onClick={onBack}
      >
        ← Zurück zu Kontakten
      </button>

      <h2>
        💬 Chat mit{" "}
        {otherName ||
          "Tanzpartner/in"}
      </h2>

      {contact.workshop_id && (
        <div className="notice success">
          👫 Tanzpaar für diesen Workshop
          gefunden
        </div>
      )}

      <div className="card chat-box">
        {messages.length ? (
          messages.map(m => (
            <div
              key={m.id}
              className={`chat-message ${
                m.sender_id ===
                userId
                  ? "mine"
                  : "theirs"
              }`}
            >
              <div>
                {m.body}
              </div>

              <small>
                {new Intl.DateTimeFormat(
                  "de-DE",
                  {
                    hour: "2-digit",
                    minute: "2-digit"
                  }
                ).format(
                  new Date(
                    m.created_at
                  )
                )}
              </small>
            </div>
          ))
        ) : (
          <div className="muted">
            Noch keine Nachricht.
            Schreib einfach
            „Hallo“ 👋
          </div>
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={send}
      >
        <input
          value={body}
          onChange={e =>
            setBody(
              e.target.value
            )
          }
          placeholder="Nachricht schreiben…"
          maxLength="1000"
        />

        <button
          className="primary"
          disabled={busy}
        >
          {busy
            ? "…"
            : "Senden"}
        </button>
      </form>
    </section>
  );
}

function ReportModal({
  userId,
  reportedUserId,
  reportedName,
  onClose
}) {
  const [reason, setReason] =
    useState("");

  const [details, setDetails] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  async function submit(e) {
    e.preventDefault();

    if (!reason) {
      return alert(
        "Bitte wähle einen Grund aus."
      );
    }

    setBusy(true);

    const { error } =
      await supabase
        .from("reports")
        .insert({
          reporter_id: userId,
          reported_user_id:
            reportedUserId,
          reason,
          details:
            details.trim() ||
            null,
          status: "pending"
        });

    if (error) {
      alert(error.message);
    } else {
      alert(
        "Meldung wurde an den Admin gesendet. Der Admin entscheidet über weitere Maßnahmen."
      );
      onClose();
    }

    setBusy(false);
  }

  return (
    <div
      className="card"
      style={{
        marginTop: "12px"
      }}
    >
      <h3>
        🚨 Nutzer melden
      </h3>

      <p className="muted">
        Du möchtest{" "}
        <b>
          {reportedName ||
            "diesen Nutzer"}
        </b>{" "}
        melden? Die Meldung geht
        ausschließlich an den Admin.
        Es wird nichts automatisch
        gelöscht.
      </p>

      <form
        className="form"
        onSubmit={submit}
      >
        <label>
          Grund

          <select
            value={reason}
            onChange={e =>
              setReason(
                e.target.value
              )
            }
            required
          >
            <option value="">
              Bitte auswählen
            </option>

            <option value="Unangemessenes Verhalten">
              Unangemessenes Verhalten
            </option>

            <option value="Belästigung">
              Belästigung
            </option>

            <option value="Falsche Angaben">
              Falsche Angaben
            </option>

            <option value="Spam oder Werbung">
              Spam oder Werbung
            </option>

            <option value="Sonstiges">
              Sonstiges
            </option>
          </select>
        </label>

        <label>
          Details{" "}
          <span className="small">
            (optional)
          </span>

          <textarea
            value={details}
            onChange={e =>
              setDetails(
                e.target.value
              )
            }
            placeholder="Was ist passiert?"
            maxLength={1000}
            rows={4}
          />
        </label>

        <div className="actions">
          <button
            type="submit"
            className="primary"
            disabled={busy}
          >
            {busy
              ? "Wird gesendet…"
              : "Meldung senden"}
          </button>

          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

function Contacts({ userId }) {
  const [items, setItems] =
    useState([]);

  const [chat, setChat] =
    useState(null);

  const [myShare, setMyShare] =
    useState(false);

  const [sharedDetails, setSharedDetails] =
    useState({});

  const [workshopDetails, setWorkshopDetails] =
    useState({});

  const [loading, setLoading] =
    useState(true);

  const [reportTarget, setReportTarget] =
    useState(null);

  async function load() {
    setLoading(true);

    const {
      data: requests,
      error
    } = await supabase
      .from("contact_requests")
      .select(
        `
        *,
        requester:requester_id(id,display_name),
        recipient:recipient_id(id,display_name)
      `
      )
      .or(
        `requester_id.eq.${userId},recipient_id.eq.${userId}`
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    // Falls bereits eine Tanzpartnerschaft für genau diese beiden Personen
    // und diesen Workshop existiert, muss die zugehörige Kontaktanfrage
    // ebenfalls als angenommen gelten. Das verhindert, dass ein bereits
    // gebildetes Tanzpaar weiterhin unter „Offene Anfragen“ erscheint.
    let normalizedRequests = [...(requests || [])];

    const workshopIdsForPairs = [
      ...new Set(
        normalizedRequests
          .map(item => item.workshop_id)
          .filter(Boolean)
      )
    ];

    if (workshopIdsForPairs.length > 0) {
      const { data: existingPairs, error: pairLoadError } =
        await supabase
          .from("workshop_pairs")
          .select("workshop_id,user1_id,user2_id")
          .in("workshop_id", workshopIdsForPairs);

      if (!pairLoadError && existingPairs) {
        for (const item of normalizedRequests) {
          if (!item.workshop_id || item.status !== "pending") continue;

          const alreadyPaired = existingPairs.some(pair => {
            const sameWorkshop =
              pair.workshop_id === item.workshop_id;
            const samePeople =
              (pair.user1_id === item.requester_id &&
                pair.user2_id === item.recipient_id) ||
              (pair.user1_id === item.recipient_id &&
                pair.user2_id === item.requester_id);

            return sameWorkshop && samePeople;
          });

          if (alreadyPaired) {
            // Alten Status in der Datenbank korrigieren, damit die Anfrage
            // auch nach einem Neuladen dauerhaft nicht mehr offen ist.
            const { error: normalizeError } = await supabase
              .from("contact_requests")
              .update({ status: "accepted" })
              .eq("id", item.id);

            if (!normalizeError) {
              item.status = "accepted";
            }
          }
        }
      }
    }

    // Doppelte Karten zusammenfassen: gleiche zwei Personen
    // + gleicher Workshop werden nur einmal angezeigt.
    const statusRank = {
      accepted: 3,
      pending: 2,
      declined: 1,
      cancelled: 0
    };

    const uniqueMap = new Map();

    for (const item of normalizedRequests) {
      const ids = [item.requester_id, item.recipient_id].sort();
      const key =
        `${item.workshop_id || "general"}:${ids[0]}:${ids[1]}`;

      const previous = uniqueMap.get(key);

      if (
        !previous ||
        (statusRank[item.status] || 0) >
          (statusRank[previous.status] || 0)
      ) {
        uniqueMap.set(key, item);
      }
    }

    const uniqueRequests = [...uniqueMap.values()];

    // Namen separat aus profiles laden.
    const otherIds = [
      ...new Set(
        uniqueRequests
          .map(item =>
            item.requester_id === userId
              ? item.recipient_id
              : item.requester_id
          )
          .filter(Boolean)
      )
    ];

    let profileMap = {};

    if (otherIds.length) {
      const { data: profiles, error: profileError } =
        await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", otherIds);

      if (!profileError) {
        profileMap = Object.fromEntries(
          (profiles || []).map(p => [
            p.id,
            p.display_name
          ])
        );
      }
    }

    for (const item of uniqueRequests) {
      const otherId =
        item.requester_id === userId
          ? item.recipient_id
          : item.requester_id;

      const nestedOther =
        item.recipient_id === userId
          ? item.requester
          : item.recipient;

      item.other_display_name =
        nestedOther?.display_name ||
        profileMap[otherId] ||
        "Tanzpartner/in";
    }

    setItems(uniqueRequests);

    // Zu jeder Workshop-Kontaktanfrage den Workshop laden.
    const workshopIds = [
      ...new Set(
        uniqueRequests
          .map(item => item.workshop_id)
          .filter(Boolean)
      )
    ];

    if (workshopIds.length > 0) {
      const { data: workshopData, error: workshopError } =
        await supabase
          .from("workshops")
          .select("id,title,starts_at")
          .in("id", workshopIds);

      if (workshopError) {
        console.error(
          "Workshop-Daten konnten nicht geladen werden:",
          workshopError.message
        );
      }

      const workshopMap = {};
      (workshopData || []).forEach(workshop => {
        workshopMap[workshop.id] = workshop;
      });
      setWorkshopDetails(workshopMap);
    } else {
      setWorkshopDetails({});
    }

    const { data: mine } =
      await supabase
        .from("contact_details")
        .select(
          "share_contacts"
        )
        .eq(
          "user_id",
          userId
        )
        .maybeSingle();

    const ownShare =
      mine?.share_contacts ===
      true;

    setMyShare(ownShare);

    const accepted =
      uniqueRequests.filter(
        item =>
          item.status ===
          "accepted"
      );

    const details = {};

    for (const item of accepted) {
      const otherId =
        item.requester_id ===
        userId
          ? item.recipient_id
          : item.requester_id;

      const {
        data: contactData,
        error: contactError
      } = await supabase
        .from("contact_details")
        .select(
          "email,phone,share_contacts"
        )
        .eq(
          "user_id",
          otherId
        )
        .maybeSingle();

      if (
        !contactError &&
        contactData
      ) {
        details[otherId] =
          contactData;
      }
    }

    setSharedDetails(
      details
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [userId]);

  async function accept(id) {
    const item =
      items.find(
        i => i.id === id
      );

    if (!item) return;

    if (item.workshop_id) {
      const [a, b] = [
        item.requester_id,
        item.recipient_id
      ].sort();

      // Prüfen, ob das Tanzpaar bereits existiert.
      // Das ist wichtig, wenn die Paarbildung schon an anderer Stelle
      // erfolgt ist, die Kontaktanfrage aber noch „pending“ gespeichert ist.
      const { data: existingPair, error: existingPairError } =
        await supabase
          .from("workshop_pairs")
          .select("workshop_id,user1_id,user2_id")
          .eq("workshop_id", item.workshop_id)
          .or(`and(user1_id.eq.${a},user2_id.eq.${b}),and(user1_id.eq.${b},user2_id.eq.${a})`)
          .maybeSingle();

      if (existingPairError) {
        return alert(existingPairError.message);
      }

      if (!existingPair) {
        const { error: pairError } =
          await supabase
            .from("workshop_pairs")
            .insert({
              workshop_id: item.workshop_id,
              user1_id: a,
              user2_id: b
            });

        if (pairError) {
          return alert(
            pairError.message.includes("duplicate") ||
              pairError.code === "23505"
              ? "Für diesen Workshop hat bereits jemand einen anderen Tanzpartner gefunden."
              : pairError.message
          );
        }
      }
    }

    // Erst wenn das Paar vorhanden ist, wird die Anfrage endgültig
    // als angenommen gespeichert.
    const { error } =
      await supabase
        .from("contact_requests")
        .update({
          status: "accepted"
        })
        .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    // Der Anfragende bekommt nach der Annahme eine E-Mail.
    try {
      let workshopName = "";
      let date = "";

      if (item.workshop_id) {
        const { data: workshop } = await supabase
          .from("workshops")
          .select("title,starts_at")
          .eq("id", item.workshop_id)
          .maybeSingle();

        workshopName = workshop?.title || "";
        date = workshop?.starts_at
          ? new Intl.DateTimeFormat("de-DE", {
              timeZone: "Europe/Berlin",
              day: "2-digit",
              month: "2-digit",
              year: "numeric"
            }).format(new Date(workshop.starts_at))
          : "";
      }

      const { data: accepterProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", item.requester_id)
        .maybeSingle();

      const emailResult = await sendPartnerEmail({
        recipientId: item.requester_id,
        recipientName: requesterProfile?.display_name || "Tanzfreund/in",
        partnerName: accepterProfile?.display_name || "Dein Tanzpartner",
        workshopName,
        date,
        messageType: "accepted"
      });

      if (!emailResult.ok) {
        console.warn(
          "Anfrage wurde angenommen, aber die Bestätigungs-E-Mail konnte nicht gesendet werden."
        );
      }
    } catch (emailError) {
      console.error("Fehler bei der Bestätigungs-E-Mail:", emailError);
    }

    await load();
  }

  async function setSharing(
    enabled
  ) {
    const { error } =
      await supabase
        .from("contact_details")
        .upsert(
          {
            user_id: userId,
            share_contacts: enabled
          },
          {
            onConflict: "user_id"
          }
        );

    if (error) {
      alert(error.message);
      return;
    }

    setMyShare(enabled);

    // Sobald beide Partner ihre Kontaktdaten freigegeben haben,
    // bekommt der jeweils andere eine kurze E-Mail-Benachrichtigung.
    if (enabled) {
      try {
        const { data: acceptedRequests } = await supabase
          .from("contact_requests")
          .select("requester_id,recipient_id,workshop_id")
          .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
          .eq("status", "accepted");

        for (const request of acceptedRequests || []) {
          const otherId =
            request.requester_id === userId
              ? request.recipient_id
              : request.requester_id;

          const { data: otherDetails } = await supabase
            .from("contact_details")
            .select("share_contacts")
            .eq("user_id", otherId)
            .maybeSingle();

          if (otherDetails?.share_contacts !== true) continue;

          const { data: myProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", userId)
            .maybeSingle();

          const { data: otherProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", otherId)
            .maybeSingle();

          const emailResult = await sendPartnerEmail({
            recipientId: otherId,
            recipientName: otherProfile?.display_name || "Tanzfreund/in",
            partnerName: myProfile?.display_name || "Dein Tanzpartner",
            messageType: "contact_shared"
          });

          if (!emailResult.ok) {
            console.warn(
              "Kontaktdaten wurden freigegeben, aber die E-Mail konnte nicht gesendet werden."
            );
          }
        }
      } catch (emailError) {
        console.error("Fehler bei der Kontaktdaten-E-Mail:", emailError);
      }
    }

    await load();
  }

  if (chat) {
    return (
      <Chat
        userId={userId}
        contact={chat}
        onBack={() => {
          setChat(null);
          load();
        }}
      />
    );
  }

  const openRequests = items.filter(
    item => item.status === "pending" && item.recipient_id === userId
  );

  const sentRequests = items.filter(
    item => item.status === "pending" && item.requester_id === userId
  );

  const activeContacts = items.filter(
    item => item.status === "accepted"
  );

  const finishedContacts = items.filter(
    item =>
      item.status === "declined" ||
      item.status === "cancelled"
  );

  const contactName = item => {
    const incoming = item.recipient_id === userId;
    const other = incoming ? item.requester : item.recipient;
    return (
      item.other_display_name ||
      other?.display_name ||
      "Tanzpartner/in"
    );
  };

  const contactId = item =>
    item.requester_id === userId
      ? item.recipient_id
      : item.requester_id;

  const renderContactCard = (item, mode) => {
    const incoming = item.recipient_id === userId;
    const other = incoming ? item.requester : item.recipient;
    const otherId = contactId(item);
    const details = sharedDetails[otherId];
    const bothShared =
      myShare === true &&
      details?.share_contacts === true;

    return (
      <div className="contact-card" key={item.id}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="contact-card-name">
            {item.other_display_name ||
              other?.display_name ||
              "Tanzpartner/in"}
          </div>

          <div className="muted">
            {item.workshop_id
              ? "Workshop-Kontakt"
              : "Kontaktanfrage"}
          </div>

          {item.workshop_id && workshopDetails[item.workshop_id] && (
            <div
              className="contact-workshop"
            >
              🎟️ {workshopDetails[item.workshop_id].title}
              {workshopDetails[item.workshop_id].starts_at && (
                <span className="muted" style={{ fontWeight: 500 }}>
                  {" · "}
                  {new Date(
                    workshopDetails[item.workshop_id].starts_at
                  ).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                  })}
                </span>
              )}
            </div>
          )}

          {mode === "open" && (
            <div className="contact-status waiting">
              🕐 Wartet auf deine Antwort
            </div>
          )}

          {mode === "sent" && (
            <div className="contact-status sent">
              🕐 Anfrage gesendet – wartet auf Antwort
            </div>
          )}

          {mode === "active" &&
            (bothShared ? (
              <div className="notice success">
                📞 {details.phone || "Keine Telefonnummer"}
                {" · "}
                ✉️ {details.email || "Keine E-Mail-Adresse"}
              </div>
            ) : (
              <div className="muted">
                🔐 Kontaktdaten werden sichtbar, sobald ihr beide
                freigegeben habt.
              </div>
            ))}

          {mode === "finished" && (
            <div className="muted" style={{ marginTop: 4 }}>
              {item.status === "declined"
                ? "Abgelehnt"
                : "Beendet"}
            </div>
          )}
        </div>

        <div className="contact-actions">
          {mode === "open" && (
            <>
              <button
                className="primary"
                onClick={() => accept(item.id)}
              >
                ✓ Annehmen
              </button>

              <button
                className="ghost"
                onClick={async () => {
                  const { error } = await supabase
                    .from("contact_requests")
                    .update({ status: "declined" })
                    .eq("id", item.id);

                  if (error) {
                    alert(error.message);
                    return;
                  }

                  await load();
                }}
              >
                ✕ Ablehnen
              </button>
            </>
          )}

          {mode === "active" && (
            <>
              <button
                className="primary"
                onClick={() => setChat(item)}
              >
                💬 Chat öffnen
              </button>

              <button
                className="ghost"
                onClick={() =>
                  setReportTarget({
                    id: otherId,
                    name: other?.display_name
                  })
                }
              >
                🚨 Melden
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="contacts-modern">
      <style>{`
        .contacts-modern {
          max-width: 760px;
          margin: 0 auto;
        }

        .contacts-modern > h2 {
          margin-bottom: 18px;
        }

        .contacts-modern > .card {
          border-radius: 22px;
          border: 1px solid #ece9f2;
          box-shadow: 0 4px 16px rgba(45, 35, 70, .06);
          margin-bottom: 14px;
        }

        .contacts-modern .contact-group {
          padding: 18px;
        }

        .contacts-modern .contact-group > h3 {
          margin: 0 0 14px;
          font-size: 20px;
        }

        .contacts-modern .contact-card {
          background: #fff;
          border: 1px solid #ece9f2;
          border-radius: 18px;
          padding: 16px;
          margin-top: 10px;
          box-shadow: 0 2px 10px rgba(45, 35, 70, .04);
        }

        .contacts-modern .contact-card-name {
          font-size: 17px;
          font-weight: 800;
          color: #20202a;
        }

        .contacts-modern .contact-workshop {
          margin-top: 9px;
          padding: 9px 11px;
          border-radius: 12px;
          background: #f5f2fb;
          color: #51339b;
          font-weight: 700;
        }

        .contacts-modern .contact-status {
          margin-top: 8px;
          font-weight: 700;
        }

        .contacts-modern .contact-status.waiting {
          color: #d58a00;
        }

        .contacts-modern .contact-status.sent {
          color: #6f6b78;
          font-weight: 600;
        }

        .contacts-modern .contact-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 14px;
        }

        .contacts-modern .contact-actions button {
          min-height: 44px;
        }

        .contacts-modern .finished-group {
          padding: 0;
          overflow: hidden;
        }

        .contacts-modern .finished-group summary {
          padding: 18px;
          list-style: none;
        }

        .contacts-modern .finished-group summary::-webkit-details-marker {
          display: none;
        }

        .contacts-modern .finished-inner {
          padding: 0 18px 18px;
        }

        @media (max-width: 520px) {
          .contacts-modern .contact-card {
            padding: 15px;
          }

          .contacts-modern .contact-actions button {
            flex: 1 1 auto;
          }
        }
      `}</style>

      <h2>Kontakte 💬</h2>

      <div className="card">
        <b>🔐 Deine Kontaktdaten</b>

        <p className="muted">
          Deine Telefonnummer und E-Mail-Adresse werden erst sichtbar,
          wenn du und dein Tanzpartner sie beide freigegeben habt.
        </p>

        {!myShare && (
          <button
            className="primary"
            onClick={() => setSharing(true)}
          >
            Kontaktdaten freigeben
          </button>
        )}

        {myShare && (
          <div className="notice success">
            ✓ Du hast deine Kontaktdaten freigegeben.
          </div>
        )}
      </div>

      {reportTarget && (
        <ReportModal
          userId={userId}
          reportedUserId={reportTarget.id}
          reportedName={reportTarget.name}
          onClose={() => setReportTarget(null)}
        />
      )}

      {loading ? (
        <div className="card">Kontakte werden geladen…</div>
      ) : (
        <>
          {openRequests.length > 0 && (
            <div className="card contact-group">
              <h3>
                🕐 Offene Anfragen ({openRequests.length})
              </h3>
              {openRequests.map(item =>
                renderContactCard(item, "open")
              )}
            </div>
          )}

          {sentRequests.length > 0 && (
            <div className="card contact-group">
              <h3>
                📤 Gesendete Anfragen ({sentRequests.length})
              </h3>
              {sentRequests.map(item =>
                renderContactCard(item, "sent")
              )}
            </div>
          )}

          {activeContacts.length > 0 && (
            <div className="card contact-group">
              <h3>
                🟢 Deine Kontakte ({activeContacts.length})
              </h3>
              {activeContacts.map(item =>
                renderContactCard(item, "active")
              )}
            </div>
          )}

          {finishedContacts.length > 0 && (
            <details className="card finished-group">
              <summary>
                ⚪ Abgelehnte / beendete Kontakte (
                {finishedContacts.length})
              </summary>

              <div className="finished-inner">
                {finishedContacts.map(item =>
                  renderContactCard(item, "finished")
                )}
              </div>
            </details>
          )}

          {items.length === 0 && (
            <div className="card">
              Noch keine Kontaktanfragen.
            </div>
          )}
        </>
      )}
    </section>
  );
}
function AdminPanel() {
  const [view, setView] =
    useState("menu");

  const [users, setUsers] =
    useState([]);

  const [workshops, setWorkshops] =
    useState([]);

  const [participants, setParticipants] =
    useState({});

  const [workshopPairs, setWorkshopPairs] =
    useState({});

  const [contactRequests, setContactRequests] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [contactLoading, setContactLoading] =
    useState(false);
  const [backgroundBusy, setBackgroundBusy] =
    useState(false);

  useEffect(() => {
    if (view === "workshops") {
      loadWorkshops();
    }

    if (view === "contacts") {
      loadContactRequests();
    }
  }, [view]);

  async function replaceLoginBackground(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Bitte wähle eine Bilddatei (JPG oder PNG) aus.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert("Das Bild darf maximal 8 MB groß sein.");
      return;
    }

    setBackgroundBusy(true);

    try {
      const { error } = await supabase.storage
        .from("app-images")
        .upload("login-bg.png", file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600"
        });

      if (error) {
        throw new Error(error.message);
      }

      alert(
        "Das Login-Hintergrundbild wurde erfolgreich ersetzt.\n\nBitte die Seite einmal neu laden, damit das neue Bild angezeigt wird."
      );
    } catch (err) {
      console.error("Fehler beim Ersetzen des Login-Hintergrunds:", err);
      alert(
        "Das Hintergrundbild konnte nicht ersetzt werden:\n\n" +
          (err.message || "Unbekannter Fehler") +
          "\n\nFalls ein Storage-/RLS-Fehler erscheint, muss die Admin-Upload-Berechtigung für den Bucket app-images einmal in Supabase eingerichtet werden."
      );
    } finally {
      setBackgroundBusy(false);
    }
  }

  async function loadContactRequests() {
    setContactLoading(true);

    const { data, error } = await supabase
      .from("contact_requests")
      .select(`
        id,
        requester_id,
        recipient_id,
        workshop_id,
        status,
        created_at,
        updated_at,
        requester:requester_id(id,display_name),
        recipient:recipient_id(id,display_name),
        workshop:workshop_id(id,title,starts_at)
      `)
      .order("created_at", { ascending: false });

    setContactLoading(false);

    if (error) {
      alert(
        "Fehler beim Laden der Kontaktanfragen: " +
          error.message
      );
      return;
    }

    setContactRequests(data || []);
  }

  async function updateContactRequest(id, status) {
    const { error } = await supabase
      .from("contact_requests")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      alert(
        "Fehler beim Ändern der Kontaktanfrage: " +
          error.message
      );
      return;
    }

    await loadContactRequests();
  }

  async function loadUsers() {
    setLoading(true);

    const {
      data,
      error
    } = await supabase
      .from("profiles")
      .select(
        "id,display_name,age,gender,is_visible,is_blocked"
      )
      .order(
        "display_name"
      );

    setLoading(false);

    if (error) {
      alert(
        "Fehler beim Laden der Nutzer: " +
          error.message
      );
      return;
    }

    setUsers(data || []);
  }

  async function toggleBlocked(
    user
  ) {
    const newValue =
      !user.is_blocked;

    const { error } =
      await supabase
        .from("profiles")
        .update({
          is_blocked:
            newValue
        })
        .eq(
          "id",
          user.id
        );

    if (error) {
      alert(
        "Fehler: " +
          error.message
      );
      return;
    }

    setUsers(prev =>
      prev.map(u =>
        u.id === user.id
          ? {
              ...u,
              is_blocked:
                newValue
            }
          : u
      )
    );
  }

  async function loadWorkshops() {
    setLoading(true);

    const {
      data,
      error
    } = await supabase
      .from("workshops")
      .select(
        "id,title,starts_at,location,booking_url"
      )
      .order(
        "starts_at"
      );

    setLoading(false);

    if (error) {
      alert(
        "Fehler beim Laden der Workshops: " +
          error.message
      );
      return;
    }

    setWorkshops(
      data || []
    );
  }

  async function addWorkshop() {
    const title =
      prompt(
        "Name des Workshops:"
      );

    if (!title) return;

    const date =
      prompt(
        "Datum (TT.MM.JJJJ):"
      );

    if (!date) return;

    const time =
      prompt(
        "Startzeit (z.B. 16:15):"
      );

    if (!time) return;

    const location =
      prompt("Ort:");

    if (!location) return;

    const bookingUrl =
      prompt(
        "Eventfrog-Link (optional):"
      ) || "";

    const parts =
      date.split(".");

    if (parts.length !== 3) {
      alert(
        "Bitte das Datum im Format TT.MM.JJJJ eingeben."
      );
      return;
    }

    const [
      day,
      month,
      year
    ] = parts;

    const startsAt =
      new Date(
        `${year}-${month.padStart(
          2,
          "0"
        )}-${day.padStart(
          2,
          "0"
        )}T${time}:00`
      ).toISOString();

    const {
      data,
      error
    } = await supabase
      .from("workshops")
      .insert({
        title,
        starts_at:
          startsAt,
        location,
        booking_url:
          bookingUrl
      })
      .select()
      .single();

    if (error) {
      alert(
        "Fehler beim Anlegen des Workshops: " +
          error.message
      );
      return;
    }

    alert(
      "Workshop wurde erfolgreich angelegt."
    );

    if (data) {
      setWorkshops(prev =>
        [...prev, data].sort(
          (a, b) =>
            new Date(
              a.starts_at
            ) -
            new Date(
              b.starts_at
            )
        )
      );
    } else {
      await loadWorkshops();
    }
  }

  async function editWorkshop(
    workshop
  ) {
    const title =
      prompt(
        "Name des Workshops:",
        workshop.title
      );

    if (!title) return;

    const dateObj =
      new Date(
        workshop.starts_at
      );

    const date =
      prompt(
        "Datum (TT.MM.JJJJ):",
        `${String(
          dateObj.getDate()
        ).padStart(
          2,
          "0"
        )}.${String(
          dateObj.getMonth() + 1
        ).padStart(
          2,
          "0"
        )}.${dateObj.getFullYear()}`
      );

    if (!date) return;

    const time =
      prompt(
        "Startzeit (z.B. 16:15):",
        `${String(
          dateObj.getHours()
        ).padStart(
          2,
          "0"
        )}:${String(
          dateObj.getMinutes()
        ).padStart(
          2,
          "0"
        )}`
      );

    if (!time) return;

    const location =
      prompt(
        "Ort:",
        workshop.location || ""
      );

    if (!location) return;

    const bookingUrl =
      prompt(
        "Eventfrog-Link (optional):",
        workshop.booking_url ||
          ""
      ) || "";

    const parts =
      date.split(".");

    if (parts.length !== 3) {
      alert(
        "Bitte das Datum im Format TT.MM.JJJJ eingeben."
      );
      return;
    }

    const [
      day,
      month,
      year
    ] = parts;

    const startsAt =
      `${year}-${month.padStart(
        2,
        "0"
      )}-${day.padStart(
        2,
        "0"
      )}T${time}:00`;

    const { error } =
      await supabase
        .from("workshops")
        .update({
          title,
          starts_at:
            startsAt,
          location,
          booking_url:
            bookingUrl
        })
        .eq(
          "id",
          workshop.id
        );

    if (error) {
      alert(
        "Fehler beim Bearbeiten des Workshops: " +
          error.message
      );
      return;
    }

    alert(
      "Workshop wurde erfolgreich geändert."
    );

    await loadWorkshops();
  }

  async function deleteWorkshop(
    workshop
  ) {
    const confirmed =
      confirm(
        `Workshop "${workshop.title}" wirklich löschen?`
      );

    if (!confirmed) return;

    const { error } =
      await supabase
        .from("workshops")
        .delete()
        .eq(
          "id",
          workshop.id
        );

    if (error) {
      alert(
        "Fehler beim Löschen des Workshops: " +
          error.message
      );
      return;
    }

    alert(
      "Workshop wurde gelöscht."
    );

    await loadWorkshops();
  }

  async function loadParticipants(
    workshopId
  ) {
    const [
      { data, error },
      { data: pairs, error: pairError }
    ] = await Promise.all([
      supabase
        .from("workshop_interests")
        .select("user_id,level")
        .eq("workshop_id", workshopId),

      supabase
        .from("workshop_pairs")
        .select("user1_id,user2_id")
        .eq("workshop_id", workshopId)
    ]);

    if (error) {
      alert(
        "Fehler beim Laden der Teilnehmer: " +
          error.message
      );
      return;
    }

    if (pairError) {
      alert(
        "Fehler beim Laden der Tanzpartnerschaften: " +
          pairError.message
      );
      return;
    }

    const ids = [
      ...new Set([
        ...(data || []).map(x => x.user_id),
        ...(pairs || []).flatMap(pair => [
          pair.user1_id,
          pair.user2_id
        ])
      ])
    ].filter(Boolean);

    let profiles = [];

    if (ids.length > 0) {
      const {
        data: profileData,
        error: profileError
      } = await supabase
        .from("profiles")
        .select("id,display_name,age,gender")
        .in("id", ids);

      if (profileError) {
        alert(
          "Fehler beim Laden der Profile: " +
            profileError.message
        );
        return;
      }

      profiles = profileData || [];
    }

    const profileMap = Object.fromEntries(
      profiles.map(p => [
        p.id,
        p
      ])
    );

    const result =
      (data || []).map(item => ({
        ...item,
        profile:
          profileMap[item.user_id] || null
      }));

    const pairResult =
      (pairs || []).map(pair => ({
        ...pair,
        user1:
          profileMap[pair.user1_id] || null,
        user2:
          profileMap[pair.user2_id] || null
      }));

    setParticipants(prev => ({
      ...prev,
      [workshopId]: result
    }));

    setWorkshopPairs(prev => ({
      ...prev,
      [workshopId]: pairResult
    }));
  }

  function formatDate(iso) {
    return new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone:
          "Europe/Berlin",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(
      new Date(iso)
    );
  }

  function formatTime(iso) {
    return new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone:
          "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).format(
      new Date(iso)
    );
  }

  return (
    <section>
      <div className="hero">
        <h2>
          🔐 Administrator
        </h2>

        <p>
          Verwaltung der
          Tanzpartnerbörse
        </p>
      </div>

      {view === "menu" && (
        <div className="grid">
          <button
            className="profile-card"
            onClick={() => {
              setView(
                "users"
              );
              loadUsers();
            }}
          >
            <h3>
              👥 Nutzerverwaltung
            </h3>

            <p className="muted">
              Nutzer anzeigen,
              sperren und
              entsperren.
            </p>
          </button>

          <button
            className="profile-card"
            onClick={() => {
              setView(
                "workshops"
              );
              loadWorkshops();
            }}
          >
            <h3>
              🎟️ Workshops
            </h3>

            <p className="muted">
              Workshops und
              Teilnehmer
              verwalten.
            </p>
          </button>

          <button
            className="profile-card"
            onClick={() =>
              setView(
                "contacts"
              )
            }
          >
            <h3>
              💬 Kontaktanfragen
            </h3>

            <p className="muted">
              Kontaktanfragen
              verwalten.
            </p>
          </button>

          <div className="profile-card">
            <h3>🎨 Login-Hintergrund</h3>

            <p className="muted">
              Das Bild auf der Anmeldeseite kann hier direkt
              ausgetauscht werden.
            </p>

            <div
              style={{
                overflow: "hidden",
                borderRadius: "12px",
                marginBottom: "12px",
                background: "#eee"
              }}
            >
              <img
                src={LOGIN_BACKGROUND_URL}
                alt="Aktueller Login-Hintergrund"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "220px",
                  objectFit: "cover"
                }}
              />
            </div>

            <label
              className="primary wide"
              style={{
                display: "block",
                textAlign: "center",
                cursor: backgroundBusy ? "wait" : "pointer",
                boxSizing: "border-box"
              }}
            >
              {backgroundBusy
                ? "Bild wird hochgeladen …"
                : "🖼️ Neues Hintergrundbild auswählen"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={backgroundBusy}
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  replaceLoginBackground(file);
                }}
              />
            </label>

            <p className="small">
              JPG oder PNG · maximal 8 MB
            </p>
          </div>
        </div>
      )}

      {view === "users" && (
        <div>
          <button
            onClick={() =>
              setView("menu")
            }
          >
            ← Zurück
          </button>

          <h2>
            👥 Nutzerverwaltung
          </h2>

          {loading && (
            <p>
              Lade Nutzer …
            </p>
          )}

          {!loading &&
            users.length ===
              0 && (
              <p className="muted">
                Keine Nutzer
                gefunden.
              </p>
            )}

          {users.map(user => (
            <article
              className="profile-card"
              key={user.id}
            >
              <h3>
                {user.display_name ||
                  "Ohne Namen"}
              </h3>

              <p>
                {user.age
                  ? `${user.age} Jahre`
                  : "Alter nicht angegeben"}
                {" · "}
                {user.gender ||
                  "Geschlecht nicht angegeben"}
              </p>

              <p>
                Status:{" "}
                {user.is_blocked
                  ? "🔒 Gesperrt"
                  : "🟢 Aktiv"}
              </p>

              <button
                onClick={() =>
                  toggleBlocked(
                    user
                  )
                }
              >
                {user.is_blocked
                  ? "🔓 Entsperren"
                  : "🔒 Nutzer sperren"}
              </button>
            </article>
          ))}
        </div>
      )}

      {view === "workshops" && (
        <div>
          <button
            onClick={() =>
              setView("menu")
            }
          >
            ← Zurück
          </button>

          <h2>
            🎟️ Workshop-Verwaltung
          </h2>

          <button
            onClick={addWorkshop}
          >
            ➕ Neuen Workshop
            hinzufügen
          </button>

          {loading && (
            <p>
              Lade Workshops …
            </p>
          )}

          {workshops.map(
            workshop => (
              <article
                className="profile-card"
                key={workshop.id}
              >
                <h3>
                  🎟️{" "}
                  {formatDate(
                    workshop.starts_at
                  )}
                </h3>

                <h2>
                  {workshop.title}
                </h2>

                <p>
                  🕐{" "}
                  {formatTime(
                    workshop.starts_at
                  )}{" "}
                  Uhr
                </p>

                {workshop.location && (
                  <p>
                    📍{" "}
                    {
                      workshop.location
                    }
                  </p>
                )}

                <button
                  onClick={() =>
                    loadParticipants(
                      workshop.id
                    )
                  }
                >
                  👥 Teilnehmer anzeigen
                </button>

                <div
                  style={{
                    display:
                      "flex",
                    gap: "10px",
                    marginTop:
                      "10px"
                  }}
                >
                  <button
                    onClick={() =>
                      editWorkshop(
                        workshop
                      )
                    }
                  >
                    ✏️ Bearbeiten
                  </button>

                  <button
                    onClick={() =>
                      deleteWorkshop(
                        workshop
                      )
                    }
                  >
                    🗑️ Löschen
                  </button>
                </div>

                {participants[
                  workshop.id
                ] && (
                  <div
                    style={{
                      marginTop:
                        "15px"
                    }}
                  >
                    <h3>
                      Teilnehmer (
                      {
                        participants[
                          workshop.id
                        ].length
                      }
                      )
                    </h3>

                    {participants[
                      workshop.id
                    ].length ===
                      0 && (
                      <p className="muted">
                        Noch keine
                        Teilnehmer.
                      </p>
                    )}

                    {participants[
                      workshop.id
                    ].map(
                      participant => (
                        <div
                          key={
                            participant.user_id
                          }
                          style={{
                            padding:
                              "10px 0",
                            borderBottom:
                              "1px solid #eee"
                          }}
                        >
                          <strong>
                            {participant
                              .profile
                              ?.display_name ||
                              "Unbekannter Nutzer"}
                          </strong>

                          <div>
                            {participant
                              .level ||
                              "Niveau nicht angegeben"}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {workshopPairs[
                  workshop.id
                ] && (
                  <div
                    style={{
                      marginTop: "15px",
                      paddingTop: "10px",
                      borderTop: "2px solid #eee"
                    }}
                  >
                    <h3>
                      🤝 Tanzpartnerschaften (
                      {
                        workshopPairs[
                          workshop.id
                        ].length
                      }
                      )
                    </h3>

                    {workshopPairs[
                      workshop.id
                    ].length === 0 ? (
                      <p className="muted">
                        Noch keine Tanzpartnerschaft.
                      </p>
                    ) : (
                      workshopPairs[
                        workshop.id
                      ].map((pair, index) => (
                        <div
                          key={`${workshop.id}-pair-${index}`}
                          style={{
                            padding: "10px 0",
                            borderBottom: "1px solid #eee"
                          }}
                        >
                          <strong>
                            👤{" "}
                            {pair.user1?.display_name ||
                              "Unbekannter Nutzer"}
                            {" ↔ "}
                            {pair.user2?.display_name ||
                              "Unbekannter Nutzer"}
                          </strong>

                          <div className="muted">
                            {pair.user1?.age
                              ? `${pair.user1.age} Jahre`
                              : ""}
                            {pair.user1?.gender
                              ? ` · ${pair.user1.gender}`
                              : ""}
                            {"  "}
                            ↔
                            {"  "}
                            {pair.user2?.age
                              ? `${pair.user2.age} Jahre`
                              : ""}
                            {pair.user2?.gender
                              ? ` · ${pair.user2.gender}`
                              : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </article>
            )
          )}
        </div>
      )}

      {view === "contacts" && (
        <div>
          <button
            onClick={() =>
              setView("menu")
            }
          >
            ← Zurück
          </button>

          <h2>
            💬 Kontaktanfragen
          </h2>

          <article className="profile-card">
            <h3>📋 Kontaktverwaltung</h3>

            <p className="muted">
              Hier siehst du alle Kontaktanfragen zwischen den
              Nutzern. Es wird nichts automatisch gelöscht.
            </p>

            {contactLoading && (
              <p>
                Kontaktanfragen werden geladen …
              </p>
            )}

            {!contactLoading &&
              contactRequests.length === 0 && (
                <p className="muted">
                  Noch keine Kontaktanfragen vorhanden.
                </p>
              )}
          </article>

          {!contactLoading &&
            contactRequests.map(request => {
              const requester = request.requester;
              const recipient = request.recipient;
              const workshop = request.workshop;

              const date = new Intl.DateTimeFormat(
                "de-DE",
                {
                  timeZone: "Europe/Berlin",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                }
              ).format(new Date(request.created_at));

              const time = new Intl.DateTimeFormat(
                "de-DE",
                {
                  timeZone: "Europe/Berlin",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                }
              ).format(new Date(request.created_at));

              return (
                <article
                  className="profile-card"
                  key={request.id}
                >
                  <h3>
                    {request.status === "pending"
                      ? "🟠 Offen"
                      : request.status === "accepted"
                        ? "🟢 Angenommen"
                        : request.status === "declined"
                          ? "🔴 Abgelehnt"
                          : "⚪ Storniert"}
                  </h3>

                  <p>
                    <strong>Von:</strong>{" "}
                    {requester?.display_name ||
                      "Unbekannter Nutzer"}
                  </p>

                  <p>
                    <strong>An:</strong>{" "}
                    {recipient?.display_name ||
                      "Unbekannter Nutzer"}
                  </p>

                  {workshop && (
                    <p>
                      🎟️ <strong>Workshop:</strong>{" "}
                      {workshop.title}
                      {workshop.starts_at
                        ? ` · ${formatDate(
                            workshop.starts_at
                          )} ${formatTime(
                            workshop.starts_at
                          )} Uhr`
                        : ""}
                    </p>
                  )}

                  <p className="muted">
                    Anfrage am {date} um {time} Uhr
                  </p>

                  {request.status === "pending" && (
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "10px",
                        flexWrap: "wrap"
                      }}
                    >
                      <button
                        className="primary"
                        onClick={() =>
                          updateContactRequest(
                            request.id,
                            "accepted"
                          )
                        }
                      >
                        ✓ Annehmen
                      </button>

                      <button
                        className="ghost"
                        onClick={() =>
                          updateContactRequest(
                            request.id,
                            "declined"
                          )
                        }
                      >
                        ✕ Ablehnen
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
        </div>
      )}
    </section>
  );
}

function ResetPassword({
  onDone
}) {
  const [password, setPassword] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function submit(e) {
    e.preventDefault();

    if (password.length < 6) {
      setMessage(
        "Das Passwort muss mindestens 6 Zeichen haben."
      );
      return;
    }

    setBusy(true);
    setMessage("");

    const { error } =
      await supabase.auth.updateUser({
        password
      });

    if (error) {
      setMessage(
        error.message
      );
    } else {
      setMessage(
        "Passwort wurde geändert."
      );

      setTimeout(() => {
        onDone();
      }, 1000);
    }

    setBusy(false);
  }

  return (
    <div
      className="auth-shell"
      style={{
        backgroundImage: `linear-gradient(#00000055,#00000055), url("${LOGIN_BACKGROUND_URL}")`
      }}
    >
      <div className="auth-card">
        <h2>
          Neues Passwort
        </h2>

        <form
          onSubmit={submit}
        >
          <label>
            Neues Passwort

            <input
              type="password"
              value={password}
              onChange={e =>
                setPassword(
                  e.target.value
                )
              }
              minLength="6"
              required
            />
          </label>

          <button
            className="primary wide"
            disabled={busy}
          >
            {busy
              ? "Speichern..."
              : "Passwort ändern"}
          </button>
        </form>

        {message && (
          <div className="notice">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <App />
);
