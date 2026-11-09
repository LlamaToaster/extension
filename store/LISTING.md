# Chrome Web Store submission: LlamaToaster

Ready-to-paste text for the Developer Dashboard ([chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)). Microsoft Edge Add-ons accepts the same package and text.

Package: `npm run package` → `store/build/llamatoaster-<version>.zip`.
Images: `store/media/` (regenerate with `node store/make-media.mjs`).

---

## 1. Store listing

**Name** (from the manifest; keep as is): `LlamaToaster`

**Summary** (taken from the manifest `description`; limit 132 characters, this one is 126):

```
Will this local AI model run on your PC? See how many layers fit in VRAM and what context you can afford, before you download.
```

**Category:** Productivity → Tools (a general-audience category; Developer Tools undersells it). If the dashboard lists categories differently, pick "Tools".  **Language:** English

**Detailed description:**

```
Will this local AI model actually run on your computer? Find out on the model page, before you download a single gigabyte.

THE PROBLEM
Running AI locally means picking from an enormous catalogue: hundreds of thousands of model repositories for llama.cpp, the most popular engine for local inference, and almost 4 million GGUF files on Hugging Face. There are plenty of benchmarks that tell you how good a model is. Nobody can tell you for sure whether it will work on YOUR system.

And one model is rarely one file. It comes in anywhere from a few to about twenty quantizations. If you already know which model you want, choosing the exact quant is a puzzle of its own, and what you really want is the most bits that still run well on your hardware.

Everyone knows the rule: put as many layers as possible into video memory. But:
• What if the VRAM can't hold all the layers?
• How many layers fit in YOUR VRAM, and how many have to go to slow system RAM? What about the experts in mixture-of-experts models?
• The longer the context, the more memory it needs. How much context can you afford?

The usual way to find out is to download several models, load them in your favourite local-AI app, tweak settings blindly on a chatbot's advice, and wait for either an out-of-memory crash or, worse, a silent slowdown when part of the model quietly spills from VRAM into RAM, which nobody warns you about.

WHAT LLAMATOASTER DOES
You don't download the model and you don't run it. LlamaToaster reads just a few megabytes of each quant, instead of tens or even hundreds of gigabytes.

Open a model page on Hugging Face and click the toaster. Every quantization gets a mark that tells you, before downloading:
• Whether it fits at all
• How many layers go on your GPU and how much goes to RAM, including the experts of MoE models
• Whether it still fits at the context length you choose: move the slider and every mark updates at once

The marks, from best to worst:
• All layers on the GPU, at the model's maximum context
• All layers on the GPU, at your context
• All layers on the GPU, with the MoE experts in RAM
• Partial offload: half or more of the layers on the GPU
• Partial offload: under half of the layers on the GPU
• Not enough memory

Hover a mark for the figures: VRAM and RAM needed, layers on the GPU, KV cache, file size.

HOW IT WORKS
LlamaToaster reads only the model's own header (a few megabytes per quant, with small HTTP range requests; never the model itself) and places it on your GPU and RAM the way llama.cpp's own fit logic does, including the KV cache for your chosen context and MoE layouts. It covers the architectures llama.cpp supports and works with Windows, macOS and Linux machines.

HOW ACCURATE IS IT
Memory estimates are typically within about 10% of what llama.cpp actually uses; a few models are further off. For a precise answer and real speed measurements on your own hardware, use LlamaToaster itself (llamatoaster.com).

THIS MACHINE
The popup shows your CPU, RAM (with type and speed when known) and GPU. Choose how much memory to keep free, or use what your apps hold right now. Override the VRAM size or the memory type (dedicated, unified, CPU only) if the detection is wrong.

MEMORY SPEED
Push the lever to measure RAM and GPU memory bandwidth. Memory bandwidth, more than compute, decides how fast a local model generates text.

MEASURED VRAM (OPTIONAL)
Browsers cannot report free VRAM. If you install a LlamaToaster worker on the same computer, the extension reads the real figure through a local helper (AMD, Intel, NVIDIA and Apple silicon). Without it, VRAM comes from a table of known cards and your own "used by other apps" setting, and the popup says so.

MANUAL OR AUTO
Manual: nothing is read until you click the toaster. Auto: every model page is checked as it opens. You can dock the popup as a side panel.

PRIVATE BY DESIGN
No account, no analytics, no tracking, no servers of ours. Everything runs in your browser and your settings stay on your device. The extension only runs on huggingface.co.

Open source (MIT): github.com/LlamaToaster/extension
```

**Official URL / Homepage URL:** `https://llamatoaster.com` (or the GitHub repository if you prefer)
**Support URL:** `https://github.com/LlamaToaster/extension/issues`
**Privacy policy URL:** needs a public address. Simplest: push `store/PRIVACY_POLICY.md` to GitHub and use
`https://github.com/LlamaToaster/extension/blob/main/store/PRIVACY_POLICY.md`
(or publish the same text on llamatoaster.com).

## 2. Images (Store listing tab)

| Slot | File | Size |
|---|---|---|
| Store icon | `media/icon-128.png` | 128×128 |
| Screenshots (1–5) | `media/screenshot-1-hf-page.png` … `screenshot-5-privacy.png` | 1280×800 |
| Small promo tile (required) | `media/promo-small-440x280.png` | 440×280 |
| Marquee promo tile (optional) | `media/promo-marquee-1400x560.png` | 1400×560 |

Screenshot order and what each shows: 1 the marks on a Hugging Face page; 2 the quant chips close up with the legend; 3 the popup's "This machine" panel (real values from an RX 6600 XT / Ryzen 5 5600X machine, VRAM measured through the worker); 4 the memory-speed benchmark; 5 privacy. Screenshots 1–4 are real captures; the captions are added around them. The Hugging Face page in screenshot 1 is `unsloth/gemma-3-12b-it-GGUF`.

## 3. Privacy practices tab

**Single purpose:**

```
Show, on Hugging Face GGUF model pages, whether each quantized model fits the memory (RAM and VRAM) of the user's computer.
```

**Permission justifications:**

| Permission | Justification to paste |
|---|---|
| `storage` | Saves the user's settings (mode, context size, memory to keep free) and caches the model file facts read from GGUF headers so a page opened again shows its marks immediately. |
| `system.memory` | Reads the computer's total and available RAM, which is compared with the memory a model needs. |
| `system.cpu` | Reads the CPU model name and thread count, shown in the popup and used to label the memory-speed benchmark. |
| `nativeMessaging` | Optional. Lets the extension talk to the local LlamaToaster worker's helper (`com.llamatoaster.vram`), which reads the GPU's real VRAM total and usage and the installed RAM's type and speed. Browsers do not expose VRAM to extensions. The helper only answers this extension's ID, is read-only, and the extension works without it. |
| `sidePanel` | Lets the user dock the popup as Chrome's side panel (the "Side panel" button). |
| Host permissions `https://huggingface.co/*`, `https://*.huggingface.co/*`, `https://*.hf.co/*` | Reads a model repository's file list and the first part of each `.gguf` file (the header) with HTTP range requests. File downloads are redirected to Hugging Face's own file hosts (`*.hf.co`). |
| Content script on `https://huggingface.co/*` | Replaces the "Hardware compatibility" heading with the toaster and adds the fit mark to each quant chip. |
| `'wasm-unsafe-eval'` (CSP) | The memory-speed benchmark runs a small WebAssembly SIMD kernel bundled in the extension. No remote code is loaded. |

**Remote code:** No, I am not using remote code. (All code is in the package; `fetch` only retrieves data from Hugging Face.)

**Data usage:**
- Tick **Website content** only (the model file list and GGUF headers of the Hugging Face page; processed on the device, never sent anywhere). Leave every other category unticked: no personally identifiable information, health, financial, authentication, personal communications, location, web history or user activity is collected.
- Tick all three certifications: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

## 4. Notes for the reviewer (Test instructions field)

```
No login is needed. Install, open https://huggingface.co/unsloth/gemma-3-12b-it-GGUF and click the toaster icon next to "Will it fit?" in the GGUF section (it takes up to about a minute because each of the ~26 files' headers is read). Each quant chip then gets a bread-slice mark; hover or use the toolbar popup to change the context size. Mark "Auto" in the popup to check pages as they open.

The "nativeMessaging" permission is optional: it is used only to reach a local helper that is installed together with the separate LlamaToaster worker program. Without it everything still works and the popup shows VRAM as estimated. The source code is at https://github.com/LlamaToaster/extension.
```

## 5. Extension ID: do this on the first upload

The unpacked build has a fixed ID (`odghfahbjacleniojhemnojbiabfebon`, from the `key` in `manifest.json`) and the native-messaging helper only accepts that ID (`worker/chrome-host/register.ps1` and `register.sh` in the app repo). The store package has **no `key`**, so the store assigns its own ID, and the helper would reject the store build until it knows it.

1. Upload the zip (do not publish yet).
2. Dashboard → **Package** → **View public key**. Copy the text between the BEGIN/END lines into one line.
3. Put it in `manifest.json` as `"key"` (replacing the current one). From then on the unpacked build and the store build share the store's ID.
4. Replace `odghfahbjacleniojhemnojbiabfebon` with the store's Item ID in the app repo's `worker/chrome-host/register.ps1` and `register.sh` (keep the old one in the list too if you still load unpacked builds), then ship that worker update.
5. Submit for review.

## 6. Before you submit

- [x] Summary (manifest `description`) is 126 characters, under the 132 limit.
- [ ] Bump `version` for every later upload (the store rejects a repeat).
- [ ] Host the privacy policy at a public URL and paste it.
- [ ] Register the developer account ($5 one-time, 2-Step Verification on).
- [ ] Expect a manual review for `nativeMessaging` (days to about two weeks).
- [ ] Optional: submit the same zip to Microsoft Edge Add-ons (free) at partner.microsoft.com/dashboard/microsoftedge.
