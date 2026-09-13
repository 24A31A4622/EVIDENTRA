import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseConfig";

export default function MfaVerify() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser || !sessionStorage.getItem("evidentraMfaUid")) {
      navigate("/login");
    }
  }, [navigate]);

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (code !== "123456") {
      setError("Invalid verification code. For this demo, use 123456.");
      return;
    }

    sessionStorage.setItem("evidentraMfaVerified", "true");
    navigate("/dashboard");
  }

  return (
    <main className="mfa-page">
      <section className="mfa-card">
        <div className="brand-mark centered">E</div>

        <span className="eyebrow">MULTI-FACTOR AUTHENTICATION</span>
        <h1>Verify your identity</h1>
        <p className="mfa-description">
          Enter the six-digit verification code to access your EVIDENTRA
          secure case workspace.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Verification code
            <input
              className="otp-input"
              inputMode="numeric"
              maxLength="6"
              placeholder="123456"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" type="submit">
            Verify and continue
          </button>
        </form>

        <p className="demo-code">Expo demo verification code: <strong>123456</strong></p>

        <button className="text-button" onClick={() => navigate("/login")}>
          ← Return to login
        </button>
      </section>
    </main>
  );
}