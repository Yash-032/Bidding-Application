'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { ProtectedImageRef } from '@/lib/api';

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

const processedCanvasCache = new Map<string, HTMLCanvasElement>();
const processingPromises = new Map<string, Promise<HTMLCanvasElement>>();

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function buildProcessedCanvas(
  sourceKey: string,
  requestedWidth: number,
  manifestUrl?: string,
) {
  const cached = processedCanvasCache.get(sourceKey);
  if (cached) return cached;
  const running = processingPromises.get(sourceKey);
  if (running) return running;

  const operation = (async () => {
    let response = await fetch(manifestUrl
      ? `${manifestUrl}?w=${requestedWidth}`
      : `/api/design-lab/remove-bg/${encodeURIComponent(sourceKey)}?w=${requestedWidth}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const backgroundRemoved = response.ok;
    if (!response.ok && !manifestUrl) {
      console.warn('[design-lab-remove-bg] Falling back to the original protected image');
      response = await fetch(`/api/protected-images/${encodeURIComponent(sourceKey)}/manifest?w=${requestedWidth}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
    }
    if (!response.ok) throw new Error(`Protected manifest ${response.status}`);
    const manifest = await response.json() as Manifest;
    if (manifest.expiresAt * 1000 <= Date.now()) {
      throw new Error('Invalid protected manifest');
    }

    const decoded = await Promise.all(manifest.tiles.map(async (tile) => {
      const tileResponse = await fetch(tile.url, { credentials: 'same-origin', cache: 'no-store' });
      if (!tileResponse.ok) throw new Error(`Protected tile ${tileResponse.status}`);
      const encoded = await tileResponse.arrayBuffer();
      if (await sha256Hex(encoded) !== tile.sha256) throw new Error('Protected tile integrity failure');
      const protectedBytes = new Uint8Array(encoded);
      const key = fromBase64Url(tile.decodeKey);
      const bytes = new Uint8Array(protectedBytes.length - 16);
      for (let index = 16; index < protectedBytes.length; index += 1) {
        bytes[index - 16] = protectedBytes[index] ^ key[(index - 16) % key.length];
      }
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
      return { tile, bitmap };
    }));

    const canvas = document.createElement('canvas');
    canvas.width = manifest.width;
    canvas.height = manifest.height;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    decoded.forEach(({ tile, bitmap }) => {
      context.drawImage(bitmap, tile.x, tile.y);
      bitmap.close();
    });
    // A temporary remove.bg/API failure may display the protected original, but
    // it must never poison the cutout cache for the rest of the browser session.
    if (backgroundRemoved) processedCanvasCache.set(sourceKey, canvas);
    return canvas;
  })().finally(() => processingPromises.delete(sourceKey));

  processingPromises.set(sourceKey, operation);
  return operation;
}

export default function DesignLabCanvasImage({
  image,
  alt,
  className = '',
  manifestUrl,
  cacheKey,
  aspectRatio,
  pixelRatioCap = 2,
  style,
}: {
  image?: ProtectedImageRef | null;
  alt: string;
  className?: string;
  manifestUrl?: string;
  cacheKey?: string;
  aspectRatio?: string;
  pixelRatioCap?: number;
  style?: CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = shadowRef.current ?? host.attachShadow({ mode: 'closed' });
    shadowRef.current = shadow;
    shadow.replaceChildren();

    const style = document.createElement('style');
    style.textContent = `
      :host { display:block; position:relative; overflow:hidden; background:transparent; user-select:none; }
      .frame { position:absolute; inset:0; display:grid; place-items:center; }
      canvas { width:100%; height:100%; object-fit:contain; opacity:0; transition:opacity .28s ease; }
      .ready canvas { opacity:1; }
      .loader { width:32px; height:32px; border:1px solid rgba(18,63,48,.16); border-top-color:#123f30; border-radius:50%; animation:spin .8s linear infinite; }
      .ready .loader { display:none; }
      @keyframes spin { to { transform:rotate(360deg); } }
    `;
    const frame = document.createElement('div');
    frame.className = 'frame';
    const loader = document.createElement('span');
    loader.className = 'loader';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    frame.append(loader, canvas);
    shadow.append(style, frame);

    let active = true;
    const sourceKey = cacheKey ?? image?.id;
    if (sourceKey) {
      const width = Math.max(320, Math.ceil(
        host.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, pixelRatioCap),
      ));
      void buildProcessedCanvas(sourceKey, width, manifestUrl)
        .then((processed) => {
          if (!active) return;
          canvas.width = processed.width;
          canvas.height = processed.height;
          canvas.getContext('2d')?.drawImage(processed, 0, 0);
          frame.classList.add('ready');
        })
        .catch((error) => console.warn('[design-lab-canvas]', error));
    }

    const block = (event: Event) => event.preventDefault();
    host.addEventListener('contextmenu', block);
    host.addEventListener('dragstart', block);
    return () => {
      active = false;
      host.removeEventListener('contextmenu', block);
      host.removeEventListener('dragstart', block);
      shadow.replaceChildren();
    };
  }, [image, manifestUrl, cacheKey, pixelRatioCap]);

  return (
    <div
      ref={hostRef}
      className={`protected-product-image dl-canvas-product-image ${className}`}
      role="img"
      aria-label={alt}
      style={{ ...style, aspectRatio: aspectRatio ?? (image ? `${image.width} / ${image.height}` : undefined) }}
    />
  );
}
