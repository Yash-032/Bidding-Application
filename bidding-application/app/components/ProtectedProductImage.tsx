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

function renderPlaceholder(placeholder: HTMLElement, state: 'loading' | 'error', hasImage: boolean) {
  if (!hasImage || state === 'error') {
    placeholder.innerHTML = `
      <div class="tile-loader error">
        <div class="error-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/>
            <path d="M9 9l6 6M15 9l-6 6"/>
          </svg>
        </div>
        <div class="loader-text">
          <span class="loader-title">Image unavailable</span>
        </div>
      </div>
    `;
    return;
  }

  placeholder.innerHTML = `
    <div class="tile-loader">
      <div class="loader-spinner">
        <div class="spinner-track"></div>
        <div class="spinner-ring"></div>
      </div>
      <div class="loader-text">
        <span class="loader-title">Loading image</span>
      </div>
    </div>
  `;
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
      :host { display:block; position:relative; overflow:hidden; background:#e4dfd6; user-select:none; -webkit-user-select:none; }
      .frame { position:absolute; inset:0; overflow:hidden; }
      .placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #575a55;
        background: linear-gradient(135deg, #ded9cf 0%, #eae6dd 40%, #e0dbc5 70%, #d8d3c7 100%);
        background-size: 240% 240%;
        animation: meshPulse 3.5s ease infinite;
        z-index: 2;
        transition: opacity 0.35s ease;
      }
      .tile-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 16px;
        text-align: center;
      }
      .loader-spinner {
        position: relative;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .spinner-track {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 1.5px solid rgba(28, 46, 37, 0.12);
      }
      .spinner-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 1.5px solid transparent;
        border-top-color: #1c2e25;
        border-right-color: rgba(28, 46, 37, 0.4);
        animation: spinRing 0.85s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
      }
      .loader-text {
        display: flex;
        align-items: center;
      }
      .loader-title {
        font: 600 10px/1.2 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #1c2e25;
      }
      .tile-loader.error .error-icon {
        color: #777269;
        opacity: 0.75;
      }
      .tile-loader.error .loader-title {
        color: #777269;
        letter-spacing: 0.12em;
      }
      canvas { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:none; }
      :host(.protected-contain) canvas { object-fit:contain; }
      .ready canvas { display:block; }
      .ready .placeholder { display:none; }

      @keyframes spinRing {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes meshPulse {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @media (prefers-reduced-motion:reduce) {
        .spinner-ring, .placeholder { animation:none; }
      }
    `;
    const frame = document.createElement('div');
    frame.className = 'frame';
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    renderPlaceholder(placeholder, 'loading', Boolean(image));
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
      renderPlaceholder(placeholder, 'loading', Boolean(current));
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
          placeholder.innerHTML = '';
          return;
        } catch (error) {
          if (signal.aborted) return;
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          frame.classList.remove('ready');
          if (attempt < 2) await delay(250 * (2 ** attempt), signal);
          else {
            renderPlaceholder(placeholder, 'error', false);
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
