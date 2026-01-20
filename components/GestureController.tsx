
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { TreeMode } from '../types';

/**
 * Improved spread logic (WIDER VERSION):
 * See the exported helper at the bottom (getUnleashSpreadPositions) for the new math.
 * This logic should be called from your photo-spread/rendering code after an open palm gesture 
 * (when mode === TreeMode.CHAOS) to get improved layout positions.
 * 
 * The default spread is now *much* wider for a more spaced, airy display.
 * 
 */

interface GestureControllerProps {
  onModeChange: (mode: TreeMode) => void;
  currentMode: TreeMode;
  onHandPosition?: (x: number, y: number, detected: boolean) => void;
  onTwoHandsDetected?: (detected: boolean) => void;
}

export const GestureController: React.FC<GestureControllerProps> = ({ onModeChange, currentMode, onHandPosition, onTwoHandsDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [gestureStatus, setGestureStatus] = useState<string>("Initializing...");
  const [handPos, setHandPos] = useState<{ x: number; y: number } | null>(null);
  const lastModeRef = useRef<TreeMode>(currentMode);

  // Debounce logic refs
  const openFrames = useRef(0);
  const closedFrames = useRef(0);
  const CONFIDENCE_THRESHOLD = 5; // Number of consecutive frames to confirm gesture

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let animationFrameId: number;

    const setupMediaPipe = async () => {
      try {
        // Use jsDelivr CDN (accessible in China)
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        // Use local model file to avoid loading from Google Storage (blocked in China)
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `/models/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });

        startWebcam();
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
        console.warn("Gesture control is unavailable. The app will still work without it.");
        setGestureStatus("Gesture control unavailable");
      }
    };

    const startWebcam = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: "user" }
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener("loadeddata", predictWebcam);
            setIsLoaded(true);
            setGestureStatus("Waiting for hand...");
          }
        } catch (err) {
          console.error("Error accessing webcam:", err);
          setGestureStatus("Permission Denied");
        }
      }
    };

    // Draw a single hand without clearing canvas
    const drawSingleHandSkeleton = (landmarks: any[], ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17]
      ];

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#D4AF37';
      connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];

        ctx.beginPath();
        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
        ctx.stroke();
      });

      landmarks.forEach((landmark) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#228B22';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
    };

    // Draw all detected hands
    const drawAllHands = (allLandmarks: any[][]) => {
      if (!canvasRef.current || !videoRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      allLandmarks.forEach(landmarks => {
        drawSingleHandSkeleton(landmarks, ctx, canvas);
      });
    };

    const predictWebcam = () => {
      if (!handLandmarker || !videoRef.current) return;

      const startTimeMs = performance.now();
      if (videoRef.current.videoWidth > 0) {
        const result = handLandmarker.detectForVideo(videoRef.current, startTimeMs);

        if (result.landmarks && result.landmarks.length > 0) {
          const twoHandsDetected = result.landmarks.length >= 2;
          if (onTwoHandsDetected) {
            onTwoHandsDetected(twoHandsDetected);
          }

          drawAllHands(result.landmarks);
          const landmarks = result.landmarks[0];
          detectGesture(landmarks);
        } else {
            setGestureStatus("No hand detected");
            setHandPos(null);
            if (onHandPosition) onHandPosition(0.5, 0.5, false);
            if (onTwoHandsDetected) onTwoHandsDetected(false);
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            openFrames.current = Math.max(0, openFrames.current - 1);
            closedFrames.current = Math.max(0, closedFrames.current - 1);
        }
      }

      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    const detectGesture = (landmarks: any[]) => {
      // 0 is Wrist
      // Tips: 8 (Index), 12 (Middle), 16 (Ring), 20 (Pinky)
      // Bases (MCP): 5, 9, 13, 17

      const wrist = landmarks[0];
      const palmCenterX = (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5;
      const palmCenterY = (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5;

      setHandPos({ x: palmCenterX, y: palmCenterY });
      if (onHandPosition) {
        onHandPosition(palmCenterX, palmCenterY, true);
      }

      const fingerTips = [8, 12, 16, 20];
      const fingerBases = [5, 9, 13, 17];

      let extendedFingers = 0;
      for (let i = 0; i < 4; i++) {
        const tip = landmarks[fingerTips[i]];
        const base = landmarks[fingerBases[i]];

        const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        const distBase = Math.hypot(base.x - wrist.x, base.y - wrist.y);
        if (distTip > distBase * 1.5) {
          extendedFingers++;
        }
      }

      const thumbTip = landmarks[4];
      const thumbBase = landmarks[2];
      const distThumbTip = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y);
      const distThumbBase = Math.hypot(thumbBase.x - wrist.x, thumbBase.y - wrist.y);
      if (distThumbTip > distThumbBase * 1.2) extendedFingers++;

      if (extendedFingers >= 4) {
        // OPEN HAND -> UNLEASH (CHAOS)
        openFrames.current++;
        closedFrames.current = 0;

        setGestureStatus("Detected: OPEN (Unleash)");

        if (openFrames.current > CONFIDENCE_THRESHOLD) {
          if (lastModeRef.current !== TreeMode.CHAOS) {
            lastModeRef.current = TreeMode.CHAOS;
            onModeChange(TreeMode.CHAOS);
          }
        }

      } else if (extendedFingers <= 1) {
        // CLOSED FIST -> RESTORE (FORMED)
        closedFrames.current++;
        openFrames.current = 0;

        setGestureStatus("Detected: CLOSED (Restore)");

        if (closedFrames.current > CONFIDENCE_THRESHOLD) {
          if (lastModeRef.current !== TreeMode.FORMED) {
            lastModeRef.current = TreeMode.FORMED;
            onModeChange(TreeMode.FORMED);
          }
        }
      } else {
        setGestureStatus("Detected: ...");
        openFrames.current = 0;
        closedFrames.current = 0;
      }
    };

    setupMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
    };
  }, [onModeChange]);

  useEffect(() => {
    lastModeRef.current = currentMode;
  }, [currentMode]);

  return (
    <div className="absolute top-6 right-[8%] z-50 flex flex-col items-end pointer-events-none">
      {/* Camera Preview Frame */}
      <div className="relative w-[18.75vw] h-[14.0625vw] border-2 border-[#D4AF37] rounded-lg overflow-hidden shadow-[0_0_20px_rgba(212,175,55,0.3)] bg-black">
        {/* Decorative Lines */}
        <div className="absolute inset-0 border border-[#F5E6BF]/20 m-1 rounded-sm z-10"></div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Canvas for hand skeleton overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none z-20"
        />
        {/* Hand Position Indicator */}
        {handPos && (
          <div
            className="absolute w-2 h-2 bg-[#D4AF37] rounded-full border border-white"
            style={{
              left: `${(1 - handPos.x) * 100}%`,
              top: `${handPos.y * 100}%`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        )}
      </div>
    </div>
  );
};

// --- NEW: Math for "unleash/CHAOS" photo spread below ---

/**
 * Returns optimal spread positions for photos in the "CHAOS/Unleash" mode, with:
 * - large radial distance
 * - random angular per-item offset ("wiggle")
 * - vertical variance
 * - no clustering near center
 *
 * @param {number} count - number of photos/items
 * @param {object} [opts]
 *      opts.radiusBase: minimum radius to avoid center (default: 7)
 *      opts.radiusMax: maximum random radial range (default: 12)
 *      opts.radialJitter: max-random angle added per item (default: 0.28 radians)
 *      opts.verticalJitter: max random Y for vertical variance (default: 2.3)
 *      opts.easing?: incoming value [0..1] for animation (ease in spread; default: 1 [fully spread])
 * @returns Array<{x:number, y:number, z:number}>
 */
export function getUnleashSpreadPositions(
  count: number,
  opts?: {
    radiusBase?: number;
    radiusMax?: number;
    radialJitter?: number;
    verticalJitter?: number;
    easing?: number;
  }
) {
  // Larger radius, avoid clustering at 0
  const radiusBase = opts?.radiusBase ?? 7; // Minimum distance from center (prevents clustering)
  const radiusMax = opts?.radiusMax ?? 12;  // Max distance from center
  const angleJitter = opts?.radialJitter ?? 0.28; // max random (radian) offset per photo
  const verticalJitter = opts?.verticalJitter ?? 2.3; // max random up/down shift
  const easing = typeof opts?.easing === "number" ? opts.easing : 1; // [0=eased in; 1=full spread]

  // Spread evenly, introduce per-item random jitter (seeded by index for stable layout, or use uuid/photo url hash)
  let arr = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    // Random angular jitter, seeded for stability
    const thetaJitter = pseudoRandom(i + 1) * angleJitter - (angleJitter / 2);
    const angle = theta + thetaJitter;

    // Randomize (but keep above minimum base radius)
    const radialRand = pseudoRandom(i + 77) * (radiusMax - radiusBase);
    const radius = (radiusBase + radialRand) * easing;

    // Random vertical jitter
    const yOffset = (pseudoRandom(i + 113) - 0.5) * 2 * verticalJitter * easing;

    arr.push({
      x: Math.cos(angle) * radius,
      y: yOffset,
      z: Math.sin(angle) * radius,
    });
  }
  return arr;
}

// Deterministic pseudo-random [0,1), using Mulberry32
function pseudoRandom(seed: number): number {
  var t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
