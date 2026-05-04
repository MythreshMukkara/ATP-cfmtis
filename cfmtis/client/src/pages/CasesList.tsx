import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCases } from "../api/cases";
import { PageShell } from "../components/layout/PageShell";
import { useCaseStore } from "../store/caseStore";

export const CasesListPage = () => {
  const cases = useCaseStore((state) => state.cases);
  const setCases = useCaseStore((state) => state.setCases);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");

  useEffect(() => {
    if (!cases.length) {
      getCases().then((data) => setCases(data.items));
    }
  }, [cases.length, setCases]);

  const filtered = useMemo(
    () =>
      cases.filter((item) => (status === "ALL" ? true : item.status === status)).filter((item) => (type === "ALL" ? true : item.fraudType === type)),
    [cases, status, type]
  );

  return (
    <PageShell>
      <div className="mb-6 flex items-end gap-4">
        <div>
          <div className="font-cond text-3xl uppercase tracking-[0.25em]">All Cases</div>
          <div className="mt-1 text-sm text-secondary">Filter by case status and fraud type.</div>
        </div>
        <select className="h-11 rounded-[4px] border border-border bg-card px-3" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["ALL", "ACTIVE", "PENDING", "CLOSED"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="h-11 rounded-[4px] border border-border bg-card px-3" value={type} onChange={(e) => setType(e.target.value)}>
          {["ALL", "OTP Fraud", "Phishing", "UPI Scam"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="grid gap-3">
        {filtered.map((item) => (
          <Link key={String(item.id)} to={`/case/${String(item.id)}/complaint`} className="panel-card flex items-center justify-between p-4 hover:border-bright">
            <div>
              <div className="font-mono text-cyan">{String(item.complaintId)}</div>
              <div className="text-lg">{String(item.victimName)}</div>
              <div className="text-sm text-secondary">{String(item.fraudType)} · {String(item.status)}</div>
            </div>
            <div className="font-cond uppercase tracking-[0.2em] text-blue">Open</div>
          </Link>
        ))}
      </div>
    </PageShell>
  );
};
