import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { EvidenceList } from './EvidenceList';
import { ConvoViewer } from './ConvoViewer';
import { SwarmStatus } from './SwarmStatus';
import { NetworkGraphPanel } from './NetworkGraphPanel';
import { FileText, MessageSquare, Users, Network } from 'lucide-react';

interface InspectorProps {
  projectRoot: string;
  selectedTaskId?: string;
  selectedTaskTitle?: string;
}

export function Inspector({ projectRoot, selectedTaskId, selectedTaskTitle }: InspectorProps) {
  const [activeTab, setActiveTab] = useState('evidence');
  
  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Inspector</h2>
        {selectedTaskId && (
          <span className="text-xs text-muted-foreground font-mono">{selectedTaskId}</span>
        )}
      </div>
      
      <Tabs.Root 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="flex-1 flex flex-col"
      >
        <Tabs.List className="flex border-b border-border px-2">
          <Tabs.Trigger 
            value="evidence"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground
                       data-[state=active]:text-primary 
                       data-[state=active]:border-b-2 
                       data-[state=active]:border-primary"
          >
            <FileText className="w-3.5 h-3.5" />
            Evidence
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="convo"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground
                       data-[state=active]:text-primary 
                       data-[state=active]:border-b-2 
                       data-[state=active]:border-primary"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Convo
          </Tabs.Trigger>
          <Tabs.Trigger
            value="swarm"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground
                       data-[state=active]:text-primary
                       data-[state=active]:border-b-2
                       data-[state=active]:border-primary"
          >
            <Users className="w-3.5 h-3.5" />
            Swarm
          </Tabs.Trigger>
          <Tabs.Trigger
            value="network"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground
                       data-[state=active]:text-primary
                       data-[state=active]:border-b-2
                       data-[state=active]:border-primary"
          >
            <Network className="w-3.5 h-3.5" />
            Network
          </Tabs.Trigger>
        </Tabs.List>
        
        <Tabs.Content value="evidence" className="flex-1 overflow-auto p-4">
          <EvidenceList projectRoot={projectRoot} taskId={selectedTaskId} taskTitle={selectedTaskTitle} />
        </Tabs.Content>
        
        <Tabs.Content value="convo" className="flex-1 overflow-auto p-4">
          <ConvoViewer projectRoot={projectRoot} taskId={selectedTaskId} />
        </Tabs.Content>
        
        <Tabs.Content value="swarm" className="flex-1 overflow-auto p-4">
          <SwarmStatus projectRoot={projectRoot} taskId={selectedTaskId} />
        </Tabs.Content>

        <Tabs.Content value="network" className="flex-1 overflow-hidden">
          <NetworkGraphPanel />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
