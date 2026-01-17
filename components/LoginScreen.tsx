
import React, { useState } from 'react';
import { handleAuthClick } from '../services/authService';

interface LoginScreenProps {
  hasValidConfig: boolean;
  onSaveConfig: (id: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ hasValidConfig, onSaveConfig }) => {
  const [tempId, setTempId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  
  // Get the origin for troubleshooting display
  const origin = window.location.origin;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
      <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-800 max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
           <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-900/50">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
             </svg>
           </div>
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">Project Watcher</h1>
        <p className="text-slate-400 mb-8">Sign in to access your project dashboard.</p>
        
        {!hasValidConfig ? (
           <div className="text-left">
             <div className="mb-4 bg-amber-900/20 border border-amber-900/50 text-amber-200 px-4 py-3 rounded-lg text-sm">
               <p className="font-bold mb-1">Configuration Needed</p>
               <p className="text-amber-200/80">Enter your Google Cloud Client ID below to connect.</p>
             </div>
             
             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Client ID
            </label>
            <input 
              type="text" 
              value={tempId}
              onChange={(e) => setTempId(e.target.value)}
              placeholder="12345...apps.googleusercontent.com"
              className="w-full px-4 py-2 bg-slate-950 border border-slate-700 text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none text-sm mb-4 placeholder-slate-600"
            />
            <button
              onClick={() => onSaveConfig(tempId)}
              disabled={!tempId.trim()}
              className="w-full bg-slate-100 hover:bg-white text-slate-900 font-bold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save & Continue
            </button>
           </div>
        ) : (
          <>
            <button
              onClick={handleAuthClick}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-900 font-bold py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              <span>Sign in with Google</span>
            </button>
            <button 
              onClick={() => onSaveConfig('')} 
              className="mt-6 text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
            >
              Change Client ID
            </button>
          </>
        )}
        
        <div className="mt-8 pt-6 border-t border-slate-800">
           <button 
             onClick={() => setShowHelp(!showHelp)}
             className="flex items-center justify-center gap-1 mx-auto text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.06-1.06 2 2 0 0 1 1.06 1.06ZM11 9.25a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-5.5Z" clipRule="evenodd" />
            </svg>
             {showHelp ? 'Hide Troubleshooting' : 'Troubleshoot Connection'}
           </button>
           
           {showHelp && (
             <div className="text-left mt-4 bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs text-slate-400">
                <div className="mb-3">
                  <p className="font-bold text-slate-200 mb-1">Getting "Error 400" or "Policy Error"?</p>
                  <p className="mb-2">You must add this specific <strong>Origin URL</strong> to your Google Cloud Console.</p>
                  
                  <div className="bg-slate-900 border border-slate-700 rounded p-3 flex justify-between items-center gap-2">
                    <span className="font-mono text-xs text-indigo-400 font-bold break-all">{origin}</span>
                    <button 
                        onClick={() => navigator.clipboard.writeText(origin)}
                        className="text-slate-500 hover:text-indigo-400 font-bold hover:bg-slate-800 p-2 rounded transition-colors"
                        title="Copy to clipboard"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5" />
                        </svg>
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                  <p className="font-bold text-slate-200 mb-1">Setup Steps:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                      <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google Cloud Console</a>.</li>
                      <li>Click your <strong>OAuth 2.0 Client ID</strong>.</li>
                      <li>Scroll to <strong>Authorized JavaScript origins</strong>.</li>
                      <li>Click "Add URI" and paste the EXACT URL above.</li>
                      <li>Click <strong>Save</strong> and wait ~1 minute.</li>
                  </ol>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
