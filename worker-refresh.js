let timer = null;
self.onmessage = (e) => {
  if (e.data?.type === 'start') {
    if (timer) clearInterval(timer);
    const ms = e.data.intervalMs || 30 * 60 * 1000;
    timer = setInterval(() => self.postMessage({ type: 'tick' }), ms);
  } else if (e.data?.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
  }
};
