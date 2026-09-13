import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseConfig";

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadProfile() {
      const mfaVerified = sessionStorage.getItem("evidentraMfaVerified");
      const currentUser = auth.currentUser;

      if (!currentUser || mfaVerified !== "true") {
        navigate("/login");
        return;
      }

      try {
        const profileRef = doc(db, "users", currentUser.uid);
        const profileSnapshot = await getDoc(profileRef);

        if (!profileSnapshot.exists()) {
          setError(
            "No EVIDENTRA role profile was found for this account. Check that the Firestore users document ID exactly matches the Firebase Authentication User UID."
          );
          return;
        }

        const data = profileSnapshot.data();

        if (data.active !== true) {
          setError("This EVIDENTRA account has been deactivated.");
          return;
        }

        setProfile(data);
      } catch (err) {
        console.error(err);
        setError(
          "Could not load the secure user profile. Check Firestore Rules and confirm the user document is correctly configured."
        );
      }
    }

    loadProfile();
  }, [navigate]);

  async function handleLogout() {
    await signOut(auth);
    sessionStorage.clear();
    navigate("/login");
  }

  if (error) {
    return (
      <main className="dashboard-placeholder">
        <section>
          <div className="brand-lockup">
            <div className="brand-mark">E</div>
            <div>
              <h1>EVIDENTRA</h1>
              <p>Secure Case Workspace</p>
            </div>
          </div>

          <h2>Profile access needs attention</h2>
          <p>{error}</p>

          <button className="primary-button" onClick={handleLogout}>
            Secure logout
          </button>
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="loading-screen">
        Loading secure user profile...
      </main>
    );
  }

  return (
    <main className="dashboard-placeholder">
      <section>
        <div className="brand-lockup">
          <div className="brand-mark">E</div>
          <div>
            <h1>EVIDENTRA</h1>
            <p>Every Record. Every Action. Every Proof.</p>
          </div>
        </div>

        <span className="eyebrow cyan">
          SECURE WORKSPACE ACCESS VERIFIED
        </span>

        <h2>Welcome, {profile.displayName}</h2>

        <p>
          You are signed in as <strong>{profile.role}</strong>. Your role
          determines which cases, evidence, reports, and audit actions you can
          access.
        </p>

        <div className="profile-summary">
          <div>
            <span>ACCOUNT</span>
            <strong>{profile.email}</strong>
          </div>

          <div>
            <span>ROLE</span>
            <strong>{profile.role}</strong>
          </div>

          <div>
            <span>ACCESS STATUS</span>
            <strong className="verified-text">● Active</strong>
          </div>
        </div>

        <button className="primary-button" onClick={handleLogout}>
          Secure logout
        </button>
      </section>
    </main>
  );
}