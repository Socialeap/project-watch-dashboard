
import React, { useState } from 'react';
import { createProject } from '../services/dataService';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({ name: '', owner: '', links: '', tags: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createProject({ name: formData.name, owner: formData.owner, links: formData.links, tags: formData.tags });
      setFormData({ name: '', owner: '', links: '', tags: '' });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Sheet write failed');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-950/90 backdrop-blur-md animate-fade-in p-0 md:p-6">
      <div className="bg-slate-900 border-t-4 border-indigo-600 md:border-4 md:rounded-3xl w-full md:max-w-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-[slideUp_0.4s_ease-out]">
        
        <div className="bg-slate-950 px-8 py-6 flex justify-between items-center border-b border-slate-800">
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Add Initiative</h2>
          <button onClick={onClose} className="p-4 bg-slate-900 rounded-full text-slate-400 hover:text-white transition-all active:scale-90">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8 pb-12 md:pb-8">
          {error && (
            <div className="p-5 bg-red-950 border-2 border-red-900 text-red-200 font-bold rounded-2xl text-center">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">Initiative Name</label>
            <input type="text" required autoFocus className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 text-white font-bold text-lg focus:border-indigo-600 outline-none placeholder-slate-700" placeholder="Enter high-level title..." value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
          </div>

          <div className="space-y-2">
             <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">Project Lead</label>
             <input type="text" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 text-white font-bold text-lg focus:border-indigo-600 outline-none placeholder-slate-700" placeholder="Name of primary owner" value={formData.owner} onChange={(e) => setFormData({...formData, owner: e.target.value})} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">Taxonomy Tags</label>
                <input type="text" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 text-white font-bold focus:border-indigo-600 outline-none placeholder-slate-700" placeholder="#dev #marketing" value={formData.tags} onChange={(e) => setFormData({...formData, tags: e.target.value})} />
             </div>
             <div className="space-y-2">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">Resource Link</label>
                <input type="url" inputMode="url" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-6 py-5 text-white font-bold focus:border-indigo-600 outline-none placeholder-slate-700" placeholder="https://docs.google.com/..." value={formData.links} onChange={(e) => setFormData({...formData, links: e.target.value})} />
             </div>
          </div>

          <div className="pt-6 flex flex-col md:flex-row gap-4">
            <button type="button" onClick={onClose} className="w-full py-6 bg-slate-800 text-white font-black uppercase tracking-widest rounded-2xl border-2 border-slate-700 transition-all active:scale-95">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="w-full py-6 bg-emerald-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-2xl transition-all active:scale-95 flex justify-center items-center gap-4">
              {isSubmitting ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : <span>Create Entry</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
