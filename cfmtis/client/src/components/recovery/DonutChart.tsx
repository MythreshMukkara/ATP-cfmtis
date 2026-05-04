import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export const RecoveryDonutChart = ({
  recoverable,
  atRisk,
  lost
}: {
  recoverable: number;
  atRisk: number;
  lost: number;
}) => {
  const data = [
    { name: "Recoverable", value: recoverable, color: "#00a8ff" },
    { name: "At Risk", value: atRisk, color: "#ff7c2a" },
    { name: "Withdrawn/Lost", value: lost, color: "#ff3a3a" }
  ];

  return (
    <div className="panel-card h-[320px] p-5">
      <div className="section-header">Recovery Distribution</div>
      <div className="grid h-[90%] grid-cols-[1fr_160px] items-center gap-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={70} outerRadius={100} paddingAngle={4}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid gap-3 text-sm">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ background: entry.color }} />
              <div>
                <div className="text-primary">{entry.name}</div>
                <div className="font-mono text-secondary">₹{Math.round(entry.value).toLocaleString("en-IN")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
