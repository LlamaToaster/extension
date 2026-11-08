# shared/ — copied from the app, do not edit here

These files are copies of [LlamaToaster/LlamaToaster `shared/`](https://github.com/LlamaToaster/LlamaToaster/tree/main/shared): the header parser and fit logic the web UI uses, so the extension marks a quant exactly as the Models page does.

Change them in the app repo. The **Sync shared** workflow checks the app's `main` every day (or on demand from the Actions tab) and opens a pull request here when they differ; locally:

```bash
npm run sync-shared -- ../LlamaToaster
```
