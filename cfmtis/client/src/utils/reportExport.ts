const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeSvgMarkup = (markup: string) =>
  markup
    .replace(/class="[^"]*"/g, "")
    .replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fbfdff;border:1px solid #d7e0e8;border-radius:12px;"');

const openPrintWindow = (title: string, body: string, layout: "portrait" | "landscape" = "portrait") => {
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (!popup) return;

  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #17324a; margin: 0; background: #eef3f7; }
          h1, h2 { margin: 0 0 12px; }
          .report { width: min(1120px, calc(100vw - 32px)); margin: 16px auto; background: #ffffff; border: 1px solid #d7e0e8; border-radius: 16px; padding: 24px; box-shadow: 0 12px 32px rgba(18, 43, 64, 0.08); }
          .report-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #d7e0e8; padding-bottom: 16px; }
          .report-title { font-size: 28px; font-weight: 700; letter-spacing: 0.02em; }
          .meta { margin-top: 8px; color: #50657b; font-size: 14px; }
          .section { margin-top: 24px; }
          .card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
          .card { border: 1px solid #d7e0e8; border-left: 4px solid #3b82f6; border-radius: 10px; padding: 14px; background: #fbfdff; }
          .label { font-size: 12px; color: #61778d; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
          .value { font-size: 20px; font-weight: 700; line-height: 1.2; }
          .graph-frame { border: 1px solid #d7e0e8; border-radius: 12px; padding: 14px; background: #fbfdff; overflow: hidden; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
          th, td { border: 1px solid #d7e0e8; padding: 10px 12px; text-align: left; font-size: 13px; vertical-align: top; word-break: break-word; }
          th { background: #eef3f7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #476075; }
          .pill { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 12px; }
          .muted { color: #61778d; }
          svg { display: block; max-width: 100%; height: auto; }
          .page { min-height: 100vh; }
          @page { size: ${layout === "landscape" ? "A4 landscape" : "A4 portrait"}; margin: 12mm; }
          @media print {
            body { background: #ffffff; }
            .report { width: 100%; margin: 0; border: 0; border-radius: 0; box-shadow: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="page">${body}</div>
        <script>
          const waitForPaint = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const printWhenReady = async () => {
            try {
              if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
              }
              const images = Array.from(document.images || []);
              await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
              })));
              await waitForPaint();
              setTimeout(() => {
                window.focus();
                window.print();
              }, 250);
            } catch (_error) {
              setTimeout(() => {
                window.focus();
                window.print();
              }, 400);
            }
          };

          window.addEventListener("load", printWhenReady, { once: true });
        </script>
      </body>
    </html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
};

export const exportGraphReport = (input: {
  caseId: string;
  victimName: string;
  victimAccount: string;
  fraudAmount: string;
  accounts: number;
  transfers: number;
  depth: number;
  selectedLayerSummary: { accounts: number; enteredAmount: string; leftAmount: string };
  svgMarkup: string;
}) => {
  openPrintWindow(
    `Money Trail Graph - ${input.caseId}`,
    `
      <div class="report">
        <div class="report-header">
          <div>
            <div class="report-title">Money Trail Graph Report</div>
            <div class="meta">Case: ${escapeHtml(input.caseId)} | Victim: ${escapeHtml(input.victimName)}</div>
          </div>
        </div>
        <div class="card-grid">
          <div class="card"><div class="label">Victim Account</div><div class="value">${escapeHtml(input.victimAccount)}</div></div>
          <div class="card"><div class="label">Fraud Amount</div><div class="value">${escapeHtml(input.fraudAmount)}</div></div>
          <div class="card"><div class="label">Graph Scope</div><div class="value">${escapeHtml(`${input.accounts} Accounts · ${input.transfers} Transfers · ${input.depth} Levels`)}</div></div>
        </div>
        <div class="section">
          <h2>Selected Layer Analysis</h2>
          <table>
            <thead>
              <tr><th>Accounts</th><th>Amount In</th><th>Amount Out</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>${input.selectedLayerSummary.accounts}</td>
                <td>${escapeHtml(input.selectedLayerSummary.enteredAmount)}</td>
                <td>${escapeHtml(input.selectedLayerSummary.leftAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="section">
          <h2>Graph</h2>
          <div class="graph-frame">
            ${sanitizeSvgMarkup(input.svgMarkup)}
          </div>
        </div>
      </div>
    `,
    "landscape"
  );
};

export const exportRiskReport = (input: {
  caseId: string;
  victimName: string;
  items: Array<{
    accountNumber: string;
    holderName: string;
    bankName: string;
    currentBalance: string;
    riskScore: number;
    riskLevel: string;
    accountStatus: string;
  }>;
}) => {
  openPrintWindow(
    `Risk and Freeze - ${input.caseId}`,
    `
      <div class="report">
        <div class="report-header">
          <div>
            <div class="report-title">Risk and Freeze Report</div>
            <div class="meta">Case: ${escapeHtml(input.caseId)} | Victim: ${escapeHtml(input.victimName)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Account No.</th>
              <th>Holder Name</th>
              <th>Bank</th>
              <th>Balance</th>
              <th>Risk Score</th>
              <th>Risk Level</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${input.items
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.accountNumber)}</td>
                    <td>${escapeHtml(item.holderName)}</td>
                    <td>${escapeHtml(item.bankName)}</td>
                    <td>${escapeHtml(item.currentBalance)}</td>
                    <td>${item.riskScore}</td>
                    <td>${escapeHtml(item.riskLevel)}</td>
                    <td>${escapeHtml(item.accountStatus)}</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `,
    "landscape"
  );
};

export const exportRecoveryReport = (input: {
  caseId: string;
  victimName: string;
  totals: Array<{ label: string; value: string }>;
  accounts: Array<{ accountNumber: string; balance: string; status: string }>;
  freezeLog: Array<{ accountNumber: string; officer: string; timestamp: string }>;
}) => {
  openPrintWindow(
    `Recovery Report - ${input.caseId}`,
    `
      <div class="report">
        <div class="report-header">
          <div>
            <div class="report-title">Recovery Report</div>
            <div class="meta">Case: ${escapeHtml(input.caseId)} | Victim: ${escapeHtml(input.victimName)}</div>
          </div>
        </div>
        <div class="card-grid">
          ${input.totals
            .map(
              (item) => `
                <div class="card">
                  <div class="label">${escapeHtml(item.label)}</div>
                  <div class="value">${escapeHtml(item.value)}</div>
                </div>`
            )
            .join("")}
        </div>
        <div class="section">
          <h2>Account Distribution</h2>
          <table>
            <thead>
              <tr><th>Account No.</th><th>Balance</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${input.accounts
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(item.accountNumber)}</td>
                      <td>${escapeHtml(item.balance)}</td>
                      <td>${escapeHtml(item.status)}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="section">
          <h2>Freeze Audit Log</h2>
          <table>
            <thead>
              <tr><th>Account No.</th><th>Officer</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              ${input.freezeLog.length
                ? input.freezeLog
                    .map(
                      (item) => `
                        <tr>
                          <td>${escapeHtml(item.accountNumber)}</td>
                          <td>${escapeHtml(item.officer)}</td>
                          <td>${escapeHtml(item.timestamp)}</td>
                        </tr>`
                    )
                    .join("")
                : '<tr><td colspan="3" class="muted">No freeze actions recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `,
    "portrait"
  );
};
