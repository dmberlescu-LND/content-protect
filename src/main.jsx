import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  Fingerprint,
  Globe2,
  HelpCircle,
  Image,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
  X,
  Zap,
} from "lucide-react";
import { PLAN_ENTITLEMENTS } from "../billing-policy.mjs";
import "./styles.css";
import "./auth.css";
import "./onboarding.css";
import "./operator.css";
import "./data-rights.css";

const matches = [
  {
    id: 1,
    site: "mirror-stream.net",
    type: "Video",
    matchScore: 98,
    status: "Action needed",
    age: "12 min ago",
    color: "violet",
  },
  {
    id: 2,
    site: "social-repost.co",
    type: "Photo set",
    matchScore: 94,
    status: "Monitoring",
    age: "2 hrs ago",
    color: "blue",
  },
  {
    id: 3,
    site: "forumvault.io",
    type: "Image",
    matchScore: 91,
    status: "Takedown sent",
    age: "Yesterday",
    color: "peach",
  },
  {
    id: 4,
    site: "cliparchive.tv",
    type: "Video",
    matchScore: 87,
    status: "Removed",
    age: "Jul 14",
    color: "mint",
  },
];

async function saveDownload(response, fallbackName) {
  const blob = await response.blob(),
    disposition = response.headers.get("content-disposition") || "",
    filename = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackName,
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

let yotiShareClientPromise;
function loadYotiShareClient() {
  if (window.Yoti) return Promise.resolve(window.Yoti);
  if (!yotiShareClientPromise)
    yotiShareClientPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.yoti.com/share/client/v2";
      script.async = true;
      script.onload = () =>
        window.Yoti
          ? resolve(window.Yoti)
          : reject(new Error("Yoti client did not initialise."));
      script.onerror = () => reject(new Error("Yoti client could not load."));
      document.head.appendChild(script);
    });
  return yotiShareClientPromise;
}

function YotiAgeButton({ onVerified }) {
  const container = useRef(null),
    currentSessionId = useRef(null),
    completing = useRef(false),
    onVerifiedRef = useRef(onVerified),
    [status, setStatus] = useState("loading"),
    [configuration, setConfiguration] = useState(null),
    [sandboxRunning, setSandboxRunning] = useState(false);
  onVerifiedRef.current = onVerified;
  useEffect(() => {
    let active = true,
      widget;
    const initialise = async () => {
      const configResponse = await fetch("/api/verification/age/config"),
        config = await configResponse.json();
      if (!configResponse.ok) {
        if (active) setStatus("unavailable");
        return;
      }
      if (active) setConfiguration(config);
      if (config.mode === "sandbox") {
        if (active) setStatus("sandbox");
        return;
      }
      const Yoti = await loadYotiShareClient();
      await Yoti.ready();
      if (!active) return;
      widget = await Yoti.createWebShare({
        name: "Content Protect private 18+ check",
        domId: "yoti-age-share-button",
        sdkId: config.sdkId,
        hooks: {
          sessionIdResolver: async () => {
            const response = await fetch("/api/verification/age/start", {
                method: "POST",
              }),
              result = await response.json();
            if (!response.ok)
              throw new Error(
                result.error || "Could not start age verification.",
              );
            currentSessionId.current = result.sessionId;
            return result.sessionId;
          },
          completionHandler: async (receiptId) => {
            if (completing.current || !currentSessionId.current) return;
            completing.current = true;
            try {
              const response = await fetch("/api/verification/age/complete", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    sessionId: currentSessionId.current,
                    receiptId,
                  }),
                }),
                result = await response.json();
              if (!response.ok || !result.verified)
                throw new Error(
                  result.error || "Age verification was not completed.",
                );
              onVerifiedRef.current(result.user);
              alert("Your private 18+ check was verified successfully.");
            } catch (error) {
              alert(error.message || "Age verification was not completed.");
            } finally {
              completing.current = false;
            }
          },
          errorListener: () => {
            if (active)
              alert("The age check was cancelled or could not be completed.");
          },
        },
      });
      if (active) setStatus("ready");
    };
    initialise().catch(() => {
      if (active) setStatus("unavailable");
    });
    return () => {
      active = false;
      widget?.destroy?.();
    };
  }, []);
  const runSandboxTest = async () => {
    const password = prompt(
      "Enter the test account password to confirm this controlled sandbox check.",
    );
    if (!password) return;
    setSandboxRunning(true);
    try {
      const response = await fetch("/api/verification/age/sandbox-complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        }),
        result = await response.json();
      if (!response.ok || !result.verified)
        throw new Error(result.error || "Sandbox age testing failed.");
      onVerifiedRef.current(result.user);
      alert(
        "Controlled sandbox test passed. This is not a real Yoti identity check and cannot enable production.",
      );
    } catch (error) {
      alert(error.message || "Sandbox age testing failed.");
    } finally {
      setSandboxRunning(false);
    }
  };
  if (status === "unavailable")
    return (
      <button className="btn btn-outline" disabled>
        Provider activation pending
      </button>
    );
  if (status === "sandbox")
    return (
      <div className="yoti-age-control sandbox">
        <button
          className="btn btn-outline"
          disabled={sandboxRunning || !configuration?.testOnly}
          onClick={runSandboxTest}
        >
          {sandboxRunning
            ? "Running sandbox test…"
            : "Run approved sandbox test"}
        </button>
        <small>Test account only · no Yoti phone or identity check</small>
      </div>
    );
  return (
    <div className="yoti-age-control">
      <div
        ref={container}
        id="yoti-age-share-button"
        aria-busy={status === "loading"}
        aria-label="Start private Yoti age verification"
      />
      {status === "loading" && <span>Loading secure age check…</span>}
    </div>
  );
}

function Logo({ dark = false }) {
  return (
    <div className={`logo ${dark ? "dark" : ""}`}>
      <span className="logo-mark">
        <Fingerprint size={19} />
      </span>
      <span>content protect</span>
    </div>
  );
}

function Landing({ onStart, onLogin }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="landing">
      <nav className="nav wrap">
        <Logo />
        <div className={`nav-links ${menu ? "open" : ""}`}>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nav-actions">
          <button className="text-btn" onClick={onLogin}>
            Log in
          </button>
          <button className="btn btn-dark" onClick={onStart}>
            Start protecting <ArrowRight size={16} />
          </button>
        </div>
        <button className="menu-btn" onClick={() => setMenu(!menu)}>
          {menu ? <X /> : <Menu />}
        </button>
      </nav>

      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span></span> Built for creators, not platforms
            </div>
            <h1>
              Your content.
              <br />
              <em>Your control.</em>
            </h1>
            <p className="hero-sub">
              Search supported images for likely public copies, preserve
              evidence and manage reviewed takedown notices from one private
              workspace. Video matching will be enabled only with a named
              compatible provider.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-large" onClick={onStart}>
                Create secure account <ArrowRight size={18} />
              </button>
              <button
                className="play-btn"
                onClick={() =>
                  document
                    .querySelector("#how")
                    .scrollIntoView({ behavior: "smooth" })
                }
              >
                <span>▶</span> See how it works
              </button>
            </div>
            <div className="trust-line">
              <div className="faces">
                <i>
                  <LockKeyhole size={13} />
                </i>
                <i>
                  <ShieldCheck size={13} />
                </i>
              </div>
              <span>
                <b>Private UK-built workspace</b> for creator-led protection
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="orbit orbit-one"></div>
            <div className="orbit orbit-two"></div>
            <div className="scan-card main-scan">
              <div className="scan-top">
                <span className="pulse-dot"></span>
                <span>PRODUCT WORKFLOW PREVIEW</span>
                <b>Review</b>
              </div>
              <div className="scan-progress">
                <i></i>
              </div>
              <div className="content-preview">
                <div className="portrait abstract-one">
                  <span></span>
                </div>
                <div className="preview-info">
                  <small>PROTECTED ASSET</small>
                  <strong>Summer Campaign 04</strong>
                  <span>
                    <Image size={14} /> 8 reference images
                  </span>
                </div>
                <ShieldCheck className="shield" size={31} />
              </div>
              <div className="found-row">
                <span>
                  <Globe2 size={17} /> Sources checked
                </span>
                <b>Provider-dependent</b>
              </div>
              <div className="found-row danger">
                <span>
                  <Zap size={17} /> Potential matches
                </span>
                <b>Human-reviewed</b>
              </div>
            </div>
            <div className="floating-card verified">
              <CircleCheck size={25} />
              <div>
                <b>Match verified</b>
                <span>Similarity lead — review required</span>
              </div>
            </div>
            <div className="floating-card private">
              <LockKeyhole size={21} />
              <div>
                <b>Private by design</b>
                <span>Encrypted & deleted anytime</span>
              </div>
            </div>
          </div>
        </section>

        <section className="proof-strip">
          <div className="wrap proof-grid">
            <div>
              <strong>Private</strong>
              <span>encrypted reference vault</span>
            </div>
            <div>
              <strong>Creator-led</strong>
              <span>approval before action</span>
            </div>
            <div>
              <strong>Transparent</strong>
              <span>clear evidence and status</span>
            </div>
            <div>
              <strong>UK</strong>
              <span>company and GBP billing</span>
            </div>
          </div>
        </section>

        <section id="how" className="how wrap section">
          <div className="section-label">Simple protection</div>
          <h2>
            From stolen to removed,
            <br />
            without the chaos.
          </h2>
          <p className="section-lead">
            A clear workflow that keeps you informed and in control at every
            step.
          </p>
          <div className="steps">
            <div className="step">
              <span className="step-num">01</span>
              <div className="step-icon">
                <Upload />
              </div>
              <h3>Add your content</h3>
              <p>
                Upload supported reference media securely. You choose what is
                processed, explicitly consent per file and can delete it.
              </p>
            </div>
            <div className="step">
              <span className="step-num">02</span>
              <div className="step-icon">
                <Search />
              </div>
              <h3>We find copies</h3>
              <p>
                Visual matching surfaces likely copies and preserves the URL,
                date, and page evidence for your review.
              </p>
            </div>
            <div className="step">
              <span className="step-num">03</span>
              <div className="step-icon">
                <FileCheck2 />
              </div>
              <h3>Take action</h3>
              <p>
                Approve a prepared notice, track its status, and escalate
                stubborn cases with specialist support.
              </p>
            </div>
          </div>
        </section>

        <section id="safety" className="safety section">
          <div className="wrap safety-grid">
            <div className="safety-visual">
              <div className="lock-ring">
                <LockKeyhole size={54} />
              </div>
              <span className="safe-chip chip-a">
                <Check size={14} /> Encrypted storage
              </span>
              <span className="safe-chip chip-b">
                <Eye size={14} /> You control access
              </span>
            </div>
            <div>
              <div className="section-label">Privacy first</div>
              <h2>Intimate content deserves serious protection.</h2>
              <p>
                We designed Content Protect for people whose safety, identity,
                and livelihood depend on discretion. Reference files are
                private, encrypted, and never used for advertising or public
                profiles.
              </p>
              <ul>
                <li>
                  <Check /> Delete your content and account whenever you choose
                </li>
                <li>
                  <Check /> Review every match before any action is taken
                </li>
                <li>
                  <Check /> No contact with uploaders in your name without
                  approval
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="pricing wrap section">
          <div className="section-label">Planned launch pricing</div>
          <h2>Choose the level of operational support.</h2>
          <div className="price-cards">
            <div className="price-card">
              <h3>Monitor</h3>
              <p>Know where your content appears.</p>
              <div className="price">
                <strong>£19</strong>
                <span>/ month</span>
              </div>
              <ul>
                <li>
                  <Check /> Up to {PLAN_ENTITLEMENTS.Monitor.assetLimit} private
                  reference files
                </li>
                <li>
                  <Check /> One supported-image scan every 30 days
                </li>
                <li>
                  <Check /> Match alerts & evidence
                </li>
              </ul>
              <button className="btn btn-outline" onClick={onStart}>
                Choose Monitor
              </button>
            </div>
            <div className="price-card featured">
              <span className="popular">MOST POPULAR</span>
              <h3>Protect</h3>
              <p>Find copies and act quickly.</p>
              <div className="price">
                <strong>£49</strong>
                <span>/ month</span>
              </div>
              <ul>
                <li>
                  <Check /> Up to {PLAN_ENTITLEMENTS.Protect.assetLimit} private
                  reference files
                </li>
                <li>
                  <Check /> One supported-image scan every 24 hours
                </li>
                <li>
                  <Check /> Evidence and guided takedown cases
                </li>
              </ul>
              <button className="btn btn-primary" onClick={onStart}>
                Start protecting
              </button>
            </div>
            <div className="price-card">
              <h3>Pro</h3>
              <p>High-volume, priority protection.</p>
              <div className="price">
                <strong>£99</strong>
                <span>/ month</span>
              </div>
              <ul>
                <li>
                  <Check /> Up to {PLAN_ENTITLEMENTS.Pro.assetLimit} private
                  reference files
                </li>
                <li>
                  <Check /> One supported-image scan every 24 hours
                </li>
                <li>
                  <Check /> Priority specialist review
                </li>
              </ul>
              <button className="btn btn-outline" onClick={onStart}>
                Choose Pro
              </button>
            </div>
          </div>
          <p className="disclaimer">
            Checkout remains unavailable until provider, verification and
            billing controls are active. Features and recurring price are
            confirmed again before purchase. Outcomes are not guaranteed; court
            orders and legal representation are not included.
          </p>
        </section>

        <section id="faq" className="faq wrap section">
          <div className="section-label">Clear answers</div>
          <h2>Questions creators ask before trusting a protection service.</h2>
          <div className="faq-grid">
            <article>
              <h3>Does Content Protect automatically remove content?</h3>
              <p>
                No. A similarity result is reviewed, evidence is preserved and
                you must approve the required declarations before a trained
                operator can send a notice.
              </p>
            </article>
            <article>
              <h3>Is uploaded content public?</h3>
              <p>
                No. Reference media is private and encrypted, is not used for
                advertising or public profiles, and can be deleted by you.
              </p>
            </article>
            <article>
              <h3>Who can use Content Protect?</h3>
              <p>
                Verified adults aged 18 or over who own the relevant rights or
                are authorised to act for the rights holder.
              </p>
            </article>
            <article>
              <h3>Does a match prove copyright infringement?</h3>
              <p>
                No. Matching is an evidence lead, not a legal conclusion.
                Ownership, licence, context and jurisdiction must be reviewed.
              </p>
            </article>
            <article>
              <h3>Can you guarantee removal?</h3>
              <p>
                No service can guarantee an outcome. Platforms, hosts and search
                engines make their own decisions, and contested cases may
                require specialist legal advice.
              </p>
            </article>
            <article>
              <h3>Do you store card details?</h3>
              <p>
                No. Stripe processes card information. Content Protect stores
                only the subscription and billing references needed to manage
                your account.
              </p>
            </article>
          </div>
        </section>
      </main>
      <footer>
        <div className="wrap footer-inner">
          <Logo dark />
          <p>Protecting the people behind the content.</p>
          <div>
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
            <a href="/safety.html">Safety</a>
            <a href="/cookies.html">Cookies</a>
            <a href="/disputes.html">Disputes</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AccountSettings({ user, subscription, billingMode, onDeleted }) {
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passwords),
      }),
      d = await r.json();
    setBusy(false);
    if (!r.ok) {
      alert(d.error || "Password could not be changed.");
      return;
    }
    setPasswords({ currentPassword: "", newPassword: "" });
    alert("Password changed. Other sessions have been signed out.");
  };
  const openPortal = async () => {
    const r = await fetch("/api/billing/portal", { method: "POST" }),
      d = await r.json();
    if (!r.ok) {
      alert(d.error);
      return;
    }
    location.assign(d.url);
  };
  const exportData = async () => {
    const password = prompt(
      "Enter your password to create a private copy of your Content Protect account data.",
    );
    if (!password) return;
    const response = await fetch("/api/account/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error || "Your data export could not be created.");
      return;
    }
    await saveDownload(response, "content-protect-data.json");
  };
  const enableMfa = async () => {
    const password = prompt(
      "Enter your password to start two-step verification setup.",
    );
    if (!password) return;
    const setupResponse = await fetch("/api/account/mfa/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const setup = await setupResponse.json();
    if (!setupResponse.ok) {
      alert(setup.error || "Two-step verification setup could not start.");
      return;
    }
    const code = prompt(
      `In your authenticator app choose “Enter a setup key”.\n\nAccount: ${user.email}\nKey: ${setup.groupedSecret}\nType: Time based\n\nThen enter the 6-digit code here:`,
    );
    if (!code) return;
    const enableResponse = await fetch("/api/account/mfa/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, secret: setup.secret, code }),
    });
    const enabled = await enableResponse.json();
    if (!enableResponse.ok) {
      alert(enabled.error || "The authenticator code could not be verified.");
      return;
    }
    await saveDownload(
      new Response(enabled.recoveryCodes.join("\n") + "\n", {
        headers: {
          "content-type": "text/plain",
          "content-disposition":
            'attachment; filename="content-protect-recovery-codes.txt"',
        },
      }),
      "content-protect-recovery-codes.txt",
    );
    alert(
      "Two-step verification is enabled. Your recovery codes were downloaded. Store them somewhere private; each code works once.",
    );
    location.reload();
  };
  const disableMfa = async () => {
    const password = prompt(
      "Enter your password to disable two-step verification.",
    );
    if (!password) return;
    const code = prompt("Enter a current authenticator or recovery code.");
    if (!code) return;
    const response = await fetch("/api/account/mfa", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, code }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert(result.error || "Two-step verification could not be disabled.");
      return;
    }
    alert("Two-step verification is disabled. Other sessions were signed out.");
    location.reload();
  };
  const deleteAccount = async () => {
    const password = prompt(
      "Enter your password to permanently delete your account and encrypted files.",
    );
    if (!password) return;
    if (
      !confirm(
        "This permanently deletes your account, vault files, scans and cases. This cannot be undone.",
      )
    )
      return;
    const r = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      }),
      d = await r.json();
    if (!r.ok) {
      alert(d.error || "Account could not be deleted.");
      return;
    }
    onDeleted();
  };
  return (
    <div className="account-grid">
      <section className="account-card">
        <h2>Account security</h2>
        <p>{user.email}</p>
        <form onSubmit={changePassword}>
          <label>
            Current password
            <input
              type="password"
              required
              value={passwords.currentPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, currentPassword: e.target.value })
              }
            />
          </label>
          <label>
            New password
            <input
              type="password"
              required
              minLength="10"
              value={passwords.newPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, newPassword: e.target.value })
              }
            />
            <small>At least 10 characters</small>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Updating…" : "Change password"}
          </button>
        </form>
      </section>
      <section className="account-card">
        <h2>Your personal data</h2>
        <p>
          Download a machine-readable copy of your profile, verification
          outcomes, asset metadata, scans, matches, cases, billing records and
          audit history.
        </p>
        <button className="btn btn-outline" onClick={exportData}>
          <Download size={16} /> Download data export
        </button>
        <small>
          Your password is required. Original reference files are downloaded
          separately from My content.
        </small>
      </section>
      <section className="account-card">
        <h2>Two-step verification</h2>
        <p>
          {user.mfaEnabled
            ? `Enabled · ${user.mfaRecoveryCodesRemaining} recovery codes remaining`
            : "Protect sign-in with a time-based code from your authenticator app."}
        </p>
        <button
          className={user.mfaEnabled ? "btn danger-btn" : "btn btn-primary"}
          onClick={user.mfaEnabled ? disableMfa : enableMfa}
        >
          <ShieldCheck size={16} />
          {user.mfaEnabled
            ? "Disable two-step verification"
            : "Enable two-step verification"}
        </button>
        <small>
          Enabling or disabling this control signs out every other session.
        </small>
      </section>
      <section className="account-card">
        <h2>Subscription</h2>
        <p>
          <b>{subscription?.plan || user.plan}</b> ·{" "}
          {subscription?.status || "No completed Stripe subscription"}
        </p>
        <button className="btn btn-outline" onClick={openPortal}>
          Manage subscription
        </button>
        <small>
          {billingMode === "stripe_live"
            ? "Secure billing is managed by Stripe."
            : billingMode === "stripe_test"
              ? "Stripe test mode — test cards only, no live charges."
              : "Billing activation is not complete; no payment can be taken."}
        </small>
      </section>
      <section className="account-card danger-zone">
        <h2>Delete account</h2>
        <p>
          Permanently removes your profile, encrypted reference files, scans,
          cases and active sessions.
        </p>
        <button className="btn danger-btn" onClick={deleteAccount}>
          Delete my account
        </button>
      </section>
    </div>
  );
}

function HelpSafety() {
  const [cases, setCases] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messageDrafts, setMessageDrafts] = useState({});
  const [form, setForm] = useState({
    category: "service",
    subject: "",
    statement: "",
    desiredResolution: "",
    orderReference: "",
    confirmAccuracy: false,
    confirmNoSecretsOrMedia: false,
    privacyAccepted: false,
  });
  const loadCases = async () => {
    const response = await fetch("/api/support/cases"),
      result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Support cases could not be loaded.");
    setCases(result.cases || []);
  };
  useEffect(() => {
    loadCases().catch((nextError) => setError(nextError.message));
  }, []);
  const submitCase = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/support/cases", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        }),
        result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The request could not be submitted.");
      setForm({
        category: "service",
        subject: "",
        statement: "",
        desiredResolution: "",
        orderReference: "",
        confirmAccuracy: false,
        confirmNoSecretsOrMedia: false,
        privacyAccepted: false,
      });
      await loadCases();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  };
  const addMessage = async (caseId) => {
    const message = String(messageDrafts[caseId] || "").trim();
    if (message.length < 10) {
      setError("A follow-up message must contain at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/support/cases/${caseId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, confirmNoSecretsOrMedia: true }),
        }),
        result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The message could not be submitted.");
      setMessageDrafts({ ...messageDrafts, [caseId]: "" });
      await loadCases();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="account-grid help-grid">
      <section className="account-card support-case-centre">
        <div className="support-icon">
          <HelpCircle />
        </div>
        <h2>Private support and complaints</h2>
        <p>
          Open a tracked request about billing, cancellation, refunds, privacy,
          accessibility, safety or the service. Sensitive details are encrypted
          and reviewed only by an authorised operator.
        </p>
        {error && <div className="operator-error">{error}</div>}
        <form className="support-case-form" onSubmit={submitCase}>
          <div className="support-case-fields">
            <label>
              Category
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                <option value="billing">Billing</option>
                <option value="cancellation">Cancellation</option>
                <option value="cooling-off">14-day cooling-off</option>
                <option value="refund">Refund</option>
                <option value="service">Service</option>
                <option value="privacy">Privacy</option>
                <option value="accessibility">Accessibility</option>
                <option value="safety">Urgent creator safety</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Order reference (optional)
              <input
                maxLength="160"
                placeholder="Opaque Stripe or account reference"
                value={form.orderReference}
                onChange={(event) =>
                  setForm({ ...form, orderReference: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            Subject
            <input
              required
              minLength="8"
              maxLength="120"
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.target.value })
              }
            />
          </label>
          <label>
            What happened?
            <textarea
              required
              minLength="30"
              maxLength="4000"
              rows="5"
              value={form.statement}
              onChange={(event) =>
                setForm({ ...form, statement: event.target.value })
              }
            />
          </label>
          <label>
            Requested resolution (optional)
            <textarea
              maxLength="1000"
              rows="3"
              value={form.desiredResolution}
              onChange={(event) =>
                setForm({ ...form, desiredResolution: event.target.value })
              }
            />
          </label>
          <div className="support-confirmations">
            <label>
              <input
                type="checkbox"
                checked={form.confirmAccuracy}
                onChange={(event) =>
                  setForm({ ...form, confirmAccuracy: event.target.checked })
                }
              />
              I confirm this request is accurate.
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.confirmNoSecretsOrMedia}
                onChange={(event) =>
                  setForm({
                    ...form,
                    confirmNoSecretsOrMedia: event.target.checked,
                  })
                }
              />
              I have not included passwords, identity documents or private
              media.
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.privacyAccepted}
                onChange={(event) =>
                  setForm({ ...form, privacyAccepted: event.target.checked })
                }
              />
              I understand this request is processed under the Privacy Notice.
            </label>
          </div>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              !form.confirmAccuracy ||
              !form.confirmNoSecretsOrMedia ||
              !form.privacyAccepted
            }
          >
            {busy ? "Submitting…" : "Open tracked request"}
          </button>
        </form>
        <div className="support-case-list">
          <h3>Your requests</h3>
          {cases.length ? (
            cases.map((item) => (
              <article key={item.id}>
                <div>
                  <b>{item.reference}</b>
                  <span>{item.status.replace(/-/g, " ")}</span>
                </div>
                <strong>{item.subject}</strong>
                <small>
                  Response target:{" "}
                  {new Date(item.responseDueAt).toLocaleDateString()} ·
                  Resolution target:{" "}
                  {new Date(item.resolutionDueAt).toLocaleDateString()}
                </small>
                <p>{item.statement}</p>
                {!["resolved", "closed"].includes(item.status) && (
                  <div className="support-follow-up">
                    <textarea
                      rows="2"
                      maxLength="3000"
                      placeholder="Add a safe follow-up message (no passwords or private media)"
                      value={messageDrafts[item.id] || ""}
                      onChange={(event) =>
                        setMessageDrafts({
                          ...messageDrafts,
                          [item.id]: event.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() => addMessage(item.id)}
                    >
                      Add message
                    </button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <small>No tracked requests yet.</small>
          )}
        </div>
      </section>
      <section className="account-card">
        <div className="support-icon urgent">
          <ShieldCheck />
        </div>
        <h2>Safety guidance</h2>
        <p>
          Practical steps for intimate-image abuse, account security and
          situations where contacting an uploader may increase risk.
        </p>
        <a className="btn btn-outline" href="/safety.html">
          Open safety centre
        </a>
        <small>
          Content Protect is not an emergency or law-enforcement service.
        </small>
      </section>
      <section className="account-card">
        <div className="support-icon">
          <FileCheck2 />
        </div>
        <h2>Report a problem</h2>
        <p>
          Report a suspected security issue, incorrect match, disputed ownership
          claim or accessibility problem.
        </p>
        <a
          className="btn btn-outline"
          href="mailto:white.eagles.dm@gmail.com?subject=Content%20Protect%20problem%20report"
        >
          Send a problem report
        </a>
        <small>
          For security reports, describe the issue without including live
          passwords or private content.
        </small>
      </section>
    </div>
  );
}

function blankRightsDeclaration(name = "") {
  return {
    rightsRole: "copyright-owner",
    rightsHolderName: name,
    workTitle: "",
    originalPublicationUrl: "",
    authorityEvidenceReference: "",
    confirmRightsAuthority: false,
    confirmRightsAccurate: false,
  };
}

function RightsDeclarationFields({ value, onChange }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return (
    <div className="rights-form">
      <div className="rights-form-heading">
        <b>Rights and authority declaration</b>
        <span>
          This is reviewed by a trained operator before any notice can be
          prepared. Do not upload contracts or private documents here.
        </span>
      </div>
      <div className="rights-field-row">
        <label>
          Your legal relationship to this work
          <select
            required
            value={value.rightsRole}
            onChange={(event) => update("rightsRole", event.target.value)}
          >
            <option value="copyright-owner">Copyright owner</option>
            <option value="authorised-agent">
              Authorised agent for the rights holder
            </option>
            <option value="exclusive-licensee">
              Exclusive licensee authorised to enforce
            </option>
          </select>
        </label>
        <label>
          Legal or business name of rights holder
          <input
            type="text"
            required
            maxLength="120"
            value={value.rightsHolderName}
            onChange={(event) => update("rightsHolderName", event.target.value)}
          />
        </label>
      </div>
      <div className="rights-field-row">
        <label>
          Work title or internal name (optional)
          <input
            type="text"
            maxLength="160"
            value={value.workTitle}
            onChange={(event) => update("workTitle", event.target.value)}
          />
        </label>
        <label>
          Original publication URL (optional, HTTPS)
          <input
            type="url"
            placeholder="https://…"
            value={value.originalPublicationUrl}
            onChange={(event) =>
              update("originalPublicationUrl", event.target.value)
            }
          />
        </label>
      </div>
      <label>
        Evidence reference
        <input
          type="text"
          required
          maxLength="200"
          placeholder="Example: original source file or agency agreement CP-2026-004"
          value={value.authorityEvidenceReference}
          onChange={(event) =>
            update("authorityEvidenceReference", event.target.value)
          }
        />
        <small>
          Use a short reference only. Keep the underlying document in the
          approved restricted company record.
        </small>
      </label>
      <label className="rights-check">
        <input
          type="checkbox"
          required
          checked={value.confirmRightsAuthority}
          onChange={(event) =>
            update("confirmRightsAuthority", event.target.checked)
          }
        />
        I own the copyright or am authorised to enforce it for the named rights
        holder.
      </label>
      <label className="rights-check">
        <input
          type="checkbox"
          required
          checked={value.confirmRightsAccurate}
          onChange={(event) =>
            update("confirmRightsAccurate", event.target.checked)
          }
        />
        I confirm this per-file declaration is accurate and understand that
        false claims may result in suspension.
      </label>
    </div>
  );
}

function Dashboard({ onLogout, onUserUpdate, user }) {
  const [tab, setTab] = useState("Overview");
  const [navOpen, setNavOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [mediaConsent, setMediaConsent] = useState(false);
  const [rightsForm, setRightsForm] = useState(() =>
    blankRightsDeclaration(user?.name),
  );
  const [rightsAsset, setRightsAsset] = useState(null);
  const [captureMatch, setCaptureMatch] = useState(null);
  const [pageCaptureConsent, setPageCaptureConsent] = useState(false);
  const [confirmTargetPage, setConfirmTargetPage] = useState(false);
  const [confirmUnaltered, setConfirmUnaltered] = useState(false);
  const [filter, setFilter] = useState("All matches");
  const [data, setData] = useState({
    matches: [],
    assets: [],
    cases: [],
    scans: [],
    entitlements: {
      plan: "Unsubscribed",
      canScan: false,
      canUpload: false,
      canCreateCases: false,
      assetLimit: 0,
      assetSlotsRemaining: 0,
      scanFrequency: "unavailable",
    },
    scannerMode: "unconfigured",
    videoScannerMode: "unconfigured",
    stats: { matches: 0, review: 0, active: 0, removed: 0, sources: 0 },
  });
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    const r = await fetch("/api/dashboard");
    if (r.status === 401) {
      onLogout();
      return;
    }
    const d = await r.json();
    if (r.ok) setData(d);
    setLoading(false);
  };
  useEffect(() => {
    refresh();
  }, []);
  const liveMatches = data.matches;
  const imageAssetCount = data.assets.filter((asset) =>
      asset.mime?.startsWith("image/"),
    ).length,
    videoAssetCount = data.assets.filter((asset) =>
      asset.mime?.startsWith("video/"),
    ).length,
    videoScanningActive = data.videoScannerMode === "tineye-keyframes",
    scannableAssetCount =
      imageAssetCount + (videoScanningActive ? videoAssetCount : 0),
    rightsDeclarationReady =
      rightsForm.rightsHolderName.trim().length >= 2 &&
      rightsForm.authorityEvidenceReference.trim().length >= 3 &&
      rightsForm.confirmRightsAuthority &&
      rightsForm.confirmRightsAccurate,
    pageCaptureReady =
      pageCaptureConsent && confirmTargetPage && confirmUnaltered;
  const filtered = useMemo(
    () =>
      filter === "All matches"
        ? liveMatches
        : liveMatches.filter((m) => m.status === filter),
    [filter, liveMatches],
  );
  const initials = (user?.name || "Creator")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const encoded = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        mime: file.type,
        data: encoded,
        sensitiveMediaConsent: mediaConsent,
        ...rightsForm,
      }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error || "Upload failed");
      return;
    }
    setModal(false);
    setMediaConsent(false);
    setRightsForm(blankRightsDeclaration(user?.name));
    await refresh();
    alert("Content encrypted and added to your private vault.");
  };
  const saveAssetRights = async (event) => {
    event.preventDefault();
    if (!rightsAsset) return;
    const response = await fetch(`/api/assets/${rightsAsset.id}/rights`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rightsForm),
    });
    const result = await response.json();
    if (!response.ok) {
      alert(result.error || "Rights declaration could not be saved.");
      return;
    }
    setRightsAsset(null);
    setRightsForm(blankRightsDeclaration(user?.name));
    await refresh();
    alert("The per-file rights declaration was recorded for operator review.");
  };
  const openPageCapture = (match) => {
    setCaptureMatch(match);
    setPageCaptureConsent(false);
    setConfirmTargetPage(false);
    setConfirmUnaltered(false);
  };
  const closePageCapture = () => {
    setCaptureMatch(null);
    setPageCaptureConsent(false);
    setConfirmTargetPage(false);
    setConfirmUnaltered(false);
  };
  const uploadPageCapture = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !captureMatch) return;
    const encoded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const response = await fetch(
      `/api/matches/${captureMatch.id}/page-capture`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          mime: file.type,
          data: encoded,
          pageCaptureConsent,
          confirmTargetPage,
          confirmUnaltered,
        }),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      alert(result.error || "The page capture could not be preserved.");
      return;
    }
    closePageCapture();
    await refresh();
    alert(
      "The encrypted page capture and its SHA-256 integrity hash were preserved.",
    );
  };
  const downloadPageCapture = async (match) => {
    const password = prompt(
      "Enter your password to decrypt and download this preserved page capture.",
    );
    if (!password) return;
    const response = await fetch(
      `/api/matches/${match.id}/page-capture/download`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      },
    );
    if (!response.ok) {
      const result = await response.json();
      alert(result.error || "The page capture could not be downloaded.");
      return;
    }
    await saveDownload(response, `page-capture-${match.id}.png`);
  };
  const createCase = async (matchId) => {
    const match = data.matches.find((item) => item.id === matchId);
    if (!match?.pageCapture) {
      if (match) openPageCapture(match);
      alert(
        "Preserve a current screenshot of the matched public page before opening the case.",
      );
      return;
    }
    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert(result.error || "Could not create case");
      return;
    }
    await refresh();
    setTab("Takedowns");
    alert(
      "Evidence preserved. A trained operator must verify the recipient and jurisdiction before the exact notice returns to you for approval.",
    );
  };
  const runScan = async () => {
    const response = await fetch("/api/scans", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      alert(result.error || "Scan could not start");
      return;
    }
    await refresh();
    alert(result.notice || "Live image scan completed.");
  };
  const selectPlan = async (plan) => {
    const entitlement = PLAN_ENTITLEMENTS[plan];
    const planLimit = {
      Monitor: `up to ${entitlement.assetLimit} reference files and one image scan every 30 days`,
      Protect: `up to ${entitlement.assetLimit} reference files, one image scan every 24 hours and takedown cases`,
      Pro: `up to ${entitlement.assetLimit} reference files, one image scan every 24 hours and priority support`,
    }[plan];
    const accepted = confirm(
      `Continue with the ${plan} monthly subscription: ${planLimit}?\n\nVideos use a file slot and are not scanned until privacy and provider approval for minimized video frames is activated. By selecting OK, you accept the Service Terms, expressly request Content Protect to begin the digital service immediately, and understand that if you cancel within 14 days you may have to pay for service already supplied. Your statutory rights are not affected.`,
    );
    if (!accepted) return;
    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan,
        termsAccepted: true,
        immediateServiceRequested: true,
        coolingOffAcknowledged: true,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error);
      return;
    }
    if (d.checkoutUrl) {
      location.assign(d.checkoutUrl);
      return;
    }
    alert(d.notice || "Billing is not available yet. No payment was taken.");
  };
  const deleteAsset = async (asset) => {
    if (
      !confirm(`Permanently delete “${asset.name}” from your encrypted vault?`)
    )
      return;
    const r = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Could not delete asset");
      return;
    }
    await refresh();
  };
  const downloadAsset = async (asset) => {
    const password = prompt(
      `Enter your password to decrypt and download “${asset.name}”.`,
    );
    if (!password) return;
    const response = await fetch(`/api/assets/${asset.id}/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error || "The reference file could not be downloaded.");
      return;
    }
    await saveDownload(response, asset.name || "reference-file");
  };
  const approveCase = async (caseId) => {
    const currentCase = data.cases.find((item) => item.id === caseId);
    if (!currentCase?.noticeText || !currentCase?.noticeHash) {
      alert("The exact notice has not been prepared for review yet.");
      return;
    }
    if (
      !confirm(
        `Review the exact notice below:\n\n${currentCase.noticeText}\n\nBy continuing, you confirm that you own or represent the rights, believe the use is unauthorised, confirm the information is accurate, and authorise delivery of this exact notice. Continue?`,
      )
    )
      return;
    const r = await fetch(`/api/cases/${caseId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rightsHolder: true,
        goodFaith: true,
        accurate: true,
        authoriseDelivery: true,
        noticeHash: currentCase.noticeHash,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Could not approve case");
      return;
    }
    await refresh();
    alert(d.notice);
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onLogout();
  };
  const resendVerification = async () => {
    const r = await fetch("/api/auth/resend-verification", { method: "POST" });
    const d = await r.json();
    alert(
      r.ok
        ? d.notice || "Verification email sent."
        : d.error || "Could not send verification email.",
    );
  };
  return (
    <div className="app-shell">
      <aside className={navOpen ? "mobile-open" : ""}>
        <button
          className="mobile-close"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        >
          <X />
        </button>
        <Logo dark />
        <button className="workspace" onClick={() => setTab("Account")}>
          <span>{initials}</span>
          <div>
            <b>{user?.stageName || user?.name || "Creator"}</b>
            <small>{data.entitlements.plan} plan</small>
          </div>
          <ChevronDown size={15} />
        </button>
        <div className="side-label">WORKSPACE</div>
        {["Overview", "Matches", "My content", "Takedowns"].map((x, i) => {
          const Icon = [LayoutDashboard, Search, Image, FileCheck2][i];
          return (
            <button
              key={x}
              className={`side-link ${tab === x ? "active" : ""}`}
              onClick={() => setTab(x)}
            >
              <Icon size={18} />
              {x}
              {x === "Matches" && data.matches.length > 0 && (
                <em>{data.matches.length}</em>
              )}
            </button>
          );
        })}
        <div className="side-label lower">ACCOUNT</div>
        <button
          className={`side-link ${tab === "Billing" ? "active" : ""}`}
          onClick={() => setTab("Billing")}
        >
          <Sparkles size={18} />
          Plans & billing
        </button>
        <button
          className={`side-link ${tab === "Account" ? "active" : ""}`}
          onClick={() => setTab("Account")}
        >
          <LockKeyhole size={18} />
          Account & security
        </button>
        <button
          className={`side-link ${tab === "Help & safety" ? "active" : ""}`}
          onClick={() => setTab("Help & safety")}
        >
          <HelpCircle size={18} />
          Help & safety
        </button>
        <div className="upgrade">
          <Sparkles />
          <b>
            {data.entitlements.canScan ? "Protection active" : "Choose a plan"}
          </b>
          <span>
            {data.entitlements.canScan
              ? `${data.entitlements.scanFrequency} scans enabled`
              : "Scanning is not active"}
          </span>
          <div>
            <i></i>
          </div>
          <small>
            {data.entitlements.canCreateCases
              ? "Takedown cases included"
              : "Private creator vault"}
          </small>
        </div>
        <button className="logout" onClick={logout}>
          Log out
        </button>
      </aside>
      <main className="dashboard">
        <header>
          <div>
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={15} />
            <b>{tab}</b>
          </div>
          <div>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={19} />
              <i></i>
            </button>
            <button className="avatar" aria-label="Account menu">
              {initials}
            </button>
          </div>
        </header>
        <div className={`dash-content tab-${tab.replaceAll(" ", "-")}`}>
          {!user.emailVerifiedAt && (
            <div className="verification-banner">
              <ShieldCheck />
              <div>
                <b>Verify your email before uploading content</b>
                <span>
                  We sent a secure 24-hour verification link to {user.email}.
                </span>
              </div>
              <button className="btn btn-outline" onClick={resendVerification}>
                Resend email
              </button>
            </div>
          )}
          {user.emailVerifiedAt && !user.ageVerifiedAt && (
            <div className="verification-banner">
              <ShieldCheck />
              <div>
                <b>Complete a private 18+ age check</b>
                <span>
                  Production verification uses Yoti and retains only the outcome
                  and method, never your document or face image.
                </span>
              </div>
              <YotiAgeButton onVerified={onUserUpdate} />
            </div>
          )}
          <div className="dash-title">
            <div>
              <p>Saturday, 18 July</p>
              <h1>
                {tab === "Overview"
                  ? `Good morning, ${user?.name?.split(" ")[0] || "Creator"}.`
                  : tab}
              </h1>
              <span>
                {tab === "Overview"
                  ? "Your content is protected. Here’s what changed since your last visit."
                  : "Review and manage your protection workspace."}
              </span>
            </div>
            <button
              className="btn btn-primary"
              disabled={
                data.entitlements.canUpload &&
                data.entitlements.assetSlotsRemaining === 0
              }
              onClick={() => {
                if (!data.entitlements.canUpload) {
                  setTab("Billing");
                  return;
                }
                setModal(true);
              }}
            >
              <Plus size={18} />
              {data.entitlements.canUpload
                ? data.entitlements.assetSlotsRemaining
                  ? "Add content"
                  : "File limit reached"
                : "Choose a plan"}
            </button>
          </div>
          {tab === "Overview" && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-icon purple">
                    <Search />
                  </div>
                  <span>Matches found</span>
                  <strong>{data.stats.matches}</strong>
                  <small>
                    {loading
                      ? "Loading…"
                      : `${data.assets.length} protected assets`}
                  </small>
                </div>
                <div className="stat-card">
                  <div className="stat-icon amber">
                    <Clock3 />
                  </div>
                  <span>Need your review</span>
                  <strong>{data.stats.review}</strong>
                  <small>Creator approval required</small>
                </div>
                <div className="stat-card">
                  <div className="stat-icon blue">
                    <FileCheck2 />
                  </div>
                  <span>Takedown cases</span>
                  <strong>{data.cases.length}</strong>
                  <small>{data.stats.active} active</small>
                </div>
                <div className="stat-card">
                  <div className="stat-icon green">
                    <ShieldCheck />
                  </div>
                  <span>Successfully removed</span>
                  <strong>{data.stats.removed}</strong>
                  <small>Verified outcomes only</small>
                </div>
              </div>
              <button
                className="scan-status scan-button"
                disabled={
                  !data.entitlements.canScan ||
                  !scannableAssetCount ||
                  data.scannerMode !== "tineye-commercial"
                }
                onClick={runScan}
              >
                <div className="scanner">
                  <Search size={19} />
                  <i></i>
                </div>
                <div>
                  <b>
                    Run protected {videoScanningActive ? "media" : "image"} scan
                  </b>
                  <span>
                    {!data.entitlements.canScan
                      ? "Choose an active plan before scanning"
                      : !scannableAssetCount
                        ? videoAssetCount
                          ? "Video scanning awaits privacy and provider approval"
                          : "Add a supported reference image before scanning"
                        : data.scannerMode === "tineye-commercial"
                          ? "Search the commercial provider using private reference copies"
                          : "Commercial scanning awaits provider activation"}
                  </span>
                </div>
                <span className="live">
                  <i></i>{" "}
                  {data.scannerMode === "tineye-commercial"
                    ? "LIVE"
                    : "WAITING"}
                </span>
              </button>
            </>
          )}
          {tab === "My content" && (
            <div className="matches-card">
              <div className="matches-head">
                <div>
                  <h2>Private reference vault</h2>
                  <p>
                    Encrypted files owned by this account
                    {data.entitlements.assetLimit
                      ? ` · ${data.assets.length} of ${data.entitlements.assetLimit} used`
                      : " · choose a plan to add files"}
                  </p>
                </div>
              </div>
              {data.assets.length ? (
                data.assets.map((a) => (
                  <div className="match-row asset-row" key={a.id}>
                    <div className="thumb mint">
                      <ShieldCheck />
                    </div>
                    <div className="source">
                      <b>{a.name}</b>
                      <span>
                        {a.mime} · {(a.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="confidence">
                      <b>Encrypted</b>
                      <span className="rights-state">
                        {a.rights
                          ? a.rights.status === "verified"
                            ? "Rights reviewed"
                            : "Rights declared"
                          : "Rights declaration missing"}
                      </span>
                    </div>
                    <div>
                      <span className="status removed">{a.status}</span>
                    </div>
                    <div className="asset-actions">
                      <button
                        title={
                          a.rights
                            ? "Replace rights declaration"
                            : "Add rights declaration"
                        }
                        onClick={() => {
                          setRightsAsset(a);
                          setRightsForm(
                            blankRightsDeclaration(
                              a.rights?.rightsHolderName || user?.name,
                            ),
                          );
                        }}
                      >
                        <FileCheck2 />
                      </button>
                      <button
                        title="Download original"
                        onClick={() => downloadAsset(a)}
                      >
                        <Download />
                      </button>
                      <button
                        title="Delete permanently"
                        onClick={() => deleteAsset(a)}
                      >
                        <X />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  No reference content yet. Choose “Add content” to test the
                  secure vault.
                </div>
              )}
            </div>
          )}
          {tab === "Takedowns" && (
            <div className="matches-card">
              <div className="matches-head">
                <div>
                  <h2>Takedown cases</h2>
                  <p>Every action requires creator approval</p>
                </div>
              </div>
              {data.cases.length ? (
                data.cases.map((c) => (
                  <div className="match-row" key={c.id}>
                    <div className="thumb blue">
                      <FileCheck2 />
                    </div>
                    <div className="source">
                      <b>{c.source}</b>
                      <span>
                        Case opened{" "}
                        {new Date(c.createdAt).toLocaleDateString("en-GB")}
                      </span>
                      {c.disputes?.some(
                        (dispute) => dispute.status === "open",
                      ) && (
                        <span>
                          Dispute received · follow-ups frozen for human review
                        </span>
                      )}
                    </div>
                    <div className="confidence">
                      <b>{c.mode === "sandbox" ? "Sandbox" : "Live"}</b>
                    </div>
                    <div>
                      <span className="status monitoring">{c.status}</span>
                    </div>
                    {c.status === "Awaiting creator approval" && (
                      <button
                        className="btn btn-primary"
                        onClick={() => approveCase(c.id)}
                      >
                        Review & approve
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  No cases yet. Open Matches and select a result to preserve
                  evidence.
                </div>
              )}
            </div>
          )}
          {tab === "Account" && (
            <AccountSettings
              user={user}
              subscription={data.subscription}
              billingMode={data.billingMode}
              onDeleted={onLogout}
            />
          )}
          {tab === "Help & safety" && <HelpSafety />}
          {tab === "Billing" ? (
            <div className="sandbox-plans">
              <div className="sandbox-note">
                <Zap />
                <div>
                  <b>
                    {data.billingMode === "stripe_live"
                      ? "Secure Stripe billing is active"
                      : data.billingMode === "stripe_test"
                        ? "Stripe test billing is active"
                        : "Billing activation is pending"}
                  </b>
                  <span>
                    {data.billingMode === "stripe_live"
                      ? "Subscriptions and payment details are handled by Stripe."
                      : data.billingMode === "stripe_test"
                        ? "Only Stripe test cards are accepted; no live charge is made."
                        : "Checkout is disabled until Stripe products, prices and webhook verification are configured."}
                  </span>
                </div>
              </div>
              <div className="mini-plans">
                {[
                  [
                    "Monitor",
                    "£19",
                    `${PLAN_ENTITLEMENTS.Monitor.assetLimit} files · scan every 30 days`,
                  ],
                  [
                    "Protect",
                    "£49",
                    `${PLAN_ENTITLEMENTS.Protect.assetLimit} files · daily scan + cases`,
                  ],
                  [
                    "Pro",
                    "£99",
                    `${PLAN_ENTITLEMENTS.Pro.assetLimit} files · daily scan + priority`,
                  ],
                ].map(([name, price, desc]) => (
                  <div
                    className={`mini-plan ${name === "Protect" ? "recommended" : ""}`}
                    key={name}
                  >
                    <span>
                      {name === "Protect" ? "RECOMMENDED" : "CREATOR PLAN"}
                    </span>
                    <h3>{name}</h3>
                    <strong>
                      {price}
                      <small>/mo</small>
                    </strong>
                    <p>{desc}</p>
                    <button
                      className="btn btn-primary"
                      disabled={data.billingMode === "unconfigured"}
                      onClick={() => selectPlan(name)}
                    >
                      {data.billingMode === "stripe_live"
                        ? "Choose plan"
                        : data.billingMode === "stripe_test"
                          ? "Test checkout"
                          : "Unavailable"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="matches-card">
              <div className="matches-head">
                <div>
                  <h2>
                    {tab === "Takedowns" ? "Takedown cases" : "Recent matches"}
                  </h2>
                  <p>
                    Potential unauthorized uses detected by visual similarity
                  </p>
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>All matches</option>
                  <option>Action needed</option>
                  <option>Monitoring</option>
                  <option>Case review</option>
                  <option>Your approval</option>
                  <option>Delivery pending</option>
                  <option>Reported</option>
                  <option>Removed</option>
                </select>
              </div>
              <div className="table-head">
                <span>FOUND CONTENT</span>
                <span>SOURCE</span>
                <span>MATCH SCORE</span>
                <span>STATUS</span>
                <span></span>
              </div>
              {!filtered.length && !loading && (
                <div className="empty-state">
                  No verified public matches yet. Add a reference image and run
                  a live scan after provider activation.
                </div>
              )}
              {filtered.map((m) => (
                <div className="match-row content-match-row" key={m.id}>
                  <div className={`thumb ${m.color}`}>
                    <div></div>
                    <span>{m.type === "Video" ? <Video /> : <Image />}</span>
                  </div>
                  <div className="source">
                    <b>{m.site}</b>
                    <span>
                      <Link2 /> Public page · {m.age}
                    </span>
                    <span className={m.pageCapture ? "capture-ok" : ""}>
                      <FileCheck2 />
                      {m.pageCapture
                        ? `Capture preserved · ${m.pageCapture.checksumSha256.slice(0, 10)}…`
                        : "Page capture required for a case"}
                    </span>
                  </div>
                  <div className="confidence">
                    <b>{m.matchScore}%</b>
                    <div>
                      <i style={{ width: m.matchScore + "%" }}></i>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`status ${m.status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <div className="match-actions">
                    <button
                      className="more"
                      title={
                        m.pageCapture
                          ? m.pageCaptureLocked
                            ? "Review the capture preserved in the case"
                            : "Review or replace page capture"
                          : "Add page capture"
                      }
                      onClick={() => openPageCapture(m)}
                    >
                      <FileCheck2 />
                    </button>
                    <button
                      className="more"
                      title="Create protected case"
                      onClick={() => createCase(m.id)}
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      {captureMatch && (
        <div className="modal-backdrop" onMouseDown={closePageCapture}>
          <div
            className="modal capture-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-x"
              aria-label="Close page-capture dialog"
              onClick={closePageCapture}
            >
              <X />
            </button>
            <div className="modal-icon">
              <FileCheck2 />
            </div>
            <h2>Preserve the matched page</h2>
            <p>
              Take a current screenshot that clearly shows the matched content
              and page context. It is encrypted and its integrity hash is bound
              to the case.
            </p>
            <div className="capture-target">
              <b>{captureMatch.site}</b>
              <span>{captureMatch.sourceUrl}</span>
              {captureMatch.pageCapture && (
                <small>
                  Existing SHA-256: {captureMatch.pageCapture.checksumSha256}
                </small>
              )}
            </div>
            {captureMatch.pageCapture && (
              <button
                className="btn btn-outline capture-download"
                onClick={() => downloadPageCapture(captureMatch)}
              >
                <Download /> Download preserved capture
              </button>
            )}
            {captureMatch.pageCaptureLocked ? (
              <div className="consent">
                <LockKeyhole />
                <span>
                  <b>Immutable case evidence</b>This capture is already bound to
                  a case and cannot be replaced.
                </span>
              </div>
            ) : (
              <>
                <label className="consent consent-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={pageCaptureConsent}
                    onChange={(event) =>
                      setPageCaptureConsent(event.target.checked)
                    }
                  />
                  <span>
                    <b>Explicit evidence-processing consent</b>I consent to
                    private processing of this screenshot as case evidence. It
                    may contain sensitive or special-category information.
                  </span>
                </label>
                <label className="consent consent-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={confirmTargetPage}
                    onChange={(event) =>
                      setConfirmTargetPage(event.target.checked)
                    }
                  />
                  <span>
                    <b>Target-page confirmation</b>This screenshot shows the
                    public URL identified above and the suspected copied
                    content.
                  </span>
                </label>
                <label className="consent consent-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={confirmUnaltered}
                    onChange={(event) =>
                      setConfirmUnaltered(event.target.checked)
                    }
                  />
                  <span>
                    <b>Accuracy confirmation</b>The relevant page and content
                    have not been manipulated; only unrelated material may have
                    been cropped out.
                  </span>
                </label>
                <label
                  className={`dropzone ${pageCaptureReady ? "" : "disabled"}`}
                >
                  <Upload />
                  <b>
                    {captureMatch.pageCapture
                      ? "Choose a replacement screenshot"
                      : "Choose a screenshot"}
                  </b>
                  <span>JPEG, PNG or WebP · maximum 8 MB</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!pageCaptureReady}
                    onChange={uploadPageCapture}
                  />
                </label>
              </>
            )}
            <div className="consent">
              <ShieldCheck />
              <span>
                <b>Evidence is not published</b>The original encrypted file and
                its SHA-256 checksum remain private. A trained operator must
                still review the live URL and the capture.
              </span>
            </div>
          </div>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(false)}>
          <div
            className="modal upload-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="modal-x"
              aria-label="Close upload dialog"
              onClick={() => setModal(false)}
            >
              <X />
            </button>
            <div className="modal-icon">
              <Upload />
            </div>
            <h2>Add reference content</h2>
            <p>
              Upload content you own so Content Protect can look for likely
              copies. Nothing is published.
            </p>
            <p>
              {data.assets.length} of {data.entitlements.assetLimit} plan files
              are currently used. Videos use a file slot and are not scanned
              until privacy and provider approval for minimized video frames is
              activated.
            </p>
            <div className="consent consent-checkbox">
              <input
                type="checkbox"
                checked={mediaConsent}
                onChange={(event) => setMediaConsent(event.target.checked)}
              />
              <span>
                <b>Explicit media-processing consent</b>I consent to Content
                Protect processing this file for private matching and case
                evidence. I understand it may reveal special-category
                information, including information about sex life or sexual
                orientation, and I can withdraw consent by deleting the file.
              </span>
            </div>
            <RightsDeclarationFields
              value={rightsForm}
              onChange={setRightsForm}
            />
            <label
              className={`dropzone ${mediaConsent && rightsDeclarationReady ? "" : "disabled"}`}
            >
              <Upload />
              <b>Choose a supported photo or short video</b>
              <span>
                JPEG, PNG, WebP, GIF, TIFF, HEIC/AVIF, MP4, MOV or WebM · 8 MB ·
                videos up to 10 minutes
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif,image/heic,video/mp4,video/quicktime,video/webm"
                disabled={!mediaConsent || !rightsDeclarationReady}
                onChange={uploadFile}
              />
            </label>
            <div className="consent">
              <ShieldCheck />
              <span>
                <b>Your privacy comes first</b>Files are validated and encrypted
                before storage. Provider scan copies are resized and stripped of
                EXIF/GPS metadata.
              </span>
            </div>
          </div>
        </div>
      )}
      {rightsAsset && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setRightsAsset(null)}
        >
          <form
            className="modal rights-modal"
            onSubmit={saveAssetRights}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-x"
              aria-label="Close rights declaration"
              onClick={() => setRightsAsset(null)}
            >
              <X />
            </button>
            <div className="modal-icon">
              <FileCheck2 />
            </div>
            <h2>Declare rights for this file</h2>
            <p>{rightsAsset.name}</p>
            <RightsDeclarationFields
              value={rightsForm}
              onChange={setRightsForm}
            />
            <button className="btn btn-primary rights-submit" type="submit">
              Record declaration
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Auth({ mode, setMode, onSuccess, onClose }) {
  const [form, setForm] = useState({
    name: "",
    stageName: "",
    email: "",
    password: "",
    mfaCode: "",
    ageConfirmed: false,
    rightsConfirmed: false,
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok && d.mfaRequired) setMfaRequired(true);
      if (!r.ok) throw Error(d.error);
      onSuccess(d.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form className="auth-modal" onSubmit={submit}>
        <button
          type="button"
          className="modal-x"
          aria-label="Close account dialog"
          onClick={onClose}
        >
          <X />
        </button>
        <Logo />
        <div className="auth-heading">
          <span>PRIVATE CREATOR PROTECTION</span>
          <h2>
            {mode === "register"
              ? "Create your secure workspace"
              : "Welcome back"}
          </h2>
          <p>
            {mode === "register"
              ? "Create your account free. Choose a protection plan after verification."
              : "Sign in to your protected workspace."}
          </p>
        </div>
        {mode === "register" && (
          <div className="field-row">
            <label>
              Full name
              <input
                required
                maxLength="100"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Stage name
              <input
                maxLength="100"
                value={form.stageName}
                onChange={(e) =>
                  setForm({ ...form, stageName: e.target.value })
                }
              />
            </label>
          </div>
        )}
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        {mode === "login" && mfaRequired && (
          <label>
            Authenticator or recovery code
            <input
              autoComplete="one-time-code"
              required
              maxLength="12"
              value={form.mfaCode}
              onChange={(e) => setForm({ ...form, mfaCode: e.target.value })}
              placeholder="123456 or XXXX-XXXX"
              autoFocus
            />
            <small>Open your authenticator app or use one recovery code.</small>
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "register" ? 10 : 1}
            maxLength="128"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <small>
            {mode === "register"
              ? "10–128 characters"
              : "Enter your account password"}
          </small>
        </label>
        {mode === "register" && (
          <div className="eligibility-checks">
            <label>
              <input
                type="checkbox"
                required
                checked={form.ageConfirmed}
                onChange={(e) =>
                  setForm({ ...form, ageConfirmed: e.target.checked })
                }
              />
              <span>I confirm that I am at least 18 years old.</span>
            </label>
            <label>
              <input
                type="checkbox"
                required
                checked={form.rightsConfirmed}
                onChange={(e) =>
                  setForm({ ...form, rightsConfirmed: e.target.checked })
                }
              />
              <span>
                I own or am authorised to protect the content I submit.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                required
                checked={form.termsAccepted}
                onChange={(e) =>
                  setForm({ ...form, termsAccepted: e.target.checked })
                }
              />
              <span>
                I accept the{" "}
                <a href="/terms.html" target="_blank">
                  Terms
                </a>{" "}
                and{" "}
                <a href="/privacy.html" target="_blank">
                  Privacy Notice
                </a>
                .
              </span>
            </label>
          </div>
        )}
        {mode === "login" && (
          <button
            className="forgot-link"
            type="button"
            onClick={() => setMode("forgot")}
          >
            Forgot your password?
          </button>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary auth-submit" disabled={busy}>
          {busy
            ? "Securing workspace…"
            : mode === "register"
              ? "Create protected account"
              : mfaRequired
                ? "Verify and log in"
                : "Log in securely"}{" "}
          <ArrowRight size={17} />
        </button>
        <div className="auth-switch">
          {mode === "register"
            ? "Already protected?"
            : "New to Content Protect?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "register" ? "login" : "register")}
          >
            {mode === "register" ? "Log in" : "Create an account"}
          </button>
        </div>
        <div className="auth-trust">
          <LockKeyhole /> Passwords are cryptographically protected. Sessions
          use secure HTTP-only cookies.
        </div>
      </form>
    </div>
  );
}

function ForgotPassword({ onBack, onClose }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Request failed.");
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form className="auth-modal" onSubmit={submit}>
        <button
          type="button"
          className="modal-x"
          aria-label="Close password recovery"
          onClick={onClose}
        >
          <X />
        </button>
        <Logo />
        <div className="auth-heading">
          <span>SECURE ACCOUNT RECOVERY</span>
          <h2>{sent ? "Check your email" : "Reset your password"}</h2>
          <p>
            {sent
              ? "If an account exists for that address, a secure link is on its way. It expires in 30 minutes."
              : "Enter the email address used for your protected workspace."}
          </p>
        </div>
        {sent ? (
          <div className="recovery-success">
            <CircleCheck />
            <div>
              <b>Request received</b>
              <span>
                For privacy, we do not confirm whether an address is registered.
              </span>
            </div>
          </div>
        ) : (
          <>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? "Sending secure link…" : "Send reset link"}{" "}
              <ArrowRight size={17} />
            </button>
          </>
        )}
        <button className="recovery-back" type="button" onClick={onBack}>
          Back to login
        </button>
        <div className="auth-trust">
          <LockKeyhole /> Reset links are single-use and expire after 30
          minutes.
        </div>
      </form>
    </div>
  );
}

function ResetPassword({ token, onDone, onClose }) {
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: form.password }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Password could not be reset.");
      history.replaceState({}, "", location.pathname);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <form className="auth-modal" onSubmit={submit}>
        <button
          type="button"
          className="modal-x"
          aria-label="Close password reset"
          onClick={onClose}
        >
          <X />
        </button>
        <Logo />
        <div className="auth-heading">
          <span>SECURE ACCOUNT RECOVERY</span>
          <h2>Choose a new password</h2>
          <p>Use a unique password you do not use on creator platforms.</p>
        </div>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength="10"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <small>At least 10 characters</small>
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength="10"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? "Updating password…" : "Set new password"}{" "}
          <ArrowRight size={17} />
        </button>
        <div className="auth-trust">
          <LockKeyhole /> Completing this reset signs out all existing sessions.
        </div>
      </form>
    </div>
  );
}

function Onboarding({ user, onDone }) {
  const [stage, setStage] = useState(1);
  const [aliases, setAliases] = useState("");
  const [platforms, setPlatforms] = useState("");
  const finish = async () => {
    const r = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageName: user.stageName,
        aliases: aliases
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        platforms: platforms
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        onboardingComplete: true,
      }),
    });
    const d = await r.json();
    onDone(d.user);
  };
  return (
    <div className="modal-backdrop">
      <div className="auth-modal onboarding">
        <div className="onboarding-progress">
          <i style={{ width: `${stage * 33.33}%` }} />
        </div>
        <Logo />
        <div className="auth-heading">
          <span>STEP {stage} OF 3</span>
          <h2>
            {stage === 1
              ? "Build your identity shield"
              : stage === 2
                ? "Connect your public presence"
                : "Protection rules"}
          </h2>
          <p>
            {stage === 1
              ? "Add public aliases that could be used to find impersonations."
              : stage === 2
                ? "Only enter public profile URLs—never passwords."
                : "Content Protect starts safely, with your approval required."}
          </p>
        </div>
        {stage === 1 && (
          <label>
            Stage names and aliases
            <input
              placeholder="NameOne, NameTwo"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
            />
            <small>Separate names with commas</small>
          </label>
        )}
        {stage === 2 && (
          <label>
            Public creator profile URLs
            <input
              placeholder="https://… , https://…"
              value={platforms}
              onChange={(e) => setPlatforms(e.target.value)}
            />
            <small>We never request passwords for creator platforms</small>
          </label>
        )}
        {stage === 3 && (
          <div className="rule-list">
            <div>
              <ShieldCheck />
              <span>
                <b>Creator approval required</b>No notice is sent before you
                approve the evidence.
              </span>
            </div>
            <div>
              <LockKeyhole />
              <span>
                <b>Private reference vault</b>Your source content remains
                encrypted and private.
              </span>
            </div>
            <div>
              <Eye />
              <span>
                <b>Transparent provider status</b>Unavailable services are
                clearly identified and never replaced with simulated results.
              </span>
            </div>
          </div>
        )}
        <button
          className="btn btn-primary auth-submit"
          onClick={() => (stage < 3 ? setStage(stage + 1) : finish())}
        >
          {stage < 3 ? "Continue" : "Activate protected workspace"}{" "}
          <ArrowRight size={17} />
        </button>
        {stage > 1 && (
          <button
            className="onboarding-back"
            onClick={() => setStage(stage - 1)}
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}

const incidentDateTimeValue = (value = new Date()) =>
  new Date(value).toISOString().slice(0, 16);

function IncidentRegister({ active, setGlobalError }) {
  const [incidents, setIncidents] = useState([]);
  const [showDeclare, setShowDeclare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forms, setForms] = useState({});
  const [declaration, setDeclaration] = useState({
    severity: "SEV-1",
    personalDataStatus: "assessing",
    occurredAt: incidentDateTimeValue(),
    awareAt: incidentDateTimeValue(),
    roles: {
      incidentCommander: "",
      securityLead: "",
      privacyLead: "",
      communicationsLead: "",
    },
  });
  const load = async () => {
    const response = await fetch("/api/operator/incidents");
    if (response.ok) setIncidents((await response.json()).incidents || []);
  };
  useEffect(() => {
    if (active) load();
  }, [active]);
  const setAction = (id, section, values) =>
    setForms((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        [section]: { ...(current[id]?.[section] || {}), ...values },
      },
    }));
  const request = async (url, body) => {
    setBusy(true);
    setGlobalError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setGlobalError(
          result.error || "The incident record could not be updated.",
        );
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };
  const declare = async (event) => {
    event.preventDefault();
    if (await request("/api/operator/incidents", declaration))
      setShowDeclare(false);
  };
  if (!active) return null;
  return (
    <section className="operator-incidents">
      <div className="operator-heading">
        <div>
          <p>UK BREACH RESPONSE</p>
          <h1>Security incident register</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowDeclare(!showDeclare)}
        >
          <Plus size={16} /> Declare incident
        </button>
      </div>
      <div className="incident-guidance">
        <ShieldCheck />
        <span>
          Record times in UTC. Never paste intimate media, passwords, keys or
          identity documents here; preserve them only in the restricted evidence
          location.
        </span>
      </div>
      {showDeclare && (
        <form className="incident-declare" onSubmit={declare}>
          <h2>Declare a security incident</h2>
          <div className="incident-grid">
            <label>
              Severity
              <select
                value={declaration.severity}
                onChange={(e) =>
                  setDeclaration({ ...declaration, severity: e.target.value })
                }
              >
                <option>SEV-1</option>
                <option>SEV-2</option>
                <option>SEV-3</option>
              </select>
            </label>
            <label>
              Occurred (UTC)
              <input
                type="datetime-local"
                value={declaration.occurredAt}
                onChange={(e) =>
                  setDeclaration({ ...declaration, occurredAt: e.target.value })
                }
                required
              />
            </label>
            <label className="incident-wide">
              Short title
              <input
                value={declaration.title || ""}
                onChange={(e) =>
                  setDeclaration({ ...declaration, title: e.target.value })
                }
                minLength={8}
                maxLength={120}
                required
              />
            </label>
            <label className="incident-wide">
              Factual summary — no raw sensitive material
              <textarea
                value={declaration.summary || ""}
                onChange={(e) =>
                  setDeclaration({ ...declaration, summary: e.target.value })
                }
                minLength={20}
                maxLength={2000}
                required
              />
            </label>
            <label>
              Affected systems
              <input
                value={declaration.systems || ""}
                onChange={(e) =>
                  setDeclaration({ ...declaration, systems: e.target.value })
                }
                required
              />
            </label>
            <label>
              Data categories
              <input
                value={declaration.dataCategories || ""}
                onChange={(e) =>
                  setDeclaration({
                    ...declaration,
                    dataCategories: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Approximate people
              <input
                type="number"
                min="0"
                value={declaration.approximateSubjects || ""}
                onChange={(e) =>
                  setDeclaration({
                    ...declaration,
                    approximateSubjects: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Personal-data assessment
              <select
                value={declaration.personalDataStatus}
                onChange={(e) =>
                  setDeclaration({
                    ...declaration,
                    personalDataStatus: e.target.value,
                  })
                }
              >
                <option value="assessing">Assessment in progress</option>
                <option value="not-a-breach">Not a breach</option>
                <option value="personal-data-breach">Breach identified</option>
              </select>
            </label>
            {declaration.personalDataStatus === "personal-data-breach" && (
              <label>
                Company became aware (UTC)
                <input
                  type="datetime-local"
                  value={declaration.awareAt}
                  onChange={(e) =>
                    setDeclaration({ ...declaration, awareAt: e.target.value })
                  }
                  required
                />
              </label>
            )}
            {[
              ["incidentCommander", "Incident Commander"],
              ["securityLead", "Security Lead"],
              ["privacyLead", "Privacy Lead"],
              ["communicationsLead", "Communications Lead"],
            ].map(([key, text]) => (
              <label key={key}>
                {text}
                <input
                  value={declaration.roles[key]}
                  onChange={(e) =>
                    setDeclaration({
                      ...declaration,
                      roles: { ...declaration.roles, [key]: e.target.value },
                    })
                  }
                  required
                />
              </label>
            ))}
            <label>
              Authenticator code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                value={declaration.mfaCode || ""}
                onChange={(e) =>
                  setDeclaration({ ...declaration, mfaCode: e.target.value })
                }
                required
              />
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            Declare and start response clock
          </button>
        </form>
      )}
      {incidents.length ? (
        incidents.map((incident) => {
          const action = forms[incident.id] || {},
            timeline = action.timeline || {},
            assessment = action.assessment || {},
            notifications = action.notifications || {},
            closure = action.closure || {};
          return (
            <article
              className={`incident-card incident-${incident.urgency?.state}`}
              key={incident.id}
            >
              <div className="incident-title">
                <div>
                  <small>
                    {incident.severity} · {incident.id}
                  </small>
                  <h2>{incident.title}</h2>
                  <span>
                    {incident.status} · {incident.personalDataStatus}
                  </span>
                </div>
                {incident.icoDeadlineAt && incident.status !== "closed" && (
                  <div className="incident-clock">
                    <Clock3 />
                    <b>
                      {incident.urgency?.hoursRemaining < 0
                        ? `${Math.abs(incident.urgency.hoursRemaining)}h overdue`
                        : `${incident.urgency?.hoursRemaining}h remaining`}
                    </b>
                    <span>
                      ICO deadline{" "}
                      {new Date(incident.icoDeadlineAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              <p className="incident-summary">{incident.summary}</p>
              <dl className="incident-facts">
                <div>
                  <dt>Systems</dt>
                  <dd>{incident.systems}</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{incident.dataCategories || "Not established"}</dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{incident.approximateSubjects ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>ICO</dt>
                  <dd>{incident.icoDecision}</dd>
                </div>
                <div>
                  <dt>Affected people</dt>
                  <dd>{incident.subjectsDecision}</dd>
                </div>
              </dl>
              <div className="incident-timeline">
                <h3>UTC response timeline</h3>
                {(incident.events || []).map((item) => (
                  <div key={item.id}>
                    <b>{item.type}</b>
                    <span>{item.note}</span>
                    <small>
                      {new Date(item.at).toISOString()} · {item.actorReference}
                    </small>
                  </div>
                ))}
              </div>
              {incident.status !== "closed" && (
                <div className="incident-actions">
                  <details>
                    <summary>Add response event</summary>
                    <div className="incident-grid">
                      <label>
                        Event type
                        <select
                          value={timeline.type || "assessment"}
                          onChange={(e) =>
                            setAction(incident.id, "timeline", {
                              type: e.target.value,
                            })
                          }
                        >
                          <option value="assessment">Assessment</option>
                          <option value="containment">Containment</option>
                          <option value="evidence-preserved">
                            Evidence preserved
                          </option>
                          <option value="processor-contacted">
                            Processor contacted
                          </option>
                          <option value="recovery">Recovery</option>
                          <option value="communication">Communication</option>
                          <option value="corrective-action">
                            Corrective action
                          </option>
                        </select>
                      </label>
                      <label className="incident-wide">
                        Factual note
                        <textarea
                          value={timeline.note || ""}
                          onChange={(e) =>
                            setAction(incident.id, "timeline", {
                              note: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() =>
                        request(
                          `/api/operator/incidents/${incident.id}/events`,
                          timeline,
                        )
                      }
                    >
                      Record event
                    </button>
                  </details>
                  <details>
                    <summary>Record personal-data assessment</summary>
                    <div className="incident-grid">
                      <label>
                        Assessment
                        <select
                          value={
                            assessment.personalDataStatus ||
                            incident.personalDataStatus
                          }
                          onChange={(e) =>
                            setAction(incident.id, "assessment", {
                              personalDataStatus: e.target.value,
                            })
                          }
                        >
                          <option value="assessing">
                            Assessment in progress
                          </option>
                          <option value="not-a-breach">Not a breach</option>
                          <option value="personal-data-breach">
                            Breach identified
                          </option>
                        </select>
                      </label>
                      <label>
                        Awareness time (UTC)
                        <input
                          type="datetime-local"
                          value={
                            assessment.awareAt ||
                            incidentDateTimeValue(
                              incident.awareAt || new Date(),
                            )
                          }
                          onChange={(e) =>
                            setAction(incident.id, "assessment", {
                              awareAt: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="incident-wide">
                        Assessment rationale
                        <textarea
                          value={assessment.assessmentNote || ""}
                          onChange={(e) =>
                            setAction(incident.id, "assessment", {
                              assessmentNote: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        New authenticator code
                        <input
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          value={assessment.mfaCode || ""}
                          onChange={(e) =>
                            setAction(incident.id, "assessment", {
                              mfaCode: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() =>
                        request(
                          `/api/operator/incidents/${incident.id}/assessment`,
                          {
                            ...assessment,
                            personalDataStatus:
                              assessment.personalDataStatus ||
                              incident.personalDataStatus,
                            awareAt: assessment.awareAt || incident.awareAt,
                          },
                        )
                      }
                    >
                      Record assessment
                    </button>
                  </details>
                  <details>
                    <summary>Record notification decisions</summary>
                    <div className="incident-grid">
                      {[
                        ["ico", "ICO"],
                        ["subjects", "Affected people"],
                      ].map(([key, text]) => (
                        <React.Fragment key={key}>
                          <label>
                            {text} decision
                            <select
                              value={
                                notifications[`${key}Decision`] ||
                                incident[`${key}Decision`]
                              }
                              onChange={(e) =>
                                setAction(incident.id, "notifications", {
                                  [`${key}Decision`]: e.target.value,
                                })
                              }
                            >
                              <option value="pending">Pending</option>
                              <option value="required">
                                Required — not sent
                              </option>
                              <option value="not-required">Not required</option>
                              <option value="completed">Completed</option>
                            </select>
                          </label>
                          <label>
                            {text} rationale
                            <input
                              value={
                                notifications[`${key}DecisionRationale`] || ""
                              }
                              onChange={(e) =>
                                setAction(incident.id, "notifications", {
                                  [`${key}DecisionRationale`]: e.target.value,
                                })
                              }
                            />
                          </label>
                          {(notifications[`${key}Decision`] ||
                            incident[`${key}Decision`]) === "completed" && (
                            <label>
                              {text} notified at
                              <input
                                type="datetime-local"
                                value={
                                  notifications[`${key}NotifiedAt`] ||
                                  incidentDateTimeValue()
                                }
                                onChange={(e) =>
                                  setAction(incident.id, "notifications", {
                                    [`${key}NotifiedAt`]: e.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                        </React.Fragment>
                      ))}
                      {(notifications.icoDecision || incident.icoDecision) ===
                        "completed" && (
                        <label>
                          ICO reference
                          <input
                            value={notifications.icoReference || ""}
                            onChange={(e) =>
                              setAction(incident.id, "notifications", {
                                icoReference: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      <label>
                        New authenticator code
                        <input
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          value={notifications.mfaCode || ""}
                          onChange={(e) =>
                            setAction(incident.id, "notifications", {
                              mfaCode: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() =>
                        request(
                          `/api/operator/incidents/${incident.id}/notifications`,
                          {
                            ...notifications,
                            icoDecision:
                              notifications.icoDecision || incident.icoDecision,
                            subjectsDecision:
                              notifications.subjectsDecision ||
                              incident.subjectsDecision,
                          },
                        )
                      }
                    >
                      Record decisions
                    </button>
                  </details>
                  <details>
                    <summary>Close after independent review</summary>
                    <div className="incident-grid">
                      <label className="incident-wide">
                        Root cause
                        <textarea
                          value={closure.rootCause || ""}
                          onChange={(e) =>
                            setAction(incident.id, "closure", {
                              rootCause: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="incident-wide">
                        Corrective actions, owners and deadlines
                        <textarea
                          value={closure.correctiveActions || ""}
                          onChange={(e) =>
                            setAction(incident.id, "closure", {
                              correctiveActions: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Closure review reference
                        <input
                          value={closure.closureReviewReference || ""}
                          onChange={(e) =>
                            setAction(incident.id, "closure", {
                              closureReviewReference: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        New authenticator code
                        <input
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          value={closure.mfaCode || ""}
                          onChange={(e) =>
                            setAction(incident.id, "closure", {
                              mfaCode: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Close this incident after independent review?",
                        ) &&
                        request(
                          `/api/operator/incidents/${incident.id}/close`,
                          closure,
                        )
                      }
                    >
                      Close incident
                    </button>
                  </details>
                </div>
              )}
            </article>
          );
        })
      ) : (
        <div className="operator-empty">
          <CircleCheck />
          <h2>No incidents recorded</h2>
          <p>The encrypted register is ready for immediate use.</p>
        </div>
      )}
    </section>
  );
}

function OperatorConsole() {
  const [ready, setReady] = useState(false);
  const [operatorView, setOperatorView] = useState("cases");
  const [token, setToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [error, setError] = useState("");
  const [cases, setCases] = useState([]);
  const [forms, setForms] = useState({});
  const [disputeDetails, setDisputeDetails] = useState({});
  const [disputeForms, setDisputeForms] = useState({});
  const [consumerCases, setConsumerCases] = useState([]);
  const [consumerDetails, setConsumerDetails] = useState({});
  const [consumerForms, setConsumerForms] = useState({});
  const loadCases = async () => {
    const response = await fetch("/api/operator/cases");
    if (!response.ok) {
      setReady(false);
      return;
    }
    setCases((await response.json()).cases || []);
    setReady(true);
  };
  const loadConsumerCases = async () => {
    const response = await fetch("/api/operator/consumer-cases");
    if (!response.ok) {
      setReady(false);
      return;
    }
    setConsumerCases((await response.json()).cases || []);
    setReady(true);
  };
  useEffect(() => {
    fetch("/api/operator/me").then(async (response) => {
      if (response.ok) {
        const result = await response.json();
        setOperatorId(result.operatorId || "operator");
        await Promise.all([loadCases(), loadConsumerCases()]);
      } else setReady(false);
    });
  }, []);
  const login = async (event) => {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/operator/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, mfaCode }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Access denied.");
      return;
    }
    setToken("");
    setMfaCode("");
    setOperatorId(result.operatorId || "operator");
    await Promise.all([loadCases(), loadConsumerCases()]);
  };
  const accessConsumerCase = async (item) => {
    if (
      !confirm(
        "Open this encrypted customer request only if necessary for the current review?",
      )
    )
      return;
    const code = prompt(
      "Enter a current authenticator code. Use a new code for any decision.",
    );
    if (!/^\d{6}$/.test(String(code || "").replace(/\s/g, ""))) {
      setError("A current six-digit authenticator code is required.");
      return;
    }
    const response = await fetch(
        `/api/operator/consumer-cases/${item.id}/access`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            confirmNeedToReview: true,
            mfaCode: String(code).replace(/\s/g, ""),
          }),
        },
      ),
      result = await response.json();
    if (!response.ok) {
      setError(result.error || "The customer request could not be opened.");
      return;
    }
    setError("");
    setConsumerDetails({ ...consumerDetails, [item.id]: result.case });
  };
  const applyConsumerAction = async (item) => {
    const form = consumerForms[item.id] || {};
    if (
      !form.action ||
      String(form.note || "").trim().length < 10 ||
      !/^\d{6}$/.test(String(form.mfaCode || "").replace(/\s/g, ""))
    ) {
      setError(
        "Choose an action, add a meaningful note and enter a new authenticator code.",
      );
      return;
    }
    const stripeRefund = form.action === "stripe-refund";
    if (
      stripeRefund &&
      (form.confirmRefundExecution !== true ||
        (!["pending", "requires-action"].includes(item.refundProviderStatus) &&
          !/^pi_[A-Za-z0-9]+$/.test(String(form.paymentIntentReference || ""))))
    ) {
      setError(
        "Confirm the Stripe action and enter the customer payment intent beginning pi_.",
      );
      return;
    }
    if (
      stripeRefund &&
      item.refundProviderStatus === "legacy-recorded" &&
      !/^re_[A-Za-z0-9]+$/.test(String(form.legacyRefundReference || ""))
    ) {
      setError(
        "Enter the historical Stripe refund reference beginning re_ so it can be verified, not repeated.",
      );
      return;
    }
    if (
      stripeRefund &&
      ["failed", "canceled"].includes(item.refundProviderStatus) &&
      form.confirmRetryFailed !== true
    ) {
      setError("Explicitly confirm creation of a new refund attempt.");
      return;
    }
    if (
      !confirm(
        stripeRefund
          ? item.refundProviderStatus === "legacy-recorded"
            ? `Verify the historical £${(
                Number(item.refundAmountPence || 0) / 100
              ).toFixed(
                2,
              )} refund against Stripe? No new refund will be created.`
            : `Send or reconcile the approved £${(
                Number(item.refundAmountPence || 0) / 100
              ).toFixed(
                2,
              )} refund with Stripe? A new refund is an external financial action.`
          : "Record this customer-case action?",
      )
    )
      return;
    const response = await fetch(
        `/api/operator/consumer-cases/${item.id}/${
          stripeRefund ? "refund" : "actions"
        }`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...form,
            refundAmountPence: form.refundAmountPence
              ? Number(form.refundAmountPence)
              : undefined,
            mfaCode: String(form.mfaCode).replace(/\s/g, ""),
          }),
        },
      ),
      result = await response.json();
    if (!response.ok) {
      setError(result.error || "The customer-case action failed.");
      return;
    }
    setError("");
    setConsumerForms({ ...consumerForms, [item.id]: {} });
    setConsumerDetails({ ...consumerDetails, [item.id]: undefined });
    await loadConsumerCases();
  };
  const prepare = async (caseId) => {
    const form = forms[caseId] || {};
    if (
      !form.recipientEmail ||
      !form.recipientSource ||
      !form.jurisdiction ||
      !form.legalBasis ||
      !form.rightsReviewReference ||
      !form.rightsReviewed ||
      !form.pageCaptureReviewed ||
      !form.jurisdictionReviewed
    ) {
      setError(
        "Review the per-file rights declaration, preserved page capture, recipient, HTTPS source, jurisdiction and legal basis before preparation.",
      );
      return;
    }
    const response = await fetch(`/api/operator/cases/${caseId}/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        confirmRightsReviewed: true,
        confirmPageCaptureReviewed: true,
        confirmRecipientReviewed: true,
        confirmJurisdictionReviewed: true,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Notice preparation failed.");
      return;
    }
    setError("");
    await loadCases();
  };
  const downloadCaseCapture = async (item) => {
    if (
      !confirm(
        "Open this sensitive capture only if it is necessary for the current case review. Continue?",
      )
    )
      return;
    const code = prompt(
      "Enter a current authenticator code. This code cannot then be reused to send a notice.",
    );
    if (!/^\d{6}$/.test(String(code || "").replace(/\s/g, ""))) {
      setError("A current six-digit authenticator code is required.");
      return;
    }
    const response = await fetch(
      `/api/operator/cases/${item.id}/page-capture/download`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmEvidenceReview: true,
          mfaCode: String(code).replace(/\s/g, ""),
        }),
      },
    );
    if (!response.ok) {
      const result = await response.json();
      setError(result.error || "The page capture could not be downloaded.");
      return;
    }
    setError("");
    await saveDownload(response, `case-${item.id}-page-capture`);
  };
  const dispatch = async (caseId) => {
    const form = forms[caseId] || {},
      item = cases.find((candidate) => candidate.id === caseId);
    if (
      !form.noticeReviewed ||
      !form.jurisdictionReviewed ||
      !/^\d{6}$/.test(String(form.mfaCode || "").replace(/\s/g, ""))
    ) {
      setError(
        "Review the notice and jurisdiction, then enter a current authenticator code.",
      );
      return;
    }
    if (
      !confirm(
        `Send this legal notice to ${item?.recipientEmail}? This external action cannot be undone.`,
      )
    )
      return;
    const response = await fetch(`/api/operator/cases/${caseId}/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmNoticeReviewed: form.noticeReviewed === true,
        confirmJurisdictionReviewed: form.jurisdictionReviewed === true,
        noticeHash: item?.noticeHash,
        mfaCode: String(form.mfaCode || "").replace(/\s/g, ""),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Delivery failed.");
      return;
    }
    setError("");
    setForms({
      ...forms,
      [caseId]: { ...form, mfaCode: "" },
    });
    await loadCases();
  };
  const disputeKey = (caseId, disputeId) => `${caseId}:${disputeId}`;
  const accessDispute = async (item, dispute) => {
    if (
      !confirm(
        "Open the encrypted dispute only if it is necessary for this case review. Continue?",
      )
    )
      return;
    const code = prompt(
      "Enter a current authenticator code. A different new code will be required to record the outcome.",
    );
    if (!/^\d{6}$/.test(String(code || "").replace(/\s/g, ""))) {
      setError("A current six-digit authenticator code is required.");
      return;
    }
    const response = await fetch(
      `/api/operator/cases/${item.id}/disputes/${dispute.disputeId}/access`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmNeedToReview: true,
          mfaCode: String(code).replace(/\s/g, ""),
        }),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "The dispute evidence could not be opened.");
      return;
    }
    setError("");
    setDisputeDetails({
      ...disputeDetails,
      [disputeKey(item.id, dispute.disputeId)]: result.dispute,
    });
  };
  const reviewDispute = async (item, dispute) => {
    const key = disputeKey(item.id, dispute.disputeId),
      form = disputeForms[key] || {};
    if (
      !form.action ||
      !form.reviewNote ||
      !/^\d{6}$/.test(String(form.mfaCode || "").replace(/\s/g, ""))
    ) {
      setError(
        "Choose an outcome, enter the review note and use a new authenticator code.",
      );
      return;
    }
    if (
      !confirm(
        "Record this dispute outcome? Follow-ups remain frozen unless qualified counsel approved continuation.",
      )
    )
      return;
    const response = await fetch(
      `/api/operator/cases/${item.id}/disputes/${dispute.disputeId}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          confirmCaseClosure:
            form.action === "accept" && form.confirmCaseClosure === true,
          confirmCreatorNotified:
            ["accept", "continue"].includes(form.action) &&
            form.confirmCreatorNotified === true,
          confirmCounselApproval:
            form.action === "continue" && form.confirmCounselApproval === true,
          mfaCode: String(form.mfaCode).replace(/\s/g, ""),
        }),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "The dispute outcome could not be recorded.");
      return;
    }
    setError("");
    setDisputeDetails({ ...disputeDetails, [key]: undefined });
    setDisputeForms({ ...disputeForms, [key]: undefined });
    await loadCases();
  };
  const logout = async () => {
    await fetch("/api/operator/session", { method: "DELETE" });
    setReady(false);
    setOperatorId("");
    setCases([]);
    setDisputeDetails({});
    setDisputeForms({});
    setConsumerCases([]);
    setConsumerDetails({});
    setConsumerForms({});
    setOperatorView("cases");
  };
  if (!ready)
    return (
      <main className="operator-login">
        <form className="operator-login-card" onSubmit={login}>
          <Logo />
          <p>PRIVATE OPERATIONS</p>
          <h1>Operator access</h1>
          <span>
            Enter the dedicated takedown token and the current authenticator
            code. They are exchanged for a one-hour secure session; the token is
            not stored in the browser.
          </span>
          <label>
            Access token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              required
              minLength={32}
            />
          </label>
          <label>
            Authenticator code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              required
            />
          </label>
          {error && <div className="operator-error">{error}</div>}
          <button className="btn btn-primary" type="submit">
            Open review queue
          </button>
        </form>
      </main>
    );
  return (
    <main className="operator-console">
      <header>
        <div>
          <Logo />
          <span>Private operations · {operatorId}</span>
        </div>
        <nav className="operator-nav">
          <button
            className={operatorView === "cases" ? "active" : ""}
            onClick={() => setOperatorView("cases")}
          >
            Takedown queue
          </button>
          <button
            className={operatorView === "incidents" ? "active" : ""}
            onClick={() => setOperatorView("incidents")}
          >
            Incident register
          </button>
          <button
            className={operatorView === "consumer" ? "active" : ""}
            onClick={() => setOperatorView("consumer")}
          >
            Customer requests
          </button>
          <button className="btn btn-outline" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>
      {error && (
        <div className="operator-global-error operator-error">{error}</div>
      )}
      <IncidentRegister
        active={operatorView === "incidents"}
        setGlobalError={setError}
      />
      <section hidden={operatorView !== "consumer"}>
        <div className="operator-heading">
          <div>
            <p>ENCRYPTED SUPPORT WORKFLOW</p>
            <h1>Customer requests and refunds</h1>
          </div>
          <strong>
            {consumerCases.filter((item) => item.status !== "closed").length}{" "}
            open
          </strong>
        </div>
        {consumerCases.length ? (
          consumerCases.map((item) => {
            const detail = consumerDetails[item.id],
              form = consumerForms[item.id] || {},
              setForm = (next) =>
                setConsumerForms({
                  ...consumerForms,
                  [item.id]: { ...form, ...next },
                });
            return (
              <article className="operator-case" key={item.id}>
                <div className="operator-case-title">
                  <div>
                    <small>{item.reference}</small>
                    <h2>{item.category.replace(/-/g, " ")}</h2>
                  </div>
                  <span>
                    {item.priority} · {item.status.replace(/-/g, " ")}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Response target</dt>
                    <dd>{new Date(item.responseDueAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Resolution target</dt>
                    <dd>{new Date(item.resolutionDueAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Refund status</dt>
                    <dd>
                      {item.refundDecision} · {item.refundProviderStatus}
                    </dd>
                  </div>
                </dl>
                {(item.responseOverdue || item.resolutionOverdue) && (
                  <div className="operator-error">
                    Internal service target overdue — prioritise human review.
                  </div>
                )}
                {!detail ? (
                  <button
                    className="btn btn-outline"
                    onClick={() => accessConsumerCase(item)}
                  >
                    Open encrypted request
                  </button>
                ) : (
                  <div className="consumer-operator-detail">
                    <h3>{detail.subject}</h3>
                    <p>{detail.statement}</p>
                    {detail.desiredResolution && (
                      <p>
                        <b>Requested resolution:</b> {detail.desiredResolution}
                      </p>
                    )}
                    {detail.orderReference && (
                      <p>
                        <b>Order reference:</b> {detail.orderReference}
                      </p>
                    )}
                    {detail.refundProvider?.reference && (
                      <p>
                        <b>Stripe refund:</b> {detail.refundProvider.reference}{" "}
                        · {detail.refundProvider.status}
                      </p>
                    )}
                    <details>
                      <summary>
                        Restricted timeline ({detail.timeline.length})
                      </summary>
                      {detail.timeline.map((event) => (
                        <div className="consumer-timeline-event" key={event.id}>
                          <b>{event.type.replace(/-/g, " ")}</b>
                          <span>{new Date(event.at).toLocaleString()}</span>
                          <p>
                            {event.restricted.message ||
                              event.restricted.note ||
                              event.restricted.outcome ||
                              "Protected workflow event"}
                          </p>
                        </div>
                      ))}
                    </details>
                    {item.status !== "closed" && (
                      <div className="operator-fields consumer-action-fields">
                        <label>
                          Action
                          <select
                            value={form.action || ""}
                            onChange={(event) =>
                              setForm({ action: event.target.value })
                            }
                          >
                            <option value="">Choose…</option>
                            <option value="acknowledge">Acknowledge</option>
                            <option value="request-information">
                              Request information
                            </option>
                            <option value="refund-decision">
                              Record refund decision
                            </option>
                            {["approved", "partial"].includes(
                              item.refundDecision,
                            ) &&
                              item.refundProviderStatus !== "succeeded" && (
                                <option value="stripe-refund">
                                  Execute or reconcile Stripe refund
                                </option>
                              )}
                            <option value="resolve">Resolve</option>
                            <option value="close">Close</option>
                          </select>
                        </label>
                        <label>
                          Restricted operator note
                          <textarea
                            rows="3"
                            value={form.note || ""}
                            onChange={(event) =>
                              setForm({ note: event.target.value })
                            }
                          />
                        </label>
                        {form.action === "refund-decision" && (
                          <>
                            <label>
                              Decision
                              <select
                                value={form.refundDecision || ""}
                                onChange={(event) =>
                                  setForm({
                                    refundDecision: event.target.value,
                                  })
                                }
                              >
                                <option value="">Choose…</option>
                                <option value="approved">Approved</option>
                                <option value="partial">Partial</option>
                                <option value="declined">Declined</option>
                              </select>
                            </label>
                            <label>
                              Amount in pence
                              <input
                                type="number"
                                min="1"
                                value={form.refundAmountPence || ""}
                                onChange={(event) =>
                                  setForm({
                                    refundAmountPence: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Decision reference
                              <input
                                value={form.decisionReference || ""}
                                onChange={(event) =>
                                  setForm({
                                    decisionReference: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                        {form.action === "stripe-refund" && (
                          <>
                            {!["pending", "requires-action"].includes(
                              item.refundProviderStatus,
                            ) && (
                              <label>
                                Customer Stripe payment intent
                                <input
                                  placeholder="pi_…"
                                  value={form.paymentIntentReference || ""}
                                  onChange={(event) =>
                                    setForm({
                                      paymentIntentReference:
                                        event.target.value,
                                    })
                                  }
                                />
                              </label>
                            )}
                            {item.refundProviderStatus ===
                              "legacy-recorded" && (
                              <label>
                                Historical Stripe refund reference
                                <input
                                  placeholder="re_…"
                                  value={form.legacyRefundReference || ""}
                                  onChange={(event) =>
                                    setForm({
                                      legacyRefundReference: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            )}
                            <label className="operator-confirmation">
                              <input
                                type="checkbox"
                                checked={form.confirmRefundExecution === true}
                                onChange={(event) =>
                                  setForm({
                                    confirmRefundExecution:
                                      event.target.checked,
                                  })
                                }
                              />
                              <span>
                                I verified the customer, approved GBP amount and
                                irreversible Stripe action.
                              </span>
                            </label>
                            {["failed", "canceled"].includes(
                              item.refundProviderStatus,
                            ) && (
                              <label className="operator-confirmation">
                                <input
                                  type="checkbox"
                                  checked={form.confirmRetryFailed === true}
                                  onChange={(event) =>
                                    setForm({
                                      confirmRetryFailed: event.target.checked,
                                    })
                                  }
                                />
                                <span>
                                  I reviewed the failed/canceled refund and
                                  approve a new idempotent attempt.
                                </span>
                              </label>
                            )}
                          </>
                        )}
                        {form.action === "resolve" && (
                          <>
                            <label>
                              Outcome
                              <textarea
                                rows="3"
                                value={form.outcome || ""}
                                onChange={(event) =>
                                  setForm({ outcome: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Remedy
                              <input
                                value={form.remedy || ""}
                                onChange={(event) =>
                                  setForm({ remedy: event.target.value })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label>
                          New authenticator code
                          <input
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            value={form.mfaCode || ""}
                            onChange={(event) =>
                              setForm({ mfaCode: event.target.value })
                            }
                          />
                        </label>
                        <button
                          className="btn btn-primary"
                          onClick={() => applyConsumerAction(item)}
                        >
                          {form.action === "stripe-refund"
                            ? "Send / verify with Stripe"
                            : "Record action"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="operator-empty">
            <CircleCheck />
            <h2>No customer requests</h2>
            <p>The encrypted queue is ready.</p>
          </div>
        )}
      </section>
      <section hidden={operatorView !== "cases"}>
        <div className="operator-heading">
          <div>
            <p>HUMAN REVIEW REQUIRED</p>
            <h1>Notice and dispute review queue</h1>
          </div>
          <strong>{cases.length} pending</strong>
        </div>
        {cases.length ? (
          cases.map((item) => (
            <article className="operator-case" key={item.id}>
              <div className="operator-case-title">
                <div>
                  <small>CASE {item.id}</small>
                  <h2>{item.targetHost}</h2>
                </div>
                <span>{item.status}</span>
              </div>
              <dl>
                <div>
                  <dt>Claimant</dt>
                  <dd>{item.claimant?.stageName || item.claimant?.name}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>
                    <a href={item.targetUrl} target="_blank" rel="noreferrer">
                      Review URL
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Evidence hash</dt>
                  <dd className="operator-hash">{item.evidenceHash}</dd>
                </div>
                <div>
                  <dt>Preserved page capture</dt>
                  <dd>
                    {item.pageCapture ? (
                      <>
                        <span className="operator-hash">
                          {item.pageCapture.checksumSha256}
                        </span>
                        <button
                          className="operator-evidence-download"
                          onClick={() => downloadCaseCapture(item)}
                        >
                          <Download /> Review encrypted capture
                        </button>
                      </>
                    ) : (
                      "Missing"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Declared rights holder</dt>
                  <dd>
                    {item.rightsDeclaration?.rightsHolderName || "Missing"}
                  </dd>
                </div>
                <div>
                  <dt>Claimant capacity</dt>
                  <dd>{item.rightsDeclaration?.roleLabel || "Missing"}</dd>
                </div>
                <div>
                  <dt>Creator evidence reference</dt>
                  <dd>
                    {item.rightsDeclaration?.authorityEvidenceReference ||
                      "Missing"}
                  </dd>
                </div>
              </dl>
              {item.noticeText && (
                <div className="operator-notice">
                  <div>
                    <b>Exact notice to be sent</b>
                    <span>
                      Template {item.templateVersion} · SHA-256{" "}
                      {item.noticeHash}
                    </span>
                  </div>
                  <pre>{item.noticeText}</pre>
                </div>
              )}
              {item.disputes?.length > 0 && (
                <div className="operator-disputes">
                  <h3>Dispute review — follow-ups frozen</h3>
                  {item.disputes.map((dispute) => {
                    const key = disputeKey(item.id, dispute.disputeId),
                      detail = disputeDetails[key],
                      disputeForm = disputeForms[key] || {};
                    return (
                      <section className="operator-dispute" key={key}>
                        <div className="operator-dispute-summary">
                          <div>
                            <b>{dispute.category}</b>
                            <span>
                              {dispute.country} · {dispute.status} ·{" "}
                              {new Date(dispute.receivedAt).toLocaleString()}
                            </span>
                            <small>
                              Statement SHA-256: {dispute.statementChecksum}
                            </small>
                          </div>
                          {dispute.status === "open" && (
                            <button
                              className="operator-evidence-download"
                              onClick={() => accessDispute(item, dispute)}
                            >
                              <LockKeyhole /> Open with MFA
                            </button>
                          )}
                        </div>
                        {detail && dispute.status === "open" && (
                          <div className="operator-dispute-detail">
                            <dl>
                              <div>
                                <dt>Safe contact</dt>
                                <dd>{detail.contactEmail}</dd>
                              </div>
                              <div>
                                <dt>Reported URL</dt>
                                <dd>
                                  <a
                                    href={detail.reportedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open reported URL
                                  </a>
                                </dd>
                              </div>
                              <div>
                                <dt>Supporting URL</dt>
                                <dd>
                                  {detail.supportingUrl ? (
                                    <a
                                      href={detail.supportingUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open public support
                                    </a>
                                  ) : (
                                    "None"
                                  )}
                                </dd>
                              </div>
                            </dl>
                            <p>{detail.statement}</p>
                            <div className="operator-dispute-fields">
                              <label>
                                Outcome
                                <select
                                  value={disputeForm.action || ""}
                                  onChange={(event) =>
                                    setDisputeForms({
                                      ...disputeForms,
                                      [key]: {
                                        ...disputeForm,
                                        action: event.target.value,
                                      },
                                    })
                                  }
                                >
                                  <option value="">Choose outcome</option>
                                  <option value="escalate">
                                    Keep frozen — escalate to counsel
                                  </option>
                                  <option value="accept">
                                    Accept dispute and close case
                                  </option>
                                  <option value="continue">
                                    Counsel-approved continuation
                                  </option>
                                </select>
                              </label>
                              <label>
                                Review note (20–1,000 characters)
                                <textarea
                                  maxLength={1000}
                                  value={disputeForm.reviewNote || ""}
                                  onChange={(event) =>
                                    setDisputeForms({
                                      ...disputeForms,
                                      [key]: {
                                        ...disputeForm,
                                        reviewNote: event.target.value,
                                      },
                                    })
                                  }
                                />
                              </label>
                              {disputeForm.action === "continue" && (
                                <label>
                                  Qualified-counsel approval reference
                                  <input
                                    value={disputeForm.counselReference || ""}
                                    onChange={(event) =>
                                      setDisputeForms({
                                        ...disputeForms,
                                        [key]: {
                                          ...disputeForm,
                                          counselReference: event.target.value,
                                        },
                                      })
                                    }
                                  />
                                </label>
                              )}
                              <label>
                                New authenticator code
                                <input
                                  inputMode="numeric"
                                  autoComplete="one-time-code"
                                  pattern="[0-9]{6}"
                                  value={disputeForm.mfaCode || ""}
                                  onChange={(event) =>
                                    setDisputeForms({
                                      ...disputeForms,
                                      [key]: {
                                        ...disputeForm,
                                        mfaCode: event.target.value,
                                      },
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <div className="operator-checks">
                              {disputeForm.action === "accept" && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={
                                      disputeForm.confirmCaseClosure || false
                                    }
                                    onChange={(event) =>
                                      setDisputeForms({
                                        ...disputeForms,
                                        [key]: {
                                          ...disputeForm,
                                          confirmCaseClosure:
                                            event.target.checked,
                                        },
                                      })
                                    }
                                  />
                                  I confirm this case must close after accepting
                                  the dispute.
                                </label>
                              )}
                              {["accept", "continue"].includes(
                                disputeForm.action,
                              ) && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={
                                      disputeForm.confirmCreatorNotified ||
                                      false
                                    }
                                    onChange={(event) =>
                                      setDisputeForms({
                                        ...disputeForms,
                                        [key]: {
                                          ...disputeForm,
                                          confirmCreatorNotified:
                                            event.target.checked,
                                        },
                                      })
                                    }
                                  />
                                  I notified the creator of this outcome.
                                </label>
                              )}
                              {disputeForm.action === "continue" && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={
                                      disputeForm.confirmCounselApproval ||
                                      false
                                    }
                                    onChange={(event) =>
                                      setDisputeForms({
                                        ...disputeForms,
                                        [key]: {
                                          ...disputeForm,
                                          confirmCounselApproval:
                                            event.target.checked,
                                        },
                                      })
                                    }
                                  />
                                  Qualified counsel approved continuation under
                                  the recorded reference.
                                </label>
                              )}
                            </div>
                            <button
                              className="btn btn-primary"
                              onClick={() => reviewDispute(item, dispute)}
                            >
                              Record dispute outcome
                            </button>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
              {item.status === "Awaiting operator preparation" && (
                <div className="operator-fields">
                  <label>
                    Restricted rights-review record reference
                    <input
                      type="text"
                      placeholder="restricted-case-file-…"
                      value={forms[item.id]?.rightsReviewReference || ""}
                      onChange={(event) =>
                        setForms({
                          ...forms,
                          [item.id]: {
                            ...forms[item.id],
                            rightsReviewReference: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Verified recipient email
                    <input
                      type="email"
                      value={forms[item.id]?.recipientEmail || ""}
                      onChange={(event) =>
                        setForms({
                          ...forms,
                          [item.id]: {
                            ...forms[item.id],
                            recipientEmail: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    HTTPS source proving recipient
                    <input
                      type="url"
                      placeholder="https://…"
                      value={forms[item.id]?.recipientSource || ""}
                      onChange={(event) =>
                        setForms({
                          ...forms,
                          [item.id]: {
                            ...forms[item.id],
                            recipientSource: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Jurisdiction/channel
                    <input
                      type="text"
                      value={forms[item.id]?.jurisdiction || ""}
                      onChange={(event) =>
                        setForms({
                          ...forms,
                          [item.id]: {
                            ...forms[item.id],
                            jurisdiction: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Legal basis/platform policy
                    <input
                      type="text"
                      value={forms[item.id]?.legalBasis || ""}
                      onChange={(event) =>
                        setForms({
                          ...forms,
                          [item.id]: {
                            ...forms[item.id],
                            legalBasis: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <div className="operator-checks">
                {item.status === "Awaiting operator preparation" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={forms[item.id]?.rightsReviewed || false}
                        onChange={(event) =>
                          setForms({
                            ...forms,
                            [item.id]: {
                              ...forms[item.id],
                              rightsReviewed: event.target.checked,
                            },
                          })
                        }
                      />
                      I reviewed the per-file ownership/authority declaration
                      and its restricted supporting record.
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={forms[item.id]?.pageCaptureReviewed || false}
                        onChange={(event) =>
                          setForms({
                            ...forms,
                            [item.id]: {
                              ...forms[item.id],
                              pageCaptureReviewed: event.target.checked,
                            },
                          })
                        }
                      />
                      I reviewed the preserved page capture, its live URL and
                      SHA-256 integrity binding.
                    </label>
                  </>
                )}
                {item.status === "Approved — delivery pending" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={forms[item.id]?.noticeReviewed || false}
                        onChange={(event) =>
                          setForms({
                            ...forms,
                            [item.id]: {
                              ...forms[item.id],
                              noticeReviewed: event.target.checked,
                            },
                          })
                        }
                      />
                      I reviewed the exact creator-approved notice and evidence
                      hash.
                    </label>
                    <label className="operator-step-up">
                      Current authenticator code (required again to send)
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        value={forms[item.id]?.mfaCode || ""}
                        onChange={(event) =>
                          setForms({
                            ...forms,
                            [item.id]: {
                              ...forms[item.id],
                              mfaCode: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}
                {[
                  "Awaiting operator preparation",
                  "Approved — delivery pending",
                ].includes(item.status) && (
                  <label>
                    <input
                      type="checkbox"
                      checked={forms[item.id]?.jurisdictionReviewed || false}
                      onChange={(event) =>
                        setForms({
                          ...forms,
                          [item.id]: {
                            ...forms[item.id],
                            jurisdictionReviewed: event.target.checked,
                          },
                        })
                      }
                    />
                    I verified the recipient and appropriate
                    jurisdiction/channel.
                  </label>
                )}
              </div>
              {item.status === "Awaiting operator preparation" && (
                <button
                  className="btn btn-primary"
                  onClick={() => prepare(item.id)}
                >
                  Prepare for creator approval
                </button>
              )}
              {item.status === "Approved — delivery pending" && (
                <button
                  className="btn btn-primary"
                  onClick={() => dispatch(item.id)}
                >
                  Review confirmation & send
                </button>
              )}
            </article>
          ))
        ) : (
          <div className="operator-empty">
            <CircleCheck />
            <h2>Queue clear</h2>
            <p>No creator-approved notices are waiting for review.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function App() {
  const operatorPath = location.pathname === "/operator";
  const query = new URLSearchParams(location.search);
  const resetToken = query.get("reset");
  const verifyToken = query.get("verify");
  const [view, setView] = useState("loading");
  const [auth, setAuth] = useState(resetToken ? "reset" : null);
  const [user, setUser] = useState(null);
  useEffect(() => {
    const boot = async () => {
      if (operatorPath) return;
      try {
        if (verifyToken) {
          const verification = await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: verifyToken }),
          });
          const result = await verification.json();
          history.replaceState({}, "", location.pathname);
          alert(
            verification.ok
              ? "Email verified successfully."
              : result.error || "Verification failed.",
          );
        }
        const me = await fetch("/api/me");
        let u = me.ok ? (await me.json()).user : null;
        if (u && !resetToken) {
          const q = new URLSearchParams(location.search),
            sessionId = q.get("session_id");
          const ageSessionId = q.get("sessionId") || q.get("sessionID");
          if (q.get("age_check") === "return" && ageSessionId) {
            let r, d;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              r = await fetch("/api/verification/age/complete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: ageSessionId }),
              });
              d = await r.json();
              if (r.status !== 202 || attempt === 2) break;
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }
            history.replaceState({}, "", location.pathname);
            if (r.ok) {
              if (d.verified) {
                u = d.user;
                alert("Your 18+ age check was verified successfully.");
              } else
                alert(
                  "Your age check is still processing. Please try again shortly.",
                );
            } else alert(d.error || "Age verification was not completed.");
          } else if (q.get("age_check") === "cancelled") {
            history.replaceState({}, "", location.pathname);
            alert("Age verification was cancelled. No result was stored.");
          } else if (q.get("checkout") === "success" && sessionId) {
            const r = await fetch(
                `/api/billing/session?session_id=${encodeURIComponent(sessionId)}`,
              ),
              d = await r.json();
            if (r.ok) {
              u = d.user;
              history.replaceState({}, "", location.pathname);
              alert(`Subscription confirmed: ${d.subscription.plan}.`);
            }
          } else if (q.get("checkout") === "cancelled") {
            history.replaceState({}, "", location.pathname);
            alert("Checkout cancelled. No payment was taken.");
          }
          setUser(u);
          setView("dashboard");
        } else setView("landing");
      } catch {
        setView("landing");
      }
    };
    boot();
  }, []);
  const success = (u) => {
    setUser(u);
    setAuth(null);
    setView("dashboard");
  };
  const closeReset = () => {
    history.replaceState({}, "", location.pathname);
    setAuth(null);
  };
  if (operatorPath) return <OperatorConsole />;
  if (view === "loading")
    return (
      <div className="boot-screen">
        <Logo />
        <span>Opening your protected workspace…</span>
      </div>
    );
  return (
    <>
      {view === "dashboard" ? (
        <Dashboard
          user={user}
          onUserUpdate={setUser}
          onLogout={() => {
            setUser(null);
            setView("landing");
          }}
        />
      ) : (
        <Landing
          onStart={() => setAuth("register")}
          onLogin={() => setAuth("login")}
        />
      )}{" "}
      {auth === "forgot" && (
        <ForgotPassword
          onBack={() => setAuth("login")}
          onClose={() => setAuth(null)}
        />
      )}{" "}
      {auth === "reset" && (
        <ResetPassword
          token={resetToken}
          onDone={() => setAuth("login")}
          onClose={closeReset}
        />
      )}{" "}
      {(auth === "login" || auth === "register") && (
        <Auth
          mode={auth}
          setMode={setAuth}
          onSuccess={success}
          onClose={() => setAuth(null)}
        />
      )}{" "}
      {user && !user.onboardingComplete && (
        <Onboarding user={user} onDone={setUser} />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
