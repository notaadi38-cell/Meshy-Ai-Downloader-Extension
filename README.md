# Model Resource Exporter

An independent Manifest V3 Chromium extension inspired by the public workflow of [meshy-ai-to-stl](https://github.com/ChesterTheCatt/meshy-ai-to-stl). It detects `.meshy` resource URLs exposed to a Meshy page, lets you explicitly download the original resource, and converts a locally selected GLB file to OBJ or binary STL. It does not use Meshy branding or private APIs.

## License and decoder status

The referenced repository's visible root file list and README do not identify a license, and no `LICENSE` file was found at the inspected `main` branch URL. A public GitHub repository is not automatically licensed for copying, so this project uses an independent implementation and does not copy its source.

The reference project says it obtains `mesh_loader.js` and `mesh_loader.wasm` from a Meshy resource URL. Those are Meshy's decoder assets; the inspected sources do not provide a redistribution license for them, and this project does not bundle or fetch them. A `.meshy` file is therefore saved in its original encrypted form. Converting that format to GLB/OBJ/STL needs a decoder that Meshy explicitly permits this extension to use. No claim is made that the captured file itself is a GLB.

## Install

1. Download or extract this folder somewhere on your computer.
2. In Chrome or another Chromium browser, open `chrome://extensions` (or the browser's equivalent).
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `meshy-resource-exporter` folder containing `manifest.json`.

No build step or external package is required.

## Use

### Capture a Meshy resource

1. Open a Meshy model page at `meshy.ai` and reload it after installing the extension.
2. Open the extension popup and choose **Refresh**.
3. If a `.meshy` resource was exposed to the page, choose **Download** beside it and use the browser's save dialog.

The extension only observes resource URLs visible to the page. Detection is best effort: resources fetched before installation require a reload, and cross-origin performance restrictions, service workers, browser settings, or Meshy's page changes can hide them. URLs are held in the page content script's memory and are not uploaded or saved by this extension. The query string may contain a temporary signed link; it is used only when you choose Download. Downloads may fail if the link has expired or requires authentication unavailable to the browser download.

### Convert a local GLB

1. In the popup, choose **GLB file** and select a local `.glb` file.
2. Choose **OBJ**, **Binary STL**, or **GLB copy**, then choose **Export**.

The conversion runs locally. OBJ and STL export supports triangle-list primitives with standard `POSITION` attributes and optional scalar indices. It does not currently implement compressed geometry, sparse accessors, non-triangle primitive modes, skins, morph targets, node hierarchy transforms, materials, textures, or `.gltf` files with external buffers. GLB copy preserves the selected file unchanged. STL does not preserve color or material data.

## Permissions

The extension requests only:

- `activeTab`: communicate with the current tab after the user opens the popup.
- `downloads`: start the user-requested save of a selected `.meshy` URL.

Its content script runs only on `https://meshy.ai/*` and `https://www.meshy.ai/*`. It does not request broad host access, inspect page bodies, run page scripts, use cookies, or call private Meshy endpoints.

## Troubleshooting

- **No resources found:** reload the model page, wait for it to finish loading, then refresh the popup. The extension only sees resources exposed in browser performance entries or URL-bearing page elements.
- **The popup cannot reach the page:** verify the address is a supported Meshy host and reload the tab after installing or reloading the extension.
- **Download fails:** the URL may have expired or require a browser session. Reload the Meshy page to capture a fresh resource and try again.
- **Conversion fails:** use a standard, uncompressed GLB 2.0 triangle mesh. The extension reports unsupported structures rather than silently exporting malformed geometry.
- **A `.meshy` download will not open as a model:** this extension has no licensed Meshy decoder. Use Meshy's supported export options, or provide a decoder under terms that explicitly allow local extension use and redistribution before adding such support.

## Compatibility

Designed for Chromium browsers with Manifest V3. This is an independent community utility and is not affiliated with, endorsed by, or supported by Meshy.
