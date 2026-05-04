import { FormEvent, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const [badgeNumber, setBadgeNumber] = useState("CID-001");
  const [password, setPassword] = useState("Admin@1234");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      await login(badgeNumber, password);
      navigate("/dashboard");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(String(error.response?.data?.message ?? "Unable to log in."));
        return;
      }

      setErrorMessage("Unable to log in.");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-deep">
      <form onSubmit={handleSubmit} className="panel-card relative z-10 w-full max-w-[440px] p-10">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[12px] border border-bright bg-card shadow-sm">
            <img
              src="/anantapur-police-logo.jpg"
              alt="Ananthapuramu Police logo"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <div className="font-cond text-3xl uppercase tracking-[0.22em] text-primary">CFMTIS</div>
            <div className="text-sm text-secondary">Cyber Fraud Money Trail Intelligence System</div>
          </div>
        </div>
        <div className="mt-5 inline-flex rounded-[3px] border border-border bg-card px-3 py-1 font-mono text-xs text-secondary">
          ANANTHAPUR Police |  Cyber Cell
        </div>
        <div className="mt-8 grid gap-4">
          <input className="h-12 rounded-[4px] border border-border bg-card px-4 text-primary" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)} placeholder="Badge Number" />
          <input className="h-12 rounded-[4px] border border-border bg-card px-4 text-primary" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
          {errorMessage && (
            <div className="rounded-[4px] border border-red/40 bg-red/8 px-4 py-3 text-sm text-red">
              {errorMessage}
            </div>
          )}
          <button className="h-12 rounded-[3px] border border-blue/50 bg-blue/10 font-cond text-[13px] uppercase tracking-[0.18em] text-primary" disabled={loading}>
            Officer Login
          </button>
        </div>
      </form>
    </div>
  );
};
