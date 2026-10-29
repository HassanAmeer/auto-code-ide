// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
/**
 * Server-Side Acoustic Noise Shield (FFmpeg afftdn & agate)
 * Inspired by Digi-Labs (digiformationltd-creator/digi-labs)
 *
 * Implements:
 * 1. afftdn (Audio Fast Fourier Transform Denoise): Cleans steady ceiling fan whine and AC hum.
 * 2. agate (Audio Gate): Silences room echo and audio bleed during pauses.
 * 3. Highpass filter: Eliminates sub-80Hz low-frequency room rumble.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface FfmpegNoiseShieldOptions {
  highpassHz?: number; // default: 80 Hz
  denoiseNr?: number; // default: 20 dB noise reduction
  noiseFloorNf?: number; // default: -50 dB
  trackNoise?: number; // default: 1 (auto track ambient noise)
  gateThreshold?: number; // default: 0.03
  gateRange?: number; // default: 0.01 (-40 dB attenuation)
  gateAttack?: number; // default: 20 ms
  gateRelease?: number; // default: 250 ms
  outputVolume?: number; // default: 1.2
}

/**
 * Generates the studio-grade FFmpeg filter string for ceiling fan & room echo cancellation.
 */
export function buildFfmpegNoiseShieldFilter(opts?: FfmpegNoiseShieldOptions): string {
  const hp = opts?.highpassHz ?? 80;
  const nr = opts?.denoiseNr ?? 20;
  const nf = opts?.noiseFloorNf ?? -50;
  const tn = opts?.trackNoise ?? 1;
  const threshold = opts?.gateThreshold ?? 0.03;
  const range = opts?.gateRange ?? 0.01;
  const attack = opts?.gateAttack ?? 20;
  const release = opts?.gateRelease ?? 250;
  const vol = opts?.outputVolume ?? 1.2;

  // Filter chain:
  // 1. highpass: eliminates ceiling fan and AC vibration rumble below 80Hz
  // 2. afftdn: FFT denoiser with dynamic noise tracking
  // 3. agate: audio gate to silence room reflections and speaker echo
  // 4. volume: clean normalized speech output
  return `highpass=f=${hp},afftdn=nr=${nr}:nf=${nf}:tn=${tn},agate=threshold=${threshold}:range=${range}:ratio=2:attack=${attack}:release=${release},volume=${vol}`;
}

/**
 * Processes an audio file through FFmpeg afftdn and agate acoustic noise shield filters.
 */
export async function applyFfmpegNoiseShield(
  inputPath: string,
  outputPath: string,
  opts?: FfmpegNoiseShieldOptions,
): Promise<{ ok: boolean; error?: string; command?: string }> {
  try {
    const filter = buildFfmpegNoiseShieldFilter(opts);
    const cmd = `ffmpeg -y -i "${inputPath}" -af "${filter}" "${outputPath}"`;
    await execAsync(cmd, { timeout: 30000 });
    return { ok: true, command: cmd };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}
