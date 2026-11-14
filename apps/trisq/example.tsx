import { useState } from "react";
import { Activity, Mountain, Timer } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const profile = [
  { km: 0, m: 120 }, { km: 2, m: 180 }, { km: 4, m: 340 }, { km: 6, m: 520 },
  { km: 8, m: 480 }, { km: 10, m: 610 }, { km: 12, m: 450 }, { km: 14, m: 260 }, { km: 16, m: 140 },
];

const runs = [
  { day: "Sat", route: "Lake loop", km: 16.2, time: "1:38:12" },
  { day: "Wed", route: "Hill intervals", km: 9.4, time: "0:52:40" },
  { day: "Mon", route: "Easy river path", km: 6.1, time: "0:35:05" },
];

export default function Example() {
  const [metric, setMetric] = useState<"elevation" | "runs">("elevation");

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
      <h1 className="text-2xl font-semibold">Trisq example</h1>
      <p className="mb-6 text-slate-500">A React component with state, Tailwind classes, icons and a chart – shown straight from this file.</p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { icon: <Activity />, label: "Distance", value: "31.7 km" },
          { icon: <Mountain />, label: "Climb", value: "840 m" },
          { icon: <Timer />, label: "Time", value: "3:05:57" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <span className="text-sky-600">{s.icon}</span>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
              <div className="text-xl font-semibold tabular-nums">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        {(["elevation", "runs"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`rounded-full px-4 py-1 text-sm ${metric === m ? "bg-sky-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {m === "elevation" ? "Elevation" : "Runs"}
          </button>
        ))}
      </div>

      {metric === "elevation" ? (
        <div className="h-64 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <ResponsiveContainer>
            <AreaChart data={profile}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="km" unit=" km" />
              <YAxis unit=" m" />
              <Tooltip />
              <Area dataKey="m" stroke="#0284c7" fill="#bae6fd" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-slate-200">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Day</th><th className="p-3">Route</th><th className="p-3 text-right">km</th><th className="p-3 text-right">Time</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.day} className="border-t border-slate-100">
                <td className="p-3">{r.day}</td><td className="p-3">{r.route}</td>
                <td className="p-3 text-right tabular-nums">{r.km}</td><td className="p-3 text-right tabular-nums">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
