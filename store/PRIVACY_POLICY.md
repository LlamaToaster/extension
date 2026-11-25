# LlamaToaster browser extension: Privacy Policy

Last updated: 25 November 2026

LlamaToaster ("the extension") tells you whether a GGUF model on a Hugging Face model page fits your computer's memory. It runs entirely in your browser. **The extension has no server of its own: it does not send any data to the developer or to any analytics, advertising or tracking service.**

## What the extension reads, and why

| Data | Where it comes from | Why | Where it goes |
|---|---|---|---|
| The model page you are on (repository name, list of files and their sizes) | `huggingface.co` | To match each quant chip to its `.gguf` file | Stays in your browser |
| The GGUF file header (metadata and tensor list, about 6 MB per file, read with HTTP range requests; never the model weights) | `huggingface.co` and its file hosts (`*.hf.co`) | To compute the memory a quant needs | Stays in your browser; cached locally |
| RAM size and free RAM, CPU model and thread count | Chrome's `system.memory` and `system.cpu` APIs | To compare against the model's size | Stays in your browser |
| GPU name | The browser's WebGL/WebGPU interface | To look up the GPU's VRAM size | Stays in your browser |
| VRAM size and usage, installed RAM type and speed, and the names of apps using GPU memory | **Optional.** The LlamaToaster worker's local "native messaging" helper, only if you installed the worker on this computer | To measure free VRAM instead of estimating it | Shown in the popup only; never stored beyond the RAM type and speed, never transmitted |
| Your settings (mode, context size, amounts of memory to keep free) | You | To remember your choices | Stored locally in `chrome.storage` |
| Your Hugging Face account name, while you are signed in to Hugging Face in this browser | `huggingface.co`, when you open a Hugging Face page | To read the GPU you picked in your Hugging Face hardware settings, when no worker or browser setting gives the memory | Not stored. Sent only to `huggingface.co`: first to ask who is signed in, then in the address of your public profile's overview page |
| The VRAM size of each GPU, from the worker, the browser, your Hugging Face profile, or a size you typed | The source named | So the size is still known next time, when that source isn't there | Stored locally in `chrome.storage`, per GPU name |

Requests to `huggingface.co` for model files are sent with your browser's existing Hugging Face cookies, exactly as if you had opened the page yourself. This lets the extension read the files of gated or private repositories you already have access to. The extension does not read, store or forward those cookies. The request that asks Hugging Face who is signed in goes with them, the same way the site asks; the request for your public profile that follows carries none.

## What the extension does not do

- It does not collect, store or transmit personal information, browsing history, page contents beyond the model files described above, or any account details. The one exception is your Hugging Face account name, read from `huggingface.co` while you are signed in: it is used only to read your own hardware list, and is not stored.
- It does not use analytics, telemetry, crash reporting, advertising or fingerprinting.
- It does not sell or share data with third parties, and does not use data for anything unrelated to the fit check.
- It does not run remotely hosted code.
- It only runs on `https://huggingface.co/*`.

## Storage and deletion

Settings and cached header facts are kept in `chrome.storage.local` on your device. Removing the extension deletes them. The popup's own controls reset your choices at any time.

## Links

The popup links to `llamatoaster.com` and to the project's GitHub page. These are ordinary links that open in a new tab when you click them; the extension sends nothing to them.

## Contact and source code

The extension is open source (MIT): <https://github.com/LlamaToaster/extension>. For questions about this policy, open an issue there.

## Changes

If this policy changes, the new version is published at the same address with a new date, and the extension's store listing is updated before any change that affects data handling ships.
