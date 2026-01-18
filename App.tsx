
import React, { useEffect, useState, useMemo } from 'react';
import { ProjectAnalysis, ProjectStatus, RotLevel } from './types';
import { fetchProjects, analyzeProjects, updateProjectStatus, updateProjectDetails } from './services/dataService';
import { initGoogleClient, handleSignOut, HARDCODED_CLIENT_ID } from './services/authService';
import { ProjectCard } from './components/ProjectCard';
import { AIInsights } from './components/AIInsights';
import { LoginScreen } from './components/LoginScreen';
import { NewProjectModal } from './components/NewProjectModal';

type SortOrder = 'DEFAULT' | 'FRESH_FIRST' | 'NEGLECTED_FIRST' | 'ABANDONED_FIRST' | 'COMPLETED_FIRST';

const App: React.FC = () => {
  const getStoredId = () => {
    const stored = localStorage.getItem('google_client_id');
    if (stored) return stored;

    if (import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      return import.meta.env.VITE_GOOGLE_CLIENT_ID;
    }

    return (HARDCODED_CLIENT_ID as string) !== 'YOUR_CLIENT_ID_STRING_HERE'
      ? HARDCODED_CLIENT_ID
      : '';
  };

  const [clientId, setClientId] = useState<string>(getStoredId());
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [projects, setProjects] = useState<ProjectAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('DEFAULT');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleSaveConfig = (newId: string) => {
    if (!newId) {
      localStorage.removeItem('google_client_id');
      setClientId('');
      setIsRestoringSession(false);
      window.location.reload();
    } else {
      const trimmed = newId.trim();
      localStorage.setItem('google_client_id', trimmed);
      setClientId(trimmed);
      setIsRestoringSession(true);
    }
  };

  useEffect(() => {
    if (!clientId) {
      setIsRestoringSession(false);
      return;
    }

    const initialize = async () => {
      try {
        const checkGapi = setInterval(async () => {
          if (window.gapi && window.google) {
            clearInterval(checkGapi);
            const signedIn = await initGoogleClient(clientId, (signedIn) => {
              setIsSignedIn(signedIn);
            });
            // Only set signed in if silent auth succeeded
            // The callback will also update isSignedIn for interactive auth
            if (signedIn) {
              setIsSignedIn(true);
            }
            setIsRestoringSession(false);
          }
        }, 100);
      } catch (err) {
        console.error("Failed to initialize Google Auth", err);
        setError("Failed to initialize Google Authentication.");
        setIsRestoringSession(false);
      }
    };
    initialize();
  }, [clientId]);

  useEffect(() => {
    if (isSignedIn) {
      loadData();
    }
  }, [isSignedIn]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rawProjects = await fetchProjects();
      const analyzed = analyzeProjects(rawProjects);
      setProjects(analyzed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load project data.");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: ProjectStatus) => {
    const nowStr = new Date().toISOString();
    setProjects(prev => prev.map(p => {
      if (p.project.id === id) {
        return { 
          project: { ...p.project, status: newStatus, lastTouched: nowStr },
          daysSinceTouch: 0,
          rotLevel: RotLevel.FRESH 
        };
      }
      return p;
    }));

    try {
        await updateProjectStatus(id, newStatus);
    } catch (err: any) {
        console.error("Write failed", err);
        setError(err.message || "Failed to update status in Sheet.");
        loadData();
    }
  };

  const handleProjectUpdate = async (id: string, updates: { name: string, links: string, tags: string, owner: string }) => {
    setProjects(prev => prev.map(p => {
        if (p.project.id === id) {
            return {
                ...p,
                project: { ...p.project, ...updates }
            };
        }
        return p;
    }));

    try {
        await updateProjectDetails(id, updates);
    } catch (err: any) {
        console.error("Update failed", err);
        setError(err.message || "Failed to update project details.");
        loadData();
    }
  };

  const handleLogout = () => {
    handleSignOut();
    setIsSignedIn(false);
    setProjects([]);
  }

  const visibleProjects = useMemo(() => {
    return projects.filter(p => p.project.status !== ProjectStatus.ARCHIVED);
  }, [projects]);

  const sortedProjects = useMemo(() => {
    const isInactive = (p: ProjectAnalysis) => p.project.status === ProjectStatus.COMPLETED;

    return [...visibleProjects].sort((a, b) => {
        const aInactive = isInactive(a);
        const bInactive = isInactive(b);
        let comparison = 0;

        switch (sortOrder) {
            case 'ABANDONED_FIRST':
                if (aInactive && !bInactive) return 1;
                if (!aInactive && bInactive) return -1;
                if (a.rotLevel === RotLevel.ABANDONED && b.rotLevel !== RotLevel.ABANDONED) comparison = -1;
                else if (b.rotLevel === RotLevel.ABANDONED && a.rotLevel !== RotLevel.ABANDONED) comparison = 1;
                break;
            case 'FRESH_FIRST':
                if (aInactive && !bInactive) return 1;
                if (!aInactive && bInactive) return -1;
                if (a.rotLevel === RotLevel.FRESH && b.rotLevel !== RotLevel.FRESH) comparison = -1;
                else if (b.rotLevel === RotLevel.FRESH && a.rotLevel !== RotLevel.FRESH) comparison = 1;
                break;
            case 'COMPLETED_FIRST':
                if (aInactive && !bInactive) comparison = -1;
                else if (!aInactive && bInactive) comparison = 1;
                break;
            case 'DEFAULT':
            default:
                break;
        }

        if (comparison !== 0) return comparison;
        return parseInt(b.project.id, 10) - parseInt(a.project.id, 10);
    });
  }, [visibleProjects, sortOrder]);

  // Show loading spinner while restoring session
  if (isRestoringSession) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 gap-4">
           <svg className="animate-spin h-10 w-10 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           <p className="text-slate-500 text-sm font-medium">Restoring session...</p>
        </div>
      );
  }

  if (!isSignedIn) {
    return <LoginScreen hasValidConfig={!!clientId} onSaveConfig={handleSaveConfig} />;
  }

  const abandonedCount = projects.filter(p => p.rotLevel === RotLevel.ABANDONED && p.project.status !== ProjectStatus.ARCHIVED).length;
  const neglectedCount = projects.filter(p => p.rotLevel === RotLevel.NEGLECTED && p.project.status !== ProjectStatus.ARCHIVED).length;
  const freshCount = projects.filter(p => p.rotLevel === RotLevel.FRESH && p.project.status !== ProjectStatus.ARCHIVED).length;

  return (
    <div className="min-h-screen p-4 md:p-10 max-w-screen-2xl mx-auto relative text-slate-100 pb-32">
      
      {/* Header - Scaled for Mobile */}
      <header className="mb-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8 border-b border-slate-800 pb-10">
        <div>
          <h1 className="text-5xl font-black text-white tracking-tighter mb-3">Project Watcher</h1>
          <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">Health dashboard for active initiatives. Spot the rot before it's too late.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
             <div className="flex gap-4 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
                <div className="bg-slate-900 px-6 py-4 rounded-2xl shadow-xl border-l-8 border-rose-600 border-y border-r border-slate-800 min-w-[130px] flex flex-col items-center">
                    <div className="text-xs text-rose-300 font-black uppercase tracking-widest mb-1">Abandoned</div>
                    <div className="text-4xl font-black text-white">{abandonedCount}</div>
                </div>
                <div className="bg-slate-900 px-6 py-4 rounded-2xl shadow-xl border-l-8 border-orange-500 border-y border-r border-slate-800 min-w-[130px] flex flex-col items-center">
                    <div className="text-xs text-orange-300 font-black uppercase tracking-widest mb-1">Neglected</div>
                    <div className="text-4xl font-black text-white">{neglectedCount}</div>
                </div>
                <div className="bg-slate-900 px-6 py-4 rounded-2xl shadow-xl border-l-8 border-sky-500 border-y border-r border-slate-800 min-w-[130px] flex flex-col items-center">
                    <div className="text-xs text-sky-300 font-black uppercase tracking-widest mb-1">Fresh</div>
                    <div className="text-4xl font-black text-white">{freshCount}</div>
                </div>
            </div>
            
            <button onClick={handleLogout} className="text-sm font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-800">
                Sign Out
            </button>
        </div>
      </header>

      {/* Controls - Optimized for Touch */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-900">
         <div className="flex items-center gap-8 overflow-x-auto pb-2 no-scrollbar">
            <div className="flex items-center gap-3 shrink-0">
                <span className="w-4 h-4 rounded-full bg-sky-500 ring-4 ring-sky-950"></span>
                <span className="font-bold text-sm text-sky-100 uppercase tracking-wide">Fresh</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <span className="w-4 h-4 rounded-full bg-orange-500 ring-4 ring-orange-950"></span>
                <span className="font-bold text-sm text-orange-100 uppercase tracking-wide">Neglected</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <span className="w-4 h-4 rounded-full bg-rose-600 ring-4 ring-rose-950"></span>
                <span className="font-bold text-sm text-rose-100 uppercase tracking-wide">Abandoned</span>
            </div>
         </div>

         <div className="flex items-center gap-3 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
            <span className="pl-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Sort By</span>
            <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="appearance-none bg-slate-800 text-white text-xs font-bold rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-md min-w-[180px]"
            >
                <option value="DEFAULT">Default (Newest)</option>
                <option value="FRESH_FIRST">Freshness First</option>
                <option value="ABANDONED_FIRST">Critical First</option>
                <option value="COMPLETED_FIRST">Archive / Closed</option>
            </select>
         </div>
      </div>

      <main>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500">
             <svg className="animate-spin h-12 w-12 mb-6 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            <p className="font-black uppercase tracking-widest text-sm animate-pulse">Fetching latest updates...</p>
          </div>
        ) : error ? (
          <div className="bg-red-950/40 text-red-100 p-8 rounded-3xl border-2 border-red-900/50 flex flex-col items-center gap-4 max-w-2xl mx-auto mt-12 shadow-2xl">
            <h3 className="font-black text-2xl uppercase tracking-tighter">Connection Failed</h3>
            <p className="text-center text-lg text-red-200/70 mb-4 leading-relaxed">{error}</p>
            <button onClick={loadData} className="px-10 py-4 bg-red-600 rounded-2xl hover:bg-red-500 font-black uppercase tracking-widest shadow-xl transition-all">Retry Link</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
              {sortedProjects.map((analysis) => (
                <ProjectCard 
                  key={analysis.project.id} 
                  analysis={analysis} 
                  onStatusChange={handleStatusChange}
                  onProjectUpdate={handleProjectUpdate}
                />
              ))}
            </div>
            
             {visibleProjects.length === 0 && (
                <div className="text-center py-32 text-slate-500 bg-slate-900/20 rounded-3xl border-4 border-slate-900 border-dashed">
                    <p className="text-2xl font-black uppercase tracking-widest mb-4 opacity-50">Empty Watchlist</p>
                    <p className="text-lg">No active projects detected. Add one below.</p>
                </div>
            )}
            
            <AIInsights projects={projects} />
            
            {/* Larger Floating Action Button */}
            <button
               onClick={() => setIsAddModalOpen(true)}
               className="fixed bottom-10 left-10 w-20 h-20 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl shadow-emerald-950/50 z-[45] flex items-center justify-center transition-all hover:scale-110 active:scale-90 border-4 border-emerald-400/20"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-10 h-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
            </button>
            
            <NewProjectModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={() => {
                    setIsAddModalOpen(false);
                    loadData();
                }}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default App;
