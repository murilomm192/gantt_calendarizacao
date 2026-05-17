'use client'

import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  BarChart3,
  Calendar,
  Tags,
  Target,
  ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { ResumoData } from '~/server/resumo-store';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
);

const Card = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
      <div className="p-1.5 bg-indigo-600 rounded-lg text-white">{icon}</div>
      <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

export default function ResumoPage() {
  const [data, setData] = useState<ResumoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/resumo');
        const json = (await res.json()) as { success: boolean; data: ResumoData };
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError('Falha ao carregar dados');
        }
      } catch {
        setError('Erro de conexão');
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
        <div className="max-w-[1400px] mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center max-w-md">
          <p className="text-lg font-bold text-red-600">{error ?? 'Dados não disponíveis'}</p>
          <Link href="/" className="mt-4 inline-flex items-center gap-2 text-indigo-600 font-bold hover:underline">
            <ChevronLeft size={16} /> Voltar ao Gantt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <BarChart3 size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Resumo</h1>
              <p className="text-slate-500 font-medium text-sm">Visão consolidada do portfólio</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-bold transition-all border border-slate-200 active:scale-95"
          >
            <ChevronLeft size={16} /> Gantt
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <Card title="Épicos por Mês" icon={<Calendar size={20} />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.epicosPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fontWeight: 600 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  labelStyle={{ fontWeight: 700 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                  formatter={(value) => (value === 'planejado' ? 'Planejado' : 'Realizado')}
                />
                <Bar dataKey="planejado" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="planejado" />
                <Bar dataKey="realizado" fill="#6366f1" radius={[4, 4, 0, 0]} name="realizado" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Tags LE:" icon={<Tags size={20} />}>
            {data.tagsLE.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-400 font-bold text-sm">
                Nenhuma tag LE: encontrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.tagsLE} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="tag"
                    tick={{ fontSize: 10, fontWeight: 600 }}
                    stroke="#94a3b8"
                    width={160}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelStyle={{ fontWeight: 700 }}
                    formatter={(value) => [value, 'Épicos']}
                  />
                  <Bar dataKey="quantidade" radius={[0, 4, 4, 0]} name="quantidade">
                    {data.tagsLE.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-600">Demandas</span>
                <div className="flex gap-4">
                  <span className="font-bold text-indigo-600">{data.demandas.total} itens</span>
                  <span className="font-bold text-emerald-600">{data.demandas.pontos} pts</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Pontos por Sprint" icon={<Target size={20} />}>
          {data.pontosPorSprint.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-400 font-bold text-sm">
              Nenhum dado de sprint disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={data.pontosPorSprint}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="sprint"
                  tick={{ fontSize: 10, fontWeight: 600 }}
                  stroke="#94a3b8"
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  labelStyle={{ fontWeight: 700 }}
                   formatter={(value) => [value, 'Pontos']}
                />
                <Bar dataKey="pontos" fill="#6366f1" radius={[4, 4, 0, 0]} name="pontos" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-400 text-center">
          Portfolio Strategy — Resumo v1.0
        </div>
      </div>
    </div>
  );
}
