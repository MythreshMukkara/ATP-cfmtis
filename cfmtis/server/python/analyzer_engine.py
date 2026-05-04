#!/usr/bin/env python3

import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import networkx as nx
import pandas as pd


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")


def normalize_sheet_name(value: str) -> str:
    compact = str(value).strip().lower()
    if "money transfer" in compact:
        return "Money Transfer to"
    if "monthly transfer" in compact:
        return "Money Transfer to"
    if "others less then 500" in compact:
        return "Others Less Then 500"
    if "transaction put on hold" in compact:
        return "Transaction put on hold"
    if "withdrawal through atm" in compact:
        return "Withdrawal through ATM"
    if "cash withdrawal through cheque" in compact:
        return "Cash Withdrawal through Cheque"
    if "withdrawal through pos" in compact:
        return "Withdrawal through POS"
    if compact == "other":
        return "Other"
    if "aeps" in compact:
        return "AEPS"
    if "customer se" in compact:
        return "Withdrawal through Customer Service"
    if "funds not received by cc" in compact:
        return "Funds Not Received by CC"
    return str(value).strip()


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def to_str(value: Any) -> Optional[str]:
    if is_missing(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    if text.endswith(".0") and re.fullmatch(r"-?\d+\.0", text):
        text = text[:-2]
    return text or None


def to_num(value: Any, default: float = 0.0) -> float:
    if is_missing(value):
        return default
    if isinstance(value, (int, float)) and not (isinstance(value, float) and math.isnan(value)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value))
    try:
        return float(cleaned) if cleaned else default
    except ValueError:
        return default


def to_dt(value: Any) -> Optional[datetime]:
    if is_missing(value):
        return None
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.to_pydatetime()
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return (datetime(1899, 12, 30) + timedelta(days=float(value)))
        except Exception:
            return None
    text = str(value).strip()
    for fmt in (
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    try:
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=("T" not in text and "-" not in text[:4]))
        if pd.isna(parsed):
            return None
        return parsed.to_pydatetime()
    except Exception:
        return None


def dt_json(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {normalize_key(k): v for k, v in row.items()}


def first_value(row: Dict[str, Any], aliases: List[str]) -> Any:
    for alias in aliases:
        key = normalize_key(alias)
        if key in row and not is_missing(row[key]):
            return row[key]
    return None


def get_ack(row: Dict[str, Any]) -> Optional[str]:
    return to_str(first_value(row, ["Acknowledgement No", "acknowledgement_no", "ack_no", "case_id"]))


def get_primary_account(row: Dict[str, Any]) -> Optional[str]:
    return to_str(first_value(row, [
        "Account No./Wallet/PG/PA Id",
        "Account No./ (Wallet /PG/PA) Id",
        "account_no_wallet_pg_pa_id",
        "wallet_account",
        "wallet_id",
    ]))


def get_linked_account(row: Dict[str, Any]) -> Optional[str]:
    return to_str(first_value(row, ["Account No", "account_no", "beneficiary_account"]))


def get_action_bank(row: Dict[str, Any]) -> Optional[str]:
    return to_str(first_value(row, ["Action Taken By Bank", "Action Taken By bank", "bank_name", "bank"]))


def get_reference_id(row: Dict[str, Any]) -> Optional[str]:
    return to_str(first_value(row, [
        "Reference No",
        "reference_no",
        "Transaction Id / UTR Number",
        "Transaction ID / UTR Number2",
        "transaction_id_utr_number",
        "transaction_id_utr_number2",
        "utr",
        "rrn",
    ]))


def infer_layer_level(row: Dict[str, Any]) -> int:
    explicit = int(to_num(first_value(row, ["layer", "layer_level", "layer_no", "depth"]), 0))
    if explicit > 0:
        return explicit
    label = to_str(first_value(row, ["layer_name", "level", "stage"])) or ""
    match = re.search(r"l(\d+)", label, re.I) or re.search(r"(\d+)", label)
    return int(match.group(1)) if match else 1


def parse_transfer_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    parsed = []
    for index, raw in enumerate(rows):
        row = normalize_row(raw)
        ack = get_ack(row)
        if not ack:
            continue
        primary_txn_id = to_str(first_value(row, ["Transaction Id / UTR Number", "transaction_id_utr_number"])) or to_str(
            first_value(row, ["Transaction ID / UTR Number2", "transaction_id_utr_number2"])
        )
        parsed.append({
            "acknowledgementNo": ack,
            "txnId": primary_txn_id or f"TXN-{index + 1}",
            "senderAccount": get_primary_account(row) or "UNKNOWN-SENDER",
            "receiverAccount": get_linked_account(row) or "UNKNOWN-RECEIVER",
            "senderName": None,
            "senderPhone": None,
            "receiverName": None,
            "receiverPhone": None,
            "amount": to_num(first_value(row, ["Transaction Amount", "transaction_amount", "amount", "Disputed Amount"])),
            "timestamp": dt_json(to_dt(first_value(row, ["Transaction Date", "transaction_date", "timestamp", "date", "txn_date"]))),
            "senderBankName": to_str(first_value(row, ["Bank/FIs", "bank_fis", "sender_bank", "debit_bank", "from_bank"])),
            "receiverBankName": get_action_bank(row),
            "senderIfsc": None,
            "receiverIfsc": to_str(first_value(row, ["IFSC Code", "Ifsc Code", "ifsc_code", "receiver_ifsc", "to_ifsc", "ifsc"])),
            "layerLevel": infer_layer_level(row),
            "referenceId": get_reference_id(row),
            "status": get_action_bank(row) or to_str(first_value(row, ["status", "txn_status"])),
            "txnType": to_str(first_value(row, ["txn_type", "channel", "mode"])) or "TRANSFER",
            "victimName": to_str(first_value(row, ["victim_name", "customer_name"])),
            "victimMobile": to_str(first_value(row, ["victim_mobile", "mobile", "customer_mobile"])),
        })
    return parsed


def parse_graph_transfer_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    parsed = []
    for index, raw in enumerate(rows):
        row = normalize_row(raw)
        ack = to_str(first_value(row, ["complaint_id", "Acknowledgement No", "acknowledgement_no"]))
        sender_account = to_str(first_value(row, ["sender_account_number", "sender_account", "from_account"]))
        receiver_account = to_str(first_value(row, ["receiver_account_number", "receiver_account", "to_account"]))
        if not ack or not sender_account or not receiver_account:
            continue

        parsed.append({
            "acknowledgementNo": ack,
            "txnId": to_str(first_value(row, ["transaction_id", "txn_id", "utr", "reference_no"])) or f"TXN-{index + 1}",
            "senderAccount": sender_account,
            "receiverAccount": receiver_account,
            "senderName": to_str(first_value(row, ["sender_name", "victim_name", "customer_name"])),
            "senderPhone": to_str(first_value(row, ["sender_phone", "sender_mobile", "victim_mobile", "mobile"])),
            "receiverName": to_str(first_value(row, ["receiver_name", "beneficiary_name"])),
            "receiverPhone": to_str(first_value(row, ["receiver_phone", "beneficiary_phone"])),
            "amount": to_num(first_value(row, ["amount", "transaction_amount"])),
            "timestamp": dt_json(to_dt(first_value(row, ["timestamp", "transaction_date", "date"]))),
            "senderBankName": to_str(first_value(row, ["sender_bank_name", "sender_bank", "from_bank"])),
            "receiverBankName": to_str(first_value(row, ["receiver_bank_name", "receiver_bank", "to_bank"])),
            "senderIfsc": None,
            "receiverIfsc": None,
            "layerLevel": 1,
            "referenceId": to_str(first_value(row, ["transaction_id", "txn_id", "utr", "reference_no"])),
            "status": "SUCCESS",
            "txnType": "TRANSFER",
            "victimName": to_str(first_value(row, ["sender_name", "victim_name", "customer_name"])),
            "victimMobile": to_str(first_value(row, ["sender_phone", "sender_mobile", "victim_mobile", "mobile"])),
        })
    return parsed


def parse_withdrawal_rows(rows: List[Dict[str, Any]], withdrawal_type: str, source_sheet: str) -> List[Dict[str, Any]]:
    parsed = []
    for raw in rows:
        row = normalize_row(raw)
        ack = get_ack(row)
        if not ack:
            continue
        parsed.append({
            "acknowledgementNo": ack,
            "withdrawalType": withdrawal_type,
            "amount": to_num(first_value(row, ["Withdrawal Amount", "Transaction Amount", "withdrawal_amount", "transaction_amount", "amount", "debited_amount"])),
            "timestamp": dt_json(to_dt(first_value(row, ["Withdrawal Date & Time", "Withdrawal Date", "transaction_date", "withdrawal_date", "timestamp", "Date", "date"]))),
            "accountNumber": get_primary_account(row) or get_linked_account(row),
            "location": to_str(first_value(row, ["Place/Location of ATM", "Branch Location", "location", "atm_location", "branch_location", "city"])),
            "atmTerminalId": to_str(first_value(row, ["ATM ID", "atm_id", "terminal_id", "atm_terminal_id"])),
            "deviceId": to_str(first_value(row, ["device_id", "micro_atm_id", "aeps_terminal_id", "MID", "TID", "Approval Code"])),
            "referenceId": get_reference_id(row),
            "bankName": get_action_bank(row),
            "ifsc": to_str(first_value(row, ["Ifsc Code", "IFSC Code", "ifsc", "bank_ifsc", "pifsc_code"])),
            "sourceSheet": source_sheet,
        })
    return parsed


def parse_hold_rows(rows: List[Dict[str, Any]], action_type: str, source_sheet: str) -> List[Dict[str, Any]]:
    parsed = []
    for raw in rows:
        row = normalize_row(raw)
        ack = get_ack(row)
        if not ack:
            continue
        parsed.append({
            "acknowledgementNo": ack,
            "actionType": action_type,
            "amount": to_num(first_value(row, ["Put on hold Amount", "Transaction Amount", "hold_amount", "reversed_amount", "amount"]), 0),
            "timestamp": dt_json(to_dt(first_value(row, ["Put on hold Date", "Date of Action", "action_date", "timestamp", "Date", "date", "transaction_date"]))),
            "status": get_action_bank(row) or to_str(first_value(row, ["status", "action_status"])),
            "remarks": to_str(first_value(row, ["Remarks", "remarks", "comments", "narration"])),
            "bankName": get_action_bank(row),
            "ifsc": to_str(first_value(row, ["Ifsc Code", "IFSC Code", "ifsc", "bank_ifsc"])),
            "sourceSheet": source_sheet,
        })
    return parsed


def parse_workbook(file_path: str) -> Dict[str, Any]:
    workbook = pd.ExcelFile(file_path, engine="openpyxl")
    parsed = {
        "transfers": [],
        "withdrawals": [],
        "holds": [],
        "bankActions": [],
        "smallTransactions": [],
        "metadata": {
            "sheets": workbook.sheet_names,
            "totalRows": 0,
        },
    }

    for sheet_name in workbook.sheet_names:
        df = workbook.parse(sheet_name=sheet_name)
        rows = df.where(pd.notnull(df), None).to_dict(orient="records")
        parsed["metadata"]["totalRows"] += len(rows)
        normalized_sheet = normalize_key(sheet_name)
        normalized_columns = {normalize_key(str(column)) for column in df.columns}

        if {"sender_account_number", "receiver_account_number", "transaction_id", "amount", "timestamp", "complaint_id"}.issubset(normalized_columns):
            parsed["transfers"].extend(parse_graph_transfer_rows(rows))
            continue

        if "money_transfer" in normalized_sheet or "monthly_transfer" in normalized_sheet:
            transfers = parse_transfer_rows(rows)
            parsed["transfers"].extend(transfers)
            parsed["smallTransactions"].extend(
                {
                    "acknowledgementNo": row["acknowledgementNo"],
                    "amount": row["amount"],
                    "accountNumber": row["receiverAccount"],
                }
                for row in transfers
                if 0 < row["amount"] < 500
            )
            continue

        if "atm" in normalized_sheet:
            parsed["withdrawals"].extend(parse_withdrawal_rows(rows, "ATM", sheet_name))
            continue
        if "aeps" in normalized_sheet:
            parsed["withdrawals"].extend(parse_withdrawal_rows(rows, "AEPS", sheet_name))
            continue
        if "pos" in normalized_sheet:
            parsed["withdrawals"].extend(parse_withdrawal_rows(rows, "POS", sheet_name))
            continue
        if "cheque" in normalized_sheet:
            parsed["withdrawals"].extend(parse_withdrawal_rows(rows, "CHEQUE", sheet_name))
            continue
        if "put_on_hold" in normalized_sheet:
            parsed["holds"].extend(parse_hold_rows(rows, "HOLD", sheet_name))
            continue
        if "funds_not_recieved" in normalized_sheet or "funds_not_received" in normalized_sheet:
            parsed["bankActions"].extend(parse_hold_rows(rows, "FUNDS_NOT_RECEIVED", sheet_name))
            continue
        if "customer_ser" in normalized_sheet:
            parsed["withdrawals"].extend(parse_withdrawal_rows(rows, "CUSTOMER_SERVICE", sheet_name))
            continue
        if normalized_sheet == "other" or "other_transactions" in normalized_sheet:
            parsed["bankActions"].extend(parse_hold_rows(rows, "OTHER_TRANSACTION", sheet_name))
            continue
        if "others_less_then_500" in normalized_sheet or "others_500" in normalized_sheet:
            for raw in rows:
                row = normalize_row(raw)
                ack = get_ack(row)
                amount = to_num(first_value(row, ["Transaction Amount", "transaction_amount", "amount"]), 499)
                if ack and amount > 0:
                    parsed["smallTransactions"].append({
                        "acknowledgementNo": ack,
                        "amount": amount,
                        "accountNumber": get_primary_account(row) or get_linked_account(row),
                    })

    return parsed


def derive_bundle_map(parsed: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    bundles: Dict[str, Dict[str, Any]] = {}

    def ensure(ack: str) -> Dict[str, Any]:
        if ack not in bundles:
            bundles[ack] = {
                "acknowledgementNo": ack,
                "transfers": [],
                "withdrawals": [],
                "holds": [],
                "bankActions": [],
                "smallTransactions": [],
            }
        return bundles[ack]

    for key in ("transfers", "withdrawals", "holds", "bankActions", "smallTransactions"):
        for row in parsed[key]:
            ensure(row["acknowledgementNo"])[key].append(row)
    return bundles


def exposure_amount(bundle: Dict[str, Any]) -> float:
    transfer_amount = sum(item["amount"] for item in bundle["transfers"])
    withdrawal_amount = sum(item["amount"] for item in bundle["withdrawals"])
    hold_amount = sum(item.get("amount") or 0 for item in bundle["holds"])
    bank_action_amount = sum(item.get("amount") or 0 for item in bundle["bankActions"])
    small_txn_amount = sum(item["amount"] for item in bundle["smallTransactions"])
    return max(transfer_amount, withdrawal_amount, hold_amount + bank_action_amount, small_txn_amount, 0)


def evidence_score(bundle: Dict[str, Any]) -> int:
    return (
        len(bundle["transfers"]) * 4
        + len(bundle["withdrawals"]) * 3
        + len(bundle["holds"]) * 2
        + len(bundle["bankActions"]) * 2
        + len(bundle["smallTransactions"])
    )


def bundle_start_timestamp(bundle: Dict[str, Any]) -> Optional[datetime]:
    values = []
    for key in ("transfers", "withdrawals", "holds", "bankActions"):
        for item in bundle[key]:
            dt = to_dt(item.get("timestamp"))
            if dt:
                values.append(dt)
    return min(values) if values else None


def build_money_trail(bundle: Dict[str, Any]) -> Dict[str, Any]:
    transfers = bundle["transfers"]
    participant_profiles: Dict[str, Dict[str, Optional[str]]] = {}

    for item in transfers:
        if item.get("senderAccount"):
            participant_profiles[item["senderAccount"]] = {
                "holderName": item.get("senderName"),
                "phoneNumber": item.get("senderPhone"),
            }
        if item.get("receiverAccount"):
            participant_profiles[item["receiverAccount"]] = {
                "holderName": item.get("receiverName"),
                "phoneNumber": item.get("receiverPhone"),
            }

    if not transfers:
        account_nodes = []
        seen_accounts = set()
        for account in [item.get("accountNumber") for item in bundle["withdrawals"]] + [item.get("accountNumber") for item in bundle["smallTransactions"]]:
            if account and account not in seen_accounts:
                seen_accounts.add(account)
                account_nodes.append({"id": account, "accountNumber": account, "kind": "ACCOUNT"})

        bank_nodes = []
        seen_banks = set()
        for bank in [item.get("bankName") for item in bundle["withdrawals"]] + [item.get("bankName") for item in bundle["bankActions"]]:
            if bank and bank not in seen_banks:
                seen_banks.add(bank)
                bank_nodes.append({"id": f"bank:{bank}", "accountNumber": bank, "kind": "BANK"})

        edges = []
        for index, item in enumerate(bundle["withdrawals"]):
            if item.get("accountNumber") and item.get("bankName"):
                edges.append({
                    "source": item["accountNumber"],
                    "target": f"bank:{item['bankName']}",
                    "amount": item["amount"],
                    "txnId": item.get("referenceId") or f"withdrawal-{index + 1}",
                    "layer": 1,
                    "timestamp": item.get("timestamp"),
                    "relation": f"WITHDRAWAL_{item['withdrawalType']}",
                })

        for index, item in enumerate(bundle["bankActions"]):
            if item.get("bankName"):
                related_account = next((w.get("accountNumber") for w in bundle["withdrawals"] if w.get("bankName") == item["bankName"] and w.get("accountNumber")), bundle["acknowledgementNo"])
                edges.append({
                    "source": f"bank:{item['bankName']}",
                    "target": related_account,
                    "amount": item.get("amount") or 0,
                    "txnId": f"bank-action-{index + 1}",
                    "layer": 2,
                    "timestamp": item.get("timestamp"),
                    "relation": item["actionType"],
                })

        return {
            "nodes": account_nodes + bank_nodes,
            "edges": edges,
            "path": [node["id"] for node in account_nodes],
            "layerDistribution": {},
            "flags": {
                "splitTransactions": False,
                "circularTransfers": False,
                "multipleReceivers": False,
            "repeatedAccounts": False,
        },
        "participantProfiles": participant_profiles,
        "graphMode": "RELATIONSHIP_FALLBACK",
      }

    graph = nx.DiGraph()
    sender_count = Counter()
    receiver_count = Counter()
    layer_distribution: Dict[str, float] = defaultdict(float)
    edges = []

    for item in transfers:
        source = item["senderAccount"]
        target = item["receiverAccount"]
        graph.add_node(source)
        graph.add_node(target)
        graph.add_edge(source, target, amount=item["amount"], txnId=item["txnId"])
        sender_count[source] += 1
        receiver_count[target] += 1
        layer_distribution[f"L{item['layerLevel']}"] += item["amount"]
        edges.append({
            "source": source,
            "target": target,
            "amount": item["amount"],
            "txnId": item["txnId"],
            "layer": item["layerLevel"],
            "timestamp": item.get("timestamp"),
        })

    root = transfers[0]["senderAccount"] if transfers else None
    path = []
    if root:
        path = list(nx.dfs_preorder_nodes(graph, root))

    circular = not nx.is_directed_acyclic_graph(graph)

    return {
        "nodes": [{"id": node, "accountNumber": node, "kind": "ACCOUNT"} for node in graph.nodes()],
        "edges": edges,
        "path": path,
        "layerDistribution": {key: round(value, 2) for key, value in layer_distribution.items()},
        "flags": {
            "splitTransactions": any(count > 1 for count in sender_count.values()),
            "circularTransfers": circular,
        "multipleReceivers": any(count > 2 for count in sender_count.values()),
        "repeatedAccounts": any(count > 1 for count in receiver_count.values()),
      },
      "participantProfiles": participant_profiles,
      "graphMode": "TRANSFER",
    }


def build_timeline(bundle: Dict[str, Any]) -> Dict[str, Any]:
    events = []
    for transfer in bundle["transfers"]:
        dt = to_dt(transfer.get("timestamp"))
        if dt:
            events.append({"kind": "TRANSFER", "timestamp": dt, "label": f"{transfer['senderAccount']} to {transfer['receiverAccount']}"})
    for hold in bundle["holds"]:
        dt = to_dt(hold.get("timestamp"))
        if dt:
            events.append({"kind": "HOLD", "timestamp": dt, "label": hold["actionType"]})
    for wd in bundle["withdrawals"]:
        dt = to_dt(wd.get("timestamp"))
        if dt:
            events.append({"kind": "WITHDRAWAL", "timestamp": dt, "label": wd["withdrawalType"]})
    for action in bundle["bankActions"]:
        dt = to_dt(action.get("timestamp"))
        if dt:
            events.append({"kind": "BANK_ACTION", "timestamp": dt, "label": action["actionType"]})

    events.sort(key=lambda item: item["timestamp"])
    start = events[0]["timestamp"] if events else None
    end = events[-1]["timestamp"] if events else None
    delay = max((end - start).total_seconds() / 3600, 0) if start and end else 0
    return {
        "events": [{"kind": item["kind"], "timestamp": dt_json(item["timestamp"]), "label": item["label"]} for item in events],
        "delayInHours": delay,
        "delayCategory": "FAST" if delay < 24 else "MEDIUM" if delay <= 72 else "CRITICAL",
    }


def build_withdrawal_intelligence(withdrawals: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = sum(item["amount"] for item in withdrawals)
    distribution: Dict[str, float] = defaultdict(float)
    atm_locations: Dict[str, int] = defaultdict(int)
    aeps_count = 0

    for item in withdrawals:
        distribution[item["withdrawalType"]] += item["amount"]
        if item["withdrawalType"] == "ATM" and item.get("location"):
            atm_locations[item["location"]] += 1
        if item["withdrawalType"] == "AEPS":
            aeps_count += 1

    return {
        "totalWithdrawn": total,
        "withdrawalTypeDistribution": dict(distribution),
        "atmLocations": dict(atm_locations),
        "aepsHighRisk": aeps_count >= 2,
    }


def build_recovery(bundle: Dict[str, Any], total_amount: float) -> Dict[str, Any]:
    frozen = sum((item.get("amount") or 0) for item in bundle["holds"] if "HOLD" in item["actionType"])
    reversed_amount = sum((item.get("amount") or 0) for item in bundle["bankActions"] if "FUNDS_NOT_RECEIVED" in item["actionType"])
    withdrawn = sum(item["amount"] for item in bundle["withdrawals"])
    recovered = frozen + reversed_amount
    at_risk = max(total_amount - recovered - withdrawn, 0)
    return {
        "recoveredAmount": recovered,
        "lostAmount": withdrawn,
        "atRiskAmount": at_risk,
        "recoveryRate": (recovered / total_amount) if total_amount > 0 else 0,
    }


def build_patterns(bundle: Dict[str, Any]) -> Dict[str, Any]:
    repeated_accounts_source = [item["receiverAccount"] for item in bundle["transfers"]] + [item.get("accountNumber") for item in bundle["withdrawals"]]
    repeated_accounts = [acc for acc, count in Counter([acc for acc in repeated_accounts_source if acc]).items() if count > 1]
    repeated_ifsc_source = [item.get("receiverIfsc") for item in bundle["transfers"]]
    repeated_ifsc = [ifsc for ifsc, count in Counter([x for x in repeated_ifsc_source if x]).items() if count > 1]
    mule_accounts = list({item.get("accountNumber") for item in bundle["withdrawals"] if item.get("accountNumber")})
    return {
        "repeatedAccounts": repeated_accounts,
        "repeatedIfsc": repeated_ifsc,
        "highFrequencySmallTransactions": len(bundle["smallTransactions"]),
        "muleAccounts": mule_accounts,
    }


def risk_level(score: float) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 65:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def build_risk(bundle: Dict[str, Any], total_amount: float, timeline: Dict[str, Any], withdrawal: Dict[str, Any]) -> Dict[str, Any]:
    max_layer = max([item["layerLevel"] for item in bundle["transfers"]], default=(2 if bundle["withdrawals"] else 1))
    delay_factor = 3 if timeline["delayInHours"] > 72 else 2 if timeline["delayInHours"] > 24 else 1
    withdrawal_flag = 1 if withdrawal["totalWithdrawn"] > 0 else 0
    amount_factor = 4 if total_amount >= 1_000_000 else 3 if total_amount >= 100_000 else 2 if total_amount >= 25_000 else 1
    action_density = 2 if len(bundle["holds"]) + len(bundle["bankActions"]) > 50 else 1 if len(bundle["holds"]) + len(bundle["bankActions"]) > 10 else 0
    small_txn_factor = 1 if len(bundle["smallTransactions"]) > 20 else 0
    score = min(max_layer * 18 + delay_factor * 12 + withdrawal_flag * 20 + amount_factor * 12 + action_density * 10 + small_txn_factor * 8, 100)
    return {
        "score": score,
        "level": risk_level(score),
        "factors": {
            "layerLevel": max_layer,
            "delayInHours": timeline["delayInHours"],
            "withdrawalFlag": withdrawal_flag,
            "amount": total_amount,
            "actionDensity": action_density,
            "smallTransactionCount": len(bundle["smallTransactions"]),
        },
    }


def build_bank_insights(bundle: Dict[str, Any], recovery: Dict[str, Any]) -> List[Dict[str, Any]]:
    banks: Dict[str, Dict[str, Any]] = {}
    baseline = bundle_start_timestamp(bundle)

    def ensure(bank_name: Optional[str]) -> Optional[Dict[str, Any]]:
        if not bank_name:
            return None
        if bank_name not in banks:
            banks[bank_name] = {"bankName": bank_name, "freezeCount": 0, "response": []}
        return banks[bank_name]

    for item in bundle["transfers"]:
        ensure(item.get("receiverBankName"))
    for item in bundle["withdrawals"]:
        ensure(item.get("bankName"))
    for hold in bundle["holds"]:
        bank = ensure(hold.get("bankName"))
        if bank:
            bank["freezeCount"] += 1
    for action in bundle["bankActions"]:
        bank = ensure(action.get("bankName"))
        dt = to_dt(action.get("timestamp"))
        if bank and baseline and dt:
            bank["response"].append(max((dt - baseline).total_seconds() / 3600, 0))

    result = []
    for item in banks.values():
        response = item["response"]
        result.append({
            "bankName": item["bankName"],
            "freezeCount": item["freezeCount"],
            "recoveryRate": recovery["recoveryRate"],
            "avgResponseTime": (sum(response) / len(response)) if response else 0,
        })
    return result


def build_bundle_analysis(bundle: Dict[str, Any]) -> Dict[str, Any]:
    total_amount = exposure_amount(bundle)
    money_trail = build_money_trail(bundle)
    timeline = build_timeline(bundle)
    withdrawal = build_withdrawal_intelligence(bundle["withdrawals"])
    recovery = build_recovery(bundle, total_amount)
    risk = build_risk(bundle, total_amount, timeline, withdrawal)
    patterns = build_patterns(bundle)
    bank_insights = build_bank_insights(bundle, recovery)
    return {
        "acknowledgementNo": bundle["acknowledgementNo"],
        "totalAmount": total_amount,
        "transferCount": len(bundle["transfers"]),
        "withdrawalCount": len(bundle["withdrawals"]),
        "holdCount": len(bundle["holds"]),
        "bankActionCount": len(bundle["bankActions"]),
        "smallTransactionCount": len(bundle["smallTransactions"]),
        "moneyTrail": money_trail,
        "timeline": timeline,
        "withdrawalIntelligence": withdrawal,
        "recovery": recovery,
        "risk": risk,
        "patternInsights": patterns,
        "bankInsights": bank_insights,
    }


def build_diagnostics(bundle_map: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    acknowledgements = []
    for bundle in bundle_map.values():
        acknowledgements.append({
            "acknowledgementNo": bundle["acknowledgementNo"],
            "transferCount": len(bundle["transfers"]),
            "withdrawalCount": len(bundle["withdrawals"]),
            "holdCount": len(bundle["holds"]),
            "bankActionCount": len(bundle["bankActions"]),
            "smallTransactionCount": len(bundle["smallTransactions"]),
            "evidenceScore": evidence_score(bundle),
        })
    acknowledgements.sort(key=lambda item: item["evidenceScore"], reverse=True)
    dominant = acknowledgements[0] if acknowledgements else None
    warnings = []
    if len(acknowledgements) > 1:
        warnings.append(f"Workbook contains {len(acknowledgements)} distinct acknowledgement groups; analysis should prioritize the dominant evidence bundle.")
    if dominant and dominant["transferCount"] == 0:
        warnings.append(
            f"Dominant acknowledgement {dominant['acknowledgementNo']} has no money-trail transfer rows; timeline and withdrawal intelligence are available, but transfer graph is incomplete."
        )
    return {
        "acknowledgementCount": len(acknowledgements),
        "dominantAcknowledgement": dominant["acknowledgementNo"] if dominant else None,
        "acknowledgements": acknowledgements,
        "warnings": warnings,
    }


def round2(value: float) -> float:
    return round(float(value), 2)


def round4(value: float) -> float:
    return round(float(value), 4)


def build_report(file_path: str, parsed: Dict[str, Any]) -> Dict[str, Any]:
    bundle_map = derive_bundle_map(parsed)
    diagnostics = build_diagnostics(bundle_map)
    dominant_bundle = bundle_map.get(diagnostics["dominantAcknowledgement"]) if diagnostics["dominantAcknowledgement"] else None
    if not dominant_bundle:
        raise RuntimeError("No dominant case could be derived from workbook")
    dominant_case = build_bundle_analysis(dominant_bundle)

    total_withdrawn = dominant_case["withdrawalIntelligence"]["totalWithdrawn"]
    distribution = {}
    for channel, amount in dominant_case["withdrawalIntelligence"]["withdrawalTypeDistribution"].items():
        distribution[channel] = {
            "amount": round2(amount),
            "percentage": round2((amount / total_withdrawn) * 100) if total_withdrawn > 0 else 0,
        }

    transfer_available = dominant_case["transferCount"] > 0
    withdrawal_available = dominant_case["withdrawalCount"] > 0
    hold_available = dominant_case["holdCount"] > 0
    micro_available = dominant_case["smallTransactionCount"] > 0
    multi_channel = len(dominant_case["withdrawalIntelligence"]["withdrawalTypeDistribution"]) >= 3
    cheque_amount = dominant_case["withdrawalIntelligence"]["withdrawalTypeDistribution"].get("CHEQUE", 0)
    cheque_dominance = cheque_amount > total_withdrawn * 0.5

    warnings = []
    if not transfer_available:
        warnings.append("No money transfer records found for the case -> graph reconstruction limited")
    if withdrawal_available and hold_available:
        warnings.append("Heavy dependency on withdrawal and hold data")
    if diagnostics["acknowledgementCount"] == 1:
        warnings.append("Single acknowledgement dominates entire dataset")
    warnings.extend(diagnostics["warnings"])
    warnings = list(dict.fromkeys(warnings))

    recovery = dominant_case["recovery"]
    timeline = dominant_case["timeline"]
    risk = dominant_case["risk"]

    return {
        "file": re.sub(r"^\d+-", "", Path(file_path).name),
        "metadata": {
            "totalSheets": len(parsed["metadata"]["sheets"]),
            "sheetNames": [normalize_sheet_name(name) for name in parsed["metadata"]["sheets"]],
            "totalRows": parsed["metadata"]["totalRows"],
        },
        "diagnostics": {
            "totalAcknowledgements": diagnostics["acknowledgementCount"],
            "dominantAcknowledgement": diagnostics["dominantAcknowledgement"],
            "dataCompleteness": {
                "transferDataAvailable": transfer_available,
                "withdrawalDataAvailable": withdrawal_available,
                "holdDataAvailable": hold_available,
                "microTransactionDataAvailable": micro_available,
            },
            "counts": {
                "transferCount": dominant_case["transferCount"],
                "withdrawalCount": dominant_case["withdrawalCount"],
                "holdCount": dominant_case["holdCount"],
                "bankActionCount": dominant_case["bankActionCount"],
                "smallTransactionCount": dominant_case["smallTransactionCount"],
            },
            "warnings": warnings,
        },
        "caseSummary": {
            "acknowledgementNo": dominant_case["acknowledgementNo"],
            "financials": {
                "totalFraudAmount": round2(dominant_case["totalAmount"]),
                "totalWithdrawn": round2(total_withdrawn),
                "totalRecovered": round2(recovery["recoveredAmount"]),
                "amountAtRisk": round2(recovery["atRiskAmount"]),
            },
            "counts": {
                "withdrawals": dominant_case["withdrawalCount"],
                "holds": dominant_case["holdCount"],
                "bankActions": dominant_case["bankActionCount"],
                "microTransactions": dominant_case["smallTransactionCount"],
            },
        },
        "moneyTrail": {
            "status": "AVAILABLE" if transfer_available else "INCOMPLETE",
            "reason": "Transfer-layer records available" if transfer_available else "No transfer-layer data (L1/L2/L3 missing)",
            "graphMode": dominant_case["moneyTrail"]["graphMode"],
            "possibleInference": (
                ["Direct transfer path available from dataset"]
                if transfer_available
                else ["Money likely distributed across multiple accounts before withdrawal", "Layering exists but not recorded in dataset"]
            ),
        },
        "timeline": {
            "totalDelayHours": round2(timeline["delayInHours"]),
            "totalDelayDays": round2(timeline["delayInHours"] / 24),
            "delayCategory": timeline["delayCategory"],
            "interpretation": (
                ["Extremely delayed response", "High probability of complete fund dispersion", "Recovery efficiency significantly reduced"]
                if timeline["delayCategory"] == "CRITICAL"
                else ["Response delay is material", "Partial dispersion likely", "Recovery still possible with focused action"]
                if timeline["delayCategory"] == "MEDIUM"
                else ["Rapid response window", "Recovery prospects comparatively stronger"]
            ),
        },
        "withdrawalIntelligence": {
            "totalWithdrawn": round2(total_withdrawn),
            "distribution": distribution,
            "riskFlags": {
                "aepsHighRisk": dominant_case["withdrawalIntelligence"]["aepsHighRisk"],
                "chequeDominance": cheque_dominance,
                "multiChannelWithdrawal": multi_channel,
            },
        },
        "recoveryAnalysis": {
            "recoveredAmount": round2(recovery["recoveredAmount"]),
            "lostAmount": round2(recovery["lostAmount"]),
            "atRiskAmount": round2(recovery["atRiskAmount"]),
            "recoveryRate": round4(recovery["recoveryRate"]),
            "interpretation": [
                "Moderate recovery achieved despite high delay" if recovery["recoveryRate"] >= 0.4 else "Recovery remains limited relative to fraud scale",
                "Significant amount already withdrawn" if recovery["lostAmount"] > 0 else "Limited confirmed cash-out observed",
                "Remaining funds at risk if not acted immediately" if recovery["atRiskAmount"] > 0 else "Residual exposure currently low",
            ],
        },
        "microFraudAnalysis": {
            "totalSmallTransactions": dominant_case["smallTransactionCount"],
            "pattern": "HIGH_FREQUENCY_LOW_VALUE" if dominant_case["smallTransactionCount"] > 100 else "LOW_VOLUME",
            "insights": (
                ["Likely bot-driven or bulk phishing activity", "Used for testing or distributing fraud load", "Indicates organized fraud operation"]
                if dominant_case["smallTransactionCount"] > 100
                else ["Micro-transaction activity not dominant in this dataset"]
            ),
        },
        "holdAnalysis": {
            "totalHoldCases": dominant_case["holdCount"],
            "totalHoldAmount": round2(recovery["recoveredAmount"]),
            "effectiveness": "HIGH" if recovery["recoveredAmount"] > recovery["lostAmount"] * 0.5 else "MODERATE",
            "insights": [
                "Large portion of funds intercepted before withdrawal",
                "Early-stage intervention exists but delayed overall action reduces impact",
            ],
        },
        "bankActionAnalysis": {
            "totalActions": dominant_case["bankActionCount"],
            "effectivenessBreakdown": {
                "effective": ["freeze", "reverse", "refund"],
                "ineffective": ["pending", "under investigation"],
            },
            "insights": [
                "Limited number of actions compared to total transactions",
                "Action density is low relative to fraud scale",
                "Indicates delayed or insufficient response",
            ],
        },
        "riskAssessment": {
            "score": risk["score"],
            "level": risk["level"],
            "factors": {
                "delayImpact": "EXTREME" if timeline["delayCategory"] == "CRITICAL" else timeline["delayCategory"],
                "withdrawalCompleted": recovery["lostAmount"] > 0,
                "multiChannelFraud": multi_channel,
                "highAmount": dominant_case["totalAmount"] >= 100000,
                "highFrequencyMicroFraud": dominant_case["smallTransactionCount"] > 100,
                "incompleteMoneyTrail": not transfer_available,
            },
            "interpretation": [
                "Full-scale fraud case with advanced laundering behavior",
                "Immediate intervention required",
                "High likelihood of organized crime involvement",
            ],
        },
        "fraudPattern": {
            "type": "TRACEABLE_TRANSFER_FRAUD" if transfer_available else "LAYERED_DISTRIBUTED_FRAUD",
            "characteristics": [
                "high volume transactions",
                "multi-channel withdrawal" if multi_channel else "single-channel withdrawal",
                "delayed action response",
                "partial recovery" if recovery["recoveredAmount"] > 0 else "limited recovery",
                "transfer trace available" if transfer_available else "missing transfer trace",
            ],
        },
        "systemGaps": {
            "criticalMissing": ["real-time tracking"] if transfer_available else ["money trail graph (L1-L3)", "account linkage mapping", "real-time tracking"],
            "dataLimitations": [
                "transfer layer partially available" if transfer_available else "no transfer sheet linkage",
                "single case dominance" if diagnostics["acknowledgementCount"] == 1 else "multi acknowledgement workbook",
                "incomplete relational mapping",
            ],
        },
        "finalVerdict": {
            "caseSeverity": risk["level"],
            "fraudScale": "LARGE" if dominant_case["totalAmount"] >= 1_000_000 else "MEDIUM",
            "operationType": "ORGANIZED" if multi_channel or dominant_case["smallTransactionCount"] > 100 else "STRUCTURED",
            "recoveryStatus": "STRONG" if recovery["recoveryRate"] >= 0.7 else "PARTIAL" if recovery["recoveryRate"] >= 0.3 else "LOW",
            "investigationPriority": "HIGH" if risk["level"] == "CRITICAL" else "MEDIUM",
        },
    }


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"message": "Usage: analyzer_engine.py <parse|report> <filePath>"}))
        return 1

    mode = sys.argv[1]
    file_path = sys.argv[2]
    parsed = parse_workbook(file_path)

    if mode == "parse":
        print(json.dumps(parsed))
        return 0
    if mode == "report":
        print(json.dumps(build_report(file_path, parsed)))
        return 0

    print(json.dumps({"message": f"Unknown mode: {mode}"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
