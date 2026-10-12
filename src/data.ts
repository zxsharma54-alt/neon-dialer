export interface CallEntry {
  id: string;
  name: string;
  number: string;
  type: 'incoming' | 'outgoing' | 'missed';
  timestamp: number;
  duration: number; // in seconds
}

export interface ContactEntry {
  id: string;
  name: string;
  number: string;
  avatarColor: string;
}

const RECENT_KEY = 'recentCalls';
const CONTACTS_KEY = 'neon_dialer_contacts';
const NUMBER_KEY = 'neon_dialer_number';

const AVATAR_COLORS = [
  '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa',
  '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6',
];

function pickAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function loadRecentCalls(): CallEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify([]));
  return [];
}

export function saveRecentCall(call: CallEntry): void {
  const calls = loadRecentCalls();
  const updated = [call, ...calls].slice(0, 50);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

export function loadContacts(): ContactEntry[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  localStorage.setItem(CONTACTS_KEY, JSON.stringify([]));
  return [];
}

export function addContact(name: string, number: string): { contacts: ContactEntry[]; error?: string } {
  const digits = cleanNumber(number);
  if (digits.length !== 10) {
    return { contacts: loadContacts(), error: 'Enter a valid 10-digit number' };
  }
  if (!name.trim()) {
    return { contacts: loadContacts(), error: 'Enter a name' };
  }
  const list = loadContacts();
  // Check for duplicate
  if (list.some((c) => cleanNumber(c.number) === digits)) {
    return { contacts: list, error: 'This number is already saved' };
  }
  const newContact: ContactEntry = {
    id: `c-${Date.now()}`,
    name: name.trim(),
    number: formatDisplayNumber(digits),
    avatarColor: pickAvatarColor(list.length),
  };
  const updated = [...list, newContact];
  saveContacts(updated);
  return { contacts: updated };
}

export function saveContacts(list: ContactEntry[]): void {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function updateContactName(id: string, newName: string): ContactEntry[] {
  const list = loadContacts();
  const updated = list.map((c) => (c.id === id ? { ...c, name: newName } : c));
  saveContacts(updated);
  return updated;
}

export function deleteContact(id: string): { contacts: ContactEntry[]; recentCalls: CallEntry[] } {
  const list = loadContacts();
  const contact = list.find((c) => c.id === id);
  const updatedContacts = list.filter((c) => c.id !== id);
  saveContacts(updatedContacts);

  // Also remove from recent calls if number matches
  let updatedRecent = loadRecentCalls();
  if (contact) {
    const digits = cleanNumber(contact.number);
    updatedRecent = updatedRecent.filter((c) => cleanNumber(c.number) !== digits);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updatedRecent));
  }
  return { contacts: updatedContacts, recentCalls: updatedRecent };
}

// ---------- Blocked Numbers ----------

const BLOCKED_KEY = 'neon_dialer_blocked';

export function loadBlockedNumbers(): string[] {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function saveBlockedNumbers(list: string[]): void {
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function isBlocked(number: string): boolean {
  const digits = cleanNumber(number);
  return loadBlockedNumbers().includes(digits);
}

export function toggleBlockNumber(number: string): boolean {
  const digits = cleanNumber(number);
  const list = loadBlockedNumbers();
  const idx = list.indexOf(digits);
  if (idx >= 0) {
    list.splice(idx, 1);
    saveBlockedNumbers(list);
    return false; // unblocked
  }
  list.push(digits);
  saveBlockedNumbers(list);
  return true; // blocked
}

export function loadSavedNumber(): string {
  try {
    return localStorage.getItem(NUMBER_KEY) || '';
  } catch {
    return '';
  }
}

export function saveNumber(num: string): void {
  try {
    localStorage.setItem(NUMBER_KEY, num);
  } catch {
    // ignore
  }
}

export function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function getInitials(name: string): string {
  if (name === 'Unknown') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatDisplayNumber(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length > 10 && digits.startsWith('91')) {
    const rest = digits.slice(2);
    if (rest.length === 10) return `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`;
  }
  return raw;
}

export function cleanNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

// ---------- Fake Name Map (Privacy Feature 3) ----------

const FAKE_NAMES_KEY = 'neon_dialer_fake_names';

const FAKE_NAME_POOL = ['Spam Likely', 'Jio Service', 'Unknown', 'Delivery Boy'];

export function loadFakeNameMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(FAKE_NAMES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

export function saveFakeNameMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(FAKE_NAMES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function toggleFakeName(number: string, realName: string): { faked: boolean; displayName: string } {
  const map = loadFakeNameMap();
  const key = cleanNumber(number);
  if (map[key]) {
    // Already faked — restore real name
    delete map[key];
    saveFakeNameMap(map);
    return { faked: false, displayName: realName };
  }
  // Apply a random fake name (different from current real name)
  const pool = FAKE_NAME_POOL.filter((n) => n !== realName);
  const fakeName = pool[Math.floor(Math.random() * pool.length)];
  map[key] = fakeName;
  saveFakeNameMap(map);
  return { faked: true, displayName: fakeName };
}

export function getDisplayName(number: string, realName: string): string {
  const map = loadFakeNameMap();
  const key = cleanNumber(number);
  if (map[key]) return map[key];
  // Never show "Unknown" — show number instead
  if (realName === 'Unknown') return number;
  return realName;
}

export function isFaked(number: string): boolean {
  const map = loadFakeNameMap();
  return !!map[cleanNumber(number)];
}

// ---------- Decoy State (Privacy Feature 2) ----------

const DECOY_KEY = 'isDecoyActive';

export function loadDecoyState(): boolean {
  try {
    return localStorage.getItem(DECOY_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveDecoyState(active: boolean): void {
  try {
    localStorage.setItem(DECOY_KEY, active ? 'true' : 'false');
  } catch {
    // ignore
  }
}

// ---------- Word-to-digit conversion (Privacy Feature 1) ----------

const WORD_DIGITS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  oh: '0',
};

export function wordsToDigits(text: string): string | null {
  const words = text.toLowerCase().split(/\s+/);
  const digits: string[] = [];
  for (const w of words) {
    const cleaned = w.replace(/[^a-z]/g, '');
    if (WORD_DIGITS[cleaned]) {
      digits.push(WORD_DIGITS[cleaned]);
    } else if (/^[0-9]$/.test(cleaned)) {
      digits.push(cleaned);
    }
  }
  return digits.length >= 3 ? digits.join('') : null;
}

export function extractContactName(text: string, contactNames: string[]): string | null {
  const lower = text.toLowerCase();
  // Remove common call phrases to isolate the name
  const cleaned = lower
    .replace(/\b(call|dial|phone|ko|karo|kardo|kar do|ko call karo|se call karo|se baat karo|baat|karo|kardiyo|kar)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Direct match against contact names
  for (const name of contactNames) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  // Try cleaned version
  for (const name of contactNames) {
    if (cleaned.includes(name.toLowerCase())) return name;
  }
  return null;
}
