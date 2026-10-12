import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Phone, MessageCircle, Delete, X, Clock, User, ArrowDownLeft, ArrowUpRight, Search, ShieldCheck, PhoneOff, Mic, MicOff, MoreVertical, Pencil, Trash2, Ban, Check, UserPlus, Settings, ChevronLeft } from 'lucide-react';
import DirectCallPlugin from '@/plugins/DirectCallPlugin';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import CalculatorVault from '@/components/CalculatorVault';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import {
  loadRecentCalls, loadContacts, saveRecentCall, loadSavedNumber, saveNumber,
  formatTimestamp, formatDuration, getInitials, formatDisplayNumber, cleanNumber,
  getDisplayName, toggleFakeName, isFaked,
  loadDecoyState, saveDecoyState,
  wordsToDigits, extractContactName,
  updateContactName, deleteContact, isBlocked, toggleBlockNumber, addContact,
  type CallEntry, type ContactEntry,
} from '@/data';

type Tab = 'dialer' | 'recent' | 'contacts';

type CallState =
  | { phase: 'idle' }
  | { phase: 'calling'; entry: CallEntry }
  | { phase: 'summary'; entry: CallEntry; duration: number };

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dialer');
  const [number, setNumber] = useState<string>(() => loadSavedNumber());
  const [recentCalls, setRecentCalls] = useState<CallEntry[]>(() => loadRecentCalls());
  const [contacts, setContacts] = useState<ContactEntry[]>(() => loadContacts());
  const [searchQuery, setSearchQuery] = useState('');
  const [callState, setCallState] = useState<CallState>({ phase: 'idle' });
  const [secureLineContact, setSecureLineContact] = useState<ContactEntry | null>(null);
  const [isDecoyActive, setIsDecoyActive] = useState<boolean>(() => loadDecoyState());
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [privacyToast, setPrivacyToast] = useState<{ message: string; on: boolean } | null>(null);
  const [sheetContact, setSheetContact] = useState<ContactEntry | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [blockedTick, setBlockedTick] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactNumber, setNewContactNumber] = useState('');
  const [addError, setAddError] = useState('');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [glowKey, setGlowKey] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTriggeredRef = useRef(false);

  // Persist number to localStorage
  useEffect(() => {
    saveNumber(number);
  }, [number]);

  // ---------- Request CALL_PHONE permission on app start + start call waiting ----------
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const result = await DirectCallPlugin.checkPermission();
        if (!result.granted) {
          await DirectCallPlugin.requestPermission();
        }
        await DirectCallPlugin.startCallWaitingListener();
      } catch {
        // ignore — non-fatal
      }
    })();
    return () => {
      if (Capacitor.isNativePlatform()) {
        DirectCallPlugin.stopCallWaitingListener().catch(() => {});
      }
    };
  }, []);

  // Ensure CALL_PHONE permission before placing a call
  const ensureCallPermission = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return true;
    try {
      const check = await DirectCallPlugin.checkPermission();
      if (check.granted) return true;
      const req = await DirectCallPlugin.requestPermission();
      return req.granted;
    } catch {
      return false;
    }
  }, []);

  // Persist decoy state
  useEffect(() => {
    saveDecoyState(isDecoyActive);
  }, [isDecoyActive]);

  // Auto-dismiss privacy toast
  useEffect(() => {
    if (!privacyToast) return;
    const timer = setTimeout(() => setPrivacyToast(null), 2000);
    return () => clearTimeout(timer);
  }, [privacyToast]);

  // ---------- Feature 2: Shake Detection (clears number + triggers decoy) ----------
  useEffect(() => {
    if (isDecoyActive) return;

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      if (magnitude > 18 && !shakeTriggeredRef.current) {
        shakeTriggeredRef.current = true;
        setNumber('');
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        setPrivacyToast({ message: 'Cleared', on: true });
        setTimeout(() => { shakeTriggeredRef.current = false; }, 2000);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isDecoyActive]);

  // ---------- Feature 1: Voice Recognition ----------
  const handleVoiceResult = useCallback((transcript: string) => {
    const lower = transcript.toLowerCase().trim();

    // Check for "neon back" to exit decoy via voice
    if (lower.includes('neon back')) {
      setIsDecoyActive(false);
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      return;
    }

    // If in decoy mode, ignore other voice commands
    if (isDecoyActive) return;

    const contactNames = contacts.map((c) => c.name);

    // Check if transcript contains a contact name (e.g. "call papa", "papa ko call karo")
    const matchedName = extractContactName(lower, contactNames);
    if (matchedName) {
      const contact = contacts.find((c) => c.name === matchedName);
      if (contact) {
        setNumber(contact.number);
        setVoiceStatus(`Calling ${contact.name}...`);
        setIsListening(false);
        voiceStop();
        // Auto-call
        setTimeout(() => {
          setNumber(contact.number);
          (async () => {
            const digits = cleanNumber(contact.number);
            const telNumber = digits.length === 10 ? `91${digits}` : digits;
            const entry: CallEntry = {
              id: `call-${Date.now()}`,
              name: contact.name,
              number: formatDisplayNumber(contact.number),
              type: 'outgoing',
              timestamp: Date.now(),
              duration: 0,
            };
            if (Capacitor.isNativePlatform()) {
              const granted = await ensureCallPermission();
              if (granted) {
                try { await DirectCallPlugin.callNumber({ number: telNumber }); } catch { /* ignore */ }
              }
            } else {
              window.location.href = `tel:+${telNumber}`;
            }
            setCallState({ phase: 'calling', entry });
          })();
        }, 600);
        return;
      }
    }

    // Check if spoken words are digits ("six two nine...")
    const digitsFromWords = wordsToDigits(lower);
    if (digitsFromWords) {
      setNumber(digitsFromWords);
      setVoiceStatus(`Heard: ${digitsFromWords}`);
      setIsListening(false);
      voiceStop();
      return;
    }

    setVoiceStatus(`Didn't catch that`);
  }, [contacts, isDecoyActive]);

  const { start: voiceStart, stop: voiceStop } = useVoiceRecognition({ onResult: handleVoiceResult });

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      voiceStop();
      setIsListening(false);
      setVoiceStatus('');
    } else {
      const started = voiceStart();
      if (started) {
        setIsListening(true);
        setVoiceStatus('Listening...');
      } else {
        setVoiceStatus('Voice not supported');
        setTimeout(() => setVoiceStatus(''), 2000);
      }
    }
  }, [isListening, voiceStart, voiceStop]);

  // ---------- DTMF tick ----------
  const playTick = useCallback((key: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const freqs: Record<string, [number, number]> = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
      };
      const [f1, f2] = freqs[key] || [697, 1336];
      osc.frequency.setValueAtTime(f1, ctx.currentTime);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(f2, ctx.currentTime);
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.08, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.12);

      if (navigator.vibrate) navigator.vibrate(10);
    } catch {
      // ignore
    }
  }, []);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const keyLetters: Record<string, string> = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
    '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+',
  };

  const handleKey = useCallback((key: string) => {
    playTick(key);
    if (navigator.vibrate) navigator.vibrate(15);
    setGlowKey(key);
    setTimeout(() => setGlowKey(null), 300);
    setNumber((prev) => {
      const digits = prev.replace(/[^0-9]/g, '');
      if (digits.length >= 12) return prev;
      return prev + key;
    });
  }, [playTick]);

  const handleBackspace = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1));
  }, []);

  const backspaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBackspaceDown = useCallback(() => {
    backspaceTimer.current = setTimeout(() => {
      setNumber('');
      if (navigator.vibrate) navigator.vibrate(30);
    }, 600);
  }, []);
  const handleBackspaceUp = useCallback(() => {
    if (backspaceTimer.current) { clearTimeout(backspaceTimer.current); backspaceTimer.current = null; }
  }, []);

  const findContactByNumber = useCallback(
    (num: string): ContactEntry | null => {
      const digits = cleanNumber(num);
      return contacts.find((c) => cleanNumber(c.number) === digits) || null;
    },
    [contacts]
  );

  // ---------- Feature 3: Fake Name Toggle ----------
  const toggleFakeForNumber = useCallback((rawNumber: string, realName: string) => {
    const result = toggleFakeName(rawNumber, realName);
    setPrivacyToast({ message: result.faked ? 'Privacy On' : 'Privacy Off', on: result.faked });
    if (navigator.vibrate) navigator.vibrate(result.faked ? [20, 40, 20] : [40]);
    // Force re-render of recent calls
    setRecentCalls((prev) => [...prev]);
  }, []);

  // ---------- Call Logic ----------
  const startCall = useCallback(async () => {
    if (!number.trim()) return;
    const digits = cleanNumber(number);
    if (digits.length < 3) return;

    const contact = findContactByNumber(number);
    const realName = contact?.name || 'Unknown';
    const displayName = getDisplayName(number, realName);
    const entry: CallEntry = {
      id: `call-${Date.now()}`,
      name: displayName,
      number: formatDisplayNumber(number),
      type: 'outgoing',
      timestamp: Date.now(),
      duration: 0,
    };

    const telNumber = digits.length === 10 ? `91${digits}` : digits;

    if (Capacitor.isNativePlatform()) {
      const granted = await ensureCallPermission();
      if (granted) {
        try {
          await DirectCallPlugin.callNumber({ number: telNumber });
        } catch {
          // call still goes to system dialer
        }
      }
      setCallState({ phase: 'calling', entry });
    } else {
      window.location.href = `tel:+${telNumber}`;
      setCallState({ phase: 'calling', entry });
    }
  }, [number, findContactByNumber]);

  const handleCall = useCallback(() => {
    if (!number.trim()) return;
    startCall();
  }, [number, startCall]);

  const handleWhatsApp = useCallback(() => {
    if (!number.trim()) return;
    const digits = cleanNumber(number);
    if (digits.length < 3) return;
    const waNumber = digits.length === 10 ? `91${digits}` : digits;

    const contact = findContactByNumber(number);
    const realName = contact?.name || 'Unknown';
    const displayName = getDisplayName(number, realName);
    const entry: CallEntry = {
      id: `wa-${Date.now()}`,
      name: displayName,
      number: formatDisplayNumber(number),
      type: 'outgoing',
      timestamp: Date.now(),
      duration: 0,
    };
    saveRecentCall(entry);
    setRecentCalls((prev) => [entry, ...prev]);

    if (Capacitor.isNativePlatform()) {
      DirectCallPlugin.openWhatsApp({ number: waNumber }).catch(() => {
        window.open(`https://wa.me/${waNumber}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/${waNumber}`, '_blank');
    }
  }, [number, findContactByNumber]);

  const handleEndCall = useCallback(() => {
    if (callState.phase !== 'calling') return;
    const mockDuration = Math.floor(Math.random() * 150) + 30;
    const finalEntry = { ...callState.entry, duration: mockDuration };
    saveRecentCall(finalEntry);
    setRecentCalls((prev) => [finalEntry, ...prev]);
    setCallState({ phase: 'summary', entry: finalEntry, duration: mockDuration });
  }, [callState]);

  useEffect(() => {
    if (callState.phase !== 'summary') return;
    const timer = setTimeout(() => { setCallState({ phase: 'idle' }); }, 8000);
    return () => clearTimeout(timer);
  }, [callState]);

  const handleBackToDialer = useCallback(() => {
    setCallState({ phase: 'idle' });
    setActiveTab('dialer');
  }, []);

  const handleContactClick = useCallback((contact: ContactEntry) => {
    setNumber(contact.number);
    setActiveTab('dialer');
  }, []);

  // ---------- Contact menu handlers ----------
  const handleEditContact = useCallback((contact: ContactEntry) => {
    setEditName(contact.name);
    setEditMode(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!sheetContact || !editName.trim()) return;
    const updated = updateContactName(sheetContact.id, editName.trim());
    setContacts(updated);
    setEditMode(false);
    setSheetContact(null);
  }, [sheetContact, editName]);

  const handleDeleteContact = useCallback(() => {
    if (!sheetContact) return;
    const result = deleteContact(sheetContact.id);
    setContacts(result.contacts);
    setRecentCalls(result.recentCalls);
    setSheetContact(null);
  }, [sheetContact]);

  const handleBlockContact = useCallback(() => {
    if (!sheetContact) return;
    const blocked = toggleBlockNumber(sheetContact.number);
    setPrivacyToast({ message: blocked ? 'Number Blocked' : 'Number Unblocked', on: blocked });
    setBlockedTick((t) => t + 1);
    setSheetContact(null);
  }, [sheetContact]);

  const handleOpenAddDialog = useCallback(() => {
    setNewContactName('');
    setNewContactNumber('');
    setAddError('');
    setShowAddDialog(true);
  }, []);

  const handleSaveNewContact = useCallback(() => {
    const result = addContact(newContactName, newContactNumber);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    setContacts(result.contacts);
    setShowAddDialog(false);
    setNewContactName('');
    setNewContactNumber('');
    setAddError('');
    setPrivacyToast({ message: 'Contact Saved', on: true });
  }, [newContactName, newContactNumber]);

  const handleContactLongPressStart = useCallback((contact: ContactEntry) => {
    longPressTimer.current = setTimeout(() => {
      setSecureLineContact(contact);
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    }, 800);
  }, []);

  const handleContactLongPressEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  useEffect(() => {
    if (!secureLineContact) return;
    const timer = setTimeout(() => setSecureLineContact(null), 2000);
    return () => clearTimeout(timer);
  }, [secureLineContact]);

  const handleRecentCallClick = useCallback((call: CallEntry) => {
    setNumber(call.number);
    setActiveTab('dialer');
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (backspaceTimer.current) clearTimeout(backspaceTimer.current);
    };
  }, []);

  // ---------- Decoy exit ----------
  const handleSecretCodeExit = useCallback(() => {
    setIsDecoyActive(false);
    setActiveTab('dialer');
    if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 60]);
  }, []);

  const handleVoiceBackExit = useCallback(() => {
    setIsDecoyActive(false);
    setActiveTab('dialer');
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  }, []);

  // ---------- 3-sec press on keypad display for fake toggle ----------
  const keypadLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDisplayLongPressStart = useCallback(() => {
    if (!number.trim()) return;
    keypadLongPressTimer.current = setTimeout(() => {
      const contact = findContactByNumber(number);
      const realName = contact?.name || 'Unknown';
      toggleFakeForNumber(number, realName);
    }, 3000);
  }, [number, findContactByNumber, toggleFakeForNumber]);

  const handleDisplayLongPressEnd = useCallback(() => {
    if (keypadLongPressTimer.current) { clearTimeout(keypadLongPressTimer.current); keypadLongPressTimer.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      if (keypadLongPressTimer.current) clearTimeout(keypadLongPressTimer.current);
    };
  }, []);

  const displayNumber = formatDisplayNumber(number);

  const filteredContacts = contacts.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.number.includes(searchQuery)
  );
  const filteredRecent = recentCalls.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.number.includes(searchQuery)
  );

  const tabs: { id: Tab; label: string; icon: typeof Phone }[] = [
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'dialer', label: 'Dialer', icon: Phone },
    { id: 'contacts', label: 'Contacts', icon: User },
  ];

  // ---------- Render Privacy Policy ----------
  if (showPrivacyPolicy) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center font-sans">
        <div className="relative w-full max-w-[420px] h-screen max-h-[900px] bg-[#111827] overflow-hidden sm:rounded-[2.5rem] sm:border sm:border-white/5 sm:shadow-2xl sm:my-4">
          <PrivacyPolicy onBack={() => setShowPrivacyPolicy(false)} />
        </div>
      </div>
    );
  }

  // ---------- Render Settings ----------
  if (showSettings) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center font-sans">
        <div className="relative w-full max-w-[420px] h-screen max-h-[900px] bg-[#111827] flex flex-col overflow-hidden sm:rounded-[2.5rem] sm:border sm:border-white/5 sm:shadow-2xl sm:my-4">
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-white/5">
            <button
              onClick={() => setShowSettings(false)}
              className="w-10 h-10 rounded-full bg-[#1e293b]/60 border border-white/5 flex items-center justify-center hover:bg-sky-400/10 transition-all shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={20} className="text-sky-400" />
            </button>
            <h1 className="text-xl font-bold text-white">Settings</h1>
          </div>
          <div className="flex-1 px-6 py-4 space-y-2 overflow-y-auto fade-in">
            <button
              onClick={() => { setShowSettings(false); setShowPrivacyPolicy(true); }}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-[#1e293b]/60 hover:bg-sky-400/10 transition-colors text-left"
            >
              <ShieldCheck size={22} className="text-sky-400" />
              <span className="text-white text-sm font-medium flex-1">Privacy Policy</span>
              <ChevronLeft size={18} className="text-gray-600 rotate-180" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Render Decoy Calculator ----------
  if (isDecoyActive) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center font-sans">
        <div className="relative w-full max-w-[420px] h-screen max-h-[900px] bg-[#111827] flex flex-col overflow-hidden sm:rounded-[2.5rem] sm:border sm:border-white/5 sm:shadow-2xl sm:my-4">
          <CalculatorVault onSecretCode={handleSecretCodeExit} onVoiceBack={handleVoiceBackExit} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center font-sans">
      <div className="relative w-full max-w-[420px] h-screen max-h-[900px] bg-[#111827] flex flex-col overflow-hidden sm:rounded-[2.5rem] sm:border sm:border-white/5 sm:shadow-2xl sm:my-4">
        {/* Status bar spacer */}
        <div className="h-7 flex items-center justify-between px-6 text-[10px] text-sky-400/40 font-medium tracking-wider pt-2">
          <span>NEON DIALER</span>
          <span>5G</span>
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {activeTab === 'dialer' && 'Keypad'}
            {activeTab === 'recent' && 'Recent Calls'}
            {activeTab === 'contacts' && 'Contacts'}
          </h1>
          {/* Mic button + Add contact button */}
          <div className="flex items-center gap-2">
            {activeTab === 'contacts' && (
              <button
                onClick={handleOpenAddDialog}
                className="w-10 h-10 rounded-full bg-sky-400/10 border border-sky-400/30 flex items-center justify-center hover:bg-sky-400/20 transition-all"
                aria-label="Add contact"
              >
                <UserPlus size={18} className="text-sky-400" />
              </button>
            )}
            {activeTab === 'dialer' && (
              <button
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 rounded-full bg-[#1e293b]/60 border border-white/5 flex items-center justify-center hover:bg-sky-400/10 transition-all"
                aria-label="Settings"
              >
                <Settings size={18} className="text-gray-500" />
              </button>
            )}
            <button
              onClick={handleMicToggle}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-sky-400/20 border border-sky-400/40 mic-listening'
                  : 'bg-[#1e293b]/60 border border-white/5'
              }`}
              aria-label="Voice dial"
            >
              {isListening ? (
                <Mic size={20} className="text-sky-400 neon-text" />
              ) : (
                <MicOff size={18} className="text-gray-500" />
              )}
            </button>
          </div>
        </div>

        {/* Voice status */}
        {voiceStatus && (
          <div className="px-5 pb-2">
            <div className="bg-sky-400/10 border border-sky-400/20 rounded-lg px-3 py-1.5 text-sky-400/80 text-xs flex items-center gap-2 fade-in">
              <Mic size={12} className={isListening ? 'mic-listening' : ''} />
              {voiceStatus}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'dialer' && (
            <DialerView
              number={number}
              displayNumber={displayNumber}
              keys={keys}
              keyLetters={keyLetters}
              onKey={handleKey}
              onBackspace={handleBackspace}
              onBackspaceDown={handleBackspaceDown}
              onBackspaceUp={handleBackspaceUp}
              onCall={handleCall}
              onWhatsApp={handleWhatsApp}
              onDisplayLongPressStart={handleDisplayLongPressStart}
              onDisplayLongPressEnd={handleDisplayLongPressEnd}
              isFaked={number.trim() ? isFaked(number) : false}
              glowKey={glowKey}
            />
          )}

          {activeTab === 'recent' && (
            <ListView
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isEmpty={filteredRecent.length === 0}
              emptyMessage="No recent calls yet"
            >
              {filteredRecent.map((call) => (
                <RecentCallRow
                  key={call.id}
                  call={call}
                  onCall={handleRecentCallClick}
                  onLongPressToggle={toggleFakeForNumber}
                />
              ))}
            </ListView>
          )}

          {activeTab === 'contacts' && (
            <ListView
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isEmpty={filteredContacts.length === 0}
              emptyMessage="No contacts found"
            >
              {filteredContacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  onClick={handleContactClick}
                  onLongPressStart={handleContactLongPressStart}
                  onLongPressEnd={handleContactLongPressEnd}
                  onMenuOpen={setSheetContact}
                  blockedTick={blockedTick}
                />
              ))}
            </ListView>
          )}
        </div>

        {/* Bottom Tab Bar */}
        <div className="relative border-t border-white/5 bg-[#0d1320]/80 backdrop-blur-xl px-2 pt-2 pb-5">
          <div className="flex items-center justify-around">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex flex-col items-center gap-1 px-6 py-1.5 rounded-xl transition-all"
                >
                  <Icon
                    size={22}
                    className={`transition-all duration-200 ${isActive ? 'text-sky-400 neon-text' : 'text-gray-500'}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span className={`text-[10px] font-medium transition-all duration-200 ${isActive ? 'text-sky-400' : 'text-gray-600'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secure Line Toast */}
        {secureLineContact && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 toast-in">
            <div className="bg-sky-400/10 backdrop-blur-xl border border-sky-400/30 rounded-2xl px-5 py-3 flex items-center gap-3 neon-glow">
              <ShieldCheck size={22} className="text-sky-400 neon-text" />
              <div>
                <div className="text-sky-400 text-sm font-semibold neon-text">Secure Line Connected</div>
                <div className="text-sky-400/60 text-xs">{secureLineContact.name}</div>
              </div>
            </div>
          </div>
        )}

        {/* Privacy Toast */}
        {privacyToast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 privacy-toast">
            <div className={`backdrop-blur-xl border rounded-2xl px-5 py-3 flex items-center gap-3 ${
              privacyToast.on
                ? 'bg-green-400/10 border-green-400/30'
                : 'bg-orange-400/10 border-orange-400/30'
            }`}>
              <ShieldCheck size={20} className={privacyToast.on ? 'text-green-400' : 'text-orange-400'} />
              <span className={`text-sm font-semibold ${privacyToast.on ? 'text-green-400' : 'text-orange-400'}`}>
                {privacyToast.message}
              </span>
            </div>
          </div>
        )}

        {/* Call Overlay */}
        {callState.phase === 'calling' && (
          <CallOverlay call={callState.entry} onEnd={handleEndCall} onLongPressToggle={toggleFakeForNumber} />
        )}

        {/* Post-Call Summary */}
        {callState.phase === 'summary' && (
          <PostCallSummary entry={callState.entry} duration={callState.duration} onBackToDialer={handleBackToDialer} />
        )}

        {/* Contact Bottom Sheet */}
        {sheetContact && (
          <ContactSheet
            contact={sheetContact}
            editMode={editMode}
            editName={editName}
            setEditName={setEditName}
            onEdit={handleEditContact}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDeleteContact}
            onBlock={handleBlockContact}
            onClose={() => { setSheetContact(null); setEditMode(false); }}
          />
        )}

        {/* Add Contact Dialog */}
        {showAddDialog && (
          <AddContactDialog
            name={newContactName}
            number={newContactNumber}
            error={addError}
            onNameChange={setNewContactName}
            onNumberChange={setNewContactNumber}
            onSave={handleSaveNewContact}
            onClose={() => setShowAddDialog(false)}
          />
        )}

      </div>
    </div>
  );
}

/* ---------- Dialer View ---------- */

interface DialerViewProps {
  number: string;
  displayNumber: string;
  keys: string[];
  keyLetters: Record<string, string>;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onBackspaceDown: () => void;
  onBackspaceUp: () => void;
  onCall: () => void;
  onWhatsApp: () => void;
  onDisplayLongPressStart: () => void;
  onDisplayLongPressEnd: () => void;
  isFaked: boolean;
  glowKey: string | null;
}

function DialerView({
  number, displayNumber, keys, keyLetters,
  onKey, onBackspace, onBackspaceDown, onBackspaceUp,
  onCall, onWhatsApp, onDisplayLongPressStart, onDisplayLongPressEnd, isFaked, glowKey,
}: DialerViewProps) {
  return (
    <div className="flex flex-col flex-1 px-6 pb-2 fade-in">
      {/* Display Field — 3-sec long press for fake name toggle */}
      <div
        className="flex items-center justify-end min-h-[72px] mb-4 mt-2"
        onPointerDown={onDisplayLongPressStart}
        onPointerUp={onDisplayLongPressEnd}
        onPointerLeave={onDisplayLongPressEnd}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {number && (
            <button
              onClick={() => onBackspace()}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1.5"
              aria-label="Clear last digit"
            >
              <X size={18} />
            </button>
          )}
          <span
            className={`text-right font-light tracking-wider truncate transition-all duration-200 ${
              number ? (isFaked ? 'text-orange-400' : 'text-white') + ' text-3xl neon-text' : 'text-gray-600 text-2xl'
            }`}
          >
            {number ? displayNumber : '+91'}
          </span>
          {isFaked && <ShieldCheck size={14} className="text-orange-400 shrink-0" />}
        </div>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-3 flex-1 max-h-[340px]">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() => onKey(key)}
            className={`key-press aspect-square max-h-[72px] mx-auto w-full rounded-full border flex flex-col items-center justify-center transition-all duration-200 ${
              glowKey === key
                ? 'bg-sky-400/20 border-sky-400/50 neon-glow scale-95'
                : 'bg-[#1e293b]/60 border-sky-400/10 hover:bg-sky-400/10 hover:border-sky-400/30'
            }`}
          >
            <span className={`text-3xl font-light leading-none transition-all duration-200 ${
              glowKey === key ? 'text-sky-300 neon-text' : 'text-sky-400 neon-text'
            }`}>{key}</span>
            {keyLetters[key] && (
              <span className="text-[8px] font-medium text-sky-400/40 tracking-[0.2em] mt-0.5">{keyLetters[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4 mt-4 mb-1 px-2">
        <button
          onClick={onWhatsApp}
          disabled={!number.trim()}
          className="key-press w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center call-glow hover:brightness-110 transition-all disabled:opacity-30"
          aria-label="WhatsApp"
        >
          <MessageCircle size={26} className="text-white" fill="white" />
        </button>

        <button
          onClick={onCall}
          disabled={!number.trim()}
          className="key-press w-20 h-20 rounded-full bg-green-500 flex items-center justify-center call-glow hover:brightness-110 transition-all relative disabled:opacity-30"
          aria-label="Call"
        >
          <Phone size={32} className="text-white" fill="white" />
        </button>

        <button
          onClick={onBackspace}
          onPointerDown={onBackspaceDown}
          onPointerUp={onBackspaceUp}
          onPointerLeave={onBackspaceUp}
          disabled={!number}
          className="key-press w-14 h-14 rounded-full bg-[#1e293b]/60 border border-white/5 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/30 transition-all disabled:opacity-30"
          aria-label="Backspace"
        >
          <Delete size={24} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
}

/* ---------- List View ---------- */

interface ListViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}

function ListView({ searchQuery, setSearchQuery, isEmpty, emptyMessage, children }: ListViewProps) {
  const hasContent = searchQuery.length > 0;
  return (
    <div className="flex flex-col flex-1 overflow-hidden fade-in px-4 pb-2">
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search calls or contacts"
          className="w-full bg-[#1e293b]/50 border border-white/5 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-sky-400/30 transition-colors"
        />
        {hasContent && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
            <Search size={32} className="opacity-30" />
            <span className="text-sm">{emptyMessage}</span>
          </div>
        ) : children}
      </div>
    </div>
  );
}

/* ---------- Recent Call Row with 3-sec long press ---------- */

function RecentCallRow({
  call, onCall, onLongPressToggle,
}: {
  call: CallEntry;
  onCall: (call: CallEntry) => void;
  onLongPressToggle: (number: string, realName: string) => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    longPressTriggeredRef.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPressToggle(call.number, call.name);
    }, 3000);
  }, [call, onLongPressToggle]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  // Use the stored display name (which may already be faked in the call entry)
  const displayName = getDisplayName(call.number, call.name);
  const faked = isFaked(call.number);

  const callIcon = {
    incoming: <ArrowDownLeft size={14} className="text-green-400" />,
    outgoing: <ArrowUpRight size={14} className="text-sky-400" />,
    missed: <ArrowDownLeft size={14} className="text-red-400" />,
  };
  const nameColor = call.type === 'missed' ? 'text-red-400' : 'text-white';

  return (
    <div
      onClick={() => { if (!longPressTriggeredRef.current) onCall(call); }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left slide-up cursor-pointer select-none"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
        style={{ background: displayName === call.number ? '#374151' : '#1e3a5f' }}
      >
        {getInitials(displayName === call.number ? '?' : displayName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${nameColor} flex items-center gap-1.5`}>
          {displayName}
          {faked && <ShieldCheck size={12} className="text-orange-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {callIcon[call.type]}
          <span className="truncate">{call.number}</span>
          {call.duration > 0 && <span className="text-gray-600">· {formatDuration(call.duration)}</span>}
        </div>
      </div>
      <div className="text-[10px] text-gray-600 shrink-0">{formatTimestamp(call.timestamp)}</div>
    </div>
  );
}

/* ---------- Contact Row ---------- */

interface ContactRowProps {
  contact: ContactEntry;
  onClick: (contact: ContactEntry) => void;
  onLongPressStart: (contact: ContactEntry) => void;
  onLongPressEnd: () => void;
  onMenuOpen: (contact: ContactEntry) => void;
  blockedTick: number;
}

function ContactRow({ contact, onClick, onLongPressStart, onLongPressEnd, onMenuOpen, blockedTick }: ContactRowProps) {
  // blockedTick forces re-read of blocked state
  const blocked = isBlocked(contact.number);

  return (
    <div
      onClick={() => onClick(contact)}
      onPointerDown={() => onLongPressStart(contact)}
      onPointerUp={onLongPressEnd}
      onPointerLeave={onLongPressEnd}
      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors slide-up cursor-pointer select-none"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
        style={{ background: blocked ? '#7f1d1d' : `${contact.avatarColor}30`, color: blocked ? '#f87171' : contact.avatarColor }}
      >
        {getInitials(contact.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate flex items-center gap-1.5">
          {contact.name}
          {blocked && (
            <span className="text-[9px] font-bold text-red-400 bg-red-400/15 border border-red-400/30 px-1.5 py-0.5 rounded-full">
              BLOCKED
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 truncate">{contact.number}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onMenuOpen(contact); }}
        className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-sky-400 transition-colors shrink-0"
        aria-label="Contact options"
      >
        <MoreVertical size={18} />
      </button>
    </div>
  );
}

/* ---------- Contact Bottom Sheet ---------- */

interface ContactSheetProps {
  contact: ContactEntry;
  editMode: boolean;
  editName: string;
  setEditName: (name: string) => void;
  onEdit: (contact: ContactEntry) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onClose: () => void;
}

function ContactSheet({
  contact, editMode, editName, setEditName, onEdit, onSaveEdit, onDelete, onBlock, onClose,
}: ContactSheetProps) {
  const blocked = isBlocked(contact.number);

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 sheet-overlay" />
      <div
        className="relative bg-[#1e293b] border-t border-sky-400/20 rounded-t-3xl p-6 pb-8 sheet-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-5" />

        {/* Contact info header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold shrink-0"
            style={{ background: blocked ? '#7f1d1d' : `${contact.avatarColor}30`, color: blocked ? '#f87171' : contact.avatarColor }}
          >
            {getInitials(editMode ? editName : contact.name)}
          </div>
          <div className="flex-1 min-w-0">
            {editMode ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  className="bg-[#111827] border border-sky-400/30 rounded-lg px-3 py-1.5 text-white text-sm outline-none flex-1"
                  placeholder="Enter name"
                />
                <button
                  onClick={onSaveEdit}
                  className="w-8 h-8 rounded-full bg-sky-400/20 flex items-center justify-center shrink-0"
                  aria-label="Save name"
                >
                  <Check size={16} className="text-sky-400" />
                </button>
              </div>
            ) : (
              <>
                <div className="text-white font-medium truncate">{contact.name}</div>
                <div className="text-gray-500 text-xs truncate">{contact.number}</div>
              </>
            )}
          </div>
        </div>

        {/* Menu options */}
        {!editMode && (
          <div className="space-y-2">
            <button
              onClick={() => onEdit(contact)}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#111827]/60 hover:bg-sky-400/10 transition-colors text-left"
            >
              <Pencil size={20} className="text-sky-400" />
              <span className="text-white text-sm font-medium">Save / Edit Name</span>
            </button>

            <button
              onClick={onDelete}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#111827]/60 hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 size={20} className="text-red-400" />
              <span className="text-red-400 text-sm font-medium">Delete Contact</span>
            </button>

            <button
              onClick={onBlock}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#111827]/60 hover:bg-red-500/10 transition-colors text-left"
            >
              <Ban size={20} className={blocked ? 'text-green-400' : 'text-red-400'} />
              <span className={`text-sm font-medium ${blocked ? 'text-green-400' : 'text-red-400'}`}>
                {blocked ? 'Unblock Number' : 'Block Number'}
              </span>
            </button>

            <button
              onClick={onClose}
              className="w-full p-3.5 rounded-xl bg-[#111827]/60 hover:bg-white/5 transition-colors text-center text-gray-400 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Call Overlay with 3-sec fake toggle ---------- */

function CallOverlay({
  call, onEnd, onLongPressToggle,
}: {
  call: CallEntry;
  onEnd: () => void;
  onLongPressToggle: (number: string, realName: string) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [displayName, setDisplayName] = useState(call.name);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => { setElapsed((prev) => prev + 1); }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Refresh display name in case it was toggled
  useEffect(() => {
    setDisplayName(getDisplayName(call.number, call.name));
  }, [call]);

  const handlePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      // Find real name from contacts by matching number
      onLongPressToggle(call.number, call.name);
      // Update display after toggle
      setTimeout(() => setDisplayName(getDisplayName(call.number, call.name)), 100);
    }, 3000);
  }, [call, onLongPressToggle]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  }, []);

  return (
    <div className="absolute inset-0 z-50 bg-[#111827]/95 backdrop-blur-md flex flex-col items-center justify-between py-16 fade-in">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sky-400/60 text-sm tracking-widest uppercase">
          {elapsed === 0 ? 'Calling...' : formatDuration(elapsed)}
        </span>
      </div>

      {/* Long-pressable avatar area */}
      <div
        className="flex flex-col items-center gap-4"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-sky-400/20 pulse-ring" />
          <div className="absolute inset-0 rounded-full bg-sky-400/10 pulse-ring" style={{ animationDelay: '0.4s' }} />
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center text-4xl font-bold text-white neon-glow select-none"
            style={{ background: displayName === call.number ? '#374151' : '#1e3a5f' }}
          >
            {getInitials(displayName === call.number ? '?' : displayName)}
          </div>
        </div>
        <div className="text-2xl font-semibold text-white">{displayName}</div>
        <div className="text-sky-400/70 text-lg tracking-wider">{call.number}</div>
        <span className="text-gray-600 text-[10px]">Hold to toggle privacy</span>
      </div>

      <button
        onClick={onEnd}
        className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:brightness-110 transition-all"
        style={{ boxShadow: '0 0 16px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.2)' }}
        aria-label="End call"
      >
        <Phone size={28} className="text-white rotate-[135deg]" fill="white" />
      </button>
    </div>
  );
}

/* ---------- Post-Call Summary ---------- */

function PostCallSummary({
  entry, duration, onBackToDialer,
}: {
  entry: CallEntry;
  duration: number;
  onBackToDialer: () => void;
}) {
  const displayName = getDisplayName(entry.number, entry.name);
  return (
    <div className="absolute inset-0 z-50 bg-[#111827]/95 backdrop-blur-md flex flex-col items-center justify-center gap-6 fade-in px-8">
      <div className="summary-slide-up bg-[#1e293b]/60 border border-sky-400/20 rounded-3xl p-8 w-full max-w-sm flex flex-col items-center gap-5 neon-glow">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <PhoneOff size={30} className="text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Call Disconnected</h2>
          <p className="text-sky-400/60 text-sm mt-1">{displayName}</p>
          <p className="text-gray-500 text-xs">{entry.number}</p>
        </div>
        <div className="flex items-center gap-3 bg-[#111827]/60 rounded-xl px-5 py-3 w-full justify-center">
          <Clock size={18} className="text-sky-400" />
          <span className="text-sky-400 text-lg font-semibold neon-text">{formatDuration(duration)}</span>
        </div>
        <button
          onClick={onBackToDialer}
          className="w-full bg-sky-400/20 hover:bg-sky-400/30 border border-sky-400/30 text-sky-400 font-medium py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Phone size={18} />
          Back to Dialer
        </button>
      </div>
    </div>
  );
}

/* ---------- Add Contact Dialog ---------- */

interface AddContactDialogProps {
  name: string;
  number: string;
  error: string;
  onNameChange: (name: string) => void;
  onNumberChange: (number: string) => void;
  onSave: () => void;
  onClose: () => void;
}

function AddContactDialog({ name, number, error, onNameChange, onNumberChange, onSave, onClose }: AddContactDialogProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 sheet-overlay" />
      <div
        className="relative bg-[#1e293b] border border-sky-400/20 rounded-3xl p-6 w-[88%] max-w-sm sheet-enter neon-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <UserPlus size={20} className="text-sky-400" />
            <h2 className="text-lg font-bold text-white">Add New Contact</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1.5 block">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              autoFocus
              placeholder="e.g. Rahul"
              className="w-full bg-[#111827] border border-sky-400/20 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 outline-none focus:border-sky-400/40 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 font-medium mb-1.5 block">Phone Number</label>
            <input
              type="tel"
              inputMode="numeric"
              value={number}
              onChange={(e) => onNumberChange(e.target.value)}
              placeholder="10-digit number"
              className="w-full bg-[#111827] border border-sky-400/20 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 outline-none focus:border-sky-400/40 transition-colors"
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 fade-in">
              {error}
            </div>
          )}

          <button
            onClick={onSave}
            className="w-full bg-sky-400/20 hover:bg-sky-400/30 border border-sky-400/30 text-sky-400 font-medium py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Save Contact
          </button>
        </div>
      </div>
    </div>
  );
}
