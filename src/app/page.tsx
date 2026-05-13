'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, ChevronRight, ChevronDown, Info, Target, CheckCircle2, Upload, Download } from 'lucide-react';

// --- Initial Data ---
const initialActivities = [];

const DAY_WIDTH = 20; // Fixed width for each day in pixels
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

// --- CSV Parsing Utility ---
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const [datePart] = dateStr.split(' ');
  if (!datePart) return null;
  const parts = datePart.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
};

const parseCSV = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], result: [], separator: ',' };
  
  // Detect separator based on frequency in the first line
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const separator = semiCount > commaCount ? ';' : ',';
  
  const headers = lines[0].split(separator).map(h => h.replace(/["\r]/g, '').trim());
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
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
    
    const row = {};
    headers.forEach((h, index) => {
      row[h] = values[index] ? values[index].replace(/^"|"$/g, '') : '';
    });
    result.push(row);
  }
  return { headers, result, separator };
};

const processCSVData = (data) => {
  let minTime = Infinity;
  // Adjusted filter to include 'Assigned To'
  const validRows = data.filter(r => (r['Work Item Type'] || r.Title) && r['Start Date']);
  
  validRows.forEach(row => {
    const start = parseDate(row['Start Date']);
    if (start && start.getTime() < minTime) {
      minTime = start.getTime();
    }
  });

  if (minTime === Infinity) return { mapped: [], minTime: new Date().getTime(), assignees: [] };

  const getDayDifference = (date) => {
     if (!date) return 0;
     const diffMs = date.getTime() - minTime;
     const days = Math.floor(diffMs / ONE_DAY_MS);
     return Math.max(0, days);
  };

  const activities = [];
  const assignees = new Set();
  let currentParent = null;
  let childrenEffortSum = 0;

  for (let index = 0; index < validRows.length; index++) {
    const row = validRows[index];
    if (row['Assigned To']) assignees.add(row['Assigned To']);
    
    const workItemType = row['Work Item Type'] || row['Work Item Type '] || '';
    const workItemTitle = row['Work Item Title'] || row['Work Item Title '] || row.Title || 'Sem título';
    const isParentItem = workItemType === 'Épico' || workItemType === 'Demanda';
    
    if (isParentItem && currentParent !== null) {
      const totalEffortDays = Math.max(1, Math.ceil(childrenEffortSum / 2));
      currentParent.actualDuration = totalEffortDays;
      currentParent.effortTotal = childrenEffortSum;
      activities.push(currentParent);
      currentParent = null;
      childrenEffortSum = 0;
    }

    const start = parseDate(row['Start Date']);
    const target = parseDate(row['Target Date']);
    const effort = parseInt(row['Effort']) || 0;
    const planStartDay = getDayDifference(start);
    const planEndDay = target ? getDayDifference(target) : null;
    const actualStartDay = planStartDay; 
    
    // Percent complete logic
    let percentComplete = 0;
    const state = (row.State || '').toLowerCase();
    if (state.includes('done')) percentComplete = 100;
    else if (state.includes('doing') || state.includes('developing') || state.includes('active')) percentComplete = 50;

    if (isParentItem) {
      currentParent = {
        id: row.ID || index + 1,
        name: `📁 ${workItemTitle}`,
        planStart: planStartDay,
        planDuration: planEndDay ? Math.max(1, planEndDay - planStartDay) : 7,
        actualStart: actualStartDay,
        actualDuration: 0,
        percentComplete: percentComplete,
        isParent: true,
        effortTotal: 0,
        childrenCount: 0,
        assignedTo: row['Assigned To']
      };
    } else {
      const planDurationDays = planEndDay ? Math.max(1, planEndDay - planStartDay) : 7;
      const actualDurationDays = Math.max(1, Math.ceil(effort / 2));
      
      childrenEffortSum += effort;
      if (currentParent) {
        currentParent.childrenCount++;
      }

      activities.push({
        id: row.ID || index + 1,
        name: `    ${workItemTitle}`,
        planStart: planStartDay,
        planDuration: planDurationDays,
        actualStart: actualStartDay,
        actualDuration: actualDurationDays,
        percentComplete: percentComplete,
        isChild: true,
        effortPoints: effort,
        parentId: currentParent?.id,
        assignedTo: row['Assigned To']
      });
    }
  }

  if (currentParent !== null) {
    const totalEffortDays = Math.max(1, Math.ceil(childrenEffortSum / 2)) || 7;
    currentParent.actualDuration = totalEffortDays;
    currentParent.effortTotal = childrenEffortSum;
    activities.push(currentParent);
  }
  
  return { mapped: activities, minTime, assignees: Array.from(assignees).sort() };
};

const App = () => {
  const [highlightPeriod, setHighlightPeriod] = useState(1);
  const [activities, setActivities] = useState(initialActivities);
  const [assignees, setAssignees] = useState([]);
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [baseDate, setBaseDate] = useState(new Date(2026, 0, 1));

  // Store original CSV data for export mapping
  const [rawCsvData, setRawCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvSeparator, setCsvSeparator] = useState(',');

  const filteredActivities = useMemo(() => {
    if (!assignedToFilter) return activities;
    
    // Filter logic: if parent is selected, show parent and children, or if child matches assignee show it + parent
    return activities.filter(act => {
      if (act.assignedTo === assignedToFilter) return true;
      if (act.isParent) {
        // Show parent if any child matches
        return activities.some(child => child.parentId === act.id && child.assignedTo === assignedToFilter);
      }
      return false;
    });
  }, [activities, assignedToFilter]);

  // Dynamically calculate period count based on the filtered activity list
  const periodCount = useMemo(() => {
    let maxEnd = 1;
    filteredActivities.forEach(act => {
      maxEnd = Math.max(maxEnd, act.planStart + act.planDuration, act.actualStart + act.actualDuration);
    });
    return maxEnd + 3; 
  }, [filteredActivities]);

  // Resizing state for the "Activity" column
  const [activityWidth, setActivityWidth] = useState(300);
  const [isResizingCol, setIsResizingCol] = useState(false);
  
  // Dragging state for Gantt bars
  const [dragState, setDragState] = useState(null);
  const startXRef = useRef(0);
  const startValRef = useRef(0);

  const getDateFromDay = (dayNum) => {
    return new Date(baseDate.getTime() + dayNum * ONE_DAY_MS);
  };

  const formatDate = (date) => {
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const getDateRangeStr = (startDay, duration) => {
    const startDate = getDateFromDay(startDay);
    const endDate = getDateFromDay(startDay + duration - 1); // Shows up to the end of the final day
    return `${formatDate(startDate)} to ${formatDate(endDate)}`;
  };

  const monthsHeader = useMemo(() => {
    const months = [];
    let currentMonth = null;
    let currentStart = 0;
    let currentMonthDate = null;
    
    for (let i = 0; i < periodCount; i++) {
      const date = getDateFromDay(i);
      const monthKey = `${date.getMonth()}-${date.getFullYear()}`;
      
      if (currentMonth !== monthKey) {
        if (currentMonth !== null) {
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
  }, [baseDate, periodCount]);

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
  }, [baseDate, periodCount]);

  // Global mouse event listener for both Column Resize and Bar Dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingCol) {
        const delta = e.clientX - startXRef.current;
        setActivityWidth(Math.max(150, startValRef.current + delta));
      } else if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const deltaDays = Math.round(deltaX / DAY_WIDTH);
        
        setActivities(prev => prev.map(act => {
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

          return { ...act, [startKey]: newStart, [durKey]: newDur };
        }));
      }
    };

    const handleMouseUp = () => {
      setIsResizingCol(false);
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

  const handleColMouseDown = (e) => {
    setIsResizingCol(true);
    startXRef.current = e.clientX;
    startValRef.current = activityWidth;
  };

  const handleBarMouseDown = (e, id, type, action, originalStart, originalDuration) => {
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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCSV(text);
      const { mapped, minTime, assignees } = processCSVData(parsed.result);
      
      if (mapped.length > 0) {
        setActivities(mapped);
        setBaseDate(new Date(minTime));
        setAssignees(assignees);
        setRawCsvData(parsed.result);
        setCsvHeaders(parsed.headers);
        setCsvSeparator(parsed.separator);
      } else {
        alert("No valid data found. Please ensure your CSV has 'Title' and 'Start Date' columns.");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset to allow re-upload of the same file
  };

  // Load Excel data automatically on app start
  useEffect(() => {
    const loadExcelData = async () => {
      try {
        const response = await fetch('/api/csv');
        const result = await response.json();
        
        if (result.success && result.data) {
          // Process raw objects from XLSX utils
          const { mapped, minTime, assignees } = processCSVData(result.data);
          
          if (mapped.length > 0) {
            setActivities(mapped);
            setBaseDate(new Date(minTime));
            setAssignees(assignees);
          }
        }
      } catch (error) {
        console.error('Failed to load excel data:', error);
      }
    };

    loadExcelData();
  }, []);

  const handleExportCSV = async () => {
    const formatToCSVDate = (date) => {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const y = date.getFullYear();
      return `${d}/${m}/${y} 00:00:00`;
    };

    let exportHeaders = csvHeaders;
    let exportData = [];

    // Fallback if the user tries exporting mock data without uploading a CSV first
    if (rawCsvData.length === 0) {
      exportHeaders = ['ID', 'Title', 'Start Date', 'Target Date', 'State Change Date', 'Percent Complete'];
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
      // Export original CSV structure with adjusted dates
      exportData = rawCsvData.map((row, index) => {
        const activityId = row.ID || index + 1;
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

    const headerRow = exportHeaders.map(h => `"${h}"`).join(csvSeparator);
    const bodyRows = exportData.map(row => {
       return exportHeaders.map(h => {
          const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
          return `"${val.replace(/"/g, '""')}"`;
       }).join(csvSeparator);
    });

    const csvContent = [headerRow, ...bodyRows].join('\n');

    // Save to server filesystem
    try {
      const response = await fetch('/api/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: csvContent })
      });

      if (response.ok) {
        alert('Dados salvos com sucesso em epicos_data.csv');
      } else {
        throw new Error('Falha ao salvar');
      }
    } catch (error) {
      alert('Erro ao salvar arquivo');
    }
  };

  const LegendItem = ({ colorClass, label }) => (
    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
      <div className={`w-4 h-4 rounded-sm border border-slate-300 ${colorClass}`}></div>
      <span>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-[1600px] mx-auto bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200">
        
        {/* Header Section */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-4">
                <h1 className="text-4xl font-bold text-slate-800 tracking-tight">Portfolio Strategy</h1>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 cursor-pointer transition-colors text-sm font-semibold shadow-sm">
                    <Upload size={16} />
                    <span>Load CSV</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <button 
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 cursor-pointer transition-colors text-sm font-semibold shadow-sm"
                  >
                    <Download size={16} />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
              <p className="text-slate-500 mt-1 italic text-sm">Planejamento Trimestral.</p>
            </div>

            <div className="flex flex-wrap items-center gap-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3 pr-6 border-r border-slate-300">
                <span className="text-sm font-bold text-slate-700">Assignee:</span>
                <select 
                  className="px-2 py-1 border border-slate-300 rounded text-sm text-slate-700 bg-white"
                  value={assignedToFilter}
                  onChange={(e) => setAssignedToFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 pr-6 border-r border-slate-300">
                <span className="text-sm font-bold text-slate-700">Period Highlight:</span>
                <input 
                  type="number" 
                  value={highlightPeriod}
                  onChange={(e) => setHighlightPeriod(Number(e.target.value))}
                  className="w-16 px-2 py-1 border border-amber-300 rounded bg-amber-50 text-center font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  min="1"
                  max={periodCount}
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <LegendItem colorClass="bg-blue-300" label="Plan Duration" />
                <LegendItem colorClass="bg-green-400" label="Actual Progress" />
                <LegendItem colorClass="bg-red-500" label="Actual (beyond plan)" />
              </div>
            </div>
          </div>
        </div>

        {/* Gantt Chart Area */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px] table-fixed">
            <thead className="sticky top-0 bg-white z-30 shadow-sm">
              <tr className="border-b-2 border-slate-200">
                <th 
                  className="p-2 text-left font-bold uppercase tracking-wider text-slate-400 relative"
                  style={{ width: activityWidth }}
                >
                  Activity
                  <div 
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400 bg-slate-200 z-40 transition-colors"
                    onMouseDown={handleColMouseDown}
                  />
                </th>
                <th className="p-2 text-center w-36 font-bold uppercase tracking-wider text-slate-400">Dates</th>
                
                {/* Timeline Header */}
                <th className="p-0">
                  <div className="flex">
                    <div className="px-2 py-1 text-slate-400 font-bold uppercase tracking-wider border-l border-slate-200">Calendário</div>
                  </div>
                  {/* Month Row */}
                  <div className="flex border-t border-slate-100">
                    {monthsHeader.map((month, idx) => (
                      <div 
                        key={idx}
                        style={{ 
                          minWidth: `${month.days * DAY_WIDTH}px`, 
                          width: `${month.days * DAY_WIDTH}px`,
                          left: `${month.start * DAY_WIDTH}px`
                        }}
                        className="h-6 flex items-center justify-center border-l border-slate-100 font-bold text-[10px] text-slate-600 bg-slate-50 border-b border-slate-200"
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
                        className={`h-5 flex items-center justify-center border-l border-slate-100 font-medium text-[11px] ${p.num === highlightPeriod ? 'bg-amber-100 text-amber-900 font-bold' : 'text-slate-500'}`}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>
                </th>
              </tr>
            </thead>
            
            <tbody>
              {filteredActivities.map((activity, idx) => {
                // Pre-calculate bar properties for accurate rendering
                const planEnd = activity.planStart + activity.planDuration;
                const actualEnd = activity.actualStart + activity.actualDuration;
                
                // For Actual bar: calculate green (normal) vs red (overage) split
                const overagePeriods = Math.max(0, actualEnd - Math.max(activity.actualStart, planEnd));
                const normalPeriods = activity.actualDuration - overagePeriods;

                // Add child/effort labels
                const label = activity.isParent ? (
                   <div className="flex justify-between items-center w-full">
                     <span>{activity.name}</span>
                     <span className="text-[9px] bg-slate-200 px-1.5 py-0.5 rounded font-bold">{activity.childrenCount} kids | {activity.effortTotal} pts</span>
                   </div>
                ) : <span>{activity.name}</span>;

                return (
                  <React.Fragment key={activity.id}>
                    {/* PLAN ROW (TOP) */}
                    <tr className={`group border-b border-slate-50 ${activity.isParent ? 'bg-slate-100/50' : ''}`}>
                      <td className="p-2 font-bold text-slate-700 bg-slate-50/50" style={{ width: activityWidth, minWidth: activityWidth, maxWidth: activityWidth }}>
                        <div className="line-clamp-2 break-words" title={activity.name}>
                          {label}
                        </div>
                      </td>
                      <td className="p-2 text-center font-semibold text-blue-700">{getDateRangeStr(activity.planStart, activity.planDuration)}</td>
                      <td className="p-0 relative bg-white">
                        {/* Background Grid Lines */}
                        <div className="flex h-6 absolute inset-0 pointer-events-none">
                          {daysData.map(p => (
                            <div key={p.num} style={{ minWidth: DAY_WIDTH, width: DAY_WIDTH }} className={`border-l border-slate-100 ${p.num === highlightPeriod ? 'bg-amber-400/10' : ''}`} />
                          ))}
                        </div>
                        
                        {/* Interactive Plan Bar */}
                        <div 
                          className="absolute top-1 bottom-1 bg-blue-300 border border-blue-400 rounded-sm cursor-move shadow-sm flex items-center justify-center px-2 z-10 select-none hover:brightness-95 transition-all"
                          style={{
                            left: `${activity.planStart * DAY_WIDTH}px`,
                            width: `${activity.planDuration * DAY_WIDTH}px`
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'plan', 'move', activity.planStart, activity.planDuration)}
                        >
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/20 rounded-l-sm"
                            onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'plan', 'resize-start', activity.planStart, activity.planDuration)}
                          />
                          <span className="text-[10px] text-blue-900 font-medium truncate pointer-events-none">
                            {getDateRangeStr(activity.planStart, activity.planDuration)}
                          </span>
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/20 rounded-r-sm"
                            onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'plan', 'resize-end', activity.planStart, activity.planDuration)}
                          />
                        </div>
                      </td>
                    </tr>

                    {/* ACTUAL ROW (BOTTOM) */}
                    <tr className={`group border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="p-2 flex items-center gap-1 text-[9px] text-slate-400 uppercase italic font-semibold border-r border-slate-50" style={{ width: activityWidth, minWidth: activityWidth, maxWidth: activityWidth }}>
                        <ChevronRight size={10} className="text-amber-500 flex-shrink-0" /> <span className="truncate">Actual</span>
                      </td>
                      <td className="p-2 text-center font-semibold text-emerald-700">{getDateRangeStr(activity.actualStart, activity.actualDuration)}</td>
                      <td className="p-0 relative">
                        {/* Background Grid Lines */}
                        <div className="flex h-8 absolute inset-0 pointer-events-none">
                          {daysData.map(p => (
                            <div key={p.num} style={{ minWidth: DAY_WIDTH, width: DAY_WIDTH }} className={`border-l border-slate-100 ${p.num === highlightPeriod ? 'bg-amber-400/20 border-x border-amber-300/30' : ''}`} />
                          ))}
                        </div>
                        
                        {/* Interactive Actual Bar */}
                        <div 
                          className="absolute top-1 bottom-1 rounded-sm cursor-move shadow-md flex overflow-hidden z-10 select-none hover:brightness-105 transition-all"
                          style={{
                            left: `${activity.actualStart * DAY_WIDTH}px`,
                            width: `${activity.actualDuration * DAY_WIDTH}px`
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'actual', 'move', activity.actualStart, activity.actualDuration)}
                        >
                          {/* Inner structure for colors (Green vs Red) */}
                          <div className="flex w-full h-full pointer-events-none">
                            {normalPeriods > 0 && (
                              <div style={{ flex: normalPeriods }} className="bg-green-500 border-y border-green-600 border-l" />
                            )}
                            {overagePeriods > 0 && (
                              <div style={{ flex: overagePeriods }} className="bg-red-500 border-y border-red-600 border-r" />
                            )}
                          </div>

                          {/* Overlay for text and handles */}
                          <div className="absolute inset-0 flex items-center justify-center px-2">
                            <div 
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/30 pointer-events-auto"
                              onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'actual', 'resize-start', activity.actualStart, activity.actualDuration)}
                            />
                            <span className="text-[10px] text-white font-bold drop-shadow-md truncate pointer-events-none">
                              {getDateRangeStr(activity.actualStart, activity.actualDuration)}
                            </span>
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/30 pointer-events-auto"
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
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><Info size={14}/> Click and drag middle of bars to move, or drag edges to resize</span>
          </div>
          <div className="font-mono opacity-50 uppercase tracking-widest">Gantt Visualizer v3.0</div>
        </div>
      </div>
    </div>
  );
};

export default App;