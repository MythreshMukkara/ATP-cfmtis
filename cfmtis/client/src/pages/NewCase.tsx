import { useNavigate } from "react-router-dom";
import { createCase } from "../api/cases";
import { ComplaintForm } from "../components/complaint/ComplaintForm";
import { PageShell } from "../components/layout/PageShell";

export const NewCasePage = () => {
  const navigate = useNavigate();

  return (
    <PageShell>
      <div className="mb-6">
        <div className="font-cond text-3xl uppercase tracking-[0.25em]">Register New Complaint</div>
        <div className="mt-1 text-sm text-secondary">Create the case record first, then upload evidence and run analysis.</div>
      </div>
      <ComplaintForm
        onSubmit={async (values) => {
          const payload = {
            complaintId: values.complaintId || undefined,
            fraudType: values.fraudType,
            fraudAmount: Number(values.fraudAmount || 0),
            victimAccount: values.victimAccount,
            victimName: values.victimName,
            victimMobile: values.victimMobile,
            bankName: values.bankName,
            fraudTimestamp: new Date(values.fraudTimestamp).toISOString(),
            description: values.description
          };
          const record = await createCase(payload);
          navigate(`/case/${record.id}/complaint`);
        }}
      />
    </PageShell>
  );
};
