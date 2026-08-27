import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="center">
        <div className="card">Lade Tanzpartnerbörse…</div>
      </div>
    );
  }

  return session ? <Dashboard session={session} /> : <Auth />;
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
          throw new Error("Bitte einen Anzeigenamen eingeben.");
        }

        const { error } = await supabase.auth.signUp({
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
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
      }
    } catch (err) {
      setMessage(err.message || "Es ist ein Fehler aufgetreten.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="logo">💃🕺</div>

        <h1>Tanzpartnerbörse</h1>

        <p className="muted">
          Finde Menschen, die deine Leidenschaft fürs Tanzen teilen.
        </p>

        <div className="tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>

          <button
            className={mode === "register" ? "active" : ""}
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
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z. B. Alex"
              />
            </label>
          )}

          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
              required
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mindestens 6 Zeichen"
              required
              minLength="6"
            />
          </label>

          <button className="primary wide" disabled={busy}>
            {busy
              ? "Bitte warten…"
              : mode === "login"
              ? "Anmelden"
              : "Konto erstellen"}
          </button>
        </form>

        {message && <div className="notice">{message}</div>}
      </div>
    </div>
  );
}

function Dashboard({ session }) {
  const [tab, setTab] = useState("workshops");
  const [profile, setProfile] = useState(null);

  async function logout() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [session.user.id]);

  return (
    <div className="app">
      <header>
        <div>
          <div className="brand">💃🕺 Tanzpartnerbörse</div>
          <div className="small">
            Hallo {profile?.display_name || "Tanzfreund"}!
          </div>
        </div>

        <button className="ghost" onClick={logout}>
          Abmelden
        </button>
      </header>

      <main>
        {tab === "workshops" && (
          <Workshops currentUser={session.user.id} />
        )}

        {tab === "profil" && (
          <ProfileEditor
            user={session.user}
            profile={profile}
            setProfile={setProfile}
          />
        )}

        {tab === "favoriten" && (
          <Favorites userId={session.user.id} />
        )}

        {tab === "kontakte" && (
          <Contacts userId={session.user.id} />
        )}
      </main>

      <nav>
        <button
          className={tab === "workshops" ? "selected" : ""}
          onClick={() => setTab("workshops")}
        >
          🎟️
          <span>Workshops</span>
        </button>

        <button
          className={tab === "favoriten" ? "selected" : ""}
          onClick={() => setTab("favoriten")}
        >
          ❤️
          <span>Favoriten</span>
        </button>

        <button
          className={tab === "kontakte" ? "selected" : ""}
          onClick={() => setTab("kontakte")}
        >
          💬
          <span>Kontakte</span>
        </button>

        <button
          className={tab === "profil" ? "selected" : ""}
          onClick={() => setTab("profil")}
        >
          👤
          <span>Profil</span>
        </button>
      </nav>
    </div>
  );
}

function Workshops({ currentUser }) {
  const [workshops, setWorkshops] = useState([]);
  const [myInterests, setMyInterests] = useState(new Set());
  const [myPairs, setMyPairs] = useState(new Set());
  const [seekers, setSeekers] = useState({});
  const [busy, setBusy] = useState(true);
  const [selectedLevels, setSelectedLevels] = useState({});

  async function load() {
    setBusy(true);

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
        .select("workshop_id,user1_id,user2_id")
        .or(
          `user1_id.eq.${currentUser},user2_id.eq.${currentUser}`
        )
    ]);

    if (wsError) alert(wsError.message);

    setWorkshops(ws || []);

    setMyInterests(
      new Set((interests || []).map((x) => x.workshop_id))
    );

    setMyPairs(
      new Set((pairs || []).map((x) => x.workshop_id))
    );

    const map = {};

    for (const w of ws || []) {
      const [{ data: wi }, { data: wp }] = await Promise.all([
        supabase
          .from("workshop_interests")
          .select(
            "user_id,level,profiles(id,display_name,age,gender,height_cm,avatar_url,is_visible,is_blocked)"
          )
          .eq("workshop_id", w.id),

        supabase
          .from("workshop_pairs")
          .select("user1_id,user2_id")
          .eq("workshop_id", w.id)
      ]);

      const paired = new Set(
        (wp || []).flatMap((p) => [p.user1_id, p.user2_id])
      );

      map[w.id] = (wi || [])
        .filter(
          (x) =>
            x.user_id !== currentUser &&
            !paired.has(x.user_id) &&
            x.profiles?.is_visible !== false &&
            x.profiles?.is_blocked !== true
        )
        .map((x) => ({
          ...x.profiles,
          workshop_level: x.level
        }))
        .filter(Boolean);
    }

    setSeekers(map);
    setBusy(false);
  }

  useEffect(() => {
    load();
  }, [currentUser]);

  function formatGermanDateTime(iso) {
    const start = new Date(iso);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const date = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      weekday: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(start);

    const time = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    return {
      date,
      time: `${time.format(start)}–${time.format(end)} Uhr`
    };
  }

  async function toggleInterest(workshopId) {
    if (myPairs.has(workshopId)) return;

    const interested = myInterests.has(workshopId);

    if (interested) {
      const { error } = await supabase
        .from("workshop_interests")
        .delete()
        .eq("user_id", currentUser)
        .eq("workshop_id", workshopId);

      if (error) return alert(error.message);

      setMyInterests((prev) => {
        const next = new Set(prev);
        next.delete(workshopId);
        return next;
      });

      await load();
      return;
    }

    const level = selectedLevels[workshopId];

    if (!level) {
      return alert(
        "Bitte wähle zuerst dein Niveau für diesen Workshop."
      );
    }

    const { error } = await supabase
      .from("workshop_interests")
      .insert({
        user_id: currentUser,
        workshop_id: workshopId,
        level
      });

    if (error) return alert(error.message);

    setMyInterests((prev) =>
      new Set(prev).add(workshopId)
    );

    await load();
  }

  async function contactForWorkshop(workshopId, recipientId) {
    if (myPairs.has(workshopId)) return;

    const { error } = await supabase
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

    alert("Kontaktanfrage für diesen Workshop gesendet 💬");
  }

  return (
    <section>
      <div className="hero">
        <h2>Sonntags-Workshops</h2>
        <p>
          Finde einen Tanzpartner für genau den Workshop, an dem du
          teilnehmen möchtest.
        </p>
      </div>

      {busy ? (
        <div className="card">Workshops werden geladen…</div>
      ) : workshops.length === 0 ? (
        <div className="card">
          Noch keine Workshops eingetragen.
        </div>
      ) : (
        <div className="grid">
          {workshops.map((w) => {
            const dt = formatGermanDateTime(w.starts_at);
            const interested = myInterests.has(w.id);
            const paired = myPairs.has(w
