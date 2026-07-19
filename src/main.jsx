import React, { useEffect, useMemo, useState } from "react";
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
    confidence: 98,
    status: "Action needed",
    age: "12 min ago",
    color: "violet",
  },
  {
    id: 2,
    site: "social-repost.co",
    type: "Photo set",
    confidence: 94,
    status: "Monitoring",
    age: "2 hrs ago",
    color: "blue",
  },
  {
    id: 3,
    site: "forumvault.io",
    type: "Image",
    confidence: 91,
    status: "Takedown sent",
    age: "Yesterday",
    color: "peach",
  },
  {
    id: 4,
    site: "cliparchive.tv",
    type: "Video",
    confidence: 87,
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
                <span>97% confidence</span>
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
                  <Check /> Private reference vault
                </li>
                <li>
                  <Check /> On-demand supported image scans
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
                  <Check /> Everything in Monitor
                </li>
                <li>
                  <Check /> Evidence preservation
                </li>
                <li>
                  <Check /> Guided takedown notices
                </li>
                <li>
                  <Check /> Case status tracking
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
                  <Check /> Higher operational allowance
                </li>
                <li>
                  <Check /> Priority case queue
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
            confirmed again before purchase. Outcomes are not guaranteed;
            court orders and legal representation are not included.
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
                No service can guarantee an outcome. Platforms, hosts and
                search engines make their own decisions, and contested cases
                may require specialist legal advice.
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
          {user.mfaEnabled ? "Disable two-step verification" : "Enable two-step verification"}
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
  return (
    <div className="account-grid help-grid">
      <section className="account-card">
        <div className="support-icon">
          <HelpCircle />
        </div>
        <h2>Customer support</h2>
        <p>
          Questions about your account, billing, evidence or using the
          protected workspace.
        </p>
        <a
          className="btn btn-primary"
          href="mailto:white.eagles.dm@gmail.com?subject=Content%20Protect%20support"
        >
          Email support
        </a>
        <small>
          Include your account email, but never send passwords or sensitive
          media by email.
        </small>
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

function Dashboard({ onLogout, user }) {
  const [tab, setTab] = useState("Overview");
  const [navOpen, setNavOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [mediaConsent, setMediaConsent] = useState(false);
  const [filter, setFilter] = useState("All matches");
  const [data, setData] = useState({
    matches: [],
    assets: [],
    cases: [],
    scans: [],
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
      }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error || "Upload failed");
      return;
    }
    setModal(false);
    setMediaConsent(false);
    await refresh();
    alert("Content encrypted and added to your private vault.");
  };
  const createCase = async (matchId) => {
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
      "Evidence preserved. The case is waiting for creator approval before any notice is sent.",
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
    const accepted = confirm(
      `Continue with the ${plan} monthly subscription?\n\nBy selecting OK, you accept the Service Terms, expressly request Content Protect to begin the digital service immediately, and understand that if you cancel within 14 days you may have to pay for service already supplied. Your statutory rights are not affected.`,
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
    if (
      !confirm(
        "By continuing, you confirm that you own or represent the rights, believe the use is unauthorised, confirm the information is accurate, and authorise Content Protect to deliver the notice once delivery is enabled. Continue?",
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
  const startAgeVerification = async () => {
    const response = await fetch("/api/verification/age/start", {
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok) {
      alert(result.error || "Could not start age verification.");
      return;
    }
    if (result.verificationUrl) location.assign(result.verificationUrl);
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
            <small>{user?.plan || "Protect"} plan</small>
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
              {x === "Matches" && <em>3</em>}
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
          <b>Protection active</b>
          <span>Daily scans enabled</span>
          <div>
            <i></i>
          </div>
          <small>Private creator vault</small>
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
                  Yoti returns only the verification outcome and method. We do
                  not store your document or face image.
                </span>
              </div>
              <button
                className="btn btn-outline"
                onClick={startAgeVerification}
              >
                Verify 18+
              </button>
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
            <button className="btn btn-primary" onClick={() => setModal(true)}>
              <Plus size={18} /> Add content
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
              <button className="scan-status scan-button" onClick={runScan}>
                <div className="scanner">
                  <Search size={19} />
                  <i></i>
                </div>
                <div>
                  <b>Run protected image scan</b>
                  <span>
                    {data.assets.length
                      ? data.scannerMode === "tineye-commercial"
                        ? "Search the commercial provider using encrypted references"
                        : "Commercial scanning awaits provider activation"
                      : "Add a reference asset before starting a scan"}
                  </span>
                </div>
                <span className="live">
                  <i></i>{" "}
                  {data.scannerMode === "tineye-commercial" ? "LIVE" : "WAITING"}
                </span>
              </button>
            </>
          )}
          {tab === "My content" && (
            <div className="matches-card">
              <div className="matches-head">
                <div>
                  <h2>Private reference vault</h2>
                  <p>Encrypted files owned by this account</p>
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
                    </div>
                    <div>
                      <span className="status removed">{a.status}</span>
                    </div>
                    <div className="asset-actions">
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
                    </div>
                    <div className="confidence">
                      <b>{c.mode === "sandbox" ? "Sandbox" : "Live"}</b>
                    </div>
                    <div>
                      <span className="status monitoring">{c.status}</span>
                    </div>
                    {c.status === "Awaiting declarations" && (
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
                  ["Monitor", "£19", "Monthly scans"],
                  ["Protect", "£49", "Daily scans + cases"],
                  ["Pro", "£99", "Priority protection"],
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
                  <option>Takedown sent</option>
                  <option>Removed</option>
                </select>
              </div>
              <div className="table-head">
                <span>FOUND CONTENT</span>
                <span>SOURCE</span>
                <span>CONFIDENCE</span>
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
                <div className="match-row" key={m.id}>
                  <div className={`thumb ${m.color}`}>
                    <div></div>
                    <span>{m.type === "Video" ? <Video /> : <Image />}</span>
                  </div>
                  <div className="source">
                    <b>{m.site}</b>
                    <span>
                      <Link2 /> Public page · {m.age}
                    </span>
                  </div>
                  <div className="confidence">
                    <b>{m.confidence}%</b>
                    <div>
                      <i style={{ width: m.confidence + "%" }}></i>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`status ${m.status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <button
                    className="more"
                    title="Create protected case"
                    onClick={() => createCase(m.id)}
                  >
                    <Plus />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
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
            <label className={`dropzone ${mediaConsent ? "" : "disabled"}`}>
              <Upload />
              <b>Choose a supported photo or short video</b>
              <span>JPEG, PNG, WebP, GIF, TIFF, HEIC/AVIF, MP4, MOV or WebM · 8 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif,image/heic,video/mp4,video/quicktime,video/webm"
                disabled={!mediaConsent}
                onChange={uploadFile}
              />
            </label>
            <div className="consent">
              <ShieldCheck />
              <span>
                <b>Your privacy comes first</b>Files are validated and encrypted
                before storage. Provider scan copies are resized and stripped
                of EXIF/GPS metadata.
              </span>
            </div>
          </div>
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

function OperatorConsole() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [cases, setCases] = useState([]);
  const [forms, setForms] = useState({});
  const loadCases = async () => {
    const response = await fetch("/api/operator/cases");
    if (!response.ok) {
      setReady(false);
      return;
    }
    setCases((await response.json()).cases || []);
    setReady(true);
  };
  useEffect(() => {
    fetch("/api/operator/me").then((response) => {
      if (response.ok) loadCases();
      else setReady(false);
    });
  }, []);
  const login = async (event) => {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/operator/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Access denied.");
      return;
    }
    setToken("");
    await loadCases();
  };
  const dispatch = async (caseId) => {
    const form = forms[caseId] || {};
    if (!form.recipientEmail || !form.recipientSource) {
      setError("Recipient email and its verified HTTPS source are required.");
      return;
    }
    if (!form.noticeReviewed || !form.jurisdictionReviewed) {
      setError("Review the exact notice and recipient jurisdiction before sending.");
      return;
    }
    if (
      !confirm(
        `Send this legal notice to ${form.recipientEmail}? This external action cannot be undone.`,
      )
    )
      return;
    const response = await fetch(`/api/operator/cases/${caseId}/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        confirmRecipientReviewed: true,
        confirmNoticeReviewed: form.noticeReviewed === true,
        confirmJurisdictionReviewed: form.jurisdictionReviewed === true,
        noticeHash: cases.find((item) => item.id === caseId)?.noticeHash,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Delivery failed.");
      return;
    }
    setError("");
    await loadCases();
  };
  const logout = async () => {
    await fetch("/api/operator/session", { method: "DELETE" });
    setReady(false);
    setCases([]);
  };
  if (!ready)
    return (
      <main className="operator-login">
        <form className="operator-login-card" onSubmit={login}>
          <Logo />
          <p>PRIVATE OPERATIONS</p>
          <h1>Operator access</h1>
          <span>Enter the dedicated takedown token. It is exchanged for a four-hour secure session and is not stored in the browser.</span>
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
          <span>Private takedown operations</span>
        </div>
        <button className="btn btn-outline" onClick={logout}>Sign out</button>
      </header>
      <section>
        <div className="operator-heading">
          <div><p>HUMAN REVIEW REQUIRED</p><h1>Approved notice queue</h1></div>
          <strong>{cases.length} pending</strong>
        </div>
        {error && <div className="operator-error">{error}</div>}
        {cases.length ? cases.map((item) => (
          <article className="operator-case" key={item.id}>
            <div className="operator-case-title">
              <div><small>CASE {item.id}</small><h2>{item.targetHost}</h2></div>
              <span>Approved {new Date(item.approvedAt).toLocaleString("en-GB")}</span>
            </div>
            <dl>
              <div><dt>Claimant</dt><dd>{item.claimant?.stageName || item.claimant?.name}</dd></div>
              <div><dt>Target</dt><dd><a href={item.targetUrl} target="_blank" rel="noreferrer">Review URL</a></dd></div>
              <div><dt>Evidence hash</dt><dd className="operator-hash">{item.evidenceHash}</dd></div>
            </dl>
            <div className="operator-notice">
              <div><b>Exact notice to be sent</b><span>Template {item.templateVersion} · SHA-256 {item.noticeHash}</span></div>
              <pre>{item.noticeText}</pre>
            </div>
            <div className="operator-fields">
              <label>Verified recipient email<input type="email" value={forms[item.id]?.recipientEmail || ""} onChange={(event) => setForms({...forms,[item.id]:{...forms[item.id],recipientEmail:event.target.value}})} /></label>
              <label>HTTPS source proving recipient<input type="url" placeholder="https://…" value={forms[item.id]?.recipientSource || ""} onChange={(event) => setForms({...forms,[item.id]:{...forms[item.id],recipientSource:event.target.value}})} /></label>
            </div>
            <div className="operator-checks">
              <label><input type="checkbox" checked={forms[item.id]?.noticeReviewed || false} onChange={(event) => setForms({...forms,[item.id]:{...forms[item.id],noticeReviewed:event.target.checked}})} />I reviewed the exact notice text and evidence hash.</label>
              <label><input type="checkbox" checked={forms[item.id]?.jurisdictionReviewed || false} onChange={(event) => setForms({...forms,[item.id]:{...forms[item.id],jurisdictionReviewed:event.target.checked}})} />I verified the recipient and appropriate jurisdiction/channel.</label>
            </div>
            <button className="btn btn-primary" onClick={() => dispatch(item.id)}>Review confirmation & send</button>
          </article>
        )) : <div className="operator-empty"><CircleCheck/><h2>Queue clear</h2><p>No creator-approved notices are waiting for review.</p></div>}
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
          const ageSessionId = q.get("sessionId");
          if (q.get("age_check") === "return" && ageSessionId) {
            const r = await fetch("/api/verification/age/complete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: ageSessionId }),
              }),
              d = await r.json();
            history.replaceState({}, "", location.pathname);
            if (r.ok) {
              u = d.user;
              alert("Your 18+ age check was verified successfully.");
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
