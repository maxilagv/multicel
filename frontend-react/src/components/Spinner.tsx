export default function Spinner({ size = 16 }: { size?: number }) {
  const border = Math.max(2, Math.floor(size / 8));
  return (
    <span
      className="inline-block animate-spin rounded-full border-current border-r-transparent"
      style={{ width: size, height: size, borderWidth: border }}
      role="status"
      aria-label="Cargando"
    />
  );
}

