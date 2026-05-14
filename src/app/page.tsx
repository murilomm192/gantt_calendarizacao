'use client'

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Calendar, Info, Target, Upload, Save, RefreshCw, AlertCircle, ChevronRight, ChevronDown, Undo2, Redo2 } from 'lucide-react';
import { useToast } from '~/app/toast';

interface Activity {
  id: string | number;
  name: string;
  planStart: number;
  planDuration: number;
  actualStart: number;
  actualDuration: number;
  percentComplete: number;
  isParent?: boolean;
  isChild?: boolean;
  isCollapsed?: boolean;
  isActualPlaceholder?: boolean;
  effortPoints?: number;
  parentId?: string | number;
  assignedTo?: string;
  childrenCount?: number;
  effortTotal?: number;
  actualStartDateMs?: number; // Internal for parent calculation
  actualEndDateMs?: number;   // Internal for parent calculation
}

interface DragState {
  id: string | number;
  type: 'plan' | 'actual';
  action: 'move' | 'resize-start' | 'resize-end';
  startX: number;
  originalStart: number;
  originalDuration: number;
}

// --- Initial Data ---
const initialActivities: Activity[] = [];

const DAY_WIDTH = 24; // Increased for better readability
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

// --- CSV Parsing Utility ---
const parseDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const [datePart] = dateStr.split(' ');
  if (!datePart) return null;
  const parts = datePart.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0] ?? '0');
  const m = parseInt(parts[1] ?? '0');
  const y = parseInt(parts[2] ?? '0');
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
};

const parseCSV = (text: string) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [] as string[], result: [] as Record<string, string>[], separator: ',' };
  
  // Detect separator based on frequency in the first line
  const firstLine = lines[0] ?? '';
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const separator = semiCount > commaCount ? ';' : ',';
  
  const headers = (lines[0] ?? '').split(separator).map(h => h.replace(/["\r]/g, '').trim());
  const result: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const values: string[] = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        values.push(currentValue.replace(/\r/g, '').trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.replace(/\r/g, '').trim());
    
    const row: Record<string, string> = {};
    headers.forEach((h, index) => {
      row[h] = (values[index] ?? '').replace(/^"|"$/g, '');
    });
    result.push(row);
  }
  return { headers, result, separator };
};

const processCSVData = (data: Record<string, string | number | null | undefined>[]) => {
  let minTime = Infinity;
  // Adjusted filter to include 'Assigned To'
  const validRows = data.filter(r => (r['Work Item Type'] ?? r.Title) && r['Start Date']);
  
  validRows.forEach(row => {
    const start = parseDate(row['Start Date'] as string);
    if (start && start.getTime() < minTime) {
      minTime = start.getTime();
    }
  });

  if (minTime === Infinity) return { mapped: [] as Activity[], minTime: new Date().getTime(), assignees: [] as string[] };

  const getDayDifference = (date: Date | null) => {
     if (!date) return 0;
     const diffMs = date.getTime() - minTime;
     const days = Math.floor(diffMs / ONE_DAY_MS);
     return Math.max(0, days);
  };

  const activities: Activity[] = [];
  const assignees = new Set<string>();
  let currentParent: Activity | null = null;

  for (const row of validRows) {
    if (!row) continue;
    const assignee = row['Assigned To'] as string;
    if (assignee) assignees.add(assignee);
    
    const workItemType = (row['Work Item Type'] ?? row['Work Item Type '] ?? '') as string;
    const workItemTitle = (row['Work Item Title'] ?? row['Work Item Title '] ?? row.Title ?? 'Sem título') as string;
    const isParentItem = workItemType === 'Épico' || workItemType === 'Demanda';
    
    const start = parseDate(row['Start Date'] as string);
    const target = parseDate(row['Target Date'] as string);
    const activated = parseDate(row['Activated Date'] as string);
    const stateChange = parseDate(row['State Change Date'] as string);
    
    const effort = parseInt(row.Effort as string) || 0;
    const planStartDay = getDayDifference(start);
    const planEndDay = target ? getDayDifference(target) : null;
    
    // Percent complete logic
    let percentComplete = 0;
    const state = ((row.State as string) ?? '').toLowerCase();
    if (state.includes('done')) percentComplete = 100;
    else if (state.includes('doing') || state.includes('developing') || state.includes('active')) percentComplete = 50;

    if (isParentItem) {
      currentParent = {
        id: (row.ID as string) ?? `p-${activities.length}`,
        name: workItemTitle,
        planStart: planStartDay,
        planDuration: planEndDay ? Math.max(1, planEndDay - planStartDay) : 7,
        actualStart: planStartDay, // Default, will be updated by children
        actualDuration: 3,        // Default placeholder
        isActualPlaceholder: true, // Start as placeholder
        percentComplete: percentComplete,
        isParent: true,
        effortTotal: 0,
        childrenCount: 0,
        assignedTo: row['Assigned To'] as string,
        actualStartDateMs: Infinity,
        actualEndDateMs: -Infinity
      };
      activities.push(currentParent);
    } else {
      const planDurationDays = planEndDay ? Math.max(1, planEndDay - planStartDay) : 7;
      
      // Child actual logic: min(Activated Date) to max(State Change Date)
      // If dates are missing, fallback to plan
      const childActualStart = activated ? getDayDifference(activated) : planStartDay;
      const childActualEnd = stateChange ? getDayDifference(stateChange) : childActualStart + 1;
      const actualDurationDays = Math.max(1, childActualEnd - childActualStart);
      
      const child: Activity = {
        id: (row.ID as string) ?? `c-${activities.length}`,
        name: workItemTitle,
        planStart: planStartDay,
        planDuration: planDurationDays,
        actualStart: childActualStart,
        actualDuration: actualDurationDays,
        percentComplete: percentComplete,
        isChild: true,
        effortPoints: effort,
        parentId: currentParent?.id,
        assignedTo: row['Assigned To'] as string
      };
      
      activities.push(child);

      if (currentParent) {
        currentParent.childrenCount = (currentParent.childrenCount ?? 0) + 1;
        currentParent.effortTotal = (currentParent.effortTotal ?? 0) + effort;
        currentParent.isActualPlaceholder = false; // Has children, not a placeholder anymore
        
        // Update parent actual boundaries based on children
        if (activated) {
          currentParent.actualStartDateMs = Math.min(currentParent.actualStartDateMs!, activated.getTime());
        } else if (start) {
          // Fallback if child has no activated date
          currentParent.actualStartDateMs = Math.min(currentParent.actualStartDateMs!, start.getTime());
        }

        if (stateChange) {
          currentParent.actualEndDateMs = Math.max(currentParent.actualEndDateMs!, stateChange.getTime());
        } else if (activated) {
          currentParent.actualEndDateMs = Math.max(currentParent.actualEndDateMs!, activated.getTime() + ONE_DAY_MS);
        }

        // Apply updated dates to parent
        if (currentParent.actualStartDateMs !== Infinity) {
          currentParent.actualStart = getDayDifference(new Date(currentParent.actualStartDateMs!));
          if (currentParent.actualEndDateMs !== -Infinity) {
            const endDay = getDayDifference(new Date(currentParent.actualEndDateMs!));
            currentParent.actualDuration = Math.max(1, endDay - currentParent.actualStart);
          } else {
            currentParent.actualDuration = 1;
          }
        }
      }
    }
  }

  return { mapped: activities, minTime, assignees: Array.from(assignees).sort() };
};

const App = () => {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [baseDate, setBaseDate] = useState(new Date(2026, 0, 1));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState<Set<string | number>>(new Set());

  const [undoStack, setUndoStack] = useState<Activity[][]>([]);
  const [redoStack, setRedoStack] = useState<Activity[][]>([]);
  const activitiesRef = useRef(activities);
  activitiesRef.current = activities;
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const { toast } = useToast();

  const toggleCollapsed = (parentId: string | number) => {
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // Store original CSV data for export mapping
  const [rawCsvData, setRawCsvData] = useState<Record<string, string | number | null | undefined>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvSeparator, setCsvSeparator] = useState(',');

  const filteredActivities = useMemo(() => {
    let result = activities;
    
    if (assignedToFilter) {
      const matchedIds = new Set<string | number>();
      
      // First pass: match by assignee and collect parent IDs
      activities.forEach(act => {
        if (act.assignedTo === assignedToFilter) {
          matchedIds.add(act.id);
          if (act.parentId) matchedIds.add(act.parentId);
        }
      });

      // Second pass: if a parent is matched, match all its children to keep the tree view consistent
      activities.forEach(act => {
        if (act.isParent && matchedIds.has(act.id)) {
          activities.filter(child => child.parentId === act.id).forEach(child => {
            matchedIds.add(child.id);
          });
        }
      });

      result = activities.filter(act => matchedIds.has(act.id));
    }

    // Filter out children of collapsed parents
    return result.filter(act => !act.parentId || !collapsedParents.has(act.parentId));
  }, [activities, assignedToFilter, collapsedParents]);

  // Dynamically calculate period count based on the filtered activity list
  const periodCount = useMemo(() => {
    let maxEnd = 1;
    filteredActivities.forEach(act => {
      maxEnd = Math.max(maxEnd, act.planStart + act.planDuration, act.actualStart + act.actualDuration);
    });
    return maxEnd + 10; // Extra padding for visualization
  }, [filteredActivities]);

  const todayOffset = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = now.getTime() - baseDate.getTime();
    return Math.floor(diff / ONE_DAY_MS);
  }, [baseDate]);

  const isTodayVisible = todayOffset >= 0 && todayOffset < periodCount;

  // Resizing state for the "Activity" column
  const [activityWidth, setActivityWidth] = useState(320);
  const [isResizingCol, setIsResizingCol] = useState(false);
  
  // Dragging state for Gantt bars
  const [dragState, setDragState] = useState<DragState | null>(null);
  const startXRef = useRef(0);
  const startValRef = useRef(0);

  const getDateFromDay = useMemo(() => (dayNum: number) => {
    return new Date(baseDate.getTime() + dayNum * ONE_DAY_MS);
  }, [baseDate]);

  const formatDate = (date: Date) => {
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const getDateRangeStr = useMemo(() => (startDay: number, duration: number) => {
    const startDate = getDateFromDay(startDay);
    const endDate = getDateFromDay(startDay + duration - 1); // Shows up to the end of the final day
    return `${formatDate(startDate)} to ${formatDate(endDate)}`;
  }, [getDateFromDay]);

  const monthsHeader = useMemo(() => {
    const months: { month: string; start: number; days: number; label: string }[] = [];
    let currentMonth: string | null = null;
    let currentStart = 0;
    let currentMonthDate: Date | null = null;
    
    for (let i = 0; i < periodCount; i++) {
      const date = getDateFromDay(i);
      const monthKey = `${date.getMonth()}-${date.getFullYear()}`;
      
      if (currentMonth !== monthKey) {
        if (currentMonth !== null && currentMonthDate) {
          months.push({
            month: currentMonth,
            start: currentStart,
            days: i - currentStart,
            label: currentMonthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          });
        }
        currentMonth = monthKey;
        currentStart = i;
        currentMonthDate = date;
      }
    }
    
    if (currentMonth !== null && currentMonthDate) {
      months.push({
        month: currentMonth,
        start: currentStart,
        days: periodCount - currentStart,
        label: currentMonthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      });
    }
    
    return months;
  }, [getDateFromDay, periodCount]);

  const daysData = useMemo(() => {
    return Array.from({ length: periodCount }, (_, i) => {
      const dayNum = i;
      const date = getDateFromDay(dayNum);
      return {
        num: dayNum,
        day: date.getDate(),
        label: String(date.getDate()).padStart(2, '0')
      };
    });
  }, [getDateFromDay, periodCount]);

  // Global mouse event listener for both Column Resize and Bar Dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingCol) {
        const delta = e.clientX - startXRef.current;
        setActivityWidth(Math.max(150, startValRef.current + delta));
      } else if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const deltaDays = Math.round(deltaX / DAY_WIDTH);
        
        if (deltaDays === 0 && dragState.action === 'move') return;

        setActivities(prev => {
          const newActivities = prev.map(act => {
            if (act.id !== dragState.id) return act;

            const isPlan = dragState.type === 'plan';
            const startKey = isPlan ? 'planStart' : 'actualStart';
            const durKey = isPlan ? 'planDuration' : 'actualDuration';

            let newStart = dragState.originalStart;
            let newDur = dragState.originalDuration;

            if (dragState.action === 'move') {
              newStart = Math.max(0, dragState.originalStart + deltaDays);
            } else if (dragState.action === 'resize-end') {
              newDur = Math.max(1, dragState.originalDuration + deltaDays);
            } else if (dragState.action === 'resize-start') {
              newStart = Math.max(0, dragState.originalStart + deltaDays);
              newDur = dragState.originalDuration - (newStart - dragState.originalStart);
              if (newDur < 1) {
                newDur = 1;
                newStart = dragState.originalStart + dragState.originalDuration - 1;
              }
            }

            // Only update if something actually changed
            if (act[startKey] === newStart && act[durKey] === newDur) return act;
            
            setIsDirty(true);
            return { ...act, [startKey]: newStart, [durKey]: newDur };
          });
          return newActivities;
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizingCol(false);
      if (dragState) {
        setUndoStack(prev => {
          const next = [...prev, activitiesRef.current];
          return next.length > 50 ? next.slice(-50) : next;
        });
        setRedoStack([]);
      }
      setDragState(null);
    };

    if (isResizingCol || dragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection
    } else {
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isResizingCol, dragState]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1]!;
    setRedoStack(prev => [...prev, activities]);
    setUndoStack(prev => prev.slice(0, -1));
    setActivities(previous);
    setIsDirty(true);
  }, [undoStack, activities]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setUndoStack(prev => [...prev, activities]);
    setRedoStack(prev => prev.slice(0, -1));
    setActivities(next);
    setIsDirty(true);
  }, [redoStack, activities]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleRedo();
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleColMouseDown = (e: React.MouseEvent) => {
    setIsResizingCol(true);
    startXRef.current = e.clientX;
    startValRef.current = activityWidth;
  };

  const handleBarMouseDown = (e: React.MouseEvent, id: string | number, type: 'plan' | 'actual', action: 'move' | 'resize-start' | 'resize-end', originalStart: number, originalDuration: number) => {
    e.stopPropagation();
    setDragState({
      id,
      type,
      action,
      startX: e.clientX,
      originalStart,
      originalDuration
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      const { mapped, minTime, assignees } = processCSVData(parsed.result);
      
      if (mapped.length > 0) {
        setActivities(mapped);
        setBaseDate(new Date(minTime));
        setAssignees(assignees);
        setRawCsvData(parsed.result);
        setCsvHeaders(parsed.headers);
        setCsvSeparator(parsed.separator);
        setIsDirty(false);
        setUndoStack([]);
        setRedoStack([]);
        
        // Collapse all parents by default
        const parentIds = mapped.filter(a => a.isParent).map(a => a.id);
        setCollapsedParents(new Set(parentIds));
      } else {
        toast("Nenhum dado válido encontrado. O CSV deve conter as colunas 'Title' e 'Start Date'.", 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset to allow re-upload of the same file
  };

  // Load Excel data automatically on app start
  useEffect(() => {
    const loadExcelData = async () => {
      try {
        const response = await fetch('/api/csv');
        const result = (await response.json()) as { success: boolean; data: Record<string, string | number | null | undefined>[] };
        
        if (result.success && result.data && result.data.length > 0) {
          // Store raw data and headers
          setRawCsvData(result.data);
          const firstRow = result.data[0];
          const headers = firstRow ? Object.keys(firstRow) : [];
          setCsvHeaders(headers);
          setCsvSeparator(','); // Default for Excel-derived JSON

          // Process raw objects from XLSX utils
          const { mapped, minTime, assignees } = processCSVData(result.data);
          
          if (mapped.length > 0) {
            setActivities(mapped);
            setBaseDate(new Date(minTime));
            setAssignees(assignees);
            setIsDirty(false);
            setUndoStack([]);
            setRedoStack([]);

            // Collapse all parents by default
            const parentIds = mapped.filter(a => a.isParent).map(a => a.id);
            setCollapsedParents(new Set(parentIds));
          }
        }
      } catch (error) {
        console.error('Failed to load excel data:', error);
      }
    };

    void loadExcelData();
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleSave = async () => {
    setIsSaving(true);
    const formatToCSVDate = (date: Date) => {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      return `${d}/${m}/${y} 00:00:00`;
    };

    let exportData: Record<string, string | number | null | undefined>[] = [];

    // Fallback if the user tries exporting mock data without uploading a CSV first
    if (rawCsvData.length === 0) {
      exportData = activities.map(act => {
        return {
          'ID': act.id,
          'Title': act.name,
          'Start Date': formatToCSVDate(getDateFromDay(act.planStart)),
          'Target Date': formatToCSVDate(getDateFromDay(act.planStart + act.planDuration - 1)),
          'State Change Date': formatToCSVDate(getDateFromDay(act.actualStart + act.actualDuration - 1)),
          'Percent Complete': act.percentComplete
        };
      });
    } else {
      // Export original structure with adjusted dates
      exportData = rawCsvData.map((row, index) => {
        const activityId = (row.ID as string | number) ?? index + 1;
        const activity = activities.find(a => a.id === activityId);
        
        if (activity) {
           const planStartDate = getDateFromDay(activity.planStart);
           const planEndDate = getDateFromDay(activity.planStart + activity.planDuration);
           const actualEndDate = getDateFromDay(activity.actualStart + activity.actualDuration);

           return {
             ...row,
             'Start Date': formatToCSVDate(planStartDate),
             'Target Date': formatToCSVDate(planEndDate),
             'State Change Date': formatToCSVDate(actualEndDate)
           };
        }
        return row;
      });
    }

    // Save to server filesystem as XLSX via API
    try {
      const response = await fetch('/api/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: exportData })
      });

      if (response.ok) {
        const result = await response.json() as { success: boolean; fileName: string };
        toast(`Arquivo salvo: ${result.fileName}`, 'success');
        setUndoStack([]);
        setRedoStack([]);
        setIsDirty(false);
      } else {
        throw new Error('Falha ao salvar');
      }
    } catch (_error) {
      toast('Erro ao salvar arquivo XLSX', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const LegendItem = ({ colorClass, label }: { colorClass: string; label: string }) => (
    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
      <div className={`w-4 h-4 rounded-sm border border-slate-300 ${colorClass}`}></div>
      <span>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-[1800px] mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Header Section */}
        <div className="p-8 border-b border-slate-100 bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-lg text-white">
                  <Calendar size={28} />
                </div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Estratégia de Portfólio</h1>
                {isDirty && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold animate-pulse border border-amber-200">
                    <AlertCircle size={12} />
                    <span>Alterações Pendentes</span>
                  </div>
                )}
              </div>
              <p className="text-slate-500 font-medium text-sm max-w-md">Visualização e planejamento de épicos e demandas trimestrais com sincronização em tempo real.</p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
               {/* Primary Actions */}
                <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                   <button
                     onClick={handleUndo}
                     disabled={!canUndo}
                     className={`p-2 rounded-lg text-sm font-bold shadow-sm transition-all border ${
                       canUndo
                         ? 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200 active:scale-95 cursor-pointer'
                         : 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                     }`}
                     title="Desfazer (Ctrl+Z)"
                   >
                     <Undo2 size={16} />
                   </button>
                   <button
                     onClick={handleRedo}
                     disabled={!canRedo}
                     className={`p-2 rounded-lg text-sm font-bold shadow-sm transition-all border ${
                       canRedo
                         ? 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200 active:scale-95 cursor-pointer'
                         : 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                     }`}
                     title="Refazer (Ctrl+Shift+Z)"
                   >
                     <Redo2 size={16} />
                   </button>
                   <button 
                     onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
                      isDirty 
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 cursor-pointer' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      if (!isDirty || window.confirm('Há alterações não salvas. Deseja realmente recarregar?')) {
                        window.location.reload()
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-bold transition-all border border-slate-200 active:scale-95"
                    title="Descartar alterações e recarregar"
                  >
                    <RefreshCw size={16} />
                    <span>Recarregar</span>
                  </button>
               </div>

               {/* Import/Export */}
               <div className="flex items-center gap-2">
                 <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 cursor-pointer transition-all text-sm font-bold shadow-sm active:scale-95">
                    <Upload size={16} />
                    <span>Importar CSV</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
               </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 py-4 px-6 bg-slate-50/50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3 pr-6 border-r border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável:</span>
                <select 
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all min-w-[160px]"
                  value={assignedToFilter}
                  onChange={(e) => setAssignedToFilter(e.target.value)}
                >
                  <option value="">Todos os Responsáveis</option>
                  {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-6 ml-auto">
                <LegendItem colorClass="bg-indigo-200 border-indigo-300" label="Planejado" />
                <LegendItem colorClass="bg-emerald-500 border-emerald-600" label="Progresso" />
                <LegendItem colorClass="bg-rose-500 border-rose-600" label="Atraso / Overage" />
              </div>
          </div>
        </div>

        {/* Gantt Chart Area */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full border-collapse text-[11px] table-fixed">
            <thead className="sticky top-0 bg-white z-30 shadow-sm">
              <tr className="border-b border-slate-200">
                <th 
                  className="p-4 text-left font-bold uppercase tracking-wider text-slate-400 relative bg-white"
                  style={{ width: activityWidth }}
                >
                  Atividade
                  <div 
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400 bg-slate-100 z-40 transition-colors"
                    onMouseDown={handleColMouseDown}
                  />
                </th>
                <th className="p-4 text-center w-40 font-bold uppercase tracking-wider text-slate-400 bg-white">Cronograma</th>
                
                {/* Timeline Header */}
                <th className="p-0 bg-white relative">
                  {/* Month Row */}
                  <div className="flex border-b border-slate-100">
                    {monthsHeader.map((month, idx) => (
                      <div 
                        key={idx}
                        style={{ 
                          minWidth: `${month.days * DAY_WIDTH}px`, 
                          width: `${month.days * DAY_WIDTH}px`
                        }}
                        className="h-10 flex items-center justify-center border-l border-slate-100 font-extrabold text-[10px] text-slate-600 bg-slate-50/50 uppercase tracking-widest"
                      >
                        {month.label}
                      </div>
                    ))}
                  </div>
                  {/* Days Row */}
                  <div className="flex">
                    {daysData.map(p => (
                      <div 
                        key={p.num} 
                        style={{ minWidth: DAY_WIDTH, width: DAY_WIDTH }}
                        className={`h-8 flex items-center justify-center border-l border-slate-50 font-bold text-[10px] transition-colors text-slate-400 hover:bg-slate-50`}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>
                  {isTodayVisible && (
                    <div
                      className="absolute top-0 bottom-0 w-[3px] bg-red-500 z-20 pointer-events-none"
                      style={{ left: `${todayOffset * DAY_WIDTH}px` }}
                    >
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                        Hoje
                      </div>
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-100">
              {filteredActivities.map((activity, idx) => {
                // Pre-calculate bar properties for accurate rendering
                const planEnd = activity.planStart + activity.planDuration;
                const actualEnd = activity.actualStart + activity.actualDuration;
                
                // For Actual bar: calculate green (normal) vs red (overage) split
                const overagePeriods = Math.max(0, actualEnd - Math.max(activity.actualStart, planEnd));
                const normalPeriods = activity.actualDuration - overagePeriods;

                // Add child/effort labels
                const isCollapsed = collapsedParents.has(activity.id);
                const label = (
                   <div className={`flex flex-col gap-1.5 w-full ${activity.isChild ? 'pl-8' : 'pl-2'}`}>
                     <div className="flex items-center gap-2 pr-4">
                       {activity.isParent ? (
                         <button 
                           onClick={() => toggleCollapsed(activity.id)}
                           className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                         >
                           {isCollapsed ? <ChevronRight size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                         </button>
                       ) : (
                         <div className="w-[18px]" /> // Spacer for child alignment
                       )}
                       <span className={`truncate ${activity.isParent ? 'font-extrabold text-slate-900' : 'text-slate-600 font-medium'}`} title={activity.name}>
                          {activity.name}
                       </span>
                     </div>
                     {activity.isParent && (
                       <div className="flex gap-2 pl-[24px]">
                         <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-100">{activity.childrenCount} itens</span>
                         <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold border border-slate-200">{activity.effortTotal} pts</span>
                       </div>
                     )}
                     {activity.isChild && (
                       <div className="flex gap-2 pl-[24px]">
                         <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold border border-slate-200">{activity.effortPoints} pts</span>
                       </div>
                     )}
                   </div>
                );

                return (
                  <React.Fragment key={activity.id}>
                    {/* ACTIVITY ROW */}
                    <tr className={`group transition-colors border-b border-slate-100 ${activity.isParent ? 'bg-slate-50/80' : 'hover:bg-slate-50/30'}`}>
                      <td className={`p-4 border-r border-slate-50 font-bold ${activity.isParent ? 'text-slate-900' : 'text-slate-600'}`} style={{ width: activityWidth, minWidth: activityWidth, maxWidth: activityWidth }}>
                        {label}
                      </td>
                      <td className="p-4 text-center font-bold text-indigo-600 border-r border-slate-50">{getDateRangeStr(activity.planStart, activity.planDuration)}</td>
                      <td className="p-0 relative bg-white h-20">
                        {/* Background Grid Lines */}
                        <div className="flex h-full absolute inset-0 pointer-events-none">
                          {daysData.map(p => (
                            <div key={p.num} style={{ minWidth: DAY_WIDTH, width: DAY_WIDTH }} className="border-l border-slate-50" />
                          ))}
                        </div>
                        
                        {isTodayVisible && (
                          <div
                            className="absolute top-0 bottom-0 w-[2px] bg-red-500/70 z-20 pointer-events-none"
                            style={{ left: `${todayOffset * DAY_WIDTH}px` }}
                          />
                        )}
                        
                        {/* Interactive Plan Bar (Top Half) */}
                        <div 
                          className="absolute top-2 h-7 bg-indigo-100 border border-indigo-200 rounded-lg cursor-grab shadow-sm flex items-center justify-center px-2 z-10 select-none hover:bg-indigo-200 hover:border-indigo-300 transition-colors active:cursor-grabbing group/bar"
                          style={{
                            left: `${activity.planStart * DAY_WIDTH}px`,
                            width: `${activity.planDuration * DAY_WIDTH}px`
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'plan', 'move', activity.planStart, activity.planDuration)}
                        >
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/30 rounded-l-lg opacity-0 group-hover/bar:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'plan', 'resize-start', activity.planStart, activity.planDuration)}
                          />
                          <span className="text-[9px] text-indigo-800 font-bold truncate pointer-events-none tracking-tight">
                            {getDateRangeStr(activity.planStart, activity.planDuration)}
                          </span>
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/30 rounded-r-lg opacity-0 group-hover/bar:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'plan', 'resize-end', activity.planStart, activity.planDuration)}
                          />
                        </div>

                        {/* Interactive Actual Bar (Bottom Half) */}
                        <div 
                          className={`absolute bottom-2 h-7 rounded-lg cursor-grab shadow-md flex overflow-hidden z-10 select-none active:cursor-grabbing hover:shadow-lg transition-all group/actual ${
                            activity.isActualPlaceholder ? 'bg-slate-400 border border-slate-500' : ''
                          }`}
                          style={{
                            left: `${activity.actualStart * DAY_WIDTH}px`,
                            width: `${activity.actualDuration * DAY_WIDTH}px`
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'actual', 'move', activity.actualStart, activity.actualDuration)}
                        >
                          {/* Inner structure for colors (Green vs Red) */}
                          <div className="flex w-full h-full pointer-events-none">
                            {!activity.isActualPlaceholder && normalPeriods > 0 && (
                              <div style={{ flex: normalPeriods }} className="bg-emerald-500 border-r border-emerald-600/20" />
                            )}
                            {!activity.isActualPlaceholder && overagePeriods > 0 && (
                              <div style={{ flex: overagePeriods }} className="bg-rose-500 border-l border-rose-600/20" />
                            )}
                          </div>

                          {/* Overlay for text and handles */}
                          <div className="absolute inset-0 flex items-center justify-center px-2">
                            <div 
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 pointer-events-auto opacity-0 group-hover/actual:opacity-100"
                              onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'actual', 'resize-start', activity.actualStart, activity.actualDuration)}
                            />
                            <span className="text-[9px] text-white font-black drop-shadow-sm truncate pointer-events-none tracking-tight">
                              {getDateRangeStr(activity.actualStart, activity.actualDuration)}
                            </span>
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 pointer-events-auto opacity-0 group-hover/actual:opacity-100"
                              onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'actual', 'resize-end', activity.actualStart, activity.actualDuration)}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-500">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm"><Info size={14} className="text-indigo-500"/> Arraste o centro das barras para mover</span>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm"><Target size={14} className="text-emerald-500"/> Arraste as bordas para redimensionar</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 tracking-widest uppercase">
            <span>Portfolio Strategy</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <span>v4.0 Enterprise</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;