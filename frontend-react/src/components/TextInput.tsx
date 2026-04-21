import { InputHTMLAttributes, forwardRef, useState } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  revealable?: boolean;
  containerClassName?: string;
  labelClassName?: string;
};

const TextInput = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className = '', id, revealable = false, containerClassName = '', labelClassName = '', type, ...rest }, ref) => {
    const [revealed, setRevealed] = useState(false);
    const inputId = id || rest.name || label.replace(/\s+/g, '-').toLowerCase();
    const hasError = Boolean(error);
    const errorId = `${inputId}-error`;
    const isPassword = type === 'password';
    const showToggle = revealable && isPassword;
    const inputType = showToggle ? (revealed ? 'text' : 'password') : type;
    return (
      <div className={['space-y-1.5', containerClassName].join(' ')}>
        <label htmlFor={inputId} className={['text-sm font-medium text-slate-300', labelClassName].join(' ')}>
          {label}
        </label>
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={[
              'w-full h-11 rounded-lg border bg-white/5 px-3 text-[15px] outline-none transition text-slate-100',
              'placeholder:text-slate-400',
              hasError
                ? 'border-red-500/40 focus:border-red-500 focus:ring-2 focus:ring-red-500/30'
                : 'border-white/10 focus:border-accent-400/60 focus:ring-2 focus:ring-accent-400/40',
              showToggle ? 'pr-11' : '',
              className,
            ].join(' ')}
            type={inputType}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : rest['aria-describedby']}
            {...rest}
          />
          {showToggle && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 transition hover:bg-indigo-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
              onClick={() => setRevealed((prev) => !prev)}
              aria-label={revealed ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {revealed ? (
                  <>
                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.5 5.5A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a18.4 18.4 0 0 1-3.3 4.5" />
                    <path d="M6.2 6.2A18.1 18.1 0 0 0 2 12s3.6 6 10 6a10.6 10.6 0 0 0 4.5-1" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
        {hasError && (
          <p id={errorId} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);

export default TextInput;
