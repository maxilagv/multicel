type LogoProps = {
  name?: string;
  subtitle?: string;
  logoUrl?: string; // opcional para multiempresa
};

export default function Logo({ name = 'Sistema Argensystem', subtitle = 'Panel de gestion', logoUrl }: LogoProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="h-16 w-16 rounded-2xl object-cover" />
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-400 text-white flex items-center justify-center shadow-[0_12px_30px_rgba(99,102,241,0.35)]">
          <span className="text-2xl font-semibold font-logo tracking-wide">{initials || 'SA'}</span>
        </div>
      )}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-300">
          Ingresar al sistema
        </h1>
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>
    </div>
  );
}
