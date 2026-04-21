const crypto = require('crypto');
const EventEmitter = require('events');

const jobs = new Map();
const emitter = new EventEmitter();
emitter.setMaxListeners(200);

function cloneJob(job) {
  if (!job) return null;
  return {
    ...job,
    errors: Array.isArray(job.errors) ? [...job.errors] : [],
    preview: Array.isArray(job.preview) ? [...job.preview] : [],
  };
}

function createJob({ type, fileName, totalRows = 0 }) {
  const id = crypto.randomUUID();
  const job = {
    id,
    type,
    file_name: fileName || null,
    total_rows: Number(totalRows) || 0,
    processed_rows: 0,
    created_rows: 0,
    skipped_rows: 0,
    status: 'queued',
    progress_pct: 0,
    preview: [],
    errors: [],
    started_at: null,
    finished_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message: null,
  };
  jobs.set(id, job);
  emitter.emit(id, cloneJob(job));
  return cloneJob(job);
}

function getJob(jobId) {
  return cloneJob(jobs.get(jobId));
}

function touchJob(job, patch = {}) {
  if (!job) return null;
  Object.assign(job, patch, { updated_at: new Date().toISOString() });
  if (job.total_rows > 0) {
    const ratio = Math.min(1, Math.max(0, Number(job.processed_rows || 0) / Number(job.total_rows || 1)));
    job.progress_pct = Math.round(ratio * 100);
  } else {
    job.progress_pct = job.status === 'completed' ? 100 : Number(job.progress_pct || 0);
  }
  emitter.emit(job.id, cloneJob(job));
  return cloneJob(job);
}

function startJob(jobId, patch = {}) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return touchJob(job, {
    status: 'running',
    started_at: job.started_at || new Date().toISOString(),
    ...patch,
  });
}

function updateJob(jobId, patch = {}) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return touchJob(job, patch);
}

function appendJobError(jobId, error) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.errors = Array.isArray(job.errors) ? job.errors : [];
  job.errors.push(error);
  return touchJob(job);
}

function finishJob(jobId, patch = {}) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return touchJob(job, {
    status: 'completed',
    finished_at: new Date().toISOString(),
    progress_pct: 100,
    ...patch,
  });
}

function failJob(jobId, error) {
  const job = jobs.get(jobId);
  if (!job) return null;
  const errors = Array.isArray(job.errors) ? [...job.errors] : [];
  if (error) errors.push(error);
  return touchJob(job, {
    status: 'failed',
    finished_at: new Date().toISOString(),
    errors,
    message: error?.message || error?.error || 'Import job failed',
  });
}

function subscribe(jobId, onEvent) {
  const listener = (payload) => onEvent(payload);
  emitter.on(jobId, listener);
  const current = getJob(jobId);
  if (current) onEvent(current);
  return () => emitter.off(jobId, listener);
}

module.exports = {
  appendJobError,
  createJob,
  failJob,
  finishJob,
  getJob,
  startJob,
  subscribe,
  updateJob,
};
