# Shared private product-image storage

The local protected-image pipeline reads and writes only through
`lib/protected-images/storage.ts`. Configure every application that is allowed
to use the same protected-image objects with the identical local root:

```env
PRIVATE_IMAGE_STORAGE_PATH="C:/Users/YASH AGARWAL/Bidding-Application/bidding-application/shared-private-product-images"
```

This directory is private storage. It must never be placed in `public/`,
`static/`, or served directly by a web server.

Supported relative keys are:

```text
catalog:<category>/<product-slug>/<filename>
  -> media/<category>/<product-slug>/<filename>

<image-id>/<object-id>
  -> <image-id>/<object-id>
```

The first form supports legacy catalog source files. If a `ProductImage` uses a
`catalog:` original key and has no renderable variants, the manifest endpoint
uses the normal protected-image processor once, saves the resulting width,
height, private original key, tile variants, and `ACTIVE` status back to that
same record, and serves the generated tiles. A Redis lock prevents concurrent
requests from processing the same source twice.

To copy the current application's existing originals and obfuscated tiles into
the shared location, run:

```powershell
npm run migrate:shared-image-storage
```

The migration only copies and verifies files; it does not delete the old
`private/product-images` directory. Keep that directory until the shared path
has been tested.

Another application needs more than the files themselves to render protected
images: it must also have the corresponding `ProductImage.variants` metadata
(tile IDs, storage keys, hashes, dimensions, and decode keys), compatible
session/signature handling, and authorization rules. Use the same PostgreSQL
image records or a controlled shared media registry; folder sharing alone is
not sufficient.

For S3, retain the `storage.ts` function contract (`putPrivateObject`,
`getPrivateObject`, and delete methods) and replace only its local filesystem
implementation with a private S3 adapter. Do not expose bucket object URLs;
the protected tile route must continue to authorize and stream the bytes.
