'use client';

import { useFlowStore } from '@/store/flowStore';
import { FlowNodeData } from '@/lib/types';
import { getModelById, type SettingDef } from '@/lib/modelRegistry';

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
        {!modelDef && Object.keys(settings).length > 0 && (
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
