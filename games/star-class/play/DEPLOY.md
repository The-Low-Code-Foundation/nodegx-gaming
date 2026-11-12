# Deploying Star Class

This folder is a deploy of **Star Class** from NodeGX (Deploy → Self Hosting, client-side rendering).

NodeGX writes this file and everything beside it on every deploy, so changes made here are
overwritten. To change the app, change the project in NodeGX and deploy again.

## What this is

A static website: `index.html`, the app's JavaScript, its pages in `noodl_bundles/`, and
`nodegx-config.json`, which says which backend it talks to. There is nothing to install or
build.

> **Base URL: `/star-class/`.** The pages load their files from that address, so the app expects to
> be hosted there. Served from anywhere else, including on this computer, it will look for its
> files at `/star-class/`. Clear the Base URL in Project Settings → Deploy to run it locally.

## Run it on this computer

You need [Node.js](https://nodejs.org). In this folder, run:

```sh
node serve.js              # first free port from 3000 up
node serve.js --port 8080  # or choose one
```

`npm start` (and `npm start -- --port 8080`) does the same. There is nothing to
`npm install`, though running it does no harm.

Then open the address it prints.

With no port given, it takes the first free port from 3000 up. With `--port` (or `PORT`)
it takes exactly that port, and if that port is taken it stops and says so rather than picking
another, because a host that sets `PORT` sends its traffic to exactly that port.

Opening `index.html` straight from your file browser does not work: the app loads its pages over
HTTP.

## Put it online

Upload the whole folder to any static host: Netlify, Cloudflare Pages, GitHub Pages, or your own
nginx or Apache server.

The app uses real page addresses (`/about`, not `/#/about`). Set the host to answer
`index.html` for paths that are not files, or reloading any page but the first one returns "not
found". On Netlify that is a `_redirects` file holding `/* /index.html 200`. Most hosts call it
"single-page app" or "SPA fallback".

`serve.js`, `package.json` and this file are only for you. A host serves them as plain files,
which does no harm, and you can leave them out. Keep `nodegx-config.json`.

## Backend

No backend address is built into this deploy. That is fine if the app does not use records, users
or cloud functions. If it does, set the backend in NodeGX (Backend Services) and deploy again, or
point it at one as below.

### Pointing it at another backend

No rebuild is needed. Either:

- start it with the backend you want:

  ```sh
  node serve.js --backend-port 8577                 # a backend on this computer, at port 8577
  node serve.js --backend https://data.example.com  # a backend anywhere
  ```

  (`NODEGX_CLOUDSERVICES_ENDPOINT` does the same for hosts that set environment variables)
- or edit `nodegx-config.json` in this folder and reload the page. That works on any static host too, not only with `serve.js`.

`nodegx-config.json` may set `cloudservices` (this backend) and `backendServices`, nothing else.
If the file is missing or unreadable, the app uses the address it was deployed with.
