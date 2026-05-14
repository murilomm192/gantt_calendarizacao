# Usability Improvements — Implementation Guide

## File: `src/app/page.tsx`

All changes go in this single file.

---

## 1. Today Indicator Line

### Add after line 285 (after `periodCount` useMemo):

```ts
const todayOffset = useMemo(() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = now.getTime() - baseDate.getTime();
  return Math.floor(diff / ONE_DAY_MS);
}, [baseDate]);

const isTodayVisible = todayOffset >= 0 && todayOffset < periodCount;
```

### In the timeline `<th>` (header), add inside the days row `<div>`, after the month header and day labels:

After this block (around line 709-721):
```tsx
{/* Days Row */}
<div className="flex">
  {daysData.map(p => (
    <div key={p.num} ...>
      {p.label}
    </div>
  ))}
</div>
```

Add the today marker line inside the same `<th>` (before the closing `</th>`):

```tsx
{isTodayVisible && (
  <div
    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
    style={{ left: `${todayOffset * DAY_WIDTH}px` }}
  >
    <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
      Hoje
    </div>
  </div>
)}
```

### In each body row `<td>` (the timeline cell):

Inside the `<td className="p-0 relative bg-white h-20">` (around line 776), add the today line **after** the background grid lines `<div>` and **before** the bar elements:

```tsx
{/* Today line */}
{isTodayVisible && (
  <div
    className="absolute top-0 bottom-0 w-0.5 bg-red-500/70 z-20 pointer-events-none"
    style={{ left: `${todayOffset * DAY_WIDTH}px` }}
  />
)}
```

**Important**: The parent `<td>` needs `overflow: visible` for the "Hoje" label to not be clipped, but the grid container is `overflow-x-auto`. The per-row line without the label is sufficient. Keep the "Hoje" label only in the header.

---

## 2. Undo/Redo

### Add state refs near the top of the `App` component (after `collapsedParents` state, around line 232):

```ts
const [undoStack, setUndoStack] = useState<Activity[][]>([]);
const [redoStack, setRedoStack] = useState<Activity[][]>([]);
const canUndo = undoStack.length > 0;
const canRedo = redoStack.length > 0;
const dragActiveRef = useRef(false);
```

### Push to history when a drag completes:

In the `handleMouseUp` function (inside the `useEffect`, around line 406-409), change the `setDragState(null)` line to also save history. Replace:

```ts
const handleMouseUp = () => {
  setIsResizingCol(false);
  setDragState(null);
};
```

with:

```ts
const handleMouseUp = () => {
  setIsResizingCol(false);
  if (dragState) {
    // Push current state to undo stack when drag ends
    setUndoStack(prev => [...prev.slice(-50), activities]); // limit to 50
    setRedoStack([]);
  }
  setDragState(null);
};
```

**Caveat**: `setUndoStack` uses the closure value of `activities`, which might be stale. A better approach:

Add a `useRef` to track the latest activities and push on mouseup:

```ts
const activitiesRef = useRef(activities);
activitiesRef.current = activities;
```

Then in `handleMouseUp`:

```ts
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
```

### Add undo/redo functions:

```ts
const handleUndo = useCallback(() => {
  if (undoStack.length === 0) return;
  const previous = undoStack[undoStack.length - 1];
  setRedoStack(prev => [...prev, activities]);
  setUndoStack(prev => prev.slice(0, -1));
  setActivities(previous);
  setIsDirty(true);
}, [undoStack, activities]);

const handleRedo = useCallback(() => {
  if (redoStack.length === 0) return;
  const next = redoStack[redoStack.length - 1];
  setUndoStack(prev => [...prev, activities]);
  setRedoStack(prev => prev.slice(0, -1));
  setActivities(next);
  setIsDirty(true);
}, [redoStack, activities]);
```

### Add keyboard listener:

Add this inside a new `useEffect`:

```ts
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
```

### Add undo/redo buttons in the toolbar:

In the "Primary Actions" section (around line 610-631), add two buttons before the Salvar button:

```tsx
<button
  onClick={handleUndo}
  disabled={!canUndo}
  className={`p-2 rounded-lg text-sm font-bold shadow-sm transition-all border ${
    canUndo ? 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200 active:scale-95' : 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
  }`}
  title="Desfazer (Ctrl+Z)"
>
  <Undo2 size={16} />
</button>
<button
  onClick={handleRedo}
  disabled={!canRedo}
  className={`p-2 rounded-lg text-sm font-bold shadow-sm transition-all border ${
    canRedo ? 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200 active:scale-95' : 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
  }`}
  title="Refazer (Ctrl+Shift+Z)"
>
  <Redo2 size={16} />
</button>
```

Add `Undo2` and `Redo2` to the import from `lucide-react` at line 4.

### Save resets undo history:

In `handleSave`, after a successful save, add:
```ts
setUndoStack([]);
setRedoStack([]);
```

---

## 3. Toast Notifications

### Create a new file `src/app/toast.tsx`:

```tsx
'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const iconMap = {
    success: <CheckCircle size={18} className="text-emerald-500" />,
    error: <AlertCircle size={18} className="text-red-500" />,
    info: <Info size={18} className="text-indigo-500" />,
  }

  const bgMap = {
    success: 'border-emerald-200 bg-emerald-50',
    error: 'border-red-200 bg-red-50',
    info: 'border-indigo-200 bg-indigo-50',
  }

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${bgMap[t.type]} animate-slide-up min-w-[280px] max-w-[420px]`}
          >
            {iconMap[t.type]}
            <span className="text-sm font-semibold text-slate-800 flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="p-0.5 hover:bg-black/5 rounded transition-colors">
              <X size={14} className="text-slate-400" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
```

### Wrap the app in the provider:

In `src/app/layout.tsx`, add the `ToastProvider`:

```tsx
import { ToastProvider } from "~/app/toast";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

### Use toasts in `page.tsx`:

At the top of the `App` component, add:
```ts
import { useToast } from '~/app/toast'
```

Then inside the component:
```ts
const { toast } = useToast()
```

Replace all `alert()` calls:

| Line | Before | After |
|------|--------|-------|
| ~467 | `alert("No valid data found...")` | `toast("Nenhum dado válido encontrado. O CSV deve conter as colunas 'Title' e 'Start Date'.", 'error')` |
| ~567 | `alert(\`Arquivo salvo com sucesso: ...\`)` | `toast(\`Arquivo salvo: ${result.fileName}\`, 'success')` |
| ~573 | `alert('Erro ao salvar arquivo XLSX')` | `toast('Erro ao salvar arquivo XLSX', 'error')` |

### Add animation CSS:

In `src/styles/globals.css`, add:
```css
@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.25s ease-out;
}
```

---

## 4. Confirmation on Reload

### Change the "Recarregar" button handler (around line 624-631):

Replace:
```tsx
onClick={() => window.location.reload()}
```

with:
```tsx
onClick={() => {
  if (!isDirty || window.confirm('Há alterações não salvas. Deseja realmente recarregar?')) {
    window.location.reload()
  }
}}
```

### Add `beforeunload` listener:

Add this `useEffect` in the component body (near the other effects):

```ts
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
```

---

## Summary of all changes

| File | Action |
|------|--------|
| `src/app/page.tsx` | Edit — today line, undo/redo, toast integration, reload confirmation, beforeunload |
| `src/app/toast.tsx` | **New** — Toast provider component |
| `src/app/layout.tsx` | Edit — wrap with `<ToastProvider>` |
| `src/styles/globals.css` | Edit — add `slide-up` keyframe |
