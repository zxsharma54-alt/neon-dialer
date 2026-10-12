import { useState, useCallback } from 'react';
import { Delete } from 'lucide-react';

interface CalculatorVaultProps {
  onSecretCode: () => void;
  onVoiceBack: () => void;
}

export default function CalculatorVault({ onSecretCode, onVoiceBack }: CalculatorVaultProps) {
  const [display, setDisplay] = useState('0');
  const [previous, setPrevious] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [secretBuffer, setSecretBuffer] = useState('');

  const inputDigit = useCallback((digit: string) => {
    setSecretBuffer((prev) => (prev + digit).slice(-6));

    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  }, [display, waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  }, [display, waitingForOperand]);

  const clear = useCallback(() => {
    setDisplay('0');
    setPrevious(null);
    setOperator(null);
    setWaitingForOperand(false);
  }, []);

  const performCalc = useCallback((a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : 0;
      case '%': return a % b;
      default: return b;
    }
  }, []);

  const handleOperator = useCallback((op: string) => {
    const current = parseFloat(display);
    if (previous === null) {
      setPrevious(current);
    } else if (operator) {
      const result = performCalc(previous, current, operator);
      setPrevious(result);
      setDisplay(String(result));
    }
    setOperator(op);
    setWaitingForOperand(true);
  }, [display, previous, operator, performCalc]);

  const handleEquals = useCallback(() => {
    const current = parseFloat(display);
    if (operator && previous !== null) {
      const result = performCalc(previous, current, operator);
      setDisplay(String(result));
      setPrevious(null);
      setOperator(null);
      setWaitingForOperand(true);
    }

    // Check secret code
    setSecretBuffer((prev) => {
      const code = (prev + display).slice(-6);
      if (code === '112233') {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 60]);
        setTimeout(() => onSecretCode(), 200);
        return '';
      }
      return '';
    });
  }, [display, operator, previous, performCalc, onSecretCode]);

  const handleBackspace = useCallback(() => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  }, [display]);

  const calcKeys = [
    { label: 'C', type: 'clear' as const, action: clear },
    { label: '%', type: 'op' as const, action: () => handleOperator('%') },
    { label: '/', type: 'op' as const, action: () => handleOperator('/') },
    { label: <Delete size={22} />, type: 'op' as const, action: handleBackspace },
    { label: '7', type: 'digit' as const, action: () => inputDigit('7') },
    { label: '8', type: 'digit' as const, action: () => inputDigit('8') },
    { label: '9', type: 'digit' as const, action: () => inputDigit('9') },
    { label: '*', type: 'op' as const, action: () => handleOperator('*') },
    { label: '4', type: 'digit' as const, action: () => inputDigit('4') },
    { label: '5', type: 'digit' as const, action: () => inputDigit('5') },
    { label: '6', type: 'digit' as const, action: () => inputDigit('6') },
    { label: '-', type: 'op' as const, action: () => handleOperator('-') },
    { label: '1', type: 'digit' as const, action: () => inputDigit('1') },
    { label: '2', type: 'digit' as const, action: () => inputDigit('2') },
    { label: '3', type: 'digit' as const, action: () => inputDigit('3') },
    { label: '+', type: 'op' as const, action: () => handleOperator('+') },
    { label: '0', type: 'digit' as const, action: () => inputDigit('0') },
    { label: '.', type: 'digit' as const, action: inputDecimal },
    { label: '=', type: 'equals' as const, action: handleEquals },
  ];

  // Hidden voice-back button area (top corner, invisible-ish)
  const handleHiddenVoiceBack = useCallback(() => {
    onVoiceBack();
  }, [onVoiceBack]);

  return (
    <div className="flex flex-col h-full bg-[#111827] px-6 py-4 decoy-fade-in">
      {/* Hidden tap zone for voice keyword fallback - invisible button in header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-600 text-sm font-medium">Calculator</span>
        <button
          onClick={handleHiddenVoiceBack}
          className="w-8 h-8 opacity-0"
          aria-label="hidden"
        />
      </div>

      {/* Display */}
      <div className="flex-1 flex flex-col justify-end items-end mb-4 min-h-[100px]">
        {previous !== null && operator && (
          <span className="text-gray-600 text-lg">
            {previous} {operator}
          </span>
        )}
        <span className="text-white text-5xl font-light tracking-tight truncate max-w-full">
          {display}
        </span>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-4 gap-3">
        {calcKeys.map((key, i) => {
          const colorClass =
            key.type === 'clear'
              ? 'bg-red-500/20 text-red-400 border-red-500/20'
              : key.type === 'equals'
              ? 'bg-sky-400/20 text-sky-400 border-sky-400/30'
              : key.type === 'op'
              ? 'bg-[#1e293b]/80 text-sky-400/70 border-sky-400/10'
              : 'bg-[#1e293b]/60 text-white border-white/5';

          return (
            <button
              key={i}
              onClick={key.action}
              className={`key-press aspect-square rounded-2xl border ${colorClass} flex items-center justify-center text-2xl font-light hover:brightness-125 transition-all`}
            >
              {key.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
