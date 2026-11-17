import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type GradeChartItem = { name: string; nota: number }

export default function GradeChart({ data }: { data: GradeChartItem[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" angle={-15} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 'auto']} />
          <Tooltip />
          <Bar dataKey="nota" fill="#2f7664" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
