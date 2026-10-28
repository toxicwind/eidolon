import type { Context } from "hono";
import type { Bindings } from "../types";
import { BaseProvider, type ModelConfig } from "./base";
import { runWithTokenRetry } from "../api/token-manager";
import { fetchWithTimeout } from "../utils/fetch-with-timeout";

/**
 * NVIDIA NIM Provider — the smith's own hammer.
 *
 * Image generation through NVIDIA's hosted image models (stabilityai SDXL /
 * black-forest-labs Flux on integrate.api.nvidia.com). In the estate this lane
 * rides **rhodochrosite :25193** (the gem-keeper's router) when the vein is up,
 * so Geode forges her own sprite through her own router — the Harvest Moon
 * recursion. Falls back to direct NIM. Tokens: NVIDIA_TOKENS env (multi-key).
 */

const NIM_DIRECT_BASE = "https://integrate.api.nvidia.com/v1";
const ESTATE_VEIN_BASE = process.env.EIDOLON_NVIDIA_BASE ?? "http://127.0.0.1:25193/v1";

export class NvidiaProvider extends BaseProvider {
  readonly name = "nvidia";
  readonly supportedActions = ["generate"];

  getApiModelId(model: string): string {
    const configs = this.getModelConfigs();
    return configs[model]?.apiId ?? model;
  }

  getModelConfigs(): Record<string, { apiId: string; config: ModelConfig }> {
    return {
      "nemotron-sdxl": {
        apiId: "stabilityai/stable-diffusion-xl",
        config: {
          id: "nvidia/nemotron-sdxl",
          name: "Nemotron SDXL (NIM)",
          type: ["text2image"],
          steps: { range: [20, 100], default: 50 },
          guidance: { range: [0, 10], default: 5 },
          responseType: "base64",
        },
      },
      "nemotron-flux": {
        apiId: "black-forest-labs/flux.1-dev",
        config: {
          id: "nvidia/nemotron-flux",
          name: "Nemotron Flux.1-dev (NIM)",
          type: ["text2image"],
          steps: { range: [20, 80], default: 50 },
          guidance: { range: [0, 10], default: 3.5 },
          responseType: "base64",
        },
      },
    };
  }

  async handleRequest(c: Context, action: string, params: Record<string, unknown>): Promise<unknown> {
    if (action !== "generate") {
      return c.json({ error: `nvidia provider: unsupported action '${action}'` }, 400);
    }
    const model = String(params.model ?? "nemotron-flux");
    const apiId = this.getApiModelId(model);
    const prompt = String(params.prompt ?? "");
    if (!prompt) return c.json({ error: "prompt required" }, 400);

    const body = {
      prompt,
      cfg_scale: Number(params.guidance ?? 3.5),
      steps: Number(params.steps ?? 50),
      seed: params.seed !== undefined ? Number(params.seed) : Math.floor(Math.random() * 2147483647),
      width: Number(params.width ?? 512),
      height: Number(params.height ?? 512),
    };

    const env = c.env as Bindings;
    // Vein-first: rhodochrosite, then direct NIM — fracture-tolerant.
    for (const base of [ESTATE_VEIN_BASE, NIM_DIRECT_BASE]) {
      try {
        const res = await runWithTokenRetry<Response>(this.name, env, async token => {
          const r = await fetchWithTimeout(`${base}/${apiId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
            timeout: 60_000,
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        });
        const data = (await res.json()) as { artifacts?: Array<{ base64?: string; seed?: number }> };
        const artifact = data.artifacts?.[0];
        if (!artifact?.base64) throw new Error("no artifact in NIM response");
        return c.json({
          provider: this.name,
          model,
          imageBase64: artifact.base64,
          seed: artifact.seed ?? body.seed,
          vein: base === ESTATE_VEIN_BASE ? "rhodochrosite" : "nim-direct",
        });
      } catch (err) {
        console.error(`[nvidia-provider] vein ${base} fractured: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return c.json({ error: "all NVIDIA veins fractured (estate + direct)" }, 502);
  }
}
