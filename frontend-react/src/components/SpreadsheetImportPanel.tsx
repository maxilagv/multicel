import { useEffect, useMemo, useState, type DragEvent } from 'react';
import Alert from './Alert';
import Button from '../ui/Button';
import { readSpreadsheetPreview, type SpreadsheetPreview } from '../lib/spreadsheetPreview';
import { useImportJobStream } from '../hooks/useImportJobStream';

type UploadOptions = {
  dryRun?: boolean;
  async?: boolean;
};

type SpreadsheetImportPanelProps = {
  title: string;
  description: string;
  templateName: string;
  templateHeaders: string[];
  upload: (file: File, opts?: UploadOptions) => Promise<any>;
  onCompleted?: () => Promise<void> | void;
  allowAsync?: boolean;
  className?: string;
};

type ImportMetrics = {
  total: number;
  created: number;
  skipped: number;
  errors: number;
};

function summarizeResult(result: any): ImportMetrics {
  const totals = result?.totals;
  if (totals) {
    return {
      total: Number(totals.rows || result?.total || 0),
      created: Number(totals.created ?? totals.would_create ?? result?.created ?? 0),
      skipped: Number(totals.skipped || result?.skipped || 0),
      errors: Number(totals.errors || result?.errorCount || result?.errors?.length || 0),
    };
  }

  return {
    total: Number(result?.total || result?.totalRows || result?.processed_rows || 0),
    created: Number(result?.created ?? result?.created_rows ?? 0),
    skipped: Number(result?.skipped ?? result?.skipped_rows ?? 0),
    errors: Array.isArray(result?.errors)
      ? result.errors.length
      : Number(result?.errorCount || result?.errors || 0),
  };
}

function formatCell(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '-';
}

function downloadTemplate(headers: string[], fileName: string) {
  const csvContent = `${headers.join(',')}\n`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function SpreadsheetImportPanel({
  title,
  description,
  templateName,
  templateHeaders,
  upload,
  onCompleted,
  allowAsync = true,
  className = '',
}: SpreadsheetImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SpreadsheetPreview>({ headers: [], rows: [] });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState<'preview' | 'import' | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [preferAsync, setPreferAsync] = useState(allowAsync);
  const [jobId, setJobId] = useState<string | null>(null);

  const jobQuery = useImportJobStream(jobId, Boolean(jobId));

  useEffect(() => {
    if (!file) {
      setPreview({ headers: [], rows: [] });
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    readSpreadsheetPreview(file, 5)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({ headers: [], rows: [] });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const status = jobQuery.data?.status;
    if (!jobId || (status !== 'completed' && status !== 'failed')) return;
    setResult(jobQuery.data);
    if (status === 'completed') {
      void onCompleted?.();
    }
  }, [jobId, jobQuery.data, onCompleted]);

  const currentResult = jobQuery.data || result;
  const metrics = useMemo(() => summarizeResult(currentResult), [currentResult]);
  const serverPreview = Array.isArray(currentResult?.preview) ? currentResult.preview : [];
  const serverErrors = Array.isArray(currentResult?.errors) ? currentResult.errors : [];

  async function execute(dryRun: boolean) {
    if (!file) {
      setError('Seleccioná un archivo .xlsx o .csv para continuar.');
      return;
    }

    setError(null);
    setResult(null);
    if (!dryRun) {
      setJobId(null);
    }
    setRequestLoading(dryRun ? 'preview' : 'import');

    try {
      const response = await upload(file, {
        dryRun,
        async: allowAsync && preferAsync && !dryRun,
      });
      setResult(response);
      if (response?.async && response?.job?.id) {
        setJobId(String(response.job.id));
      } else if (!dryRun) {
        await onCompleted?.();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo procesar el archivo.',
      );
    } finally {
      setRequestLoading(null);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files?.[0];
    if (!nextFile) return;
    setFile(nextFile);
    setResult(null);
    setError(null);
    setJobId(null);
  }

  return (
    <section className={`app-panel p-4 space-y-4 ${className}`.trim()}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="text-xs text-slate-400">{description}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-9 px-3 text-xs"
          onClick={() => downloadTemplate(templateHeaders, templateName)}
        >
          Descargar plantilla
        </Button>
      </div>

      {error && <Alert kind="error" message={error} />}
      {currentResult && (
        <Alert
          kind={metrics.errors ? 'warning' : 'info'}
          message={
            jobId && jobQuery.data
              ? `Estado: ${jobQuery.data.status || 'procesando'} · Procesadas ${Number(jobQuery.data.processed_rows || 0)} de ${Number(jobQuery.data.total_rows || metrics.total || 0)} · Creadas ${Number(jobQuery.data.created_rows || metrics.created || 0)} · Omitidas ${Number(jobQuery.data.skipped_rows || metrics.skipped || 0)}`
              : `Filas ${metrics.total} · Creadas ${metrics.created} · Omitidas ${metrics.skipped} · Errores ${metrics.errors}`
          }
        />
      )}

      <label
        className={[
          'flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition',
          dragging
            ? 'border-indigo-400/60 bg-indigo-500/10'
            : 'border-white/15 bg-white/5 hover:bg-white/8',
        ].join(' ')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setResult(null);
            setError(null);
            setJobId(null);
          }}
        />
        <div className="text-sm font-medium text-slate-100">
          {file ? file.name : 'Arrastrá un Excel o CSV acá'}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          También podés hacer click para seleccionar un archivo.
        </div>
      </label>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-xs text-slate-400">
          {previewLoading
            ? 'Leyendo archivo...'
            : preview.rows.length
            ? `Vista previa local lista con ${preview.rows.length} filas.`
            : 'La vista previa local se genera al seleccionar el archivo.'}
        </div>
        {allowAsync && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={preferAsync}
              onChange={(event) => setPreferAsync(event.target.checked)}
            />
            Procesar en segundo plano si el archivo es grande
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          loading={requestLoading === 'preview'}
          onClick={() => void execute(true)}
        >
          {requestLoading === 'preview' ? 'Validando...' : 'Validar archivo'}
        </Button>
        <Button
          type="button"
          loading={requestLoading === 'import'}
          onClick={() => void execute(false)}
        >
          {requestLoading === 'import' ? 'Importando...' : 'Importar'}
        </Button>
      </div>

      {(serverPreview.length > 0 || preview.rows.length > 0) && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {serverPreview.length ? 'Vista previa validada' : 'Vista previa local'}
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-xs">
              <thead className="bg-white/5 text-left text-slate-400">
                <tr>
                  {(serverPreview.length
                    ? Object.keys(serverPreview[0] || {})
                    : preview.headers
                  ).map((header, index) => (
                    <th key={`${header}-${index}`} className="px-3 py-2 font-medium">
                      {formatCell(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {(serverPreview.length ? serverPreview : preview.rows).slice(0, 5).map((row, index) => (
                  <tr key={`preview-row-${index}`} className="border-t border-white/10">
                    {Object.keys(serverPreview.length ? row || {} : preview.rows[index] || {}).map((key) => (
                      <td key={`${key}-${index}`} className="px-3 py-2">
                        {formatCell((row as Record<string, unknown>)[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {serverErrors.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-rose-300">
            Errores detectados
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-100">
            <ul className="space-y-1">
              {serverErrors.slice(0, 20).map((entry: any, index: number) => (
                <li key={`error-${index}`}>
                  Fila {entry?.row ?? '-'} · {entry?.field || 'archivo'} · {entry?.message || 'Error'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
