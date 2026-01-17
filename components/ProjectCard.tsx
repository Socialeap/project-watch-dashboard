
import React, { useState, useEffect } from 'react';
import { ProjectAnalysis, RotLevel, ProjectStatus } from '../types';

interface ProjectCardProps {
  analysis: ProjectAnalysis;
  onStatusChange: (id: string, newStatus: ProjectStatus) => void;
  onProjectUpdate: (id: string, updates: { name: string, links: string, tags: string, owner: string }) => Promise<void>;
}

const getStyles = (status: ProjectStatus, rotLevel: RotLevel) => {
  if (status === ProjectStatus.COMPLETED) {
      return {
        leftBorder: 'border-l-emerald-500',
        badgeBg: 'bg-emerald-950 text-emerald-100 border-2 border-emerald-800',
        indicator: 'bg-emerald-500',
        textHighlight: 'text-emerald-400',
        label: 'Completed'
      };
  }
  
  if (status === ProjectStatus.ARCHIVED) {
      return {
        leftBorder: 'border-l-slate-500',
        badgeBg: 'bg-slate-800 text-slate-300 border-2 border-slate-700',
        indicator: 'bg-slate-500',
        textHighlight: 'text-slate-400',
        label: 'Archived'
      };
  }

  switch (rotLevel) {
    case RotLevel.ABANDONED:
      return {
        leftBorder: 'border-l-rose-600',
        badgeBg: 'bg-rose-950 text-rose-100 border-2 border-rose-800',
        indicator: 'bg-rose-600',
        textHighlight: 'text-rose-400',
        label: RotLevel.ABANDONED
      };
    case RotLevel.NEGLECTED:
      return {
        leftBorder: 'border-l-orange-500',
        badgeBg: 'bg-orange-950 text-orange-100 border-2 border-orange-800',
        indicator: 'bg-orange-500',
        textHighlight: 'text-orange-400',
        label: RotLevel.NEGLECTED
      };
    case RotLevel.FRESH:
    default:
      return {
        leftBorder: 'border-l-sky-500',
        badgeBg: 'bg-sky-950 text-sky-100 border-2 border-sky-800',
        indicator: 'bg-sky-500',
        textHighlight: 'text-sky-400',
        label: RotLevel.FRESH
      };
  }
};

const LinkRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text || text === 'No Link') return <span className="text-slate-600 italic">No Reference Link</span>;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline font-bold" onClick={(e) => e.stopPropagation()}>
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

const TagRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return <span className="text-slate-600 italic">No project tags</span>;
  const parts = text.split(/(\s+)/);
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {parts.map((part, i) => {
        if (part.trim().startsWith('#')) {
          return <span key={i} className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-pink-400 font-bold text-xs">{part}</span>
        }
        return part.trim() ? <span key={i} className="text-slate-400">{part}</span> : null;
      })}
    </div>
  );
};

export const ProjectCard: React.FC<ProjectCardProps> = ({ analysis, onStatusChange, onProjectUpdate }) => {
  const { project, daysSinceTouch, rotLevel } = analysis;
  const [isSpinning, setIsSpinning] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: project.name, links: project.links, tags: project.tags, owner: project.owner || '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditForm({ name: project.name, links: project.links, tags: project.tags, owner: project.owner || '' });
  }, [project]);
  
  const styles = getStyles(project.status, rotLevel);

  const handleRefreshClick = () => {
    setIsSpinning(true);
    onStatusChange(project.id, ProjectStatus.EXTENDED);
    setTimeout(() => setIsSpinning(false), 1000);
  };

  const handleStatusSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as ProjectStatus;
    if (newStatus === ProjectStatus.ARCHIVED) setShowArchiveConfirm(true);
    else onStatusChange(project.id, newStatus);
  };

  return (
    <div className={`
      relative flex flex-col h-full bg-slate-900 border border-slate-800 border-l-[10px] ${styles.leftBorder}
      rounded-3xl shadow-xl transition-all duration-300 overflow-hidden group/card
    `}>
      
      {showArchiveConfirm && (
        <div className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col items-center justify-center p-8 text-center animate-fade-in backdrop-blur-md">
            <h3 className="text-white font-black text-2xl mb-4 uppercase tracking-tighter">Archive Project?</h3>
            <p className="text-slate-400 text-lg mb-10 leading-relaxed">This will remove the project from active view. You can restore it later if needed.</p>
            <div className="flex flex-col gap-4 w-full">
                <button onClick={() => setShowArchiveConfirm(false)} className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest border border-slate-700">Cancel</button>
                <button onClick={() => {onStatusChange(project.id, ProjectStatus.ARCHIVED); setShowArchiveConfirm(false);}} className="w-full py-5 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl">Archive Now</button>
            </div>
        </div>
      )}

      <div className="p-8 flex-1 flex flex-col min-w-0">
        <div className="flex justify-between items-start mb-6">
          <button onClick={() => isEditing ? setIsEditing(false) : setIsEditing(true)} className="p-3 bg-slate-950 text-slate-400 border border-slate-800 rounded-xl hover:text-white transition-all shadow-md active:scale-90">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
             </svg>
          </button>
          
          <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg ${styles.badgeBg}`}>
            {styles.label}
          </span>
        </div>

        {isEditing ? (
             <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-5 py-4 text-white font-black text-xl focus:border-indigo-500 outline-none mb-6"
                placeholder="Project Name"
                autoFocus
             />
        ) : (
            <div className="mb-8">
                <h3 className="font-black text-2xl text-white leading-[1.1] break-words tracking-tighter group-hover/card:text-indigo-200 transition-colors">
                  {project.name}
                </h3>
            </div>
        )}

        {!isEditing && (
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <span className="block text-[10px] uppercase text-slate-500 font-black mb-1 tracking-widest">Modified</span>
                  <span className="text-slate-100 font-bold text-base">{new Date(project.lastTouched).toLocaleDateString()}</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <span className="block text-[10px] uppercase text-slate-500 font-black mb-1 tracking-widest">Dormant</span>
                  <span className={`text-2xl font-black leading-none ${styles.textHighlight}`}>
                      {project.status === ProjectStatus.COMPLETED || project.status === ProjectStatus.ARCHIVED ? '-' : `${daysSinceTouch}D`}
                  </span>
              </div>
            </div>
        )}

        <div className="mb-6 space-y-4">
          <div className="space-y-2">
            <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Resource Link</span>
            {isEditing ? (
               <textarea value={editForm.links} onChange={(e) => setEditForm({...editForm, links: e.target.value})} className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-5 py-4 text-slate-200 text-sm focus:border-indigo-500 outline-none min-h-[6rem]" placeholder="URL References..." />
            ) : (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-sm leading-relaxed break-words min-h-[4rem] flex items-center">
                  <LinkRenderer text={project.links} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Taxonomy</span>
            {isEditing ? (
              <input type="text" value={editForm.tags} onChange={(e) => setEditForm({...editForm, tags: e.target.value})} className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl px-5 py-4 text-slate-200 text-sm focus:border-indigo-500 outline-none" placeholder="#tags #category" />
            ) : (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-sm min-h-[3rem] flex items-center">
                  <TagRenderer text={project.tags} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-950 p-8 pt-0 flex flex-col gap-6">
            <div className="w-full h-px bg-slate-900"></div>
            
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-600 uppercase font-black tracking-widest">Project Lead</span>
                {isEditing ? (
                    <input type="text" value={editForm.owner} onChange={(e) => setEditForm({...editForm, owner: e.target.value})} className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-white text-base focus:border-indigo-500 outline-none" placeholder="Lead Name" />
                ) : (
                    <span className="text-lg text-white font-black tracking-tight truncate">{project.owner || 'Unassigned'}</span>
                )}
            </div>

            {isEditing ? (
                <button onClick={async () => {setIsSaving(true); await onProjectUpdate(project.id, editForm); setIsEditing(false); setIsSaving(false);}} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-indigo-500 transition-all flex items-center justify-center gap-3">
                   {isSaving ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : 'Commit Updates'}
                </button>
            ) : (
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <select value={project.status} onChange={handleStatusSelect} className="w-full appearance-none bg-slate-900 border-2 border-slate-800 text-white text-sm font-black rounded-2xl pl-5 pr-12 py-4 focus:border-indigo-500 transition-all cursor-pointer shadow-inner">
                        {Object.values(ProjectStatus).map((status) => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-5 text-slate-400">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                    <button onClick={handleRefreshClick} className="w-16 flex items-center justify-center bg-slate-800 border-2 border-slate-700 rounded-2xl text-white hover:bg-slate-700 transition-all active:scale-90 shadow-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={`w-6 h-6 ${isSpinning ? 'animate-spin' : ''}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </button>
                </div>
            )}
      </div>
    </div>
  );
};
