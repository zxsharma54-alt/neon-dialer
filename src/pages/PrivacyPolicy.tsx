import { ChevronLeft, ShieldCheck, Mail } from 'lucide-react';

export default function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-[60] bg-[#111827] flex flex-col overflow-y-auto fade-in">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-white/5">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1e293b]/60 border border-white/5 flex items-center justify-center hover:bg-sky-400/10 transition-all shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={20} className="text-sky-400" />
        </button>
        <h1 className="text-xl font-bold text-white">Privacy Policy</h1>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-sky-400/10 border border-sky-400/30 flex items-center justify-center">
            <ShieldCheck size={24} className="text-sky-400 neon-text" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Rapped Dialer</h2>
            <p className="text-sky-400/60 text-xs">Privacy Policy</p>
          </div>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            We do not collect, store, or share your contacts, call logs, or personal data.
            All dialing happens directly from your device using Android Telecom.
            No data goes to our server.
          </p>

          <div className="bg-[#1e293b]/60 border border-sky-400/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sky-400 font-semibold text-sm">Data We Do NOT Collect</h3>
            <ul className="text-gray-400 text-xs space-y-1.5 pl-4 list-disc">
              <li>Your contacts or phonebook</li>
              <li>Your call history or logs</li>
              <li>Your location or device info</li>
              <li>Personal identification data</li>
            </ul>
          </div>

          <div className="bg-[#1e293b]/60 border border-sky-400/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sky-400 font-semibold text-sm">How Calls Work</h3>
            <p className="text-gray-400 text-xs">
              Calls are placed directly through your phone's native calling system.
              We do not route, intercept, or store any call data.
            </p>
          </div>

          <div className="bg-[#1e293b]/60 border border-sky-400/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sky-400 font-semibold text-sm">Permissions Used</h3>
            <ul className="text-gray-400 text-xs space-y-1.5 pl-4 list-disc">
              <li>CALL_PHONE — to place calls directly</li>
              <li>READ_PHONE_STATE — to detect call status for call waiting</li>
              <li>VIBRATE — for haptic feedback on key presses</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-4">
          <a
            href="mailto:support@rapped.app"
            className="flex items-center gap-2 text-sky-400 hover:text-sky-300 transition-colors text-sm"
          >
            <Mail size={16} />
            support@rapped.app
          </a>
        </div>
      </div>
    </div>
  );
}
