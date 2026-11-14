import { useState } from 'react';
import { Mountain, Route, Timer, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Stage = { name: string; km: number; climb: number; hours: number; profile: number[] };

const stages: Stage[] = [
  { name: 'Bad Harzburg – Torfhaus', km: 14, climb: 560, hours: 4, profile: [300, 340, 420, 510, 600, 690, 760, 800] },
  { name: 'Torfhaus – Brocken', km: 9, climb: 380, hours: 3, profile: [800, 820, 870, 930, 1010, 1080, 1141] },
  { name: 'Brocken – Schierke', km: 7, climb: 0, hours: 2, profile: [1141, 1060, 960, 850, 760, 690, 640] },
];

const tiles = [
  { icon: Route, label: 'Distance', value: '30 km', tone: 'text-sky-600 dark:text-sky-400' },
  { icon: TrendingUp, label: 'Climb', value: '940 m', tone: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Timer, label: 'Walking time', value: '9 h', tone: 'text-amber-600 dark:text-amber-400' },
];

export default function TrailStats() {
  const [selected, setSelected] = useState(1);
  const stage = stages[selected];
  const data = stage.profile.map((m, i) => ({ km: ((stage.km * i) / (stage.profile.length - 1)).toFixed(1), m }));

  return (
    <div className="min-h-screen bg-stone-50 p-6 text-stone-800 dark:bg-slate-900 dark:text-slate-200">
      <div className="mx-auto max-w-[812px] space-y-5">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white">
            <Mountain size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Harz in three stages</h1>
            <p className="text-sm text-stone-500 dark:text-slate-400">Late autumn · Bad Harzburg to Schierke</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-4">
          {tiles.map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${tone}`}>
                <Icon size={15} /> {label}
              </div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Elevation · {stage.name}</h2>
            <div className="flex gap-1">
              {stages.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => setSelected(i)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    i === selected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  Stage {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
                <XAxis dataKey="km" unit=" km" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={['dataMin - 50', 'dataMax + 50']} unit=" m" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip />
                <Area type="monotone" dataKey="m" stroke="#059669" strokeWidth={2} fill="#10b981" fillOpacity={0.25} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500 dark:text-slate-400">
              <th className="py-1.5 font-semibold">Stage</th>
              <th className="py-1.5 text-right font-semibold">Distance</th>
              <th className="py-1.5 text-right font-semibold">Climb</th>
              <th className="py-1.5 text-right font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.name} className="border-t border-stone-200 dark:border-slate-700">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right tabular-nums">{s.km} km</td>
                <td className="py-1.5 text-right tabular-nums">{s.climb ? `${s.climb} m` : '–'}</td>
                <td className="py-1.5 text-right tabular-nums">{s.hours} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
