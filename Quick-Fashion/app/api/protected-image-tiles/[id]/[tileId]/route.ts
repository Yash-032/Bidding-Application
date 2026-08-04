// Keep the delivery implementation centralized. This flatter route avoids a
// Next.js development-router issue where the deeper nested tile route can be
// omitted from the in-memory route manifest after cache/HMR rebuilds.
export { GET } from '@/app/api/protected-images/[id]/tile/[tileId]/route';

export const runtime = 'nodejs';
