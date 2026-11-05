// Writes assets/shimmer-sweep.png: the alpha mask app.css uses for the label shimmer.
// A 128x2 APNG whose bright band crosses the label once every 1.4s, the same band
// BeautifulUI draws with a 200%-wide `ink-3 35% / ink 50% / ink-3 65%` gradient.
// Chromium advances animated images on the compositor, so the sweep costs the main
// thread no style, paint or commit per frame. Prints the data URI to paste into app.css.
// Run: node scripts/generate-shimmer-mask.mjs
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const outputPath = join(dirname(dirname(fileURLToPath(import.meta.url))), "assets", "shimmer-sweep.png");

const WIDTH = 128;
const HEIGHT = 2;
const FPS = 30;
const LOOP_SECONDS = 1.4;
const FRAME_COUNT = Math.round(FPS * LOOP_SECONDS);
// Alpha outside the band: dims the label from --bui-ink toward --bui-ink-3.
const EDGE_ALPHA = 0.4;
// Half-width of the band in label widths (15% of a 200%-wide gradient).
const BAND_HALF_WIDTH = 0.3;
const BYTES_PER_PIXEL = 4;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sweepAlpha(x, frame) {
  // The band centre travels from -0.5 to 1.5 label widths; the gradient repeats every 2.
  const centre = -0.5 + (2 * frame) / FRAME_COUNT;
  const position = (x + 0.5) / WIDTH;
  const distance = ((((position - centre + 1) % 2) + 2) % 2) - 1;
  const band = Math.max(0, 1 - Math.abs(distance) / BAND_HALF_WIDTH);
  return Math.round((EDGE_ALPHA + (1 - EDGE_ALPHA) * band) * 255);
}

const FILTER_SUB = 1;
const FILTER_UP = 2;

function framePixels(frame) {
  const pixels = Buffer.alloc(WIDTH * BYTES_PER_PIXEL, 255);
  for (let x = 0; x < WIDTH; x += 1) pixels[x * BYTES_PER_PIXEL + 3] = sweepAlpha(x, frame);
  // First row Sub-filtered against its left neighbour; later rows repeat it (Up filter, all zero).
  const firstRow = Buffer.alloc(1 + pixels.length);
  firstRow[0] = FILTER_SUB;
  for (let index = 0; index < pixels.length; index += 1) {
    const left = index < BYTES_PER_PIXEL ? 0 : pixels[index - BYTES_PER_PIXEL];
    firstRow[1 + index] = (pixels[index] - left) & 255;
  }
  const repeatedRow = Buffer.alloc(1 + pixels.length);
  repeatedRow[0] = FILTER_UP;
  const rows = [firstRow, ...Array.from({ length: HEIGHT - 1 }, () => repeatedRow)];
  return deflateSync(Buffer.concat(rows), { level: 9 });
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function header() {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(WIDTH, 0);
  data.writeUInt32BE(HEIGHT, 4);
  data[8] = 8; // bit depth
  data[9] = 6; // RGBA
  return chunk("IHDR", data);
}

function animationControl() {
  const data = Buffer.alloc(8);
  data.writeUInt32BE(FRAME_COUNT, 0);
  data.writeUInt32BE(0, 4); // loop forever
  return chunk("acTL", data);
}

function frameControl(sequence) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(WIDTH, 4);
  data.writeUInt32BE(HEIGHT, 8);
  data.writeUInt16BE(1, 20); // delay numerator
  data.writeUInt16BE(FPS, 22); // delay denominator
  return chunk("fcTL", data);
}

function frameData(sequence, pixels) {
  const data = Buffer.alloc(4 + pixels.length);
  data.writeUInt32BE(sequence, 0);
  pixels.copy(data, 4);
  return chunk("fdAT", data);
}

const chunks = [PNG_SIGNATURE, header(), animationControl()];
let sequence = 0;
for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
  chunks.push(frameControl(sequence++));
  if (frame === 0) chunks.push(chunk("IDAT", framePixels(frame)));
  else chunks.push(frameData(sequence++, framePixels(frame)));
}
chunks.push(chunk("IEND", Buffer.alloc(0)));

const png = Buffer.concat(chunks);
await writeFile(outputPath, png);
console.error(`wrote ${outputPath} (${png.length} bytes, ${FRAME_COUNT} frames)`);
console.log(`data:image/png;base64,${png.toString("base64")}`);
