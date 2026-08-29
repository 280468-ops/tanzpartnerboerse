import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

/*
  Öffentliches Login-Hintergrundbild aus Supabase Storage.
  Dadurch ist kein Upload aus der App nötig und der bisherige
  RLS-Fehler beim Hochladen wird vermieden.
*/
const LOGIN_BACKGROUND_URL =
  "https://nzyenvwmnaokqsxsjcyf.supabase.co/storage/v1/object/public/app-images/login-bg.png";

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
        <div className="card error-card">
          <h2>⚠️ Fehler in der App</h2>

          <p>
            <strong>
              {this.state.error?.message || "Unbekannter Fehler"}
            </strong>
          </p>

          <details>
            <summary>Technische Details anzeigen</summary>

            <pre>
              {this.state.error?.stack || "Kein Stack verfügbar"}

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

    const { data: listener } = supabase.auth.onAuthStateChange(
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
    return <ResetPassword onDone={() => setResetMode(false)} />;
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
    <div
      className="auth-shell"
      style={{
        backgroundImage: `linear-gradient(#00000055,#00000055), url("${LOGIN_BACKGROUND_URL}")`
      }}
    >
      <div className="auth-card">
        <div className="logo">💃🕺</div>

        <h1>Tanzpartnerbörse</h1>

        <p className="muted">
          Finde deinen Tanzpartner für die Workshops
        </p>

        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>

          <button
            type="button"
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
                onChange={e => setDisplayName(e.target.value)}
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
              onChange={e => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
              required
            />
          </label>

          <label>
            Passwort

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
  const [profileLoading, setProfileLoading] = useState(true);

  const isAdmin =
    session.user.id === "dee327bb-f3eb-4ada-bf05-bad48e4844df";

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
        console.error("Profil konnte nicht geladen werden:", error);
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
          <div className="brand">💃🕺 Tanzpartnerbörse</div>

          <div className="small">
            Hallo{" "}
            {profile?.display_name ||
              session.user.user_metadata?.display_name ||
              "Tanzfreund"}
            !
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
            profileLoading={profileLoading}
            setProfile={setProfile}
          />
        )}

        {tab === "kontakte" && (
          <Contacts userId={session.user.id} />
        )}

        {tab === "admin" && isAdmin && (
          <ErrorBoundary>
            <AdminPanel />
          </ErrorBoundary>
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

        {isAdmin && (
          <button
            className={tab === "admin" ? "selected" : ""}
            onClick={() => setTab("admin")}
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

    if (wsError) {
      alert(wsError.message);
    }

    setWorkshops(ws || []);

    setMyInterests(
      new Set((interests || []).map(x => x.workshop_id))
    );

    setMyPairs(
      new Set((pairs || []).map(x => x.workshop_id))
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
        (wp || []).flatMap(p => [p.user1_id, p.user2_id])
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
      weekday: "long",
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

    if (error) {
      return alert(error.message);
    }

    setMyInterests(prev => new Set(prev).add(workshopId));
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
        error.message.includes("duplicate") || error.code === "23505"
          ? "Für diesen Workshop besteht bereits eine Anfrage."
          : error.message
      );
    }

    alert("Kontaktanfrage für diesen Workshop gesendet 💬");
  }

  async function dissolvePair(workshopId) {
    const { data: pair, error } = await supabase
      .from("workshop_pairs")
      .select("user1_id,user2_id")
      .eq("workshop_id", workshopId)
      .or(
        `user1_id.eq.${currentUser},user2_id.eq.${currentUser}`
      )
      .maybeSingle();

    if (error) {
      return alert(error.message);
    }

    if (!pair) return;

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

    const { error: deleteError } = await supabase
      .from("workshop_pairs")
      .delete()
      .eq("workshop_id", workshopId)
      .or(
        `user1_id.eq.${currentUser},user2_id.eq.${currentUser}`
      );

    if (deleteError) {
      return alert(deleteError.message);
    }

    await supabase
      .from("contact_requests")
      .update({ status: "cancelled" })
      .eq("workshop_id", workshopId)
      .or(
        `and(requester_id.eq.${currentUser},recipient_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},recipient_id.eq.${currentUser})`
      )
      .eq("status", "accepted");

    await load();
  }

  return (
    <section>
      <div className="hero">
        <h2>Sonntags-Workshops</h2>

        <p>
          Finde einen Tanzpartner für genau den Workshop,
          an dem du teilnehmen möchtest.
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
          {workshops.map(w => {
            const dt = formatGermanDateTime(w.starts_at);
            const interested = myInterests.has(w.id);
            const paired = myPairs.has(w.id);
            const openSeekers = seekers[w.id] || [];

            return (
              <article className="profile-card" key={w.id}>
                <div className="workshop-date">
                  🎟️ {dt.date}
                </div>

                <h3>{w.title}</h3>

                <div className="muted">
                  💃 {w.dance_styles?.name || w.title}
                </div>

                <p>
                  🕓 <b>{dt.time}</b>
                </p>

                <div className="muted">
                  📍 {w.location || "Hazienda im Sonnenhof Aspach"}
                </div>

                {paired ? (
                  <div className="notice success">
                    <div>✅ Tanzpartner gefunden</div>

                    <button
                      className="ghost"
                      onClick={() => dissolvePair(w.id)}
                    >
                      Tanzpartnerschaft auflösen
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="actions">
                      {!interested && (
                        <select
                          value={selectedLevels[w.id] || ""}
                          onChange={e =>
                            setSelectedLevels(prev => ({
                              ...prev,
                              [w.id]: e.target.value
                            }))
                          }
                        >
                          <option value="">⭐ Niveau wählen</option>
                          <option value="Anfänger">Anfänger</option>
                          <option value="Mittelstufe">
                            Mittelstufe
                          </option>
                          <option value="Fortgeschritten">
                            Fortgeschritten
                          </option>
                        </select>
                      )}

                      <button
                        className={interested ? "primary" : "ghost"}
                        onClick={() => toggleInterest(w.id)}
                      >
                        {interested
                          ? "✓ Tanzpartner gesucht"
                          : "Tanzpartner suchen"}
                      </button>

                      {w.booking_url && (
                        <a
                          className="primary"
                          href={w.booking_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Eventfrog
                        </a>
                      )}
                    </div>

                    {openSeekers.length > 0 && (
                      <div className="seekers">
                        <h4>👥 Sucht noch einen Tanzpartner</h4>

                        {openSeekers.map(p => (
                          <div className="row seeker" key={p.id}>
                            <div>
                              <b>
                                {p.display_name}
                                {p.age ? `, ${p.age}` : ""}
                              </b>

                              <div className="muted">
                                {[
                                  p.gender,
                                  p.height_cm
                                    ? `${p.height_cm} cm`
                                    : null
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>

                              <div className="muted">
                                ⭐{" "}
                                {p.workshop_level ||
                                  "Niveau nicht angegeben"}
                              </div>
                            </div>

                            <button
                              className="primary"
                              onClick={() =>
                                contactForWorkshop(w.id, p.id)
                              }
                            >
                              Kontakt aufnehmen
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {interested && openSeekers.length === 0 && (
                      <div className="muted">
                        Noch keine weiteren offenen Suchenden
                        für diesen Workshop.
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
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
        display_name: displayName || "Tanzpartner",
        age: form.age ? Number(form.age) : null,
        gender: form.gender || null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        is_visible: form.is_visible !== false,
        is_blocked: profile?.is_blocked === true
      };

      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
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
        email: (contact.email || user.email || "").trim() || null,
        phone: (contact.phone || "").trim() || null,
        share_contacts: contact.share_contacts === true
      };

      const { error: contactError } = await supabase
        .from("contact_details")
        .upsert(contactPayload, { onConflict: "user_id" });

      if (contactError) {
        throw new Error(
          "Profil wurde gespeichert, aber die Kontaktdaten konnten nicht gespeichert werden:\n" +
            contactError.message
        );
      }

      setForm(data);
      setProfile(data);

      alert("Profil gespeichert ✅");
    } catch (err) {
      alert(err.message || "Unbekannter Fehler beim Speichern.");
    } finally {
      setBusy(false);
    }
  }

  if (profileLoading) {
    return (
      <section>
        <h2>Mein Profil</h2>

        <div className="card">Profil wird geladen…</div>
      </section>
    );
  }

  return (
    <section>
      <h2>Mein Profil</h2>

      <form className="card form" onSubmit={save}>
        <label>
          Anzeigename

          <input
            value={form.display_name || ""}
            onChange={e =>
              change("display_name", e.target.value)
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
            onChange={e => change("age", e.target.value)}
          />
        </label>

        <label>
          Geschlecht

          <select
            value={form.gender || ""}
            onChange={e => change("gender", e.target.value)}
          >
            <option value="">Bitte auswählen</option>
            <option value="Frau">Frau</option>
            <option value="Mann">Mann</option>
            <option value="Divers">Divers</option>
          </select>
        </label>

        <label>
          Größe in cm <span className="small">(optional)</span>

          <input
            type="number"
            min="120"
            max="230"
            step="1"
            value={form.height_cm || ""}
            onChange={e =>
              change("height_cm", e.target.value)
            }
            placeholder="z. B. 172"
          />
        </label>

        <hr />

        <h3>Kontaktdaten</h3>

        <p className="muted">
          Diese Daten sind niemals öffentlich. Sie werden erst
          sichtbar, wenn ihr euch gegenseitig freigebt.
        </p>

        {contactLoading ? (
          <div className="muted">
            Kontaktdaten werden geladen…
          </div>
        ) : (
          <>
            <label>
              E-Mail für den Kontakt{" "}
              <span className="small">(optional)</span>

              <input
                type="email"
                value={contact.email || ""}
                onChange={e =>
                  changeContact("email", e.target.value)
                }
                placeholder="name@beispiel.de"
              />
            </label>

            <label>
              Telefon <span className="small">(optional)</span>

              <input
                type="tel"
                value={contact.phone || ""}
                onChange={e =>
                  changeContact("phone", e.target.value)
                }
                placeholder="z. B. 0170 1234567"
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={contact.share_contacts === true}
                onChange={e =>
                  changeContact("share_contacts", e.target.checked)
                }
              />

              Ich bin bereit, meine Kontaktdaten mit meinem
              Tanzpartner zu teilen
            </label>
          </>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={form.is_visible !== false}
            onChange={e =>
              change("is_visible", e.target.checked)
            }
          />

          Profil für andere sichtbar
        </label>

        <button
          type="submit"
          className="primary wide"
          disabled={busy || contactLoading}
        >
          {busy ? "Speichern..." : "Profil speichern"}
        </button>
      </form>
    </section>
  );
}

function Chat({ userId, contact, onBack }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

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
      .order("created_at", { ascending: true });

    if (contact.workshop_id) {
      q = q.eq("workshop_id", contact.workshop_id);
    }

    const { data, error } = await q;

    if (error) {
      alert(error.message);
    } else {
      setMessages(data || []);
    }
  }

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`chat-${contact.id}`)
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
            (m.sender_id === userId &&
              m.recipient_id === otherId) ||
            (m.sender_id === otherId &&
              m.recipient_id === userId)
          ) {
            if (
              !contact.workshop_id ||
              m.workshop_id === contact.workshop_id
            ) {
              setMessages(prev =>
                prev.some(x => x.id === m.id)
                  ? prev
                  : [...prev, m]
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contact.id, contact.workshop_id, otherId, userId]);

  async function send(e) {
    e.preventDefault();

    const text = body.trim();

    if (!text || busy) return;

    setBusy(true);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: userId,
        recipient_id: otherId,
        workshop_id: contact.workshop_id || null,
        body: text
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
    } else {
      setMessages(prev => [...prev, data]);
      setBody("");
    }

    setBusy(false);
  }

  return (
    <section>
      <button className="ghost" onClick={onBack}>
        ← Zurück zu Kontakten
      </button>

      <h2>
        💬 Chat mit {otherName || "Tanzpartner/in"}
      </h2>

      {contact.workshop_id && (
        <div className="notice success">
          👫 Tanzpaar für diesen Workshop gefunden
        </div>
      )}

      <div className="card chat-box">
        {messages.length ? (
          messages.map(m => (
            <div
              key={m.id}
              className={`chat-message ${
                m.sender_id === userId ? "mine" : "theirs"
              }`}
            >
              <div>{m.body}</div>

              <small>
                {new Intl.DateTimeFormat("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit"
                }).format(new Date(m.created_at))}
              </small>
            </div>
          ))
        ) : (
          <div className="muted">
            Noch keine Nachricht. Schreib einfach „Hallo“ 👋
          </div>
        )}
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Nachricht schreiben…"
          maxLength="1000"
        />

        <button className="primary" disabled={busy}>
          {busy ? "…" : "Senden"}
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
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();

    if (!reason) {
      return alert("Bitte wähle einen Grund aus.");
    }

    setBusy(true);

    const { error } = await supabase
      .from("reports")
      .insert({
        reporter_id: userId,
        reported_user_id: reportedUserId,
        reason,
        details: details.trim() || null,
        status: "open"
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
    <div className="card report-modal">
      <h3>🚨 Nutzer melden</h3>

      <p className="muted">
        Du möchtest <b>{reportedName || "diesen Nutzer"}</b>{" "}
        melden? Die Meldung geht ausschließlich an den Admin.
        Es wird nichts automatisch gelöscht.
      </p>

      <form className="form" onSubmit={submit}>
        <label>
          Grund

          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
          >
            <option value="">Bitte auswählen</option>
            <option value="Unangemessenes Verhalten">
              Unangemessenes Verhalten
            </option>
            <option value="Belästigung">Belästigung</option>
            <option value="Falsche Angaben">Falsche Angaben</option>
            <option value="Spam oder Werbung">
              Spam oder Werbung
            </option>
            <option value="Sonstiges">Sonstiges</option>
          </select>
        </label>

        <label>
          Details <span className="small">(optional)</span>

          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
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
            {busy ? "Wird gesendet…" : "Meldung senden"}
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
  const [items, setItems] = useState([]);
  const [chat, setChat] = useState(null);
  const [myShare, setMyShare] = useState(false);
  const [sharedDetails, setSharedDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [reportTarget, setReportTarget] = useState(null);

  async function load() {
    setLoading(true);

    const { data: requests, error } = await supabase
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
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setItems(requests || []);

    const { data: mine } = await supabase
      .from("contact_details")
      .select("share_contacts")
      .eq("user_id", userId)
      .maybeSingle();

    const ownShare = mine?.share_contacts === true;
    setMyShare(ownShare);

    const accepted = (requests || []).filter(
      item => item.status === "accepted"
    );

    const details = {};

    for (const item of accepted) {
      const otherId =
        item.requester_id === userId
          ? item.recipient_id
          : item.requester_id;

      const { data: contactData, error: contactError } =
        await supabase
          .from("contact_details")
          .select("email,phone,share_contacts")
          .eq("user_id", otherId)
          .maybeSingle();

      if (!contactError && contactData) {
        details[otherId] = contactData;
      }
    }

    setSharedDetails(details);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [userId]);

  async function accept(id) {
    const item = items.find(i => i.id === id);

    if (!item) return;

    if (item.workshop_id) {
      const [a, b] = [
        item.requester_id,
        item.recipient_id
      ].sort();

      const { error: pairError } = await supabase
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
            ? "Für diesen Workshop hat bereits jemand einen Tanzpartner gefunden."
            : pairError.message
        );
      }
    }

    const { error } = await supabase
      .from("contact_requests")
      .update({ status: "accepted" })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  }

  async function setSharing(enabled) {
    const { error } = await supabase
      .from("contact_details")
      .upsert(
        {
          user_id: userId,
          share_contacts: enabled
        },
        { onConflict: "user_id" }
      );

    if (error) {
      alert(error.message);
      return;
    }

    setMyShare(enabled);
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

  return (
    <section>
      <h2>Kontakte 💬</h2>

      <div className="card">
        <b>🔐 Kontaktdaten</b>

        <p className="muted">
          Deine Telefonnummer und E-Mail-Adresse werden erst
          sichtbar, wenn du und dein Tanzpartner sie beide
          freigegeben habt.
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
      ) : items.length ? (
        items.map(item => {
          const incoming = item.recipient_id === userId;
          const other = incoming
            ? item.requester
            : item.recipient;

          const otherId = incoming
            ? item.requester_id
            : item.recipient_id;

          const details = sharedDetails[otherId];

          const bothShared =
            myShare === true &&
            details?.share_contacts === true;

          return (
            <div className="card row contact-card" key={item.id}>
              <div>
                <b>
                  {other?.display_name || "Tanzpartner/in"}
                </b>

                <div className="muted">
                  {item.workshop_id
                    ? "Workshop-Kontakt"
                    : "Kontaktanfrage"}
                  {" · "}
                  Status: {item.status}
                </div>

                {item.status === "accepted" &&
                  (bothShared ? (
                    <div className="notice success">
                      📞 {details.phone || "Keine Telefonnummer"}
                      {" · "}
                      ✉️ {details.email || "Keine E-Mail-Adresse"}
                    </div>
                  ) : (
                    <div className="muted">
                      🔐 Kontaktdaten werden sichtbar, sobald ihr
                      beide freigegeben habt.
                    </div>
                  ))}
              </div>

              <div className="actions">
                {incoming && item.status === "pending" && (
                  <button
                    className="primary"
                    onClick={() => accept(item.id)}
                  >
                    Annehmen
                  </button>
                )}

                {item.status === "accepted" && (
                  <>
                    <button
                      className="primary"
                      onClick={() => setChat(item)}
                    >
                      💬 Chat öffnen
                    </button>

                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setReportTarget({
                          id: otherId,
                          name: other?.display_name || "Tanzpartner/in"
                        });
                      }}
                    >
                      🚨 Melden
                    </button>
                  </>
                )}

                {incoming && item.status === "pending" && (
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
                    Ablehnen
                  </button>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="card">Noch keine Kontaktanfragen.</div>
      )}
    </section>
  );
}

function AdminPanel() {
  const [view, setView] = useState("menu");
  const [users, setUsers] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [participants, setParticipants] = useState({});
  const [contactRequests, setContactRequests] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  useEffect(() => {
    if (view === "workshops") {
      loadWorkshops();
    }

    if (view === "contacts") {
      loadContactRequests();
    }

    if (view === "reports") {
      loadReports();
    }
  }, [view]);

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
      .update({ status, updated_at: new Date().toISOString() })
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

  async function loadReports() {
    setContactLoading(true);

    const { data, error } = await supabase
      .from("reports")
      .select(`
        id,
        reporter_id,
        reported_user_id,
        reason,
        details,
        status,
        created_at,
        reporter:reporter_id(id,display_name),
        reported:reported_user_id(id,display_name)
      `)
      .order("created_at", { ascending: false });

    setContactLoading(false);

    if (error) {
      alert(
        "Fehler beim Laden der Meldungen: " +
          error.message
      );
      return;
    }

    setReports(data || []);
  }

  async function blockReportedUser(report) {
    const name = report.reported?.display_name || "diesen Nutzer";

    if (!confirm(`Nutzer „${name}“ wirklich sperren?`)) {
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: true })
      .eq("id", report.reported_user_id);

    if (error) {
      alert("Fehler beim Sperren: " + error.message);
      return;
    }

    const { data: blockedProfile, error: verifyError } = await supabase
      .from("profiles")
      .select("id,display_name,is_blocked")
      .eq("id", report.reported_user_id)
      .maybeSingle();

    if (verifyError) {
      alert("Sperre wurde gesetzt, aber die Prüfung ist fehlgeschlagen: " + verifyError.message);
      return;
    }

    if (blockedProfile?.is_blocked !== true) {
      alert("Die Sperre wurde nicht korrekt in der Datenbank gespeichert.");
      return;
    }

    alert(`Nutzer „${name}“ wurde gesperrt.`);
    await loadReports();
  }

  async function loadUsers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id,display_name,age,gender,is_visible,is_blocked"
      )
      .order("display_name");

    setLoading(false);

    if (error) {
      alert("Fehler beim Laden der Nutzer: " + error.message);
      return;
    }

    setUsers(data || []);
  }

  async function toggleBlocked(user) {
    const newValue = !user.is_blocked;

    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: newValue })
      .eq("id", user.id);

    if (error) {
      alert("Fehler: " + error.message);
      return;
    }

    await loadUsers();
  }

  async function loadWorkshops() {
    setLoading(true);

    const { data, error } = await supabase
      .from("workshops")
      .select(
        "id,title,starts_at,location,booking_url"
      )
      .order("starts_at");

    setLoading(false);

    if (error) {
      alert(
        "Fehler beim Laden der Workshops: " +
          error.message
      );
      return;
    }

    setWorkshops(data || []);
  }

  async function addWorkshop() {
    const title = prompt("Name des Workshops:");
    if (!title) return;

    const date = prompt("Datum (TT.MM.JJJJ):");
    if (!date) return;

    const time = prompt("Startzeit (z.B. 16:15):");
    if (!time) return;

    const location = prompt("Ort:");
    if (!location) return;

    const bookingUrl =
      prompt("Eventfrog-Link (optional):") || "";

    const parts = date.split(".");

    if (parts.length !== 3) {
      alert(
        "Bitte das Datum im Format TT.MM.JJJJ eingeben."
      );
      return;
    }

    const [day, month, year] = parts;

    const startsAt = new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(
        2,
        "0"
      )}T${time}:00`
    ).toISOString();

    const { data, error } = await supabase
      .from("workshops")
      .insert({
        title,
        starts_at: startsAt,
        location,
        booking_url: bookingUrl
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

    alert("Workshop wurde erfolgreich angelegt.");

    if (data) {
      setWorkshops(prev =>
        [...prev, data].sort(
          (a, b) =>
            new Date(a.starts_at) -
            new Date(b.starts_at)
        )
      );
    } else {
      await loadWorkshops();
    }
  }

  async function editWorkshop(workshop) {
    const title = prompt(
      "Name des Workshops:",
      workshop.title
    );

    if (!title) return;

    const dateObj = new Date(workshop.starts_at);

    const date = prompt(
      "Datum (TT.MM.JJJJ):",
      `${String(dateObj.getDate()).padStart(2, "0")}.${String(
        dateObj.getMonth() + 1
      ).padStart(2, "0")}.${dateObj.getFullYear()}`
    );

    if (!date) return;

    const time = prompt(
      "Startzeit (z.B. 16:15):",
      `${String(dateObj.getHours()).padStart(
        2,
        "0"
      )}:${String(dateObj.getMinutes()).padStart(
        2,
        "0"
      )}`
    );

    if (!time) return;

    const location = prompt(
      "Ort:",
      workshop.location || ""
    );

    if (!location) return;

    const bookingUrl =
      prompt(
        "Eventfrog-Link (optional):",
        workshop.booking_url || ""
      ) || "";

    const parts = date.split(".");

    if (parts.length !== 3) {
      alert(
        "Bitte das Datum im Format TT.MM.JJJJ eingeben."
      );
      return;
    }

    const [day, month, year] = parts;

    const startsAt =
      `${year}-${month.padStart(
        2,
        "0"
      )}-${day.padStart(
        2,
        "0"
      )}T${time}:00`;

    const { error } = await supabase
      .from("workshops")
      .update({
        title,
        starts_at: startsAt,
        location,
        booking_url: bookingUrl
      })
      .eq("id", workshop.id);

    if (error) {
      alert(
        "Fehler beim Bearbeiten des Workshops: " +
          error.message
      );
      return;
    }

    alert("Workshop wurde erfolgreich geändert.");
    await loadWorkshops();
  }

  async function deleteWorkshop(workshop) {
    const confirmed = confirm(
      `Workshop "${workshop.title}" wirklich löschen?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("workshops")
      .delete()
      .eq("id", workshop.id);

    if (error) {
      alert(
        "Fehler beim Löschen des Workshops: " +
          error.message
      );
      return;
    }

    alert("Workshop wurde gelöscht.");
    await loadWorkshops();
  }

  async function loadParticipants(workshopId) {
    const { data, error } = await supabase
      .from("workshop_interests")
      .select("user_id,level")
      .eq("workshop_id", workshopId);

    if (error) {
      alert(
        "Fehler beim Laden der Teilnehmer: " +
          error.message
      );
      return;
    }

    const ids = (data || []).map(x => x.user_id);

    if (!ids.length) {
      setParticipants(prev => ({
        ...prev,
        [workshopId]: []
      }));
      return;
    }

    const { data: profiles, error: profileError } =
      await supabase
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

    const result = (data || []).map(item => {
      const profile = (profiles || []).find(
        p => p.id === item.user_id
      );

      return {
        ...item,
        profile
      };
    });

    setParticipants(prev => ({
      ...prev,
      [workshopId]: result
    }));
  }

  function formatDate(iso) {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(iso));
  }

  function formatTime(iso) {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(iso));
  }

  return (
    <section>
      <div className="hero">
        <h2>🔐 Administrator</h2>

        <p>Verwaltung der Tanzpartnerbörse</p>
      </div>

      {view === "menu" && (
        <div className="grid">
          <button
            className="profile-card admin-menu-button"
            onClick={() => {
              setView("users");
              loadUsers();
            }}
          >
            <h3>👥 Nutzerverwaltung</h3>

            <p className="muted">
              Nutzer anzeigen, sperren und entsperren.
            </p>
          </button>

          <button
            className="profile-card admin-menu-button"
            onClick={() => {
              setView("workshops");
              loadWorkshops();
            }}
          >
            <h3>🎟️ Workshops</h3>

            <p className="muted">
              Workshops und Teilnehmer verwalten.
            </p>
          </button>

          <button
            className="profile-card admin-menu-button"
            onClick={() => setView("contacts")}
          >
            <h3>💬 Kontaktanfragen</h3>

            <p className="muted">
              Kontaktanfragen verwalten.
            </p>
          </button>

          <button
            className="profile-card admin-menu-button"
            onClick={() => setView("reports")}
          >
            <h3>🚨 Meldungen</h3>

            <p className="muted">
              Gemeldete Nutzer und Gründe anzeigen.
            </p>
          </button>

          <div className="profile-card">
            <h3>🎨 Login-Hintergrund</h3>

            <p className="muted">
              Das aktuelle Hintergrundbild wird direkt aus
              deinem öffentlichen Supabase-Bucket geladen.
            </p>

            <div className="background-preview">
              <img
                src={LOGIN_BACKGROUND_URL}
                alt="Login-Hintergrund"
              />
            </div>

            <p className="small">
              Aktuelle Datei: <b>login-bg.png</b>
            </p>

            <div className="notice">
              Um das Bild zu wechseln, ersetze in Supabase
              Storage die Datei <b>login-bg.png</b> im Bucket
              <b> app-images</b>.
            </div>
          </div>
        </div>
      )}

      {view === "users" && (
        <div>
          <button
            className="ghost"
            onClick={() => setView("menu")}
          >
            ← Zurück
          </button>

          <h2>👥 Nutzerverwaltung</h2>

          <button
            className="ghost"
            onClick={loadUsers}
            style={{ marginBottom: "12px" }}
          >
            🔄 Nutzerliste aktualisieren
          </button>

          {loading && <p>Lade Nutzer …</p>}

          {!loading && users.length === 0 && (
            <p className="muted">
              Keine Nutzer gefunden.
            </p>
          )}

          {users.map(user => (
            <article
              className="profile-card"
              key={user.id}
            >
              <h3>{user.display_name || "Ohne Namen"}</h3>

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
                className={
                  user.is_blocked
                    ? "primary"
                    : "ghost"
                }
                onClick={() =>
                  toggleBlocked(user)
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
            className="ghost"
            onClick={() => setView("menu")}
          >
            ← Zurück
          </button>

          <h2>🎟️ Workshop-Verwaltung</h2>

          <button
            className="primary"
            onClick={addWorkshop}
          >
            ➕ Neuen Workshop hinzufügen
          </button>

          {loading && <p>Lade Workshops …</p>}

          {workshops.map(workshop => (
            <article
              className="profile-card"
              key={workshop.id}
            >
              <h3>
                🎟️ {formatDate(workshop.starts_at)}
              </h3>

              <h2>{workshop.title}</h2>

              <p>
                🕐 {formatTime(workshop.starts_at)} Uhr
              </p>

              {workshop.location && (
                <p>📍 {workshop.location}</p>
              )}

              <button
                className="ghost"
                onClick={() =>
                  loadParticipants(workshop.id)
                }
              >
                👥 Teilnehmer anzeigen
              </button>

              <div className="admin-actions">
                <button
                  className="ghost"
                  onClick={() =>
                    editWorkshop(workshop)
                  }
                >
                  ✏️ Bearbeiten
                </button>

                <button
                  className="ghost danger"
                  onClick={() =>
                    deleteWorkshop(workshop)
                  }
                >
                  🗑️ Löschen
                </button>
              </div>

              {participants[workshop.id] && (
                <div className="participants">
                  <h3>
                    Teilnehmer (
                    {participants[workshop.id].length}
                    )
                  </h3>

                  {participants[workshop.id].length === 0 && (
                    <p className="muted">
                      Noch keine Teilnehmer.
                    </p>
                  )}

                  {participants[workshop.id].map(
                    participant => (
                      <div
                        key={participant.user_id}
                        className="participant"
                      >
                        <strong>
                          {participant.profile
                            ?.display_name ||
                            "Unbekannter Nutzer"}
                        </strong>

                        <div>
                          {participant.level ||
                            "Niveau nicht angegeben"}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {view === "reports" && (
        <div>
          <button
            className="ghost"
            onClick={() => setView("menu")}
          >
            ← Zurück
          </button>

          <h2>🚨 Meldungen</h2>

          <article className="profile-card">
            <h3>📋 Nutzermeldungen</h3>

            <p className="muted">
              Hier siehst du Meldungen, die von Nutzern an den Admin gesendet wurden.
            </p>

            {contactLoading && (
              <p>Meldungen werden geladen …</p>
            )}

            {!contactLoading && reports.length === 0 && (
              <p className="muted">
                Noch keine Meldungen vorhanden.
              </p>
            )}
          </article>

          {!contactLoading &&
            reports.map(report => {
              const date = new Intl.DateTimeFormat(
                "de-DE",
                {
                  timeZone: "Europe/Berlin",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                }
              ).format(new Date(report.created_at));

              const time = new Intl.DateTimeFormat(
                "de-DE",
                {
                  timeZone: "Europe/Berlin",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                }
              ).format(new Date(report.created_at));

              return (
                <article
                  className="profile-card"
                  key={report.id}
                >
                  <h3>
                    {report.status === "open" || report.status === "pending"
                      ? "🟠 Offen"
                      : `Status: ${report.status || "unbekannt"}`}
                  </h3>

                  <p>
                    <strong>Gemeldet von:</strong>{" "}
                    {report.reporter?.display_name || "Unbekannter Nutzer"}
                  </p>

                  <p>
                    <strong>Gemeldeter Nutzer:</strong>{" "}
                    {report.reported?.display_name || "Unbekannter Nutzer"}
                  </p>

                  <p>
                    <strong>Grund:</strong>{" "}
                    {report.reason || "Kein Grund angegeben"}
                  </p>

                  {report.details && (
                    <div className="notice">
                      <strong>Details:</strong><br />
                      {report.details}
                    </div>
                  )}

                  <p className="muted">
                    Meldung am {date} um {time} Uhr
                  </p>

                  <div className="admin-actions">
                    <button
                      className="ghost danger"
                      onClick={() => blockReportedUser(report)}
                    >
                      🔒 Nutzer sperren
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      )}

      {view === "contacts" && (
        <div>
          <button
            className="ghost"
            onClick={() => setView("menu")}
          >
            ← Zurück
          </button>

          <h2>💬 Kontaktanfragen</h2>

          <article className="profile-card">
            <h3>📋 Kontaktverwaltung</h3>

            <p className="muted">
              Hier siehst du alle Kontaktanfragen zwischen den
              Nutzern. Es wird nichts automatisch gelöscht.
            </p>

            {contactLoading && (
              <p>Kontaktanfragen werden geladen …</p>
            )}

            {!contactLoading && contactRequests.length === 0 && (
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
                    {requester?.display_name || "Unbekannter Nutzer"}
                  </p>

                  <p>
                    <strong>An:</strong>{" "}
                    {recipient?.display_name || "Unbekannter Nutzer"}
                  </p>

                  {workshop && (
                    <p>
                      🎟️ <strong>Workshop:</strong>{" "}
                      {workshop.title}
                      {workshop.starts_at
                        ? ` · ${formatDate(workshop.starts_at)} ${formatTime(workshop.starts_at)} Uhr`
                        : ""}
                    </p>
                  )}

                  <p className="muted">
                    Anfrage am {date} um {time} Uhr
                  </p>

                  {request.status === "pending" && (
                    <div className="admin-actions">
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
                        className="ghost danger"
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

function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Passwort wurde geändert.");

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
        <h2>Neues Passwort</h2>

        <form onSubmit={submit}>
          <label>
            Neues Passwort

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
          <div className="notice">{message}</div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
