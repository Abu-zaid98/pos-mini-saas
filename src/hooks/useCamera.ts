import { useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'

function playBeepSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    }
  } catch {}
  if (navigator.vibrate) {
    try {
      navigator.vibrate(80)
    } catch {}
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const zxingControlsRef = useRef<any>(null)
  const isDetectedRef = useRef(false)
  const lastScannedCodeRef = useRef<string>('')
  const lastScannedTimeRef = useRef<number>(0)

  const stopScanning = useCallback(() => {
    isDetectedRef.current = true
    lastScannedCodeRef.current = ''
    lastScannedTimeRef.current = 0

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop()
      } catch {}
      zxingControlsRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setTorchOn(false)
    setHasTorch(false)
    setScanning(false)
  }, [])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({
        advanced: [{ torch: next } as any],
      })
      setTorchOn(next)
    } catch (e) {
      console.warn('Torch toggle error:', e)
    }
  }, [torchOn])

  const startScanning = useCallback(
    async (onDetected: (barcode: string) => void, continuous = false) => {
      setError(null)
      setScanning(true)
      isDetectedRef.current = false
      lastScannedCodeRef.current = ''
      lastScannedTimeRef.current = 0

      try {
        // 1. Get high resolution stream with rear camera
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            },
            audio: false,
          })
        } catch {
          // Fallback if 1080p is rejected by older hardware
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          })
        }

        streamRef.current = stream

        // Check torch & continuous autofocus capability
        const track = stream.getVideoTracks()[0]
        if (track) {
          const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any
          if ('torch' in capabilities) {
            setHasTorch(true)
          }
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            try {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any],
              })
            } catch {}
          }
        }

        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        video.muted = true
        await video.play()

        const handleDetectedCode = (code: string) => {
          const now = Date.now()
          if (continuous) {
            // Debounce the exact same barcode for 1200ms, immediately accept different barcodes
            if (code === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 1200) {
              return
            }
            lastScannedCodeRef.current = code
            lastScannedTimeRef.current = now
            playBeepSound()
            onDetected(code)
          } else {
            if (!isDetectedRef.current) {
              isDetectedRef.current = true
              playBeepSound()
              stopScanning()
              onDetected(code)
            }
          }
        }

        // 2. Check for native BarcodeDetector API (Android Chrome & modern browsers)
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: [
                'ean_13',
                'ean_8',
                'upc_a',
                'upc_e',
                'code_128',
                'code_39',
                'code_93',
                'itf',
                'qr_code',
              ],
            })

            const scanLoop = async () => {
              if ((!continuous && isDetectedRef.current) || !streamRef.current) return

              if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                try {
                  const barcodes = await detector.detect(video)
                  if (barcodes && barcodes.length > 0) {
                    const code = barcodes[0].rawValue?.trim()
                    if (code) {
                      handleDetectedCode(code)
                      if (!continuous) return
                    }
                  }
                } catch {
                  // Ignore frame detection errors and continue
                }
              }
              animFrameRef.current = requestAnimationFrame(scanLoop)
            }

            animFrameRef.current = requestAnimationFrame(scanLoop)
            return
          } catch (e) {
            console.warn('Native BarcodeDetector initialization failed, falling back to ZXing:', e)
          }
        }

        // 3. Fallback: ZXing with TRY_HARDER hints for 1D retail barcodes
        const hints = new Map()
        hints.set(DecodeHintType.TRY_HARDER, true)
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
        ])

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 })
        zxingControlsRef.current = await reader.decodeFromVideoElement(
          video,
          (result, err) => {
            if (result) {
              const code = result.getText()?.trim()
              if (code) {
                handleDetectedCode(code)
              }
            }
            if (err && err.name !== 'NotFoundException') {
              // ignore regular scan frame miss
            }
          }
        )
      } catch (e) {
        const msg = (e as Error).message || ''
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          setError('يجب السماح للتطبيق باستخدام الكاميرا من إعدادات المتصفح')
        } else {
          setError('تعذّر تشغيل الكاميرا، يرجى التأكد من صلاحيات المتصفح')
        }
        setScanning(false)
      }
    },
    [stopScanning]
  )

  return { videoRef, scanning, error, hasTorch, torchOn, toggleTorch, startScanning, stopScanning }
}
