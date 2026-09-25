import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const initial = JSON.parse(await readFile(path.join(root, 'artifacts/live-smoke.json'), 'utf8')).results;
const recovery = JSON.parse(await readFile(path.join(root, 'artifacts/recovery-smoke.json'), 'utf8')).jobs;
const videos = [...new Set([...initial, ...recovery].map(item => item.path).filter(Boolean))];
const evidence = [];
for (const file of videos) {
  const probe = spawnSync(process.env.MEDIAFETCH_FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  const info = JSON.parse(probe.stdout);
  assert.ok(info.streams.some(s => s.codec_type === 'video'));
  assert.ok(info.streams.some(s => s.codec_type === 'audio'));
  const decode = spawnSync(process.env.MEDIAFETCH_FFMPEG || 'ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', 'NUL'], { encoding: 'utf8' });
  assert.equal(decode.status, 0, 'Full decode must pass');
  const mean = /mean_volume: ([\d.-]+) dB/.exec(decode.stderr)?.[1];
  assert.ok(mean && Number(mean) > -70, 'Audio must not be silent');
  evidence.push({ file, ...info, fullDecode: true, meanAudioDb: Number(mean) });
}
const server = createServer(async (req, res) => {
  const match = /^\/video\/(\d+)$/.exec(req.url ?? '');
  if (!match) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>MediaFetch playback acceptance</title><video controls></video>'); return; }
  const file = videos[Number(match[1])];
  if (!file) { res.writeHead(404); res.end(); return; }
  const size = (await stat(file)).size;
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end || start >= size) { res.writeHead(416); res.end(); return; }
  res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }), headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (let index = 0; index < videos.length; index++) {
    const playback = await page.evaluate(async index => {
      const video = document.querySelector('video');
      video.src = `/video/${index}`;
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Video metadata failed')); });
      const audioContext = new AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaElementSource(video);
      const analyser = audioContext.createAnalyser();
      source.connect(analyser); analyser.connect(audioContext.destination);
      video.currentTime = 8;
      await video.play();
      const samples = new Float32Array(analyser.fftSize);
      let maximumRms = 0;
      for (let n = 0; n < 20; n++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        analyser.getFloatTimeDomainData(samples);
        maximumRms = Math.max(maximumRms, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
      }
      video.pause();
      const result = { duration: video.duration, currentTime: video.currentTime, width: video.videoWidth, height: video.videoHeight, audioRms: maximumRms, decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames, mediaError: video.error?.code ?? null };
      source.disconnect(); analyser.disconnect(); await audioContext.close();
      video.remove(); document.body.append(document.createElement('video'));
      return result;
    }, index);
    assert.ok(playback.currentTime > 9 && playback.decodedFrames > 0 && playback.audioRms > 0.0001 && !playback.mediaError, 'Chrome must decode video and non-silent audio');
    evidence[index].chromePlayback = playback;
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(root, 'artifacts/media-validation.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
