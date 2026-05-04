import { useEffect, useState } from "react";
import { Input, Select, Textarea } from "../ui/Input";
import { SectionHeader } from "../layout/SectionHeader";

const fraudTypes = [
  "OTP Fraud",
  "Phishing",
  "SIM Swap",
  "UPI Scam",
  "Investment Fraud",
  "Impersonation",
  "Vishing",
  "Online Marketplace Scam"
];

const toDateTimeLocalValue = (value?: string | number) => {
  if (!value) {
    return new Date().toISOString().slice(0, 16);
  }

  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  const date = new Date(stringValue);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  const localOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - localOffset).toISOString().slice(0, 16);
};

const normalizeAccountDisplay = (value?: string | number) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

export const ComplaintForm = ({
  initialValues,
  onSubmit
}: {
  initialValues?: Record<string, string | number>;
  onSubmit: (values: Record<string, string>) => void;
}) => {
  const buildFormState = (): Record<string, string> => ({
    complaintId: String(initialValues?.complaintId ?? ""),
    fraudType: String(initialValues?.fraudType ?? "OTP Fraud"),
    fraudAmount: String(initialValues?.fraudAmount ?? ""),
    victimAccount: normalizeAccountDisplay(initialValues?.victimAccount),
    victimName: String(initialValues?.victimName ?? ""),
    fraudTimestamp: toDateTimeLocalValue(initialValues?.fraudTimestamp),
    victimMobile: String(initialValues?.victimMobile ?? ""),
    bankName: String(initialValues?.bankName ?? ""),
    referenceId: String(initialValues?.referenceId ?? ""),
    description: String(initialValues?.description ?? "")
  });
  const [form, setForm] = useState<Record<string, string>>(buildFormState);

  const buildSubmitPayload = () => ({
    ...form,
    complaintId: form.complaintId.trim()
  });

  useEffect(() => {
    setForm(buildFormState());
  }, [
    initialValues?.bankName,
    initialValues?.complaintId,
    initialValues?.description,
    initialValues?.fraudAmount,
    initialValues?.fraudTimestamp,
    initialValues?.fraudType,
    initialValues?.referenceId,
    initialValues?.victimAccount,
    initialValues?.victimMobile,
    initialValues?.victimName
  ]);

  return (
    <section className="panel-card p-6">
      <SectionHeader label="Complaint Registration" />
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Input value={form.complaintId} placeholder="Complaint ID" onChange={(e) => setForm({ ...form, complaintId: e.target.value })} />
        <Select value={form.fraudType} onChange={(e) => setForm({ ...form, fraudType: e.target.value })}>
          {fraudTypes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </Select>
        <Input value={form.fraudAmount} placeholder="Fraud Amount ₹" onChange={(e) => setForm({ ...form, fraudAmount: e.target.value })} />
        <Input
          type="text"
          inputMode="numeric"
          value={form.victimAccount}
          placeholder="Victim Account No."
          onChange={(e) => setForm({ ...form, victimAccount: e.target.value })}
        />
        <Input value={form.victimName} placeholder="Victim Name" onChange={(e) => setForm({ ...form, victimName: e.target.value })} />
        <Input type="datetime-local" value={form.fraudTimestamp} onChange={(e) => setForm({ ...form, fraudTimestamp: e.target.value })} />
        <Input value={form.victimMobile} placeholder="Victim Mobile" onChange={(e) => setForm({ ...form, victimMobile: e.target.value })} />
        <Input value={form.bankName} placeholder="Bank Name" onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
        <label className="grid gap-1">
          <span className="text-[11px] tracking-[0.08em] text-secondary">Reference ID / UTR</span>
          <Input value={form.referenceId} placeholder="Enter reference number" onChange={(e) => setForm({ ...form, referenceId: e.target.value })} />
        </label>
        <div className="col-span-3">
          <Textarea value={form.description} placeholder="Incident Description" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className="rounded-[3px] border border-cyan/50 px-4 py-2 font-cond uppercase tracking-[0.2em] text-cyan"
          onClick={() => onSubmit(buildSubmitPayload())}
        >
          Save Complaint
        </button>
      </div>
    </section>
  );
};
