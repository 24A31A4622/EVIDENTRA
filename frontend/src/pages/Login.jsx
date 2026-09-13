import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseConfig";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);

      sessionStorage.setItem("evidentraMfaUid", result.user.uid);
      sessionStorage.setItem("evidentraMfaEmail", result.user.email || "");

      navigate("/mfa");
    } catch (err) {
      console.error(err);
      setError("Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">E</div>
          <div>
            <h1>EVIDENTRA</h1>
            <p>Every Record. Every Action. Every Proof.</p>
          </div>
        </div>

        <div className="auth-heading">
          <span className="eyebrow">SECURE CASE ACCESS</span>
          <h2>Sign in to your case workspace</h2>
          <p>
            Access investigation documents, evidence records, audit trails,
            and integrity reports securely.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Official email address
            <input
              type="email"
              placeholder="investigator@evidentra.demo"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "Verifying credentials..." : "Continue securely"}
          </button>
        </form>

        <div className="security-note">
          <span>🔐</span>
          <p>Protected by role-based access and multi-factor verification.</p>
        </div>
      </section>

      <aside className="auth-visual">
        <div className="visual-grid" />
        <div className="visual-content">
          <span className="eyebrow cyan">EVIDENCE LIFECYCLE MANAGEMENT</span>
          <h2>One case.<br />One secure space.<br />Verified evidence.</h2>

          <div className="visual-feature">
            <span>✓</span>
            <p>Cryptographic file fingerprints</p>
          </div>
          <div className="visual-feature">
            <span>✓</span>
            <p>Tamper-evident audit trail</p>
          </div>
          <div className="visual-feature">
            <span>✓</span>
            <p>Role-based case access</p>
          </div>
        </div>
      </aside>
    </main>
  );
}