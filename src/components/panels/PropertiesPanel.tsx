'use client';

import { useRef, useState, useCallback } from 'react';
import { useFlowStore } from '@/store/flowStore';
import { FlowNodeData } from '@/lib/types';
import { getModelById, type SettingDef } from '@/lib/modelRegistry';
import { Sun, Camera } from 'lucide-react';

function HexColorInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const displayed = focused ? draft : value;
  return (
    <input
      type="text"
      value={displayed}
      className="flex-1 bg-[#171717] text-zinc-300 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none uppercase"
      onFocus={() => { setDraft(value); setFocused(true); }}
      onBlur={() => {
        setFocused(false);
        if (/^#[0-9a-fA-F]{6}$/.test(draft)) onChange(draft);
      }}
      onChange={(e) => {
        const val = e.target.value;
        if (/^#?[0-9a-fA-F]{0,6}$/.test(val) || val === '') {
          setDraft(val.startsWith('#') ? val : `#${val}`);
          if (/^#[0-9a-fA-F]{6}$/.test(val)) onChange(val);
        }
      }}
    />
  );
}

function SettingControl({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  switch (def.type) {
    case 'select':
      return (
        <select
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          value={String(value ?? def.default ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {def.options?.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'slider':
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={def.min ?? 0}
            max={def.max ?? 100}
            step={def.step ?? 1}
            value={Number(value ?? def.default ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-zinc-400 h-1"
          />
          <span className="text-[10px] text-zinc-400 w-8 text-right">
            {Number(value ?? def.default ?? 0)}
          </span>
        </div>
      );

    case 'number':
      return (
        <input
          type="number"
          min={def.min}
          max={def.max}
          step={def.step}
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          value={value != null ? String(value) : ''}
          placeholder={def.description || ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : Number(v));
          }}
        />
      );

    case 'toggle':
      return (
        <button
          className={`w-10 h-5 rounded-full transition-colors relative ${
            value ? 'bg-emerald-600' : 'bg-[#2a2a2a]'
          }`}
          onClick={() => onChange(!value)}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      );

    case 'text':
      return (
        <textarea
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none resize-none"
          rows={2}
          value={String(value ?? def.default ?? '')}
          placeholder={def.description || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return null;
  }
}

/* ─── Aspect ratio preview helper ─── */
function addAspectRatioPreview(nodeId: string, newRatio: string) {
  const store = useFlowStore.getState();
  store.updateNodeSetting(nodeId, 'aspectRatio', newRatio);
  const currentData = store.nodes.find(n => n.id === nodeId)?.data as unknown as FlowNodeData;
  const results = currentData?.results || [];
  const cleaned = results.filter(r => Object.values(r)[0]?.format !== 'preview');
  const preview = { image: { content: '', format: 'preview', aspectRatio: newRatio } };
  store.updateNodeData(nodeId, {
    results: [...cleaned, preview],
    selectedResultIndex: cleaned.length,
    status: cleaned.length > 0 ? 'done' : 'idle',
  });
}

/* ─── 3D Sphere projection ─── */
function projectPoint(azimuth: number, elevation: number, radius: number, center: number): { x: number; y: number; z: number } {
  const azRad = azimuth * Math.PI / 180;
  const elRad = elevation * Math.PI / 180;
  // 3D position on sphere
  let nx = Math.sin(azRad) * Math.cos(elRad) * radius;
  let ny = -Math.sin(elRad) * radius;
  let nz = Math.cos(azRad) * Math.cos(elRad) * radius;
  // Y-axis rotation by -30deg
  const yRot = -30 * Math.PI / 180;
  const cosY = Math.cos(yRot), sinY = Math.sin(yRot);
  const rx = nx * cosY + nz * sinY;
  nz = -nx * sinY + nz * cosY;
  nx = rx;
  // X-axis rotation by -25deg
  const xRot = -25 * Math.PI / 180;
  const cosX = Math.cos(xRot), sinX = Math.sin(xRot);
  const ry = ny * cosX - nz * sinX;
  nz = ny * sinX + nz * cosX;
  ny = ry;
  // Perspective
  const scale = 1 + 0.3 * nz / radius;
  return { x: center + nx * scale, y: center + ny * scale, z: nz };
}

/* ─── Light presets ─── */
interface LightPreset {
  label: string;
  azimuth: number;
  elevation: number;
}

const LIGHT_PRESETS: LightPreset[] = [
  { label: 'Top',    azimuth: 0,   elevation: 90  },
  { label: 'Front',  azimuth: 0,   elevation: 0   },
  { label: 'Back',   azimuth: 180, elevation: 0   },
  { label: 'Bottom', azimuth: 0,   elevation: -90 },
  { label: 'Left',   azimuth: 270, elevation: 0   },
  { label: 'Right',  azimuth: 90,  elevation: 0   },
];

const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '9:16', '16:9'];
const RESOLUTIONS = ['1K', '2K'];

/* ─── Relight Properties Section ─── */
function RelightProperties({ nodeId, settings }: { nodeId: string; settings: Record<string, unknown> }) {
  const updateNodeSetting = useFlowStore((s) => s.updateNodeSetting);

  const azimuth = (settings.azimuth as number) ?? 0;
  const elevation = (settings.elevation as number) ?? 0;
  const lightIntensity = (settings.lightIntensity as number) ?? 7;
  const colorHex = (settings.colorHex as string) ?? '#ffffff';
  const aspectRatio = (settings.aspectRatio as string) ?? '3:4';
  const resolution = (settings.resolution as string) ?? '1K';

  const SPHERE_SIZE = 250;
  const SPHERE_R = 100;
  const CENTER = SPHERE_SIZE / 2;

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'azimuth' | 'elevation' | null>(null);

  // Generate longitude lines (18 great circles every 20deg)
  const longitudeLines = [];
  for (let a = 0; a < 360; a += 20) {
    const points: string[] = [];
    for (let el = -90; el <= 90; el += 5) {
      const p = projectPoint(a, el, SPHERE_R, CENTER);
      points.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    longitudeLines.push(points.join(' '));
  }

  // Generate equator ring
  const equatorPoints: { x: number; y: number }[] = [];
  for (let a = 0; a <= 360; a += 2) {
    const p = projectPoint(a, 0, SPHERE_R, CENTER);
    equatorPoints.push({ x: p.x, y: p.y });
  }
  const equatorPath = equatorPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Generate meridian arc at current azimuth
  const meridianPoints: { x: number; y: number }[] = [];
  for (let el = -90; el <= 90; el += 2) {
    const p = projectPoint(azimuth, el, SPHERE_R, CENTER);
    meridianPoints.push({ x: p.x, y: p.y });
  }
  const meridianPath = meridianPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Light point position
  const lightPoint = projectPoint(azimuth, elevation, SPHERE_R, CENTER);
  // Azimuth handle on equator
  const azHandle = projectPoint(azimuth, 0, SPHERE_R, CENTER);

  // Light beam triangles from light point to center area
  const beamSpread = 8 + (lightIntensity / 10) * 16;
  const beamTriangles: string[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * 90) * Math.PI / 180;
    const cx = CENTER + Math.cos(angle) * beamSpread;
    const cy = CENTER + Math.sin(angle) * beamSpread;
    beamTriangles.push(`M${lightPoint.x.toFixed(1)},${lightPoint.y.toFixed(1)} L${cx.toFixed(1)},${cy.toFixed(1)} L${CENTER.toFixed(1)},${CENTER.toFixed(1)} Z`);
  }

  const findClosestAzimuth = useCallback((mx: number, my: number) => {
    let bestAz = 0;
    let bestDist = Infinity;
    // Coarse search every 2deg
    for (let a = 0; a < 360; a += 2) {
      const p = projectPoint(a, 0, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestAz = a; }
    }
    // Refine +/- 2deg
    for (let a = bestAz - 2; a <= bestAz + 2; a += 0.5) {
      const na = ((a % 360) + 360) % 360;
      const p = projectPoint(na, 0, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestAz = na; }
    }
    return Math.round(bestAz);
  }, []);

  const findClosestElevation = useCallback((mx: number, my: number, currentAz: number) => {
    let bestEl = 0;
    let bestDist = Infinity;
    // Coarse search every 2deg
    for (let el = -90; el <= 90; el += 2) {
      const p = projectPoint(currentAz, el, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestEl = el; }
    }
    // Refine +/- 2deg
    for (let el = bestEl - 2; el <= bestEl + 2; el += 0.5) {
      const clamped = Math.max(-90, Math.min(90, el));
      const p = projectPoint(currentAz, clamped, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestEl = clamped; }
    }
    return Math.round(bestEl);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragging === 'azimuth') {
      const newAz = findClosestAzimuth(mx, my);
      updateNodeSetting(nodeId, 'azimuth', newAz);
    } else if (dragging === 'elevation') {
      const currentAz = (useFlowStore.getState().nodes.find(n => n.id === nodeId)?.data as unknown as FlowNodeData)?.settings?.azimuth as number ?? 0;
      const newEl = findClosestElevation(mx, my, currentAz);
      updateNodeSetting(nodeId, 'elevation', newEl);
    }
  }, [dragging, nodeId, updateNodeSetting, findClosestAzimuth, findClosestElevation]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* 3D Sphere Light Control */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-2">Light Position</label>
        <div className="flex justify-center">
          <svg
            ref={svgRef}
            width={SPHERE_SIZE}
            height={SPHERE_SIZE}
            viewBox={`0 0 ${SPHERE_SIZE} ${SPHERE_SIZE}`}
            className="cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Longitude lines */}
            {longitudeLines.map((pts, i) => (
              <polyline
                key={`lon-${i}`}
                points={pts}
                fill="none"
                stroke="#333"
                strokeWidth={0.5}
                opacity={0.5}
              />
            ))}

            {/* Equator ring */}
            <path d={equatorPath} fill="none" stroke="#555" strokeWidth={1} />

            {/* Meridian arc at current azimuth */}
            <path d={meridianPath} fill="none" stroke="#555" strokeWidth={1} />

            {/* Light beam triangles */}
            <defs>
              <radialGradient id={`beam-grad-${nodeId}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={colorHex} stopOpacity={0.4} />
                <stop offset="100%" stopColor={colorHex} stopOpacity={0} />
              </radialGradient>
            </defs>
            {beamTriangles.map((d, i) => (
              <path
                key={`beam-${i}`}
                d={d}
                fill={`url(#beam-grad-${nodeId})`}
                opacity={0.1 + (lightIntensity / 10) * 0.7}
              />
            ))}

            {/* Center image placeholder with 3D transform */}
            <foreignObject x={CENTER - 20} y={CENTER - 20} width={40} height={40}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  perspective: '100px',
                  transform: 'rotateX(25deg) rotateY(30deg)',
                  opacity: 0.25,
                }}
              >
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <rect x={2} y={2} width={20} height={20} rx={4} stroke="#888" strokeWidth={1.2} />
                  <circle cx={8} cy={8} r={2.5} fill="#888" />
                  <polyline points="4,20 10,13 15,17 20,11" fill="none" stroke="#888" strokeWidth={1.2} strokeLinejoin="round" />
                </svg>
              </div>
            </foreignObject>

            {/* Azimuth handle (small white circle on equator) */}
            <circle
              cx={azHandle.x}
              cy={azHandle.y}
              r={6}
              fill="white"
              stroke="#666"
              strokeWidth={1}
              className="cursor-grab"
              onMouseDown={(e) => { e.stopPropagation(); setDragging('azimuth'); }}
            />

            {/* Light/elevation handle (larger circle with gradient) */}
            <defs>
              <linearGradient id={`elev-grad-${nodeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#555" />
                <stop offset="100%" stopColor="#ccc" />
              </linearGradient>
            </defs>
            <circle
              cx={lightPoint.x}
              cy={lightPoint.y}
              r={12}
              fill={`url(#elev-grad-${nodeId})`}
              stroke="#888"
              strokeWidth={1}
              className="cursor-grab"
              onMouseDown={(e) => { e.stopPropagation(); setDragging('elevation'); }}
            />
            {/* Sun icon inside elevation handle */}
            <foreignObject
              x={lightPoint.x - 8}
              y={lightPoint.y - 8}
              width={16}
              height={16}
              className="pointer-events-none"
            >
              <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sun size={12} color="#222" />
              </div>
            </foreignObject>
          </svg>
        </div>

        {/* Azimuth / Elevation readout + Reset */}
        <div className="flex items-center justify-center gap-4 mt-1">
          <span className="text-[10px] text-zinc-500">Az: {azimuth}°</span>
          <span className="text-[10px] text-zinc-500">El: {elevation}°</span>
          <button
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={() => {
              updateNodeSetting(nodeId, 'azimuth', 0);
              updateNodeSetting(nodeId, 'elevation', 0);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Preset buttons */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1.5">Presets</label>
        <div className="grid grid-cols-3 gap-1">
          {LIGHT_PRESETS.map((preset) => {
            const isActive = azimuth === preset.azimuth && elevation === preset.elevation;
            return (
              <button
                key={preset.label}
                className={`text-[10px] font-medium px-1 py-1.5 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-[#171717] border-[#212121] text-zinc-400 hover:bg-[#212121] hover:text-zinc-300'
                }`}
                onClick={() => {
                  updateNodeSetting(nodeId, 'azimuth', preset.azimuth);
                  updateNodeSetting(nodeId, 'elevation', preset.elevation);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Light Intensity */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-zinc-500">Light Intensity</label>
          <span className="text-[11px] text-zinc-300">{lightIntensity}</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={lightIntensity}
          className="w-full h-1.5 rounded-full appearance-none bg-[#333] accent-white cursor-pointer"
          onChange={(e) => updateNodeSetting(nodeId, 'lightIntensity', Number(e.target.value))}
        />
      </div>

      {/* Color picker */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1">Light Color</label>
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-[#212121] flex-shrink-0">
            <input
              type="color"
              value={colorHex}
              className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
              onChange={(e) => updateNodeSetting(nodeId, 'colorHex', e.target.value)}
            />
            <div className="w-full h-full" style={{ backgroundColor: colorHex }} />
          </div>
          <HexColorInput
            value={colorHex}
            onChange={(val) => updateNodeSetting(nodeId, 'colorHex', val)}
          />
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1">Aspect Ratio</label>
        <select
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          value={aspectRatio}
          onChange={(e) => addAspectRatioPreview(nodeId, e.target.value)}
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Resolution */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1">Resolution</label>
        <select
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          value={resolution}
          onChange={(e) => updateNodeSetting(nodeId, 'resolution', e.target.value)}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ─── Camera Angle Presets ─── */
interface CameraPreset {
  label: string;
  azimuth: number;
  elevation: number;
  zoom: number;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { label: 'Top',    azimuth: 0,   elevation: 90,  zoom: 1 },
  { label: 'Front',  azimuth: 0,   elevation: 0,   zoom: 1 },
  { label: 'Back',   azimuth: 180, elevation: 0,   zoom: 1 },
  { label: 'Bottom', azimuth: 0,   elevation: -90, zoom: 1 },
  { label: 'Left',   azimuth: 270, elevation: 0,   zoom: 1 },
  { label: 'Right',  azimuth: 90,  elevation: 0,   zoom: 1 },
];

/* ─── Camera Angles Properties Section ─── */
function CameraAnglesProperties({ nodeId, settings }: { nodeId: string; settings: Record<string, unknown> }) {
  const updateNodeSetting = useFlowStore((s) => s.updateNodeSetting);

  const azimuth = (settings.rotateRightLeft as number) ?? 0;
  const elevation = (settings.verticalAngle as number) ?? 0;
  const zoom = (settings.moveForward as number) ?? 5;
  const aspectRatio = (settings.aspectRatio as string) ?? '3:4';
  const resolution = (settings.resolution as string) ?? '1K';
  const guidanceScale = (settings.guidanceScale as number) ?? 4.5;
  const wideAngleLens = (settings.wideAngleLens as boolean) ?? false;
  const enableSafetyChecker = (settings.enableSafetyChecker as boolean) ?? false;
  const seed = settings.seed as number | undefined;

  const SPHERE_SIZE = 250;
  const SPHERE_R = 100;
  const CENTER = SPHERE_SIZE / 2;

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'azimuth' | 'elevation' | null>(null);

  const longitudeLines = [];
  for (let a = 0; a < 360; a += 20) {
    const points: string[] = [];
    for (let el = -90; el <= 90; el += 5) {
      const p = projectPoint(a, el, SPHERE_R, CENTER);
      points.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    longitudeLines.push(points.join(' '));
  }

  const equatorPoints: { x: number; y: number }[] = [];
  for (let a = 0; a <= 360; a += 2) {
    const p = projectPoint(a, 0, SPHERE_R, CENTER);
    equatorPoints.push({ x: p.x, y: p.y });
  }
  const equatorPath = equatorPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const meridianPoints: { x: number; y: number }[] = [];
  for (let el = -90; el <= 90; el += 2) {
    const p = projectPoint(azimuth, el, SPHERE_R, CENTER);
    meridianPoints.push({ x: p.x, y: p.y });
  }
  const meridianPath = meridianPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const cameraPoint = projectPoint(azimuth, elevation, SPHERE_R, CENTER);
  const azHandle = projectPoint(azimuth, 0, SPHERE_R, CENTER);

  const findClosestAzimuth = useCallback((mx: number, my: number) => {
    let bestAz = 0;
    let bestDist = Infinity;
    for (let a = 0; a < 360; a += 2) {
      const p = projectPoint(a, 0, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestAz = a; }
    }
    for (let a = bestAz - 2; a <= bestAz + 2; a += 0.5) {
      const na = ((a % 360) + 360) % 360;
      const p = projectPoint(na, 0, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestAz = na; }
    }
    return Math.round(bestAz);
  }, []);

  const findClosestElevation = useCallback((mx: number, my: number, currentAz: number) => {
    let bestEl = 0;
    let bestDist = Infinity;
    for (let el = -90; el <= 90; el += 2) {
      const p = projectPoint(currentAz, el, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestEl = el; }
    }
    for (let el = bestEl - 2; el <= bestEl + 2; el += 0.5) {
      const clamped = Math.max(-30, Math.min(90, el));
      const p = projectPoint(currentAz, clamped, SPHERE_R, CENTER);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestDist) { bestDist = d; bestEl = clamped; }
    }
    return Math.round(bestEl);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragging === 'azimuth') {
      const newAz = findClosestAzimuth(mx, my);
      updateNodeSetting(nodeId, 'rotateRightLeft', newAz);
    } else if (dragging === 'elevation') {
      const currentAz = (useFlowStore.getState().nodes.find(n => n.id === nodeId)?.data as unknown as FlowNodeData)?.settings?.rotateRightLeft as number ?? 0;
      const newEl = findClosestElevation(mx, my, currentAz);
      updateNodeSetting(nodeId, 'verticalAngle', newEl);
    }
  }, [dragging, nodeId, updateNodeSetting, findClosestAzimuth, findClosestElevation]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* 3D Sphere Camera Control */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-2">Camera Position</label>
        <div className="flex justify-center">
          <svg
            ref={svgRef}
            width={SPHERE_SIZE}
            height={SPHERE_SIZE}
            viewBox={`0 0 ${SPHERE_SIZE} ${SPHERE_SIZE}`}
            className="cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {longitudeLines.map((pts, i) => (
              <polyline key={`lon-${i}`} points={pts} fill="none" stroke="#333" strokeWidth={0.5} opacity={0.5} />
            ))}
            <path d={equatorPath} fill="none" stroke="#555" strokeWidth={1} />
            <path d={meridianPath} fill="none" stroke="#555" strokeWidth={1} />

            {/* Direction line from camera to center */}
            <line x1={cameraPoint.x} y1={cameraPoint.y} x2={CENTER} y2={CENTER} stroke="#555" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />

            {/* Center camera icon */}
            <foreignObject x={CENTER - 20} y={CENTER - 20} width={40} height={40}>
              <div
                style={{
                  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  perspective: '100px', transform: 'rotateX(25deg) rotateY(30deg)', opacity: 0.25,
                }}
              >
                <Camera size={20} color="#888" />
              </div>
            </foreignObject>

            {/* Azimuth handle */}
            <circle
              cx={azHandle.x} cy={azHandle.y} r={6}
              fill="white" stroke="#666" strokeWidth={1} className="cursor-grab"
              onMouseDown={(e) => { e.stopPropagation(); setDragging('azimuth'); }}
            />

            {/* Elevation handle */}
            <defs>
              <linearGradient id={`cam-elev-grad-${nodeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#555" />
                <stop offset="100%" stopColor="#ccc" />
              </linearGradient>
            </defs>
            <circle
              cx={cameraPoint.x} cy={cameraPoint.y} r={12}
              fill={`url(#cam-elev-grad-${nodeId})`} stroke="#888" strokeWidth={1} className="cursor-grab"
              onMouseDown={(e) => { e.stopPropagation(); setDragging('elevation'); }}
            />
            <foreignObject x={cameraPoint.x - 8} y={cameraPoint.y - 8} width={16} height={16} className="pointer-events-none">
              <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={10} color="#222" />
              </div>
            </foreignObject>
          </svg>
        </div>

        <div className="flex items-center justify-center gap-4 mt-1">
          <span className="text-[10px] text-zinc-500">Rot: {azimuth}°</span>
          <span className="text-[10px] text-zinc-500">Move: {elevation}°</span>
          <button
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={() => {
              updateNodeSetting(nodeId, 'rotateRightLeft', 0);
              updateNodeSetting(nodeId, 'verticalAngle', 0);
              updateNodeSetting(nodeId, 'moveForward', 5);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Preset buttons */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1.5">Presets</label>
        <div className="grid grid-cols-3 gap-1">
          {CAMERA_PRESETS.map((preset) => {
            const isActive = azimuth === preset.azimuth && elevation === preset.elevation;
            return (
              <button
                key={preset.label}
                className={`text-[10px] font-medium px-1 py-1.5 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-[#171717] border-[#212121] text-zinc-400 hover:bg-[#212121] hover:text-zinc-300'
                }`}
                onClick={() => {
                  updateNodeSetting(nodeId, 'rotateRightLeft', preset.azimuth);
                  updateNodeSetting(nodeId, 'verticalAngle', preset.elevation);
                  updateNodeSetting(nodeId, 'moveForward', preset.zoom);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rotation (Left/Right) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-zinc-500">Rotation (Left/Right)</label>
          <span className="text-[11px] text-zinc-300">{azimuth}</span>
        </div>
        <input
          type="range" min={0} max={360} step={1} value={azimuth}
          className="w-full h-1.5 rounded-full appearance-none bg-[#333] accent-white cursor-pointer"
          onChange={(e) => updateNodeSetting(nodeId, 'rotateRightLeft', Number(e.target.value))}
        />
      </div>

      {/* Move (Up/Down) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-zinc-500">Move (Up/Down)</label>
          <span className="text-[11px] text-zinc-300">{elevation}</span>
        </div>
        <input
          type="range" min={-30} max={90} step={1} value={elevation}
          className="w-full h-1.5 rounded-full appearance-none bg-[#333] accent-white cursor-pointer"
          onChange={(e) => updateNodeSetting(nodeId, 'verticalAngle', Number(e.target.value))}
        />
      </div>

      {/* Zoom */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-zinc-500">Zoom</label>
          <span className="text-[11px] text-zinc-300">{zoom}</span>
        </div>
        <input
          type="range" min={0} max={10} step={1} value={zoom}
          className="w-full h-1.5 rounded-full appearance-none bg-[#333] accent-white cursor-pointer"
          onChange={(e) => updateNodeSetting(nodeId, 'moveForward', Number(e.target.value))}
        />
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1">Aspect Ratio</label>
        <select
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          value={aspectRatio}
          onChange={(e) => addAspectRatioPreview(nodeId, e.target.value)}
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Wide Angle Lens */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-zinc-500">Wide Angle Lens</label>
        <button
          className={`w-10 h-5 rounded-full transition-colors relative ${wideAngleLens ? 'bg-emerald-600' : 'bg-[#2a2a2a]'}`}
          onClick={() => updateNodeSetting(nodeId, 'wideAngleLens', !wideAngleLens)}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${wideAngleLens ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Guidance Scale */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-zinc-500">Guidance Scale</label>
          <span className="text-[11px] text-zinc-300">{guidanceScale}</span>
        </div>
        <input
          type="range" min={1} max={20} step={0.5} value={guidanceScale}
          className="w-full h-1.5 rounded-full appearance-none bg-[#333] accent-white cursor-pointer"
          onChange={(e) => updateNodeSetting(nodeId, 'guidanceScale', Number(e.target.value))}
        />
      </div>

      {/* Seed */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1">Seed</label>
        <input
          type="number"
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          placeholder="Enter Seed"
          value={seed ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            updateNodeSetting(nodeId, 'seed', v === '' ? undefined : Number(v));
          }}
        />
      </div>

      {/* Enable Safety Checker */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-zinc-500">Enable Safety Checker</label>
        <button
          className={`w-10 h-5 rounded-full transition-colors relative ${enableSafetyChecker ? 'bg-emerald-600' : 'bg-[#2a2a2a]'}`}
          onClick={() => updateNodeSetting(nodeId, 'enableSafetyChecker', !enableSafetyChecker)}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${enableSafetyChecker ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Resolution */}
      <div>
        <label className="text-[11px] text-zinc-500 block mb-1">Resolution</label>
        <select
          className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
          value={resolution}
          onChange={(e) => updateNodeSetting(nodeId, 'resolution', e.target.value)}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const updateNodeSetting = useFlowStore((s) => s.updateNodeSetting);
  const deleteNode = useFlowStore((s) => s.deleteNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="w-[280px] bg-[#0F0F0F] border-l border-[#212121] flex items-center justify-center">
        <p className="text-zinc-600 text-xs">Select a node to see properties</p>
      </div>
    );
  }

  const nodeData = selectedNode.data as unknown as FlowNodeData;
  const settings = nodeData.settings || {};
  const modelId = settings.modelId as string | undefined;
  const modelDef = modelId ? getModelById(modelId) : null;

  return (
    <div className="w-[280px] bg-[#0F0F0F] border-l border-[#212121] flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-[#212121] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Properties</h2>
        <button
          onClick={() => deleteNode(selectedNode.id)}
          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-[#212121]"
        >
          Delete
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Name</label>
          <input
            type="text"
            className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:border-[#333] focus:outline-none"
            value={nodeData.name}
            onChange={(e) => updateNodeData(selectedNode.id, { name: e.target.value })}
          />
        </div>

        {/* Type & Model */}
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Type</label>
          <span className="text-xs px-2 py-1 rounded bg-[#212121] text-zinc-300">
            {selectedNode.type} ({nodeData.behavior})
          </span>
          {modelDef && (
            <div className="mt-1 text-[10px] text-zinc-500">
              fal.ai: {modelDef.id}
            </div>
          )}
        </div>

        {/* Relight-specific properties */}
        {selectedNode.type === 'relight' && (
          <RelightProperties nodeId={selectedNode.id} settings={settings} />
        )}

        {/* Camera Angles properties */}
        {selectedNode.type === 'cameraAngles' && (
          <CameraAnglesProperties nodeId={selectedNode.id} settings={settings} />
        )}

        {/* Settings from SettingDef */}
        {modelDef && modelDef.settings.length > 0 && (
          <div>
            <label className="text-[11px] text-zinc-500 block mb-2">Settings</label>
            <div className="space-y-3">
              {modelDef.settings.map((def) => (
                <div key={def.key}>
                  <label className="text-[10px] text-zinc-600 block mb-1">{def.label}</label>
                  <SettingControl
                    def={def}
                    value={settings[def.key]}
                    onChange={(val) => updateNodeSetting(selectedNode.id, def.key, val)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fallback settings for non-model nodes (prompt, import, etc.) */}
        {!modelDef && selectedNode.type !== 'relight' && selectedNode.type !== 'cameraAngles' && Object.keys(settings).length > 0 && (
          <div>
            <label className="text-[11px] text-zinc-500 block mb-2">Settings</label>
            <div className="space-y-3">
              {Object.entries(settings).map(([key, value]) => {
                if (key === 'allowedFileTypes' || key === 'modelId') return null;

                if (key === 'systemPrompt' || key === 'promptText') {
                  return (
                    <div key={key}>
                      <label className="text-[10px] text-zinc-600 block mb-1">
                        {key === 'systemPrompt' ? 'System Prompt' : 'Prompt'}
                      </label>
                      <textarea
                        className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none resize-none"
                        rows={4}
                        value={String(value || '')}
                        onChange={(e) => updateNodeSetting(selectedNode.id, key, e.target.value)}
                      />
                    </div>
                  );
                }

                if (typeof value === 'number') {
                  return (
                    <div key={key}>
                      <label className="text-[10px] text-zinc-600 block mb-1">{key}</label>
                      <input
                        type="number"
                        className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
                        value={value}
                        onChange={(e) => updateNodeSetting(selectedNode.id, key, Number(e.target.value))}
                      />
                    </div>
                  );
                }

                if (typeof value === 'string') {
                  return (
                    <div key={key}>
                      <label className="text-[10px] text-zinc-600 block mb-1">{key}</label>
                      <input
                        type="text"
                        className="w-full bg-[#171717] text-zinc-200 text-xs rounded-lg px-3 py-2 border border-[#212121] focus:outline-none"
                        value={value}
                        onChange={(e) => updateNodeSetting(selectedNode.id, key, e.target.value)}
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        )}

        {/* Handles info */}
        {nodeData.handles && (
          <div>
            <label className="text-[11px] text-zinc-500 block mb-2">Connections</label>
            <div className="space-y-1">
              {nodeData.handles.inputs.map((h) => (
                <div key={h.id} className="text-[10px] text-zinc-600 flex gap-1">
                  <span className="text-zinc-500">IN</span>
                  <span>{h.label}</span>
                  <span className="text-zinc-700">({h.type})</span>
                </div>
              ))}
              {nodeData.handles.outputs.map((h) => (
                <div key={h.id} className="text-[10px] text-zinc-600 flex gap-1">
                  <span className="text-zinc-500">OUT</span>
                  <span>{h.label}</span>
                  <span className="text-zinc-700">({h.type})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Run button for dynamic nodes */}
        {nodeData.behavior === 'dynamic' && (
          <div className="pt-2 border-t border-[#212121]">
            <button
              className="w-full text-xs py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors font-medium"
              onClick={() => {
                useFlowStore.getState().runNode(selectedNode.id);
              }}
            >
              ▶ Run Node
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
