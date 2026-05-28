"use client";

import React, { useMemo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  User,
  FolderOpen,
  FileText,
  Trophy,
  ChevronRight,
  ChevronDown,
  BarChart3,
} from "lucide-react";
import type { Activity } from "./page";

interface ChildSummary {
  id: string | number;
  name: string;
  points: number;
}

interface ParentSummary {
  id: string | number;
  name: string;
  kind: "Épico" | "Demanda";
  points: number;
  children: ChildSummary[];
}

interface DevSummary {
  dev: string;
  epicoParents: ParentSummary[];
  demandaParents: ParentSummary[];
  epicoTotal: number;
  demandaTotal: number;
  totalPoints: number;
}

interface SprintOption {
  label: string;
  sortKey: number;
}

interface ComputedSprintData {
  devEntries: DevSummary[];
  sprintEpicoTotal: number;
  sprintDemandaTotal: number;
  sprintTotal: number;
}

interface GrandTotals {
  epicoTotal: number;
  demandaTotal: number;
  total: number;
}

interface SprintResumoModalProps {
  isOpen: boolean;
  activities: Activity[];
  onClose: () => void;
}

export default function SprintResumoModal({
  isOpen,
  activities,
  onClose,
}: SprintResumoModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [expandedDevs, setExpandedDevs] = useState<Set<string>>(new Set());
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedSprint(null);
      setExpandedDevs(new Set());
      setExpandedParents(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const toggleDev = (key: string) => {
    setExpandedDevs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleParent = (key: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sprintOptions: SprintOption[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const act of activities) {
      if (act.isChild && act.sprintName) {
        const existing = map.get(act.sprintName);
        if (existing === undefined || act.planStart < existing) {
          map.set(act.sprintName, act.planStart);
        }
      }
    }
    return Array.from(map.entries())
      .map(([label, sortKey]) => ({ label, sortKey }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [activities]);

  const sprintData: ComputedSprintData = useMemo(() => {
    if (!selectedSprint) {
      return {
        devEntries: [],
        sprintEpicoTotal: 0,
        sprintDemandaTotal: 0,
        sprintTotal: 0,
      };
    }

    const parentMap = new Map<string | number, Activity>();
    for (const act of activities) {
      if (act.isParent) parentMap.set(act.id, act);
    }

    const sprintChildren = activities.filter(
      (a) => a.isChild && a.sprintName === selectedSprint,
    );

    const devParentData = new Map<
      string,
      Map<string | number, ParentSummary>
    >();

    for (const child of sprintChildren) {
      const dev = child.assignedTo;
      if (!dev) continue;

      const parent =
        child.parentId != null ? parentMap.get(child.parentId) : undefined;
      const parentId = child.parentId ?? `orphan-${child.id}`;
      const parentName = parent?.name ?? "(Sem vínculo)";
      const isDemanda = parent?.workItemType === "Demanda";
      const kind: "Épico" | "Demanda" = isDemanda ? "Demanda" : "Épico";

      if (!devParentData.has(dev)) {
        devParentData.set(dev, new Map());
      }
      const inner = devParentData.get(dev)!;

      if (!inner.has(parentId)) {
        inner.set(parentId, {
          id: parentId,
          name: parentName,
          kind,
          points: 0,
          children: [],
        });
      }
      const entry = inner.get(parentId)!;
      entry.points += child.effortPoints ?? 0;
      entry.children.push({
        id: child.id,
        name: child.name,
        points: child.effortPoints ?? 0,
      });
    }

    const entries: DevSummary[] = Array.from(devParentData.entries())
      .map(([dev, parents]) => {
        const list = Array.from(parents.values());
        const epicoParents = list.filter((p) => p.kind === "Épico");
        const demandaParents = list.filter((p) => p.kind === "Demanda");
        const epicoTotal = epicoParents.reduce((s, p) => s + p.points, 0);
        const demandaTotal = demandaParents.reduce((s, p) => s + p.points, 0);
        return {
          dev,
          epicoParents,
          demandaParents,
          epicoTotal,
          demandaTotal,
          totalPoints: epicoTotal + demandaTotal,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    const sprintEpicoTotal = entries.reduce((s, e) => s + e.epicoTotal, 0);
    const sprintDemandaTotal = entries.reduce((s, e) => s + e.demandaTotal, 0);

    return {
      devEntries: entries,
      sprintEpicoTotal,
      sprintDemandaTotal,
      sprintTotal: sprintEpicoTotal + sprintDemandaTotal,
    };
  }, [selectedSprint, activities]);

  const grandTotals: GrandTotals = useMemo(() => {
    let epicoTotal = 0;
    let demandaTotal = 0;
    const parentMap = new Map<string | number, Activity>();
    for (const act of activities) {
      if (act.isParent) parentMap.set(act.id, act);
    }
    for (const child of activities) {
      if (!child.isChild) continue;
      const parent =
        child.parentId != null ? parentMap.get(child.parentId) : undefined;
      const isDemanda = parent?.workItemType === "Demanda";
      if (isDemanda) {
        demandaTotal += child.effortPoints ?? 0;
      } else {
        epicoTotal += child.effortPoints ?? 0;
      }
    }
    return { epicoTotal, demandaTotal, total: epicoTotal + demandaTotal };
  }, [activities]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div className="animate-slide-up flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600 p-1.5 text-white">
              <BarChart3 size={18} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                Resumo por Sprint
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sprint Selector */}
        <div className="shrink-0 border-b border-slate-100 px-6 py-3">
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">
              Sprint:
            </label>
            <select
              value={selectedSprint ?? ""}
              onChange={(e) => {
                setSelectedSprint(e.target.value || null);
                setExpandedDevs(new Set());
                setExpandedParents(new Set());
              }}
              className="min-w-[180px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Selecionar...</option>
              {sprintOptions.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {!selectedSprint ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <BarChart3 size={40} className="mb-3 text-slate-300" />
              <p className="text-sm font-bold">Selecione uma sprint</p>
              <p className="text-xs">
                Escolha uma sprint no menu acima para visualizar o resumo.
              </p>
            </div>
          ) : sprintData.devEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <User size={32} className="mb-2 text-slate-300" />
              <p className="text-sm font-bold">Nenhum dado encontrado</p>
              <p className="text-xs">
                Nenhuma atividade associada a esta sprint.
              </p>
            </div>
          ) : (
            sprintData.devEntries.map((entry) => (
              <DevCard
                key={entry.dev}
                entry={entry}
                isExpanded={expandedDevs.has(entry.dev)}
                onToggleDev={toggleDev}
                expandedParents={expandedParents}
                onToggleParent={toggleParent}
              />
            ))
          )}
        </div>

        {/* Footer Totals */}
        <div className="shrink-0 space-y-1.5 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          {selectedSprint && sprintData.devEntries.length > 0 ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-slate-600">
                  <FolderOpen size={14} className="text-amber-600" /> Épicos na{" "}
                  {selectedSprint}
                </span>
                <span className="font-extrabold text-amber-700">
                  {sprintData.sprintEpicoTotal} pts
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-slate-600">
                  <FileText size={14} className="text-sky-600" /> Demandas na{" "}
                  {selectedSprint}
                </span>
                <span className="font-extrabold text-sky-700">
                  {sprintData.sprintDemandaTotal} pts
                </span>
              </div>
              <div className="border-t border-slate-200 pt-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700">
                    Total da {selectedSprint}
                  </span>
                  <span className="text-lg font-extrabold text-indigo-600">
                    {sprintData.sprintTotal} pts
                  </span>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-bold text-slate-500">
                    <Trophy size={14} className="text-emerald-600" /> Acumulado
                    Épicos (Squad)
                  </span>
                  <span className="font-extrabold text-amber-700">
                    {grandTotals.epicoTotal} pts
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-bold text-slate-500">
                    <Trophy size={14} className="text-emerald-600" /> Acumulado
                    Demandas (Squad)
                  </span>
                  <span className="font-extrabold text-sky-700">
                    {grandTotals.demandaTotal} pts
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-600">
                    Acumulado Geral (Squad)
                  </span>
                  <span className="text-lg font-extrabold text-emerald-600">
                    {grandTotals.total} pts
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-slate-500">
                  <Trophy size={14} className="text-emerald-600" /> Acumulado
                  Épicos (Squad)
                </span>
                <span className="font-extrabold text-amber-700">
                  {grandTotals.epicoTotal} pts
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-bold text-slate-500">
                  <Trophy size={14} className="text-emerald-600" /> Acumulado
                  Demandas (Squad)
                </span>
                <span className="font-extrabold text-sky-700">
                  {grandTotals.demandaTotal} pts
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-600">
                  Acumulado Geral (Squad)
                </span>
                <span className="text-lg font-extrabold text-emerald-600">
                  {grandTotals.total} pts
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DevCard({
  entry,
  isExpanded,
  onToggleDev,
  expandedParents,
  onToggleParent,
}: {
  entry: DevSummary;
  isExpanded: boolean;
  onToggleDev: (key: string) => void;
  expandedParents: Set<string>;
  onToggleParent: (key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Dev Header — clickable to toggle */}
      <button
        onClick={() => onToggleDev(entry.dev)}
        className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-left transition-colors hover:bg-slate-100"
      >
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-100 p-1 text-indigo-700">
            <User size={14} />
          </div>
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown size={12} className="text-slate-400" />
            ) : (
              <ChevronRight size={12} className="text-slate-400" />
            )}
          </div>
          <span className="text-sm font-extrabold text-slate-900">
            {entry.dev}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="text-amber-700">Épicos: {entry.epicoTotal}</span>
          <span className="text-sky-700">Demandas: {entry.demandaTotal}</span>
          <span className="text-indigo-600">
            Total: {entry.totalPoints} pts
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-3 px-4 py-3">
          {/* Épicos */}
          {entry.epicoParents.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <FolderOpen size={12} className="text-amber-600" />
                <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">
                  Épicos
                </span>
                <span className="ml-auto text-[10px] font-bold text-amber-700">
                  {entry.epicoTotal} pts
                </span>
              </div>
              <div className="space-y-1">
                {entry.epicoParents.map((p) => {
                  const key = `${entry.dev}|${String(p.id)}`;
                  const parentExpanded = expandedParents.has(key);
                  return (
                    <div
                      key={String(p.id)}
                      className="overflow-hidden rounded-lg border border-amber-100/50 bg-amber-50/50"
                    >
                      <button
                        onClick={() => onToggleParent(key)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-amber-100/50"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {parentExpanded ? (
                            <ChevronDown
                              size={10}
                              className="shrink-0 text-amber-500"
                            />
                          ) : (
                            <ChevronRight
                              size={10}
                              className="shrink-0 text-amber-500"
                            />
                          )}
                          <span className="truncate text-[11px] font-semibold text-slate-700">
                            {p.name}
                          </span>
                        </div>
                        <span className="ml-2 shrink-0 text-[10px] font-bold text-amber-700">
                          {p.points} pts
                        </span>
                      </button>
                      {parentExpanded && p.children.length > 0 && (
                        <div className="border-t border-amber-100/50 px-3 pt-1 pb-1.5">
                          {p.children.map((child) => (
                            <div
                              key={String(child.id)}
                              className="flex items-center justify-between py-0.5 pl-4"
                            >
                              <span className="truncate text-[10px] font-medium text-slate-600">
                                {child.name}
                              </span>
                              <span className="ml-2 shrink-0 text-[10px] font-semibold text-amber-600">
                                {child.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Demandas */}
          {entry.demandaParents.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <FileText size={12} className="text-sky-600" />
                <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">
                  Demandas
                </span>
                <span className="ml-auto text-[10px] font-bold text-sky-700">
                  {entry.demandaTotal} pts
                </span>
              </div>
              <div className="space-y-1">
                {entry.demandaParents.map((p) => {
                  const key = `${entry.dev}|${String(p.id)}`;
                  const parentExpanded = expandedParents.has(key);
                  return (
                    <div
                      key={String(p.id)}
                      className="overflow-hidden rounded-lg border border-sky-100/50 bg-sky-50/50"
                    >
                      <button
                        onClick={() => onToggleParent(key)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-sky-100/50"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {parentExpanded ? (
                            <ChevronDown
                              size={10}
                              className="shrink-0 text-sky-500"
                            />
                          ) : (
                            <ChevronRight
                              size={10}
                              className="shrink-0 text-sky-500"
                            />
                          )}
                          <span className="truncate text-[11px] font-semibold text-slate-700">
                            {p.name}
                          </span>
                        </div>
                        <span className="ml-2 shrink-0 text-[10px] font-bold text-sky-700">
                          {p.points} pts
                        </span>
                      </button>
                      {parentExpanded && p.children.length > 0 && (
                        <div className="border-t border-sky-100/50 px-3 pt-1 pb-1.5">
                          {p.children.map((child) => (
                            <div
                              key={String(child.id)}
                              className="flex items-center justify-between py-0.5 pl-4"
                            >
                              <span className="truncate text-[10px] font-medium text-slate-600">
                                {child.name}
                              </span>
                              <span className="ml-2 shrink-0 text-[10px] font-semibold text-sky-600">
                                {child.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
