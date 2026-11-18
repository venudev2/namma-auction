import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { DEV_NOTE_CONFIG } from '../../data/feedback';

export default function DevNote() {
  const [avatarError, setAvatarError] = useState(false);

  const openFeedback = () => {
    window.dispatchEvent(new CustomEvent('open-feedback-modal'));
    document.getElementById('feedback-fab-button')?.click();
  };

  return (
    <div className="w-full h-full rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/10 p-5 sm:p-7 flex flex-col justify-between backdrop-blur-sm relative overflow-hidden">
      <div>
        {/* Header with Heading & Creator Names (No Picture) */}
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-pixel text-sm sm:text-base uppercase tracking-wider text-amber-400">
                {DEV_NOTE_CONFIG.heading}
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-white font-bold mt-1">
              Created by {DEV_NOTE_CONFIG.name} ({DEV_NOTE_CONFIG.role})
            </p>
          </div>
          <div className="px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-pixel uppercase tracking-widest">
            OG Creators
          </div>
        </div>

        {/* Note Body */}
        <p className="text-xs sm:text-[13px] leading-relaxed text-slate-300 font-normal mb-6">
          {DEV_NOTE_CONFIG.copy}
        </p>

        {/* What Keeps This Alive Strip */}
        <div className="mb-6">
          <span className="text-[9px] font-pixel uppercase tracking-widest text-slate-400 block mb-2">
            WHAT KEEPS THIS ALIVE
          </span>
          <div className="flex flex-wrap gap-2">
            {DEV_NOTE_CONFIG.chips.map((chip, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/40 border border-white/5 font-pixel text-[9px] uppercase tracking-wider text-slate-300"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="pt-4 border-t border-white/5 flex flex-wrap items-center gap-3">
        {/* Send feedback primary button */}
        <button
          type="button"
          onClick={openFeedback}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-pixel text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95"
        >
          <MessageSquare size={13} />
          <span>{DEV_NOTE_CONFIG.feedbackBtnText}</span>
        </button>
      </div>
    </div>
  );
}

