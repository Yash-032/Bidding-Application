'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import {
  requestEmailOtp,
  savePersonalSpace,
  uploadPersonalSpacePhotos,
  verifyEmailOtp,
} from '@/lib/api';
import { useToast } from '@/app/components/Toast';
import './auth.css';

type PhotoKey = 'selfie' | 'front' | 'left' | 'right' | 'back';

const photoLabels: Record<PhotoKey, string> = {
  selfie: 'Selfie',
  front: 'Full body · front',
  left: 'Full body · left',
  right: 'Full body · right',
  back: 'Full body · back',
};

const emptyPhotos: Record<PhotoKey, File | null> = {
  selfie: null,
  front: null,
  left: null,
  right: null,
  back: null,
};

export default function AuthPage() {
  const router = useRouter();
  const { login, signup } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<'login' | 'space'>('login');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    location: '',
    age: '',
    gender: '',
    email: '',
    password: '',
    otp: '',
    heightCm: '',
    weightKg: '',
    chest: '',
    waist: '',
    hip: '',
    legLengthCm: '',
    shoulderDepth: '',
  });

  const [photos, setPhotos] = useState<Record<PhotoKey, File | null>>(emptyPhotos);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const stageTitle = useMemo(
    () => ['Your details', 'Your reference photos', 'Your measurements', 'Verify your email'][step],
    [step]
  );

  const guest = () => {
    localStorage.setItem('quick-fashion-guest-mode', 'true');
    router.push('/design-lab');
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      await login(form.email, form.password);
      localStorage.removeItem('quick-fashion-guest-mode');
      router.push('/my-space');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not sign in', 'error');
    } finally {
      setBusy(false);
    }
  };

  const performOtpVerification = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6 || busy) return;
    setBusy(true);

    try {
      await verifyEmailOtp(form.email, codeToVerify);
      await login(form.email, form.password);
      await savePersonalSpace({ ...form, age: Number(form.age) });
      await uploadPersonalSpacePhotos(photos as Record<string, File>);

      localStorage.removeItem('quick-fashion-guest-mode');
      toast('Verification successful! Your personal store is ready', 'success');
      router.push('/my-space');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Invalid verification code', 'error');
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (step < 2) {
      if (step === 1 && Object.values(photos).some((file) => !file)) {
        return toast('Please add all five photos', 'error');
      }

      setStep(step + 1);
      return;
    }

    if (step === 2) {
      if (!form.fullName || !form.location || !form.age || !form.gender || !form.email || form.password.length < 8) {
        return toast('Complete all required account details and use an 8+ character password', 'error');
      }

      setBusy(true);

      try {
        await signup(form.email, form.password);
        await requestEmailOtp(form.email);
        setStep(3);

        toast('Verification code sent to your email', 'success');
      } catch (error) {
        if ((error as { status?: number }).status === 409) {
          try {
            await requestEmailOtp(form.email);
            setStep(3);

            toast('An account already exists. We sent a new verification code to your email.', 'success');
          } catch (otpError) {
            toast(
              otpError instanceof Error ? otpError.message : 'Could not request a verification code',
              'error'
            );
          }
        } else {
          toast(error instanceof Error ? error.message : 'Could not create account', 'error');
        }
      } finally {
        setBusy(false);
      }

      return;
    }

    await performOtpVerification(form.otp);
  };

  return (
    <main className="personal-auth">
      {/* Left side art section matching reference sketch */}
      <section className="personal-auth-art">
        <div
          className="sketch-brand-header left-brand-header"
          style={{ opacity: mode === 'space' ? 1 : 0, pointerEvents: mode === 'space' ? 'auto' : 'none' }}
        >
          <h1 className="sketch-brand-title">
            <span className="brand-wordmark-script">QuickFashion</span>
            <span className="brand-wordmark-in">.IN</span>
          </h1>
        </div>

        <div className="art-frame">
          <img src="/auth/diagram_exact_visible.svg" alt="Your personal store illustration" />
          <p className="art-caption">Your Store. Personally Yours.</p>
        </div>
      </section>

      {/* Right side form and branding panel */}
      <section className="personal-auth-panel">
        {mode === 'login' ? (
          <div className="sketch-brand-header">
            <h1 className="sketch-brand-title">
              <span className="brand-wordmark-script">QuickFashion</span>
              <span className="brand-wordmark-in">.IN</span>
            </h1>
            <p className="sketch-brand-subtitle">Your Personal Store</p>
          </div>
        ) : (
          <div className="sketch-brand-header build-brand-header">
            <h2 className="build-header-title">Tell us about yourself</h2>
            <p className="build-header-subtitle">And we will build your store</p>
          </div>
        )}

          {mode === 'login' && (
            <form className="sketch-login-form" onSubmit={signIn}>
              <div className="sketch-input-group">
                <label htmlFor="auth-email">User:</label>
                <input
                  id="auth-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  required
                />
              </div>

              <div className="sketch-input-group">
                <label htmlFor="auth-password">Key:</label>
                <input
                  id="auth-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  required
                />
              </div>

              <div className="sketch-submit-container">
              <button type="submit" className="sketch-enter-btn" disabled={busy}>
                {busy ? 'Opening…' : 'E N T E R'}
              </button>
              <button type="button" className="sketch-guest-btn" onClick={guest}>
                Continue as a Guest?
              </button>
            </div>

            <div className="sketch-space-container">
              <button
                type="button"
                className="sketch-create-space-pill"
                onClick={() => {
                  setMode('space');
                  setStep(0);
                }}
              >
                B U I L D
              </button>
            </div>
            </form>
          )}

          {mode === 'space' && (
            <div className="sketch-space-form">
              <div className="step-line">
                <span>Step {step + 1} of 4</span>
                <i style={{ transform: `scaleX(${(step + 1) / 4})` }} />
              </div>

              <p className="eyebrow">CREATE YOUR SPACE</p>

              <div className="space-form-content">
                {step === 0 && (
                  <div className="field-grid">
                    <label className="sketch-field">
                      <span>Name</span>
                      <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Location</span>
                      <input value={form.location} onChange={(e) => set('location', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Age</span>
                      <input type="number" min="13" value={form.age} onChange={(e) => set('age', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Gender</span>
                      <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                        <option value="">Select</option>
                        <option>Woman</option>
                        <option>Man</option>
                        <option>Non-binary</option>
                        <option>Prefer not to say</option>
                      </select>
                    </label>

                    <label className="sketch-field">
                      <span>User (Email)</span>
                      <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Key (Password)</span>
                      <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
                    </label>
                  </div>
                )}

                {step === 1 && (
                  <div className="photo-grid">
                    {(Object.keys(photoLabels) as PhotoKey[]).map((key) => (
                      <label className="photo-choice" key={key}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) =>
                            setPhotos((current) => ({
                              ...current,
                              [key]: e.target.files?.[0] ?? null,
                            }))
                          }
                        />

                        <span>{photos[key] ? '✓' : '+'}</span>
                        {photoLabels[key]}
                        <em>{photos[key]?.name ?? 'JPEG, PNG or WebP'}</em>
                      </label>
                    ))}
                  </div>
                )}

                {step === 2 && (
                  <div className="field-grid">
                    <label className="sketch-field">
                      <span>Height (cm)</span>
                      <input inputMode="decimal" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Weight (kg)</span>
                      <input inputMode="decimal" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Chest / Bust (cm)</span>
                      <input inputMode="decimal" value={form.chest} onChange={(e) => set('chest', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Waist (cm)</span>
                      <input inputMode="decimal" value={form.waist} onChange={(e) => set('waist', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Hips (cm)</span>
                      <input inputMode="decimal" value={form.hip} onChange={(e) => set('hip', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Leg length (cm)</span>
                      <input inputMode="decimal" value={form.legLengthCm} onChange={(e) => set('legLengthCm', e.target.value)} />
                    </label>

                    <label className="sketch-field">
                      <span>Shoulder depth (cm)</span>
                      <input inputMode="decimal" value={form.shoulderDepth} onChange={(e) => set('shoulderDepth', e.target.value)} />
                    </label>
                  </div>
                )}

                {step === 3 && (
                  <div className="otp-step">
                    <p className="intro">
                      We sent a 6-digit verification code to <strong>{form.email}</strong>. Please check your email inbox.
                    </p>

                    <label className="sketch-field">
                      <span>Verification code</span>
                      <input
                        className="otp"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={form.otp}
                        disabled={busy}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          set('otp', val);
                          if (val.length === 6) {
                            performOtpVerification(val);
                          }
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="auth-link-btn"
                      style={{ marginTop: '0.8rem', fontSize: '0.85rem' }}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await requestEmailOtp(form.email);
                          toast('A new verification code has been sent to your email.', 'success');
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Could not resend code', 'error');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Resend code to email
                    </button>
                  </div>
                )}
              </div>

              <div className="form-actions">
                {step > 0 ? (
                  <button className="auth-link-btn" onClick={() => setStep(step - 1)}>
                    Back
                  </button>
                ) : (
                  <button className="auth-link-btn" onClick={() => setMode('login')}>
                    Already have a store? Enter your store
                  </button>
                )}

                <button className="sketch-enter-btn" disabled={busy} onClick={next}>
                  {busy ? 'Saving…' : step === 3 ? 'Verify & create store' : 'Continue'}
                </button>
              </div>
            </div>
          )}
        </section>
    </main>
  );
}