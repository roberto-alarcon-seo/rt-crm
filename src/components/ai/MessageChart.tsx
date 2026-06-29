import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";

type ChartType = "bar" | "line" | "pie" | "funnel";

export interface DataKeyConfig {
  key: string;
  label: string;
  color?: string;
}

interface Props {
  chartType: ChartType;
  data: Record<string, unknown>[];
  /** Para una sola serie */
  dataKey?: string;
  /** Para múltiples series (barras agrupadas, líneas múltiples) */
  dataKeys?: DataKeyConfig[];
  nameKey?: string;
  title?: string;
  color?: string;
}

const PALETTE = [
  "#8b5cf6", "#10b981", "#06b6d4", "#f59e0b",
  "#ef4444", "#ec4899", "#3b82f6", "#84cc16",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
};

export function MessageChart({
  chartType,
  data,
  dataKey,
  dataKeys,
  nameKey = "name",
  title,
  color = PALETTE[0],
}: Props) {
  const isMulti = dataKeys && dataKeys.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      )}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tooltipStyle} />
              {isMulti && <Legend wrapperStyle={{ fontSize: "11px" }} />}
              {isMulti
                ? dataKeys!.map((dk, i) => (
                    <Bar
                      key={dk.key}
                      dataKey={dk.key}
                      name={dk.label}
                      fill={dk.color ?? PALETTE[i % PALETTE.length]}
                      radius={[3, 3, 0, 0]}
                    />
                  ))
                : <Bar dataKey={dataKey ?? "value"} fill={color} radius={[4, 4, 0, 0]} />}
            </BarChart>
          ) : chartType === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tooltipStyle} />
              {isMulti && <Legend wrapperStyle={{ fontSize: "11px" }} />}
              {isMulti
                ? dataKeys!.map((dk, i) => (
                    <Line
                      key={dk.key}
                      type="monotone"
                      dataKey={dk.key}
                      name={dk.label}
                      stroke={dk.color ?? PALETTE[i % PALETTE.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))
                : (
                    <Line
                      type="monotone"
                      dataKey={dataKey ?? "value"}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ fill: color, strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
            </LineChart>
          ) : chartType === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={dataKey ?? "value"}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          ) : (
            <FunnelChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Funnel dataKey={dataKey ?? "value"} data={data} isAnimationActive>
                <LabelList
                  position="right"
                  fill="hsl(var(--foreground))"
                  stroke="none"
                  dataKey={nameKey}
                  style={{ fontSize: "11px" }}
                />
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Funnel>
            </FunnelChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
