interface StatCardProps {
  label: string;
  value: number | string;
  colour?: 'zinc' | 'blue' | 'green' | 'amber';
}

const colourMap = {
  zinc: 'text-zinc-900',
  blue: 'text-blue-600',
  green: 'text-green-600',
  amber: 'text-amber-600',
};

export default function StatCard({ label, value, colour = 'zinc' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${colourMap[colour]}`}>
        {value}
      </p>
    </div>
  );
}
