export type StoredTile = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  storageKey: string;
  sha256: string;
  decodeKey: string;
  codec?: 'webp-lossless';
};

export type StoredVariant = {
  width: number;
  height: number;
  tiles: StoredTile[];
};

export type StoredVariants = Record<string, StoredVariant>;

export type PublicTile = Omit<StoredTile, 'storageKey'> & {
  url: string;
};

export type ProtectedImageManifest = {
  imageId: string;
  width: number;
  height: number;
  grid: number;
  expiresAt: number;
  tiles: PublicTile[];
};
