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
    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2.5">
      <div className="p-1.5 bg-indigo-600 rounded-lg text-white">{icon}</div>
      <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
    </div>
    <div className="p-5">{children}</div>
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
      <div className="max-w-[1200px] mx-auto space-y-5">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
          <Skeleton className="h-72" />
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
            <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
              <BarChart3 size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Resumo</h1>
              <p className="text-slate-500 font-medium text-xs">Visão consolidada do portfólio</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all border border-slate-200 active:scale-95"
          >
            <ChevronLeft size={14} /> Gantt
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <Card title="Épicos por Mês" icon={<Calendar size={18} />}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.epicosPorMes} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fontWeight: 600 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} width={24} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  labelStyle={{ fontWeight: 700 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                  formatter={(value) => (value === 'planejado' ? 'Planejado' : 'Realizado')}
                  iconSize={10}
                />
                <Bar dataKey="planejado" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="planejado" maxBarSize={24} />
                <Bar dataKey="realizado" fill="#6366f1" radius={[4, 4, 0, 0]} name="realizado" maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Tags LE:" icon={<Tags size={18} />}>
            {data.tagsLE.length === 0 ? (
              <div className="flex items-center justify-center h-56 text-slate-400 font-bold text-sm">
                Nenhuma tag LE: encontrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.tagsLE} layout="vertical" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} width={24} />
                  <YAxis
                    type="category"
                    dataKey="tag"
                    tick={{ fontSize: 10, fontWeight: 600 }}
                    stroke="#94a3b8"
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelStyle={{ fontWeight: 700 }}
                    formatter={(value) => [value, 'Épicos']}
                  />
                  <Bar dataKey="quantidade" radius={[0, 4, 4, 0]} name="quantidade" maxBarSize={20}>
                    {data.tagsLE.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Demandas</span>
                <div className="flex gap-3">
                  <span className="font-bold text-indigo-600">{data.demandas.total} itens</span>
                  <span className="font-bold text-emerald-600">{data.demandas.pontos} pts</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Pontos por Sprint" icon={<Target size={18} />}>
          {data.pontosPorSprint.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-slate-400 font-bold text-sm">
              Nenhum dado de sprint disponível
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.pontosPorSprint} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="sprint"
                  tick={{ fontSize: 10, fontWeight: 600 }}
                  stroke="#94a3b8"
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  labelStyle={{ fontWeight: 700 }}
                   formatter={(value) => [value, 'Pontos']}
                />
                <Bar dataKey="pontos" fill="#6366f1" radius={[4, 4, 0, 0]} name="pontos" maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-bold text-slate-400 text-center">
          Portfolio Strategy — Resumo v1.0
        </div>
      </div>
    </div>
  );
}
