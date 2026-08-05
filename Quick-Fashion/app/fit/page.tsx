'use client';

import { useEffect, useState } from 'react';

type Measurement = {
  status: string;
  unit: string;
  updatedAt: string;
} | null;

export default function FitPage() {
  const [measurement, setMeasurement] = useState<Measurement>(null);
  const [loading, setLoading] = useState(true);
  const pixaLoginUrl = process.env.PIXA_LOGIN_URL || 'https://pixa.fit/login';

  useEffect(() => {
    fetch('/api/measurements/me')
      .then(async (response) =>
        response.ok ? response.json() : Promise.reject()
      )
      .then((data) => {
        setMeasurement(data.measurement);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const needsPhotos =
    !measurement || measurement.status === 'PHOTO_REQUIRED';

  return (
    <main className="page-container max-w-2xl">
      <div className="glass-card-static p-8">
        <p className="eyebrow">Pixa fit profile</p>

        <h1 className="page-title">Your measurement connection</h1>

        {loading ? (
          <p>Checking your Pixa profile…</p>
        ) : needsPhotos ? (
          <>
            <p className="page-subtitle">
              Pixa has no current measurements. Upload photos or complete
              measurements later to improve fit results.
            </p>

            <a
              className="btn-primary inline-block mt-6"
              href={`${pixaLoginUrl}/`}
            >
              Upload photos to complete measurements
            </a>
          </>
        ) : (
          <>
            <p className="page-subtitle">
              Your latest measurements are synced from Pixa and ready for fit
              recommendations.
            </p>
            <a
              className="btn-primary inline-block mt-6"
              href="/shop"
            >
              Find garments for my fit
            </a>
          </>
        )}
      </div>
    </main>
  );
}