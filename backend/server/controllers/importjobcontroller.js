const importJobs = require('../services/importJobService');

async function getJob(req, res) {
  const job = importJobs.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Import job no encontrado' });
  }
  return res.json(job);
}

async function streamJob(req, res) {
  const job = importJobs.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Import job no encontrado' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribe = importJobs.subscribe(req.params.id, send);
  const ping = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 15_000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  });
}

module.exports = {
  getJob,
  streamJob,
};
