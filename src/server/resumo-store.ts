import { getExcelData } from './excel-store';

export interface EpicoPorMes {
  mes: string;
  planejado: number;
  realizado: number;
}

export interface TagLE {
  tag: string;
  quantidade: number;
}

export interface DemandasInfo {
  total: number;
  pontos: number;
}

export interface PontosPorSprint {
  sprint: string;
  pontos: number;
}

export interface ResumoData {
  epicosPorMes: EpicoPorMes[];
  tagsLE: TagLE[];
  demandas: DemandasInfo;
  pontosPorSprint: PontosPorSprint[];
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [datePart] = String(dateStr).split(' ');
  if (!datePart) return null;
  const parts = datePart.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0] ?? '0');
  const m = parseInt(parts[1] ?? '0');
  const y = parseInt(parts[2] ?? '0');
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeWorkItemType(row: Record<string, any>): string {
  return String(row['Work Item Type'] ?? row['Work Item Type '] ?? '').trim();
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)} - ${fmt(end)}`;
}

function findMinDate(rows: Record<string, any>[]): Date {
  const dateFields = ['Start Date', 'Target Date', 'Activated Date', 'State Change Date'];
  let minTime = Infinity;
  for (const row of rows) {
    for (const field of dateFields) {
      const d = parseDate(row[field]);
      if (d && d.getTime() < minTime) minTime = d.getTime();
    }
  }
  if (minTime === Infinity) return new Date(2026, 0, 1);
  return new Date(minTime);
}

export function getResumoData(): ResumoData {
  const rows = getExcelData();

  const epistobs = rows.filter(r => normalizeWorkItemType(r) === 'Épico');
  const demandas = rows.filter(r => normalizeWorkItemType(r) === 'Demanda');

  const mesMap = new Map<string, { planejado: number; realizado: number }>();

  for (const ep of epistobs) {
    const startDate = parseDate(ep['Start Date']);
    const activatedDate = parseDate(ep['Activated Date']);

    if (startDate) {
      const key = getMonthKey(startDate);
      const entry = mesMap.get(key) ?? { planejado: 0, realizado: 0 };
      entry.planejado++;
      mesMap.set(key, entry);
    }

    if (activatedDate) {
      const key = getMonthKey(activatedDate);
      const entry = mesMap.get(key) ?? { planejado: 0, realizado: 0 };
      entry.realizado++;
      mesMap.set(key, entry);
    }
  }

  const allMonths = Array.from(mesMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  const epicosPorMes = allMonths.map(([mes, counts]) => ({
    mes,
    planejado: counts.planejado,
    realizado: counts.realizado,
  }));

  const tagMap = new Map<string, number>();
  for (const ep of epistobs) {
    const tagsRaw = String(ep['Tags'] ?? '').trim();
    if (!tagsRaw) continue;
    const tags = tagsRaw.split(';').map(t => t.trim()).filter(t => t.startsWith('LE:'));
    for (const tag of tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  const tagsLE = Array.from(tagMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, quantidade]) => ({ tag, quantidade }));

  let totalDemandas = 0;
  let pontosDemandas = 0;
  for (const d of demandas) {
    totalDemandas++;
    pontosDemandas += parseInt(d['Effort'] as string) || 0;
  }

  const minDate = findMinDate(rows);
  const SPRINT_MS = 14 * 24 * 60 * 60 * 1000;
  const sprintMap = new Map<string, number>();

  for (const row of rows) {
    const effort = parseInt(row['Effort'] as string) || 0;
    if (effort === 0) continue;

    const startDate = parseDate(row['Start Date']);
    if (!startDate) continue;

    const diffMs = startDate.getTime() - minDate.getTime();
    const sprintIndex = Math.max(0, Math.floor(diffMs / SPRINT_MS));
    const sprintStart = new Date(minDate.getTime() + sprintIndex * SPRINT_MS);
    const sprintEnd = new Date(sprintStart.getTime() + 13 * 24 * 60 * 60 * 1000);
    const label = `S${sprintIndex + 1} (${formatDateRange(sprintStart, sprintEnd)})`;

    sprintMap.set(label, (sprintMap.get(label) ?? 0) + effort);
  }

  const pontosPorSprint = Array.from(sprintMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sprint, pontos]) => ({ sprint, pontos }));

  return {
    epicosPorMes,
    tagsLE,
    demandas: { total: totalDemandas, pontos: pontosDemandas },
    pontosPorSprint,
  };
}
