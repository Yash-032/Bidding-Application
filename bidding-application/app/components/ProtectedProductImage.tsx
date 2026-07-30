'use client';

import { useEffect, useRef } from 'react';
import { getToken, type ProtectedImageRef } from '@/lib/api';

type ManifestTile = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sha256: string;
  decodeKey: string;
  codec?: 'webp-lossless';
  url: string;
};

type Manifest = {
  imageId: string;
  width: number;
  height: number;
  expiresAt: number;
  tiles: ManifestTile[];
};

type DecodedTile =
  | { tile: ManifestTile; bitmap: ImageBitmap; pixels?: never }
  | { tile: ManifestTile; pixels: Uint8ClampedArray<ArrayBuffer>; bitmap?: never };

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

export default function ProtectedProductImage({
  image,
  alt,
  className = '',
  eager = false,
}: {
  image?: ProtectedImageRef | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // React Strict Mode reconnects effects in development. A closed root cannot
    // be discovered through host.shadowRoot, so retain our private reference and
    // reuse it instead of attempting an illegal second attachShadow call.
    const shadow = shadowRef.current ?? host.attachShadow({ mode: 'closed' });
    shadowRef.current = shadow;
    shadow.replaceChildren();
    const style = document.createElement('style');
    style.textContent = `
      :host { display:block; position:relative; overflow:hidden; background:#ddd7ce; user-select:none; -webkit-user-select:none; }
      .frame { position:absolute; inset:0; overflow:hidden; }
      .placeholder { position:absolute; inset:0; display:grid; place-items:center; color:#777a76; background:linear-gradient(110deg,#ded9cf 25%,#ebe7df 40%,#ded9cf 55%); background-size:240% 100%; animation:pulse 1.5s infinite; font:500 10px/1.2 system-ui; letter-spacing:.12em; text-transform:uppercase; }
      canvas { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:none; }
      :host(.protected-contain) canvas { object-fit:contain; }
      .ready canvas { display:block; }
      .ready .placeholder { display:none; }
      @keyframes pulse { to { background-position-x:-240%; } }
      @media (prefers-reduced-motion:reduce) { .placeholder { animation:none; } }
    `;
    const frame = document.createElement('div');
    frame.className = 'frame';
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = image ? 'Loading image' : 'Image unavailable';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    frame.append(placeholder, canvas);
    shadow.append(style, frame);

    let active = true;
    let hasEnteredViewport = eager;
    let renderedWidth = 0;
    let controller: AbortController | null = null;

    const load = async () => {
      const current = image;
      if (!active || !hasEnteredViewport || !current) return;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      frame.classList.remove('ready');
      placeholder.textContent = 'Loading image';
      const requestedWidth = Math.max(160, Math.ceil(host.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 2)));

      for (let attempt = 0; attempt < 3 && !signal.aborted; attempt += 1) {
        try {
          const token = getToken();
          const manifestResponse = await fetch(`/api/protected-images/${encodeURIComponent(current.id)}/manifest?w=${requestedWidth}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal,
          });
          if (!manifestResponse.ok) throw new Error(`Manifest ${manifestResponse.status}`);
          const manifest = await manifestResponse.json() as Manifest;
          if (manifest.imageId !== current.id || manifest.expiresAt * 1000 <= Date.now()) throw new Error('Invalid manifest');

          const decodedTiles = await Promise.all(manifest.tiles.map(async (tile): Promise<DecodedTile> => {
            const response = await fetch(tile.url, { credentials: 'same-origin', cache: 'no-store', signal });
            if (!response.ok || response.headers.get('content-type') !== 'application/octet-stream') {
              throw new Error(`Tile ${response.status}`);
            }
            const encoded = await response.arrayBuffer();
            if (await sha256Hex(encoded) !== tile.sha256) throw new Error('Tile integrity failure');
            const protectedBytes = new Uint8Array(encoded);
            if (protectedBytes.length <= 16) throw new Error('Tile length failure');
            const key = fromBase64Url(tile.decodeKey);
            const decoded = new Uint8Array(protectedBytes.length - 16);
            for (let index = 16; index < protectedBytes.length; index += 1) {
              decoded[index - 16] = protectedBytes[index] ^ key[(index - 16) % key.length];
            }
            if (tile.codec === 'webp-lossless') {
              const bitmap = await createImageBitmap(new Blob([decoded], { type: 'image/webp' }));
              if (bitmap.width !== tile.width || bitmap.height !== tile.height) {
                bitmap.close();
                throw new Error('Tile dimension failure');
              }
              return { tile, bitmap };
            }
            if (decoded.length !== tile.width * tile.height * 4) throw new Error('Tile length failure');
            const pixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(decoded.length);
            pixels.set(decoded);
            return { tile, pixels };
          }));

          // This is the only canvas. It stays hidden until every verified tile is ready.
          canvas.width = manifest.width;
          canvas.height = manifest.height;
          const context = canvas.getContext('2d', { alpha: true });
          if (!context) throw new Error('Canvas unavailable');
          context.clearRect(0, 0, manifest.width, manifest.height);
          for (const decodedTile of decodedTiles) {
            if (decodedTile.bitmap) {
              context.drawImage(decodedTile.bitmap, decodedTile.tile.x, decodedTile.tile.y);
              decodedTile.bitmap.close();
            } else {
              context.putImageData(
                new ImageData(decodedTile.pixels, decodedTile.tile.width, decodedTile.tile.height),
                decodedTile.tile.x,
                decodedTile.tile.y,
              );
            }
          }
          if (!active || signal.aborted) return;
          renderedWidth = manifest.width;
          frame.classList.add('ready');
          placeholder.textContent = '';
          return;
        } catch (error) {
          if (signal.aborted) return;
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          frame.classList.remove('ready');
          if (attempt < 2) await delay(250 * (2 ** attempt), signal);
          else {
            placeholder.textContent = 'Image unavailable';
            console.warn('[protected-image] render failed', error instanceof Error ? error.message : error);
          }
        }
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        hasEnteredViewport = true;
        intersection.disconnect();
        void load();
      }
    }, { rootMargin: '300px' });
    if (eager) void load();
    else intersection.observe(host);

    const resize = new ResizeObserver(() => {
      const needed = Math.ceil(host.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 2));
      if (frame.classList.contains('ready') && needed > renderedWidth * 1.2) void load();
    });
    resize.observe(host);

    const block = (event: Event) => event.preventDefault();
    host.addEventListener('contextmenu', block);
    host.addEventListener('dragstart', block);
    host.addEventListener('selectstart', block);
    return () => {
      active = false;
      controller?.abort();
      intersection.disconnect();
      resize.disconnect();
      host.removeEventListener('contextmenu', block);
      host.removeEventListener('dragstart', block);
      host.removeEventListener('selectstart', block);
      shadow.replaceChildren();
    };
  }, [image, eager]);

  return (
    <div
      ref={hostRef}
      className={`protected-product-image ${className}`}
      role="img"
      aria-label={alt}
      style={{ aspectRatio: image ? `${image.width} / ${image.height}` : undefined }}
    />
  );
}
