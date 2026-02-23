'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Card, CardContent, Badge } from '@openlintel/ui';
import { Smartphone, Glasses, Monitor, AlertCircle, CheckCircle2 } from 'lucide-react';

export type XRMode = 'ar' | 'vr' | 'none';

interface XRCapabilities {
  arSupported: boolean;
  vrSupported: boolean;
  checked: boolean;
}

interface XRViewerProps {
  children: React.ReactNode;
  mode: XRMode;
  onModeChange: (mode: XRMode) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

function useXRCapabilities(): XRCapabilities {
  const [capabilities, setCapabilities] = useState<XRCapabilities>({
    arSupported: false,
    vrSupported: false,
    checked: false,
  });

  useEffect(() => {
    async function checkCapabilities() {
      let arSupported = false;
      let vrSupported = false;

      if ('xr' in navigator) {
        const xr = (navigator as any).xr;
        try {
          arSupported = await xr.isSessionSupported('immersive-ar');
        } catch {
          arSupported = false;
        }
        try {
          vrSupported = await xr.isSessionSupported('immersive-vr');
        } catch {
          vrSupported = false;
        }
      }

      setCapabilities({ arSupported, vrSupported, checked: true });
    }

    checkCapabilities();
  }, []);

  return capabilities;
}

export function XRViewer({
  children,
  mode,
  onModeChange,
  onSessionStart,
  onSessionEnd,
}: XRViewerProps) {
  const capabilities = useXRCapabilities();
  const [sessionActive, setSessionActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(
    async (targetMode: 'ar' | 'vr') => {
      if (!('xr' in navigator)) {
        setError('WebXR is not supported in this browser.');
        return;
      }

      const xr = (navigator as any).xr;
      const sessionType = targetMode === 'ar' ? 'immersive-ar' : 'immersive-vr';

      try {
        const supported = await xr.isSessionSupported(sessionType);
        if (!supported) {
          setError(`${targetMode.toUpperCase()} mode is not supported on this device.`);
          return;
        }

        const session = await xr.requestSession(sessionType, {
          requiredFeatures: targetMode === 'ar' ? ['hit-test', 'local-floor'] : ['local-floor'],
          optionalFeatures: targetMode === 'ar' ? ['dom-overlay'] : ['bounded-floor', 'hand-tracking'],
        });

        session.addEventListener('end', () => {
          setSessionActive(false);
          onModeChange('none');
          onSessionEnd?.();
        });

        setSessionActive(true);
        onModeChange(targetMode);
        onSessionStart?.();
        setError(null);
      } catch (err) {
        setError(
          `Failed to start ${targetMode.toUpperCase()} session: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
        );
      }
    },
    [onModeChange, onSessionStart, onSessionEnd],
  );

  const endSession = useCallback(() => {
    setSessionActive(false);
    onModeChange('none');
    onSessionEnd?.();
  }, [onModeChange, onSessionEnd]);

  return (
    <div className="relative h-full w-full">
      {/* XR content area */}
      <div className="h-full w-full">{children}</div>

      {/* XR controls overlay */}
      {!sessionActive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <Card className="shadow-lg">
            <CardContent className="flex items-center gap-3 p-3">
              {/* Capability indicators */}
              {capabilities.checked && (
                <div className="flex items-center gap-2 border-r pr-3">
                  <div className="flex items-center gap-1">
                    {capabilities.arSupported ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs">AR</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {capabilities.vrSupported ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs">VR</span>
                  </div>
                </div>
              )}

              {/* Mode buttons */}
              <Button
                size="sm"
                variant={mode === 'ar' ? 'default' : 'outline'}
                className="h-8"
                onClick={() => startSession('ar')}
                disabled={!capabilities.arSupported}
              >
                <Smartphone className="mr-1 h-4 w-4" />
                Enter AR
              </Button>
              <Button
                size="sm"
                variant={mode === 'vr' ? 'default' : 'outline'}
                className="h-8"
                onClick={() => startSession('vr')}
                disabled={!capabilities.vrSupported}
              >
                <Glasses className="mr-1 h-4 w-4" />
                Enter VR
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Session active indicator */}
      {sessionActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <Card className="shadow-lg">
            <CardContent className="flex items-center gap-3 p-3">
              <Badge variant="default">{mode.toUpperCase()} Active</Badge>
              <Button size="sm" variant="destructive" className="h-7" onClick={endSession}>
                Exit {mode.toUpperCase()}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <Card className="border-destructive shadow-lg">
            <CardContent className="flex items-center gap-2 p-3">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <p className="text-xs text-destructive">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Non-XR fallback info */}
      {capabilities.checked && !capabilities.arSupported && !capabilities.vrSupported && (
        <div className="absolute top-4 right-4 z-10">
          <Card className="max-w-xs shadow-lg">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium">WebXR Not Available</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your browser or device does not support WebXR. Use the 3D viewer to explore
                    designs, or open this page on a compatible device.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
