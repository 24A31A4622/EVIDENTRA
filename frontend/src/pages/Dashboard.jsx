import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebaseConfig";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const mfaVerified = sessionStorage.getItem("evidentraMfaVerified");

    if (!auth.currentUser || mfaVerified !== "true") {
      navigate("/login");
      return;
    }

    setUser(auth.currentUser);
  }, [navigate]);

  async function handleLogout() {
    await signOut(auth);
    sessionStorage.clear();
    navigate("/login");
  }

  if (!user) {
    return <main className="loading-screen">Loading secure workspace...</main>;
  }

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

        <h2>Authentication successful</h2>
        <p>
          Logged in as <strong>{user.email}</strong>. Your dashboard and case
          room will be built in the next step.
        </p>

        <button className="primary-button" onClick={handleLogout}>
          Secure logout
        </button>
      </section>
    </main>
  );
}