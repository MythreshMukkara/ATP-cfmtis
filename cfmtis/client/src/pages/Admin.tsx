import { PageShell } from "../components/layout/PageShell";

export const AdminPage = () => (
  <PageShell>
    <div className="panel-card p-6">
      <div className="section-header">Admin Control</div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-[4px] border border-border bg-card p-4">
          <div className="font-cond text-sm uppercase tracking-[0.2em] text-secondary">Officer Management</div>
          <div className="mt-2 text-sm text-secondary">Create and review officer access roles.</div>
        </div>
        <div className="rounded-[4px] border border-border bg-card p-4">
          <div className="font-cond text-sm uppercase tracking-[0.2em] text-secondary">Audit Trail</div>
          <div className="mt-2 text-sm text-secondary">Review freeze actions and case mutations.</div>
        </div>
        <div className="rounded-[4px] border border-border bg-card p-4">
          <div className="font-cond text-sm uppercase tracking-[0.2em] text-secondary">System Status</div>
          <div className="mt-2 text-sm text-secondary">Backend analysis worker and database health indicators.</div>
        </div>
      </div>
    </div>
  </PageShell>
);
