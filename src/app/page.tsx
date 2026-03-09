'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { FlowCanvas } from '@/components/FlowCanvas';
import { Sidebar } from '@/components/panels/Sidebar';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
import { Toolbar } from '@/components/panels/Toolbar';

export default function Home() {
  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col bg-zinc-950 text-white overflow-hidden">
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <FlowCanvas />
          <PropertiesPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
