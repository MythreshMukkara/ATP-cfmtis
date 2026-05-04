import * as XLSXModule from "xlsx";
import { getPythonParsedDataset } from "./pythonAnalyzer.js";

const XLSX = (XLSXModule as typeof XLSXModule & { default?: typeof XLSXModule }).default ?? XLSXModule;

type GenericRow = Record<string, unknown>;

export type DatasetTransferRow = {
  acknowledgementNo: string;
  txnId: string;
  senderAccount: string;
  receiverAccount: string;
  senderName?: string;
  senderPhone?: string;
  receiverName?: string;
  receiverPhone?: string;
  amount: number;
  timestamp: Date | null;
  senderBankName?: string;
  receiverBankName?: string;
  senderIfsc?: string;
  receiverIfsc?: string;
  layerLevel: number;
  referenceId?: string;
  status?: string;
  txnType?: string;
  victimName?: string;
  victimMobile?: string;
};

export type DatasetWithdrawalRow = {
  acknowledgementNo: string;
  withdrawalType: string;
  amount: number;
  timestamp: Date | null;
  accountNumber?: string;
  location?: string;
  atmTerminalId?: string;
  deviceId?: string;
  referenceId?: string;
  bankName?: string;
  ifsc?: string;
  sourceSheet: string;
};

export type DatasetHoldRow = {
  acknowledgementNo: string;
  actionType: string;
  amount?: number;
  timestamp: Date | null;
  status?: string;
  remarks?: string;
  bankName?: string;
  ifsc?: string;
  sourceSheet: string;
};

export type ParsedDataset = {
  transfers: DatasetTransferRow[];
  withdrawals: DatasetWithdrawalRow[];
  holds: DatasetHoldRow[];
  bankActions: DatasetHoldRow[];
  smallTransactions: Array<{ acknowledgementNo: string; amount: number; accountNumber?: string }>;
  metadata: {
    sheets: string[];
    totalRows: number;
  };
};

type PythonTransferRow = Omit<DatasetTransferRow, "timestamp"> & { timestamp: string | null };
type PythonWithdrawalRow = Omit<DatasetWithdrawalRow, "timestamp"> & { timestamp: string | null };
type PythonHoldRow = Omit<DatasetHoldRow, "timestamp"> & { timestamp: string | null };

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeRow = (row: GenericRow) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
  ) as GenericRow;

const firstValue = (row: GenericRow, aliases: string[]) => {
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (row[normalizedAlias] !== undefined && row[normalizedAlias] !== null && row[normalizedAlias] !== "") {
      return row[normalizedAlias];
    }
  }
  return undefined;
};

const toStringValue = (value: unknown) => (value === undefined || value === null ? undefined : String(value).trim());

const isPresent = (value: unknown) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const toNumberValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.-]+/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const excelEpoch = XLSX.SSF.parse_date_code(value);
    if (!excelEpoch) return null;
    return new Date(
      excelEpoch.y,
      excelEpoch.m - 1,
      excelEpoch.d,
      excelEpoch.H,
      excelEpoch.M,
      excelEpoch.S
    );
  }

  const text = String(value).trim();
  const dayFirstMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?:?(AM|PM)?)?$/i
  );
  if (dayFirstMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0", sec = "0", meridiem] = dayFirstMatch;
    let hour = Number(hh);
    const minute = Number(min);
    const second = Number(sec);

    if (meridiem) {
      const upper = meridiem.toUpperCase();
      if (upper === "PM" && hour < 12) hour += 12;
      if (upper === "AM" && hour === 12) hour = 0;
    }

    const parsed = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      hour,
      minute,
      second
    );
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const inferLayerLevel = (row: GenericRow) => {
  const explicit = toNumberValue(firstValue(row, ["layer", "layer_level", "layer_no", "depth"]));
  if (explicit > 0) return explicit;
  const label = toStringValue(firstValue(row, ["layer_name", "level", "stage"])) ?? "";
  const matched = label.match(/l(\d+)/i) ?? label.match(/(\d+)/);
  return matched ? Number(matched[1]) : 1;
};

const getAcknowledgementNo = (row: GenericRow) =>
  toStringValue(firstValue(row, ["Acknowledgement No", "acknowledgement_no", "ack_no", "case_id"]));

const getPrimaryAccount = (row: GenericRow) =>
  toStringValue(
    firstValue(row, [
      "Account No./Wallet/PG/PA Id",
      "Account No./ (Wallet /PG/PA) Id",
      "account_no_wallet_pg_pa_id",
      "account_no_wallet_pg_pa_id",
      "wallet_account",
      "wallet_id"
    ])
  );

const getLinkedAccount = (row: GenericRow) =>
  toStringValue(firstValue(row, ["Account No", "account_no", "beneficiary_account"]));

const getActionBank = (row: GenericRow) =>
  toStringValue(firstValue(row, ["Action Taken By Bank", "Action Taken By bank", "bank_name", "bank"]));

const getReferenceId = (row: GenericRow) =>
  toStringValue(
    firstValue(row, [
      "Reference No",
      "reference_no",
      "Transaction Id / UTR Number",
      "Transaction ID / UTR Number2",
      "transaction_id_utr_number",
      "transaction_id_utr_number2",
      "utr",
      "rrn"
    ])
  );

const parseTransferSheet = (rows: GenericRow[]) =>
  rows
    .map(normalizeRow)
    .map((row, index): DatasetTransferRow | null => {
      const acknowledgementNo = getAcknowledgementNo(row);
      if (!acknowledgementNo) return null;

      const senderAccount = getPrimaryAccount(row);
      const receiverAccount = getLinkedAccount(row);
      const primaryTxnId =
        toStringValue(firstValue(row, ["Transaction Id / UTR Number", "transaction_id_utr_number"])) ??
        toStringValue(firstValue(row, ["Transaction ID / UTR Number2", "transaction_id_utr_number2"]));

      return {
        acknowledgementNo,
        txnId: primaryTxnId ?? `TXN-${index + 1}`,
        senderAccount: senderAccount ?? "UNKNOWN-SENDER",
        receiverAccount: receiverAccount ?? "UNKNOWN-RECEIVER",
        senderName: undefined,
        senderPhone: undefined,
        receiverName: undefined,
        receiverPhone: undefined,
        amount: toNumberValue(firstValue(row, ["Transaction Amount", "transaction_amount", "amount", "Disputed Amount"])),
        timestamp: toDateValue(firstValue(row, ["Transaction Date", "transaction_date", "timestamp", "date", "txn_date"])),
        senderBankName: toStringValue(firstValue(row, ["Bank/FIs", "bank_fis", "sender_bank", "debit_bank", "from_bank"])),
        receiverBankName: getActionBank(row),
        senderIfsc: undefined,
        receiverIfsc: toStringValue(firstValue(row, ["IFSC Code", "Ifsc Code", "ifsc_code", "receiver_ifsc", "to_ifsc", "ifsc"])),
        layerLevel: inferLayerLevel(row),
        referenceId: getReferenceId(row),
        status: getActionBank(row) ?? toStringValue(firstValue(row, ["status", "txn_status"])),
        txnType: toStringValue(firstValue(row, ["txn_type", "channel", "mode"])) ?? "TRANSFER",
        victimName: toStringValue(firstValue(row, ["victim_name", "customer_name"])),
        victimMobile: toStringValue(firstValue(row, ["victim_mobile", "mobile", "customer_mobile"]))
      };
    })
    .filter(Boolean) as DatasetTransferRow[];

const parseGraphTransferSheet = (rows: GenericRow[]) =>
  rows
    .map(normalizeRow)
    .map((row, index): DatasetTransferRow | null => {
      const acknowledgementNo = toStringValue(
        firstValue(row, ["complaint_id", "Acknowledgement No", "acknowledgement_no"])
      );
      const senderAccount = toStringValue(
        firstValue(row, ["sender_account_number", "sender_account", "from_account"])
      );
      const receiverAccount = toStringValue(
        firstValue(row, ["receiver_account_number", "receiver_account", "to_account"])
      );

      if (!acknowledgementNo || !senderAccount || !receiverAccount) return null;

      const txnId = toStringValue(firstValue(row, ["transaction_id", "txn_id", "utr", "reference_no"]));

      return {
        acknowledgementNo,
        txnId: txnId ?? `TXN-${index + 1}`,
        senderAccount,
        receiverAccount,
        senderName: toStringValue(firstValue(row, ["sender_name", "victim_name", "customer_name"])),
        senderPhone: toStringValue(firstValue(row, ["sender_phone", "sender_mobile", "victim_mobile", "mobile"])),
        receiverName: toStringValue(firstValue(row, ["receiver_name", "beneficiary_name"])),
        receiverPhone: toStringValue(firstValue(row, ["receiver_phone", "beneficiary_phone"])),
        amount: toNumberValue(firstValue(row, ["amount", "transaction_amount"])),
        timestamp: toDateValue(firstValue(row, ["timestamp", "transaction_date", "date"])),
        senderBankName: toStringValue(firstValue(row, ["sender_bank_name", "sender_bank", "from_bank"])),
        receiverBankName: toStringValue(firstValue(row, ["receiver_bank_name", "receiver_bank", "to_bank"])),
        senderIfsc: undefined,
        receiverIfsc: undefined,
        layerLevel: 1,
        referenceId: txnId,
        status: "SUCCESS",
        txnType: "TRANSFER",
        victimName: toStringValue(firstValue(row, ["sender_name", "victim_name", "customer_name"])),
        victimMobile: toStringValue(firstValue(row, ["sender_phone", "sender_mobile", "victim_mobile", "mobile"]))
      };
    })
    .filter(Boolean) as DatasetTransferRow[];

const parseWithdrawalSheet = (rows: GenericRow[], type: string, sourceSheet: string) =>
  rows
    .map(normalizeRow)
    .map((row): DatasetWithdrawalRow | null => {
      const acknowledgementNo = getAcknowledgementNo(row);
      if (!acknowledgementNo) return null;

      return {
        acknowledgementNo,
        withdrawalType: type,
        amount: toNumberValue(
          firstValue(row, [
            "Withdrawal Amount",
            "Transaction Amount",
            "withdrawal_amount",
            "transaction_amount",
            "amount",
            "debited_amount"
          ])
        ),
        timestamp: toDateValue(
          firstValue(row, [
            "Withdrawal Date & Time",
            "Withdrawal Date",
            "transaction_date",
            "withdrawal_date",
            "timestamp",
            "Date",
            "date"
          ])
        ),
        accountNumber: getPrimaryAccount(row) ?? getLinkedAccount(row),
        location: toStringValue(
          firstValue(row, [
            "Place/Location of ATM",
            "Branch Location",
            "location",
            "atm_location",
            "branch_location",
            "city"
          ])
        ),
        atmTerminalId: toStringValue(firstValue(row, ["ATM ID", "atm_id", "terminal_id", "atm_terminal_id"])),
        deviceId: toStringValue(
          firstValue(row, [
            "device_id",
            "micro_atm_id",
            "aeps_terminal_id",
            "MID",
            "TID",
            "Approval Code"
          ])
        ),
        referenceId: getReferenceId(row),
        bankName: getActionBank(row),
        ifsc: toStringValue(firstValue(row, ["Ifsc Code", "IFSC Code", "ifsc", "bank_ifsc", "pifsc_code"])),
        sourceSheet
      };
    })
    .filter(Boolean) as DatasetWithdrawalRow[];

const parseHoldSheet = (rows: GenericRow[], actionType: string, sourceSheet: string) =>
  rows
    .map(normalizeRow)
    .map((row): DatasetHoldRow | null => {
      const acknowledgementNo = getAcknowledgementNo(row);
      if (!acknowledgementNo) return null;

      return {
        acknowledgementNo,
        actionType,
        amount: toNumberValue(
          firstValue(row, [
            "Put on hold Amount",
            "Transaction Amount",
            "hold_amount",
            "reversed_amount",
            "amount"
          ])
        ),
        timestamp: toDateValue(
          firstValue(row, [
            "Put on hold Date",
            "Date of Action",
            "action_date",
            "timestamp",
            "Date",
            "date",
            "transaction_date"
          ])
        ),
        status: getActionBank(row) ?? toStringValue(firstValue(row, ["status", "action_status"])),
        remarks: toStringValue(firstValue(row, ["Remarks", "remarks", "comments", "narration"])),
        bankName: getActionBank(row),
        ifsc: toStringValue(firstValue(row, ["Ifsc Code", "IFSC Code", "ifsc", "bank_ifsc"])),
        sourceSheet
      };
    })
    .filter(Boolean) as DatasetHoldRow[];

export const parseAnalyzerWorkbook = (filePath: string): ParsedDataset => {
  const pythonParsed = getPythonParsedDataset(filePath);
  if (pythonParsed) {
    return {
      transfers: (pythonParsed.transfers as PythonTransferRow[]).map((row) => ({
        ...row,
        timestamp: toDateValue(row.timestamp)
      })),
      withdrawals: (pythonParsed.withdrawals as PythonWithdrawalRow[]).map((row) => ({
        ...row,
        timestamp: toDateValue(row.timestamp)
      })),
      holds: (pythonParsed.holds as PythonHoldRow[]).map((row) => ({
        ...row,
        timestamp: toDateValue(row.timestamp)
      })),
      bankActions: (pythonParsed.bankActions as PythonHoldRow[]).map((row) => ({
        ...row,
        timestamp: toDateValue(row.timestamp)
      })),
      smallTransactions: (pythonParsed.smallTransactions as ParsedDataset["smallTransactions"]).map((row) => ({
        acknowledgementNo: String(row.acknowledgementNo ?? ""),
        amount: toNumberValue(row.amount),
        accountNumber: toStringValue(row.accountNumber)
      })),
      metadata: {
        sheets: pythonParsed.metadata.sheets,
        totalRows: pythonParsed.metadata.totalRows
      }
    };
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });

  const parsed: ParsedDataset = {
    transfers: [],
    withdrawals: [],
    holds: [],
    bankActions: [],
    smallTransactions: [],
    metadata: {
      sheets: workbook.SheetNames,
      totalRows: 0
    }
  };

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<GenericRow>(workbook.Sheets[sheetName], {
      defval: null
    });
    parsed.metadata.totalRows += rows.length;
    const normalizedSheetName = normalizeKey(sheetName);
    const normalizedColumns = new Set(
      rows[0] ? Object.keys(normalizeRow(rows[0])) : []
    );

    if (
      [
        "sender_account_number",
        "receiver_account_number",
        "transaction_id",
        "amount",
        "timestamp",
        "complaint_id"
      ].every((column) => normalizedColumns.has(column))
    ) {
      parsed.transfers.push(...parseGraphTransferSheet(rows));
      continue;
    }

    if (normalizedSheetName.includes("monthly_transfer")) {
      const transfers = parseTransferSheet(rows);
      parsed.transfers.push(...transfers);
      parsed.smallTransactions.push(
        ...transfers
          .filter((row) => row.amount > 0 && row.amount < 500)
          .map((row) => ({
            acknowledgementNo: row.acknowledgementNo,
            amount: row.amount,
            accountNumber: row.receiverAccount
          }))
      );
      continue;
    }

    if (normalizedSheetName.includes("atm")) {
      parsed.withdrawals.push(...parseWithdrawalSheet(rows, "ATM", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("aeps")) {
      parsed.withdrawals.push(...parseWithdrawalSheet(rows, "AEPS", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("pos")) {
      parsed.withdrawals.push(...parseWithdrawalSheet(rows, "POS", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("cheque")) {
      parsed.withdrawals.push(...parseWithdrawalSheet(rows, "CHEQUE", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("put_on_hold")) {
      parsed.holds.push(...parseHoldSheet(rows, "HOLD", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("funds_not_recieved") || normalizedSheetName.includes("funds_not_received")) {
      parsed.bankActions.push(...parseHoldSheet(rows, "FUNDS_NOT_RECEIVED", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("customer_ser")) {
      parsed.withdrawals.push(...parseWithdrawalSheet(rows, "CUSTOMER_SERVICE", sheetName));
      continue;
    }

    if (normalizedSheetName === "other" || normalizedSheetName.includes("other_transactions")) {
      parsed.bankActions.push(...parseHoldSheet(rows, "OTHER_TRANSACTION", sheetName));
      continue;
    }

    if (normalizedSheetName.includes("others_less_then_500") || normalizedSheetName.includes("others_500")) {
      parsed.smallTransactions.push(
        ...rows
          .map(normalizeRow)
          .map((row) => ({
            acknowledgementNo: getAcknowledgementNo(row) ?? "",
            amount:
              toNumberValue(firstValue(row, ["Transaction Amount", "transaction_amount", "amount"])) || 499,
            accountNumber: getPrimaryAccount(row) ?? getLinkedAccount(row)
          }))
          .filter((row) => row.acknowledgementNo && row.amount > 0)
      );
      continue;
    }
  }

  return parsed;
};
